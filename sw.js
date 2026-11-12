// Offline support. The game always starts from the cache, so it launches
// instantly and works with no connection. After it has started, the page asks
// for a refresh: every file is downloaded again and, only if all of them
// arrive, the cache is replaced as a whole. The new version is used from the
// next launch, so one launch never mixes old and new files.
const CACHE = 'gate-rush-v2';
const STAGING = 'gate-rush-staging';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/main.js', 'src/rules.js', 'src/levelgen.js', 'src/sim.js', 'src/save.js',
  'src/input.js', 'src/render.js', 'src/audio.js', 'src/ui.js',
  'vendor/three.module.min.js', 'icons/icon-180.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || fetch(req);
  })());
});

async function refresh() {
  try {
    const fresh = [];
    for (const file of FILES) {
      const res = await fetch(new Request(file, { cache: 'no-cache' }));
      if (!res || !res.ok) throw new Error('refresh failed: ' + file);
      fresh.push([file, res]);
    }
    // Everything arrived: stage it, then replace the live cache.
    const staging = await caches.open(STAGING);
    for (const [file, res] of fresh) await staging.put(file, res.clone());
    const cache = await caches.open(CACHE);
    for (const [file, res] of fresh) await cache.put(file, res);
  } catch {
    // Offline or a partial download: keep what we have.
  } finally {
    await caches.delete(STAGING);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'refresh') event.waitUntil(refresh());
});
