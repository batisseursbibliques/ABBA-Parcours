// ============================================================
// sync.js — Parcours Bâtisseur
// Utilise EXACTEMENT le même projet Firebase qu'ABBA Life : mêmes comptes,
// même base de données. Un Bâtisseur se connecte ici avec le même e-mail/
// mot de passe que sur ABBA Life — pas de double inscription.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
  enableIndexedDbPersistence, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try { enableIndexedDbPersistence(db); } catch (e) { /* déjà activé dans un autre onglet — sans gravité */ }

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(String(email).toLowerCase());
}

/* ---------- AUTHENTIFICATION ----------
   Pas d'inscription ici : le compte se crée uniquement depuis ABBA Life.
   Parcours Bâtisseur ne fait que se connecter avec le compte déjà existant. */
async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}
async function logOut() { await signOut(auth); }
function watchAuth(callback) { onAuthStateChanged(auth, callback); }
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

/* ---------- ENROLLMENT — accès contrôlé par le coordinateur ----------
   /enrollments/{uid} : { app, status, nom, prenom, email,
                          requestedAt, reviewedBy, reviewedAt }
   status : "pending" | "active" | "refused"
   app    : "parcours" | "mea"                                         */

async function getMyEnrollment(uid, app) {
  const snap = await getDoc(doc(db, "enrollments", uid + "_" + app));
  return snap.exists() ? snap.data() : null;
}

async function requestEnrollment(uid, app, nom, prenom, email) {
  const key = uid + "_" + app;
  const existing = await getDoc(doc(db, "enrollments", key));
  if (existing.exists()) return; // déjà demandé — ne pas écraser
  await setDoc(doc(db, "enrollments", key), {
    uid, app, nom: nom || "", prenom: prenom || "", email: email || "",
    status: "pending",
    requestedAt: serverTimestamp(),
    reviewedBy: null, reviewedAt: null,
  });
}

function watchPendingEnrollments(app, callback) {
  // Admin uniquement — surveille les demandes en attente pour une app
  return onSnapshot(collection(db, "enrollments"), (snap) => {
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.app === app);
    callback(list);
  }, (err) => console.error("watchPendingEnrollments:", err));
}

async function reviewEnrollment(uid, app, status, reviewerEmail) {
  const key = uid + "_" + app;
  await setDoc(doc(db, "enrollments", key), {
    status,
    reviewedBy: reviewerEmail,
    reviewedAt: serverTimestamp(),
  }, { merge: true });
}

async function loadActiveEnrollments(app) {
  const snap = await getDocs(collection(db, "enrollments"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.app === app && e.status === "active");
}

window.AbbaSync = {
  isAdminEmail,
  logIn, logOut, watchAuth, getUserProfile,
  watchAdmins,
  watchModulesConfig, saveModulesConfig,
  watchParcours, saveParcours,
  loadAllSummaries, saveModulesSummary,
  createBinome, deleteBinome, loadAllBinomes, findMyBinome, watchBinome, saveMyFiche,
  watchMyGeste, saveMyGeste,
  watchZonesConfig, saveZonesConfig, watchMyZones, saveMyZonesMonth,
  watchMyDimension, saveMyDimensionMonth,
  watchSeances, createSeance, deleteSeance, markPresence,
  watchMyProfilFormation, saveMyProfilFormation,
  getMyEnrollment, requestEnrollment, watchPendingEnrollments,
  reviewEnrollment, loadActiveEnrollments,
};
