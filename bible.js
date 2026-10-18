/* ============================================================
   BIBLE — onglet « Bible » de Parcours Bâtisseur
   Reprend ce qui existe dans ABBA Gestion : lecture, versions du domaine public
   (Louis Segond 1910, Perret-Gentil et Rilliet 1847, King James), lecture audio,
   recherche, références croisées, reprise de la lecture et lecture hors connexion.
   Les textes sont les fichiers du site : /bible/index.json, /bible/<version>/<NN>.json
   et /bible/xref/<NN>.json (Parcours est servi par le même domaine qu'ABBA Gestion).
   Aucune version protégée n'est utilisée ici : uniquement le domaine public.
   ============================================================ */

const BASE = "/bible";
const LIVRES = ["Genèse","Exode","Lévitique","Nombres","Deutéronome","Josué","Juges","Ruth","1 Samuel","2 Samuel","1 Rois","2 Rois","1 Chroniques","2 Chroniques","Esdras","Néhémie","Esther","Job","Psaumes","Proverbes","Ecclésiaste","Cantique des Cantiques","Ésaïe","Jérémie","Lamentations","Ézéchiel","Daniel","Osée","Joël","Amos","Abdias","Jonas","Michée","Nahum","Habacuc","Sophonie","Aggée","Zacharie","Malachie","Matthieu","Marc","Luc","Jean","Actes","Romains","1 Corinthiens","2 Corinthiens","Galates","Éphésiens","Philippiens","Colossiens","1 Thessaloniciens","2 Thessaloniciens","1 Timothée","2 Timothée","Tite","Philémon","Hébreux","Jacques","1 Pierre","2 Pierre","1 Jean","2 Jean","3 Jean","Jude","Apocalypse"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nn = (n) => String(n).padStart(2, "0");
const plat = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignoré */ } };

/* ---------- Stockage local (IndexedDB) : mêmes noms et mêmes clés qu'ABBA Gestion, donc les textes téléchargés sont partagés ---------- */
let ouverture = null;
function ouvrir() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      const r = indexedDB.open("abba-bible", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }
  return ouverture;
}
const requete = (mode, f) => ouvrir().then((db) => new Promise((ok, ko) => {
  const r = f(db.transaction("kv", mode).objectStore("kv"));
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
}));
const lireLocal = (cle) => requete("readonly", (s) => s.get(cle)).catch(() => undefined);
const ecrireLocal = (cle, val) => requete("readwrite", (s) => s.put(val, cle)).then(() => true).catch(() => false);

/* ---------- Chargement des textes ---------- */
const MSG_PAS_TELECHARGE = "Ce livre n'est pas encore sur le téléphone : ouvrez la Bible une fois avec du réseau (le téléchargement se fait seul).";
let indexCache = null;
const livresCache = {};
const xrefCache = {};

async function chargerIndex() {
  if (indexCache) return indexCache;
  try {
    indexCache = await (await fetch(`${BASE}/index.json`)).json();
    ecrireLocal("index", indexCache);
  } catch (err) {
    indexCache = await lireLocal("index");
    if (!indexCache) throw err;
  }
  return indexCache;
}
async function chargerLivre(version, numero) {
  const cle = `${version}/${numero}`;
  if (livresCache[cle]) return livresCache[cle];
  const local = await lireLocal(`s:${cle}`);
  if (local) { livresCache[cle] = local; return local; }
  let r;
  try { r = await fetch(`${BASE}/${version}/${nn(numero)}.json`); } catch { throw new Error(MSG_PAS_TELECHARGE); }
  if (!r.ok) throw new Error(navigator.onLine === false ? MSG_PAS_TELECHARGE : "Livre indisponible");
  livresCache[cle] = await r.json();
  ecrireLocal(`s:${cle}`, livresCache[cle]);
  return livresCache[cle];
}
async function chargerXref(numero) {
  if (xrefCache[numero]) return xrefCache[numero];
  const local = await lireLocal(`x2:${numero}`);
  if (local) { xrefCache[numero] = local; return local; }
  const r = await fetch(`${BASE}/xref/${nn(numero)}.json`);
  if (!r.ok) throw new Error("Références indisponibles");
  xrefCache[numero] = await r.json();
  ecrireLocal(`x2:${numero}`, xrefCache[numero]);
  return xrefCache[numero];
}
function lireRefXref(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(s);
  return m ? { livre: +m[1], chapitre: +m[2], verset: +m[3], fin: m[4] ? +m[4] : +m[3] } : null;
}

