/**
 * =============================================================================
 * server.js — Backend der Chat-Anwendung
 * =============================================================================
 *
 * Architektur-Überblick:
 *   - Express liefert das Frontend (public/) und REST-Endpunkte (Auth, Profil,
 *     Nutzerliste, Unterhaltungen, Uploads, Admin-Benutzerverwaltung).
 *   - Socket.io übernimmt den Echtzeit-Chat (global + private Räume).
 *   - PostgreSQL speichert Benutzer, Unterhaltungen, Nachrichten und Upload-Metadaten.
 *   - Dateien (Bilder, Sprache, Avatar) liegen im Docker-Volume `uploads/`,
 *     Abruf nur über authentifiziertes /api/files/:id (kein öffentliches Static).
 *   - JWT in einem httpOnly-Cookie hält die Session (kein Token im localStorage).
 *
 * Räume:
 *   - Globaler Chat: messages.conversation_id IS NULL, Socket-Raum "global".
 *   - Private Chats: conversations + conversation_members; Socket-Raum
 *     "conversation:<id>". Beitritt und Senden nur nach Mitgliedschaftsprüfung.
 *
 * Nachrichtentypen: text | image | location | voice | file
 *
 * Interaktion (Echtzeit):
 *   - Tipp-Anzeige, Reactions, Antworten, Soft-Delete, Ungelesen, Suche
 *   - Last-seen, Lesebestätigungen (DMs), Bearbeiten, Dateianhänge
 *   - Gruppen: Titel, Mitglieder einladen, verlassen
 *   - Browser-Benachrichtigungen (Frontend, Notification API)
 *
 * KI:
 *   - Assistent „raum“ (regelbasiert, optional LLM)
 *   - Zusammenfassung + Smart Replies (lokal, optional LLM)
 *   - Einfache Moderation (Wortfilter)
 *   - Transkript (Browser Web Speech) und Bildunterschrift
 *
 * Sicherheit (Kurzfassung):
 *   - Passwörter: bcrypt mit 12 Runden
 *   - XSS: Bibliothek `xss` (Whitelist leer) + Frontend textContent
 *   - SQL-Injection: ausschließlich parametrisierte Queries
 *   - Uploads: MIME-Allowlist per Magic-Bytes, Größenlimits, UUID-Dateinamen
 *     (kein Nutzer-Dateiname auf der Platte), X-Content-Type-Options: nosniff
 *   - Neue Konten sind erst nach Admin-Freigabe schreibfähig (Lesen erlaubt)
 *   - Rate-Limiting auf Login/Registrierung und Uploads
 *   - Helmet-HTTP-Header
 * =============================================================================
 */

require("dotenv").config();

const http = require("http");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs/promises");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");
const xss = require("xss");

// ---------------------------------------------------------------------------
// Konfiguration aus der Umgebung (siehe .env.example)
// ---------------------------------------------------------------------------
const {
  NODE_ENV = "production",
  APP_PORT = "3355",
  JWT_SECRET,
  JWT_EXPIRES_IN = "7d",
  COOKIE_SECURE = "false",
  DATABASE_URL,
  UPLOAD_DIR: UPLOAD_DIR_ENV,
  AI_ENABLED = "false",
  AI_API_KEY = "",
  AI_BASE_URL = "https://api.openai.com/v1",
  AI_MODEL = "gpt-4o-mini",
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD = "",
} = process.env;

const PORT = Number(APP_PORT) || 3355;
const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = "chat_token";
const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 32;
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;
const MAX_REAL_NAME_LENGTH = 80;
const MAX_AVATAR_URL_LENGTH = 500;
const HISTORY_LIMIT = 50;
const MAX_GROUP_MEMBERS = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_BYTES = 1 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 60_000;
const MAX_EDIT_AGE_MS = 24 * 60 * 60 * 1000;
const BOT_USERNAME = "raum";
const UPLOAD_DIR = UPLOAD_DIR_ENV || path.join(__dirname, "uploads");
const TYPING_TTL_MS = 4_000;
const SEARCH_LIMIT = 40;
const ALLOWED_REACTIONS = Object.freeze(["👍", "❤️", "😂", "🎉", "😮", "😢"]);
const AI_ON = AI_ENABLED === "true";
const AI_READY = AI_ON && Boolean(AI_API_KEY && AI_API_KEY.trim());

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AVATAR_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VOICE_MIMES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);
const FILE_MIMES = new Set(["application/pdf", "application/zip"]);
const MIME_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
};
const MODERATION_RE =
  /\b(nazi|hitler|kike|nigger|nigga|faggot|child\s*porn|kinderporn)/i;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error("JWT_SECRET fehlt oder ist zu kurz. Bitte .env prüfen.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL fehlt. Bitte .env prüfen.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PostgreSQL-Pool — eine Verbindung pro Anfrage, automatisch wiederverwendet
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unerwarteter PostgreSQL-Fehler:", err.message);
});

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/**
 * Entfernt jegliches HTML/JavaScript aus Nutzereingaben.
 * whiteList: {} bedeutet: keine Tags erlaubt (reiner Text).
 */
function sanitizeText(input) {
  if (typeof input !== "string") return "";
  return xss(input, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "style"],
  }).trim();
}

/** Benutzername: nur Buchstaben, Zahlen, Unterstrich — verhindert u. a. Homoglyph-Spam. */
function isValidUsername(username) {
  return (
    typeof username === "string" &&
    username.length >= MIN_USERNAME_LENGTH &&
    username.length <= MAX_USERNAME_LENGTH &&
    /^[a-zA-Z0-9_]+$/.test(username)
  );
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH && password.length <= 128;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript im Browser kommt nicht an das Token
    secure: COOKIE_SECURE === "true", // nur über HTTPS, sobald gesetzt
    sameSite: "lax", // CSRF-Grundschutz für same-origin Form/Fetch
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Liest den angemeldeten Benutzer aus dem Cookie. Gibt null zurück, wenn ungültig. */
function getUserFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return { id: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return sendError(res, 401, "Nicht angemeldet.");
  req.user = user;
  next();
}

async function requireApproved(req, res, next) {
  try {
    const row = await loadUserAuthRow(req.user.id);
    if (!row) return sendError(res, 401, "Nicht angemeldet.");
    if (!rowCanPost(row)) {
      return sendError(res, 403, "Dein Konto wartet noch auf Freigabe durch einen Admin.");
    }
    next();
  } catch (err) {
    console.error("Freigabeprüfung fehlgeschlagen:", err);
    return sendError(res, 500, "Freigabe konnte nicht geprüft werden.");
  }
}

async function requireAdmin(req, res, next) {
  try {
    const row = await loadUserAuthRow(req.user.id);
    if (!row) return sendError(res, 401, "Nicht angemeldet.");
    if (!row.is_admin) {
      return sendError(res, 403, "Kein Zugriff auf die Benutzerverwaltung.");
    }
    next();
  } catch (err) {
    console.error("Adminprüfung fehlgeschlagen:", err);
    return sendError(res, 500, "Berechtigung konnte nicht geprüft werden.");
  }
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function toPublicUser(row, { includeAdmin = false } = {}) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    realName: row.real_name || "",
    avatarUrl: row.avatar_url || "",
    isBot: Boolean(row.is_bot),
    isApproved: row.is_approved !== false,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
  };
  if (includeAdmin) user.isAdmin = Boolean(row.is_admin);
  return user;
}

function toAdminUser(row) {
  if (!row) return null;
  return {
    ...toPublicUser(row, { includeAdmin: true }),
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
  };
}

function rowCanPost(row) {
  if (!row || row.is_bot) return false;
  return Boolean(row.is_admin || row.is_approved);
}

function displayName(user) {
  const real = (user.realName || user.real_name || "").trim();
  return real || user.username;
}

function isValidAvatarUrl(url) {
  if (!url) return true;
  if (url.length > MAX_AVATAR_URL_LENGTH) return false;
  if (/^\/api\/files\/[0-9a-f-]{36}$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function conversationRoom(id) {
  return `conversation:${id}`;
}

/** Magic-Bytes statt Client-MIME — Nutzerangaben sind untrusted. */
function detectMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }
  if (buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buffer.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (buffer.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2])) {
    return "application/zip";
  }
  return null;
}

