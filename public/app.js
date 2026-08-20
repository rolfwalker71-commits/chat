/**
 * =============================================================================
 * public/app.js — Frontend der Chat-Anwendung (Vanilla JS)
 * =============================================================================
 *
 * XSS-Schutz im Browser:
 *   Nutzernamen, Klartext und Koordinaten werden ausschließlich über
 *   `textContent` ins DOM geschrieben — niemals über innerHTML.
 *   Bilder/Audio kommen nur von /api/files/<uuid> oder geprüften http(s)-URLs.
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
  const MAX_VOICE_MS = 60_000;
  const FILE_UUID = /^[0-9a-f-]{36}$/i;
  const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];
  const UI_STORAGE_KEY = "raum-ui";
  const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
  const BUBBLE_DEFAULTS = {
    light: { own: "#fde68a", peer: "#ffffff" },
    dark: { own: "#92400e", peer: "#27272a" },
  };

  const viewAuth = document.getElementById("view-auth");
  const viewChat = document.getElementById("view-chat");
  const formAuth = document.getElementById("form-auth");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const tabAdmin = document.getElementById("tab-admin");
  const wrapPasswordConfirm = document.getElementById("wrap-password-confirm");
  const inputUsername = document.getElementById("username");
  const inputPassword = document.getElementById("password");
  const inputPasswordConfirm = document.getElementById("password-confirm");
  const authError = document.getElementById("auth-error");
  const authSubmit = document.getElementById("auth-submit");
  const labelUsername = document.getElementById("label-username");
  const headerAvatar = document.getElementById("header-avatar");
  const roomTitle = document.getElementById("room-title");
  const formMessage = document.getElementById("form-message");
  const messageInput = document.getElementById("message-input");
  const messageList = document.getElementById("message-list");
  const chatError = document.getElementById("chat-error");
  const btnSend = document.getElementById("btn-send");
  const btnLogout = document.getElementById("btn-logout");
  const btnAdmin = document.getElementById("btn-admin");
  const adminPendingBadge = document.getElementById("admin-pending-badge");
  const viewAdmin = document.getElementById("view-admin");
  const btnAdminChat = document.getElementById("btn-admin-chat");
  const btnAdminLogout = document.getElementById("btn-admin-logout");
  const adminError = document.getElementById("admin-error");
  const tabAdminPending = document.getElementById("tab-admin-pending");
  const tabAdminAll = document.getElementById("tab-admin-all");
  const adminUserList = document.getElementById("admin-user-list");
  const pendingBanner = document.getElementById("pending-banner");
  const paneList = document.getElementById("pane-list");
  const paneThread = document.getElementById("pane-thread");
  const threadEmpty = document.getElementById("thread-empty");
  const threadActive = document.getElementById("thread-active");
  const threadAvatar = document.getElementById("thread-avatar");
  const btnBack = document.getElementById("btn-back");
  const convList = document.getElementById("conv-list");
  const userList = document.getElementById("user-list");
  const onlineCount = document.getElementById("online-count");
  const userSearch = document.getElementById("user-search");
  const userSearchResults = document.getElementById("user-search-results");
  const searchPicked = document.getElementById("search-picked");
  const formUserSearch = document.getElementById("form-user-search");
  const btnStartChat = document.getElementById("btn-start-chat");
  const btnNewChat = document.getElementById("btn-new-chat");
  const btnNewChatClose = document.getElementById("btn-new-chat-close");
  const newChatOverlay = document.getElementById("new-chat-overlay");
  const newChatBackdrop = document.getElementById("new-chat-backdrop");
  const btnMore = document.getElementById("btn-more");
  const btnMoreClose = document.getElementById("btn-more-close");
  const moreOverlay = document.getElementById("more-overlay");
  const moreBackdrop = document.getElementById("more-backdrop");
  const navMore = document.getElementById("nav-more");
  const navChats = document.getElementById("nav-chats");
  const navContacts = document.getElementById("nav-contacts");
  const tabListChats = document.getElementById("tab-list-chats");
  const tabListContacts = document.getElementById("tab-list-contacts");
  const screenChats = document.getElementById("screen-chats");
  const screenContacts = document.getElementById("screen-contacts");
  const btnProfile = document.getElementById("btn-profile");
  const btnProfileClose = document.getElementById("btn-profile-close");
  const profileOverlay = document.getElementById("profile-overlay");
  const profileBackdrop = document.getElementById("profile-backdrop");
  const formProfile = document.getElementById("form-profile");
  const profileRealname = document.getElementById("profile-realname");
  const profileAvatarUrl = document.getElementById("profile-avatar-url");
  const profileAvatarFile = document.getElementById("profile-avatar-file");
  const profileAvatarPreview = document.getElementById("profile-avatar-preview");
  const profileError = document.getElementById("profile-error");
  const profileOk = document.getElementById("profile-ok");
  const profileSubmit = document.getElementById("profile-submit");
  const btnAttach = document.getElementById("btn-attach");
  const attachTray = document.getElementById("attach-tray");
  const btnAttachImage = document.getElementById("btn-attach-image");
  const btnAttachLocation = document.getElementById("btn-attach-location");
  const btnAttachVoice = document.getElementById("btn-attach-voice");
  const inputImage = document.getElementById("input-image");
  const recordBar = document.getElementById("record-bar");
  const recordTimer = document.getElementById("record-timer");
  const btnRecordCancel = document.getElementById("btn-record-cancel");
  const btnRecordSend = document.getElementById("btn-record-send");
  const typingIndicator = document.getElementById("typing-indicator");
  const replyBar = document.getElementById("reply-bar");
  const replyAuthor = document.getElementById("reply-author");
  const replyPreview = document.getElementById("reply-preview");
  const btnReplyCancel = document.getElementById("btn-reply-cancel");
  const aiSuggestions = document.getElementById("ai-suggestions");
  const btnSearch = document.getElementById("btn-search");
  const btnSearchClose = document.getElementById("btn-search-close");
  const searchOverlay = document.getElementById("search-overlay");
  const searchBackdrop = document.getElementById("search-backdrop");
  const formSearch = document.getElementById("form-search");
  const searchQuery = document.getElementById("search-query");
  const searchCurrentOnly = document.getElementById("search-current-only");
  const searchError = document.getElementById("search-error");
  const searchResults = document.getElementById("search-results");
  const btnChatMenu = document.getElementById("btn-chat-menu");
  const btnChatMenuClose = document.getElementById("btn-chat-menu-close");
  const chatMenuOverlay = document.getElementById("chat-menu-overlay");
  const chatMenuBackdrop = document.getElementById("chat-menu-backdrop");
  const btnMarkUnread = document.getElementById("btn-mark-unread");
  const aiHint = document.getElementById("ai-hint");
  const roomStatus = document.getElementById("room-status");
  const btnAttachFile = document.getElementById("btn-attach-file");
  const inputFile = document.getElementById("input-file");
  const btnSummarize = document.getElementById("btn-summarize");
  const btnNotify = document.getElementById("btn-notify");
  const btnNotifyMore = document.getElementById("btn-notify-more");
  const groupTools = document.getElementById("group-tools");
  const groupTitle = document.getElementById("group-title");
  const btnGroupTitle = document.getElementById("btn-group-title");
  const groupAddUser = document.getElementById("group-add-user");
  const btnGroupAdd = document.getElementById("btn-group-add");
  const btnGroupLeave = document.getElementById("btn-group-leave");
  const summaryBox = document.getElementById("summary-box");
  const forwardOverlay = document.getElementById("forward-overlay");
  const messageMenuOverlay = document.getElementById("message-menu-overlay");
  const messageMenuBackdrop = document.getElementById("message-menu-backdrop");
  const messageMenu = document.getElementById("message-menu");
  const messageMenuHandle = document.getElementById("message-menu-handle");
  const messageMenuReactions = document.getElementById("message-menu-reactions");
  const messageMenuActions = document.getElementById("message-menu-actions");
  const forwardBackdrop = document.getElementById("forward-backdrop");
  const btnForwardClose = document.getElementById("btn-forward-close");
  const forwardTargets = document.getElementById("forward-targets");
  const bubbleOwnInput = document.getElementById("bubble-own");
  const bubblePeerInput = document.getElementById("bubble-peer");
  const btnBubbleReset = document.getElementById("btn-bubble-reset");
  const themeColorMeta = document.getElementById("theme-color-meta");
  const colorSchemeMeta = document.getElementById("color-scheme-meta");

  /** @type {"login" | "register" | "admin"} */
  let authMode = "login";
  /** @type {{ id: number, username: string, realName?: string, avatarUrl?: string, isAdmin?: boolean, isApproved?: boolean, pendingUsers?: number } | null} */
  let currentUser = null;
  /** @type {import("socket.io-client").Socket | null} */
  let socket = null;
  /** null = globaler Raum */
  let activeConversationId = null;
  let chatSelected = false;
  /** @type {"chats" | "contacts"} */
  let listTab = "chats";
  /** @type {Array} */
  let conversations = [];
  /** @type {Map<string, {id:number, username:string, realName?:string}>} */
  const pickedUsers = new Map();
  const seenMessageIds = new Set();
  const messagesById = new Map();
  let searchTimer = 0;
  let msgSearchTimer = 0;
  let typingTimer = 0;
  let typingSent = false;
  /** @type {{ id: number, username?: string, realName?: string, content?: string, type?: string } | null} */
  let replyTarget = null;
  let globalUnread = 0;
  /** @type {{ enabled?: boolean } | null} */
  let aiStatus = null;
  /** @type {HTMLElement | null} */
  let reactionPicker = null;
  let ignoreMenuClickUntil = 0;
  let editingId = null;
  let forwardMessageId = null;
  let voiceTranscript = "";
  const onlineIds = new Set();
  let notifyPermission = typeof Notification !== "undefined" ? Notification.permission : "denied";
  let pushSubscribed = false;
  /** @type {Array} */
  let adminUsers = [];
  /** @type {"pending" | "all"} */
  let adminFilter = "pending";
  const systemDarkMq = window.matchMedia("(prefers-color-scheme: dark)");
  let uiPrefs = { theme: "auto", bubbleOwn: null, bubblePeer: null };
  let uiSaveTimer = 0;

  let mediaRecorder = null;
  let recordChunks = [];
  let recordStream = null;
  let recordStartedAt = 0;
  let recordInterval = null;
  let recordStopTimer = null;
  let recordMime = "";

  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const coordFormatter = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 5,
  });

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

  function displayName(user) {
    const real = (user?.realName || "").trim();
    return real || user?.username || "";
  }

  function getInitials(user) {
    const name = displayName(user);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "?";
  }

  function safeAvatarSrc(url) {
    if (!url || typeof url !== "string") return null;
    if (/^\/api\/files\/[0-9a-f-]{36}$/i.test(url)) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch {
      return null;
    }
    return null;
  }

  function fillAvatar(container, user, sizeClass) {
    container.replaceChildren();
    container.className = `${sizeClass} shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border`;
    const src = safeAvatarSrc(user?.avatarUrl);
    const initials = el(
      "span",
      "flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-primary",
      getInitials(user)
    );
    if (!src) {
      container.append(initials);
      return;
    }
    const img = document.createElement("img");
    img.alt = "";
    img.className = "h-full w-full object-cover";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    img.addEventListener("error", () => {
      img.remove();
      container.append(initials);
    });
    container.append(img);
  }

  function normalizeUi(raw) {
    const theme = raw && ["auto", "light", "dark"].includes(raw.theme) ? raw.theme : "auto";
    const bubbleOwn = raw && HEX_COLOR.test(String(raw.bubbleOwn || "").trim())
      ? String(raw.bubbleOwn).trim().toLowerCase()
      : null;
    const bubblePeer = raw && HEX_COLOR.test(String(raw.bubblePeer || "").trim())
      ? String(raw.bubblePeer).trim().toLowerCase()
      : null;
    return { theme, bubbleOwn, bubblePeer };
  }

  function loadUiPrefs() {
    try {
      return normalizeUi(JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}"));
    } catch {
      return normalizeUi(null);
    }
  }

  function saveUiPrefsLocal() {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiPrefs));
    } catch {
      // Quota / privater Modus — Darstellung bleibt nur in dieser Sitzung.
    }
  }

  function hexToRgbChannels(hex) {
    if (!HEX_COLOR.test(hex || "")) return null;
    const n = Number.parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }

  function contrastFg(hex) {
    const rgb = hexToRgbChannels(hex);
    if (!rgb) return "24 24 27";
    const [r, g, b] = rgb.split(" ").map(Number);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return l > 0.55 ? "24 24 27" : "250 250 250";
  }

  function resolvedDark() {
    return uiPrefs.theme === "dark" || (uiPrefs.theme !== "light" && systemDarkMq.matches);
  }

  function setBubbleVar(name, hex) {
    const root = document.documentElement.style;
    if (!hex) {
      root.removeProperty(`--bubble-${name}`);
      root.removeProperty(`--bubble-${name}-fg`);
      return;
    }
    const rgb = hexToRgbChannels(hex);
    if (!rgb) return;
    root.setProperty(`--bubble-${name}`, rgb);
    root.setProperty(`--bubble-${name}-fg`, contrastFg(hex));
  }

  function refreshThemePills() {
    document.querySelectorAll(".theme-pill").forEach((btn) => {
      const active = btn.getAttribute("data-theme") === uiPrefs.theme;
      btn.className = `${pillClass(active)} theme-pill`;
      btn.setAttribute("aria-checked", String(active));
      btn.setAttribute("role", "radio");
    });
  }

  function syncBubblePickers() {
    const dark = document.documentElement.classList.contains("dark");
    const defaults = dark ? BUBBLE_DEFAULTS.dark : BUBBLE_DEFAULTS.light;
    if (bubbleOwnInput) bubbleOwnInput.value = uiPrefs.bubbleOwn || defaults.own;
    if (bubblePeerInput) bubblePeerInput.value = uiPrefs.bubblePeer || defaults.peer;
  }

  function applyUi() {
    const dark = resolvedDark();
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = uiPrefs.theme;
    if (themeColorMeta) {
      const hex = getComputedStyle(document.documentElement).getPropertyValue("--theme-hex").trim();
      themeColorMeta.setAttribute("content", hex || (dark ? "#09090b" : "#fafafa"));
    }
    if (colorSchemeMeta) {
      colorSchemeMeta.setAttribute("content", uiPrefs.theme === "auto" ? "dark light" : uiPrefs.theme);
    }
    setBubbleVar("own", uiPrefs.bubbleOwn);
    setBubbleVar("peer", uiPrefs.bubblePeer);
    refreshThemePills();
    syncBubblePickers();
  }

  function scheduleUiPersist() {
    saveUiPrefsLocal();
    applyUi();
    if (!currentUser) return;
    window.clearTimeout(uiSaveTimer);
    uiSaveTimer = window.setTimeout(() => {
      persistUiToServer().catch(() => {});
    }, 400);
  }

  async function persistUiToServer() {
    if (!currentUser) return;
    const user = await api("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        theme: uiPrefs.theme,
        bubbleOwn: uiPrefs.bubbleOwn || "",
        bubblePeer: uiPrefs.bubblePeer || "",
      }),
    });
    currentUser = { ...currentUser, ...user };
  }

  function applyUserUi(user) {
    const server = normalizeUi(user?.ui);
    const localCustom = uiPrefs.theme !== "auto" || uiPrefs.bubbleOwn || uiPrefs.bubblePeer;
    const serverEmpty = server.theme === "auto" && !server.bubbleOwn && !server.bubblePeer;
    if (serverEmpty && localCustom) {
      scheduleUiPersist();
      return;
    }
    uiPrefs = server;
    saveUiPrefsLocal();
    applyUi();
  }

  function setThemePreference(theme) {
    if (!["auto", "light", "dark"].includes(theme)) return;
    uiPrefs.theme = theme;
    scheduleUiPersist();
  }

  uiPrefs = loadUiPrefs();
  applyUi();
  const onSystemThemeChange = () => {
    if (uiPrefs.theme === "auto") applyUi();
  };
  if (systemDarkMq.addEventListener) systemDarkMq.addEventListener("change", onSystemThemeChange);
  else systemDarkMq.addListener(onSystemThemeChange);

  function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === "register";
    const isAdminLogin = mode === "admin";

    tabLogin.setAttribute("aria-selected", String(mode === "login"));
    tabRegister.setAttribute("aria-selected", String(isRegister));
    tabAdmin.setAttribute("aria-selected", String(isAdminLogin));

    tabLogin.className = pillClass(mode === "login");
    tabRegister.className = pillClass(isRegister);
    tabAdmin.className = pillClass(isAdminLogin);

    wrapPasswordConfirm.classList.toggle("hidden", !isRegister);
    wrapPasswordConfirm.classList.toggle("flex", isRegister);
    inputPasswordConfirm.required = isRegister;
    inputPassword.autocomplete = isRegister ? "new-password" : "current-password";
    authSubmit.textContent = isRegister
      ? "Konto anlegen"
      : isAdminLogin
        ? "Als Admin anmelden"
        : "Anmelden";
    showError(authError, "");
  }

  function pillClass(active) {
    const base =
      "inline-flex h-full min-h-0 max-h-full flex-1 items-center justify-center rounded-full px-2 text-xs font-medium leading-none sm:px-3 sm:text-sm";
    return active
      ? `${base} text-foreground shadow-sm bg-background`
      : `${base} text-muted-foreground`;
  }

  function isWideLayout() {
    return window.matchMedia("(min-width: 1024px)").matches;
  }

  function setListTab(tab) {
    listTab = tab === "contacts" ? "contacts" : "chats";
    const chats = listTab === "chats";
    screenChats.classList.toggle("hidden", !chats);
    screenChats.classList.toggle("flex", chats);
    screenContacts.classList.toggle("hidden", chats);
    screenContacts.classList.toggle("flex", !chats);
    tabListChats.setAttribute("aria-selected", String(chats));
    tabListContacts.setAttribute("aria-selected", String(!chats));
    tabListChats.className = pillClass(chats);
    tabListContacts.className = pillClass(!chats);
    const navOn =
      "flex h-auto min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-foreground";
    const navOff =
      "flex h-auto min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-muted-foreground";
    navChats.className = chats ? navOn : navOff;
    navContacts.className = chats ? navOff : navOn;
    navChats.setAttribute("aria-current", chats ? "page" : "false");
    navContacts.setAttribute("aria-current", chats ? "false" : "page");
  }

  function updatePanes() {
    const wide = isWideLayout();
    const open = chatSelected;
    paneList.classList.toggle("hidden", open && !wide);
    paneList.classList.toggle("flex", !(open && !wide));
    paneThread.classList.toggle("hidden", !open && !wide);
    paneThread.classList.toggle("flex", open || wide);
    threadEmpty.classList.toggle("hidden", open);
    threadEmpty.classList.toggle("lg:flex", !open);
    threadEmpty.classList.toggle("flex", !open && wide);
    threadActive.classList.toggle("hidden", !open);
    threadActive.classList.toggle("flex", open);
  }

  function closeThread(fromPop = false) {
    emitTyping(false);
    chatSelected = false;
    hideReactionPicker();
    hideMessageMenu();
    setAttachTray(false);
    if (socket) socket.emit("conversation:idle");
    updatePanes();
    renderConversationLists();
    if (!fromPop && !isWideLayout() && history.state?.view === "thread") {
      history.back();
    }
  }

  function showAuth() {
    viewAdmin.classList.add("hidden");
    viewAdmin.classList.remove("flex");
    viewAuth.classList.remove("hidden");
    viewChat.classList.add("hidden");
    viewChat.classList.remove("flex");
    inputUsername.focus();
  }

  function showChat() {
    viewAuth.classList.add("hidden");
    viewAdmin.classList.add("hidden");
    viewAdmin.classList.remove("flex");
    viewChat.classList.remove("hidden");
    viewChat.classList.add("flex");
    refreshSelfUi();
    updatePanes();
    if (chatSelected && canPost()) messageInput.focus();
  }

  function showAdmin() {
    viewAuth.classList.add("hidden");
    viewChat.classList.add("hidden");
    viewChat.classList.remove("flex");
    viewAdmin.classList.remove("hidden");
    viewAdmin.classList.add("flex");
    setMorePanel(false);
    showError(adminError, "");
    loadAdminUsers();
  }

  function canPost() {
    return Boolean(currentUser && (currentUser.isApproved || currentUser.isAdmin));
  }

  function setComposerLocked(locked) {
    formMessage.classList.toggle("hidden", locked);
    pendingBanner.classList.toggle("hidden", !locked);
    formUserSearch.classList.toggle("pointer-events-none", locked);
    formUserSearch.classList.toggle("opacity-50", locked);
    if (locked) setAttachTray(false);
  }

  function setAttachTray(open) {
    attachTray.classList.toggle("hidden", !open);
    attachTray.hidden = !open;
    btnAttach.setAttribute("aria-expanded", String(open));
    btnAttach.setAttribute("aria-label", open ? "Anhang schließen" : "Anhang hinzufügen");
  }

  function setAdminPendingBadge(count) {
    const n = Number(count) || 0;
    if (currentUser) currentUser.pendingUsers = n;
    if (n > 0) {
      adminPendingBadge.textContent = n > 99 ? "99+" : String(n);
      adminPendingBadge.classList.remove("hidden");
    } else {
      adminPendingBadge.textContent = "";
      adminPendingBadge.classList.add("hidden");
    }
  }

  function refreshSelfUi() {
    if (!currentUser) return;
    labelUsername.textContent = displayName(currentUser);
    fillAvatar(headerAvatar, currentUser, "inline-flex h-8 w-8");
    fillAvatar(profileAvatarPreview, currentUser, "h-16 w-16");
    const isAdmin = Boolean(currentUser.isAdmin);
    btnAdmin.classList.toggle("hidden", !isAdmin);
    btnAdmin.classList.toggle("flex", isAdmin);
    if (isAdmin) setAdminPendingBadge(currentUser.pendingUsers);
    setComposerLocked(!canPost());
  }

  function sameRoom(conversationId) {
    if (!chatSelected) return false;
    if (conversationId == null && activeConversationId == null) return true;
    return Number(conversationId) === Number(activeConversationId);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers,
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
      aiStatus = currentUser.ai || null;
      setGlobalUnread(currentUser.globalUnread || 0);
      applyUserUi(currentUser);
      showChat();
      await loadConversations();
      connectSocket();
      enablePush({ request: true }).catch(() => {});
      const deepLink = conversationFromUrl();
      if (deepLink !== undefined) await openConversation(deepLink);
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
    authSubmit.textContent =
      authMode === "register" ? "Konto wird angelegt…" : authMode === "admin" ? "Admin-Anmeldung…" : "Anmeldung…";

    try {
      const path = authMode === "register" ? "/api/register" : "/api/login";
      const body = { username, password };
      if (authMode === "admin") body.admin = true;
      currentUser = await api(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const me = await api("/api/me");
      currentUser = { ...currentUser, ...me };
      aiStatus = me.ai || null;
      setGlobalUnread(me.globalUnread || 0);
      applyUserUi(currentUser);
      formAuth.reset();
      await loadConversations();
      connectSocket();
      enablePush({ request: true }).catch(() => {});
      if (authMode === "admin") showAdmin();
      else showChat();
    } catch (err) {
      showError(authError, err.message);
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent =
        authMode === "register" ? "Konto anlegen" : authMode === "admin" ? "Als Admin anmelden" : "Anmelden";
    }
  }

  async function handleLogout() {
    stopRecording(false);
    await disablePush();
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Cookie serverseitig löschen ist Best-Effort — UI trotzdem zurücksetzen.
    }
    teardownSocket();
    currentUser = null;
    conversations = [];
    pickedUsers.clear();
    seenMessageIds.clear();
    messagesById.clear();
    activeConversationId = null;
    chatSelected = false;
    replyTarget = null;
    globalUnread = 0;
    aiStatus = null;
    hideReactionPicker();
    hideMessageMenu();
    setAttachTray(false);
    setReplyTarget(null);
    messageList.replaceChildren();
    setNewChatPanel(false);
    setMorePanel(false);
    setProfilePanel(false);
    setSearchPanel(false);
    setChatMenu(false);
    setForwardPanel(false);
    pushSubscribed = false;
    refreshNotifyButtons();
    adminUsers = [];
    adminFilter = "pending";
    setAdminFilter("pending");
    showAuth();
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      return timeFormatter.format(new Date(iso));
    } catch {
      return "";
    }
  }

  function formatListTime(iso) {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      const now = new Date();
      const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
      if (sameDay) {
        return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
      }
      return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
    } catch {
      return "";
    }
  }

  function setAdminFilter(mode) {
    adminFilter = mode;
    tabAdminPending.setAttribute("aria-selected", String(mode === "pending"));
    tabAdminAll.setAttribute("aria-selected", String(mode === "all"));
    tabAdminPending.className = pillClass(mode === "pending");
    tabAdminAll.className = pillClass(mode === "all");
    renderAdminUsers();
  }

  function adminStatusLabel(user) {
    if (user.isAdmin) return "Admin";
    if (user.isApproved) return "Freigegeben";
    return "Ausstehend";
  }

  function renderAdminUsers() {
    adminUserList.replaceChildren();
    const rows =
      adminFilter === "pending"
        ? adminUsers.filter((user) => !user.isApproved)
        : adminUsers;

    if (!rows.length) {
      adminUserList.append(
        el(
          "li",
          "rounded-2xl bg-card px-4 py-6 text-center text-sm leading-relaxed text-muted-foreground ring-1 ring-border",
          adminFilter === "pending" ? "Keine ausstehenden Konten." : "Noch keine Benutzer."
        )
      );
      return;
    }

    for (const user of rows) {
      const item = el(
        "li",
        "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center"
      );
      const avatar = el("div", "");
      fillAvatar(avatar, user, "h-12 w-12");
      const text = el("div", "min-w-0 flex-1");
      text.append(el("p", "break-words text-base font-semibold leading-snug", displayName(user)));
      text.append(el("p", "text-sm text-muted-foreground", `@${user.username}`));
      if (user.createdAt) {
        text.append(el("p", "mt-1 text-xs text-muted-foreground", `Registriert ${formatTime(user.createdAt)}`));
      }
      const badgeClass = user.isAdmin
        ? "bg-primary/15 text-primary"
        : user.isApproved
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-muted text-muted-foreground";
      const badge = el(
        "span",
        `inline-flex h-11 min-h-11 items-center rounded-full px-3 text-xs font-medium ${badgeClass}`,
        adminStatusLabel(user)
      );
      const actions = el("div", "flex flex-wrap gap-2");
      actions.append(badge);
      if (!user.isApproved) {
        const approve = el(
          "button",
          "inline-flex h-11 min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-110",
          "Freigeben"
        );
        approve.type = "button";
        approve.addEventListener("click", () => moderateUser(user.id, "approve"));
        actions.append(approve);
      } else if (!user.isAdmin && currentUser && user.id !== currentUser.id) {
        const revoke = el(
          "button",
          "inline-flex h-11 min-h-11 items-center rounded-xl px-3 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100 dark:text-red-200 dark:ring-red-900 dark:hover:bg-red-950/60",
          "Sperren"
        );
        revoke.type = "button";
        revoke.addEventListener("click", () => moderateUser(user.id, "revoke"));
        actions.append(revoke);
      }
      item.append(avatar, text, actions);
      adminUserList.append(item);
    }
  }

  async function loadAdminUsers() {
    if (!currentUser?.isAdmin) return;
    showError(adminError, "");
    try {
      const data = await api("/api/admin/users");
      adminUsers = data.users || [];
      setAdminPendingBadge(data.pendingUsers);
      renderAdminUsers();
    } catch (err) {
      showError(adminError, err.message);
    }
  }

  async function moderateUser(userId, action) {
    showError(adminError, "");
    try {
      const data = await api(`/api/admin/users/${userId}/${action}`, { method: "POST" });
      const updated = data.user;
      if (updated) {
        adminUsers = adminUsers.map((user) => (user.id === updated.id ? { ...user, ...updated } : user));
      }
      setAdminPendingBadge(data.pendingUsers);
      renderAdminUsers();
    } catch (err) {
      showError(adminError, err.message);
    }
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function osmUrl(lat, lng) {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  }

  function previewText(message) {
    if (!message) return "";
    if (message.deleted) return "Nachricht gelöscht";
    const type = message.type || "text";
    if (type === "image") return "Bild";
    if (type === "voice") return "Sprachnachricht";
    if (type === "location") return "Standort";
    if (type === "file") return message.file?.name || "Datei";
    if (type === "deleted") return "Nachricht gelöscht";
    return message.content || "";
  }

  function activeConversation() {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }

  function receiptLabel(message) {
    if (!currentUser || message.userId !== currentUser.id) return "";
    const conv = activeConversation();
    if (!conv || conv.type !== "dm") return "";
    const last = Number(conv.peerLastReadMessageId) || 0;
    return last >= Number(message.id) ? "Gesehen" : "Gesendet";
  }

  function refreshReceipts() {
    for (const row of messageList.querySelectorAll("article[data-message-id]")) {
      const id = Number(row.getAttribute("data-message-id"));
      const message = messagesById.get(id);
      const node = row.querySelector("[data-receipt]");
      if (!message || !node) continue;
      node.textContent = receiptLabel(message);
    }
  }

  function lastSeenLabel(user) {
    if (!user) return "";
    if (user.isBot) return "Assistent";
    if (onlineIds.has(user.id)) return "online";
    if (!user.lastSeenAt) return "zuletzt unbekannt";
    return `zuletzt ${formatTime(user.lastSeenAt)}`;
  }

  function roomStatusText(conv) {
    if (!conv) return "";
    if (conv.type === "dm" && conv.peer) return lastSeenLabel(conv.peer);
    if (conv.type === "group") {
      const n = (conv.members || []).length;
      return `${n} Mitglieder`;
    }
    return "";
  }

  function sendButtonIcon(editing) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    if (editing) {
      svg.setAttribute("class", "h-6 w-6");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.5");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20 6 9 17l-5-5");
      svg.append(path);
      return svg;
    }
    svg.setAttribute("class", "h-7 w-7");
    svg.setAttribute("viewBox", "90 50 360 380");
    const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    mask.setAttribute("id", "send-logo-dots");
    const maskBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    maskBg.setAttribute("width", "512");
    maskBg.setAttribute("height", "512");
    maskBg.setAttribute("fill", "white");
    mask.append(maskBg);
    for (const cx of [300, 348, 396]) {
      const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hole.setAttribute("cx", String(cx));
      hole.setAttribute("cy", "268");
      hole.setAttribute("r", "20");
      hole.setAttribute("fill", "black");
      mask.append(hole);
    }
    const back = document.createElementNS("http://www.w3.org/2000/svg", "path");
    back.setAttribute("fill", "currentColor");
    back.setAttribute("opacity", "0.4");
    back.setAttribute(
      "d",
      "M118 148c0-48.6 39.4-88 88-88h86c48.6 0 88 39.4 88 88v46c0 48.6-39.4 88-88 88h-18l-54 46 12-46h-26c-48.6 0-88-39.4-88-88v-46Z"
    );
    const front = document.createElementNS("http://www.w3.org/2000/svg", "path");
    front.setAttribute("fill", "currentColor");
    front.setAttribute("mask", "url(#send-logo-dots)");
    front.setAttribute(
      "d",
      "M168 214c0-52.9 42.9-96 96-96h92c52.9 0 96 43.1 96 96v58c0 52.9-43.1 96-96 96h-22l-62 52 14-52h-22c-53.1 0-96-43.1-96-96v-58Z"
    );
    svg.append(mask, back, front);
    return svg;
  }

  function setSendMode(editing) {
    btnSend.setAttribute("aria-label", editing ? "Speichern" : "Senden");
    btnSend.replaceChildren(sendButtonIcon(editing));
  }

  function startEdit(message) {
    if (!message?.id) return;
    editingId = message.id;
    messageInput.value = message.content || "";
    setSendMode(true);
    messageInput.focus();
  }

  function clearEdit() {
    editingId = null;
    setSendMode(false);
  }

  function setForwardPanel(open) {
    setOverlay(forwardOverlay, open);
    if (!open) forwardMessageId = null;
  }

  function openForward(messageId) {
    forwardMessageId = messageId;
    forwardTargets.replaceChildren();
    const globalItem = el("li", "");
    const globalBtn = el(
      "button",
      "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-muted",
      "Globaler Chat"
    );
    globalBtn.type = "button";
    globalBtn.addEventListener("click", () => forwardTo(null));
    globalItem.append(globalBtn);
    forwardTargets.append(globalItem);
    for (const conv of conversations) {
      const item = el("li", "");
      const btn = el(
        "button",
        "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-muted whitespace-normal",
        conversationLabel(conv)
      );
      btn.type = "button";
      btn.addEventListener("click", () => forwardTo(conv.id));
      item.append(btn);
      forwardTargets.append(item);
    }
    setForwardPanel(true);
  }

  function forwardTo(conversationId) {
    if (!socket || !forwardMessageId) return;
    socket.emit("message:forward", { messageId: forwardMessageId, conversationId }, (ack) => {
      setForwardPanel(false);
      if (!ack?.ok) showError(chatError, ack?.error || "Weiterleiten fehlgeschlagen.");
      else if (conversationId != null) openConversation(conversationId);
    });
  }

  async function loadSmartReplies() {
    if (!aiSuggestions) return;
    try {
      const body = { conversationId: activeConversationId };
      const data = await api("/api/ai/suggest-replies", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const suggestions = data.suggestions || [];
      aiSuggestions.replaceChildren();
      if (!suggestions.length) {
        aiSuggestions.classList.add("hidden");
        aiSuggestions.hidden = true;
        return;
      }
      for (const text of suggestions) {
        const btn = el(
          "button",
          "inline-flex h-11 min-h-11 items-center rounded-full bg-muted px-3 text-sm text-foreground",
          text
        );
        btn.type = "button";
        btn.addEventListener("click", async () => {
          messageInput.value = text;
          await handleSend(new Event("submit"));
        });
        aiSuggestions.append(btn);
      }
      aiSuggestions.classList.remove("hidden");
      aiSuggestions.classList.add("flex");
      aiSuggestions.hidden = false;
    } catch {
      aiSuggestions.classList.add("hidden");
      aiSuggestions.hidden = true;
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const raw = atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  function pushSupported() {
    return (
      typeof Notification !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }

  function notifyButtonLabel() {
    if (!pushSupported()) return "Benachrichtigungen nicht verfügbar";
    if (notifyPermission === "denied") return "Benachrichtigungen blockiert";
    if (notifyPermission === "granted" && pushSubscribed) return "Benachrichtigungen an";
    return "Benachrichtigungen erlauben";
  }

  function refreshNotifyButtons() {
    const label = notifyButtonLabel();
    if (btnNotify) btnNotify.textContent = label;
    if (btnNotifyMore) btnNotifyMore.textContent = label;
  }

  async function getPushRegistration() {
    if (!("serviceWorker" in navigator)) return null;
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return navigator.serviceWorker.register("/sw.js");
  }

  async function enablePush({ request = false } = {}) {
    if (!currentUser || !pushSupported()) {
      refreshNotifyButtons();
      return false;
    }
    notifyPermission = Notification.permission;
    if (notifyPermission === "default" && request) {
      notifyPermission = await Notification.requestPermission();
    }
    if (notifyPermission !== "granted") {
      pushSubscribed = false;
      refreshNotifyButtons();
      return false;
    }

    const registration = await getPushRegistration();
    if (!registration) return false;
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { publicKey } = await api("/api/push/key");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    });
    pushSubscribed = true;
    refreshNotifyButtons();
    return true;
  }

  async function disablePush() {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      try {
        await api("/api/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch {
        // Abmelden soll lokal klappen, auch wenn der Server schon leer ist.
      }
      await subscription.unsubscribe();
    }
    pushSubscribed = false;
    refreshNotifyButtons();
  }

  async function togglePush() {
    if (!pushSupported()) {
      showError(chatError, "Dieser Browser unterstützt keine Push-Benachrichtigungen.");
      return;
    }
    if (notifyPermission === "denied") {
      showError(
        chatError,
        "Benachrichtigungen sind blockiert. In den Browser- oder Systemeinstellungen erlauben."
      );
      return;
    }
    if (pushSubscribed) {
      await disablePush();
      return;
    }
    try {
      const ok = await enablePush({ request: true });
      if (!ok && notifyPermission === "denied") {
        showError(
          chatError,
          "Benachrichtigungen sind blockiert. In den Browser- oder Systemeinstellungen erlauben."
        );
      }
    } catch (err) {
      showError(chatError, err.message || "Benachrichtigungen konnten nicht aktiviert werden.");
    }
  }

  function conversationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("c");
    if (raw == null || raw === "") return undefined;
    if (raw === "global") return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  }

  function notifyIncoming(message) {
    if (notifyPermission !== "granted") return;
    if (!message || (currentUser && message.userId === currentUser.id)) return;
    if (!document.hidden && sameRoom(message.conversationId ?? null)) return;
    if (document.hidden && pushSubscribed) return;
    try {
      const n = new Notification(displayName(message) || "Neue Nachricht", {
        body: previewText(message).slice(0, 80),
        tag: `chat-${message.conversationId || "global"}`,
        icon: "/icons/icon-192.png",
      });
      n.addEventListener("click", () => {
        window.focus();
        openConversation(message.conversationId ?? null);
      });
    } catch {
      // Browser kann Notifications stillschweigend ablehnen.
    }
  }

  async function openAssistant() {
    if (!canPost()) {
      showError(chatError, "Dein Konto wartet noch auf Freigabe durch einen Admin.");
      return;
    }
    try {
      const conv = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ usernames: ["raum"] }),
      });
      upsertConversation(conv);
      await openConversation(conv.id);
      setNavPanel(false);
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function setReplyTarget(message) {
    if (!message?.id || message.deleted) {
      replyTarget = null;
      replyBar.classList.add("hidden");
      replyBar.classList.remove("flex");
      replyAuthor.textContent = "";
      replyPreview.textContent = "";
      return;
    }
    replyTarget = message;
    replyAuthor.textContent = displayName(message);
    replyPreview.textContent = previewText(message);
    replyBar.classList.remove("hidden");
    replyBar.classList.add("flex");
    messageInput.focus();
  }

  function hideReactionPicker() {
    if (reactionPicker) {
      reactionPicker.remove();
      reactionPicker = null;
    }
  }

  function hideMessageMenu() {
    hideReactionPicker();
    if (!messageMenuOverlay) return;
    setOverlay(messageMenuOverlay, false);
    messageMenu.style.left = "";
    messageMenu.style.top = "";
    messageMenu.classList.remove("msg-menu-float", "msg-menu-sheet");
  }

  function toggleReaction(messageId, emoji) {
    if (!socket || !messageId) return;
    socket.emit("reaction:toggle", { messageId, emoji }, (ack) => {
      if (!ack?.ok) showError(chatError, ack?.error || "Reaktion fehlgeschlagen.");
    });
  }

  function usesTouchMenu() {
    return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 640px)").matches;
  }

  function isMessageChrome(target) {
    return Boolean(target && target.closest && target.closest("audio, input, textarea, button, select"));
  }

  function openMessageMenu(message, x, y) {
    if (!message?.id || message.deleted) return;
    hideReactionPicker();

    const mine = Boolean(currentUser && message.userId === currentUser.id);
    const posting = canPost();
    const textType = (message.type || "text") === "text";
    const asSheet = usesTouchMenu();

    messageMenuReactions.replaceChildren();
    for (const emoji of ALLOWED_REACTIONS) {
      const active = (message.reactions || []).some((reaction) => reaction.emoji === emoji && reaction.mine);
      const btn = el(
        "button",
        `h-full min-h-0 max-h-full w-11 flex-1 rounded-full text-lg leading-none ${
          active ? "bg-background text-foreground shadow-sm shadow-black/40" : "text-muted-foreground"
        }`
      );
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("aria-label", `Reaktion ${emoji}`);
      btn.setAttribute("aria-pressed", String(active));
      btn.disabled = !posting;
      btn.textContent = emoji;
      btn.addEventListener("click", () => {
        if (!posting) return;
        toggleReaction(message.id, emoji);
        hideMessageMenu();
      });
      messageMenuReactions.append(btn);
    }
    messageMenuReactions.classList.toggle("hidden", !posting);

    messageMenuActions.replaceChildren();
    const items = [];
    if (posting) {
      items.push({ label: "Antworten", run: () => setReplyTarget(message) });
    }
    if (textType && message.content) {
      items.push({
        label: "Kopieren",
        run: async () => {
          try {
            await navigator.clipboard.writeText(message.content);
          } catch {
            showError(chatError, "Text konnte nicht kopiert werden.");
          }
        },
      });
    }
    if (posting && mine && textType) {
      items.push({ label: "Bearbeiten", run: () => startEdit(message) });
    }
    if (posting) {
      items.push({ label: "Weiterleiten", run: () => openForward(message.id) });
    }
    if (posting && mine) {
      items.push({ label: "Löschen", run: () => deleteMessage(message.id), danger: true });
    }

    for (const item of items) {
      const li = el("li", "");
      const btn = el(
        "button",
        `flex h-11 min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium ${
          item.danger
            ? "text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-950/60"
            : "text-foreground hover:bg-muted"
        }`,
        item.label
      );
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.addEventListener("click", () => {
        hideMessageMenu();
        item.run();
      });
      li.append(btn);
      messageMenuActions.append(li);
    }

    messageMenuHandle.classList.toggle("hidden", !asSheet);
    messageMenuBackdrop.className = asSheet
      ? "absolute inset-0 bg-black/60"
      : "absolute inset-0 bg-transparent";

    if (asSheet) {
      messageMenu.className =
        "msg-menu-sheet absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-card px-4 pb-8 pt-3 shadow-2xl ring-1 ring-border/80";
      messageMenu.style.paddingBottom = "max(1.5rem, env(safe-area-inset-bottom))";
      messageMenu.style.left = "";
      messageMenu.style.top = "";
    } else {
      messageMenu.className =
        "msg-menu-float absolute z-10 w-72 rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-border/80";
      messageMenu.style.paddingBottom = "";
    }

    setOverlay(messageMenuOverlay, true);
    ignoreMenuClickUntil = Date.now() + 450;

    if (!asSheet) {
      const left = Number(x) || 16;
      const top = Number(y) || 16;
      messageMenu.style.left = `${left}px`;
      messageMenu.style.top = `${top}px`;
      requestAnimationFrame(() => {
        const rect = messageMenu.getBoundingClientRect();
        let nextLeft = left;
        let nextTop = top;
        const margin = 8;
        if (nextLeft + rect.width > window.innerWidth - margin) {
          nextLeft = window.innerWidth - rect.width - margin;
        }
        if (nextTop + rect.height > window.innerHeight - margin) {
          nextTop = window.innerHeight - rect.height - margin;
        }
        if (nextLeft < margin) nextLeft = margin;
        if (nextTop < margin) nextTop = margin;
        messageMenu.style.left = `${nextLeft}px`;
        messageMenu.style.top = `${nextTop}px`;
      });
    }

    const focusable = messageMenu.querySelector("button:not([disabled])");
    if (focusable) focusable.focus();
  }

  function bindMessageMenu(row, message, bubble) {
    if (message.deleted) return;

    const moreBtn = el(
      "button",
      `absolute top-1 hidden h-11 w-11 items-center justify-center rounded-full text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 ${
        currentUser && message.userId === currentUser.id ? "left-1" : "right-1"
      }`
    );
    moreBtn.type = "button";
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.setAttribute("aria-label", "Nachrichtenaktionen");
    moreBtn.textContent = "⋮";
    moreBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
    moreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = moreBtn.getBoundingClientRect();
      openMessageMenu(message, rect.left, rect.bottom + 4);
    });
    bubble.classList.add("relative");
    bubble.append(moreBtn);

    row.addEventListener("contextmenu", (event) => {
      if (isMessageChrome(event.target)) return;
      event.preventDefault();
      openMessageMenu(message, event.clientX, event.clientY);
    });

    let pressTimer = 0;
    let startX = 0;
    let startY = 0;
    let pressing = false;
    let longPressArmed = false;

    const clearPress = () => {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
      pressing = false;
      row.classList.remove("msg-press");
    };

    row.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      if (isMessageChrome(event.target)) return;
      startX = event.clientX;
      startY = event.clientY;
      pressing = true;
      longPressArmed = false;
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        if (!pressing) return;
        longPressArmed = true;
        row.classList.add("msg-press");
        if (typeof navigator.vibrate === "function") navigator.vibrate(12);
        window.getSelection()?.removeAllRanges();
      }, 480);
    });

    row.addEventListener("pointermove", (event) => {
      if (!pressing || (!pressTimer && !longPressArmed)) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (dx * dx + dy * dy > 144) {
        longPressArmed = false;
        clearPress();
      }
    });

    row.addEventListener("pointerup", (event) => {
      const armed = longPressArmed;
      clearPress();
      longPressArmed = false;
      if (!armed) return;
      event.preventDefault();
      openMessageMenu(message, startX, startY);
    });
    row.addEventListener("pointercancel", () => {
      longPressArmed = false;
      clearPress();
    });
  }

  function applyReactions(row, message) {
    let host = row.querySelector("[data-reactions]");
    const list = message.reactions || [];
    if (!list.length) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = el("div", "mt-2 flex flex-wrap gap-1");
      host.setAttribute("data-reactions", "");
      const bubble = row.querySelector("[data-bubble]");
      if (bubble) bubble.append(host);
    }
    host.replaceChildren();
    for (const reaction of list) {
      const btn = el(
        "button",
        `inline-flex h-11 min-h-11 items-center gap-1 rounded-full px-3 text-sm ${
          reaction.mine ? "bg-primary/20 text-foreground" : "bg-muted text-foreground"
        }`
      );
      btn.type = "button";
      btn.append(el("span", "", reaction.emoji), el("span", "text-xs text-muted-foreground", String(reaction.count)));
      btn.setAttribute("aria-pressed", String(Boolean(reaction.mine)));
      btn.addEventListener("click", () => toggleReaction(message.id, reaction.emoji));
      host.append(btn);
    }
  }

  function replaceMessageRow(message) {
    const row = messageList.querySelector(`[data-message-id="${message.id}"]`);
    if (!row) return;
    const next = document.createDocumentFragment();
    const rebuilt = buildMessageRow(message);
    next.append(rebuilt);
    row.replaceWith(rebuilt);
  }

  function buildMessageRow(message) {
    const mine = currentUser && message.userId === currentUser.id;
    const row = el("article", `group relative flex gap-2 ${mine ? "justify-end" : "justify-start"}`);
    row.setAttribute("data-message-id", String(message.id ?? ""));

    const showPeerAvatar =
      !mine && (activeConversationId == null || activeConversation()?.type === "group");
    const avatar = el("div", "");
    if (showPeerAvatar) fillAvatar(avatar, message, "h-8 w-8 mt-1");

    const col = el("div", `max-w-[min(36rem,82%)] ${mine ? "items-end" : "items-start"} flex flex-col`);

    const bubble = el(
      "div",
      `w-full px-3 py-2 leading-snug ${
        message.deleted
          ? "rounded-2xl bg-muted text-muted-foreground ring-1 ring-border"
          : mine
            ? "rounded-2xl rounded-br-md"
            : "rounded-2xl rounded-bl-md ring-1 ring-border/60"
      }`
    );
    if (!message.deleted) bubble.setAttribute("data-bubble", mine ? "own" : "peer");

    if (!mine) {
      const meta = el("div", "mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5");
      meta.append(
        el("span", "text-sm font-semibold break-words text-primary", displayName(message))
      );
      bubble.append(meta);
    }

    if (message.replyTo) {
      const quote = el(
        "button",
        "mb-2 w-full rounded-xl bg-background/60 px-3 py-2 text-left ring-1 ring-border hover:bg-background"
      );
      quote.type = "button";
      quote.append(
        el(
          "p",
          "text-xs font-medium text-primary",
          message.replyTo.deleted ? "Gelöschte Nachricht" : displayName(message.replyTo)
        ),
        el(
          "p",
          "mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground",
          previewText(message.replyTo)
        )
      );
      quote.addEventListener("click", () => scrollToMessage(message.replyTo.id));
      bubble.append(quote);
    }

    if (message.deleted) {
      bubble.append(el("p", "text-sm italic", "Nachricht gelöscht"));
    } else {
      const type = message.type || "text";
      if (type === "image" && message.file?.id && FILE_UUID.test(message.file.id)) {
        const link = document.createElement("a");
        link.href = `/api/files/${message.file.id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "mt-1 block";
        const img = document.createElement("img");
        img.alt = message.content || "Gesendetes Bild";
        img.className = "max-h-72 max-w-full rounded-xl object-contain";
        img.src = `/api/files/${message.file.id}`;
        link.append(img);
        bubble.append(link);
        if (message.content && message.content !== "Bild") {
          bubble.append(el("p", "mt-2 break-words text-sm", message.content));
        }
      } else if (type === "voice" && message.file?.id && FILE_UUID.test(message.file.id)) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.className = "mt-1 w-full max-w-xs";
        audio.src = `/api/files/${message.file.id}`;
        bubble.append(audio);
        if (message.file.durationMs) {
          bubble.append(
            el("p", "mt-1 text-xs text-muted-foreground", formatDuration(message.file.durationMs))
          );
        }
        if (message.transcript) {
          bubble.append(el("p", "mt-2 break-words text-sm text-muted-foreground", message.transcript));
        }
      } else if (type === "file" && message.file?.id && FILE_UUID.test(message.file.id)) {
        const link = document.createElement("a");
        link.href = `/api/files/${message.file.id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className =
          "mt-2 inline-flex h-11 min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-110";
        link.textContent = message.file.name || "Datei öffnen";
        bubble.append(link);
        if (message.content && message.content !== "Datei") {
          bubble.append(el("p", "mt-2 break-words text-sm", message.content));
        }
      } else if (type === "location" && message.location) {
        const lat = Number(message.location.lat);
        const lng = Number(message.location.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const card = el("div", "mt-1 rounded-xl bg-background/60 p-3 ring-1 ring-border");
          card.append(el("p", "text-sm font-medium", "Standort"));
          card.append(
            el(
              "p",
              "mt-1 font-mono text-sm text-muted-foreground",
              `${coordFormatter.format(lat)}, ${coordFormatter.format(lng)}`
            )
          );
          if (message.location.accuracy != null) {
            card.append(
              el(
                "p",
                "mt-1 text-xs text-muted-foreground",
                `Genauigkeit ca. ${Math.round(message.location.accuracy)} m`
              )
            );
          }
          const link = document.createElement("a");
          link.href = osmUrl(lat, lng);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className =
            "mt-3 inline-flex h-11 min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-110";
          link.textContent = "In OpenStreetMap öffnen";
          card.append(link);
          bubble.append(card);
        }
      } else {
        bubble.append(
          el("p", "break-words whitespace-pre-wrap text-sm sm:text-base", message.content || "")
        );
      }
      if (message.editedAt) {
        bubble.append(el("p", "mt-1 text-xs text-muted-foreground", "bearbeitet"));
      }
    }

    bubble.append(
      el(
        "time",
        "mt-1 block text-right text-[0.7rem] leading-none",
        formatListTime(message.createdAt)
      )
    );

    col.append(bubble);

    if (!message.deleted) {
      bindMessageMenu(row, message, bubble);
      const receipt = el("p", "mt-1 text-xs text-muted-foreground", "");
      receipt.setAttribute("data-receipt", "");
      receipt.textContent = receiptLabel(message);
      if (receipt.textContent) col.append(receipt);
    }

    if (mine) row.append(col);
    else if (showPeerAvatar) row.append(avatar, col);
    else row.append(col);

    applyReactions(row, message);
    return row;
  }

  function appendMessage(message, { scroll = true } = {}) {
    if (!sameRoom(message.conversationId ?? null)) return;
    if (message.id != null) {
      if (seenMessageIds.has(message.id)) {
        messagesById.set(message.id, message);
        replaceMessageRow(message);
        return;
      }
      seenMessageIds.add(message.id);
    }

    messagesById.set(message.id, message);
    const row = buildMessageRow(message);
    messageList.append(row);

    if (scroll) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  function deleteMessage(messageId) {
    if (!socket || !messageId) return;
    if (!window.confirm("Diese Nachricht für alle löschen?")) return;
    socket.emit("message:delete", { messageId }, (ack) => {
      if (!ack?.ok) showError(chatError, ack?.error || "Löschen fehlgeschlagen.");
    });
  }

  function scrollToMessage(messageId) {
    const row = messageList.querySelector(`[data-message-id="${messageId}"]`);
    if (!row) return;
    row.classList.add("msg-highlight");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => row.classList.remove("msg-highlight"), 1600);
  }

  function renderTyping(typers) {
    const others = (Array.isArray(typers) ? typers : []).filter(
      (user) => !currentUser || user.id !== currentUser.id
    );
    if (!others.length) {
      typingIndicator.classList.add("hidden");
      typingIndicator.replaceChildren();
      return;
    }
    const names = others.map(displayName);
    let text = "";
    if (names.length === 1) text = `${names[0]} tippt`;
    else if (names.length === 2) text = `${names[0]} und ${names[1]} tippen`;
    else text = "Mehrere Personen tippen";

    typingIndicator.replaceChildren();
    const dots = el("span", "mr-2 inline-flex gap-0.5 align-middle", "");
    dots.setAttribute("aria-hidden", "true");
    dots.append(
      el("span", "typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"),
      el("span", "typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"),
      el("span", "typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary")
    );
    typingIndicator.append(dots, el("span", "", `${text}…`));
    typingIndicator.classList.remove("hidden");
  }

  function emitTyping(on) {
    if (!socket) return;
    const payload = { conversationId: activeConversationId };
    socket.emit(on ? "typing:start" : "typing:stop", payload);
    typingSent = on;
  }

  function scheduleTyping() {
    if (!typingSent) emitTyping(true);
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => emitTyping(false), 1800);
  }

  function unreadBadge(count) {
    if (!count) return null;
    const n = count > 99 ? "99+" : String(count);
    return el(
      "span",
      "ml-auto shrink-0 min-w-6 rounded-full bg-primary px-2 py-0.5 text-center text-xs font-semibold text-primary-foreground",
      n
    );
  }

  function setGlobalUnread(count) {
    globalUnread = Number(count) || 0;
    renderConversationLists();
  }

  function applyUnread({ conversationId, unreadCount }) {
    if (conversationId == null) {
      setGlobalUnread(unreadCount);
      return;
    }
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) {
      loadConversations();
      return;
    }
    conv.unreadCount = Number(unreadCount) || 0;
    renderConversationLists();
  }

  function renderHistory(messages) {
    messageList.replaceChildren();
    seenMessageIds.clear();
    messagesById.clear();
    hideReactionPicker();
    hideMessageMenu();
    renderTyping([]);

    if (!messages.length) {
      const empty = el(
        "p",
        "mx-auto mt-12 max-w-sm text-center text-sm leading-relaxed text-muted-foreground",
        activeConversationId
          ? "Noch keine Nachrichten in diesem Chat."
          : "Noch keine Nachrichten. Schreib die erste!"
      );
      messageList.append(empty);
      return;
    }

    for (const message of messages) {
      appendMessage(message, { scroll: false });
    }
    messageList.scrollTop = messageList.scrollHeight;
    loadSmartReplies();
  }

  function conversationLabel(conv) {
    if (!conv) return "Chat";
    if (conv.type === "dm" && conv.peer) return displayName(conv.peer);
    const names = (conv.members || [])
      .filter((m) => !currentUser || m.id !== currentUser.id)
      .map(displayName);
    return names.length ? names.join(", ") : "Gruppe";
  }

  function isAssistantConversation(conv) {
    if (!conv) return false;
    if (conv.peer?.username === "raum") return true;
    return (conv.members || []).some((member) => member.username === "raum");
  }

  function updateRoomHeader() {
    if (!chatSelected) {
      roomTitle.textContent = "Chat";
      roomStatus.textContent = "";
      threadAvatar.replaceChildren();
      return;
    }
    if (activeConversationId == null) {
      roomTitle.textContent = "Globaler Chat";
      roomStatus.textContent = "Für alle Angemeldeten";
      fillAvatar(threadAvatar, { username: "global", realName: "Globaler Chat" }, "h-10 w-10");
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    roomTitle.textContent = conversationLabel(conv);
    roomStatus.textContent = roomStatusText(conv);
    const avatarUser =
      conv?.type === "dm" && conv.peer
        ? conv.peer
        : { username: "Gruppe", realName: conversationLabel(conv), avatarUrl: "" };
    fillAvatar(threadAvatar, avatarUser, "h-10 w-10");
  }

  function conversationRowClass(active) {
    return `flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left whitespace-normal ${
      active ? "bg-muted" : "hover:bg-muted/70"
    }`;
  }

  function appendConversationRow({ title, preview, time, unread, avatarUser, active, onClick }) {
    const item = el("li", "border-b border-border/60");
    const btn = el("button", conversationRowClass(active));
    btn.type = "button";
    const avatarHost = el("div", "");
    fillAvatar(avatarHost, avatarUser, "h-12 w-12");
    const body = el("span", "min-w-0 flex-1");
    const top = el("span", "flex items-start justify-between gap-2");
    top.append(el("span", "min-w-0 break-words text-sm font-medium leading-snug text-foreground", title));
    if (time) top.append(el("span", "shrink-0 text-xs text-muted-foreground", time));
    body.append(top);
    const bottom = el("span", "mt-0.5 flex items-start justify-between gap-2");
    bottom.append(
      el("span", "min-w-0 line-clamp-2 break-words text-sm leading-snug text-muted-foreground", preview)
    );
    const badge = unreadBadge(unread);
    if (badge) {
      badge.classList.remove("ml-auto");
      bottom.append(badge);
    }
    body.append(bottom);
    btn.append(avatarHost, body);
    btn.addEventListener("click", onClick);
    item.append(btn);
    convList.append(item);
  }

  function renderConversationLists() {
    convList.replaceChildren();
    appendConversationRow({
      title: "Globaler Chat",
      preview: "Für alle Angemeldeten",
      time: "",
      unread: globalUnread,
      avatarUser: { username: "global", realName: "Globaler Chat" },
      active: chatSelected && activeConversationId == null,
      onClick: openGlobal,
    });
    appendConversationRow({
      title: "Assistent raum",
      preview: "Hilfe und Kurzfassung",
      time: "",
      unread: 0,
      avatarUser: { username: "raum", realName: "Assistent" },
      active: chatSelected && isAssistantConversation(conversations.find((c) => c.id === activeConversationId)),
      onClick: openAssistant,
    });

    const privateChats = conversations.filter((conv) => !isAssistantConversation(conv));
    if (!privateChats.length) {
      convList.append(
        el("li", "px-4 py-4 text-sm leading-snug text-muted-foreground", "Noch keine privaten Chats.")
      );
      return;
    }

    for (const conv of privateChats) {
      const avatarUser =
        conv.type === "dm" && conv.peer
          ? conv.peer
          : { username: "Gruppe", realName: "Gruppe", avatarUrl: "" };
      appendConversationRow({
        title: conversationLabel(conv),
        preview: previewText(conv.lastMessage) || "Keine Nachrichten",
        time: formatListTime(conv.lastMessage?.createdAt),
        unread: conv.unreadCount,
        avatarUser,
        active: chatSelected && conv.id === activeConversationId,
        onClick: () => openConversation(conv.id),
      });
    }
  }

  async function loadConversations() {
    try {
      conversations = await api("/api/conversations");
      renderConversationLists();
      updateRoomHeader();
    } catch {
      conversations = [];
      renderConversationLists();
    }
  }

  function upsertConversation(conv) {
    if (!conv?.id) return;
    const idx = conversations.findIndex((c) => c.id === conv.id);
    if (idx >= 0) conversations.splice(idx, 1);
    conversations.unshift(conv);
    renderConversationLists();
  }

  function bumpConversationPreview(message) {
    if (message.conversationId == null) return;
    const conv = conversations.find((c) => c.id === message.conversationId);
    if (!conv) {
      loadConversations();
      return;
    }
    conv.lastMessage = {
      content: previewText(message),
      type: message.deleted ? "deleted" : message.type,
      createdAt: message.createdAt,
      deleted: Boolean(message.deleted),
    };
    if (!sameRoom(message.conversationId) && currentUser && message.userId !== currentUser.id) {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }
    conversations = [conv, ...conversations.filter((c) => c.id !== conv.id)];
    renderConversationLists();
  }

  async function openConversation(conversationId) {
    emitTyping(false);
    setReplyTarget(null);
    clearEdit();
    hideReactionPicker();
    hideMessageMenu();
    activeConversationId = conversationId;
    chatSelected = true;
    updateRoomHeader();
    renderConversationLists();
    setNewChatPanel(false);
    setListTab("chats");
    updatePanes();
    if (!isWideLayout() && history.state?.view !== "thread") {
      history.pushState({ view: "thread" }, "");
    }
    messageList.replaceChildren(
      el("p", "mx-auto mt-12 text-center text-sm text-muted-foreground", "Lade Verlauf…")
    );

    if (!socket) return;
    socket.emit("conversation:open", { conversationId }, (ack) => {
      if (!ack?.ok) {
        showError(chatError, ack?.error || "Verlauf konnte nicht geladen werden.");
      }
    });
  }

  function openGlobal() {
    openConversation(null);
  }

  async function startConversationWith(usernames) {
    if (!canPost()) {
      showError(chatError, "Dein Konto wartet noch auf Freigabe durch einen Admin.");
      return;
    }
    const names = [...new Set(usernames.map((n) => n.toLowerCase()))];
    if (!names.length) return;
    try {
      const conv = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ usernames: names }),
      });
      upsertConversation(conv);
      pickedUsers.clear();
      renderPicked();
      userSearch.value = "";
      userSearchResults.replaceChildren();
      setNewChatPanel(false);
      await openConversation(conv.id);
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function renderOnlineUsers(users) {
    const count = users.length;
    onlineCount.textContent = `(${count})`;
    onlineIds.clear();
    for (const user of users) onlineIds.add(user.id);
    if (chatSelected) updateRoomHeader();

    userList.replaceChildren();
    for (const user of users) {
      const isSelf = currentUser && user.id === currentUser.id;
      const item = el("li", "");
      const btn = el(
        "button",
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted whitespace-normal"
      );
      btn.type = "button";
      btn.disabled = Boolean(isSelf);
      const avatar = el("div", "");
      fillAvatar(avatar, user, "h-12 w-12");
      const dot = el("span", "h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400");
      dot.setAttribute("aria-hidden", "true");
      const text = el("span", "min-w-0 flex-1");
      text.append(el("span", "block break-words text-sm font-medium text-foreground", displayName(user)));
      if (user.realName) {
        text.append(el("span", "block text-xs text-muted-foreground", `@${user.username}`));
      }
      if (isSelf) {
        text.append(el("span", "block text-xs text-muted-foreground", "(du)"));
      }
      btn.append(dot, avatar, text);
      if (!isSelf) {
        btn.addEventListener("click", () => startConversationWith([user.username]));
      }
      item.append(btn);
      userList.append(item);
    }
  }

  function setOverlay(overlay, open) {
    overlay.classList.toggle("hidden", !open);
    overlay.hidden = !open;
  }

  function setNewChatPanel(open) {
    setOverlay(newChatOverlay, open);
    if (open) userSearch.focus();
  }

  function setMorePanel(open) {
    setOverlay(moreOverlay, open);
    if (open) {
      refreshNotifyButtons();
      refreshThemePills();
    }
  }

  function setOnlinePanel(_open) {
    setListTab("contacts");
  }

  function setNavPanel(_open) {}

  function setProfilePanel(open) {
    setOverlay(profileOverlay, open);
    if (open && currentUser) {
      profileRealname.value = currentUser.realName || "";
      profileAvatarUrl.value = currentUser.avatarUrl || "";
      profileAvatarFile.value = "";
      showError(profileError, "");
      showError(profileOk, "");
      fillAvatar(profileAvatarPreview, currentUser, "h-16 w-16");
      refreshThemePills();
      syncBubblePickers();
      btnProfileClose.focus();
    }
  }

  function renderPicked() {
    searchPicked.replaceChildren();
    for (const user of pickedUsers.values()) {
      const chip = el(
        "li",
        "inline-flex min-h-11 items-center gap-1 rounded-full bg-muted px-3 text-sm"
      );
      chip.append(el("span", "break-words", displayName(user)));
      const remove = el("button", "inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-full text-muted-foreground");
      remove.type = "button";
      remove.setAttribute("aria-label", `${displayName(user)} entfernen`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        pickedUsers.delete(user.username);
        renderPicked();
      });
      chip.append(remove);
      searchPicked.append(chip);
    }
    const show = pickedUsers.size > 0;
    btnStartChat.classList.toggle("hidden", !show);
    btnStartChat.classList.toggle("flex", show);
  }

  function renderSearchResults(users) {
    userSearchResults.replaceChildren();
    for (const user of users) {
      if (pickedUsers.has(user.username)) continue;
      const item = el("li", "");
      const btn = el(
        "button",
        "flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-muted whitespace-normal"
      );
      btn.type = "button";
      const avatar = el("div", "");
      fillAvatar(avatar, user, "h-8 w-8");
      const text = el("span", "min-w-0");
      text.append(el("span", "block break-words text-sm", displayName(user)));
      if (user.realName) {
        text.append(el("span", "block text-xs text-muted-foreground", `@${user.username}`));
      }
      btn.append(avatar, text);
      btn.addEventListener("click", () => {
        pickedUsers.set(user.username, user);
        renderPicked();
        renderSearchResults(users);
      });
      item.append(btn);
      userSearchResults.append(item);
    }
  }

  async function searchUsers(query) {
    try {
      const q = encodeURIComponent(query.trim());
      const users = await api(`/api/users?q=${q}`);
      renderSearchResults(users);
    } catch {
      renderSearchResults([]);
    }
  }

  function scheduleSearch(query) {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => searchUsers(query), 250);
  }

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

    socket.on("messages:history", (payload) => {
      const conversationId = payload?.conversationId ?? null;
      const messages = Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload)
          ? payload
          : [];
      if (!sameRoom(conversationId)) return;
      renderHistory(messages);
      showError(chatError, "");
    });

    socket.on("message:new", (message) => {
      bumpConversationPreview(message);
      notifyIncoming(message);
      if (!sameRoom(message.conversationId ?? null)) return;
      const emptyHint = messageList.querySelector("p");
      if (emptyHint && !messageList.querySelector("article")) {
        emptyHint.remove();
      }
      appendMessage(message);
      if (currentUser && message.userId !== currentUser.id) loadSmartReplies();
    });

    socket.on("message:edited", (message) => {
      if (!message?.id) return;
      messagesById.set(message.id, message);
      bumpConversationPreview(message);
      if (!sameRoom(message.conversationId ?? null)) return;
      if (seenMessageIds.has(message.id)) replaceMessageRow(message);
    });

    socket.on("receipt:update", (payload) => {
      if (!payload || Number(payload.conversationId) !== Number(activeConversationId)) return;
      const conv = activeConversation();
      if (!conv || conv.type !== "dm") return;
      if (currentUser && payload.userId === currentUser.id) return;
      conv.peerLastReadMessageId = payload.lastReadMessageId;
      refreshReceipts();
    });

    socket.on("conversation:updated", (conv) => {
      upsertConversation(conv);
      if (Number(conv?.id) === Number(activeConversationId)) updateRoomHeader();
    });

    socket.on("conversation:left", (payload) => {
      const id = payload?.conversationId;
      conversations = conversations.filter((c) => c.id !== id);
      renderConversationLists();
      if (Number(id) === Number(activeConversationId)) closeThread();
    });

    socket.on("message:deleted", (message) => {
      if (!message?.id) return;
      messagesById.set(message.id, message);
      bumpConversationPreview(message);
      if (!sameRoom(message.conversationId ?? null)) return;
      if (seenMessageIds.has(message.id)) replaceMessageRow(message);
    });

    socket.on("reaction:update", (payload) => {
      if (!payload?.messageId) return;
      const message = messagesById.get(payload.messageId);
      if (!message) return;
      message.reactions = payload.reactions || [];
      const row = messageList.querySelector(`[data-message-id="${payload.messageId}"]`);
      if (row) applyReactions(row, message);
    });

    socket.on("typing:update", (payload) => {
      if (!sameRoom(payload?.conversationId ?? null)) return;
      renderTyping(payload?.typers);
    });

    socket.on("inbox:unread", (payload) => {
      applyUnread(payload || {});
    });

    socket.on("conversation:new", (conv) => {
      upsertConversation(conv);
    });

    socket.on("users:online", (users) => {
      renderOnlineUsers(Array.isArray(users) ? users : []);
    });

    socket.on("user:updated", (user) => {
      if (!user?.id) return;
      if (currentUser && user.id === currentUser.id) {
        currentUser = { ...currentUser, ...user };
        if (user.ui) {
          uiPrefs = normalizeUi(user.ui);
          saveUiPrefsLocal();
          applyUi();
        }
        refreshSelfUi();
      }
      for (const conv of conversations) {
        conv.members = (conv.members || []).map((m) => (m.id === user.id ? { ...m, ...user } : m));
        if (conv.peer?.id === user.id) conv.peer = { ...conv.peer, ...user };
      }
      renderConversationLists();
      updateRoomHeader();
    });

    socket.on("account:status", (payload) => {
      if (!currentUser) return;
      currentUser.isApproved = Boolean(payload?.isApproved);
      if (payload?.isAdmin != null) currentUser.isAdmin = Boolean(payload.isAdmin);
      refreshSelfUi();
    });

    socket.on("admin:users-changed", (payload) => {
      if (!currentUser?.isAdmin) return;
      setAdminPendingBadge(payload?.pendingUsers);
      if (!viewAdmin.classList.contains("hidden")) {
        if (payload?.user) {
          const idx = adminUsers.findIndex((user) => user.id === payload.user.id);
          if (idx >= 0) adminUsers[idx] = { ...adminUsers[idx], ...payload.user };
          else adminUsers.unshift(payload.user);
          renderAdminUsers();
        } else {
          loadAdminUsers();
        }
      }
    });

    socket.on("chat:error", (message) => {
      showError(chatError, message);
    });
  }

  function emitMessage(payload) {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Keine Verbindung."));
        return;
      }
      const body = { ...payload };
      if (activeConversationId != null) body.conversationId = activeConversationId;
      if (replyTarget?.id) body.replyToId = replyTarget.id;
      socket.emit("message:send", body, (ack) => {
        if (!ack?.ok) {
          reject(new Error(ack?.error || "Senden fehlgeschlagen."));
          return;
        }
        setReplyTarget(null);
        emitTyping(false);
        resolve(ack);
      });
    });
  }

  async function handleSend(event) {
    event.preventDefault();
    showError(chatError, "");
    setAttachTray(false);
    if (!canPost()) {
      showError(chatError, "Dein Konto wartet noch auf Freigabe durch einen Admin.");
      return;
    }
    if (mediaRecorder) return;

    const content = messageInput.value.trim();
    if (!content || !socket) return;
    if (content.length > MAX_MESSAGE_LENGTH) {
      showError(chatError, `Maximal ${MAX_MESSAGE_LENGTH} Zeichen.`);
      return;
    }

    btnSend.disabled = true;
    try {
      if (editingId) {
        await new Promise((resolve, reject) => {
          socket.emit("message:edit", { messageId: editingId, content }, (ack) => {
            if (!ack?.ok) reject(new Error(ack?.error || "Bearbeiten fehlgeschlagen."));
            else resolve(ack);
          });
        });
        clearEdit();
      } else {
        await emitMessage({ type: "text", content });
        setReplyTarget(null);
      }
      messageInput.value = "";
      emitTyping(false);
      messageInput.focus();
    } catch (err) {
      showError(chatError, err.message);
    } finally {
      btnSend.disabled = false;
    }
  }

  async function uploadFile(kind, file, extra = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    if (extra.durationMs != null) form.append("durationMs", String(extra.durationMs));
    return api("/api/uploads", { method: "POST", body: form });
  }

  async function handleImagePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    showError(chatError, "");
    btnAttachImage.disabled = true;
    try {
      const saved = await uploadFile("image", file);
      const caption = messageInput.value.trim();
      await emitMessage({ type: "image", uploadId: saved.id, content: caption });
      if (caption) messageInput.value = "";
    } catch (err) {
      showError(chatError, err.message);
    } finally {
      btnAttachImage.disabled = false;
    }
  }

  function handleLocation() {
    showError(chatError, "");
    if (!navigator.geolocation) {
      showError(chatError, "Standort wird von diesem Browser nicht unterstützt.");
      return;
    }
    btnAttachLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await emitMessage({
            type: "location",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        } catch (err) {
          showError(chatError, err.message);
        } finally {
          btnAttachLocation.disabled = false;
        }
      },
      (err) => {
        btnAttachLocation.disabled = false;
        if (err.code === err.PERMISSION_DENIED) {
          showError(chatError, "Standortzugriff wurde verweigert.");
        } else {
          showError(chatError, "Standort konnte nicht ermittelt werden.");
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 }
    );
  }

  function pickRecorderMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    if (typeof MediaRecorder === "undefined") return "";
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function stopTracks() {
    if (recordStream) {
      if (recordStream._speech) {
        try {
          recordStream._speech.stop();
        } catch {
          // ignore
        }
      }
      for (const track of recordStream.getTracks()) track.stop();
      recordStream = null;
    }
  }

  function stopRecording(send) {
    window.clearInterval(recordInterval);
    window.clearTimeout(recordStopTimer);
    recordInterval = null;
    recordStopTimer = null;
    recordBar.classList.add("hidden");
    recordBar.classList.remove("flex");
    btnAttachVoice.disabled = false;

    const recorder = mediaRecorder;
    mediaRecorder = null;
    if (!recorder) {
      stopTracks();
      return;
    }

    recorder.onstop = async () => {
      const durationMs = Date.now() - recordStartedAt;
      const blob = new Blob(recordChunks, { type: recordMime || "audio/webm" });
      recordChunks = [];
      stopTracks();
      if (!send) return;
      if (blob.size < 200) {
        showError(chatError, "Aufnahme war zu kurz.");
        return;
      }
      try {
        const ext = (recordMime || "").includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice.${ext}`, { type: blob.type || "audio/webm" });
        const saved = await uploadFile("voice", file, { durationMs });
        await emitMessage({ type: "voice", uploadId: saved.id, transcript: voiceTranscript });
        voiceTranscript = "";
      } catch (err) {
        showError(chatError, err.message);
      }
    };

    if (recorder.state !== "inactive") recorder.stop();
    else recorder.onstop();
  }

  async function startRecording() {
    showError(chatError, "");
    setAttachTray(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showError(chatError, "Sprachnachrichten werden von diesem Browser nicht unterstützt.");
      return;
    }
    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordMime = pickRecorderMime();
      mediaRecorder = recordMime
        ? new MediaRecorder(recordStream, { mimeType: recordMime })
        : new MediaRecorder(recordStream);
      recordChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) recordChunks.push(event.data);
      };
      mediaRecorder.start(250);
      recordStartedAt = Date.now();
      recordBar.classList.remove("hidden");
      recordBar.classList.add("flex");
      recordTimer.textContent = "0:00";
      btnAttachVoice.disabled = true;
      recordInterval = window.setInterval(() => {
        recordTimer.textContent = formatDuration(Date.now() - recordStartedAt);
      }, 200);
      recordStopTimer = window.setTimeout(() => stopRecording(true), MAX_VOICE_MS);
      startVoiceTranscript();
    } catch {
      stopTracks();
      showError(chatError, "Mikrofonzugriff wurde verweigert oder ist nicht verfügbar.");
    }
  }

  function startVoiceTranscript() {
    voiceTranscript = "";
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    try {
      const rec = new Speech();
      rec.lang = "de-DE";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        voiceTranscript = text.trim();
      };
      rec.start();
      recordStream._speech = rec;
    } catch {
      // Web Speech ist optional.
    }
  }

  async function handleFilePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    showError(chatError, "");
    btnAttachFile.disabled = true;
    try {
      const saved = await uploadFile("file", file);
      const caption = messageInput.value.trim();
      await emitMessage({ type: "file", uploadId: saved.id, content: caption });
      if (caption) messageInput.value = "";
    } catch (err) {
      showError(chatError, err.message);
    } finally {
      btnAttachFile.disabled = false;
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    showError(profileError, "");
    showError(profileOk, "");
    profileSubmit.disabled = true;

    try {
      if (profileAvatarFile.files?.[0]) {
        const form = new FormData();
        form.append("file", profileAvatarFile.files[0]);
        currentUser = await api("/api/me/avatar", { method: "POST", body: form });
        profileAvatarFile.value = "";
        profileAvatarUrl.value = currentUser.avatarUrl || "";
      }

      currentUser = await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          realName: profileRealname.value,
          avatarUrl: profileAvatarUrl.value.trim(),
          theme: uiPrefs.theme,
          bubbleOwn: uiPrefs.bubbleOwn || "",
          bubblePeer: uiPrefs.bubblePeer || "",
        }),
      });
      window.clearTimeout(uiSaveTimer);
      if (currentUser.ui) {
        uiPrefs = normalizeUi(currentUser.ui);
        saveUiPrefsLocal();
      }
      applyUi();
      refreshSelfUi();
      showError(profileOk, "Profil gespeichert.");
    } catch (err) {
      showError(profileError, err.message);
    } finally {
      profileSubmit.disabled = false;
    }
  }

  function setSearchPanel(open) {
    setOverlay(searchOverlay, open);
    if (open) {
      showError(searchError, "");
      searchQuery.focus();
    }
  }

  function setChatMenu(open) {
    setOverlay(chatMenuOverlay, open);
    btnChatMenu.setAttribute("aria-expanded", String(open));
    const conv = activeConversation();
    const isGroup = Boolean(conv && conv.type === "group");
    groupTools.classList.toggle("hidden", !isGroup);
    groupTools.classList.toggle("flex", isGroup);
    if (isGroup) groupTitle.value = conv.title || "";
    if (summaryBox) {
      summaryBox.classList.add("hidden");
      summaryBox.textContent = "";
    }
    if (aiHint && aiStatus) {
      aiHint.textContent = aiStatus.enabled
        ? "Sprachmodell ist aktiv. Kurzfassung und Vorschläge können vom Modell kommen."
        : "Kurzfassung und Antwortvorschläge laufen lokal. Mit AI_ENABLED und AI_API_KEY in der .env übernimmt ein Modell.";
    }
    refreshNotifyButtons();
  }

  function markCurrentUnread() {
    if (!socket) return;
    socket.emit("conversation:unread", { conversationId: activeConversationId }, (ack) => {
      if (!ack?.ok) {
        showError(chatError, ack?.error || "Konnte nicht als ungelesen markiert werden.");
        return;
      }
      applyUnread({ conversationId: activeConversationId, unreadCount: ack.unreadCount });
      setChatMenu(false);
    });
  }

  async function runMessageSearch() {
    const q = searchQuery.value.trim();
    showError(searchError, "");
    searchResults.replaceChildren();
    if (q.length < 2) return;
    try {
      const params = new URLSearchParams({ q });
      if (searchCurrentOnly.checked) {
        params.set("conversationId", activeConversationId == null ? "global" : String(activeConversationId));
      }
      const data = await api(`/api/search?${params.toString()}`);
      const results = data.results || [];
      if (!results.length) {
        searchResults.append(el("li", "px-2 py-3 text-sm text-muted-foreground", "Keine Treffer."));
        return;
      }
      for (const item of results) {
        const message = item.message;
        const li = el("li", "");
        const btn = el(
          "button",
          "flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left whitespace-normal hover:bg-muted"
        );
        btn.type = "button";
        btn.append(
          el("span", "text-xs text-primary", item.roomLabel || "Chat"),
          el("span", "text-sm font-medium text-foreground", displayName(message)),
          el("span", "line-clamp-2 break-words text-sm text-muted-foreground", previewText(message)),
          el("span", "text-xs text-muted-foreground", formatTime(message.createdAt))
        );
        btn.addEventListener("click", async () => {
          setSearchPanel(false);
          await openConversation(message.conversationId ?? null);
          window.setTimeout(() => scrollToMessage(message.id), 80);
        });
        li.append(btn);
        searchResults.append(li);
      }
    } catch (err) {
      showError(searchError, err.message);
    }
  }

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));
  tabAdmin.addEventListener("click", () => setAuthMode("admin"));
  formAuth.addEventListener("submit", handleAuthSubmit);
  formMessage.addEventListener("submit", handleSend);
  btnLogout.addEventListener("click", handleLogout);
  btnAdmin.addEventListener("click", showAdmin);
  btnAdminChat.addEventListener("click", showChat);
  btnAdminLogout.addEventListener("click", handleLogout);
  tabAdminPending.addEventListener("click", () => setAdminFilter("pending"));
  tabAdminAll.addEventListener("click", () => setAdminFilter("all"));
  btnBack.addEventListener("click", closeThread);
  btnNewChat.addEventListener("click", () => setNewChatPanel(true));
  btnNewChatClose.addEventListener("click", () => setNewChatPanel(false));
  newChatBackdrop.addEventListener("click", () => setNewChatPanel(false));
  btnMore.addEventListener("click", () => setMorePanel(true));
  btnMoreClose.addEventListener("click", () => setMorePanel(false));
  moreBackdrop.addEventListener("click", () => setMorePanel(false));
  navMore.addEventListener("click", () => setMorePanel(true));
  navChats.addEventListener("click", () => setListTab("chats"));
  navContacts.addEventListener("click", () => setListTab("contacts"));
  tabListChats.addEventListener("click", () => setListTab("chats"));
  tabListContacts.addEventListener("click", () => setListTab("contacts"));
  btnProfile.addEventListener("click", () => {
    setMorePanel(false);
    setProfilePanel(true);
  });
  btnProfileClose.addEventListener("click", () => setProfilePanel(false));
  profileBackdrop.addEventListener("click", () => setProfilePanel(false));
  formProfile.addEventListener("submit", handleProfileSubmit);
  document.querySelectorAll(".theme-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      setThemePreference(btn.getAttribute("data-theme"));
    });
  });
  function onBubbleColorInput(kind, input) {
    if (!input) return;
    input.addEventListener("input", () => {
      const hex = String(input.value || "").toLowerCase();
      if (!HEX_COLOR.test(hex)) return;
      if (kind === "own") uiPrefs.bubbleOwn = hex;
      else uiPrefs.bubblePeer = hex;
      scheduleUiPersist();
    });
  }
  onBubbleColorInput("own", bubbleOwnInput);
  onBubbleColorInput("peer", bubblePeerInput);
  btnBubbleReset?.addEventListener("click", () => {
    uiPrefs.bubbleOwn = null;
    uiPrefs.bubblePeer = null;
    scheduleUiPersist();
  });
  btnAttach.addEventListener("click", () => setAttachTray(attachTray.hidden));
  messageList.addEventListener("click", () => setAttachTray(false));
  btnAttachImage.addEventListener("click", () => {
    setAttachTray(false);
    inputImage.click();
  });
  inputImage.addEventListener("change", handleImagePicked);
  btnAttachFile.addEventListener("click", () => {
    setAttachTray(false);
    inputFile.click();
  });
  inputFile.addEventListener("change", handleFilePicked);
  btnAttachLocation.addEventListener("click", () => {
    setAttachTray(false);
    handleLocation();
  });
  btnAttachVoice.addEventListener("click", startRecording);
  btnRecordCancel.addEventListener("click", () => stopRecording(false));
  btnRecordSend.addEventListener("click", () => stopRecording(true));
  btnReplyCancel.addEventListener("click", () => setReplyTarget(null));
  btnSearch.addEventListener("click", () => setSearchPanel(true));
  btnSearchClose.addEventListener("click", () => setSearchPanel(false));
  searchBackdrop.addEventListener("click", () => setSearchPanel(false));
  btnChatMenu.addEventListener("click", () => setChatMenu(true));
  btnChatMenuClose.addEventListener("click", () => setChatMenu(false));
  chatMenuBackdrop.addEventListener("click", () => setChatMenu(false));
  btnMarkUnread.addEventListener("click", markCurrentUnread);
  btnSummarize.addEventListener("click", async () => {
    showError(chatError, "");
    btnSummarize.disabled = true;
    try {
      const data = await api("/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ conversationId: activeConversationId }),
      });
      summaryBox.textContent = data.summary || "Keine Zusammenfassung.";
      summaryBox.classList.remove("hidden");
    } catch (err) {
      showError(chatError, err.message);
    } finally {
      btnSummarize.disabled = false;
    }
  });
  btnNotify.addEventListener("click", togglePush);
  if (btnNotifyMore) btnNotifyMore.addEventListener("click", togglePush);
  btnGroupTitle.addEventListener("click", async () => {
    try {
      const conv = await api(`/api/conversations/${activeConversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: groupTitle.value }),
      });
      upsertConversation(conv);
      updateRoomHeader();
    } catch (err) {
      showError(chatError, err.message);
    }
  });
  btnGroupAdd.addEventListener("click", async () => {
    try {
      const conv = await api(`/api/conversations/${activeConversationId}/members`, {
        method: "POST",
        body: JSON.stringify({ username: groupAddUser.value.trim() }),
      });
      groupAddUser.value = "";
      upsertConversation(conv);
      updateRoomHeader();
    } catch (err) {
      showError(chatError, err.message);
    }
  });
  btnGroupLeave.addEventListener("click", async () => {
    try {
      await api(`/api/conversations/${activeConversationId}/members/me`, { method: "DELETE" });
      setChatMenu(false);
    } catch (err) {
      showError(chatError, err.message);
    }
  });
  btnForwardClose.addEventListener("click", () => setForwardPanel(false));
  forwardBackdrop.addEventListener("click", () => setForwardPanel(false));
  messageMenuBackdrop.addEventListener("click", () => {
    if (Date.now() < ignoreMenuClickUntil) return;
    hideMessageMenu();
  });
  messageInput.addEventListener("input", () => {
    if (messageInput.value.trim()) scheduleTyping();
    else if (typingSent) emitTyping(false);
  });
  formSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    runMessageSearch();
  });
  searchQuery.addEventListener("input", () => {
    window.clearTimeout(msgSearchTimer);
    msgSearchTimer = window.setTimeout(runMessageSearch, 280);
  });
  searchCurrentOnly.addEventListener("change", runMessageSearch);
  document.addEventListener(
    "click",
    (event) => {
      if (Date.now() < ignoreMenuClickUntil) {
        if (messageMenu.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

  formUserSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    startConversationWith([...pickedUsers.keys()]);
  });
  userSearch.addEventListener("input", () => scheduleSearch(userSearch.value));
  userSearch.addEventListener("focus", () => scheduleSearch(userSearch.value));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (reactionPicker) hideReactionPicker();
    else if (messageMenuOverlay && !messageMenuOverlay.hidden) hideMessageMenu();
    else if (!forwardOverlay.hidden) setForwardPanel(false);
    else if (!searchOverlay.hidden) setSearchPanel(false);
    else if (!chatMenuOverlay.hidden) setChatMenu(false);
    else if (!profileOverlay.hidden) setProfilePanel(false);
    else if (!newChatOverlay.hidden) setNewChatPanel(false);
    else if (!moreOverlay.hidden) setMorePanel(false);
    else if (attachTray && !attachTray.hidden) setAttachTray(false);
    else if (replyTarget) setReplyTarget(null);
    else if (mediaRecorder) stopRecording(false);
    else if (chatSelected && !isWideLayout()) closeThread();
  });

  window.addEventListener("resize", updatePanes);
  document.addEventListener("visibilitychange", () => {
    if (!socket) return;
    if (document.hidden) {
      socket.emit("conversation:idle");
      return;
    }
    if (chatSelected) {
      socket.emit("conversation:focus");
    }
  });
  window.addEventListener("popstate", () => {
    if (chatSelected && !isWideLayout()) closeThread(true);
  });
  window.visualViewport?.addEventListener("resize", syncAppHeight);
  window.visualViewport?.addEventListener("scroll", syncAppHeight);
  window.addEventListener("resize", syncAppHeight);

  function syncAppHeight() {
    const viewport = window.visualViewport;
    const height = viewport ? Math.round(viewport.height) : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "open-conversation" && currentUser) {
        openConversation(event.data.conversationId ?? null);
      }
    });
  }

  syncAppHeight();
  setSendMode(false);
  setListTab("chats");
  setAuthMode("login");
  restoreSession();
})();
