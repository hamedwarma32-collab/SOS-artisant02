const CACHE_NAME = "sos-artisan-v4";
const URLS_A_METTRE_EN_CACHE = [
  "./",
  "./html/index.html",
  "./html/services.html",
  "./html/specialite.html",
  "./html/inscription.html",
  "./html/connexion.html",
  "./html/profil.html",
  "./html/historique.html",
  "./html/messages.html",
  "./html/admin.html",
  "./style.css",
  "./js/annuaire.js",
  "./js/api.js",
  "./js/admin.js",
  "./js/index.js",
  "./js/specialite.js",
  "./js/inscription.js",
  "./js/connexion.js",
  "./js/profil.js",
  "./js/historique.js",
  "./js/messages.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/fontawesome/css/all.min.css",
  "./assets/fontawesome/webfonts/fa-brands-400.woff2",
  "./assets/fontawesome/webfonts/fa-regular-400.woff2",
  "./assets/fontawesome/webfonts/fa-solid-900.woff2",
  "./assets/fontawesome/webfonts/fa-v4compatibility.woff2",
  "./images/icon-192.png",
  "./images/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS_A_METTRE_EN_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (clefs) {
      return Promise.all(clefs
        .filter(function (clef) { return clef !== CACHE_NAME; })
        .map(function (clef) { return caches.delete(clef); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (reponseEnCache) {
      if (reponseEnCache) return reponseEnCache;
      return fetch(event.request).then(function (reponse) {
        if (reponse.ok && reponse.type === "basic") {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copie);
          });
        }
        return reponse;
      }).catch(function () {
        if (event.request.mode === "navigate") {
          return caches.match("./html/index.html");
        }
        return Response.error();
      });
    })
  );
});
