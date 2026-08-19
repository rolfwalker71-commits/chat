/**
 * =============================================================================
 * public/app.js — Frontend der Chat-Anwendung (Vanilla JS)
 * =============================================================================
 *
 * XSS-Schutz im Browser:
 *   Nutzernamen und Nachrichten werden ausschließlich über `textContent`
 *   ins DOM geschrieben — niemals über innerHTML. So können Tags aus der
 *   Datenbank nicht als HTML/JavaScript ausgeführt werden.
 *
 * Auth:
 *   Session-Cookie ist httpOnly (vom Server gesetzt). fetch() und Socket.io
 *   senden es automatisch mit credentials: "same-origin" / withCredentials.
 * =============================================================================
 */

(() => {
  "use strict";

  const MAX_MESSAGE_LENGTH = 1000;
  const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

  // ---------------------------------------------------------------------------
  // DOM-Referenzen
  // ---------------------------------------------------------------------------
  const viewAuth = document.getElementById("view-auth");
  const viewChat = document.getElementById("view-chat");
  const formAuth = document.getElementById("form-auth");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const wrapPasswordConfirm = document.getElementById("wrap-password-confirm");
  const inputUsername = document.getElementById("username");
  const inputPassword = document.getElementById("password");
  const inputPasswordConfirm = document.getElementById("password-confirm");
  const authError = document.getElementById("auth-error");
  const authSubmit = document.getElementById("auth-submit");
  const labelUsername = document.getElementById("label-username");
  const formMessage = document.getElementById("form-message");
  const messageInput = document.getElementById("message-input");
  const messageList = document.getElementById("message-list");
  const chatError = document.getElementById("chat-error");
  const btnSend = document.getElementById("btn-send");
  const btnLogout = document.getElementById("btn-logout");
  const btnOnline = document.getElementById("btn-online");
  const btnOnlineClose = document.getElementById("btn-online-close");
  const onlineOverlay = document.getElementById("online-overlay");
  const onlineBackdrop = document.getElementById("online-backdrop");
  const userListDesktop = document.getElementById("user-list-desktop");
  const userListMobile = document.getElementById("user-list-mobile");
  const onlineCountDesktop = document.getElementById("online-count-desktop");
  const onlineCountMobile = document.getElementById("online-count-mobile");

  /** @type {"login" | "register"} */
  let authMode = "login";
  /** @type {{ id: number, username: string } | null} */
  let currentUser = null;
  /** @type {import("socket.io-client").Socket | null} */
  let socket = null;
  /** Verhindert doppeltes Rendern derselben Nachricht (Reconnect). */
  const seenMessageIds = new Set();

  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ---------------------------------------------------------------------------
  // DOM-Helfer — nie innerHTML mit Serverdaten
  // ---------------------------------------------------------------------------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showError(node, message) {
    if (!message) {
      node.classList.add("hidden");
      node.textContent = "";
      return;
    }
    node.textContent = message;
    node.classList.remove("hidden");
  }

  function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === "register";

    tabLogin.setAttribute("aria-selected", String(!isRegister));
    tabRegister.setAttribute("aria-selected", String(isRegister));

    tabLogin.className = pillClass(!isRegister);
    tabRegister.className = pillClass(isRegister);

    wrapPasswordConfirm.classList.toggle("hidden", !isRegister);
    wrapPasswordConfirm.classList.toggle("flex", isRegister);
    inputPasswordConfirm.required = isRegister;
    inputPassword.autocomplete = isRegister ? "new-password" : "current-password";
    authSubmit.textContent = isRegister ? "Konto anlegen" : "Anmelden";
    showError(authError, "");
  }

  function pillClass(active) {
    const base =
      "h-full min-h-0 max-h-full flex-1 rounded-full px-3 text-sm font-medium leading-none";
    return active
      ? `${base} text-foreground shadow-sm shadow-black/40 bg-background`
      : `${base} text-muted-foreground`;
  }

  function showAuth() {
    viewAuth.classList.remove("hidden");
    viewChat.classList.add("hidden");
    viewChat.classList.remove("flex");
    inputUsername.focus();
  }

  function showChat() {
    viewAuth.classList.add("hidden");
    viewChat.classList.remove("hidden");
    viewChat.classList.add("flex");
    labelUsername.textContent = currentUser.username;
    messageInput.focus();
  }

  // ---------------------------------------------------------------------------
  // REST-Aufrufe (Cookie wird automatisch mitgeschickt)
  // ---------------------------------------------------------------------------
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || "Anfrage fehlgeschlagen.");
    }
    return data;
  }

  async function restoreSession() {
    try {
      currentUser = await api("/api/me");
      showChat();
      connectSocket();
    } catch {
      currentUser = null;
      showAuth();
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    showError(authError, "");

    const username = inputUsername.value.trim();
    const password = inputPassword.value;

    if (!USERNAME_PATTERN.test(username)) {
      showError(
        authError,
        "Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen und Unterstrich."
      );
      return;
    }
    if (password.length < 8) {
      showError(authError, "Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (authMode === "register" && password !== inputPasswordConfirm.value) {
      showError(authError, "Die Passwörter stimmen nicht überein.");
      return;
    }

    authSubmit.disabled = true;
    authSubmit.textContent = authMode === "register" ? "Konto wird angelegt…" : "Anmeldung…";

    try {
      const path = authMode === "register" ? "/api/register" : "/api/login";
      currentUser = await api(path, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      formAuth.reset();
      showChat();
      connectSocket();
    } catch (err) {
      showError(authError, err.message);
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = authMode === "register" ? "Konto anlegen" : "Anmelden";
    }
  }

  async function handleLogout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Cookie serverseitig löschen ist Best-Effort — UI trotzdem zurücksetzen.
    }
    teardownSocket();
    currentUser = null;
    seenMessageIds.clear();
    messageList.replaceChildren();
    showAuth();
  }

  // ---------------------------------------------------------------------------
  // Nachrichten-UI
  // ---------------------------------------------------------------------------
  function formatTime(iso) {
    try {
      return timeFormatter.format(new Date(iso));
    } catch {
      return "";
    }
  }

  function appendMessage(message, { scroll = true } = {}) {
    if (message.id != null) {
      if (seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
    }

    const mine = currentUser && message.username === currentUser.username;
    const row = el("article", `flex ${mine ? "justify-end" : "justify-start"}`);
    row.setAttribute("data-message-id", String(message.id ?? ""));

    const bubble = el(
      "div",
      `max-w-[min(36rem,85%)] rounded-2xl px-4 py-3 leading-snug ${
        mine
          ? "bg-amber-500/15 text-foreground ring-1 ring-amber-500/20"
          : "bg-zinc-900 text-foreground ring-1 ring-border"
      }`
    );

    const meta = el("div", "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5");
    meta.append(
      el(
        "span",
        `text-sm font-semibold ${mine ? "text-amber-400" : "text-zinc-200"}`,
        message.username
      ),
      el("time", "text-xs text-muted-foreground", formatTime(message.createdAt))
    );

    const body = el("p", "break-words whitespace-pre-wrap text-sm sm:text-base", message.content);

    bubble.append(meta, body);
    row.append(bubble);
    messageList.append(row);

    if (scroll) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  function renderHistory(messages) {
    messageList.replaceChildren();
    seenMessageIds.clear();

    if (!messages.length) {
      const empty = el(
        "p",
        "mx-auto mt-12 max-w-sm text-center text-sm leading-relaxed text-muted-foreground",
        "Noch keine Nachrichten. Schreib die erste!"
      );
      messageList.append(empty);
      return;
    }

    for (const message of messages) {
      appendMessage(message, { scroll: false });
    }
    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderOnlineUsers(users) {
    const count = users.length;
    onlineCountDesktop.textContent = `(${count})`;
    onlineCountMobile.textContent = `${count} online`;

    function fill(list) {
      list.replaceChildren();
      for (const user of users) {
        const item = el("li", "flex min-h-11 items-center gap-2 rounded-xl px-2 py-1");
        const dot = el("span", "h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400");
        dot.setAttribute("aria-hidden", "true");
        const name = el("span", "break-words text-sm text-foreground", user.username);
        if (currentUser && user.username === currentUser.username) {
          const you = el("span", "text-xs text-muted-foreground", "(du)");
          item.append(dot, name, you);
        } else {
          item.append(dot, name);
        }
        list.append(item);
      }
    }

    fill(userListDesktop);
    fill(userListMobile);
  }

  function setOnlinePanel(open) {
    onlineOverlay.classList.toggle("hidden", !open);
    onlineOverlay.hidden = !open;
    btnOnline.setAttribute("aria-expanded", String(open));
    if (open) btnOnlineClose.focus();
  }

  // ---------------------------------------------------------------------------
  // Socket.io
  // ---------------------------------------------------------------------------
  function teardownSocket() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  }

  function connectSocket() {
    teardownSocket();

    socket = io({
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("connect_error", () => {
      showError(chatError, "Verbindung fehlgeschlagen. Bitte neu anmelden.");
    });

    socket.on("messages:history", (messages) => {
      renderHistory(Array.isArray(messages) ? messages : []);
      showError(chatError, "");
    });

    socket.on("message:new", (message) => {
      const emptyHint = messageList.querySelector("p");
      if (emptyHint && !messageList.querySelector("article")) {
        emptyHint.remove();
      }
      appendMessage(message);
    });

    socket.on("users:online", (users) => {
      renderOnlineUsers(Array.isArray(users) ? users : []);
    });

    socket.on("chat:error", (message) => {
      showError(chatError, message);
    });
  }

  async function handleSend(event) {
    event.preventDefault();
    showError(chatError, "");

    const content = messageInput.value.trim();
    if (!content || !socket) return;
    if (content.length > MAX_MESSAGE_LENGTH) {
      showError(chatError, `Maximal ${MAX_MESSAGE_LENGTH} Zeichen.`);
      return;
    }

    btnSend.disabled = true;
    socket.emit("message:send", { content }, (ack) => {
      btnSend.disabled = false;
      if (!ack?.ok) {
        showError(chatError, ack?.error || "Senden fehlgeschlagen.");
        return;
      }
      messageInput.value = "";
      messageInput.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));
  formAuth.addEventListener("submit", handleAuthSubmit);
  formMessage.addEventListener("submit", handleSend);
  btnLogout.addEventListener("click", handleLogout);
  btnOnline.addEventListener("click", () => setOnlinePanel(true));
  btnOnlineClose.addEventListener("click", () => setOnlinePanel(false));
  onlineBackdrop.addEventListener("click", () => setOnlinePanel(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !onlineOverlay.hidden) {
      setOnlinePanel(false);
    }
  });

  setAuthMode("login");
  restoreSession();
})();
