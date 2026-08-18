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
  enableIndexedDbPersistence, collection, getDocs, query, where,
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
   strictement privé (stocké ailleurs, jamais lisible par le binôme). */
function binomeId(email1, email2) {
  return [email1.trim().toLowerCase(), email2.trim().toLowerCase()].sort().join("__");
}
async function createBinome(email1, email2, createdByEmail) {
  const id = binomeId(email1, email2);
  await setDoc(doc(db, "binomes", id), {
    membre1: email1.trim().toLowerCase(),
    membre2: email2.trim().toLowerCase(),
    createdBy: createdByEmail,
    createdAt: serverTimestamp(),
    fiches: {},
  });
}
async function deleteBinome(pairId) {
  await deleteDoc(doc(db, "binomes", pairId));
}
async function loadAllBinomes() {
  const snap = await getDocs(collection(db, "binomes"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function findMyBinome(myEmail) {
  const email = myEmail.trim().toLowerCase();
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "binomes"), where("membre1", "==", email))),
    getDocs(query(collection(db, "binomes"), where("membre2", "==", email))),
  ]);
  const docs = [...snap1.docs, ...snap2.docs];
  return docs.length > 0 ? { id: docs[0].id, ...docs[0].data() } : null;
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

window.AbbaSync = {
  isAdminEmail,
  logIn, logOut, watchAuth, getUserProfile,
  watchAdmins,
  watchModulesConfig, saveModulesConfig,
  watchParcours, saveParcours,
  loadAllSummaries, saveModulesSummary,
  createBinome, deleteBinome, loadAllBinomes, findMyBinome, watchBinome, saveMyFiche,
  watchMyGeste, saveMyGeste,
};