function likePattern(raw) {
  return `%${String(raw).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

async function loadPublicUser(userId, { includeAdmin = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return toPublicUser(rows[0], { includeAdmin });
}

async function loadUserAuthRow(userId) {
  const { rows } = await pool.query(
    `SELECT id, username, is_bot, is_admin, is_approved FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function countPendingUsers() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE is_approved = FALSE AND is_bot = FALSE AND is_admin = FALSE`
  );
  return rows[0]?.n || 0;
}

function mapMessage(row) {
  const type = row.message_type || "text";
  const deleted = Boolean(row.deleted_at);
  const message = {
    id: row.id,
    conversationId: row.conversation_id,
    type: deleted ? "deleted" : type,
    userId: row.user_id,
    username: row.username,
    realName: row.real_name || "",
    avatarUrl: row.avatar_url || "",
    content: deleted ? "" : row.content,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at ? row.edited_at.toISOString() : null,
    deleted,
    replyTo: null,
    reactions: [],
    transcript: deleted ? "" : row.transcript || "",
    file: null,
    location: null,
  };

  if (row.reply_to_id) {
    message.replyTo = {
      id: row.reply_to_id,
      username: row.reply_username || "",
      realName: row.reply_real_name || "",
      type: row.reply_deleted_at ? "deleted" : row.reply_type || "text",
      content: row.reply_deleted_at ? "" : row.reply_content || "",
      deleted: Boolean(row.reply_deleted_at),
    };
  }

  if (!deleted && row.upload_id && (type === "image" || type === "voice" || type === "file")) {
    message.file = {
      id: row.upload_id,
      mime: row.upload_mime,
      durationMs: row.duration_ms,
      name: row.upload_name || "",
    };
  }

  if (!deleted && type === "location" && row.location_lat != null && row.location_lng != null) {
    message.location = {
      lat: Number(row.location_lat),
      lng: Number(row.location_lng),
      accuracy: row.location_accuracy == null ? null : Number(row.location_accuracy),
    };
  }

  return message;
}

const MESSAGE_SELECT = `
  m.id, m.user_id, m.content, m.created_at, m.conversation_id,
  m.message_type, m.upload_id, m.location_lat, m.location_lng, m.location_accuracy,
  m.reply_to_id, m.deleted_at, m.transcript, m.edited_at,
  u.username, u.real_name, u.avatar_url,
  up.mime AS upload_mime, up.duration_ms, up.original_name AS upload_name,
  r.message_type AS reply_type, r.content AS reply_content, r.deleted_at AS reply_deleted_at,
  ru.username AS reply_username, ru.real_name AS reply_real_name
`;

async function fetchReactionsForMessages(messageIds, userId) {
  if (!messageIds.length) return new Map();
  const { rows } = await pool.query(
    `
    SELECT message_id, emoji, COUNT(*)::int AS count,
           BOOL_OR(user_id = $2) AS mine
    FROM message_reactions
    WHERE message_id = ANY($1::int[])
    GROUP BY message_id, emoji
    ORDER BY emoji ASC
    `,
    [messageIds, userId]
  );
  const byMessage = new Map();
  for (const row of rows) {
    const list = byMessage.get(row.message_id) || [];
    list.push({ emoji: row.emoji, count: row.count, mine: Boolean(row.mine) });
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

async function attachReactions(messages, userId) {
  const reactions = await fetchReactionsForMessages(
    messages.map((m) => m.id).filter(Boolean),
    userId
  );
  for (const message of messages) {
    message.reactions = reactions.get(message.id) || [];
  }
  return messages;
}

async function fetchMessages(conversationId, limit = HISTORY_LIMIT, viewerId = 0) {
  const { rows } = await pool.query(
    `
    SELECT ${MESSAGE_SELECT}
    FROM (
      SELECT *
      FROM messages
      WHERE conversation_id IS NOT DISTINCT FROM $1
      ORDER BY created_at DESC
      LIMIT $2
    ) m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN uploads up ON up.id = m.upload_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.user_id
    ORDER BY m.created_at ASC
    `,
    [conversationId, limit]
  );
  return attachReactions(rows.map(mapMessage), viewerId);
}

async function isConversationMember(userId, conversationId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
    [conversationId, userId]
  );
  return rows.length > 0;
}

async function loadConversationMembers(conversationId) {
  const { rows } = await pool.query(
    `
    SELECT u.id, u.username, u.real_name, u.avatar_url, u.is_bot, u.last_seen_at
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = $1
    ORDER BY u.username ASC
    `,
    [conversationId]
  );
  return rows.map(toPublicUser);
}

function serializeConversation(row, members, currentUserId) {
  return {
    id: row.id,
    type: row.type,
    title: row.title || "",
    createdAt: row.created_at.toISOString(),
    unreadCount: Number(row.unread_count) || 0,
    peerLastReadMessageId: row.type === "dm" ? row.peer_last_read_message_id || null : null,
    members,
    lastMessage: row.last_content
      ? {
          content: row.last_deleted_at ? "" : row.last_content,
          type: row.last_deleted_at ? "deleted" : row.last_type || "text",
          createdAt: row.last_at ? row.last_at.toISOString() : null,
          deleted: Boolean(row.last_deleted_at),
        }
      : null,
    peer:
      row.type === "dm"
        ? members.find((m) => m.id !== currentUserId) || members[0] || null
        : null,
  };
}

async function fetchConversationsForUser(userId) {
  const { rows } = await pool.query(
    `
    SELECT
      c.id, c.type, c.title, c.created_at,
      last.content AS last_content,
      last.message_type AS last_type,
      last.created_at AS last_at,
      last.deleted_at AS last_deleted_at,
      (
        SELECT cm.last_read_message_id
        FROM conversation_members cm
        WHERE cm.conversation_id = c.id AND cm.user_id <> $1
        ORDER BY cm.user_id
        LIMIT 1
      ) AS peer_last_read_message_id,
      (
        SELECT COUNT(*)::int
        FROM messages um
        WHERE um.conversation_id = c.id
          AND um.deleted_at IS NULL
          AND um.user_id <> $1
          AND (me.last_read_message_id IS NULL OR um.id > me.last_read_message_id)
      ) AS unread_count
    FROM conversations c
    JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
    LEFT JOIN LATERAL (
      SELECT content, message_type, created_at, deleted_at
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) last ON TRUE
    ORDER BY COALESCE(last.created_at, c.created_at) DESC, c.id DESC
    `,
    [userId]
  );

  const result = [];
  for (const row of rows) {
    const members = await loadConversationMembers(row.id);
    result.push(serializeConversation(row, members, userId));
  }
  return result;
}

async function findExistingDm(userIdA, userIdB) {
  const { rows } = await pool.query(
    `
    SELECT c.id
    FROM conversations c
    JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
    JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
    WHERE c.type = 'dm'
      AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
    LIMIT 1
    `,
    [userIdA, userIdB]
  );
  return rows[0]?.id || null;
}

async function getConversationPayload(conversationId, userId) {
  const { rows } = await pool.query(
    `
    SELECT
      c.id, c.type, c.title, c.created_at,
      last.content AS last_content,
      last.message_type AS last_type,
      last.created_at AS last_at,
      last.deleted_at AS last_deleted_at,
      (
        SELECT cm.last_read_message_id
        FROM conversation_members cm
        WHERE cm.conversation_id = c.id AND cm.user_id <> $2
        ORDER BY cm.user_id
        LIMIT 1
      ) AS peer_last_read_message_id,
      (
        SELECT COUNT(*)::int
        FROM messages um
        WHERE um.conversation_id = c.id
          AND um.deleted_at IS NULL
          AND um.user_id <> $2
          AND (me.last_read_message_id IS NULL OR um.id > me.last_read_message_id)
      ) AS unread_count
    FROM conversations c
    JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $2
    LEFT JOIN LATERAL (
      SELECT content, message_type, created_at, deleted_at
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) last ON TRUE
    WHERE c.id = $1
    `,
    [conversationId, userId]
  );
  if (!rows[0]) return null;
  const members = await loadConversationMembers(conversationId);
  return serializeConversation(rows[0], members, userId);
}

function fallbackContent(type, content, location) {
  const text = sanitizeText(content || "");
  if (text) return text.slice(0, MAX_MESSAGE_LENGTH);
  if (type === "image") return text || "Bild";
  if (type === "voice") return text || "Sprachnachricht";
  if (type === "file") return text || "Datei";
  if (type === "location" && location) {
    return `Standort: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  }
  return text;
}

function moderationBlocked(text) {
  if (!text) return false;
  if (MODERATION_RE.test(text)) return true;
  if (/(.)\1{14,}/.test(text)) return true;
  return false;
}

function heuristicReplies(lastContent) {
  const raw = String(lastContent || "").toLowerCase();
  if (!raw.trim()) return ["Alles klar", "Bin gleich da", "Danke"];
  if (/\?/.test(raw)) return ["Ja", "Nein", "Ich schau nach"];
  if (/danke|thanks|thx/.test(raw)) return ["Gern!", "Bitte", "Kein Thema"];
  if (/hallo|hi\b|hey|moin|guten/.test(raw)) return ["Hey!", "Hallo", "Moin"];
  if (/standort|location|bin hier/.test(raw)) return ["Danke für den Pin", "Bin unterwegs", "Alles klar"];
  if (/ok\b|okay|passt/.test(raw)) return ["Super", "Perfekt", "Bis gleich"];
  return ["Ok", "Danke", "Ich melde mich"];
}

function localSummary(messages) {
  const alive = (messages || []).filter((m) => !m.deleted);
  if (!alive.length) return "Noch keine Nachrichten.";
  const names = [...new Set(alive.map((m) => m.realName || m.username).filter(Boolean))];
  const last = alive.slice(-5).map((m) => {
    const who = m.username || "?";
    const body = (m.content || m.type || "").replace(/\s+/g, " ").slice(0, 80);
    return `• ${who}: ${body}`;
  });
  return `${alive.length} Nachrichten. Teilnehmende: ${names.join(", ") || "—"}.\nLetzte Zeilen:\n${last.join("\n")}`;
}

function botHelpText() {
  return [
    "Ich bin raum, der Assistent dieses Chats.",
    "Befehle: /hilfe — diese Übersicht, /ping — Erreichbarkeit.",
    "Im globalen Raum: @raum plus Frage.",
    "Unter Mehr: Zusammenfassung des aktuellen Chats.",
    AI_READY
      ? "KI-Antworten sind aktiv (API-Key gesetzt)."
      : "Ohne AI_API_KEY antworte ich regelbasiert. Kurzfassung und Antwortvorschläge laufen lokal.",
  ].join("\n");
}

function ruleBasedBotReply(content) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase().replace(/^@raum\s*/, "");
  if (!lower || /^(hilfe|help|\/hilfe|\/help)\b/.test(lower)) return botHelpText();
  if (/^\/?ping\b/.test(lower)) return "pong — ich bin da.";
  if (/zusammenfass|summary/.test(lower)) {
    return "Öffne den Chat und tippe unter Mehr auf Zusammenfassen.";
  }
  if (/hallo|hi\b|hey|moin/.test(lower)) {
    return "Hallo! Schreib /hilfe, wenn du wissen willst, was ich kann.";
  }
  if (/\?/.test(lower)) {
    return "Ohne Sprachmodell nur die Kurzhilfe. /hilfe listet die Befehle. Mit AI_ENABLED und AI_API_KEY antworte ich freier.";
  }
  return "Verstanden. /hilfe zeigt die Befehle. Für freie Antworten AI_API_KEY in der .env setzen.";
}

function previewForward(message) {
  if (!message) return "";
  if (message.type === "image") return "Bild";
  if (message.type === "voice") return "Sprachnachricht";
  if (message.type === "file") return message.file?.name || "Datei";
  if (message.type === "location") return "Standort";
  return message.content || "";
}

function isAllowedReaction(emoji) {
  return typeof emoji === "string" && ALLOWED_REACTIONS.includes(emoji);
}

function roomName(conversationId) {
  return conversationId ? conversationRoom(conversationId) : "global";
}

async function canAccessConversation(userId, conversationId) {
  if (conversationId == null) return true;
  return isConversationMember(userId, conversationId);
}

async function loadMessageRow(messageId) {
  const { rows } = await pool.query(
    `
    SELECT ${MESSAGE_SELECT}
    FROM messages m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN uploads up ON up.id = m.upload_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.user_id
    WHERE m.id = $1
    `,
    [messageId]
  );
  return rows[0] || null;
}

async function loadPublicMessage(messageId, viewerId) {
  const row = await loadMessageRow(messageId);
  if (!row) return null;
  const [message] = await attachReactions([mapMessage(row)], viewerId);
  return message;
}

