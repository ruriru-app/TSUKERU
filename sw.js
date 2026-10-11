const CACHE_NAME = 'tsukeru-shell-v10';
const CACHE_PREFIX = 'tsukeru-shell-';
const APP_SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/domain.js', './js/workspace.js', './js/palette.js', './js/model.js', './js/roster.js', './js/storage.js',
  './js/backup.js', './js/pwa.js', './js/interactions.js', './js/palette-settings.js', './js/settings.js', './js/app.js',
  './assets/icon_home.svg', './assets/icon_setting.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
