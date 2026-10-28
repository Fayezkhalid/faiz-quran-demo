// يخلي التطبيق يشتغل بدون إنترنت بعد أول فتح
const VERSION = 'sakina-pub-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'vendor/adhan.umd.min.js',
  'js/app.js',
  'js/store.js',
  'js/ui.js',
  'js/content.js',
  'js/time.js',
  'js/home.js',
  'js/azkar.js',
  'js/azkar-data.js',
  'js/tasbih.js',
  'js/tafsir.js',
  'js/sounds.js',
  'js/settings.js',
  'js/notify.js',
  'js/city.js',
];
// ملفات كبيرة تتحمّل وقت الحاجة وتبقى محفوظة
const DATA = ['data/quran.json', 'data/tafsir-muyassar.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sakina-pub-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => caches.open(VERSION).then((c) => Promise.all(DATA.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {})))))),
  );
});

function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/data/')) { e.respondWith(cacheFirst(req)); return; }
    // الشبكة أولاً للتحديثات، والكاش احتياط بدون إنترنت
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
    );
  } else if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(req));
  }
  // البث الصوتي والتلاوات تمر مباشرة بدون تخزين
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const target = e.notification.tag?.startsWith('az-') ? './#azkar' : './';
      for (const c of list) { if ('focus' in c) { c.navigate?.(target); return c.focus(); } }
      return self.clients.openWindow(target);
    }),
  );
});
