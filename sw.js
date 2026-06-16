// outil-archi/sw.js
// NOTE: bump this version string on every deploy so clients pick up new code.
const CACHE = 'outil-archi-v3';
const ASSETS = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/geometry.js', './js/prompt.js', './js/storage.js',
  './js/planEditor.js', './js/ambiance.js', './js/exportPdf.js', './js/pwa.js',
  'https://unpkg.com/konva@9/konva.min.js',
  'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // never intercept Pollinations images (always fresh / needs network)
  if (req.url.includes('image.pollinations.ai')) return;
  if (req.method !== 'GET') return;
  // Network-first: always try the network so deployed fixes reach users;
  // refresh the cache on success; fall back to cache only when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
