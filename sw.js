const CACHE_NAME = "is-takip-shell-v1";
const SHELL_FILES = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/offline.html",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API cagrilari: her zaman sunucudan taze veri iste (calisma kaydi verisi
  // asla eski/cache'lenmis olmamali). Basarisiz olursa hata dondur, sahte
  // veri gosterme.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Sayfa navigasyonu: once agdan dene, olmazsa cache, o da olmazsa
  // cevrimdisi sayfasini goster.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put("/", res.clone()));
          return res;
        })
        .catch(() =>
          caches.match("/").then((cached) => cached || caches.match("/static/offline.html"))
        )
    );
    return;
  }

  // Statik dosyalar (css/js/icon): cache-first, arka planda guncelle.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
