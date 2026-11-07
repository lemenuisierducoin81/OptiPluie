/* ===========================================================
   OptiPluie — sw.js
   Permet d'ouvrir l'appli sans réseau (atelier, chantier, cave).
   Les appels à l'API GitHub ne passent jamais par le cache.
   =========================================================== */

const CACHE = 'optipluie-v1';

const FICHIERS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/github.js',
  './manifest.webmanifest',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (cles) {
      return Promise.all(cles.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;

  /* Jamais de cache sur l'API GitHub ni sur autre chose qu'une lecture */
  if (req.method !== 'GET' || req.url.indexOf('api.github.com') !== -1) return;

  /* Réseau d'abord, cache en secours : l'appli reste à jour quand il y a
     du réseau, et s'ouvre quand même quand il n'y en a pas.            */
  ev.respondWith(
    fetch(req)
      .then(function (rep) {
        if (rep && rep.ok && rep.type === 'basic') {
          const copie = rep.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copie); });
        }
        return rep;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