async function resolveReplyTo(replyToId, conversationId) {
  if (replyToId == null || replyToId === "") return null;
  const id = parsePositiveInt(replyToId);
  if (!id) return { error: "Ungültige Antwort-Nachricht." };
  const { rows } = await pool.query(
    `SELECT id, conversation_id, deleted_at FROM messages WHERE id = $1`,
    [id]
  );
  const target = rows[0];
  if (!target || target.deleted_at) {
    return { error: "Die ursprüngliche Nachricht ist nicht mehr verfügbar." };
  }
  if (
    (conversationId == null && target.conversation_id != null) ||
    (conversationId != null && Number(target.conversation_id) !== Number(conversationId))
  ) {
    return { error: "Antwort nur im selben Chat möglich." };
  }
  return { id };
}

async function countUnread(userId, conversationId) {
  if (conversationId) {
    const { rows } = await pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM messages um
      JOIN conversation_members me
        ON me.conversation_id = um.conversation_id AND me.user_id = $1
      WHERE um.conversation_id = $2
        AND um.deleted_at IS NULL
        AND um.user_id <> $1
        AND (me.last_read_message_id IS NULL OR um.id > me.last_read_message_id)
      `,
      [userId, conversationId]
    );
    return rows[0]?.n || 0;
  }

  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM messages um
    JOIN users u ON u.id = $1
    WHERE um.conversation_id IS NULL
      AND um.deleted_at IS NULL
      AND um.user_id <> $1
      AND (u.global_last_read_message_id IS NULL OR um.id > u.global_last_read_message_id)
    `,
    [userId]
  );
  return rows[0]?.n || 0;
}

async function markRead(userId, conversationId, messageId) {
  if (!messageId) {
    const { rows } = await pool.query(
      `
      SELECT id FROM messages
      WHERE conversation_id IS NOT DISTINCT FROM $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [conversationId]
    );
    messageId = rows[0]?.id || null;
  }
  if (!messageId) return 0;

  if (conversationId) {
    await pool.query(
      `
      UPDATE conversation_members
      SET last_read_at = NOW(), last_read_message_id = $3
      WHERE conversation_id = $1 AND user_id = $2
        AND (last_read_message_id IS NULL OR last_read_message_id < $3)
      `,
      [conversationId, userId, messageId]
    );
    io.to(roomName(conversationId)).emit("receipt:update", {
      conversationId,
      userId,
      lastReadMessageId: messageId,
    });
  } else {
    await pool.query(
      `
      UPDATE users
      SET global_last_read_at = NOW(), global_last_read_message_id = $2
      WHERE id = $1
        AND (global_last_read_message_id IS NULL OR global_last_read_message_id < $2)
      `,
      [userId, messageId]
    );
  }
  return countUnread(userId, conversationId);
}

async function markUnread(userId, conversationId) {
  if (conversationId) {
    await pool.query(
      `
      UPDATE conversation_members
      SET last_read_at = NULL, last_read_message_id = NULL
      WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId]
    );
  } else {
    await pool.query(
      `UPDATE users SET global_last_read_at = NULL, global_last_read_message_id = NULL WHERE id = $1`,
      [userId]
    );
  }
  return countUnread(userId, conversationId);
}

async function countGlobalUnread(userId) {
  return countUnread(userId, null);
}

function emitToUser(userId, event, payload) {
  for (const sock of socketsForUser(userId)) {
    sock.emit(event, payload);
  }
}

async function notifyInbox(userId, conversationId) {
  const unreadCount = await countUnread(userId, conversationId);
  emitToUser(userId, "inbox:unread", { conversationId, unreadCount });
}

function aiStatusPayload() {
  return {
    enabled: AI_READY,
    configured: AI_ON,
    missingKey: AI_ON && !AI_READY,
    model: AI_READY ? AI_MODEL : null,
    features: {
      summarize: true,
      suggestReplies: true,
      assistant: true,
      moderation: true,
      transcript: true,
      imageCaption: true,
    },
  };
}

async function callAiChat(messages, { maxTokens = 400, temperature = 0.4 } = {}) {
  if (!AI_READY) {
    const error = new Error("KI ist nicht konfiguriert.");
    error.status = 503;
    error.code = "ai_disabled";
    throw error;
  }
  const base = String(AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!response.ok) {
    const error = new Error("KI-Anbieter hat abgelehnt.");
    error.status = 502;
    throw error;
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    const error = new Error("KI lieferte keine Antwort.");
    error.status = 502;
    throw error;
  }
  return sanitizeText(text).slice(0, 4000);
}

async function ensureAssistantBot() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE username = $1`, [BOT_USERNAME]);
  if (rows[0]) {
    await pool.query(
      `UPDATE users
       SET is_bot = TRUE,
           is_approved = TRUE,
           approved_at = COALESCE(approved_at, NOW()),
           real_name = COALESCE(NULLIF(real_name, ''), 'Raum-Assistent')
       WHERE id = $1`,
      [rows[0].id]
    );
    return rows[0].id;
  }
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
  const inserted = await pool.query(
    `INSERT INTO users (username, password_hash, real_name, is_bot, is_approved, approved_at)
     VALUES ($1, $2, $3, TRUE, TRUE, NOW())
     RETURNING id`,
    [BOT_USERNAME, passwordHash, "Raum-Assistent"]
  );
  log("Assistent-Konto „raum“ angelegt.");
  return inserted.rows[0].id;
}

async function loadBotUser() {
  const { rows } = await pool.query(
    `SELECT id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at
     FROM users WHERE username = $1 AND is_bot = TRUE`,
    [BOT_USERNAME]
  );
  return toPublicUser(rows[0]);
}

/** Legt das Admin-Konto aus ADMIN_USERNAME / ADMIN_PASSWORD an oder stuft es hoch. */
async function ensureAdminUser() {
  const username = sanitizeText(String(ADMIN_USERNAME || "admin")).toLowerCase();
  if (!isValidUsername(username) || username === BOT_USERNAME) {
    log("ADMIN_USERNAME ungültig — Admin-Konto wird nicht angelegt.");
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, is_admin FROM users WHERE username = $1`,
    [username]
  );

  if (rows[0]) {
    await pool.query(
      `UPDATE users
       SET is_admin = TRUE, is_approved = TRUE, approved_at = COALESCE(approved_at, NOW())
       WHERE id = $1`,
      [rows[0].id]
    );
    if (!rows[0].is_admin) {
      log(`Bestehendes Konto „${username}“ wurde zum Admin gemacht.`);
    }
    return;
  }

  if (!isValidPassword(ADMIN_PASSWORD)) {
    log("Kein Admin-Konto: ADMIN_PASSWORD in der .env setzen (mindestens 8 Zeichen).");
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await pool.query(
    `INSERT INTO users (username, password_hash, real_name, is_admin, is_approved, approved_at)
     VALUES ($1, $2, $3, TRUE, TRUE, NOW())`,
    [username, passwordHash, "Administrator"]
  );
  log(`Admin-Konto „${username}“ angelegt.`);
}

// ---------------------------------------------------------------------------
// Schema anlegen (idempotent) — läuft einmal beim Start
// ---------------------------------------------------------------------------
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      VARCHAR(32) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS real_name VARCHAR(80)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS global_last_read_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS global_last_read_message_id INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
  // Bestehende Konten bleiben freigegeben; neue Inserts defaulten auf ausstehend.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE users ALTER COLUMN is_approved SET DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(
    `UPDATE users SET approved_at = COALESCE(approved_at, created_at) WHERE is_approved = TRUE AND approved_at IS NULL`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         SERIAL PRIMARY KEY,
      type       VARCHAR(16) NOT NULL DEFAULT 'dm',
      title      VARCHAR(80),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversation_members_user
      ON conversation_members (user_id);
  `);
  await pool.query(
    `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ`
  );
  await pool.query(
    `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id           UUID PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         VARCHAR(16) NOT NULL,
      mime         VARCHAR(64) NOT NULL,
      size_bytes   INTEGER NOT NULL,
      storage_name VARCHAR(80) NOT NULL,
      duration_ms  INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_name VARCHAR(120)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE
  `);
  await pool.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(16) NOT NULL DEFAULT 'text'
  `);
  await pool.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS upload_id UUID REFERENCES uploads(id) ON DELETE SET NULL
  `);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_accuracy REAL`);
  await pool.query(
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`
  );
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages (created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
      ON messages (conversation_id, created_at DESC);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_upload_id
      ON messages (upload_id)
      WHERE upload_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id, emoji)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_message_reactions_message
      ON message_reactions (message_id);
  `);

  log("Datenbankschema ist bereit.");
}

