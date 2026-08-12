const CACHE_NAME = 'bensf2-workstation-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/mixer.css',
  './css/synth-rack.css',
  './css/knob.css',
  './js/audio-context.js',
  './js/sf2-parser.js',
  './js/synth-engine.js',
  './js/fx-rack.js',
  './js/vu-meter.js',
  './js/mixer.js',
  './js/web-midi.js',
  './js/preset-manager.js',
  './js/knob-component.js',
  './js/settings-modal.js',
  './js/app.js',
  './manifest.json',
  './twa-manifest.json'
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
  evt.respondWith(
    caches.match(evt.request).then((response) => {
      return response || fetch(evt.request);
    })
  );
});
