// Allo Cars service worker: makes the site installable and keeps pages you opened readable offline.
//   pages, scripts, styles and /data/ → network first; after 3 s, or offline, the copy saved last time
//   fonts and images   → a saved copy answers at once and is refreshed in the background
//   anything not GET, or from another site → straight to the network, never saved
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const MAX_PAGES = 60;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![PAGES, STATIC].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = url.pathname.startsWith("/assets/fonts/") || url.pathname.startsWith("/icons/") || /\.(svg|png)$/.test(url.pathname);
  event.respondWith(isStatic ? staleWhileRevalidate(req, event) : networkFirst(req, url, event));
});

const isHtml = (res) => (res.headers.get("content-type") || "").includes("text/html");

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    // The host answers a missing file with an HTML page: only keep real files.
    if (res.ok && !isHtml(res)) cache.put(req, res.clone());
    return res;
  });
  if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
  return fresh;
}

async function networkFirst(req, url, event) {
  const cache = await caches.open(PAGES);
  const fresh = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic") { await cache.put(req, res.clone()); trim(cache); }
    return res;
  });
  event.waitUntil(fresh.catch(() => {}));
  try {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (!cached) return await fresh;
    return await Promise.race([fresh, new Promise((ok) => setTimeout(ok, 3000, cached))]);
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await cache.match(url.pathname.startsWith("/de/") ? "/de/" : "/");
      if (home) return home;
      return new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    throw err;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

const OFFLINE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Allo Cars</title><style>body{font:1.05rem/1.5 system-ui,sans-serif;background:#f6f5f2;color:#17191b;margin:0;padding:48px 20px;text-align:center}
b{display:inline-block;background:#ffcc00;padding:4px 10px;border-radius:8px;margin-bottom:12px}</style></head>
<body><b>Allo Cars</b><p>Offline. Bitte später nochmal versuchen.<br>You're offline. Please try again later.</p></body></html>`;
