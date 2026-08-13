const CACHE_NAME = 'bensf2-workstation-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/mixer.css',
  './css/synth-rack.css',
  './css/knob.css',
  './js/database.js',
  './js/audio-context.js',
  './js/sf2-parser.js',
  './js/synth-engine.js',
  './js/performance-input.js',
  './js/fx-rack.js',
  './js/vu-meter.js',
  './js/mixer.js',
  './js/web-midi.js',
  './js/midi-learn.js',
  './js/preset-manager.js',
  './js/setlist-manager.js',
  './js/knob-component.js',
  './js/settings-modal.js',
  './js/velocity-visualizer.js',
  './js/app.js',
  './manifest.json',
  './twa-manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon.png',
  './assets/isotipo.png',
  './assets/logo1.png'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching BenSF2 app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  const requestUrl = new URL(evt.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (evt.request.mode === 'navigate') {
    evt.respondWith(
      fetch(evt.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  evt.respondWith(
    caches.match(evt.request).then((response) => {
      if (response) return response;
      return fetch(evt.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, copy));
        return networkResponse;
      });
    })
  );
});
