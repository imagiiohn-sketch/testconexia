/* Conexia CLM — PWA Service Worker v4.
   Defensive: NEVER returns undefined from a fetch handler. */
const CACHE_NAME = "conexia-v4";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// Force activation when the page requests it (see +html.tsx registration script)
self.addEventListener("message", (event) => {
  if (event && event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function offlineFallback() {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match("/index.html")) ||
    (await cache.match("/")) ||
    new Response("<h1>Conexia · Sin conexión</h1>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET requests; let the browser handle POST/PATCH/DELETE natively
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // NEVER intercept API traffic — always go straight to network
  if (url.pathname.startsWith("/api/")) return;
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, cache fallback, then offline shell
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (_e) {
        return offlineFallback();
      }
    })());
    return;
  }

  // Everything else: cache-first with network fallback (always returns a Response)
  event.respondWith((async () => {
    try {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === "basic") {
        const copy = fresh.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (_e) {
      return new Response("", { status: 504, statusText: "Gateway Timeout" });
    }
  })());
});
