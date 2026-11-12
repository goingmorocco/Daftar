// Daftar service worker — makes the app installable and lets it open without a connection.
// Network first: when online you always get the latest version; the cache is only a fallback.
const CACHE = 'daftar-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/main.js', 'js/api.js', 'js/logic.js', 'js/ui.js', 'js/demo.js',
  'js/views/index.js', 'js/views/core.js', 'js/views/common.js', 'js/views/schedule.js', 'js/views/money.js', 'js/views/people.js', 'js/views/admin.js',
  'fonts/comfortaa-latin-wght-normal.woff2', 'fonts/comfortaa-latin-ext-wght-normal.woff2', 'icons/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !cdn) return;            // database & login calls always go straight to the network
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