/* ---------- Lecture en arrière-plan (piste silencieuse + commandes de l'écran verrouillé) ---------- */
let elSilence = null;
let urlSilence = null;
function silence() {
  if (urlSilence) return urlSilence;
  const n = 8000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  urlSilence = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return urlSilence;
}
function arrierePlanDemarrer({ titre, details, onPause, onPrecedent, onSuivant }) {
  try {
    if (!elSilence) { elSilence = new Audio(silence()); elSilence.loop = true; }
    elSilence.play().catch(() => {});
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: titre, artist: "ABBA", album: details || "Bible" });
      navigator.mediaSession.playbackState = "playing";
      const poser = (nom, f) => { try { navigator.mediaSession.setActionHandler(nom, f || null); } catch { /* non pris en charge */ } };
      poser("pause", onPause); poser("stop", onPause); poser("previoustrack", onPrecedent); poser("nexttrack", onSuivant);
    }
  } catch { /* ignoré */ }
}
function arrierePlanTitre(titre, details) {
  try { if ("mediaSession" in navigator && elSilence && !elSilence.paused) navigator.mediaSession.metadata = new MediaMetadata({ title: titre, artist: "ABBA", album: details || "Bible" }); } catch { /* ignoré */ }
}
function arrierePlanArreter() {
  try {
    if (elSilence) elSilence.pause();
    if ("mediaSession" in navigator) { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.metadata = null; }
  } catch { /* ignoré */ }
}

/* ---------- État ---------- */
const S = {
  pret: false,
  index: null,
  version: "lsg", livre: 43, chap: 1, verset: null,
  versets: [],
  xref: null,
  vue: "lire", // lire | chercher
  options: false,
  ecoute: false, enPause: false, courant: null, jeton: 0,
  vitesse: Number(lsGet("abba_bible_vitesse", "1")) || 1,
  enchainer: lsGet("abba_bible_enchainer", "oui") !== "non",
  ecranAllume: lsGet("abba_bible_ecran", "oui") !== "non",
  alerte: "",
  erreur: "",
  repriseAuto: false,
  verrou: null,
  dl: { phase: "inactif", fait: 0, total: 0, echecs: 0 },
  rech: { q: "", portee: "tout", exacte: false, phase: "attente", fait: 0, total: 0, res: [], trop: false, absents: 0, jeton: 0 },
};
const MAX_RESULTATS = 300;
const synthOk = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const infoV = () => (S.index?.versions || []).find((v) => v.id === S.version) || S.index?.versions?.[0];
const langueV = () => infoV()?.langue || "fr";
const audioOk = () => synthOk() && (langueV() === "fr" || langueV() === "en");
const nbChapitres = (l) => S.index?.chapitres?.[l - 1] || 1;
const nomLivre = (l) => LIVRES[l - 1] || "";

/* ---------- Reprise de la lecture : on retient où l'on en était ---------- */
function sauverPosition() {
  lsSet("abba_bible_pos", JSON.stringify({ version: S.version, l: S.livre, c: S.chap, v: S.verset || null }));
}
function lirePosition() {
  try { return JSON.parse(lsGet("abba_bible_pos", "null")); } catch { return null; }
}

/* ---------- Chargement d'un chapitre ---------- */
async function chargerChapitre() {
  S.erreur = "";
  const moi = ++chargementJeton;
  try {
    const ch = await chargerLivre(S.version, S.livre);
    if (moi !== chargementJeton) return;
    S.versets = ch[S.chap - 1] || [];
  } catch (e) {
    if (moi !== chargementJeton) return;
    S.versets = [];
    S.erreur = e?.message || "Ce texte n'est pas disponible pour le moment.";
  }
  rendreTexte();
  rendreNav();
  if (S.repriseAuto && S.versets.length) { S.repriseAuto = false; lire(0); }
  chargerXref(S.livre).then((x) => { if (S.livre === livreXrefAttendu) { S.xref = x; rendreTexte(); } }).catch(() => {});
}
let chargementJeton = 0;
let livreXrefAttendu = 0;

function aller(l, c, v = null, { garderLecture = false } = {}) {
  if (!garderLecture) arreter();
  if (l !== S.livre) { S.xref = null; livreXrefAttendu = l; }
  S.livre = l; S.chap = c; S.verset = v;
  if (garderLecture) S.courant = null;
  sauverPosition();
  rendreBarre();
  chargerChapitre().then(() => {
    if (v) $(`bv${v}`)?.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: 0 });
  });
}
function precedent() {
  if (S.chap > 1) aller(S.livre, S.chap - 1);
  else if (S.livre > 1) aller(S.livre - 1, nbChapitres(S.livre - 1));
}
function suivant(opts) {
  if (S.chap < nbChapitres(S.livre)) aller(S.livre, S.chap + 1, null, opts);
  else if (S.livre < 66) aller(S.livre + 1, 1, null, opts);
}
function changerVersion(id) {
  arreter();
  S.version = id;
  sauverPosition();
  chargerChapitre();
  rendreBarre();
}

