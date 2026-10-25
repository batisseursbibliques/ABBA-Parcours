// ============================================================
// sync.js — Parcours Bâtisseur
// Utilise EXACTEMENT le même projet Firebase qu'ABBA Life : mêmes comptes,
// même base de données. Un Bâtisseur peut s'inscrire ici OU sur ABBA Life, et
// utiliser le même e-mail / mot de passe sur les deux — pas de double inscription.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
  enableIndexedDbPersistence, collection, getDocs, query, where, updateDoc, writeBatch, increment, arrayUnion, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try { enableIndexedDbPersistence(db); } catch (e) { /* déjà activé dans un autre onglet — sans gravité */ }

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(String(email).toLowerCase());
}

/* ---------- AUTHENTIFICATION ----------
   Connexion, inscription (même compte et même fiche `users/{uid}` qu'ABBA Life)
   et mot de passe oublié. Après une inscription, l'accès au Parcours reste soumis
   à la validation d'un coordinateur (collection `enrollments`). */
let pendingSignUp = null;
async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}
async function logOut() { await signOut(auth); }
function watchAuth(callback) {
  return onAuthStateChanged(auth, async (u) => {
    // Pendant une inscription, on attend que la fiche et la demande d'accès soient écrites
    if (pendingSignUp) { try { await pendingSignUp; } catch (e) {} }
    callback(u);
  });
}
// d = { prenom, nom, telephone, email, password, naissance (AAAA-MM-JJ), tuteurNom, tuteurTel }
async function signUp(d) {
  const run = (async () => {
    const prenom = (d.prenom || "").trim(), nomFam = (d.nom || "").trim();
    const full = (prenom + " " + nomFam).trim();
    const email = (d.email || "").trim();
    const cred = await createUserWithEmailAndPassword(auth, email, d.password);
    const uid = cred.user.uid;
    try { await updateProfile(cred.user, { displayName: full }); } catch (e) {}
    try {
      // Même structure qu'ABBA Life : `nom` = prénom + nom, plus des champs séparés pour Parcours
      await setDoc(doc(db, "users", uid), {
        nom: full, prenomSaisi: prenom, nomFamille: nomFam,
        telephone: (d.telephone || "").trim(), email, createdAt: serverTimestamp(), via: "parcours",
      }, { merge: true });
    } catch (e) { console.error("signUp users:", e); }
    let mineur = false, age = null;
    if (d.naissance) {
      const b = new Date(d.naissance + "T00:00:00"), t = new Date();
      age = t.getFullYear() - b.getFullYear() - ((t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) ? 1 : 0);
      mineur = age < 18;
    }
    try {
      await setDoc(doc(db, "users", uid, "priv", "contact"), {
        naissance: d.naissance || "", telephone: (d.telephone || "").trim(),
        tuteurNom: (d.tuteurNom || "").trim(), tuteurTel: (d.tuteurTel || "").trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) { console.error("signUp contact:", e); }
    try {
      // Demande d'accès au Parcours, avec ce dont le coordinateur a besoin pour décider
      await setDoc(doc(db, "enrollments", uid + "_parcours"), {
        uid, app: "parcours", nom: full, prenom: "", email,
        telephone: (d.telephone || "").trim(), naissance: d.naissance || "", mineur,
        tuteurNom: mineur ? (d.tuteurNom || "").trim() : "", tuteurTel: mineur ? (d.tuteurTel || "").trim() : "",
        autorisationParentale: mineur ? true : false,
        via: "inscription-parcours",
        status: "pending", requestedAt: serverTimestamp(), reviewedBy: null, reviewedAt: null,
      });
    } catch (e) { console.error("signUp enrollment:", e); }
    return cred.user;
  })();
  pendingSignUp = run;
  try { return await run; } finally { pendingSignUp = null; }
}
async function resetPassword(email) { await sendPasswordResetEmail(auth, (email || "").trim()); }

/* ---------- PROFIL (Réglages > Mon profil) ----------
   Identité et téléphone : `users/{uid}` (même fiche qu'ABBA Life).
   Naissance, adresse, WhatsApp, contact d'urgence… : `users/{uid}/priv/contact`
   (lisible par la personne, par les coordinateurs avec le droit « suivi » et par son correcteur). */
async function getContact(uid) {
  const snap = await getDoc(doc(db, "users", uid, "priv", "contact"));
  return snap.exists() ? snap.data() : {};
}
async function saveProfil(uid, identite, contact) {
  const prenom = (identite.prenom || "").trim(), nomFam = (identite.nom || "").trim();
  const full = (prenom + " " + nomFam).trim();
  const tel = (identite.telephone || "").trim();
  await setDoc(doc(db, "users", uid), {
    nom: full, prenom: "", prenomSaisi: prenom, nomFamille: nomFam, telephone: tel,
  }, { merge: true });
  try { if (auth.currentUser && auth.currentUser.uid === uid) await updateProfile(auth.currentUser, { displayName: full }); } catch (e) {}
  await setDoc(doc(db, "users", uid, "priv", "contact"), { ...contact, telephone: tel, updatedAt: serverTimestamp() }, { merge: true });
  return { nom: full, telephone: tel };
}
async function changePassword(currentPassword, newPassword) {
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error("no-user");
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
  await updatePassword(u, newPassword);
}
// Toutes les données de la personne qu'elle a le droit de lire, pour téléchargement
async function exportMyData(uid) {
  const out = { exporteLe: new Date().toISOString(), uid };
  const lire = async (chemin, cle) => { try { const s = await getDoc(doc(db, ...chemin)); if (s.exists()) out[cle] = s.data(); } catch (e) {} };
  const liste = async (chemin, cle) => { try { const s = await getDocs(collection(db, ...chemin)); if (!s.empty) { out[cle] = {}; s.forEach((d) => { out[cle][d.id] = d.data(); }); } } catch (e) {} };
  await lire(["users", uid], "profil");
  await liste(["users", uid, "priv"], "prive");
  await liste(["users", uid, "months"], "mois");
  await lire(["summaries", uid], "resume");
  await lire(["enrollments", uid + "_parcours"], "demandeAcces");
  await lire(["liens", uid], "lienCorrecteur");
  await lire(["formation", uid], "formation");
  await liste(["formation", uid, "modules"], "modules");
  await liste(["formation", uid, "suivis"], "suivis");
  await liste(["formation", uid, "lecture"], "lectureBible");
  await liste(["formation", uid, "indispos"], "indisponibilites");
  await liste(["formation", uid, "revisions"], "revisions");
  return out;
}
// Demande de suppression : un coordinateur la traite (les données de suivi appartiennent aussi à l'association)
async function requestDeletion(uid, nom, email) {
  await setDoc(doc(db, "deletionRequests", uid), { uid, nom: nom || "", email: email || "", status: "pending", requestedAt: serverTimestamp() });
}
async function getDeletionRequest(uid) {
  const s = await getDoc(doc(db, "deletionRequests", uid)); return s.exists() ? s.data() : null;
}
async function cancelDeletionRequest(uid) { await deleteDoc(doc(db, "deletionRequests", uid)); }
async function loadDeletionRequests() {
  const snap = await getDocs(collection(db, "deletionRequests"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}


/* ---------- NOTIFICATIONS PUSH (rappel quotidien en arrière-plan) ----------
   L'appareil s'enregistre dans `pushTokens/{uid}` ; une tâche GitHub Actions planifiée
   (scripts/envoyer-rappels.mjs) envoie le rappel à l'heure choisie via Firebase Cloud Messaging. */
const MSG_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
async function pushSupported() {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const m = await import(MSG_URL);
    return await m.isSupported();
  } catch (e) { return false; }
}
// retourne { etat } : "ok" | "off" | "bloque" | "non-supporte" | "erreur"
async function registerPush(uid, opts) {
  const ref = doc(db, "pushTokens", uid);
  try {
    if (!opts.actif) {
      await setDoc(ref, { uid, actif: false, updatedAt: serverTimestamp() }, { merge: true });
      return { etat: "off" };
    }
    if (!(await pushSupported())) return { etat: "non-supporte" };
    if (Notification.permission === "default" && opts.demander) { try { await Notification.requestPermission(); } catch (e) {} }
    if (Notification.permission !== "granted") return { etat: "bloque" };
    const m = await import(MSG_URL);
    const reg = await navigator.serviceWorker.ready;
    const token = await m.getToken(m.getMessaging(app), { serviceWorkerRegistration: reg });
    if (!token) return { etat: "erreur" };
    let fuseau = "Africa/Porto-Novo";
    try { fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || fuseau; } catch (e) {}
    await setDoc(ref, {
      uid, actif: true, heure: opts.heure || "20:00", fuseau, langue: opts.langue || "fr",
      tokens: arrayUnion(token), updatedAt: serverTimestamp(),
    }, { merge: true });
    return { etat: "ok" };
  } catch (e) {
    console.error("registerPush:", e);
    return { etat: "erreur" };
  }
}

async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/* ---------- COORDINATEURS (même liste que sur ABBA Life) ---------- */
function watchAdmins(callback) {
  return onSnapshot(collection(db, "admins"), (snap) => {
    callback(snap.docs.map(d => d.id));
  }, (err) => console.error("watchAdmins:", err));
}

/* ---------- COORDINATEURS & BLOCAGE DU PARCOURS ---------- */
const DROITS = ["apercu", "suivi", "corrections", "presences", "binomes", "paiements"];
// Liste complète des coordinateurs avec leurs droits : { email: données }
function watchAdminsData(callback) {
  return onSnapshot(collection(db, "admins"), (snap) => {
    const map = {};
    snap.docs.forEach(d => { map[d.id.toLowerCase()] = d.data(); });
    callback(map);
  }, (err) => console.error("watchAdminsData:", err));
}
// Droits d'un coordinateur. Le principal a tout. Un coordinateur sans réglage de droits garde tout sauf l'aperçu ;
// un coordinateur ajouté depuis Parcours commence sans aucun droit.
function droitsDe(email, map) {
  const e = String(email || "").toLowerCase(), principal = isAdminEmail(e), d = (map || {})[e];
  const out = { principal, admin: principal || !!d, coordinateurs: principal };
  DROITS.forEach(k => { out[k] = principal || (!!d && (d.droits ? d.droits[k] === true : (k !== "apercu" && k !== "paiements"))); });
  return out;
}
async function addAdmin(email, byEmail) {
  const droits = {}; DROITS.forEach(k => { droits[k] = false; });
  await setDoc(doc(db, "admins", lc(email)), { addedBy: lc(byEmail), addedAt: serverTimestamp(), droits });
}
async function setDroits(email, droits) {
  await setDoc(doc(db, "admins", lc(email)), { droits }, { merge: true });
}
async function removeAdmin(email) { await deleteDoc(doc(db, "admins", lc(email))); }
async function setBloque(uid, data) {
  await setDoc(doc(db, "formation", uid), { bloque: data }, { merge: true });
}

/* ---------- MODULES DU PARCOURS BÂTISSEUR ---------- */
function watchModulesConfig(callback) {
  return onSnapshot(doc(db, "config", "modules"), (snap) => {
    callback(snap.exists() ? snap.data().list : null);
  }, (err) => console.error("watchModulesConfig:", err));
}
async function saveModulesConfig(list) {
  await setDoc(doc(db, "config", "modules"), { list, updatedAt: serverTimestamp() });
}
function watchParcours(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "parcours"), (snap) => {
    callback(snap.exists() ? (snap.data().modulesTermines || []) : []);
  }, (err) => console.error("watchParcours:", err));
}
async function saveParcours(uid, modulesTermines) {
  await setDoc(doc(db, "users", uid, "priv", "parcours"), { modulesTermines });
}

/* ---------- RÉSUMÉ POUR LES COORDINATEURS (même document que sur ABBA Life) ---------- */
async function loadAllSummaries() {
  const snap = await getDocs(collection(db, "summaries"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
async function saveModulesSummary(uid, summary) {
  await setDoc(doc(db, "summaries", uid), { ...summary, updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------- BINÔMES (accountability) ----------
   Le coordinateur relie deux Bâtisseurs (par e-mail). Chacun tient SA fiche
   (visible en lecture seule par l'autre) — sauf le "geste du mois", qui reste
   strictement privé (stocké ailleurs, jamais lisible par le binôme).
   Chaque membre garde un pointeur vers son binôme dans son espace privé —
   plus simple et plus fiable qu'une recherche dans toute la collection. */
function binomeId(email1, email2) {
  return [email1.trim().toLowerCase(), email2.trim().toLowerCase()].sort().join("__");
}
async function createBinome(m1, m2, createdByEmail) {
  // m1/m2 = { email, uid }
  const id = binomeId(m1.email, m2.email);
  await setDoc(doc(db, "binomes", id), {
    membre1: m1.email.trim().toLowerCase(),
    membre2: m2.email.trim().toLowerCase(),
    createdBy: createdByEmail,
    createdAt: serverTimestamp(),
    fiches: {},
  });
  await Promise.all([
    setDoc(doc(db, "users", m1.uid, "priv", "binome"), { pairId: id }),
    setDoc(doc(db, "users", m2.uid, "priv", "binome"), { pairId: id }),
  ]);
}
async function deleteBinome(pairId, uid1, uid2) {
  await deleteDoc(doc(db, "binomes", pairId));
  const cleanups = [];
  if (uid1) cleanups.push(deleteDoc(doc(db, "users", uid1, "priv", "binome")).catch(() => {}));
  if (uid2) cleanups.push(deleteDoc(doc(db, "users", uid2, "priv", "binome")).catch(() => {}));
  await Promise.all(cleanups);
}
async function loadAllBinomes() {
  const snap = await getDocs(collection(db, "binomes"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function findMyBinome(myUid) {
  const ptrSnap = await getDoc(doc(db, "users", myUid, "priv", "binome"));
  if (!ptrSnap.exists() || !ptrSnap.data().pairId) return null;
  const pairId = ptrSnap.data().pairId;
  const pairSnap = await getDoc(doc(db, "binomes", pairId));
  return pairSnap.exists() ? { id: pairSnap.id, ...pairSnap.data() } : null;
}
function watchBinome(pairId, callback) {
  return onSnapshot(doc(db, "binomes", pairId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => console.error("watchBinome:", err));
}
// Chacun n'écrit que dans SA propre clé — la fusion Firestore préserve la fiche de l'autre.
async function saveMyFiche(pairId, myEmail, content) {
  const key = myEmail.trim().toLowerCase();
  await setDoc(doc(db, "binomes", pairId), {
    fiches: { [key]: { ...content, updatedAt: serverTimestamp() } },
  }, { merge: true });
}

// Progression visible par le binôme : chacun n'écrit que SA propre entrée
async function saveMyProgress(pairId, myEmail, data) {
  const key = myEmail.trim().toLowerCase();
  await setDoc(doc(db, "binomes", pairId), {
    progress: { [key]: { ...data, updatedAt: serverTimestamp() } },
  }, { merge: true });
}

/* ---------- GESTE DU MOIS (strictement privé — jamais visible par le binôme) ---------- */
function watchMyGeste(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "binomeGeste"), (snap) => {
    callback(snap.exists() ? (snap.data().gesteDuMois || "") : "");
  }, (err) => console.error("watchMyGeste:", err));
}
async function saveMyGeste(uid, gesteDuMois) {
  await setDoc(doc(db, "users", uid, "priv", "binomeGeste"), { gesteDuMois });
}

/* ---------- ZONES DE CARACTÈRE (auto-évaluation mensuelle) ---------- */
// Liste partagée des 6 zones (comme les modules), modifiable par les coordinateurs
function watchZonesConfig(callback) {
  return onSnapshot(doc(db, "config", "zones"), (snap) => {
    callback(snap.exists() ? snap.data().list : null);
  }, (err) => console.error("watchZonesConfig:", err));
}
async function saveZonesConfig(list) {
  await setDoc(doc(db, "config", "zones"), { list, updatedAt: serverTimestamp() });
}
// Mon évaluation personnelle, un objet par mois (AAAA-MM) — strictement privé
function watchMyZones(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "zones"), (snap) => {
    callback(snap.exists() ? (snap.data().parMois || {}) : {});
  }, (err) => console.error("watchMyZones:", err));
}
async function saveMyZonesMonth(uid, monthKey, evaluation) {
  await setDoc(doc(db, "users", uid, "priv", "zones"), {
    parMois: { [monthKey]: { ...evaluation, updatedAt: serverTimestamp() } },
  }, { merge: true });
}

// Exercices choisis par zone de caractère, mois par mois
function watchZonesPlan(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "zonesExercices"), (snap) => {
    callback(snap.exists() ? (snap.data().parMois || {}) : {});
  }, (err) => console.error("watchZonesPlan:", err));
}
async function saveZonesPlan(uid, monthKey, partial) {
  await setDoc(doc(db, "users", uid, "priv", "zonesExercices"), {
    parMois: { [monthKey]: { ...partial, updatedAt: serverTimestamp() } },
  }, { merge: true });
}

/* ---------- DIMENSIONS (Physique, Profession) — objectif libre du mois ---------- */
// docKey = "physique" ou "profession"
function watchMyDimension(uid, docKey, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", docKey), (snap) => {
    callback(snap.exists() ? (snap.data().parMois || {}) : {});
  }, (err) => console.error("watchMyDimension:" + docKey, err));
}
async function saveMyDimensionMonth(uid, docKey, monthKey, data) {
  await setDoc(doc(db, "users", uid, "priv", docKey), {
    parMois: { [monthKey]: { ...data, updatedAt: serverTimestamp() } },
  }, { merge: true });
}

/* ---------- PRÉSENCE AUX SÉANCES (marquée par le coordinateur uniquement) ---------- */
function watchSeances(callback) {
  return onSnapshot(collection(db, "seances"), (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    callback(list);
  }, (err) => console.error("watchSeances:", err));
}
async function createSeance(titre, date, createdByEmail) {
  const ref = doc(collection(db, "seances"));
  await setDoc(ref, { titre, date, createdBy: createdByEmail, createdAt: serverTimestamp(), presences: {} });
}
async function deleteSeance(seanceId) {
  await deleteDoc(doc(db, "seances", seanceId));
}
async function markPresence(seanceId, uid, nom, present) {
  await setDoc(doc(db, "seances", seanceId), {
    presences: { [uid]: { present, nom } },
  }, { merge: true });
}

/* ---------- MON PROFIL DE FORMATION (MBTI, dons spirituels) ----------
   Visible par le coordinateur (comme c'était déjà le cas par WhatsApp) —
   contrairement aux zones/dimensions, ce n'est pas une lutte personnelle. */
function watchMyProfilFormation(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "profilFormation"), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  }, (err) => console.error("watchMyProfilFormation:", err));
}
async function saveMyProfilFormation(uid, data) {
  await setDoc(doc(db, "users", uid, "priv", "profilFormation"), data, { merge: true });
}

/* ── Enrollment — accès contrôlé ──────────────────────────────
   Clé Firestore : /enrollments/{uid}_{app}
   status : "pending" | "active" | "refused"             */
async function getMyEnrollment(uid, app) {
  const snap = await getDoc(doc(db, "enrollments", uid + "_" + app));
  return snap.exists() ? snap.data() : null;
}
async function requestEnrollment(uid, app, nom, prenom, email) {
  const key = uid + "_" + app;
  const existing = await getDoc(doc(db, "enrollments", key));
  if (existing.exists()) return;
  await setDoc(doc(db, "enrollments", key), {
    uid, app, nom: nom || "", prenom: prenom || "", email: email || "",
    status: "pending", requestedAt: serverTimestamp(),
    reviewedBy: null, reviewedAt: null,
  });
}
function watchAllEnrollments(app, callback) {
  return onSnapshot(collection(db, "enrollments"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.app === app));
  }, (err) => console.error("watchAllEnrollments:", err));
}
async function reviewEnrollment(uid, app, status, reviewerEmail) {
  const ref = doc(db, "enrollments", uid + "_" + app);
  let avant = "";
  try { const s = await getDoc(ref); avant = s.exists() ? s.data().status : ""; } catch (e) {}
  await setDoc(ref, { status, reviewedBy: reviewerEmail, reviewedAt: serverTimestamp() }, { merge: true });
  // Un nouvel étudiant (demande en attente) reçoit un compte de paiement de 5 000 F ; la cohorte d'avant n'est pas touchée.
  if (app === "parcours" && status === "active" && (avant === "pending" || avant === "")) {
    try {
      const c = doc(db, "formation", uid, "compte", "paiement");
      if (!(await getDoc(c)).exists()) await setDoc(c, { actif: true, total: 5000, paye: 0, creeLe: new Date().toISOString(), updatedAt: serverTimestamp() });
    } catch (e) { console.warn("compte de paiement non créé :", e); }
  }
}