/** Wartet, bis PostgreSQL Anfragen annimmt (Compose-Healthcheck + extra Puffer). */
async function waitForDatabase(retries = 20, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      log(`Warte auf Datenbank (${attempt}/${retries}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("PostgreSQL nach mehreren Versuchen nicht erreichbar.");
}

function safeUploadPath(storageName) {
  const resolvedDir = path.resolve(UPLOAD_DIR);
  const abs = path.resolve(UPLOAD_DIR, storageName);
  const prefix = resolvedDir.endsWith(path.sep) ? resolvedDir : resolvedDir + path.sep;
  if (abs !== resolvedDir && !abs.startsWith(prefix)) return null;
  if (path.basename(abs) !== storageName) return null;
  return abs;
}

// ---------------------------------------------------------------------------
// Express + HTTP + Socket.io
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);

// Hinter einem Reverse-Proxy (nginx, Caddy, Traefik) echte Client-IPs für Rate-Limits.
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const io = new Server(server, {
  cors: { origin: false }, // same-origin: Frontend kommt vom selben Express-Server
  // Cookie der Handshake-Anfrage wird für JWT-Prüfung genutzt
});

// Helmet: Standard-Header. CSP erlaubt Tailwind-CDN, Google Fonts, WebSockets, Avatar-HTTPS.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Uploads. Bitte später erneut versuchen." },
});

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 8 },
});

function handleMulter(req, res, next) {
  memoryUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 413, "Datei ist zu groß (max. 8 MB).");
    }
    return sendError(res, 400, "Upload fehlgeschlagen.");
  });
}

// ---------------------------------------------------------------------------
// REST: Gesundheit, Session, Registrierung, Login, Logout, Profil, Chats, Dateien
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await loadPublicUser(req.user.id, { includeAdmin: true });
    if (!user) return sendError(res, 401, "Nicht angemeldet.");
    user.globalUnread = await countGlobalUnread(req.user.id);
    user.ai = aiStatusPayload();
    if (user.isAdmin) {
      user.pendingUsers = await countPendingUsers();
    }
    return res.json(user);
  } catch (err) {
    console.error("Profil laden fehlgeschlagen:", err);
    return sendError(res, 500, "Profil konnte nicht geladen werden.");
  }
});

app.patch("/api/me", requireAuth, async (req, res) => {
  try {
    const current = await loadPublicUser(req.user.id);
    if (!current) return sendError(res, 401, "Nicht angemeldet.");

    let realName = current.realName;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "realName")) {
      realName = sanitizeText(String(req.body.realName || "")).slice(0, MAX_REAL_NAME_LENGTH);
    }

    let avatarUrl = current.avatarUrl;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "avatarUrl")) {
      avatarUrl = sanitizeText(String(req.body.avatarUrl || "")).slice(0, MAX_AVATAR_URL_LENGTH);
      if (!isValidAvatarUrl(avatarUrl)) {
        return sendError(res, 400, "Avatar-URL muss http(s) sein oder leer bleiben.");
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET real_name = $1, avatar_url = $2 WHERE id = $3
       RETURNING id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at`,
      [realName || null, avatarUrl || null, req.user.id]
    );

    const user = toPublicUser(rows[0], { includeAdmin: true });
    refreshConnectionProfiles(user);
    io.emit("user:updated", user);
    return res.json(user);
  } catch (err) {
    console.error("Profil speichern fehlgeschlagen:", err);
    return sendError(res, 500, "Profil konnte nicht gespeichert werden.");
  }
});

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const username = sanitizeText(req.body?.username || "").toLowerCase();
    const password = req.body?.password;

    if (!isValidUsername(username)) {
      return sendError(
        res,
        400,
        `Benutzername: ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} Zeichen, nur Buchstaben, Zahlen und Unterstrich.`
      );
    }
    if (username === BOT_USERNAME) {
      return sendError(res, 400, "Dieser Benutzername ist reserviert.");
    }
    const adminName = sanitizeText(String(ADMIN_USERNAME || "admin")).toLowerCase();
    if (username === adminName) {
      return sendError(res, 400, "Dieser Benutzername ist reserviert.");
    }
    if (!isValidPassword(password)) {
      return sendError(res, 400, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, is_approved)
       VALUES ($1, $2, FALSE)
       RETURNING id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at, created_at`,
      [username, passwordHash]
    );

    const user = toPublicUser(rows[0], { includeAdmin: true });
    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    log(`Registrierung (ausstehend): ${user.username}`);
    emitToAdmins("admin:users-changed", {
      action: "register",
      user: toAdminUser(rows[0]),
      pendingUsers: await countPendingUsers(),
    });
    return res.status(201).json(user);
  } catch (err) {
    if (err.code === "23505") {
      return sendError(res, 409, "Dieser Benutzername ist bereits vergeben.");
    }
    console.error("Registrierung fehlgeschlagen:", err);
    return sendError(res, 500, "Registrierung fehlgeschlagen.");
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const username = sanitizeText(req.body?.username || "").toLowerCase();
    const password = req.body?.password;

    if (!username || typeof password !== "string") {
      return sendError(res, 400, "Benutzername und Passwort sind erforderlich.");
    }

    const { rows } = await pool.query(
      `SELECT id, username, password_hash, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at FROM users WHERE username = $1`,
      [username]
    );

    const userRow = rows[0];
    const passwordOk = userRow ? await bcrypt.compare(password, userRow.password_hash) : false;
    if (!userRow || !passwordOk || userRow.is_bot) {
      return sendError(res, 401, "Ungültige Anmeldedaten.");
    }

    const adminOnly = Boolean(req.body?.admin);
    if (adminOnly && !userRow.is_admin) {
      return sendError(res, 403, "Dieses Konto hat keine Admin-Rechte.");
    }

    const user = toPublicUser(userRow, { includeAdmin: true });
    if (user.isAdmin) {
      user.pendingUsers = await countPendingUsers();
    }
    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    log(`Login: ${user.username}${adminOnly ? " (Admin)" : ""}`);
    return res.json(user);
  } catch (err) {
    console.error("Login fehlgeschlagen:", err);
    return sendError(res, 500, "Anmeldung fehlgeschlagen.");
  }
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  });
  return res.json({ ok: true });
});

const ADMIN_USER_SELECT = `
  id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at, created_at, approved_at
`;

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT ${ADMIN_USER_SELECT}
      FROM users
      WHERE is_bot = FALSE
      ORDER BY is_approved ASC, created_at DESC, username ASC
      `
    );
    return res.json({
      users: rows.map(toAdminUser),
      pendingUsers: rows.filter((row) => !row.is_approved && !row.is_admin).length,
    });
  } catch (err) {
    console.error("Admin-Nutzerliste fehlgeschlagen:", err);
    return sendError(res, 500, "Benutzer konnten nicht geladen werden.");
  }
});

app.post("/api/admin/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) return sendError(res, 400, "Ungültiger Benutzer.");

    const { rows } = await pool.query(
      `
      UPDATE users
      SET is_approved = TRUE, approved_at = NOW(), approved_by = $2
      WHERE id = $1 AND is_bot = FALSE
      RETURNING ${ADMIN_USER_SELECT}
      `,
      [targetId, req.user.id]
    );
    const user = toAdminUser(rows[0]);
    if (!user) return sendError(res, 404, "Benutzer nicht gefunden.");

    applyAccountStatus(user.id, { isApproved: true, isAdmin: user.isAdmin });
    const pendingUsers = await countPendingUsers();
    emitToAdmins("admin:users-changed", { action: "approve", user, pendingUsers });
    log(`Admin ${req.user.username} hat ${user.username} freigegeben.`);
    return res.json({ user, pendingUsers });
  } catch (err) {
    console.error("Freigabe fehlgeschlagen:", err);
    return sendError(res, 500, "Benutzer konnte nicht freigegeben werden.");
  }
});

app.post("/api/admin/users/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) return sendError(res, 400, "Ungültiger Benutzer.");
    if (targetId === req.user.id) {
      return sendError(res, 400, "Das eigene Konto kann nicht gesperrt werden.");
    }

    const { rows: currentRows } = await pool.query(
      `SELECT is_admin, is_bot FROM users WHERE id = $1`,
      [targetId]
    );
    const current = currentRows[0];
    if (!current) return sendError(res, 404, "Benutzer nicht gefunden.");
    if (current.is_bot) return sendError(res, 400, "Dieses Konto kann nicht gesperrt werden.");
    if (current.is_admin) {
      return sendError(res, 400, "Admin-Konten können nicht gesperrt werden.");
    }

    const { rows } = await pool.query(
      `
      UPDATE users
      SET is_approved = FALSE, approved_at = NULL, approved_by = NULL
      WHERE id = $1 AND is_bot = FALSE AND is_admin = FALSE
      RETURNING ${ADMIN_USER_SELECT}
      `,
      [targetId]
    );
    const user = toAdminUser(rows[0]);
    if (!user) return sendError(res, 404, "Benutzer nicht gefunden.");

    applyAccountStatus(user.id, { isApproved: false, isAdmin: false });
    const pendingUsers = await countPendingUsers();
    emitToAdmins("admin:users-changed", { action: "revoke", user, pendingUsers });
    log(`Admin ${req.user.username} hat ${user.username} gesperrt.`);
    return res.json({ user, pendingUsers });
  } catch (err) {
    console.error("Sperre fehlgeschlagen:", err);
    return sendError(res, 500, "Benutzer konnte nicht gesperrt werden.");
  }
});

app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const q = sanitizeText(String(req.query.q || "")).slice(0, 64);
    const params = [req.user.id];
    let where = `id <> $1 AND is_approved = TRUE`;
    if (q) {
      params.push(likePattern(q.toLowerCase()));
      where += ` AND (username ILIKE $2 ESCAPE '\\' OR COALESCE(real_name, '') ILIKE $2 ESCAPE '\\')`;
    }

    const { rows } = await pool.query(
      `
      SELECT id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at
      FROM users
      WHERE ${where}
      ORDER BY username ASC
      LIMIT 20
      `,
      params
    );
    return res.json(rows.map(toPublicUser));
  } catch (err) {
    console.error("Nutzerliste fehlgeschlagen:", err);
    return sendError(res, 500, "Nutzer konnten nicht geladen werden.");
  }
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const list = await fetchConversationsForUser(req.user.id);
    return res.json(list);
  } catch (err) {
    console.error("Unterhaltungen laden fehlgeschlagen:", err);
    return sendError(res, 500, "Unterhaltungen konnten nicht geladen werden.");
  }
});

