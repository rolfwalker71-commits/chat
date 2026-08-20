/* global self, caches, fetch, clients */
const CACHE = "mychat-shell-v31";
const SHARE_CACHE = "mychat-share";
const PRECACHE = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/logo.png",
  "/icons/logo.svg",
  "/icons/pwa-192.png",
  "/icons/pwa-512.png",
  "/icons/pwa-maskable.png",
  "/icons/apple-touch.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (path) => {
          const url = new URL(path, self.location.origin);
          url.searchParams.set("sw", CACHE);
          const response = await fetch(url, { cache: "reload" });
          if (!response.ok) throw new Error(`Precache fehlgeschlagen: ${path}`);
          await cache.put(path, response);
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE && key !== SHARE_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === "/share" && event.request.method === "POST") {
    event.respondWith(handleSharePost(event.request));
    return;
  }

  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  const networkFirst =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest");

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

async function handleSharePost(request) {
  try {
    const form = await request.formData();
    const record = {
      title: String(form.get("title") || ""),
      text: String(form.get("text") || ""),
      url: String(form.get("url") || ""),
      files: [],
    };
    const cache = await caches.open(SHARE_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => cache.delete(key)));
    let index = 0;
    for (const file of form.getAll("files")) {
      if (!file || typeof file === "string" || !file.size) continue;
      const keyUrl = `https://share.local/${index}`;
      index += 1;
      await cache.put(
        keyUrl,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name || "datei"),
          },
        })
      );
      record.files.push({ key: keyUrl, name: file.name || "datei", type: file.type || "", size: file.size });
    }
    await cache.put("pending", new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json" } }));
  } catch (err) {
    console.error("Share-Target im Service Worker fehlgeschlagen:", err);
  }
  return Response.redirect("/?share=1", 303);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "take-share") {
    event.waitUntil(replyShare(event.ports[0]));
  }
});

async function replyShare(port) {
  if (!port) return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const meta = await cache.match("pending");
    if (!meta) {
      port.postMessage(null);
      return;
    }
    const record = await meta.json();
    const files = [];
    for (const item of record.files || []) {
      const stored = await cache.match(item.key);
      if (!stored) continue;
      files.push({
        name: item.name,
        type: item.type,
        blob: await stored.blob(),
      });
    }
    await Promise.all((await cache.keys()).map((key) => cache.delete(key)));
    port.postMessage({
      title: record.title || "",
      text: record.text || "",
      url: record.url || "",
      files,
    });
  } catch {
    port.postMessage(null);
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  if (typeof data.badgeCount === "number" && self.registration.setAppBadge) {
    try {
      if (data.badgeCount > 0) await self.registration.setAppBadge(data.badgeCount);
      else await self.registration.clearAppBadge();
    } catch {
      // Badging API ist optional.
    }
  }

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows.some((client) => client.focused)) {
    return;
  }

  const conversationId = Object.prototype.hasOwnProperty.call(data, "conversationId")
    ? data.conversationId
    : null;

  await self.registration.showNotification(data.title || "MyChat", {
    body: data.body || "Neue Nachricht",
    icon: data.icon || "/icons/pwa-192.png",
    badge: data.badge || "/icons/pwa-192.png",
    image: data.image || undefined,
    tag: data.tag || "mychat",
    renotify: true,
    data: { conversationId },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId ?? null;
  event.waitUntil(openChat(conversationId));
});

async function openChat(conversationId) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (client.url.startsWith(self.location.origin)) {
      client.postMessage({ type: "open-conversation", conversationId });
      if ("focus" in client) await client.focus();
      return;
    }
  }
  const path = conversationId == null ? "/?c=global" : `/?c=${encodeURIComponent(conversationId)}`;
  await self.clients.openWindow(path);
}
