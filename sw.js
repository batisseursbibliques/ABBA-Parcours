// Parcours Bâtisseur — service worker
// Principe : le réseau d'abord (toujours la dernière version quand il y a du réseau),
// le cache en secours (lecture hors ligne). Plus de version « figée » sur le téléphone.
const CACHE = "abba-parcours-v143";
// Mémoire des leçons : séparée et NON vidée à chaque mise à jour (≈ 1,4 Mo téléchargés une seule fois, pour ménager les forfaits mobiles).
const CACHE_CONTENU = "abba-parcours-contenu";
const CONTENU = ["autoeval", "charte", "declaration", "m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08", "m09", "m10", "m11", "m12", "m13", "m14", "m14b", "mbti-profils", "zones-exercices", "plans/index", "plans/nt-180"].map((n) => "./content/" + n + ".json");
const SDK = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js",
];
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./sync.js", "./formation.js", "./bible.js", "./lecture.js", "./notes.js", "./paiements.js", "./profil.js", "./geo.js", "./voixNative.js",
  "./firebase-config.js", "./attestation.js", "./coordinateurs.js", "./reseau.js", "./i18n.js", "./lang/en.json", "./manifest.json", "./confidentialite.html", "./logo.png",
  "./icon-192.png", "./icon-512.png",
  // Tout le reste de l'application (certificats, exports, réponses, images, bibliothèques PDF) : rien ne doit manquer hors connexion.
  "./livraison.js", "./reponses.js", "./reponses.html", "./certificat.html", "./export.html", "./verifier.html", "./installer.html",
  "./vendor/jspdf.umd.min.js", "./vendor/qrcode.js", "./cachet.png", "./signature.png", "./fond.jpg", "./fond-certificat.jpg", "/bible/index.json",
  "/abba-batisseur/habillage.css", "/abba-batisseur/habillage.js", "/abba-batisseur/barre.js", "/abba-batisseur/fond-accueil.webp",
  // La bibliothèque Firebase elle-même (fichiers versionnés) : indispensable pour que l'app puisse démarrer SANS connexion.
  ...SDK,
];

// Installation tolérante : un fichier manquant ne bloque jamais l'installation des autres.
const prendre = (c, u) => fetch(new Request(u, { cache: "reload" })).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null);
self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then((c) => Promise.all(ASSETS.map((u) => prendre(c, u)))),
      // Leçons : on ne télécharge que celles qui manquent encore (jamais deux fois).
      caches.open(CACHE_CONTENU).then((c) => Promise.all(CONTENU.map((u) => c.match(u).then((hit) => (hit ? null : prendre(c, u)))))),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE_CONTENU).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Le réseau d'abord (toujours la dernière version), le cache en secours : hors ligne, ou si le réseau met plus de 6 secondes.
function reseauPuisCache(req, nomCache) {
  const ouvert = caches.open(nomCache);
  const reseau = fetch(new Request(req, { cache: "no-cache" })).then((res) => {
    if (res && res.ok && res.type !== "opaque") { const copie = res.clone(); ouvert.then((c) => c.put(req, copie)); }
    return res;
  });
  const secours = () => ouvert.then((c) => c.match(req)).then((hit) => hit || caches.match(req))
    .then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : null)).then((hit) => hit || reseau);
  const delai = new Promise((resolve) => setTimeout(() => resolve(secours()), 6000));
  return Promise.race([reseau.catch(secours), delai]);
}

/* « Tout télécharger » : demandé par l'application à chaque ouverture avec réseau.
   On revalide chaque fichier (très léger si rien n'a changé) et on récupère ce qui manque, y compris les leçons en anglais. */
const revalider = (c, u) => fetch(new Request(u, { cache: "no-cache" })).then((r) => (r.ok && r.type !== "opaque" ? c.put(u, r) : null)).catch(() => null);
async function toutPrendre(anglais) {
  const [c, k] = await Promise.all([caches.open(CACHE), caches.open(CACHE_CONTENU)]);
  const contenus = CONTENU.concat(anglais ? CONTENU.map((u) => u.replace("./content/", "./content/en/")) : []);
  const lots = [[k, contenus], [c, ASSETS.filter((u) => !u.startsWith("https://"))]];
  for (const [cache, liste] of lots) {
    for (let i = 0; i < liste.length; i += 6) await Promise.all(liste.slice(i, i + 6).map((u) => revalider(cache, u)));
  }
}
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "tout-telecharger") e.waitUntil(toutPrendre(!!e.data.anglais));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Bibliothèque Firebase (fichiers versionnés) : le cache d'abord, pour démarrer sans connexion.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return res; })));
    return;
  }
  if (url.origin !== self.location.origin) return; // vraies requêtes Firebase / Google : le navigateur gère
  // Leçons : mémoire séparée, mise à jour dès qu'il y a du réseau.
  e.respondWith(reseauPuisCache(req, url.pathname.includes("/content/") ? CACHE_CONTENU : CACHE));
});


/* ---- Notifications (rappel quotidien) : envoyées par Firebase Cloud Messaging ---- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { try { d = { body: e.data.text() }; } catch (e2) { d = {}; } }
  const data = d.data || d.notification || d;
  const title = data.title || "ABBA Parcours";
  const opts = {
    body: data.body || "",
    icon: "icon-192.png", badge: "icon-192.png",
    tag: data.tag || "abba-rappel", renotify: false,
    data: { url: data.url || "./" },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