/* ---------- Lecture audio (synthèse vocale de l'appareil, gratuite) ---------- */
function attendreVoix() {
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    if (synth.getVoices().length) { resolve(synth.getVoices()); return; }
    let fini = false;
    const fin = () => { if (fini) return; fini = true; synth.removeEventListener("voiceschanged", fin); resolve(synth.getVoices()); };
    synth.addEventListener("voiceschanged", fin);
    setTimeout(fin, 1500);
  });
}
function arreter() {
  S.jeton += 1;
  if (synthOk()) window.speechSynthesis.cancel();
  const etait = S.ecoute;
  S.ecoute = false; S.courant = null; S.enPause = false;
  arrierePlanArreter();
  verrouLiberer();
  if (etait) { rendreBarre(); majSurbrillance(); }
  majMini();
}
// Pause : on arrête, mais on retient le verset atteint pour reprendre exactement à cet endroit
function pause() {
  const reste = S.courant;
  arreter();
  if (reste) { S.verset = reste; S.enPause = true; sauverPosition(); rendreBarre(); majSurbrillance(); majMini(); }
}
async function lire(depuis) {
  if (!audioOk() || !S.versets.length) return;
  window.dispatchEvent(new Event("abba:voix-bible")); // les leçons lues à voix haute s'arrêtent
  const liste = S.versets;
  const livre = S.livre, chap = S.chap;
  const titre = `${nomLivre(livre)} ${chap}`;
  const details = infoV()?.nom || "Bible";
  // doit être lancé tout de suite, pendant le geste de l'utilisateur
  arrierePlanDemarrer({
    titre, details,
    onPause: () => pause(),
    onSuivant: () => lire(Math.min(S.courant ?? 0, liste.length - 1)),
    onPrecedent: () => lire(Math.max((S.courant ?? 1) - 2, 0)),
  });
  verrouPrendre();
  window.speechSynthesis.cancel();
  S.jeton += 1;
  const moi = S.jeton;
  const langue = langueV() === "en" ? "en" : "fr";
  S.ecoute = true; S.enPause = false; S.alerte = "";
  rendreBarre();
  majMini();
  const voixDispo = await attendreVoix();
  if (moi !== S.jeton) return;
  const voix = voixDispo.find((v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith(langue));
  S.alerte = voixDispo.length > 0 && !voix ? `Aucune voix ${langue === "fr" ? "française" : "anglaise"} n'est installée sur cet appareil : la lecture peut être impossible ou dans une autre langue.` : "";
  rendreBarre();
  const finDuChapitre = () => {
    if (moi !== S.jeton) return;
    const aSuivre = chap < nbChapitres(livre) || livre < 66;
    if (S.enchainer && aSuivre) { S.repriseAuto = true; suivant({ garderLecture: true }); } else arreter();
  };
  const aLire = [];
  for (let i = depuis; i < liste.length; i++) if (liste[i]) aLire.push(i);
  if (!aLire.length) { finDuChapitre(); return; }
  // Tous les versets restants sont mis en file d'attente d'un coup : la voix peut continuer même si l'écran s'éteint
  aLire.forEach((i, k) => {
    const u = new SpeechSynthesisUtterance(liste[i]);
    u.lang = langue === "fr" ? "fr-FR" : "en-GB";
    if (voix) u.voice = voix;
    u.rate = S.vitesse;
    u.onstart = () => {
      if (moi !== S.jeton) return;
      S.courant = i + 1; S.verset = i + 1;
      sauverPosition();
      arrierePlanTitre(`${titre}, verset ${i + 1}`, details);
      majMiniTitre();
      majSurbrillance();
      $(`bv${i + 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    u.onend = () => { if (k === aLire.length - 1) finDuChapitre(); };
    u.onerror = (e) => { if (moi === S.jeton && e.error !== "interrupted" && e.error !== "canceled") arreter(); };
    window.speechSynthesis.speak(u);
  });
}

/* ---------- Lecteur flottant (même apparence que celui des leçons), visible sur tous les onglets ---------- */
const titreMini = () => `📖 ${nomLivre(S.livre)} ${S.chap}${S.courant || S.verset ? ` · v. ${S.courant || S.verset}` : ""}`;
function miniHtml() {
  return `<span class="tts-mini-t">${esc(titreMini())}</span>
    <button class="tts-btn" data-bm="${S.ecoute ? "pause" : "reprendre"}" aria-label="${S.ecoute ? "Pause" : "Reprendre"}">${S.ecoute ? "⏸" : "▶"}</button>
    <button class="tts-btn" data-bm="stop" aria-label="Arrêter">⏹</button>
    <select class="tts-rate" data-bm="vitesse" aria-label="Vitesse">${[[0.8, "Lent"], [1, "Normal"], [1.25, "Rapide"]].map(([v, l]) => `<option value="${v}"${S.vitesse === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    ${"wakeLock" in navigator ? `<button class="tts-btn ${S.ecranAllume ? "on" : ""}" data-bm="ecran" aria-label="Garder l'écran allumé" title="Garder l'écran allumé">☀</button>` : ""}
    ${S.alerte ? `<span class="tts-mini-m">${esc(S.alerte)}</span>` : ""}`;
}
function miniEvent(e) {
  const b = e.target.closest("[data-bm]");
  if (!b) return;
  const a = b.dataset.bm;
  if (a === "vitesse") {
    if (e.type !== "change") return;
    S.vitesse = Number(b.value) || 1; lsSet("abba_bible_vitesse", String(S.vitesse));
    if (S.ecoute) lire((S.courant || 1) - 1); else rendreOptions();
    return;
  }
  if (e.type !== "click") return;
  if (a === "pause") pause();
  else if (a === "reprendre") lire((S.verset || 1) - 1);
  else if (a === "stop") { arreter(); rendreBarre(); }
  else if (a === "ecran") {
    S.ecranAllume = !S.ecranAllume; lsSet("abba_bible_ecran", S.ecranAllume ? "oui" : "non");
    if (S.ecranAllume && S.ecoute) verrouPrendre(); else if (!S.ecranAllume) verrouLiberer();
    rendreOptions(); majMini();
  }
}
function majMini() {
  const visible = S.ecoute || S.enPause;
  let el = $("bibMini");
  if (!el) {
    if (!visible) return;
    el = document.createElement("div");
    el.id = "bibMini"; el.className = "tts-mini";
    el.addEventListener("click", miniEvent);
    el.addEventListener("change", miniEvent);
    document.body.appendChild(el);
  }
  el.hidden = !visible;
  if (visible) el.innerHTML = miniHtml();
}
function majMiniTitre() {
  const t = document.querySelector("#bibMini .tts-mini-t");
  if (t) t.textContent = titreMini();
}

/* ---------- Écran gardé allumé pendant la lecture audio ---------- */
async function verrouPrendre() {
  if (!("wakeLock" in navigator) || !S.ecranAllume || S.verrou) return;
  try { S.verrou = await navigator.wakeLock.request("screen"); S.verrou.addEventListener("release", () => { S.verrou = null; }); } catch { /* refusé */ }
}
function verrouLiberer() { if (S.verrou) { S.verrou.release().catch(() => {}); S.verrou = null; } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.ecoute) verrouPrendre(); });

/* ---------- Téléchargement pour la lecture hors connexion ---------- */
async function telechargerTout() {
  const dl = S.dl;
  if (dl.phase === "encours") return;
  if (navigator.onLine === false) { dl.phase = "partiel"; rendreOptions(); return; }
  Object.assign(dl, { phase: "encours", fait: 0, total: 0, echecs: 0 });
  try { navigator.storage?.persist?.(); } catch { /* ignoré */ }
  const taches = [];
  for (const v of S.index.versions) for (let n = 1; n <= 66; n++) taches.push({ cle: `s:${v.id}/${n}`, url: `${BASE}/${v.id}/${nn(n)}.json` });
  for (let n = 1; n <= 66; n++) taches.push({ cle: `x2:${n}`, url: `${BASE}/xref/${nn(n)}.json` });
  dl.total = taches.length;
  rendreOptions();
  let pos = 0;
  const ouvrier = async () => {
    while (pos < taches.length) {
      const t = taches[pos++];
      try {
        if ((await lireLocal(t.cle)) === undefined) {
          const r = await fetch(t.url);
          if (!r.ok) throw new Error("absent");
          await ecrireLocal(t.cle, await r.json());
        }
      } catch { dl.echecs += 1; }
      dl.fait += 1;
      if (dl.fait % 6 === 0) rendreOptions();
    }
  };
  await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()]);
  dl.phase = dl.echecs ? "partiel" : "pret";
  rendreOptions();
}

/* ---------- Rendu ---------- */
function racine() { return $("bibleRoot"); }
function squelette() {
  racine().innerHTML = `
    <div class="bib-onglets">
      <button class="bib-onglet" data-bib="vue-lire">📖 Lire</button>
      <button class="bib-onglet" data-bib="vue-chercher">🔍 Rechercher</button>
    </div>
    <div id="bibLire">
      <div id="bibBarre" class="bib-barre"></div>
      <div id="bibTexte" class="bib-texte"></div>
      <div id="bibNav" class="bib-nav"></div>
      <p class="small bib-credit" id="bibCredit"></p>
    </div>
    <div id="bibChercher" hidden></div>`;
  majOnglets();
}
function majOnglets() {
  racine().querySelectorAll(".bib-onglet").forEach((b) => b.classList.toggle("active", b.dataset.bib === `vue-${S.vue === "lire" ? "lire" : "chercher"}`));
  $("bibLire").hidden = S.vue !== "lire";
  $("bibChercher").hidden = S.vue !== "chercher";
}
function optionsSelect(liste, courant) {
  return liste.map(([val, lib]) => `<option value="${esc(val)}"${String(val) === String(courant) ? " selected" : ""}>${esc(lib)}</option>`).join("");
}
function rendreBarre() {
  const el = $("bibBarre");
  if (!el || !S.index) return;
  const v = infoV();
  const nb = nbChapitres(S.livre);
  const audio = audioOk();
  const versetsOpts = S.versets.map((t, i) => (t ? [i + 1, `v. ${i + 1}`] : null)).filter(Boolean);
  const bouton = !audio ? "" : (!S.ecoute
    ? `<button class="btn-primary btn-compact" data-bib="ecouter">▶ ${S.verset && S.verset > 1 ? `Reprendre v. ${S.verset}` : "Écouter"}</button>`
    : `<button class="btn-danger btn-compact" data-bib="pause">⏸ Pause</button>`);
  el.innerHTML = `
    <div class="bib-grille2">
      <select data-bib="version" aria-label="Version">${optionsSelect(S.index.versions.map((x) => [x.id, x.nom]), v?.id)}</select>
      <select data-bib="livre" aria-label="Livre">${optionsSelect(LIVRES.map((n, i) => [i + 1, n]), S.livre)}</select>
    </div>
    <div class="bib-ligne">
      <select data-bib="chap" aria-label="Chapitre">${optionsSelect(Array.from({ length: nb }, (_, i) => [i + 1, `Chap. ${i + 1}`]), S.chap)}</select>
      <select data-bib="verset" aria-label="Verset"><option value="">Verset…</option>${optionsSelect(versetsOpts, S.courant ?? S.verset ?? "")}</select>
      ${bouton}
      <button class="btn-secondary btn-compact" data-bib="options" aria-label="Options">⚙️</button>
    </div>
    <div id="bibOptions" class="bib-options" ${S.options ? "" : "hidden"}></div>
    ${S.alerte ? `<p class="small bib-alerte">${esc(S.alerte)}</p>` : ""}
    ${!audio ? `<p class="small">${synthOk() ? "La lecture audio n'est pas disponible pour cette langue." : "La lecture audio n'est pas disponible sur ce navigateur."}</p>` : ""}`;
  rendreOptions();
  const c = $("bibCredit");
  if (c && v) c.textContent = `${v.nom} — ${v.licence}. Références croisées : OpenBible.info (CC-BY).`;
}
function rendreOptions() {
  const el = $("bibOptions");
  if (!el) return;
  el.hidden = !S.options;
  if (!S.options) { el.innerHTML = ""; return; }
  const dl = S.dl;
  const pct = dl.total ? Math.min(100, Math.round((dl.fait / dl.total) * 100)) : 0;
  const statut = dl.phase === "encours" ? `En cours… ${pct} %`
    : dl.phase === "pret" ? "✓ Toutes les Bibles sont sur ce téléphone"
    : dl.phase === "partiel" ? "Téléchargement incomplet : réessayez avec du réseau" : "";
  el.innerHTML = `
    <label class="bib-opt">Vitesse
      <select data-bib="vitesse">${optionsSelect([[0.8, "Lente"], [1, "Normale"], [1.25, "Rapide"]], S.vitesse)}</select>
    </label>
    <label class="bib-opt"><input type="checkbox" data-bib="enchainer" ${S.enchainer ? "checked" : ""}> <span>Enchaîner les chapitres automatiquement</span></label>
    ${"wakeLock" in navigator ? `<label class="bib-opt"><input type="checkbox" data-bib="ecran" ${S.ecranAllume ? "checked" : ""}> <span>Garder l'écran allumé pendant l'écoute</span></label>` : ""}
    <div class="bib-opt"><button class="btn-secondary btn-compact" data-bib="telecharger" ${dl.phase === "encours" ? "disabled" : ""}>⬇️ Télécharger les Bibles (lecture sans réseau, environ 16 Mo)</button> <span class="small">${esc(statut)}</span></div>`;
}
function rendreTexte() {
  const el = $("bibTexte");
  if (!el) return;
  if (S.erreur) { el.innerHTML = `<p class="bib-alerte">${esc(S.erreur)}</p>`; return; }
  const cx = S.xref?.[S.chap] || {};
  el.innerHTML = `<h3>${esc(nomLivre(S.livre))} ${S.chap}</h3>` + (S.versets.length ? S.versets.map((t, i) => (!t ? "" : `
    <p class="bib-verset" id="bv${i + 1}" data-v="${i + 1}"><sup>${i + 1}</sup>${esc(t)}${cx[i + 1]?.length ? ` <button type="button" class="bib-xref" data-x="${i + 1}" aria-label="Références croisées">🔗 ${cx[i + 1].length}</button>` : ""}</p>`)).join("") : `<p class="small">Chargement…</p>`);
  majSurbrillance();
}
function majSurbrillance() {
  document.querySelectorAll("#bibTexte .bib-verset").forEach((p) => {
    const n = Number(p.dataset.v);
    p.classList.toggle("actif", S.courant === n || (!S.ecoute && S.verset === n));
  });
  const sel = racine()?.querySelector('select[data-bib="verset"]');
  if (sel) sel.value = String(S.courant ?? S.verset ?? "");
}
function rendreNav() {
  const el = $("bibNav");
  if (!el) return;
  el.innerHTML = `<button class="btn-secondary btn-compact" data-bib="precedent">← Précédent</button><button class="btn-primary btn-compact" data-bib="suivant">Suivant →</button>`;
}

/* ---------- Références croisées ---------- */
async function texteDeReference(ref) {
  try {
    const versets = (await chargerLivre(S.version, ref.livre))[ref.chapitre - 1] || [];
    const out = [];
    for (let v = ref.verset; v <= Math.min(ref.fin, ref.verset + 9); v++) if (versets[v - 1]) out.push(ref.fin > ref.verset ? `${v} ${versets[v - 1]}` : versets[v - 1]);
    return out.join(" ");
  } catch { return ""; }
}
function ouvrirReferences(verset) {
  const refs = (S.xref?.[S.chap]?.[verset] || []).map((s) => ({ s, r: lireRefXref(s) })).filter((x) => x.r);
  if (!refs.length) return;
  fermerPanneau();
  const libelle = (r) => `${nomLivre(r.livre)} ${r.chapitre}:${r.verset}${r.fin > r.verset ? `–${r.fin}` : ""}`;
  const fond = document.createElement("div");
  fond.className = "bib-fond"; fond.id = "bibPanneau"; fond.setAttribute("role", "dialog"); fond.setAttribute("aria-label", "Références croisées");
  let nb = 15;
  const textes = {};
  const dessiner = () => {
    fond.innerHTML = `<div class="bib-feuille">
      <div class="bib-feuille-tete"><strong>Références croisées · ${esc(nomLivre(S.livre))} ${S.chap}:${verset}</strong><button class="btn-secondary btn-compact" data-px="fermer">Fermer ✕</button></div>
      <div class="small">${refs.length} passage(s) liés, du plus pertinent au moins pertinent.</div>
      ${refs.slice(0, nb).map(({ s, r }) => `<div class="bib-ref">
        <div class="bib-ref-tete"><strong>${esc(libelle(r))}</strong><button class="btn-secondary btn-compact" data-px="aller" data-s="${esc(s)}">Ouvrir →</button></div>
        <div class="bib-ref-texte">${textes[s] === undefined ? "…" : (textes[s] ? esc(textes[s]) : '<span class="small">Texte pas encore disponible sur ce téléphone.</span>')}</div></div>`).join("")}
      ${refs.length > nb ? `<div class="bib-centre"><button class="btn-secondary btn-compact" data-px="plus">Voir plus (${refs.length - nb} autres)</button></div>` : ""}</div>`;
    refs.slice(0, nb).forEach(({ s, r }) => {
      if (textes[s] === undefined) texteDeReference(r).then((t) => { textes[s] = t; if ($("bibPanneau")) dessiner(); });
    });
  };
  fond.addEventListener("click", (e) => {
    const b = e.target.closest("[data-px]");
    if (e.target === fond || (b && b.dataset.px === "fermer")) { fermerPanneau(); return; }
    if (!b) return;
    if (b.dataset.px === "plus") { nb += 15; dessiner(); }
    if (b.dataset.px === "aller") { const r = lireRefXref(b.dataset.s); fermerPanneau(); if (r) { S.vue = "lire"; majOnglets(); aller(r.livre, r.chapitre, r.verset); } }
  });
  document.body.appendChild(fond);
  dessiner();
}
function fermerPanneau() { $("bibPanneau")?.remove(); }

/* ---------- Recherche ---------- */
function surligner(texte, termes) {
  const carte = Array.from(texte).map((c) => plat(c));
  if (carte.some((c) => c.length !== 1)) return esc(texte);
  const plus = carte.join("");
  const bornes = [];
  termes.forEach((t) => { if (!t) return; let i = plus.indexOf(t); while (i >= 0) { bornes.push([i, i + t.length]); i = plus.indexOf(t, i + t.length); } });
  if (!bornes.length) return esc(texte);
  bornes.sort((a, b) => a[0] - b[0]);
  const fusion = [];
  bornes.forEach(([a, b]) => { const d = fusion[fusion.length - 1]; if (d && a <= d[1]) d[1] = Math.max(d[1], b); else fusion.push([a, b]); });
  let out = "", pos = 0;
  fusion.forEach(([a, b]) => { out += esc(texte.slice(pos, a)) + `<mark>${esc(texte.slice(a, b))}</mark>`; pos = b; });
  return out + esc(texte.slice(pos));
}
function rendreRecherche(complet = true) {
  const R = S.rech;
  const el = $("bibChercher");
  if (!el || !S.index) return;
  if (complet) {
    el.innerHTML = `
      <form id="bibForm" class="bib-recherche">
        <input type="search" id="bibQ" placeholder="Un mot ou une expression…" value="${esc(R.q)}" autocomplete="off">
        <div class="bib-ligne">
          <select id="bibPortee" aria-label="Où chercher">${optionsSelect([["tout", "Toute la Bible"], ["at", "Ancien Testament"], ["nt", "Nouveau Testament"], ["livre", `Le livre en cours : ${nomLivre(S.livre)}`]], R.portee)}</select>
          <select id="bibVersionR" aria-label="Version">${optionsSelect(S.index.versions.map((x) => [x.id, x.nom]), S.version)}</select>
        </div>
        <label class="bib-opt"><input type="checkbox" id="bibExacte" ${R.exacte ? "checked" : ""}> <span>Expression exacte (les mots dans cet ordre)</span></label>
        <button class="btn-primary btn-compact" type="submit">Chercher</button>
        <p class="small">Sans tenir compte des accents ni des majuscules. Plusieurs mots : le verset doit les contenir tous. Les livres se téléchargent au fur et à mesure.</p>
      </form>
      <div id="bibResultats"></div>`;
  }
  const res = $("bibResultats");
  if (!res) return;
  const pct = R.total ? Math.round((R.fait / R.total) * 100) : 0;
  const termes = R.exacte ? [plat(R.q)] : plat(R.q).split(/\s+/).filter(Boolean);
  res.innerHTML = `
    ${R.phase === "cherche" ? `<div class="small">Recherche en cours… ${pct} % (${R.fait} livre(s) sur ${R.total})</div><div class="bib-progres"><div style="width:${pct}%"></div></div>` : ""}
    ${R.q && R.phase !== "attente" ? `<p class="small"><strong>${R.res.length}${R.trop ? "+" : ""}</strong> verset(s) pour « ${esc(R.q)} »${R.trop ? ` — affichage limité à ${MAX_RESULTATS} : précisez votre recherche.` : ""}${R.absents > 0 && R.phase === "fini" ? ` · ${R.absents} livre(s) non disponible(s) sur ce téléphone.` : ""}</p>` : ""}
    ${R.res.map((r) => `<button type="button" class="bib-res" data-l="${r.livre}" data-c="${r.chapitre}" data-v="${r.verset}"><div class="bib-res-ref">${esc(nomLivre(r.livre))} ${r.chapitre}:${r.verset}</div><div>${surligner(r.texte, termes)}</div></button>`).join("")}
    ${R.phase === "fini" && !R.res.length && R.q ? `<p class="small">Aucun verset trouvé.</p>` : ""}`;
}
async function chercher() {
  const R = S.rech;
  const brut = ($("bibQ")?.value || "").trim();
  if (brut.length < 2) return;
  R.q = brut;
  R.portee = $("bibPortee").value;
  R.exacte = $("bibExacte").checked;
  const version = $("bibVersionR").value;
  const cibles = R.portee === "at" ? Array.from({ length: 39 }, (_, i) => i + 1)
    : R.portee === "nt" ? Array.from({ length: 27 }, (_, i) => i + 40)
    : R.portee === "livre" ? [S.livre] : Array.from({ length: 66 }, (_, i) => i + 1);
  const termes = R.exacte ? [plat(brut)] : plat(brut).split(/\s+/).filter(Boolean);
  const moi = ++R.jeton;
  Object.assign(R, { res: [], trop: false, absents: 0, phase: "cherche", fait: 0, total: cibles.length });
  rendreRecherche(false);
  let manquants = 0;
  for (let k = 0; k < cibles.length; k++) {
    if (moi !== R.jeton) return;
    try {
      const ch = await chargerLivre(version, cibles[k]);
      ch.forEach((versets, c) => (versets || []).forEach((t, i) => {
        if (!t || R.res.length >= MAX_RESULTATS) return;
        const p = plat(t);
        if (termes.every((x) => p.includes(x))) R.res.push({ livre: cibles[k], chapitre: c + 1, verset: i + 1, texte: t, version });
      }));
    } catch { manquants += 1; }
    R.fait = k + 1; R.absents = manquants;
    if (R.res.length >= MAX_RESULTATS) { R.trop = true; break; }
    if (k % 3 === 0) rendreRecherche(false);
  }
  if (moi !== R.jeton) return;
  R.phase = "fini";
  rendreRecherche(false);
}

/* ---------- Événements ---------- */
function brancher() {
  racine().addEventListener("click", (e) => {
    const b = e.target.closest("[data-bib], .bib-xref, .bib-verset, .bib-res");
    if (!b) return;
    if (b.classList.contains("bib-xref")) { e.stopPropagation(); ouvrirReferences(Number(b.dataset.x)); return; }
    if (b.classList.contains("bib-res")) {
      S.version = $("bibVersionR")?.value || S.version;
      S.vue = "lire"; majOnglets(); rendreBarre();
      aller(Number(b.dataset.l), Number(b.dataset.c), Number(b.dataset.v));
      return;
    }
    if (b.classList.contains("bib-verset")) {
      const n = Number(b.dataset.v);
      if (S.ecoute && audioOk()) lire(n - 1); else { S.verset = n; sauverPosition(); majSurbrillance(); rendreBarre(); }
      return;
    }
    switch (b.dataset.bib) {
      case "vue-lire": S.vue = "lire"; majOnglets(); break;
      case "vue-chercher": S.vue = "chercher"; majOnglets(); rendreRecherche(true); break;
      case "ecouter": lire((S.verset || 1) - 1); break;
      case "pause": pause(); break;
      case "options": S.options = !S.options; rendreOptions(); break;
      case "precedent": precedent(); break;
      case "suivant": suivant(); break;
      case "telecharger": telechargerTout(); break;
      default: break;
    }
  });
  racine().addEventListener("change", (e) => {
    const t = e.target;
    switch (t.dataset?.bib) {
      case "version": changerVersion(t.value); break;
      case "livre": aller(Number(t.value), 1); break;
      case "chap": aller(S.livre, Number(t.value)); break;
      case "verset": {
        const n = Number(t.value) || null;
        if (S.ecoute) { if (n) lire(n - 1); break; }
        S.verset = n; sauverPosition(); majSurbrillance(); rendreBarre();
        if (n) $(`bv${n}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }
      case "vitesse": S.vitesse = Number(t.value) || 1; lsSet("abba_bible_vitesse", String(S.vitesse)); if (S.ecoute) lire((S.courant || 1) - 1); else majMini(); break;
      case "enchainer": S.enchainer = t.checked; lsSet("abba_bible_enchainer", t.checked ? "oui" : "non"); break;
      case "ecran": S.ecranAllume = t.checked; lsSet("abba_bible_ecran", t.checked ? "oui" : "non"); if (!t.checked) verrouLiberer(); else if (S.ecoute) verrouPrendre(); majMini(); break;
      default: break;
    }
  });
  racine().addEventListener("submit", (e) => { if (e.target.id === "bibForm") { e.preventDefault(); chercher(); } });
  // La voix est unique : si une leçon se met à parler, la Bible se tait
  window.addEventListener("abba:voix-lecon", () => { if (S.ecoute || S.enPause) arreter(); });
  window.addEventListener("pagehide", () => { if (synthOk() && S.ecoute) window.speechSynthesis.cancel(); });
}

/* ---------- Démarrage (à l'ouverture de l'onglet) ---------- */
let demarre = false;
async function ouvrirOnglet() {
  if (demarre) return;
  demarre = true;
  const root = racine();
  if (!root) return;
  root.innerHTML = `<p class="small">Chargement de la Bible…</p>`;
  try {
    S.index = await chargerIndex();
  } catch {
    demarre = false;
    root.innerHTML = `<p class="bib-alerte">Impossible de charger la Bible. Vérifiez votre connexion puis rouvrez cet onglet.</p>`;
    return;
  }
  const p = lirePosition();
  if (p && S.index.versions.some((v) => v.id === p.version) && p.l >= 1 && p.l <= 66) {
    S.version = p.version; S.livre = p.l; S.chap = Math.min(Math.max(p.c || 1, 1), nbChapitres(p.l)); S.verset = p.v || null;
  } else {
    S.version = S.index.versions[0]?.id || "lsg";
  }
  livreXrefAttendu = S.livre;
  squelette();
  brancher();
  rendreBarre();
  rendreNav();
  await chargerChapitre();
  if (S.verset) $(`bv${S.verset}`)?.scrollIntoView({ block: "center" });
  S.pret = true;
}

window.addEventListener("abba:bible-ouvert", ouvrirOnglet);
window.AbbaBible = { ouvrir: ouvrirOnglet, aller: (l, c, v) => { ouvrirOnglet().then(() => aller(l, c, v)); } };
