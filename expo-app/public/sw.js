
const CACHE_NAME = 'iptv-player-v2-cache-v2';

const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/assets/icon.png',
  '/assets/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith('iptv-player-v2-cache-') &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Gestisce esclusivamente richieste GET dello stesso dominio
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Non intercetta API, proxy, richieste Range o contenuti multimediali
  if (
    url.pathname.startsWith('/api/') ||
    request.headers.has('Range') ||
    /\.(m3u8|ts|m4s|mp4|mkv|avi|mov|mpd|aac|mp3|m4a|webm|flv)(?:$|\/)/i.test(url.pathname)
  ) {
    return;
  }

  // Network-first per le risorse dell'applicazione
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();

          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
          );
        }

        return response;
      })
      .catch(() => caches.match(request))
  );
});
