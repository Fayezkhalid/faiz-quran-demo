// يخلي التطبيق يشتغل بدون إنترنت بعد أول فتح
const VERSION = 'nagham-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'js/app.js',
  'js/engine.js',
  'js/worklets.js',
  'js/music.js',
  'js/demos.js',
  'js/analysis.js',
  'js/wav.js',
  'js/db.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // الكتالوج دايماً من الشبكة عشان تظهر الإضافات الجديدة
  if (url.pathname.endsWith('catalog.json')) return;
  if (url.origin === location.origin) {
    // الشبكة أولاً (تحديثات فورية) والكاش احتياط بدون إنترنت
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
  } else if (url.host.includes('fonts.')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
  }
});
