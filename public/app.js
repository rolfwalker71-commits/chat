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
  const MAX_VIDEO_MS = 30_000;
  const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
  const PENDING_BANNER_TEXT =
    "Dein Konto wartet auf Freigabe durch einen Admin. Du kannst mitlesen, aber noch nichts senden.";
  const FILE_UUID = /^[0-9a-f-]{36}$/i;
  const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];
  const UI_STORAGE_KEY = "raum-ui";
  const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
  const BUBBLE_DEFAULTS = {
    light: { own: "#fef3c7", peer: "#e0f2fe" },
    dark: { own: "#3d5a66", peer: "#2d3440" },
  };

  const viewAuth = document.getElementById("view-auth");
  const viewChat = document.getElementById("view-chat");
  const formAuth = document.getElementById("form-auth");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const tabAdmin = document.getElementById("tab-admin");
  const wrapPasswordConfirm = document.getElementById("wrap-password-confirm");
  const wrapResetCode = document.getElementById("wrap-reset-code");
  const inputUsername = document.getElementById("username");
  const inputPassword = document.getElementById("password");
  const inputPasswordConfirm = document.getElementById("password-confirm");
  const inputResetCode = document.getElementById("reset-code");
  const labelPassword = document.getElementById("label-password");
  const authForgot = document.getElementById("auth-forgot");
  const authResetBack = document.getElementById("auth-reset-back");
  const authError = document.getElementById("auth-error");
  const authSubmit = document.getElementById("auth-submit");
  const labelUsername = document.getElementById("label-username");
  const headerAvatar = document.getElementById("header-avatar");
  const roomTitle = document.getElementById("room-title");
  const formMessage = document.getElementById("form-message");
  const messageInput = document.getElementById("message-input");
  const mentionSuggest = document.getElementById("mention-suggest");
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
  const adminOk = document.getElementById("admin-ok");
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
  const newGroupTitleWrap = document.getElementById("new-group-title-wrap");
  const newGroupTitle = document.getElementById("new-group-title");
  const newChatError = document.getElementById("new-chat-error");
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
  const profilePasswordCurrent = document.getElementById("profile-password-current");
  const profilePasswordNew = document.getElementById("profile-password-new");
  const profilePasswordConfirm = document.getElementById("profile-password-confirm");
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
  const btnAttachVideo = document.getElementById("btn-attach-video");
  const inputVideo = document.getElementById("input-video");
  const btnAttachPoll = document.getElementById("btn-attach-poll");
  const btnSummarize = document.getElementById("btn-summarize");
  const btnNotify = document.getElementById("btn-notify");
  const btnNotifyMore = document.getElementById("btn-notify-more");
  const btnMuteChat = document.getElementById("btn-mute-chat");
  const btnChatMedia = document.getElementById("btn-chat-media");
  const btnBlockUser = document.getElementById("btn-block-user");
  const btnStarred = document.getElementById("btn-starred");
  const mediaOverlay = document.getElementById("media-overlay");
  const mediaBackdrop = document.getElementById("media-backdrop");
  const btnMediaClose = document.getElementById("btn-media-close");
  const mediaList = document.getElementById("media-list");
  const mediaEmpty = document.getElementById("media-empty");
  const starredOverlay = document.getElementById("starred-overlay");
  const starredBackdrop = document.getElementById("starred-backdrop");
  const btnStarredClose = document.getElementById("btn-starred-close");
  const starredList = document.getElementById("starred-list");
  const pollOverlay = document.getElementById("poll-overlay");
  const pollBackdrop = document.getElementById("poll-backdrop");
  const btnPollClose = document.getElementById("btn-poll-close");
  const formPoll = document.getElementById("form-poll");
  const pollQuestion = document.getElementById("poll-question");
  const pollOptions = document.getElementById("poll-options");
  const btnPollAdd = document.getElementById("btn-poll-add");
  const pollError = document.getElementById("poll-error");
  const btnPollSend = document.getElementById("btn-poll-send");
  const btnAttachEnroute = document.getElementById("btn-attach-enroute");
  const enrouteOverlay = document.getElementById("enroute-overlay");
  const enrouteBackdrop = document.getElementById("enroute-backdrop");
  const btnEnrouteClose = document.getElementById("btn-enroute-close");
  const formEnroute = document.getElementById("form-enroute");
  const enrouteDestination = document.getElementById("enroute-destination");
  const enrouteError = document.getElementById("enroute-error");
  const btnEnrouteSend = document.getElementById("btn-enroute-send");
  const groupTools = document.getElementById("group-tools");
  const groupTitle = document.getElementById("group-title");
  const btnGroupTitle = document.getElementById("btn-group-title");
  const groupAddUser = document.getElementById("group-add-user");
  const btnGroupAdd = document.getElementById("btn-group-add");
  const btnGroupLeave = document.getElementById("btn-group-leave");
  const groupAvatarPreview = document.getElementById("group-avatar-preview");
  const groupAdminAvatar = document.getElementById("group-admin-avatar");
  const groupAvatarFile = document.getElementById("group-avatar-file");
  const btnGroupAvatarClear = document.getElementById("btn-group-avatar-clear");
  const groupAvatarHint = document.getElementById("group-avatar-hint");
  const groupMembers = document.getElementById("group-members");
  const groupAdminFields = document.getElementById("group-admin-fields");
  const groupAdminHint = document.getElementById("group-admin-hint");
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

  /** @type {"login" | "register" | "admin" | "reset"} */
  let authMode = "login";
  let mentionIndex = -1;
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
  let openSwipeEl = null;
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

  function appendMentionText(parent, content, mentions) {
    const names = new Set((mentions || []).map((item) => String(item.username || "").toLowerCase()));
    const str = String(content || "");
    const re = /(@[a-zA-Z0-9_]{3,32})/g;
    let last = 0;
    let match;
    while ((match = re.exec(str))) {
      if (match.index > last) parent.append(document.createTextNode(str.slice(last, match.index)));
      const token = match[1];
      const uname = token.slice(1).toLowerCase();
      const hit = names.has(uname);
      const mine = Boolean(currentUser && uname === String(currentUser.username || "").toLowerCase());
      const span = el(
        "span",
        hit ? (mine ? "rounded-sm bg-primary/15 font-semibold text-primary" : "font-semibold text-primary") : "",
        token
      );
      parent.append(span);
      last = match.index + token.length;
    }
    if (last < str.length) parent.append(document.createTextNode(str.slice(last)));
  }

  function appendMessageText(parent, message, className) {
    const p = el("p", className);
    appendMentionText(p, message.content || "", message.mentions);
    parent.append(p);
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
      themeColorMeta.setAttribute("content", hex || (dark ? "#1e1b18" : "#fffbf5"));
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
    const isReset = mode === "reset";
    const needsNewPassword = isRegister || isReset;

    tabLogin.setAttribute("aria-selected", String(mode === "login"));
    tabRegister.setAttribute("aria-selected", String(isRegister));
    tabAdmin.setAttribute("aria-selected", String(isAdminLogin));

    tabLogin.className = pillClass(mode === "login");
    tabRegister.className = pillClass(isRegister);
    tabAdmin.className = pillClass(isAdminLogin);

    wrapPasswordConfirm.classList.toggle("hidden", !needsNewPassword);
    wrapPasswordConfirm.classList.toggle("flex", needsNewPassword);
    inputPasswordConfirm.required = needsNewPassword;
    wrapResetCode.classList.toggle("hidden", !isReset);
    wrapResetCode.classList.toggle("flex", isReset);
    inputResetCode.required = isReset;
    if (labelPassword) {
      labelPassword.textContent = isReset ? "Neues Passwort" : "Passwort";
    }
    inputPassword.autocomplete = needsNewPassword ? "new-password" : "current-password";
    authForgot.classList.toggle("hidden", mode !== "login");
    authResetBack.classList.toggle("hidden", !isReset);
    authResetBack.classList.toggle("inline-flex", isReset);
    authSubmit.textContent = isRegister
      ? "Konto anlegen"
      : isAdminLogin
        ? "Als Admin anmelden"
        : isReset
          ? "Neues Passwort setzen"
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
      "flex h-auto min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-muted py-1.5 text-foreground";
    const navOff =
      "flex h-auto min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-muted-foreground hover:bg-muted/70";
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

  function setComposerLocked(locked, { lockSearch = true } = {}) {
    formMessage.classList.toggle("hidden", locked);
    pendingBanner.classList.toggle("hidden", !locked);
    if (lockSearch && locked) {
      formUserSearch.classList.add("pointer-events-none", "opacity-50");
    } else {
      formUserSearch.classList.remove("pointer-events-none", "opacity-50");
    }
    if (locked) setAttachTray(false);
  }

  function refreshComposerLock() {
    if (!canPost()) {
      pendingBanner.textContent = PENDING_BANNER_TEXT;
      setComposerLocked(true);
      return;
    }
    const conv = activeConversation();
    if (conv?.type === "dm" && (conv.blockedByMe || conv.blockedMe)) {
      pendingBanner.textContent = conv.blockedByMe
        ? "Du hast diese Person blockiert. Nachrichten sind aus. Entsperren im Chat-Menü."
        : "Diese Person hat dich blockiert. Nachrichten sind nicht möglich.";
      setComposerLocked(true, { lockSearch: false });
      return;
    }
    pendingBanner.textContent = PENDING_BANNER_TEXT;
    setComposerLocked(false);
  }

  function setAttachTray(open) {
    refreshAttachTray();
    attachTray.classList.toggle("hidden", !open);
    attachTray.hidden = !open;
    btnAttach.setAttribute("aria-expanded", String(open));
    btnAttach.setAttribute("aria-label", open ? "Anhang schließen" : "Anhang hinzufügen");
  }

  function refreshAttachTray() {
    if (!btnAttachPoll) return;
    const isGroup = activeConversation()?.type === "group";
    btnAttachPoll.classList.toggle("hidden", !isGroup);
    btnAttachPoll.classList.toggle("flex", isGroup);
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
    refreshComposerLock();
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

    let response;
    try {
      response = await fetch(path, {
        credentials: "same-origin",
        ...options,
        headers,
      });
    } catch {
      throw new Error("Server nicht erreichbar. Bitte neu laden oder den Chat-Dienst starten.");
    }

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
    if ((authMode === "register" || authMode === "reset") && password !== inputPasswordConfirm.value) {
      showError(authError, "Die Passwörter stimmen nicht überein.");
      return;
    }
    if (authMode === "reset" && !inputResetCode.value.trim()) {
      showError(authError, "Bitte den Reset-Code eingeben.");
      return;
    }

    authSubmit.disabled = true;
    authSubmit.textContent =
      authMode === "register"
        ? "Konto wird angelegt…"
        : authMode === "admin"
          ? "Admin-Anmeldung…"
          : authMode === "reset"
            ? "Passwort wird gesetzt…"
            : "Anmeldung…";

    try {
      if (authMode === "reset") {
        currentUser = await api("/api/password/reset", {
          method: "POST",
          body: JSON.stringify({
            username,
            code: inputResetCode.value.trim(),
            newPassword: password,
          }),
        });
      } else {
        const path = authMode === "register" ? "/api/register" : "/api/login";
        const body = { username, password };
        if (authMode === "admin") body.admin = true;
        currentUser = await api(path, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
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
        authMode === "register"
          ? "Konto anlegen"
          : authMode === "admin"
            ? "Als Admin anmelden"
            : authMode === "reset"
              ? "Neues Passwort setzen"
              : "Anmelden";
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
      if (user.resetCode) {
        text.append(
          el(
            "p",
            "mt-2 break-all rounded-xl bg-muted px-3 py-2 font-mono text-sm text-foreground",
            `Code ${user.resetCode} — 30 Min gültig`
          )
        );
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
      const resetBtn = el(
        "button",
        "inline-flex h-11 min-h-11 items-center rounded-xl px-3 text-sm font-medium ring-1 ring-border hover:bg-muted",
        "Reset-Code"
      );
      resetBtn.type = "button";
      resetBtn.addEventListener("click", () => issueResetCode(user));
      actions.append(resetBtn);
      item.append(avatar, text, actions);
      adminUserList.append(item);
    }
  }

  async function loadAdminUsers() {
    if (!currentUser?.isAdmin) return;
    showError(adminError, "");
    showError(adminOk, "");
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
    showError(adminOk, "");
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

  async function issueResetCode(user) {
    showError(adminError, "");
    showError(adminOk, "");
    try {
      const data = await api(`/api/admin/users/${user.id}/reset-code`, { method: "POST" });
      const code = String(data.code || "");
      adminUsers = adminUsers.map((item) =>
        item.id === user.id ? { ...item, resetCode: code, resetExpiresAt: data.expiresAt } : item
      );
      renderAdminUsers();
      try {
        await navigator.clipboard.writeText(code);
        showError(adminOk, `Reset-Code für @${user.username} kopiert: ${code}`);
      } catch {
        showError(adminOk, `Reset-Code für @${user.username}: ${code}`);
      }
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

  function formatEta(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return "";
    }
  }

  function previewText(message) {
    if (!message) return "";
    if (message.deleted) return "Nachricht gelöscht";
    const type = message.type || "text";
    if (type === "image") return "Bild";
    if (type === "voice") return "Sprachnachricht";
    if (type === "location") return "Standort";
    if (type === "file") return message.file?.name || "Datei";
    if (type === "video") return "Video";
    if (type === "poll") return "Umfrage";
    if (type === "enroute") {
      const dest = message.trip?.destination || message.content || "";
      return dest.startsWith("Unterwegs") ? dest : dest ? `Unterwegs nach ${dest}` : "Unterwegs";
    }
    if (type === "deleted") return "Nachricht gelöscht";
    return message.content || "";
  }

  function activeConversation() {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }

  function receiptStatus(message, conv) {
    if (!currentUser || !message || message.deleted) return null;
    if (message.userId !== currentUser.id) return null;
    const room = conv || activeConversation();
    if (!room || room.type !== "dm") return null;
    const id = Number(message.id);
    const readAt = Number(room.peerLastReadMessageId) || 0;
    const deliveredAt = Math.max(Number(room.peerLastDeliveredMessageId) || 0, readAt);
    if (id && readAt >= id) return "read";
    if (id && deliveredAt >= id) return "delivered";
    return "sent";
  }

  function receiptAria(status) {
    if (status === "read") return "Gelesen";
    if (status === "delivered") return "Zugestellt";
    if (status === "sent") return "Gesendet";
    return "";
  }

  function ticksSvg(double) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "h-3.5 w-4 shrink-0");
    svg.setAttribute("viewBox", "0 0 16 12");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const first = document.createElementNS("http://www.w3.org/2000/svg", "path");
    first.setAttribute("d", double ? "M1.5 6.5 4 9 9 2.5" : "M2.5 6.5 6 10 13.5 2.5");
    svg.append(first);
    if (double) {
      const second = document.createElementNS("http://www.w3.org/2000/svg", "path");
      second.setAttribute("d", "M6.5 6.5 9 9 14.5 2.5");
      svg.append(second);
    }
    return svg;
  }

  function receiptTicks(status) {
    const wrap = el("span", status === "read" ? "inline-flex text-primary" : "inline-flex opacity-70");
    wrap.setAttribute("data-receipt", "");
    wrap.setAttribute("data-receipt-status", status || "");
    wrap.setAttribute("aria-label", receiptAria(status));
    wrap.setAttribute("title", receiptAria(status));
    if (status) wrap.append(ticksSvg(status !== "sent"));
    return wrap;
  }

  function applyReceiptNode(node, status) {
    if (!node) return;
    node.replaceChildren();
    if (!status) {
      node.classList.add("hidden");
      node.removeAttribute("aria-label");
      node.removeAttribute("title");
      return;
    }
    node.classList.remove("hidden");
    node.className = status === "read" ? "inline-flex text-primary" : "inline-flex opacity-70";
    node.setAttribute("data-receipt", "");
    node.setAttribute("data-receipt-status", status);
    node.setAttribute("aria-label", receiptAria(status));
    node.setAttribute("title", receiptAria(status));
    node.append(ticksSvg(status !== "sent"));
  }

  function refreshReceipts() {
    for (const row of messageList.querySelectorAll("article[data-message-id]")) {
      const id = Number(row.getAttribute("data-message-id"));
      const message = messagesById.get(id);
      const node = row.querySelector("[data-receipt]");
      if (!message || !node) continue;
      applyReceiptNode(node, receiptStatus(message));
    }
  }

  function lastSeenLabel(user) {
    if (!user) return "";
    if (user.isBot) return "Assistent";
    if (onlineIds.has(user.id)) return "online";
    if (!user.lastSeenAt) return "Zuletzt online: unbekannt";
    return `Zuletzt online: ${formatTime(user.lastSeenAt)}`;
  }

  function roomStatusText(conv) {
    if (!conv) return "";
    if (conv.type === "dm" && conv.peer) return lastSeenLabel(conv.peer);
    if (conv.type === "group") {
      const n = (conv.members || []).length;
      const admin = (conv.members || []).find((member) => member.isAdmin || member.id === conv.adminUserId);
      const adminName = admin ? displayName(admin) : "";
      return adminName ? `${n} Mitglieder · Leitung: ${adminName}` : `${n} Mitglieder`;
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
    const targets = conversations.filter((conv) => !isAssistantConversation(conv));
    if (!targets.length) {
      forwardTargets.append(el("li", "px-3 py-3 text-sm text-muted-foreground", "Keine Chats zum Weiterleiten."));
      setForwardPanel(true);
      return;
    }
    for (const conv of targets) {
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
    if (raw === "global") return undefined;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  }

  function notifyIncoming(message) {
    if (notifyPermission !== "granted") return;
    if (!message || (currentUser && message.userId === currentUser.id)) return;
    if (message.conversationId == null) return;
    if (!document.hidden && sameRoom(message.conversationId ?? null)) return;
    if (document.hidden && pushSubscribed) return;
    const conv = conversations.find((c) => c.id === message.conversationId);
    if (conv?.muted) return;
    try {
      const n = new Notification(displayName(message) || "Neue Nachricht", {
        body: previewText(message).slice(0, 80),
        tag: `chat-${message.conversationId || "global"}`,
        icon: "/icons/pwa-192.png",
      });
      n.addEventListener("click", () => {
        window.focus();
        openConversation(message.conversationId);
      });
    } catch {
      // Browser kann Notifications stillschweigend ablehnen.
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
    return Boolean(target && target.closest && target.closest("audio, video, a, input, textarea, button, select"));
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
      items.push({
        label: message.starred ? "Nicht mehr merken" : "Merken",
        run: () => toggleStar(message),
      });
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

  function isSafeHttpUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function appendLinkPreview(bubble, message) {
    const preview = message.linkPreview;
    if (!preview?.url || !isSafeHttpUrl(preview.url)) return;
    const card = document.createElement("a");
    card.href = preview.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.className = "mt-2 block overflow-hidden rounded-xl ring-1 ring-border hover:bg-background/60";
    if (preview.image && isSafeHttpUrl(preview.image)) {
      const img = document.createElement("img");
      img.src = preview.image;
      img.alt = "";
      img.className = "max-h-40 w-full object-cover";
      card.append(img);
    }
    const body = el("div", "p-3");
    body.append(el("p", "text-sm font-medium leading-snug", preview.title || preview.url));
    if (preview.description) {
      body.append(el("p", "mt-1 line-clamp-2 text-xs text-muted-foreground", preview.description));
    }
    card.append(body);
    bubble.append(card);
  }

  function appendPoll(bubble, message) {
    const poll = message.poll;
    const options = poll.options || [];
    const total = options.reduce((sum, opt) => sum + (Number(opt.votes) || 0), 0);
    bubble.append(el("p", "text-sm font-semibold leading-snug", poll.question || message.content || "Umfrage"));
    for (const opt of options) {
      const votes = Number(opt.votes) || 0;
      const pct = total ? Math.round((100 * votes) / total) : 0;
      const btn = el(
        "button",
        `relative mt-2 flex min-h-11 w-full overflow-hidden rounded-xl text-left ring-1 ${
          opt.mine ? "ring-primary" : "ring-border"
        }`
      );
      btn.type = "button";
      const bar = el("span", "absolute inset-y-0 left-0 bg-primary/20");
      bar.style.width = `${pct}%`;
      const label = el("span", "relative z-10 flex w-full items-center justify-between gap-3 px-3 py-2 text-sm");
      label.append(el("span", "min-w-0 break-words", opt.label || ""), el("span", "shrink-0 tabular-nums text-muted-foreground", `${votes}`));
      btn.append(bar, label);
      btn.setAttribute("aria-pressed", String(Boolean(opt.mine)));
      btn.disabled = !canPost();
      btn.addEventListener("click", () => votePoll(opt.id));
      bubble.append(btn);
    }
    if (total) {
      bubble.append(el("p", "mt-2 text-xs text-muted-foreground", `${total} Stimme${total === 1 ? "" : "n"}`));
    }
  }

  function votePoll(optionId) {
    if (!socket || !optionId) return;
    socket.emit("poll:vote", { optionId }, (ack) => {
      if (!ack?.ok) showError(chatError, ack?.error || "Stimme fehlgeschlagen.");
    });
  }

  function applyPollUpdate(payload) {
    if (!payload?.messageId) return;
    const message = messagesById.get(payload.messageId);
    if (!message?.poll) return;
    const mineKeep = message.poll.options.find((opt) => opt.mine)?.id;
    message.poll.options = (payload.options || []).map((opt) => ({
      ...opt,
      mine:
        currentUser && payload.voterId === currentUser.id
          ? Boolean(payload.selected && opt.id === payload.optionId)
          : opt.id === mineKeep,
    }));
    messagesById.set(message.id, message);
    if (sameRoom(message.conversationId ?? null)) replaceMessageRow(message);
  }

  async function toggleStar(message) {
    if (!message?.id) return;
    try {
      const data = await api(`/api/messages/${message.id}/star`, { method: "POST" });
      message.starred = Boolean(data.starred);
      messagesById.set(message.id, message);
      if (sameRoom(message.conversationId ?? null)) replaceMessageRow(message);
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function iconSvg(paths, filled, sizeClass) {
    const svg = svgIcon(paths[0], filled);
    svg.setAttribute("class", sizeClass || "h-3.5 w-3.5");
    for (const d of paths.slice(1)) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      svg.append(path);
    }
    return svg;
  }

  function statusMark(label, paths, colorClass, filled) {
    const mark = el("span", `inline-flex ${colorClass}`);
    mark.setAttribute("title", label);
    mark.setAttribute("aria-label", label);
    mark.append(iconSvg(paths, filled, "h-3.5 w-3.5"));
    return mark;
  }

  function appendMessageStatusBadges(bubble, message) {
    const badges = [];
    if (message.starred) {
      badges.push(
        statusMark(
          "Gemerkt",
          ["M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z", "M16 3v5h5"],
          "text-primary"
        )
      );
    }
    if (message.editedAt) {
      badges.push(
        statusMark(
          "Bearbeitet",
          ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
          "text-muted-foreground"
        )
      );
    }
    if (!badges.length) return;
    bubble.classList.add("pr-8");
    const cluster = el(
      "span",
      "pointer-events-none absolute right-2 top-2 flex items-center gap-0.5"
    );
    for (const badge of badges) cluster.append(badge);
    bubble.append(cluster);
  }

  function buildMessageRow(message) {
    const mine = currentUser && message.userId === currentUser.id;
    const row = el("article", `group relative flex gap-2 ${mine ? "justify-end" : "justify-start"}`);
    row.setAttribute("data-message-id", String(message.id ?? ""));

    const showPeerAvatar =
      !mine && (activeConversationId == null || activeConversation()?.type === "group");
    const avatar = el("div", "");
    if (showPeerAvatar) fillAvatar(avatar, message, "h-8 w-8 mt-1");

    const col = el("div", "flex w-[min(36rem,80%)] shrink-0 flex-col");

    const bubble = el(
      "div",
      `relative w-full px-3 py-2 leading-snug ${
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
          appendMessageText(bubble, message, "mt-2 break-words text-sm");
        }
      } else if (type === "voice" && message.file?.id && FILE_UUID.test(message.file.id)) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.className = "mt-1 w-full";
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
      } else if (type === "enroute") {
        const trip = message.trip || {};
        const dest = trip.destination || message.content || "Ziel";
        const card = el("div", "mt-1 rounded-xl bg-background/60 p-3 ring-1 ring-border");
        card.append(el("p", "text-sm font-medium", "Unterwegs nach"));
        card.append(el("p", "mt-1 break-words text-sm leading-snug text-foreground", dest.replace(/^Unterwegs nach\s+/i, "")));
        const eta = formatEta(trip.etaAt);
        const mins = Number(trip.durationMin);
        const estimate = [];
        if (eta) estimate.push(`Ankunft ca. ${eta}`);
        if (Number.isFinite(mins) && mins > 0) estimate.push(`${mins} Min`);
        if (estimate.length) {
          card.append(el("p", "mt-1 text-sm text-muted-foreground", estimate.join(" · ")));
          card.append(
            el("p", "mt-1 text-xs text-muted-foreground", "Schätzung beim Senden, ohne Live-Aktualisierung")
          );
        }
        const destLat = Number(trip.destLat);
        const destLng = Number(trip.destLng);
        if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
          const link = document.createElement("a");
          link.href = osmUrl(destLat, destLng);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className =
            "mt-3 inline-flex h-11 min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-110";
          link.textContent = "Ziel in OpenStreetMap";
          card.append(link);
        }
        bubble.append(card);
      } else if (type === "video" && message.file?.id && FILE_UUID.test(message.file.id)) {
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.className = "mt-1 max-h-72 w-full rounded-xl bg-black";
        video.src = `/api/files/${message.file.id}`;
        bubble.append(video);
        if (message.file.durationMs) {
          bubble.append(
            el("p", "mt-1 text-xs text-muted-foreground", formatDuration(message.file.durationMs))
          );
        }
        if (message.content && message.content !== "Video") {
          appendMessageText(bubble, message, "mt-2 break-words text-sm");
        }
      } else if (type === "poll" && message.poll) {
        appendPoll(bubble, message);
      } else {
        appendMessageText(bubble, message, "break-words whitespace-pre-wrap text-sm sm:text-base");
        appendLinkPreview(bubble, message);
      }
      appendMessageStatusBadges(bubble, message);
    }

    const foot = el("span", "mt-1 flex items-center justify-end gap-1");
    foot.append(
      el("time", "text-[0.7rem] leading-none", formatListTime(message.createdAt))
    );
    const status = receiptStatus(message);
    if (mine && (status || activeConversation()?.type === "dm") && !message.deleted) {
      foot.append(receiptTicks(status || "sent"));
    }
    bubble.append(foot);

    col.append(bubble);

    if (!message.deleted) {
      bindMessageMenu(row, message, bubble);
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
    if (conv.title) return conv.title;
    const names = (conv.members || [])
      .filter((m) => !currentUser || m.id !== currentUser.id)
      .map(displayName);
    return names.length ? names.join(", ") : "Gruppe";
  }

  function conversationAvatarUser(conv) {
    if (conv?.type === "dm" && conv.peer) return conv.peer;
    return {
      username: conversationLabel(conv) || "Gruppe",
      realName: conversationLabel(conv) || "Gruppe",
      avatarUrl: conv?.avatarUrl || "",
    };
  }

  function applyConversationViewer(conv) {
    if (!conv || conv.type !== "group") return conv;
    conv.isAdmin = Boolean(currentUser && conv.adminUserId === currentUser.id);
    conv.members = (conv.members || []).map((member) => ({
      ...member,
      isAdmin: Boolean(conv.adminUserId && member.id === conv.adminUserId),
    }));
    return conv;
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
      refreshComposerLock();
      refreshAttachTray();
      return;
    }
    if (activeConversationId == null) {
      closeThread();
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    roomTitle.textContent = conversationLabel(conv);
    roomStatus.textContent = roomStatusText(conv);
    fillAvatar(threadAvatar, conversationAvatarUser(conv), "h-10 w-10");
    refreshComposerLock();
    refreshAttachTray();
  }

  function conversationRowClass(active) {
    return `conv-swipe-front${active ? " is-active" : ""}`;
  }

  function svgIcon(pathD, filled) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "h-5 w-5");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    if (filled) {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
    }
    svg.append(path);
    return svg;
  }

  function closeOpenSwipe() {
    if (!openSwipeEl) return;
    const front = openSwipeEl.querySelector(".conv-swipe-front");
    if (front) {
      front.style.transition = "transform 0.18s ease";
      front.style.transform = "translateX(0)";
    }
    openSwipeEl = null;
  }

  function bindConvSwipe(item, front) {
    const action = 88;
    const openAt = 56;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let horizontal = null;
    let moved = false;
    let pointerId = 0;

    const setX = (x, animate) => {
      dx = Math.max(-action, Math.min(action, x));
      front.style.transition = animate ? "transform 0.18s ease" : "none";
      front.style.transform = `translateX(${dx}px)`;
    };

    front.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (openSwipeEl && openSwipeEl !== item) closeOpenSwipe();
      startX = event.clientX;
      startY = event.clientY;
      tracking = true;
      horizontal = null;
      moved = false;
      pointerId = event.pointerId;
      try {
        front.setPointerCapture(pointerId);
      } catch {
        // Capture ist optional.
      }
    });

    front.addEventListener("pointermove", (event) => {
      if (!tracking || event.pointerId !== pointerId) return;
      const mx = event.clientX - startX;
      const my = event.clientY - startY;
      if (horizontal == null && Math.hypot(mx, my) > 8) {
        horizontal = Math.abs(mx) > Math.abs(my) * 1.2;
        if (!horizontal) {
          tracking = false;
          return;
        }
      }
      if (!horizontal) return;
      event.preventDefault();
      moved = true;
      setX(mx, false);
    });

    const endSwipe = (event) => {
      if (!tracking || (event && event.pointerId !== pointerId)) return;
      tracking = false;
      if (!moved) {
        if (openSwipeEl === item && dx !== 0) {
          setX(0, true);
          openSwipeEl = null;
        }
        return;
      }
      if (dx > openAt) {
        setX(action, true);
        openSwipeEl = item;
      } else if (dx < -openAt) {
        setX(-action, true);
        openSwipeEl = item;
      } else {
        setX(0, true);
        if (openSwipeEl === item) openSwipeEl = null;
      }
    };

    front.addEventListener("pointerup", endSwipe);
    front.addEventListener("pointercancel", endSwipe);
    front.addEventListener(
      "click",
      (event) => {
        if (!moved && !(openSwipeEl === item && dx !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        setX(0, true);
        openSwipeEl = null;
      },
      true
    );
  }

  function appendConversationRow({ title, preview, time, unread, avatarUser, active, onClick, pinned, muted, receipt, swipe }) {
    const item = el("li", active ? "conv-swipe is-selected" : "conv-swipe");
    const btn = el("button", conversationRowClass(active));
    btn.type = "button";
    const avatarHost = el("div", "");
    fillAvatar(avatarHost, avatarUser, "h-12 w-12");
    const body = el("span", "min-w-0 flex-1");
    const titleRow = el("span", "flex min-w-0 items-center gap-1");
    if (pinned) {
      const star = svgIcon(
        "M12 3.5 14.7 9l6 .9-4.4 4.3 1 5.9L12 17.8 6.7 20.1l1-5.9L3.3 9.9l6-.9L12 3.5Z",
        true
      );
      star.setAttribute("class", "h-3.5 w-3.5 shrink-0 text-primary");
      titleRow.append(star);
    }
    if (muted) {
      const bell = svgIcon("M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8m4 11a2 2 0 0 0 4 0M4 4l16 16", false);
      bell.setAttribute("class", "h-3.5 w-3.5 shrink-0 text-muted-foreground");
      titleRow.append(bell);
    }
    titleRow.append(el("span", "min-w-0 truncate text-sm font-medium leading-snug text-foreground", title));
    body.append(titleRow);
    const previewRow = el("span", "mt-0.5 flex min-w-0 items-center gap-1");
    if (receipt) {
      const ticks = receiptTicks(receipt);
      ticks.classList.add("shrink-0");
      if (receipt !== "read") {
        ticks.classList.remove("opacity-70");
        ticks.classList.add("text-muted-foreground");
      }
      previewRow.append(ticks);
    }
    previewRow.append(
      el("span", "min-w-0 line-clamp-1 break-words text-sm leading-snug text-muted-foreground", preview)
    );
    body.append(previewRow);
    const meta = el("span", "flex shrink-0 flex-col items-end justify-center gap-1 self-stretch");
    if (time) meta.append(el("span", "text-xs tabular-nums text-muted-foreground", time));
    const badge = unreadBadge(unread);
    if (badge) {
      badge.classList.remove("ml-auto");
      meta.append(badge);
    }
    btn.append(avatarHost, body, meta);
    btn.addEventListener("click", onClick);

    if (swipe) {
      const pin = el("button", "conv-action conv-action-pin");
      pin.type = "button";
      pin.append(
        svgIcon(
          "M12 3.5 14.7 9l6 .9-4.4 4.3 1 5.9L12 17.8 6.7 20.1l1-5.9L3.3 9.9l6-.9L12 3.5Z",
          Boolean(pinned)
        ),
        el("span", "", pinned ? "Lösen" : "Favorit")
      );
      pin.setAttribute("aria-label", pinned ? "Favorit entfernen" : "Als Favorit markieren");
      pin.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        swipe.onPin();
      });
      const del = el("button", "conv-action conv-action-delete");
      del.type = "button";
      del.append(
        svgIcon("M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6", false),
        el("span", "", "Löschen")
      );
      del.setAttribute("aria-label", "Chat aus der Liste entfernen");
      del.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        swipe.onDelete();
      });
      item.append(pin, del, btn);
      bindConvSwipe(item, btn);
    } else {
      item.append(btn);
    }
    convList.append(item);
  }

  function renderConversationLists() {
    closeOpenSwipe();
    convList.replaceChildren();

    const privateChats = conversations.filter((conv) => !isAssistantConversation(conv));
    if (!privateChats.length) {
      convList.append(
        el(
          "li",
          "px-4 py-4 text-sm leading-snug text-muted-foreground",
          "Noch keine Chats. Tippe +, um eine Unterhaltung zu starten."
        )
      );
      return;
    }

    for (const conv of privateChats) {
      const avatarUser = conversationAvatarUser(conv);
      appendConversationRow({
        title: conversationLabel(conv),
        preview: previewText(conv.lastMessage) || "Keine Nachrichten",
        time: formatListTime(conv.lastMessage?.createdAt),
        unread: conv.unreadCount,
        avatarUser,
        active: chatSelected && conv.id === activeConversationId,
        pinned: Boolean(conv.pinned),
        muted: Boolean(conv.muted),
        receipt: receiptStatus(conv.lastMessage, conv),
        onClick: () => openConversation(conv.id),
        swipe: {
          onPin: () => toggleConversationPinned(conv),
          onDelete: () => hideConversation(conv),
        },
      });
    }
  }

  function sortConversations() {
    conversations.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const at = Date.parse(a.lastMessage?.createdAt || a.createdAt || 0) || 0;
      const bt = Date.parse(b.lastMessage?.createdAt || b.createdAt || 0) || 0;
      return bt - at;
    });
  }

  async function toggleConversationPinned(conv) {
    closeOpenSwipe();
    try {
      const next = await api(`/api/conversations/${conv.id}/me`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !conv.pinned }),
      });
      upsertConversation(next);
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  async function hideConversation(conv) {
    const label = conversationLabel(conv);
    if (!window.confirm(`„${label}“ aus deiner Liste entfernen? Der Verlauf bleibt für die andere Person erhalten.`)) {
      closeOpenSwipe();
      return;
    }
    try {
      await api(`/api/conversations/${conv.id}/me`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: true }),
      });
      conversations = conversations.filter((item) => item.id !== conv.id);
      renderConversationLists();
      if (Number(conv.id) === Number(activeConversationId)) closeThread();
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  async function loadConversations() {
    try {
      conversations = await api("/api/conversations");
      conversations = conversations.map(applyConversationViewer);
      sortConversations();
      renderConversationLists();
      updateRoomHeader();
    } catch {
      conversations = [];
      renderConversationLists();
    }
  }

  function upsertConversation(conv) {
    if (!conv?.id) return;
    applyConversationViewer(conv);
    const idx = conversations.findIndex((c) => c.id === conv.id);
    if (idx >= 0) conversations.splice(idx, 1);
    conversations.unshift(conv);
    sortConversations();
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
      id: message.id,
      userId: message.userId,
      content: previewText(message),
      type: message.deleted ? "deleted" : message.type,
      createdAt: message.createdAt,
      deleted: Boolean(message.deleted),
    };
    if (!sameRoom(message.conversationId) && currentUser && message.userId !== currentUser.id) {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }
    conversations = [conv, ...conversations.filter((c) => c.id !== conv.id)];
    sortConversations();
    renderConversationLists();
  }

  async function openConversation(conversationId) {
    if (conversationId == null || conversationId === "" || conversationId === "global") {
      closeThread();
      return;
    }
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

  async function startConversationWith(usernames, title) {
    showError(newChatError, "");
    const names = [...new Set(usernames.map((n) => n.toLowerCase()))];
    if (!names.length) return;
    try {
      const body = { usernames: names };
      if (names.length >= 2 && title) body.title = title;
      const conv = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      upsertConversation(conv);
      pickedUsers.clear();
      renderPicked();
      if (newGroupTitle) newGroupTitle.value = "";
      userSearch.value = "";
      userSearchResults.replaceChildren();
      setNewChatPanel(false);
      await openConversation(conv.id);
    } catch (err) {
      showError(newChatError, err.message);
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
      const item = el("li", "overflow-hidden rounded-2xl bg-card ring-1 ring-border");
      const btn = el(
        "button",
        "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-muted whitespace-normal"
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
      } else if (!user.isApproved && !user.isBot) {
        text.append(el("span", "block text-xs text-muted-foreground", "Wartet auf Freigabe"));
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
    if (!overlay) return;
    overlay.classList.toggle("hidden", !open);
    overlay.hidden = !open;
  }

  function bindPullToRefresh(scroller, onRefresh) {
    if (!scroller) return;
    const bar = document.createElement("div");
    bar.className = "ptr-bar";
    bar.setAttribute("aria-hidden", "true");
    const spinner = document.createElement("span");
    spinner.className = "ptr-spinner";
    bar.append(spinner);
    scroller.prepend(bar);
    new MutationObserver(() => {
      if (scroller.firstElementChild !== bar) scroller.prepend(bar);
    }).observe(scroller, { childList: true });

    const threshold = 56;
    let startX = 0;
    let startY = 0;
    let armed = false;
    let pulling = false;
    let busy = false;
    let distance = 0;

    function setDistance(px) {
      distance = Math.max(0, px);
      const shown = Math.min(72, distance * 0.45);
      bar.style.height = shown ? `${shown}px` : "0px";
      bar.classList.toggle("is-armed", distance >= threshold);
    }

    scroller.addEventListener(
      "touchstart",
      (event) => {
        if (busy || event.touches.length !== 1 || scroller.scrollTop > 1) return;
        armed = true;
        pulling = false;
        distance = 0;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      },
      { passive: true }
    );

    scroller.addEventListener(
      "touchmove",
      (event) => {
        if (!armed || busy) return;
        const touch = event.touches[0];
        const dy = touch.clientY - startY;
        const dx = touch.clientX - startX;
        if (!pulling) {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
            armed = false;
            return;
          }
          if (dy > 10 && scroller.scrollTop <= 0) pulling = true;
        }
        if (!pulling) return;
        event.preventDefault();
        setDistance(dy);
      },
      { passive: false }
    );

    scroller.addEventListener(
      "touchend",
      async () => {
        if (!armed) return;
        const shouldRefresh = pulling && distance >= threshold;
        armed = false;
        pulling = false;
        if (!shouldRefresh) {
          setDistance(0);
          return;
        }
        busy = true;
        bar.classList.add("is-busy");
        setDistance(threshold * 2);
        try {
          await onRefresh();
        } finally {
          busy = false;
          bar.classList.remove("is-busy");
          setDistance(0);
        }
      },
      { passive: true }
    );
  }

  function reloadActiveThread() {
    if (!socket || !chatSelected) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 5000);
      socket.emit("conversation:open", { conversationId: activeConversationId }, () => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  function setNewChatPanel(open) {
    setOverlay(newChatOverlay, open);
    if (open) {
      showError(newChatError, "");
      if (newGroupTitle) newGroupTitle.value = "";
      userSearch.focus();
      searchUsers(userSearch.value);
    }
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
    const isGroup = pickedUsers.size >= 2;
    btnStartChat.classList.toggle("hidden", !show);
    btnStartChat.classList.toggle("flex", show);
    btnStartChat.textContent = isGroup ? "Gruppe starten" : "Chat starten";
    if (newGroupTitleWrap) {
      newGroupTitleWrap.classList.toggle("hidden", !isGroup);
      newGroupTitleWrap.classList.toggle("flex", isGroup);
    }
  }

  function renderSearchResults(users) {
    userSearchResults.replaceChildren();
    const list = Array.isArray(users) ? users : [];
    if (!list.length) {
      userSearchResults.append(
        el(
          "li",
          "px-2 py-3 text-sm leading-relaxed text-muted-foreground",
          "Keine Person gefunden. Suche nach Benutzername oder echtem Namen."
        )
      );
      return;
    }
    for (const user of list) {
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
      if (!user.isApproved && !user.isBot) {
        text.append(el("span", "block text-xs text-muted-foreground", "Wartet auf Freigabe"));
      }
      btn.append(avatar, text);
      btn.addEventListener("click", () => {
        pickedUsers.set(user.username, user);
        renderPicked();
        renderSearchResults(list);
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
    } catch (err) {
      renderSearchResults([]);
      showError(newChatError, err.message || "Suche fehlgeschlagen.");
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

    socket.on("message:preview", (payload) => {
      if (!payload?.id) return;
      const message = messagesById.get(payload.id);
      if (!message) return;
      message.linkPreview = payload.linkPreview || null;
      messagesById.set(message.id, message);
      if (sameRoom(message.conversationId ?? null) && seenMessageIds.has(message.id)) {
        replaceMessageRow(message);
      }
    });

    socket.on("poll:update", (payload) => {
      applyPollUpdate(payload);
    });

    socket.on("receipt:update", (payload) => {
      if (!payload?.conversationId) return;
      if (currentUser && payload.userId === currentUser.id) return;
      const conv = conversations.find((c) => Number(c.id) === Number(payload.conversationId));
      if (!conv || conv.type !== "dm") return;
      if (payload.lastReadMessageId != null) {
        conv.peerLastReadMessageId = payload.lastReadMessageId;
      }
      if (payload.lastDeliveredMessageId != null) {
        conv.peerLastDeliveredMessageId = Math.max(
          Number(conv.peerLastDeliveredMessageId) || 0,
          Number(payload.lastDeliveredMessageId)
        );
      }
      const readAt = Number(conv.peerLastReadMessageId) || 0;
      if (readAt > (Number(conv.peerLastDeliveredMessageId) || 0)) {
        conv.peerLastDeliveredMessageId = readAt;
      }
      if (sameRoom(conv.id)) refreshReceipts();
      renderConversationLists();
    });

    socket.on("conversation:updated", (conv) => {
      upsertConversation(conv);
      if (Number(conv?.id) === Number(activeConversationId)) {
        updateRoomHeader();
        if (chatMenuOverlay && !chatMenuOverlay.hidden) refreshGroupTools();
      }
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

  function mentionCandidates() {
    const byName = new Map();
    const add = (user) => {
      const username = String(user?.username || "").toLowerCase();
      if (!username || (currentUser && user.id === currentUser.id)) return;
      if (!byName.has(username)) byName.set(username, user);
    };
    const conv = activeConversation();
    if (conv) {
      (conv.members || []).forEach(add);
      if (conv.peer) add(conv.peer);
    } else {
      for (const item of conversations) {
        (item.members || []).forEach(add);
        if (item.peer) add(item.peer);
      }
    }
    return [...byName.values()];
  }

  function mentionQueryAt(value, caret) {
    const before = value.slice(0, caret);
    const match = before.match(/(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{0,32})$/);
    if (!match) return null;
    return { start: caret - match[2].length - 1, query: match[2].toLowerCase() };
  }

  function hideMentionSuggest() {
    mentionIndex = -1;
    if (!mentionSuggest) return;
    mentionSuggest.replaceChildren();
    mentionSuggest.hidden = true;
    mentionSuggest.classList.add("hidden");
  }

  function mentionItems() {
    return mentionSuggest ? [...mentionSuggest.querySelectorAll("[data-username]")] : [];
  }

  function highlightMention(index) {
    const items = mentionItems();
    mentionIndex = items.length ? ((index % items.length) + items.length) % items.length : -1;
    items.forEach((item, i) => {
      item.classList.toggle("bg-muted", i === mentionIndex);
    });
  }

  function insertMention(username) {
    const caret = messageInput.selectionStart ?? messageInput.value.length;
    const found = mentionQueryAt(messageInput.value, caret);
    if (!found) {
      hideMentionSuggest();
      return;
    }
    const before = messageInput.value.slice(0, found.start);
    const after = messageInput.value.slice(caret);
    const insert = `@${username} `;
    messageInput.value = `${before}${insert}${after}`;
    const pos = before.length + insert.length;
    messageInput.setSelectionRange(pos, pos);
    hideMentionSuggest();
    messageInput.focus();
  }

  function refreshMentionSuggest() {
    if (!mentionSuggest) return;
    const caret = messageInput.selectionStart ?? messageInput.value.length;
    const found = mentionQueryAt(messageInput.value, caret);
    if (!found) {
      hideMentionSuggest();
      return;
    }
    const matches = mentionCandidates()
      .filter((user) => String(user.username || "").toLowerCase().startsWith(found.query))
      .slice(0, 8);
    if (!matches.length) {
      hideMentionSuggest();
      return;
    }
    mentionSuggest.replaceChildren();
    for (const user of matches) {
      const btn = el(
        "button",
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-foreground hover:bg-muted",
        ""
      );
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.username = user.username;
      const avatar = el("div", "shrink-0");
      fillAvatar(avatar, user, "h-8 w-8");
      const col = el("div", "min-w-0");
      col.append(el("p", "truncate font-medium", displayName(user)));
      col.append(el("p", "truncate text-xs text-muted-foreground", `@${user.username}`));
      btn.append(avatar, col);
      btn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        insertMention(user.username);
      });
      mentionSuggest.append(btn);
    }
    mentionSuggest.hidden = false;
    mentionSuggest.classList.remove("hidden");
    highlightMention(0);
  }

  async function handleSend(event) {
    event.preventDefault();
    hideMentionSuggest();
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

  function readVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const ms = Math.round((video.duration || 0) * 1000);
        URL.revokeObjectURL(url);
        resolve(ms);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Video konnte nicht gelesen werden."));
      };
      video.src = url;
    });
  }

  async function handleVideoPicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    showError(chatError, "");
    if (file.size > MAX_VIDEO_BYTES) {
      showError(chatError, "Video ist zu groß (max. 16 MB).");
      return;
    }
    btnAttachVideo.disabled = true;
    try {
      const durationMs = await readVideoDuration(file);
      if (durationMs > MAX_VIDEO_MS + 500) {
        showError(chatError, "Video maximal 30 Sekunden.");
        return;
      }
      const saved = await uploadFile("video", file, { durationMs });
      const caption = messageInput.value.trim();
      await emitMessage({ type: "video", uploadId: saved.id, content: caption });
      if (caption) messageInput.value = "";
    } catch (err) {
      showError(chatError, err.message);
    } finally {
      btnAttachVideo.disabled = false;
    }
  }

  function setMediaPanel(open) {
    setOverlay(mediaOverlay, open);
    if (open) loadSharedMedia();
  }

  async function loadSharedMedia() {
    mediaList.replaceChildren();
    mediaEmpty.classList.add("hidden");
    try {
      const id = activeConversationId == null ? "global" : String(activeConversationId);
      const data = await api(`/api/conversations/${id}/media`);
      const items = data.items || [];
      if (!items.length) {
        mediaEmpty.classList.remove("hidden");
        return;
      }
      for (const message of items) {
        const li = el("li", "");
        if (message.type === "image" && message.file?.id) {
          const link = document.createElement("a");
          link.href = `/api/files/${message.file.id}`;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "block overflow-hidden rounded-xl bg-muted";
          const img = document.createElement("img");
          img.src = `/api/files/${message.file.id}`;
          img.alt = message.content || "Bild";
          img.className = "h-24 w-full object-cover";
          link.append(img);
          li.append(link);
        } else {
          li.className = "col-span-3";
          const btn = el("button", "flex min-h-11 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-muted");
          btn.type = "button";
          btn.textContent = previewText(message) || "Datei";
          btn.addEventListener("click", async () => {
            setMediaPanel(false);
            await openConversation(message.conversationId ?? null);
            window.setTimeout(() => scrollToMessage(message.id), 80);
          });
          li.append(btn);
        }
        mediaList.append(li);
      }
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function setStarredPanel(open) {
    setOverlay(starredOverlay, open);
    if (open) loadStarred();
  }

  async function loadStarred() {
    starredList.replaceChildren();
    try {
      const data = await api("/api/starred");
      const results = data.results || [];
      if (!results.length) {
        starredList.append(el("li", "px-2 py-3 text-sm text-muted-foreground", "Noch keine gemerkten Nachrichten."));
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
          setStarredPanel(false);
          setMorePanel(false);
          await openConversation(message.conversationId ?? null);
          window.setTimeout(() => scrollToMessage(message.id), 80);
        });
        li.append(btn);
        starredList.append(li);
      }
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function setPollPanel(open) {
    setOverlay(pollOverlay, open);
    if (open) {
      showError(pollError, "");
      pollQuestion.value = "";
      pollOptions.replaceChildren();
      addPollOptionInput();
      addPollOptionInput();
      pollQuestion.focus();
    }
  }

  function setEnroutePanel(open) {
    if (!enrouteOverlay) return;
    setOverlay(enrouteOverlay, open);
    if (open) {
      showError(enrouteError, "");
      if (enrouteDestination) enrouteDestination.value = "";
      if (btnEnrouteSend) {
        btnEnrouteSend.disabled = false;
        btnEnrouteSend.textContent = "Senden";
      }
      window.requestAnimationFrame(() => {
        enrouteDestination?.focus();
      });
    }
  }

  function getPositionOnce() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 }
      );
    });
  }

  async function handleEnrouteSubmit(event) {
    event.preventDefault();
    showError(enrouteError, "");
    const destination = enrouteDestination.value.trim();
    if (destination.length < 3) {
      showError(enrouteError, "Bitte ein Ziel mit mindestens 3 Zeichen angeben.");
      return;
    }
    btnEnrouteSend.disabled = true;
    btnEnrouteSend.textContent = "Standort wird ermittelt…";
    try {
      const origin = await getPositionOnce();
      btnEnrouteSend.textContent = "Schätzung wird berechnet…";
      const payload = { type: "enroute", destination };
      if (origin) {
        payload.lat = origin.lat;
        payload.lng = origin.lng;
      }
      await emitMessage(payload);
      setEnroutePanel(false);
    } catch (err) {
      showError(enrouteError, err.message);
    } finally {
      btnEnrouteSend.disabled = false;
      btnEnrouteSend.textContent = "Senden";
    }
  }

  function addPollOptionInput() {
    if (pollOptions.children.length >= 8) return;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 80;
    input.required = pollOptions.children.length < 2;
    input.className = "h-11 min-h-11 w-full rounded-xl bg-input px-4 text-sm text-foreground ring-1 ring-border";
    input.placeholder = `Antwort ${pollOptions.children.length + 1}`;
    pollOptions.append(input);
  }

  async function handlePollSubmit(event) {
    event.preventDefault();
    showError(pollError, "");
    const question = pollQuestion.value.trim();
    const options = [...pollOptions.querySelectorAll("input")]
      .map((input) => input.value.trim())
      .filter(Boolean);
    if (!question) {
      showError(pollError, "Frage darf nicht leer sein.");
      return;
    }
    if (options.length < 2) {
      showError(pollError, "Mindestens zwei Antworten.");
      return;
    }
    btnPollSend.disabled = true;
    try {
      await emitMessage({ type: "poll", question, options });
      setPollPanel(false);
    } catch (err) {
      showError(pollError, err.message);
    } finally {
      btnPollSend.disabled = false;
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
      const currentPw = (profilePasswordCurrent?.value || "").trim();
      const newPw = profilePasswordNew?.value || "";
      const confirmPw = profilePasswordConfirm?.value || "";
      if (currentPw || newPw || confirmPw) {
        if (newPw.length < 8) {
          throw new Error("Neues Passwort muss mindestens 8 Zeichen haben.");
        }
        if (newPw !== confirmPw) {
          throw new Error("Die neuen Passwörter stimmen nicht überein.");
        }
        await api("/api/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        });
        if (profilePasswordCurrent) profilePasswordCurrent.value = "";
        if (profilePasswordNew) profilePasswordNew.value = "";
        if (profilePasswordConfirm) profilePasswordConfirm.value = "";
      }
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
    refreshGroupTools();
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
    refreshMuteButton();
    refreshBlockButton();
  }

  function refreshGroupTools() {
    const conv = activeConversation();
    const isGroup = Boolean(conv && conv.type === "group");
    groupTools.classList.toggle("hidden", !isGroup);
    groupTools.classList.toggle("flex", isGroup);
    if (!isGroup) return;

    const isAdmin = Boolean(conv.isAdmin);
    groupTitle.value = conv.title || "";
    fillAvatar(groupAvatarPreview, conversationAvatarUser(conv), "h-14 w-14");
    if (groupAvatarFile) groupAvatarFile.value = "";

    if (groupAdminAvatar) {
      groupAdminAvatar.classList.toggle("hidden", !isAdmin);
      groupAdminAvatar.classList.toggle("flex", isAdmin);
    }
    if (groupAvatarHint) {
      groupAvatarHint.classList.toggle("hidden", isAdmin);
    }
    if (groupAdminFields) {
      groupAdminFields.classList.toggle("hidden", !isAdmin);
      groupAdminFields.classList.toggle("flex", isAdmin);
    }
    if (groupAdminHint) {
      groupAdminHint.classList.toggle("hidden", isAdmin);
    }
    if (btnGroupAvatarClear) {
      const showClear = isAdmin && Boolean(conv.avatarUrl);
      btnGroupAvatarClear.classList.toggle("hidden", !showClear);
      btnGroupAvatarClear.classList.toggle("flex", showClear);
    }
    renderGroupMembers(conv, isAdmin);
  }

  function renderGroupMembers(conv, isAdmin) {
    if (!groupMembers) return;
    groupMembers.replaceChildren();
    const members = conv.members || [];
    for (const member of members) {
      const item = el("li", "flex min-h-11 items-center gap-2 rounded-xl px-1 py-1");
      const avatar = el("div", "");
      fillAvatar(avatar, member, "h-8 w-8");
      const text = el("span", "min-w-0 flex-1");
      text.append(el("span", "block truncate text-sm text-foreground", displayName(member)));
      if (member.isAdmin) {
        text.append(el("span", "block text-xs text-muted-foreground", "Gruppenleitung"));
      } else if (currentUser && member.id === currentUser.id) {
        text.append(el("span", "block text-xs text-muted-foreground", "Du"));
      }
      item.append(avatar, text);
      if (isAdmin && currentUser && member.id !== currentUser.id) {
        const actions = el("span", "flex shrink-0 items-center gap-1");
        const makeAdmin = el(
          "button",
          "inline-flex h-11 min-h-11 items-center rounded-xl px-2 text-xs font-medium ring-1 ring-border",
          "Leitung"
        );
        makeAdmin.type = "button";
        makeAdmin.setAttribute("aria-label", `${displayName(member)} zur Leitung machen`);
        makeAdmin.addEventListener("click", () => transferGroupAdmin(member));
        const kick = el(
          "button",
          "inline-flex h-11 min-h-11 items-center rounded-xl px-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-950/50",
          "Entfernen"
        );
        kick.type = "button";
        kick.setAttribute("aria-label", `${displayName(member)} entfernen`);
        kick.addEventListener("click", () => kickGroupMember(member));
        actions.append(makeAdmin, kick);
        item.append(actions);
      }
      groupMembers.append(item);
    }
  }

  async function transferGroupAdmin(member) {
    if (
      !window.confirm(
        `${displayName(member)} zur Gruppenleitung machen? Danach kannst du Name, Bild und Mitglieder nicht mehr allein ändern.`
      )
    ) {
      return;
    }
    try {
      const conv = await api(`/api/conversations/${activeConversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ adminUserId: member.id }),
      });
      upsertConversation(conv);
      updateRoomHeader();
      refreshGroupTools();
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  async function kickGroupMember(member) {
    if (!window.confirm(`${displayName(member)} aus der Gruppe entfernen?`)) return;
    try {
      const conv = await api(`/api/conversations/${activeConversationId}/members/${member.id}`, {
        method: "DELETE",
      });
      upsertConversation(conv);
      updateRoomHeader();
      refreshGroupTools();
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  function currentChatMuted() {
    if (activeConversationId == null) return Boolean(currentUser?.globalMuted);
    return Boolean(activeConversation()?.muted);
  }

  function refreshMuteButton() {
    if (!btnMuteChat) return;
    btnMuteChat.textContent = currentChatMuted() ? "Stummschaltung aufheben" : "Chat stummschalten";
  }

  function refreshBlockButton() {
    if (!btnBlockUser) return;
    const conv = activeConversation();
    const isDm = Boolean(conv && conv.type === "dm" && conv.peer && !conv.peer.isBot);
    btnBlockUser.classList.toggle("hidden", !isDm);
    btnBlockUser.classList.toggle("flex", isDm);
    if (isDm) {
      btnBlockUser.textContent = conv.blockedByMe ? "Blockierung aufheben" : "Blockieren";
    }
  }

  async function toggleMuteChat() {
    try {
      if (activeConversationId == null) {
        currentUser = await api("/api/me", {
          method: "PATCH",
          body: JSON.stringify({ globalMuted: !currentUser?.globalMuted }),
        });
        renderConversationLists();
      } else {
        const conv = activeConversation();
        if (!conv) return;
        const next = await api(`/api/conversations/${conv.id}/me`, {
          method: "PATCH",
          body: JSON.stringify({ muted: !conv.muted }),
        });
        upsertConversation(next);
      }
      refreshMuteButton();
    } catch (err) {
      showError(chatError, err.message);
    }
  }

  async function toggleBlockUser() {
    const conv = activeConversation();
    if (!conv?.peer?.id) return;
    const blocked = Boolean(conv.blockedByMe);
    if (
      !blocked &&
      !window.confirm(`${displayName(conv.peer)} blockieren? Die Person kann dir dann keine Nachrichten mehr schicken.`)
    ) {
      return;
    }
    try {
      const next = blocked
        ? await api(`/api/blocks/${conv.peer.id}`, { method: "DELETE" })
        : await api("/api/blocks", { method: "POST", body: JSON.stringify({ userId: conv.peer.id }) });
      if (next?.id) upsertConversation(next);
      else {
        conv.blockedByMe = !blocked;
        refreshComposerLock();
      }
      refreshBlockButton();
      setChatMenu(false);
    } catch (err) {
      showError(chatError, err.message);
    }
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
  authForgot.addEventListener("click", () => setAuthMode("reset"));
  authResetBack.addEventListener("click", () => setAuthMode("login"));
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
  screenChats.addEventListener("scroll", closeOpenSwipe, { passive: true });
  bindPullToRefresh(screenChats, () => loadConversations());
  bindPullToRefresh(screenContacts, () => loadConversations());
  bindPullToRefresh(messageList, () => reloadActiveThread());
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
  attachTray.addEventListener("click", (event) => event.stopPropagation());
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
  btnAttachVideo.addEventListener("click", () => {
    setAttachTray(false);
    inputVideo.click();
  });
  inputVideo.addEventListener("change", handleVideoPicked);
  btnAttachPoll.addEventListener("click", () => {
    setAttachTray(false);
    setPollPanel(true);
  });
  btnAttachLocation.addEventListener("click", () => {
    setAttachTray(false);
    handleLocation();
  });
  btnAttachEnroute?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setAttachTray(false);
      setEnroutePanel(true);
    },
    true
  );
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
  btnMuteChat.addEventListener("click", toggleMuteChat);
  btnChatMedia.addEventListener("click", () => {
    setChatMenu(false);
    setMediaPanel(true);
  });
  btnBlockUser.addEventListener("click", toggleBlockUser);
  btnMediaClose.addEventListener("click", () => setMediaPanel(false));
  mediaBackdrop.addEventListener("click", () => setMediaPanel(false));
  btnStarred.addEventListener("click", () => {
    setMorePanel(false);
    setStarredPanel(true);
  });
  btnStarredClose.addEventListener("click", () => setStarredPanel(false));
  starredBackdrop.addEventListener("click", () => setStarredPanel(false));
  btnPollClose.addEventListener("click", () => setPollPanel(false));
  pollBackdrop.addEventListener("click", () => setPollPanel(false));
  btnPollAdd.addEventListener("click", addPollOptionInput);
  formPoll.addEventListener("submit", handlePollSubmit);
  btnEnrouteClose?.addEventListener("click", () => setEnroutePanel(false));
  enrouteBackdrop?.addEventListener("click", () => setEnroutePanel(false));
  formEnroute?.addEventListener("submit", handleEnrouteSubmit);
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
      refreshGroupTools();
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
      refreshGroupTools();
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
  if (groupAvatarFile) {
    groupAvatarFile.addEventListener("change", async () => {
      const file = groupAvatarFile.files?.[0];
      if (!file || !activeConversationId) return;
      try {
        const form = new FormData();
        form.append("file", file);
        const conv = await api(`/api/conversations/${activeConversationId}/avatar`, {
          method: "POST",
          body: form,
        });
        groupAvatarFile.value = "";
        upsertConversation(conv);
        updateRoomHeader();
        refreshGroupTools();
      } catch (err) {
        groupAvatarFile.value = "";
        showError(chatError, err.message);
      }
    });
  }
  if (btnGroupAvatarClear) {
    btnGroupAvatarClear.addEventListener("click", async () => {
      if (!activeConversationId) return;
      try {
        const conv = await api(`/api/conversations/${activeConversationId}`, {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl: "" }),
        });
        upsertConversation(conv);
        updateRoomHeader();
        refreshGroupTools();
      } catch (err) {
        showError(chatError, err.message);
      }
    });
  }
  btnForwardClose.addEventListener("click", () => setForwardPanel(false));
  forwardBackdrop.addEventListener("click", () => setForwardPanel(false));
  messageMenuBackdrop.addEventListener("click", () => {
    if (Date.now() < ignoreMenuClickUntil) return;
    hideMessageMenu();
  });
  messageInput.addEventListener("input", () => {
    refreshMentionSuggest();
    if (messageInput.value.trim()) scheduleTyping();
    else if (typingSent) emitTyping(false);
  });
  messageInput.addEventListener("keydown", (event) => {
    if (!mentionSuggest || mentionSuggest.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightMention(mentionIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightMention(mentionIndex - 1);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const items = mentionItems();
      const chosen = items[mentionIndex] || items[0];
      if (chosen?.dataset.username) {
        event.preventDefault();
        insertMention(chosen.dataset.username);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideMentionSuggest();
    }
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
    const title = pickedUsers.size >= 2 ? (newGroupTitle?.value || "").trim() : "";
    startConversationWith([...pickedUsers.keys()], title);
  });
  userSearch.addEventListener("input", () => scheduleSearch(userSearch.value));
  userSearch.addEventListener("focus", () => scheduleSearch(userSearch.value));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (reactionPicker) hideReactionPicker();
    else if (messageMenuOverlay && !messageMenuOverlay.hidden) hideMessageMenu();
    else if (!forwardOverlay.hidden) setForwardPanel(false);
    else if (!searchOverlay.hidden) setSearchPanel(false);
    else if (mediaOverlay && !mediaOverlay.hidden) setMediaPanel(false);
    else if (starredOverlay && !starredOverlay.hidden) setStarredPanel(false);
    else if (pollOverlay && !pollOverlay.hidden) setPollPanel(false);
    else if (enrouteOverlay && !enrouteOverlay.hidden) setEnroutePanel(false);
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
