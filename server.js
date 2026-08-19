/**
 * =============================================================================
 * server.js — Backend der Chat-Anwendung
 * =============================================================================
 *
 * Architektur-Überblick:
 *   - Express liefert das Frontend (public/) und REST-Endpunkte für Auth.
 *   - Socket.io übernimmt den Echtzeit-Chat (Nachrichten + Online-Status).
 *   - PostgreSQL speichert Benutzer und Nachrichten dauerhaft.
 *   - JWT in einem httpOnly-Cookie hält die Session (kein Token im localStorage).
 *
 * Sicherheit (Kurzfassung):
 *   - Passwörter: bcrypt mit 12 Runden
 *   - XSS: Bibliothek `xss` (Whitelist leer = alle Tags entfernen) + Frontend textContent
 *   - SQL-Injection: ausschließlich parametrisierte Queries
 *   - Rate-Limiting auf Login/Registrierung
 *   - Helmet-HTTP-Header
 * =============================================================================
 */

require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
} = process.env;

const PORT = Number(APP_PORT) || 3355;
const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = "chat_token";
const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 32;
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;
const HISTORY_LIMIT = 50;

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

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages (created_at DESC);
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

async function fetchLastMessages(limit = HISTORY_LIMIT) {
  const { rows } = await pool.query(
    `
    SELECT m.id, m.content, m.created_at, u.username
    FROM (
      SELECT id, user_id, content, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT $1
    ) m
    JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at ASC
    `,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  }));
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

// Helmet: Standard-Header. CSP erlaubt Tailwind-CDN, Google Fonts und WebSockets.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
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

app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Brute-Force-Schutz nur auf Auth-Routen (Chat-Nachrichten laufen über Socket.io).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
});

// ---------------------------------------------------------------------------
// REST: Gesundheit, Session, Registrierung, Login, Logout
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get("/api/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return sendError(res, 401, "Nicht angemeldet.");
  return res.json({ id: user.id, username: user.username });
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
    if (!isValidPassword(password)) {
      return sendError(res, 400, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username`,
      [username, passwordHash]
    );

    const user = rows[0];
    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    log(`Registrierung: ${user.username}`);
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    // 23505 = unique_violation (Benutzername bereits vergeben)
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
      `SELECT id, username, password_hash FROM users WHERE username = $1`,
      [username]
    );

    const user = rows[0];
    // Gleiche Fehlermeldung bei unbekanntem User und falschem Passwort (keine Enumeration).
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordOk) {
      return sendError(res, 401, "Ungültige Anmeldedaten.");
    }

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    log(`Login: ${user.username}`);
    return res.json({ id: user.id, username: user.username });
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

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Socket.io — Authentifizierung, Historie, Broadcast, Online-Liste
// ---------------------------------------------------------------------------

/** socket.id → { userId, username } — eine Zeile pro Verbindung (Tabs zählen separat). */
const connections = new Map();

function uniqueOnlineUsers() {
  const byId = new Map();
  for (const info of connections.values()) {
    byId.set(info.userId, { id: info.userId, username: info.username });
  }
  return Array.from(byId.values()).sort((a, b) => a.username.localeCompare(b.username, "de"));
}

function broadcastOnlineUsers() {
  io.emit("users:online", uniqueOnlineUsers());
}

// Handshake: JWT aus dem Cookie prüfen, bevor die Verbindung angenommen wird.
io.use((socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie || "";
    const match = rawCookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE_NAME}=`));
    if (!match) return next(new Error("unauthorized"));

    const token = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const payload = verifyToken(token);
    socket.user = { id: payload.sub, username: payload.username };
    return next();
  } catch {
    return next(new Error("unauthorized"));
  }
});

// Einfaches serverseitiges Flood-Limit: max. 8 Nachrichten / 10 Sekunden pro Socket.
function allowMessage(socket) {
  const now = Date.now();
  const windowMs = 10_000;
  const max = 8;
  socket.messageTimes = (socket.messageTimes || []).filter((t) => now - t < windowMs);
  if (socket.messageTimes.length >= max) return false;
  socket.messageTimes.push(now);
  return true;
}

io.on("connection", async (socket) => {
  const { id: userId, username } = socket.user;
  connections.set(socket.id, { userId, username });
  log(`Socket verbunden: ${username} (${socket.id})`);
  broadcastOnlineUsers();

  try {
    const history = await fetchLastMessages(HISTORY_LIMIT);
    socket.emit("messages:history", history);
  } catch (err) {
    console.error("Historie konnte nicht geladen werden:", err);
    socket.emit("chat:error", "Nachrichtenverlauf konnte nicht geladen werden.");
  }

  socket.on("message:send", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};

    try {
      if (!allowMessage(socket)) {
        respond({ ok: false, error: "Zu viele Nachrichten in kurzer Zeit." });
        return;
      }

      const content = sanitizeText(payload?.content || "");
      if (!content) {
        respond({ ok: false, error: "Nachricht darf nicht leer sein." });
        return;
      }
      if (content.length > MAX_MESSAGE_LENGTH) {
        respond({ ok: false, error: `Maximal ${MAX_MESSAGE_LENGTH} Zeichen.` });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO messages (user_id, content)
         VALUES ($1, $2)
         RETURNING id, content, created_at`,
        [userId, content]
      );

      const saved = rows[0];
      const message = {
        id: saved.id,
        username,
        content: saved.content,
        createdAt: saved.created_at.toISOString(),
      };

      io.emit("message:new", message);
      respond({ ok: true, id: message.id });
    } catch (err) {
      console.error("Nachricht speichern fehlgeschlagen:", err);
      respond({ ok: false, error: "Nachricht konnte nicht gesendet werden." });
    }
  });

  socket.on("disconnect", (reason) => {
    connections.delete(socket.id);
    log(`Socket getrennt: ${username} (${reason})`);
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
  await initDatabase();

  server.listen(PORT, "0.0.0.0", () => {
    log(`Chat-Server lauscht auf Port ${PORT} (${NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error("Start fehlgeschlagen:", err);
  process.exit(1);
});