app.post("/api/conversations", requireAuth, requireApproved, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
    const names = [
      ...new Set(
        raw
          .map((name) => sanitizeText(String(name || "")).toLowerCase())
          .filter((name) => isValidUsername(name) && name !== req.user.username)
      ),
    ];

    if (!names.length) {
      return sendError(res, 400, "Bitte mindestens eine andere Person auswählen.");
    }
    if (names.length > MAX_GROUP_MEMBERS - 1) {
      return sendError(res, 400, `Maximal ${MAX_GROUP_MEMBERS} Personen pro Unterhaltung.`);
    }

    const { rows: userRows } = await pool.query(
      `SELECT id, username, real_name, avatar_url FROM users
       WHERE username = ANY($1::text[]) AND (is_approved = TRUE OR is_bot = TRUE)`,
      [names]
    );
    if (userRows.length !== names.length) {
      return sendError(res, 404, "Mindestens ein Benutzername ist unbekannt.");
    }

    const memberIds = [req.user.id, ...userRows.map((u) => u.id)];
    const type = memberIds.length === 2 ? "dm" : "group";

    if (type === "dm") {
      const existingId = await findExistingDm(req.user.id, userRows[0].id);
      if (existingId) {
        const existing = await getConversationPayload(existingId, req.user.id);
        return res.json(existing);
      }
    }

    const client = await pool.connect();
    let conversationId;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO conversations (type) VALUES ($1) RETURNING id, type, title, created_at`,
        [type]
      );
      conversationId = inserted.rows[0].id;
      for (const memberId of memberIds) {
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
          [conversationId, memberId]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const payload = await getConversationPayload(conversationId, req.user.id);
    await addSocketsToConversation(memberIds, conversationId);
    log(`Unterhaltung ${conversationId} (${type}) von ${req.user.username}`);
    return res.status(201).json(payload);
  } catch (err) {
    console.error("Unterhaltung anlegen fehlgeschlagen:", err);
    return sendError(res, 500, "Unterhaltung konnte nicht erstellt werden.");
  }
});

app.get("/api/conversations/:id", requireAuth, async (req, res) => {
  try {
    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) return sendError(res, 400, "Ungültige Unterhaltung.");
    if (!(await isConversationMember(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    const payload = await getConversationPayload(conversationId, req.user.id);
    if (!payload) return sendError(res, 404, "Unterhaltung nicht gefunden.");
    return res.json(payload);
  } catch (err) {
    console.error("Unterhaltung laden fehlgeschlagen:", err);
    return sendError(res, 500, "Unterhaltung konnte nicht geladen werden.");
  }
});

app.patch("/api/conversations/:id", requireAuth, requireApproved, async (req, res) => {
  try {
    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) return sendError(res, 400, "Ungültige Unterhaltung.");
    if (!(await isConversationMember(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    const { rows } = await pool.query(`SELECT type FROM conversations WHERE id = $1`, [conversationId]);
    if (!rows[0] || rows[0].type !== "group") {
      return sendError(res, 400, "Nur Gruppen haben einen Titel.");
    }
    const title = sanitizeText(String(req.body?.title || "")).slice(0, 80);
    await pool.query(`UPDATE conversations SET title = $1 WHERE id = $2`, [title || null, conversationId]);
    const payload = await getConversationPayload(conversationId, req.user.id);
    io.to(conversationRoom(conversationId)).emit("conversation:updated", payload);
    return res.json(payload);
  } catch (err) {
    console.error("Gruppentitel fehlgeschlagen:", err);
    return sendError(res, 500, "Titel konnte nicht gespeichert werden.");
  }
});

app.post("/api/conversations/:id/members", requireAuth, requireApproved, async (req, res) => {
  try {
    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) return sendError(res, 400, "Ungültige Unterhaltung.");
    if (!(await isConversationMember(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    const { rows: convRows } = await pool.query(`SELECT type FROM conversations WHERE id = $1`, [conversationId]);
    if (!convRows[0] || convRows[0].type !== "group") {
      return sendError(res, 400, "Mitglieder nur in Gruppen einladen.");
    }
    const username = sanitizeText(String(req.body?.username || "")).toLowerCase();
    if (!isValidUsername(username) || username === req.user.username) {
      return sendError(res, 400, "Bitte eine andere Person angeben.");
    }
    const { rows: userRows } = await pool.query(
      `SELECT id, username, real_name, avatar_url, is_bot, is_approved, last_seen_at
       FROM users WHERE username = $1 AND (is_approved = TRUE OR is_bot = TRUE)`,
      [username]
    );
    const invitee = userRows[0];
    if (!invitee) return sendError(res, 404, "Benutzername unbekannt.");
    const members = await loadConversationMembers(conversationId);
    if (members.some((m) => m.id === invitee.id)) {
      return sendError(res, 409, "Diese Person ist schon in der Gruppe.");
    }
    if (members.length >= MAX_GROUP_MEMBERS) {
      return sendError(res, 400, `Maximal ${MAX_GROUP_MEMBERS} Personen.`);
    }
    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
      [conversationId, invitee.id]
    );
    await addSocketsToConversation([invitee.id], conversationId);
    const payload = await getConversationPayload(conversationId, req.user.id);
    io.to(conversationRoom(conversationId)).emit("conversation:updated", payload);
    return res.json(payload);
  } catch (err) {
    console.error("Mitglied einladen fehlgeschlagen:", err);
    return sendError(res, 500, "Person konnte nicht eingeladen werden.");
  }
});

app.delete("/api/conversations/:id/members/me", requireAuth, async (req, res) => {
  try {
    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) return sendError(res, 400, "Ungültige Unterhaltung.");
    const { rows } = await pool.query(`SELECT type FROM conversations WHERE id = $1`, [conversationId]);
    if (!rows[0] || rows[0].type !== "group") {
      return sendError(res, 400, "Verlassen nur bei Gruppen.");
    }
    if (!(await isConversationMember(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    await pool.query(
      `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, req.user.id]
    );
    for (const sock of socketsForUser(req.user.id)) {
      sock.leave(conversationRoom(conversationId));
      sock.emit("conversation:left", { conversationId });
    }
    const leftover = await loadConversationMembers(conversationId);
    if (leftover.length) {
      const payload = await getConversationPayload(conversationId, leftover[0].id);
      io.to(conversationRoom(conversationId)).emit("conversation:updated", payload);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("Gruppe verlassen fehlgeschlagen:", err);
    return sendError(res, 500, "Gruppe konnte nicht verlassen werden.");
  }
});

app.get("/api/search", requireAuth, async (req, res) => {
  try {
    const q = sanitizeText(String(req.query.q || "")).slice(0, 80);
    if (q.length < 2) {
      return sendError(res, 400, "Bitte mindestens 2 Zeichen suchen.");
    }

    let conversationId = null;
    if (req.query.conversationId != null && req.query.conversationId !== "") {
      if (req.query.conversationId === "global") {
        conversationId = null;
      } else {
        conversationId = parsePositiveInt(req.query.conversationId);
        if (!conversationId) return sendError(res, 400, "Ungültige Unterhaltung.");
        if (!(await isConversationMember(req.user.id, conversationId))) {
          return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
        }
      }
    }

    const params = [req.user.id, likePattern(q)];
    let roomFilter = `
      AND (
        m.conversation_id IS NULL
        OR m.conversation_id IN (
          SELECT conversation_id FROM conversation_members WHERE user_id = $1
        )
      )
    `;
    if (Object.prototype.hasOwnProperty.call(req.query, "conversationId")) {
      params.push(conversationId);
      roomFilter = ` AND m.conversation_id IS NOT DISTINCT FROM $3 `;
    }

    const { rows } = await pool.query(
      `
      SELECT ${MESSAGE_SELECT},
             c.type AS conv_type, c.title AS conv_title
      FROM messages m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN uploads up ON up.id = m.upload_id
      LEFT JOIN messages r ON r.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = r.user_id
      LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE m.deleted_at IS NULL
        AND m.content ILIKE $2 ESCAPE '\\'
        ${roomFilter}
      ORDER BY m.created_at DESC
      LIMIT ${SEARCH_LIMIT}
      `,
      params
    );

    const messages = await attachReactions(rows.map(mapMessage), req.user.id);
    const results = messages.map((message, index) => {
      const row = rows[index];
      return {
        message,
        conversationId: message.conversationId,
        roomLabel:
          message.conversationId == null
            ? "Globaler Chat"
            : row.conv_type === "group"
              ? row.conv_title || "Gruppe"
              : "Privater Chat",
      };
    });
    return res.json({ query: q, results });
  } catch (err) {
    console.error("Suche fehlgeschlagen:", err);
    return sendError(res, 500, "Suche fehlgeschlagen.");
  }
});

app.get("/api/ai/status", requireAuth, (_req, res) => {
  return res.json(aiStatusPayload());
});

