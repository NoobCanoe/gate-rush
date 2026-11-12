// Offline support. Network first, so a new version shows up the next time the
// game is opened online; the cache is the fallback when there is no connection.
const CACHE_VERSION = 'gate-rush-v1';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/main.js', 'src/rules.js', 'src/levelgen.js', 'src/sim.js', 'src/save.js',
  'src/input.js', 'src/render.js', 'src/audio.js', 'src/ui.js',
  'vendor/three.module.min.js', 'icons/icon-180.png', 'icons/icon-512.png',
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!cached) return fresh;
    fresh.catch(() => {}); // the cache answers if the network fails
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([fresh.catch(() => cached), timeout]);
  })());
});