/* ── Paiements : compte (total, payé), versements, déclarations ── */
const compteRef = (uid) => doc(db, "formation", uid, "compte", "paiement");
const listeDe = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
function watchCompte(uid, cb) { return onSnapshot(compteRef(uid), (s) => cb(s.exists() ? s.data() : null), (e) => console.error("watchCompte:", e)); }
function watchPaiements(uid, cb) { return onSnapshot(collection(db, "formation", uid, "paiements"), (s) => cb(listeDe(s)), (e) => console.error("watchPaiements:", e)); }
function watchDeclarations(uid, cb) { return onSnapshot(collection(db, "formation", uid, "declarations"), (s) => cb(listeDe(s)), (e) => console.error("watchDeclarations:", e)); }
function watchConfigPaiement(cb) { return onSnapshot(doc(db, "config", "paiement"), (s) => cb(s.exists() ? s.data() : null), () => cb(null)); }
async function loadCompte(uid) { const s = await getDoc(compteRef(uid)); return s.exists() ? s.data() : null; }
async function loadPaiements(uid) { return listeDe(await getDocs(collection(db, "formation", uid, "paiements"))); }
async function loadDeclarations(uid) { return listeDe(await getDocs(collection(db, "formation", uid, "declarations"))); }
async function addDeclaration(uid, data) {
  await setDoc(doc(collection(db, "formation", uid, "declarations")), { montant: data.montant, mode: data.mode, reference: data.reference || "", statut: "attente", creeLe: data.creeLe, updatedAt: serverTimestamp() });
}
async function enregistrerPaiement(uid, p, declId) {
  const ref = doc(collection(db, "formation", uid, "paiements")), batch = writeBatch(db), cref = compteRef(uid);
  const iso = new Date().toISOString(), montant = Number(p.montant);
  const recuNum = "ABBA-" + String(p.date || iso.slice(0, 10)).replace(/-/g, "") + "-" + ref.id.slice(0, 4).toUpperCase();
  if (!(await getDoc(cref)).exists()) batch.set(cref, { actif: true, total: 5000, paye: montant, creeLe: iso, updatedAt: serverTimestamp() });
  else batch.update(cref, { paye: increment(montant), updatedAt: serverTimestamp() });
  batch.set(ref, { montant, mode: p.mode, reference: p.reference || "", date: p.date || iso.slice(0, 10), note: p.note || "", recuNum, parEmail: lc(p.parEmail), creeLe: iso, ...(declId ? { declId } : {}), updatedAt: serverTimestamp() });
  if (declId) batch.update(doc(db, "formation", uid, "declarations", declId), { statut: "valide", traitePar: lc(p.parEmail), traiteLe: iso, updatedAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}
async function annulerPaiement(uid, pid, montant, par) {
  const batch = writeBatch(db), iso = new Date().toISOString();
  batch.update(doc(db, "formation", uid, "paiements", pid), { annule: true, annulePar: lc(par), annuleLe: iso, updatedAt: serverTimestamp() });
  batch.update(compteRef(uid), { paye: increment(-Number(montant)), updatedAt: serverTimestamp() });
  await batch.commit();
}
async function traiterDeclaration(uid, did, statut, par) {
  await updateDoc(doc(db, "formation", uid, "declarations", did), { statut, traitePar: lc(par), traiteLe: new Date().toISOString(), updatedAt: serverTimestamp() });
}
async function activerCompte(uid) {
  if (!(await getDoc(compteRef(uid))).exists()) await setDoc(compteRef(uid), { actif: true, total: 5000, paye: 0, creeLe: new Date().toISOString(), updatedAt: serverTimestamp() });
}
async function setTarif(uid, total, note, par) {
  const cref = compteRef(uid);
  if (!(await getDoc(cref)).exists()) await setDoc(cref, { actif: true, total, paye: 0, note: note || "", majPar: lc(par), creeLe: new Date().toISOString(), updatedAt: serverTimestamp() });
  else await updateDoc(cref, { total, note: note || "", majPar: lc(par), updatedAt: serverTimestamp() });
}
/* ── Fonds de solidarité : dons anonymes qui couvrent les frais d'un Bâtisseur sans moyens ── */
const fondsRef = () => doc(db, "config", "solidarite");
async function addDon(uid, d) {
  await setDoc(doc(collection(db, "solidarite")), { uid, nom: d.nom || "", montant: d.montant, mode: d.mode, reference: d.reference || "", statut: "attente", creeLe: d.creeLe, updatedAt: serverTimestamp() });
}
async function loadMesDons(uid) { return listeDe(await getDocs(query(collection(db, "solidarite"), where("uid", "==", uid)))); }
async function loadDonsAttente() { return listeDe(await getDocs(query(collection(db, "solidarite"), where("statut", "==", "attente")))); }
async function loadFonds() { const s = await getDoc(fondsRef()); return s.exists() ? s.data() : { solde: 0, totalRecu: 0, totalAffecte: 0 }; }
async function confirmerDon(did, montant, par) {
  const batch = writeBatch(db), iso = new Date().toISOString();
  batch.update(doc(db, "solidarite", did), { statut: "valide", traitePar: lc(par), traiteLe: iso, recuNum: "DON-" + iso.slice(0, 10).replace(/-/g, "") + "-" + did.slice(0, 4).toUpperCase(), updatedAt: serverTimestamp() });
  batch.set(fondsRef(), { solde: increment(Number(montant)), totalRecu: increment(Number(montant)), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}
async function refuserDon(did, par) { await updateDoc(doc(db, "solidarite", did), { statut: "refuse", traitePar: lc(par), traiteLe: new Date().toISOString(), updatedAt: serverTimestamp() }); }
async function affecterSolidarite(uid, montant, par) {
  const m = Number(montant);
  if (!((await loadFonds()).solde >= m)) throw new Error("fonds-insuffisant");
  const ref = doc(collection(db, "formation", uid, "paiements")), cref = compteRef(uid), batch = writeBatch(db), iso = new Date().toISOString();
  const recuNum = "ABBA-" + iso.slice(0, 10).replace(/-/g, "") + "-" + ref.id.slice(0, 4).toUpperCase();
  if (!(await getDoc(cref)).exists()) batch.set(cref, { actif: true, total: 5000, paye: m, creeLe: iso, updatedAt: serverTimestamp() });
  else batch.update(cref, { paye: increment(m), updatedAt: serverTimestamp() });
  batch.set(ref, { montant: m, mode: "solidarite", reference: "", date: iso.slice(0, 10), note: "Fonds de solidarité", recuNum, parEmail: lc(par), creeLe: iso, updatedAt: serverTimestamp() });
  batch.set(fondsRef(), { solde: increment(-m), totalAffecte: increment(m), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  return ref.id;
}
async function setInstructions(texte, par) {
  await setDoc(doc(db, "config", "paiement"), { instructions: texte, majPar: lc(par), updatedAt: serverTimestamp() }, { merge: true });
}

/* ============================================================
   FORMATION EN AUTONOMIE : correcteurs, liens, progression
   ============================================================ */
const lc = (s) => String(s || "").trim().toLowerCase();

// Correcteurs (liste gérée par le coordinateur)
function watchCorrecteurs(callback) {
  return onSnapshot(collection(db, "correcteurs"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("watchCorrecteurs:", err));
}
async function addCorrecteur(email, nom, byEmail) {
  await setDoc(doc(db, "correcteurs", lc(email)), { email: lc(email), nom: nom || "", addedBy: byEmail, addedAt: serverTimestamp() });
}
async function removeCorrecteur(email) { await deleteDoc(doc(db, "correcteurs", lc(email))); }
async function amICorrecteur(email) {
  try { return (await getDoc(doc(db, "correcteurs", lc(email)))).exists(); } catch (e) { return false; }
}

// Liens étudiant -> correcteur
async function setLien(uid, data) {
  await setDoc(doc(db, "liens", uid), { uid, ...data, correcteurEmail: lc(data.correcteurEmail), updatedAt: serverTimestamp() });
}
async function deleteLien(uid) { await deleteDoc(doc(db, "liens", uid)); }
async function loadAllLiens() {
  const snap = await getDocs(collection(db, "liens"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getMyLien(uid) {
  try { const s = await getDoc(doc(db, "liens", uid)); return s.exists() ? s.data() : null; } catch (e) { return null; }
}
async function loadMyStudents(email) {
  const snap = await getDocs(query(collection(db, "liens"), where("correcteurEmail", "==", lc(email))));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Progression de formation d'un étudiant
function watchFormationMeta(uid, callback) {
  return onSnapshot(doc(db, "formation", uid), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  }, (err) => { console.error("watchFormationMeta:", err); callback({}); });
}
async function setAcquis(uid, acquis, extra) {
  await setDoc(doc(db, "formation", uid), { acquis, ...(extra || {}), updatedAt: serverTimestamp() }, { merge: true });
}
function watchFormationModules(uid, callback) {
  return onSnapshot(collection(db, "formation", uid, "modules"), (snap) => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    callback(map);
  }, (err) => console.error("watchFormationModules:", err));
}
async function saveModulePart(uid, mid, partial) {
  await setDoc(doc(db, "formation", uid, "modules", mid), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
}
async function loadStudentModules(uid) {
  const snap = await getDocs(collection(db, "formation", uid, "modules"));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data(); });
  return map;
}
async function reviewFiche(uid, mid, status, comment, byEmail) {
  await updateDoc(doc(db, "formation", uid, "modules", mid), {
    ficheStatus: status, correctorComment: comment || "", validatedBy: lc(byEmail), validatedAt: serverTimestamp(),
  });
}

// Suivis quotidiens (exercices sur plusieurs jours)
function watchSuivis(uid, callback) {
  return onSnapshot(collection(db, "formation", uid, "suivis"), (snap) => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    callback(map);
  }, (err) => console.error("watchSuivis:", err));
}
async function startSuivi(uid, id, data) {
  const ref = doc(db, "formation", uid, "suivis", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, { ...data, done: {}, notes: {}, updatedAt: serverTimestamp() });
}
async function updateSuivi(uid, id, partial) {
  await updateDoc(doc(db, "formation", uid, "suivis", id), { ...partial, updatedAt: serverTimestamp() });
}
function watchIndispos(uid, callback) {
  return onSnapshot(collection(db, "formation", uid, "indispos"), (snap) => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    callback(map);
  }, (err) => console.error("watchIndispos:", err));
}
async function addIndispo(uid, data) {
  const ref = doc(collection(db, "formation", uid, "indispos"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
  return ref.id;
}
async function updateIndispo(uid, id, partial) {
  await updateDoc(doc(db, "formation", uid, "indispos", id), { ...partial, updatedAt: serverTimestamp() });
}
function watchRevisions(uid, callback) {
  return onSnapshot(collection(db, "formation", uid, "revisions"), (snap) => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    callback(map);
  }, (err) => console.error("watchRevisions:", err));
}
async function saveRevision(uid, mid, partial) {
  await setDoc(doc(db, "formation", uid, "revisions", mid), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
}
async function setSuiviForce(uid, actif) {
  await setDoc(doc(db, "formation", uid), { suiviForce: !!actif }, { merge: true });
}
function watchLecture(uid, planId, callback) {
  return onSnapshot(doc(db, "formation", uid, "lecture", planId), (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error("watchLecture:", err));
}
async function saveLecture(uid, planId, data) {
  await setDoc(doc(db, "formation", uid, "lecture", planId), { ...data, updatedAt: serverTimestamp() });
}
async function loadStudentLecture(uid, planId = "nt-180") {
  const snap = await getDoc(doc(db, "formation", uid, "lecture", planId));
  return snap.exists() ? snap.data() : null;
}
async function loadStudentIndispos(uid) {
  const snap = await getDocs(collection(db, "formation", uid, "indispos"));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data(); });
  return map;
}
async function loadStudentSuivis(uid) {
  const snap = await getDocs(collection(db, "formation", uid, "suivis"));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data(); });
  return map;
}

/* ---------- JOURNAL DES ACTIONS SENSIBLES ----------
   Chaque action importante d'un coordinateur ou d'un correcteur laisse une ligne (qui, quoi, sur qui, quand).
   Une ligne ne peut plus être modifiée ni effacée ensuite (règles Firestore). Lecture : coordinateur principal. */
async function journaliser(action, cible, detail) {
  try {
    const u = auth.currentUser; if (!u || !u.email) return;
    await setDoc(doc(collection(db, "journal")), {
      action: String(action).slice(0, 60), cible: String(cible == null ? "" : cible).slice(0, 160), detail: String(detail == null ? "" : detail).slice(0, 300),
      par: String(u.email).toLowerCase(), parUid: u.uid, date: serverTimestamp(),
    });
  } catch (e) { console.warn("journal :", e && (e.code || e.message)); }
}
async function loadJournal(n) {
  const snap = await getDocs(query(collection(db, "journal"), orderBy("date", "desc"), limit(n || 150)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
const currentEmail = () => (auth.currentUser && auth.currentUser.email) || "";
// Enveloppe : exécute l'action, puis la note au journal (le journal ne bloque jamais l'action).
const L = (fn, action, f) => async (...a) => { const r = await fn(...a); let x = []; try { x = f(...a, r) || []; } catch (e) {} journaliser(action, x[0], x[1]); return r; };
const droitsActifs = (d) => Object.keys(d || {}).filter(k => d[k] === true).join(", ") || "aucun";
const ajoutes = {
  addAdmin: L(addAdmin, "coordinateur_ajoute", (email) => [email]),
  removeAdmin: L(removeAdmin, "coordinateur_retire", (email) => [email]),
  setDroits: L(setDroits, "droits_modifies", (email, d) => [email, droitsActifs(d)]),
  setBloque: L(setBloque, "acces_bloque_modifie", (uid, data) => [uid, data && data.actif ? "Accès bloqué" + (data.motif ? " — " + data.motif : "") : "Accès débloqué"]),
  saveModulesConfig: L(saveModulesConfig, "modules_ouverts_modifies", () => ["config/modules"]),
  createBinome: L(createBinome, "binome_cree", (m1, m2) => [m1 + " + " + m2]),
  deleteBinome: L(deleteBinome, "binome_supprime", (pairId) => [pairId]),
  deleteSeance: L(deleteSeance, "seance_supprimee", (id) => [id]),
  reviewEnrollment: L(reviewEnrollment, "inscription_revue", (uid, app, status) => [uid, app + " : " + status]),
  enregistrerPaiement: L(enregistrerPaiement, "paiement_enregistre", (uid, p) => [uid, p.montant + " F · " + p.mode]),
  annulerPaiement: L(annulerPaiement, "paiement_annule", (uid, pid, montant) => [uid, montant + " F"]),
  traiterDeclaration: L(traiterDeclaration, "declaration_traitee", (uid, did, statut) => [uid, statut]),
  activerCompte: L(activerCompte, "compte_paiement_active", (uid) => [uid]),
  setTarif: L(setTarif, "tarif_modifie", (uid, total) => [uid, total + " F"]),
  setInstructions: L(setInstructions, "instructions_paiement_modifiees", () => ["config/paiement"]),
  confirmerDon: L(confirmerDon, "don_confirme", (did, montant) => [did, montant + " F"]),
  refuserDon: L(refuserDon, "don_refuse", (did) => [did]),
  affecterSolidarite: L(affecterSolidarite, "solidarite_affectee", (uid, montant) => [uid, montant + " F"]),
  addCorrecteur: L(addCorrecteur, "correcteur_ajoute", (email) => [email]),
  removeCorrecteur: L(removeCorrecteur, "correcteur_retire", (email) => [email]),
  setLien: L(setLien, "lien_correcteur_pose", (uid, data) => [uid, (data && data.correcteurEmail) || ""]),
  deleteLien: L(deleteLien, "lien_correcteur_retire", (uid) => [uid]),
  setAcquis: L(setAcquis, "acquis_modifies", (uid) => [uid]),
  setSuiviForce: L(setSuiviForce, "suivi_force", (uid, actif) => [uid, String(actif)]),
  reviewFiche: L(reviewFiche, "fiche_revue", (uid, mid, status) => [uid, mid + " : " + status]),
};

window.AbbaSync = {
  isAdminEmail,
  logIn, logOut, signUp, resetPassword, watchAuth, getUserProfile,
  registerPush, pushSupported, getContact, saveProfil, changePassword, exportMyData, requestDeletion, getDeletionRequest, cancelDeletionRequest, loadDeletionRequests,
  watchAdmins, addAdmin, removeAdmin, setBloque,
  watchModulesConfig, saveModulesConfig,
  watchParcours, saveParcours,
  loadAllSummaries, saveModulesSummary,
  createBinome, deleteBinome, loadAllBinomes, findMyBinome, watchBinome, saveMyFiche,
  watchMyGeste, saveMyGeste,
  watchZonesConfig, saveZonesConfig, watchMyZones, saveMyZonesMonth,
  watchMyDimension, saveMyDimensionMonth,
  watchSeances, createSeance, deleteSeance, markPresence,
  watchMyProfilFormation, saveMyProfilFormation,
  getMyEnrollment, requestEnrollment, watchAllEnrollments, reviewEnrollment,
  watchCorrecteurs, addCorrecteur, removeCorrecteur, amICorrecteur,
  setLien, deleteLien, loadAllLiens, getMyLien, loadMyStudents,
  watchFormationMeta, setAcquis, watchFormationModules, saveModulePart, loadStudentModules, reviewFiche,
  watchSuivis, startSuivi, updateSuivi, loadStudentSuivis,
  watchIndispos, addIndispo, updateIndispo, loadStudentIndispos,
  watchRevisions, saveRevision, setSuiviForce,
  watchAdminsData, droitsDe, setDroits,
  watchLecture, saveLecture, loadStudentLecture,
  watchCompte, watchPaiements, watchDeclarations, watchConfigPaiement, loadCompte, loadPaiements, loadDeclarations,
  addDeclaration, enregistrerPaiement, annulerPaiement, traiterDeclaration, activerCompte, setTarif, setInstructions,
  addDon, loadMesDons, loadDonsAttente, loadFonds, confirmerDon, refuserDon, affecterSolidarite,
  watchZonesPlan, saveZonesPlan, saveMyProgress,
  loadJournal, currentEmail, journaliser,
  ...ajoutes,
};