app.post("/api/ai/summarize", requireAuth, async (req, res) => {
  try {
    const conversationId =
      req.body?.conversationId == null || req.body?.conversationId === ""
        ? null
        : parsePositiveInt(req.body.conversationId);
    if (req.body?.conversationId && !conversationId) {
      return sendError(res, 400, "Ungültige Unterhaltung.");
    }
    if (!(await canAccessConversation(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    const history = await fetchMessages(conversationId, 40, req.user.id);
    let summary = localSummary(history);
    let source = "local";
    if (AI_READY) {
      try {
        const lines = history
          .filter((m) => !m.deleted)
          .map((m) => `${m.username}: ${(m.content || m.type || "").slice(0, 200)}`)
          .join("\n")
          .slice(0, 6000);
        summary = await callAiChat(
          [
            {
              role: "system",
              content: "Fasse den Chat auf Deutsch in 4–8 Sätzen zusammen. Keine Erfindung.",
            },
            { role: "user", content: lines || "Keine Nachrichten." },
          ],
          { maxTokens: 500 }
        );
        source = "llm";
      } catch (err) {
        console.error("LLM-Zusammenfassung fehlgeschlagen:", err.message);
      }
    }
    if (conversationId) {
      await pool.query(
        `UPDATE conversations SET summary = $1, summary_updated_at = NOW() WHERE id = $2`,
        [summary, conversationId]
      );
    }
    return res.json({ summary, source });
  } catch (err) {
    console.error("Zusammenfassung fehlgeschlagen:", err);
    return sendError(res, err.status || 500, err.message || "Zusammenfassung nicht verfügbar.");
  }
});

app.post("/api/ai/suggest-replies", requireAuth, async (req, res) => {
  try {
    const conversationId =
      req.body?.conversationId == null || req.body?.conversationId === ""
        ? null
        : parsePositiveInt(req.body.conversationId);
    if (req.body?.conversationId && !conversationId) {
      return sendError(res, 400, "Ungültige Unterhaltung.");
    }
    if (!(await canAccessConversation(req.user.id, conversationId))) {
      return sendError(res, 403, "Kein Zugriff auf diese Unterhaltung.");
    }
    const history = await fetchMessages(conversationId, 12, req.user.id);
    const last = [...history].reverse().find((m) => !m.deleted && m.userId !== req.user.id);
    let suggestions = heuristicReplies(last?.content || "");
    let source = "local";
    if (AI_READY && last) {
      try {
        const raw = await callAiChat(
          [
            {
              role: "system",
              content:
                "Antworte mit genau drei kurzen Chat-Antworten auf Deutsch, kommagetrennt, ohne Nummerierung.",
            },
            { role: "user", content: last.content || last.type },
          ],
          { maxTokens: 80, temperature: 0.7 }
        );
        const parts = raw
          .split(/[,\n;]+/)
          .map((s) => s.replace(/^\d+[\).:-]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 3);
        if (parts.length === 3) {
          suggestions = parts;
          source = "llm";
        }
      } catch (err) {
        console.error("LLM-Vorschläge fehlgeschlagen:", err.message);
      }
    }
    return res.json({ suggestions, source });
  } catch (err) {
    return sendError(res, err.status || 500, err.message || "Vorschläge nicht verfügbar.");
  }
});

async function persistUpload({ userId, kind, buffer, durationMs, originalName }) {
  const mime = detectMime(buffer);
  if (!mime) {
    const error = new Error("Dateityp nicht erlaubt.");
    error.status = 400;
    throw error;
  }

  if (kind === "image" && !IMAGE_MIMES.has(mime)) {
    const error = new Error("Nur JPEG, PNG, WebP oder GIF.");
    error.status = 400;
    throw error;
  }
  if (kind === "avatar" && !AVATAR_MIMES.has(mime)) {
    const error = new Error("Avatar: nur JPEG, PNG oder WebP.");
    error.status = 400;
    throw error;
  }
  if (kind === "voice" && !VOICE_MIMES.has(mime)) {
    const error = new Error("Sprachnachricht: WebM, OGG oder MP4/AAC.");
    error.status = 400;
    throw error;
  }
  if (kind === "file" && !FILE_MIMES.has(mime)) {
    const error = new Error("Anhang: nur PDF oder ZIP.");
    error.status = 400;
    throw error;
  }

  const maxBytes =
    kind === "voice" ? MAX_VOICE_BYTES : kind === "avatar" ? MAX_AVATAR_BYTES : kind === "file" ? MAX_FILE_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > maxBytes) {
    const error = new Error(`Datei ist zu groß (max. ${Math.round(maxBytes / (1024 * 1024))} MB).`);
    error.status = 413;
    throw error;
  }

  let duration = null;
  if (kind === "voice") {
    if (durationMs != null) {
      const n = Number(durationMs);
      if (!Number.isFinite(n) || n < 0 || n > MAX_VOICE_DURATION_MS + 1500) {
        const error = new Error("Sprachnachricht maximal 60 Sekunden.");
        error.status = 400;
        throw error;
      }
      duration = Math.round(n);
    }
  }

  const id = crypto.randomUUID();
  const storageName = `${id}${MIME_EXTENSION[mime]}`;
  const abs = safeUploadPath(storageName);
  if (!abs) {
    const error = new Error("Ungültiger Speicherpfad.");
    error.status = 500;
    throw error;
  }

  const cleanName = path
    .basename(String(originalName || `datei${MIME_EXTENSION[mime] || ""}`))
    .replace(/[^\w.\- äöüÄÖÜß()]/g, "_")
    .slice(0, 80);

  await fs.writeFile(abs, buffer);

  try {
    await pool.query(
      `INSERT INTO uploads (id, user_id, kind, mime, size_bytes, storage_name, duration_ms, original_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, kind, mime, buffer.length, storageName, duration, cleanName || null]
    );
  } catch (err) {
    await fs.unlink(abs).catch(() => {});
    throw err;
  }

  return { id, mime, kind, sizeBytes: buffer.length, durationMs: duration, name: cleanName };
}

app.post("/api/uploads", requireAuth, requireApproved, uploadLimiter, handleMulter, async (req, res) => {
  try {
    const kind = sanitizeText(String(req.body?.kind || "")).toLowerCase();
    if (!["image", "voice", "file"].includes(kind)) {
      return sendError(res, 400, "Upload-Art muss image, voice oder file sein.");
    }
    if (!req.file?.buffer) {
      return sendError(res, 400, "Keine Datei empfangen.");
    }

    const saved = await persistUpload({
      userId: req.user.id,
      kind,
      buffer: req.file.buffer,
      durationMs: req.body?.durationMs,
      originalName: req.file.originalname,
    });
    return res.status(201).json(saved);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("Upload fehlgeschlagen:", err);
    return sendError(res, status, err.message || "Upload fehlgeschlagen.");
  }
});

app.post("/api/me/avatar", requireAuth, uploadLimiter, handleMulter, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return sendError(res, 400, "Kein Bild empfangen.");
    }
    const saved = await persistUpload({
      userId: req.user.id,
      kind: "avatar",
      buffer: req.file.buffer,
    });
    const avatarUrl = `/api/files/${saved.id}`;
    const { rows } = await pool.query(
      `UPDATE users SET avatar_url = $1 WHERE id = $2
       RETURNING id, username, real_name, avatar_url, is_bot, is_admin, is_approved, last_seen_at`,
      [avatarUrl, req.user.id]
    );
    const user = toPublicUser(rows[0], { includeAdmin: true });
    refreshConnectionProfiles(user);
    io.emit("user:updated", user);
    return res.json(user);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("Avatar-Upload fehlgeschlagen:", err);
    return sendError(res, status, err.message || "Avatar konnte nicht gespeichert werden.");
  }
});

app.get("/api/files/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return sendError(res, 400, "Ungültige Datei.");
    }

    const { rows } = await pool.query(
      `
      SELECT up.*, m.conversation_id, m.id AS message_id
      FROM uploads up
      LEFT JOIN messages m ON m.upload_id = up.id
      WHERE up.id = $1
      `,
      [id]
    );
    const upload = rows[0];
    if (!upload) return sendError(res, 404, "Datei nicht gefunden.");

    const allowedMimes = new Set([...IMAGE_MIMES, ...AVATAR_MIMES, ...VOICE_MIMES, ...FILE_MIMES]);
    if (!allowedMimes.has(upload.mime)) {
      return sendError(res, 404, "Datei nicht gefunden.");
    }

    let allowed = false;
    if (upload.kind === "avatar") {
      allowed = true;
    } else if (upload.user_id === req.user.id && !upload.message_id) {
      allowed = true;
    } else if (upload.message_id && upload.conversation_id == null) {
      allowed = true;
    } else if (upload.conversation_id) {
      allowed = await isConversationMember(req.user.id, upload.conversation_id);
    }

    if (!allowed) return sendError(res, 403, "Kein Zugriff auf diese Datei.");

    const abs = safeUploadPath(upload.storage_name);
    if (!abs) return sendError(res, 400, "Ungültige Datei.");

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", upload.mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const filename = (upload.original_name || `${upload.kind}-${upload.id}${MIME_EXTENSION[upload.mime] || ""}`)
      .replace(/["\r\n]/g, "");
    const disposition = upload.kind === "file" && upload.mime !== "application/pdf" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    return res.sendFile(abs);
  } catch (err) {
    console.error("Datei ausliefern fehlgeschlagen:", err);
    return sendError(res, 500, "Datei konnte nicht geladen werden.");
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Socket.io — Authentifizierung, Historie, Broadcast, Online-Liste, DMs
// ---------------------------------------------------------------------------

/** socket.id → { userId, username, realName, avatarUrl, isApproved, isAdmin } */
const connections = new Map();
/** conversationKey → Map(userId → { username, realName, timer }) */
const typingByRoom = new Map();

function uniqueOnlineUsers() {
  const byId = new Map();
  for (const info of connections.values()) {
    if (!info.isApproved && !info.isAdmin) continue;
    byId.set(info.userId, {
      id: info.userId,
      username: info.username,
      realName: info.realName || "",
      avatarUrl: info.avatarUrl || "",
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    displayName(a).localeCompare(displayName(b), "de")
  );
}

function broadcastOnlineUsers() {
  io.emit("users:online", uniqueOnlineUsers());
}

function refreshConnectionProfiles(user) {
  for (const info of connections.values()) {
    if (info.userId === user.id) {
      info.username = user.username;
      info.realName = user.realName;
      info.avatarUrl = user.avatarUrl;
      if (user.isApproved != null) info.isApproved = Boolean(user.isApproved);
      if (user.isAdmin != null) info.isAdmin = Boolean(user.isAdmin);
    }
  }
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user?.id === user.id) {
      socket.user = { ...socket.user, ...user };
    }
  }
  broadcastOnlineUsers();
}

function socketsForUser(userId) {
  const list = [];
  for (const [sid, info] of connections) {
    if (info.userId === userId) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) list.push(sock);
    }
  }
  return list;
}

function emitToAdmins(event, payload) {
  for (const [sid, info] of connections) {
    if (!info.isAdmin) continue;
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.emit(event, payload);
  }
}

function applyAccountStatus(userId, { isApproved, isAdmin }) {
  for (const sock of socketsForUser(userId)) {
    sock.user = { ...sock.user, isApproved: Boolean(isApproved), isAdmin: Boolean(isAdmin) };
    const info = connections.get(sock.id);
    if (info) {
      info.isApproved = Boolean(isApproved);
      info.isAdmin = Boolean(isAdmin);
    }
    sock.emit("account:status", { isApproved: Boolean(isApproved), isAdmin: Boolean(isAdmin) });
  }
  broadcastOnlineUsers();
}

function socketCanPost(socket) {
  return Boolean(socket.user?.isApproved || socket.user?.isAdmin);
}

async function addSocketsToConversation(memberIds, conversationId) {
  const room = conversationRoom(conversationId);
  for (const memberId of memberIds) {
    const payload = await getConversationPayload(conversationId, memberId);
    for (const sock of socketsForUser(memberId)) {
      sock.join(room);
      if (payload) sock.emit("conversation:new", payload);
    }
  }
}

io.use((socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie || "";
    const match = rawCookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${COOKIE_NAME}=`));
    if (!match) return next(new Error("unauthorized"));

    const token = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const payload = verifyToken(token);
    socket.user = { id: payload.sub, username: payload.username };
    return next();
  } catch {
    return next(new Error("unauthorized"));
  }
});

function allowAction(socket, key, windowMs, max) {
  const now = Date.now();
  const bucket = `${key}Times`;
  socket[bucket] = (socket[bucket] || []).filter((t) => now - t < windowMs);
  if (socket[bucket].length >= max) return false;
  socket[bucket].push(now);
  return true;
}

function allowMessage(socket) {
  return allowAction(socket, "message", 10_000, 8);
}

function typingRoomKey(conversationId) {
  return conversationId == null ? "global" : String(conversationId);
}

function listTypers(conversationId, exceptUserId) {
  const map = typingByRoom.get(typingRoomKey(conversationId));
  if (!map) return [];
  return Array.from(map.entries())
    .filter(([id]) => id !== exceptUserId)
    .map(([id, info]) => ({ id, username: info.username, realName: info.realName || "" }));
}

function broadcastTyping(conversationId) {
  io.to(roomName(conversationId)).emit("typing:update", {
    conversationId,
    typers: listTypers(conversationId, null),
  });
}

function clearTyping(userId, conversationId) {
  const key = typingRoomKey(conversationId);
  const map = typingByRoom.get(key);
  if (!map) return;
  const entry = map.get(userId);
  if (entry?.timer) clearTimeout(entry.timer);
  map.delete(userId);
  if (!map.size) typingByRoom.delete(key);
  broadcastTyping(conversationId);
}

function clearTypingEverywhere(userId) {
  for (const [key, map] of typingByRoom) {
    if (!map.has(userId)) continue;
    const conversationId = key === "global" ? null : Number(key);
    clearTyping(userId, conversationId);
  }
}

