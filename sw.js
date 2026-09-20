/** Service Worker: שומר את כל האפליקציה במטמון כדי שתעבוד גם בלי אינטרנט (נקודה חמה בלבד) */
const CACHE = 'wavelength-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['.', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/icon.svg'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// קודם רשת (כדי לקבל עדכונים), ובנפילה - מהמטמון
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('index.html'))),
  );
});
