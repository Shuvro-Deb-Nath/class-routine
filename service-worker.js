const CACHE_NAME = "routine-v20";

const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/UULogo.webp",
  "/y.png",
  "/manifest.json"
];

// Install → cache files
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate → cleanup old cache
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
});

// Fetch → offline first
self.addEventListener("fetch", e => {
  // Only cache YOUR files (same origin)
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});


