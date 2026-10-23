// Parcours Bâtisseur — service worker
// Principe : le réseau d'abord (toujours la dernière version quand il y a du réseau),
// le cache en secours (lecture hors ligne). Plus de version « figée » sur le téléphone.
const CACHE = "abba-parcours-v74";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./sync.js", "./formation.js", "./bible.js", "./lecture.js", "./paiements.js", "./voixNative.js",
  "./firebase-config.js", "./i18n.js", "./lang/en.json", "./manifest.json", "./logo.png",
  "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) =>
        fetch(new Request(u, { cache: "reload" })).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Firebase, Google : le navigateur gère
  e.respondWith(
    fetch(new Request(req, { cache: "no-cache" }))
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
