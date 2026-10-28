// Effacer des attestations de module (ou le certificat final) d'UNE personne pour qu'elles soient refaites — lancé À LA MAIN
// depuis GitHub > Actions > « Supprimer des attestations (pour les refaire) ».
// Sécurité : SIMULATION=1 (par défaut) n'efface RIEN, il liste seulement les attestations de la personne.
// On efface, pour chaque module demandé : la copie privée (formation/{uid}/attestations/{clé}) et le document public de
// vérification (attestations/{numéro}). L'application recrée une attestation neuve (nouveau numéro) à la prochaine ouverture.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJET = process.env.GCLOUD_PROJECT || "abba-life-c6b5c";
const SIMULATION = process.env.SIMULATION !== "0";
const EMAIL = (process.env.EMAIL || "").trim().toLowerCase();
const CLES = (process.env.MODULES || "").split(",").map((x) => x.trim()).filter(Boolean);
if (!EMAIL) throw new Error("Indique l'adresse e-mail de la personne.");

initializeApp({ credential: applicationDefault(), projectId: PROJET });
const db = getFirestore(), auth = getAuth();

const u = await auth.getUserByEmail(EMAIL);
const uid = u.uid;
const profil = (await db.doc(`users/${uid}`).get()).data() || {};
const contact = (await db.doc(`users/${uid}/priv/contact`).get()).data() || {};
console.log(`Compte : ${EMAIL} (nom du profil : ${profil.nom || profil.name || "?"}) · pays du profil : ${contact.pays || "(non renseigné)"}`);

const liste = await db.collection(`formation/${uid}/attestations`).get();
const par = {};
liste.forEach((d) => { par[d.id] = d.data(); const a = d.data();
  console.log(`  - clé « ${d.id} » · ${a.type} · ${a.date} · N° ${a.numero} · pays: ${a.pays || "—"} · signature coordinateur: ${a.sigCoord ? "oui" : "non"}`); });
if (!liste.size) console.log("  (aucune attestation)");

if (!CLES.length) { console.log("\nListe seulement : rien n'est effacé (aucun module demandé)."); process.exit(0); }
for (const k of CLES) if (!par[k]) throw new Error(`Aucune attestation « ${k} » pour ce compte : rien n'a été effacé.`);
console.log(`\n${SIMULATION ? "SIMULATION — serait effacé" : "EFFACEMENT"} : ${CLES.join(", ")}`);
if (SIMULATION) process.exit(0);
for (const k of CLES) {
  const a = par[k], pub = db.doc(`attestations/${a.numero}`), p = await pub.get();
  const lot = db.batch();
  lot.delete(db.doc(`formation/${uid}/attestations/${k}`));
  if (p.exists && p.data().numero === a.numero) lot.delete(pub);
  await lot.commit();
  console.log(`  ✔ « ${k} » (N° ${a.numero}) effacée.`);
}
