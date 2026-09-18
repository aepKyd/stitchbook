/* Крестик — service worker.
   Стратегия: приложение целиком лежит в кэше и открывается без сети.
   Обновление: новая версия ставится рядом и включается по кнопке «Обновить». */
const VERSION = "stitchbook-v1";
const ASSETS = [
  "./",
  "index.html",
  "fonts.css",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "fonts/inter-latin-400-normal.woff2",
  "fonts/inter-latin-500-normal.woff2",
  "fonts/inter-latin-600-normal.woff2",
  "fonts/inter-cyrillic-400-normal.woff2",
  "fonts/inter-cyrillic-500-normal.woff2",
  "fonts/inter-cyrillic-600-normal.woff2",
  "fonts/jetbrains-mono-latin-400-normal.woff2",
  "fonts/jetbrains-mono-latin-600-normal.woff2",
  "fonts/jetbrains-mono-cyrillic-400-normal.woff2",
  "fonts/jetbrains-mono-cyrillic-600-normal.woff2",
  "fonts/unbounded-latin-700-normal.woff2",
  "fonts/unbounded-cyrillic-700-normal.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // по одному: один битый файл не должен рушить всю установку
    await Promise.all(ASSETS.map(u => cache.add(u).catch(() => {})));
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // навигация: всегда отдаём оболочку из кэша, сеть — только чтобы обновить её
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cached = await caches.match("index.html");
      const net = fetch(req).then(r => {
        if (r.ok) caches.open(VERSION).then(c => c.put("index.html", r.clone()));
        return r;
      }).catch(() => null);
      return cached || (await net) || new Response("Офлайн", { status: 503 });
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) {
        const c = await caches.open(VERSION);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return new Response("", { status: 504 });
    }
  })());
});