function setTyping(user, conversationId) {
  const key = typingRoomKey(conversationId);
  let map = typingByRoom.get(key);
  if (!map) {
    map = new Map();
    typingByRoom.set(key, map);
  }
  const prev = map.get(user.id);
  if (prev?.timer) clearTimeout(prev.timer);
  map.set(user.id, {
    username: user.username,
    realName: user.realName || "",
    timer: setTimeout(() => clearTyping(user.id, conversationId), TYPING_TTL_MS),
  });
  broadcastTyping(conversationId);
}

async function insertAndBroadcastMessage({
  user,
  conversationId,
  type,
  content,
  uploadId,
  location,
  replyToId,
  transcript,
}) {
  const { rows } = await pool.query(
    `
    INSERT INTO messages (
      user_id, content, conversation_id, message_type, upload_id,
      location_lat, location_lng, location_accuracy, reply_to_id, transcript
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
    [
      user.id,
      fallbackContent(type, content, location),
      conversationId,
      type,
      uploadId,
      location?.lat ?? null,
      location?.lng ?? null,
      location?.accuracy ?? null,
      replyToId,
      transcript ? sanitizeText(String(transcript)).slice(0, 2000) : null,
    ]
  );

  const message = await loadPublicMessage(rows[0].id, user.id);
  io.to(roomName(conversationId)).emit("message:new", message);

  if (conversationId) {
    const members = await loadConversationMembers(conversationId);
    for (const member of members) {
      if (member.id === user.id) continue;
      const viewing = socketsForUser(member.id).some(
        (sock) => sock.activeConversationId === conversationId
      );
      if (viewing) {
        await markRead(member.id, conversationId, message.id);
        await notifyInbox(member.id, conversationId);
      } else {
        await notifyInbox(member.id, conversationId);
      }
    }
    await markRead(user.id, conversationId, message.id);
  } else {
    for (const sock of io.sockets.sockets.values()) {
      if (!sock.user || sock.user.id === user.id) continue;
      if (sock.activeConversationId == null) {
        await markRead(sock.user.id, null, message.id);
      }
      await notifyInbox(sock.user.id, null);
    }
    await markRead(user.id, null, message.id);
  }

  if (!user.isBot) {
    maybeReplyAsBot(message, conversationId, user).catch((err) =>
      console.error("Bot-Antwort fehlgeschlagen:", err)
    );
  }

  return message;
}

async function maybeReplyAsBot(userMessage, conversationId, fromUser) {
  const bot = await loadBotUser();
  if (!bot || fromUser.id === bot.id) return;
  if (userMessage.deleted) return;

  const text = userMessage.content || "";
  const mentioned = /(?:^|\s)@raum\b|^\/(help|hilfe)\b/i.test(text);
  let talk = false;
  if (conversationId) {
    const members = await loadConversationMembers(conversationId);
    talk = members.some((m) => m.id === bot.id);
  } else {
    talk = mentioned;
  }
  if (!talk) return;

  let reply = ruleBasedBotReply(text);
  if (AI_READY && text && !/^\/(help|hilfe|ping)\b/i.test(text.trim())) {
    try {
      reply = await callAiChat(
        [
          {
            role: "system",
            content:
              "Du bist raum, ein knapper, freundlicher Chat-Assistent auf Deutsch. Keine Tools, keine URLs erfinden.",
          },
          { role: "user", content: text.slice(0, 1000) },
        ],
        { maxTokens: 280 }
      );
    } catch (err) {
      console.error("Bot-LLM fehlgeschlagen:", err.message);
    }
  }

  await insertAndBroadcastMessage({
    user: bot,
    conversationId,
    type: "text",
    content: reply,
    replyToId: userMessage.id,
  });
}

io.on("connection", async (socket) => {
  const userId = socket.user.id;
  let profile;
  try {
    profile = await loadPublicUser(userId, { includeAdmin: true });
  } catch (err) {
    console.error("Profil für Socket fehlgeschlagen:", err);
  }
  if (!profile || profile.isBot) {
    socket.disconnect(true);
    return;
  }

  socket.user = profile;
  socket.activeConversationId = null;
  connections.set(socket.id, {
    userId: profile.id,
    username: profile.username,
    realName: profile.realName,
    avatarUrl: profile.avatarUrl,
    isApproved: Boolean(profile.isApproved),
    isAdmin: Boolean(profile.isAdmin),
  });
  await pool.query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId]);

  socket.join("global");

  try {
    const { rows } = await pool.query(
      `SELECT conversation_id FROM conversation_members WHERE user_id = $1`,
      [userId]
    );
    for (const row of rows) {
      socket.join(conversationRoom(row.conversation_id));
    }
  } catch (err) {
    console.error("Private Räume beitreten fehlgeschlagen:", err);
  }

  log(`Socket verbunden: ${profile.username} (${socket.id})`);
  broadcastOnlineUsers();

  try {
    const history = await fetchMessages(null, HISTORY_LIMIT, userId);
    socket.emit("messages:history", { conversationId: null, messages: history });
    socket.emit("inbox:unread", { conversationId: null, unreadCount: await countGlobalUnread(userId) });
  } catch (err) {
    console.error("Historie konnte nicht geladen werden:", err);
    socket.emit("chat:error", "Nachrichtenverlauf konnte nicht geladen werden.");
  }

  socket.on("conversation:open", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const conversationId =
        payload?.conversationId == null || payload?.conversationId === ""
          ? null
          : parsePositiveInt(payload.conversationId);

      if (payload?.conversationId != null && payload.conversationId !== "" && conversationId == null) {
        respond({ ok: false, error: "Ungültige Unterhaltung." });
        return;
      }

      if (conversationId && !(await isConversationMember(userId, conversationId))) {
        respond({ ok: false, error: "Kein Zugriff auf diese Unterhaltung." });
        return;
      }

      socket.activeConversationId = conversationId;
      const messages = await fetchMessages(conversationId, HISTORY_LIMIT, userId);
      const lastId = messages.length ? messages[messages.length - 1].id : null;
      const unreadCount = await markRead(userId, conversationId, lastId);
      socket.emit("messages:history", { conversationId, messages });
      socket.emit("inbox:unread", { conversationId, unreadCount });
      respond({ ok: true, unreadCount });
    } catch (err) {
      console.error("Unterhaltung öffnen fehlgeschlagen:", err);
      respond({ ok: false, error: "Verlauf konnte nicht geladen werden." });
    }
  });

  socket.on("message:send", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};

    try {
      if (!socketCanPost(socket)) {
        respond({ ok: false, error: "Dein Konto wartet noch auf Freigabe durch einen Admin." });
        return;
      }
      if (!allowMessage(socket)) {
        respond({ ok: false, error: "Zu viele Nachrichten in kurzer Zeit." });
        return;
      }

      const type = sanitizeText(String(payload?.type || "text")) || "text";
      if (!["text", "image", "location", "voice", "file"].includes(type)) {
        respond({ ok: false, error: "Unbekannter Nachrichtentyp." });
        return;
      }

      let conversationId = null;
      if (payload?.conversationId != null && payload.conversationId !== "") {
        conversationId = parsePositiveInt(payload.conversationId);
        if (!conversationId) {
          respond({ ok: false, error: "Ungültige Unterhaltung." });
          return;
        }
        if (!(await isConversationMember(userId, conversationId))) {
          respond({ ok: false, error: "Kein Zugriff auf diese Unterhaltung." });
          return;
        }
      }

      let replyToId = null;
      if (payload?.replyToId != null && payload.replyToId !== "") {
        const reply = await resolveReplyTo(payload.replyToId, conversationId);
        if (reply.error) {
          respond({ ok: false, error: reply.error });
          return;
        }
        replyToId = reply.id;
      }

      const liveUser = {
        id: socket.user.id,
        username: socket.user.username,
        realName: socket.user.realName || "",
        avatarUrl: socket.user.avatarUrl || "",
        isBot: false,
      };

      clearTyping(userId, conversationId);

      if (type === "text") {
        const content = sanitizeText(payload?.content || "");
        if (!content) {
          respond({ ok: false, error: "Nachricht darf nicht leer sein." });
          return;
        }
        if (content.length > MAX_MESSAGE_LENGTH) {
          respond({ ok: false, error: `Maximal ${MAX_MESSAGE_LENGTH} Zeichen.` });
          return;
        }
        if (moderationBlocked(content)) {
          respond({ ok: false, error: "Nachricht wurde von der Moderation blockiert." });
          return;
        }
        const message = await insertAndBroadcastMessage({
          user: liveUser,
          conversationId,
          type,
          content,
          replyToId,
        });
        respond({ ok: true, id: message.id });
        return;
      }

      if (type === "location") {
        const lat = Number(payload?.lat ?? payload?.location?.lat);
        const lng = Number(payload?.lng ?? payload?.location?.lng);
        const accuracyRaw = payload?.accuracy ?? payload?.location?.accuracy;
        const accuracy = accuracyRaw == null || accuracyRaw === "" ? null : Number(accuracyRaw);
        if (!isValidLatLng(lat, lng)) {
          respond({ ok: false, error: "Ungültige Koordinaten." });
          return;
        }
        if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100_000)) {
          respond({ ok: false, error: "Ungültige Standortgenauigkeit." });
          return;
        }
        const message = await insertAndBroadcastMessage({
          user: liveUser,
          conversationId,
          type,
          location: { lat, lng, accuracy },
          replyToId,
        });
        respond({ ok: true, id: message.id });
        return;
      }

      if (type === "image" || type === "voice" || type === "file") {
        const uploadId = String(payload?.uploadId || "");
        if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
          respond({ ok: false, error: "Ungültige Datei." });
          return;
        }

        const { rows: uploadRows } = await pool.query(`SELECT * FROM uploads WHERE id = $1`, [uploadId]);
        const upload = uploadRows[0];
        if (!upload || upload.user_id !== userId || upload.kind !== type) {
          respond({ ok: false, error: "Datei nicht gefunden." });
          return;
        }

        const used = await pool.query(`SELECT 1 FROM messages WHERE upload_id = $1 LIMIT 1`, [uploadId]);
        if (used.rows.length) {
          respond({ ok: false, error: "Datei wurde bereits gesendet." });
          return;
        }

        const caption = sanitizeText(payload?.content || "").slice(0, MAX_MESSAGE_LENGTH);
        const transcript =
          type === "voice" ? sanitizeText(String(payload?.transcript || "")).slice(0, 2000) : "";
        const message = await insertAndBroadcastMessage({
          user: liveUser,
          conversationId,
          type,
          content: caption,
          uploadId,
          replyToId,
          transcript: transcript || null,
        });
        respond({ ok: true, id: message.id });
        return;
      }
    } catch (err) {
      console.error("Nachricht speichern fehlgeschlagen:", err);
      respond({ ok: false, error: "Nachricht konnte nicht gesendet werden." });
    }
  });

  socket.on("typing:start", async (payload) => {
    try {
      if (!socketCanPost(socket)) return;
      if (!allowAction(socket, "typing", 2_000, 6)) return;
      const conversationId =
        payload?.conversationId == null || payload?.conversationId === ""
          ? null
          : parsePositiveInt(payload.conversationId);
      if (payload?.conversationId != null && payload.conversationId !== "" && !conversationId) return;
      if (!(await canAccessConversation(userId, conversationId))) return;
      setTyping(socket.user, conversationId);
    } catch (err) {
      console.error("Tipp-Anzeige fehlgeschlagen:", err);
    }
  });

  socket.on("typing:stop", async (payload) => {
    try {
      const conversationId =
        payload?.conversationId == null || payload?.conversationId === ""
          ? null
          : parsePositiveInt(payload.conversationId);
      if (payload?.conversationId != null && payload.conversationId !== "" && !conversationId) return;
      if (!(await canAccessConversation(userId, conversationId))) return;
      clearTyping(userId, conversationId);
    } catch (err) {
      console.error("Tipp-Anzeige stoppen fehlgeschlagen:", err);
    }
  });

  socket.on("reaction:toggle", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      if (!socketCanPost(socket)) {
        respond({ ok: false, error: "Dein Konto wartet noch auf Freigabe durch einen Admin." });
        return;
      }
      if (!allowAction(socket, "reaction", 5_000, 20)) {
        respond({ ok: false, error: "Zu viele Reaktionen in kurzer Zeit." });
        return;
      }
      const messageId = parsePositiveInt(payload?.messageId);
      const emoji = String(payload?.emoji || "");
      if (!messageId) {
        respond({ ok: false, error: "Ungültige Nachricht." });
        return;
      }
      if (!isAllowedReaction(emoji)) {
        respond({ ok: false, error: "Dieses Emoji ist nicht erlaubt." });
        return;
      }

      const row = await loadMessageRow(messageId);
      if (!row || row.deleted_at) {
        respond({ ok: false, error: "Nachricht nicht gefunden." });
        return;
      }
      if (!(await canAccessConversation(userId, row.conversation_id))) {
        respond({ ok: false, error: "Kein Zugriff auf diese Nachricht." });
        return;
      }

      const existing = await pool.query(
        `SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji]
      );
      if (existing.rows.length) {
        await pool.query(
          `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
          [messageId, userId, emoji]
        );
      } else {
        await pool.query(
          `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`,
          [messageId, userId, emoji]
        );
      }

      const reactions = (await fetchReactionsForMessages([messageId], userId)).get(messageId) || [];
      const update = {
        messageId,
        conversationId: row.conversation_id,
        reactions,
      };
      io.to(roomName(row.conversation_id)).emit("reaction:update", update);
      respond({ ok: true, reactions });
    } catch (err) {
      console.error("Reaktion fehlgeschlagen:", err);
      respond({ ok: false, error: "Reaktion konnte nicht gespeichert werden." });
    }
  });

  socket.on("message:delete", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const messageId = parsePositiveInt(payload?.messageId);
      if (!messageId) {
        respond({ ok: false, error: "Ungültige Nachricht." });
        return;
      }
      const { rows } = await pool.query(
        `SELECT id, user_id, conversation_id, deleted_at FROM messages WHERE id = $1`,
        [messageId]
      );
      const row = rows[0];
      if (!row || row.deleted_at) {
        respond({ ok: false, error: "Nachricht nicht gefunden." });
        return;
      }
      if (row.user_id !== userId) {
        respond({ ok: false, error: "Nur eigene Nachrichten können gelöscht werden." });
        return;
      }
      if (!(await canAccessConversation(userId, row.conversation_id))) {
        respond({ ok: false, error: "Kein Zugriff auf diese Nachricht." });
        return;
      }

      await pool.query(`UPDATE messages SET deleted_at = NOW(), content = '' WHERE id = $1`, [messageId]);
      const message = await loadPublicMessage(messageId, userId);
      io.to(roomName(row.conversation_id)).emit("message:deleted", message);
      respond({ ok: true });
    } catch (err) {
      console.error("Löschen fehlgeschlagen:", err);
      respond({ ok: false, error: "Nachricht konnte nicht gelöscht werden." });
    }
  });

  socket.on("conversation:unread", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const conversationId =
        payload?.conversationId == null || payload?.conversationId === ""
          ? null
          : parsePositiveInt(payload.conversationId);
      if (payload?.conversationId != null && payload.conversationId !== "" && !conversationId) {
        respond({ ok: false, error: "Ungültige Unterhaltung." });
        return;
      }
      if (!(await canAccessConversation(userId, conversationId))) {
        respond({ ok: false, error: "Kein Zugriff auf diese Unterhaltung." });
        return;
      }
      const unreadCount = await markUnread(userId, conversationId);
      emitToUser(userId, "inbox:unread", { conversationId, unreadCount });
      respond({ ok: true, unreadCount });
    } catch (err) {
      console.error("Ungelesen markieren fehlgeschlagen:", err);
      respond({ ok: false, error: "Konnte nicht als ungelesen markiert werden." });
    }
  });

  socket.on("message:edit", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      if (!socketCanPost(socket)) {
        respond({ ok: false, error: "Dein Konto wartet noch auf Freigabe durch einen Admin." });
        return;
      }
      const messageId = parsePositiveInt(payload?.messageId);
      const content = sanitizeText(payload?.content || "");
      if (!messageId) {
        respond({ ok: false, error: "Ungültige Nachricht." });
        return;
      }
      if (!content) {
        respond({ ok: false, error: "Nachricht darf nicht leer sein." });
        return;
      }
      if (content.length > MAX_MESSAGE_LENGTH) {
        respond({ ok: false, error: `Maximal ${MAX_MESSAGE_LENGTH} Zeichen.` });
        return;
      }
      if (moderationBlocked(content)) {
        respond({ ok: false, error: "Nachricht wurde von der Moderation blockiert." });
        return;
      }
      const { rows } = await pool.query(
        `SELECT id, user_id, conversation_id, message_type, deleted_at, created_at FROM messages WHERE id = $1`,
        [messageId]
      );
      const row = rows[0];
      if (!row || row.deleted_at) {
        respond({ ok: false, error: "Nachricht nicht gefunden." });
        return;
      }
      if (row.user_id !== userId || row.message_type !== "text") {
        respond({ ok: false, error: "Nur eigene Texte können bearbeitet werden." });
        return;
      }
      if (Date.now() - new Date(row.created_at).getTime() > MAX_EDIT_AGE_MS) {
        respond({ ok: false, error: "Bearbeiten nur innerhalb von 24 Stunden." });
        return;
      }
      await pool.query(`UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2`, [
        content,
        messageId,
      ]);
      const message = await loadPublicMessage(messageId, userId);
      io.to(roomName(row.conversation_id)).emit("message:edited", message);
      respond({ ok: true });
    } catch (err) {
      console.error("Bearbeiten fehlgeschlagen:", err);
      respond({ ok: false, error: "Nachricht konnte nicht bearbeitet werden." });
    }
  });

  socket.on("message:forward", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      if (!socketCanPost(socket)) {
        respond({ ok: false, error: "Dein Konto wartet noch auf Freigabe durch einen Admin." });
        return;
      }
      if (!allowMessage(socket)) {
        respond({ ok: false, error: "Zu viele Nachrichten in kurzer Zeit." });
        return;
      }
      const messageId = parsePositiveInt(payload?.messageId);
      const targetId =
        payload?.conversationId == null || payload?.conversationId === ""
          ? null
          : parsePositiveInt(payload.conversationId);
      if (!messageId) {
        respond({ ok: false, error: "Ungültige Nachricht." });
        return;
      }
      if (payload?.conversationId != null && payload.conversationId !== "" && !targetId) {
        respond({ ok: false, error: "Ungültige Unterhaltung." });
        return;
      }
      if (!(await canAccessConversation(userId, targetId))) {
        respond({ ok: false, error: "Kein Zugriff auf das Ziel." });
        return;
      }
      const source = await loadPublicMessage(messageId, userId);
      if (!source || source.deleted) {
        respond({ ok: false, error: "Nachricht nicht gefunden." });
        return;
      }
      if (!(await canAccessConversation(userId, source.conversationId))) {
        respond({ ok: false, error: "Kein Zugriff auf die Ursprungsnachricht." });
        return;
      }
      const snippet = source.content || previewForward(source);
      const content = `Weitergeleitet von ${source.username}: ${snippet}`.slice(0, MAX_MESSAGE_LENGTH);
      const liveUser = {
        id: socket.user.id,
        username: socket.user.username,
        realName: socket.user.realName || "",
        avatarUrl: socket.user.avatarUrl || "",
        isBot: false,
      };
      const message = await insertAndBroadcastMessage({
        user: liveUser,
        conversationId: targetId,
        type: "text",
        content,
      });
      respond({ ok: true, id: message.id });
    } catch (err) {
      console.error("Weiterleiten fehlgeschlagen:", err);
      respond({ ok: false, error: "Weiterleiten fehlgeschlagen." });
    }
  });

  socket.on("disconnect", async (reason) => {
    connections.delete(socket.id);
    clearTypingEverywhere(userId);
    if (!socketsForUser(userId).length) {
      await pool.query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId]).catch(() => {});
      const updated = await loadPublicUser(userId).catch(() => null);
      if (updated) io.emit("user:updated", updated);
    }
    log(`Socket getrennt: ${profile.username} (${reason})`);
    broadcastOnlineUsers();
  });
});

// ---------------------------------------------------------------------------
// Start / sauberes Herunterfahren (wichtig für Docker-Stop)
// ---------------------------------------------------------------------------
async function shutdown(signal) {
  log(`${signal} empfangen — fahre herunter…`);
  io.close();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start() {
  await waitForDatabase();
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await initDatabase();
  await ensureAssistantBot();
  await ensureAdminUser();

  server.listen(PORT, "0.0.0.0", () => {
    log(`Chat-Server lauscht auf Port ${PORT} (${NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error("Start fehlgeschlagen:", err);
  process.exit(1);
});
