const CACHE_NAME = "routine-v32";

const ASSETS = [
  "/",
  "/index.html",
  "/style.css?v=32",
  "/script.js?v=32",
  "/glass.css?v=32",
  "/admin-glass.css?v=32",
  "/effects.css?v=32",
  "/admin-enhance.js?v=32",
  "/shapes.js?v=32",
  "/shapes.css?v=32",
  "/enhance.js?v=32",
  "/plus-core.js?v=32",
  "/UULogo.webp",
  "/y.png",
  "/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(
      ASSETS.map(async asset => {
        try {
          const response = await fetch(asset, {
            cache: "reload"
          });

          if (response.ok) {
            await cache.put(asset, response);
          }
        } catch (error) {
          console.warn("Could not cache asset:", asset);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    url.origin !== self.location.origin ||
    request.method !== "GET"
  ) {
    return;
  }

  // Always try the network for the app shell and code.
  const isAppFile =
    request.mode === "navigate" ||
    /\.(html|js|css|json)$/i.test(url.pathname);

  if (isAppFile) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, {
          cache: "no-store"
        });

        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const home = await caches.match("/index.html");
          if (home) return home;
        }

        return new Response("Offline and no cached copy available.", {
          status: 503,
          headers: { "Content-Type": "text/plain" }
        });
      }
    })());

    return;
  }

  // Other static assets: cache first, then network.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    return fetch(request);
  })());
});
