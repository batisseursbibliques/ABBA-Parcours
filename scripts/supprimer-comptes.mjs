// Suppression des comptes qui l'ont demandé (collection deletionRequests) — lancé À LA MAIN
// depuis GitHub > Actions > « Supprimer les comptes demandés ».
//
// Pour chaque personne qui a demandé la suppression de son compte :
//   1. on garde (sans nom, sans identifiant) une trace anonyme des versements et dons, pour la comptabilité
//      de l'association (sauf si GARDER_FINANCES=0) ;
//   2. on efface toutes ses données : profil, espace privé, mois, formation (modules, réponses, suivis,
//      lecture, indisponibilités, révisions, versements, déclarations), résumé, rappels, lien correcteur,
//      demande d'accès, binômes, dons, présences aux séances ;
//   3. on supprime son compte de connexion (Authentication) ;
//   4. enfin on supprime la demande elle-même (elle disparaît de l'écran du coordinateur).
//
// Sécurité : SIMULATION=1 (par défaut) n'efface RIEN, il montre seulement ce qui serait effacé.
// Les coordinateurs et correcteurs ne sont jamais supprimés automatiquement.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJET = process.env.GCLOUD_PROJECT || "abba-life-c6b5c";
const SIMULATION = process.env.SIMULATION !== "0";
const GARDER_FINANCES = process.env.GARDER_FINANCES !== "0";
const UID_SEUL = (process.env.UID_SEUL || "").trim();
const COORDINATEUR_SECOURS = ["apotrepaulabba@gmail.com"];

initializeApp({ credential: applicationDefault(), projectId: PROJET });
const db = getFirestore();
const auth = getAuth();

// Collections que ce programme connaît (les autres sont seulement signalées)
const CONNUES = new Set(["rapports", "users", "summaries", "formation", "pushTokens", "liens", "enrollments", "binomes",
  "solidarite", "seances", "deletionRequests", "correcteurs", "admins", "config", "archives_finances", "mea_mentors", "mea_assignments", "mea_summaries", "mea_numeros", "mea_confirmations", "mea_dossiers", "mea_certifications"]);

const log = (...a) => console.log(...a);

async function compter(ref) {
  // nombre de documents d'un document + ses sous-collections (récursif)
  let n = 0;
  const snap = await ref.get();
  if (snap.exists) n++;
  for (const sub of await ref.listCollections()) {
    for (const d of (await sub.get()).docs) n += await compter(d.ref);
  }
  return n;
}

async function traiter(uid) {
  const rapport = { uid, ok: false, aSupprimer: {}, avertissements: [] };

  // --- Identité du compte de connexion
  let email = "";
  try { email = String((await auth.getUser(uid)).email || "").toLowerCase(); }
  catch (e) { if (e.code !== "auth/user-not-found") throw e; rapport.avertissements.push("compte de connexion déjà absent"); }
  rapport.email = email || "(inconnu)";

  // --- Garde-fous : on ne supprime jamais un coordinateur ou un correcteur
  if (email && COORDINATEUR_SECOURS.includes(email)) { rapport.refus = "coordinateur principal"; return rapport; }
  if (email) {
    if ((await db.doc(`admins/${email}`).get()).exists) { rapport.refus = "coordinateur : le retirer d'abord de la liste des coordinateurs dans l'application"; return rapport; }
    if ((await db.doc(`correcteurs/${email}`).get()).exists) { rapport.refus = "correcteur : le retirer d'abord de la liste des correcteurs dans l'application"; return rapport; }
    if ((await db.doc(`mea_mentors/${email}`).get()).exists) { rapport.refus = "mentor (Mise en Action) : le retirer d'abord de la liste des mentors dans l'application"; return rapport; }
  }

  // --- Inventaire de ce qui existe
  const cibles = {
    "profil et espace privé": db.doc(`users/${uid}`),
    "résumé": db.doc(`summaries/${uid}`),
    "formation (modules, réponses, suivis, lecture…)": db.doc(`formation/${uid}`),
    "rappels (appareils)": db.doc(`pushTokens/${uid}`),
    "lien avec le correcteur": db.doc(`liens/${uid}`),
    "Mise en Action : affectation au mentor": db.doc(`mea_assignments/${uid}`),
    "Mise en Action : résumé": db.doc(`mea_summaries/${uid}`),
    "Mise en Action : confirmations du mentor": db.doc(`mea_confirmations/${uid}`),
    "Mise en Action : dossier de certification": db.doc(`mea_dossiers/${uid}`),
  };
  // Numéros de certificat utilisés par cette personne pour entrer dans la Mise en Action (libère aussi le numéro)
  for (const d of (await db.collection("mea_numeros").where("uid", "==", uid).get()).docs) cibles[`Mise en Action : numéro de certificat ${d.id}`] = d.ref;
  for (const [nom, ref] of Object.entries(cibles)) rapport.aSupprimer[nom] = await compter(ref);

  const enr = await db.collection("enrollments").where("uid", "==", uid).get();
  const enrIds = new Set(enr.docs.map((d) => d.id));
  const parcours = await db.doc(`enrollments/${uid}_parcours`).get();
  if (parcours.exists) enrIds.add(parcours.id);
  rapport.aSupprimer["demandes d'accès"] = enrIds.size;

  const binomes = new Map();
  if (email) {
    for (const champ of ["membre1", "membre2"]) {
      for (const d of (await db.collection("binomes").where(champ, "==", email).get()).docs) binomes.set(d.id, d.ref);
    }
  }
  rapport.aSupprimer["binômes (fiche partagée supprimée aussi pour le binôme)"] = binomes.size;

  const dons = await db.collection("solidarite").where("uid", "==", uid).get();
  rapport.aSupprimer[GARDER_FINANCES ? "dons (gardés sans nom pour la comptabilité)" : "dons"] = dons.size;
  const versements = await db.collection(`formation/${uid}/paiements`).get();
  rapport.aSupprimer[GARDER_FINANCES ? "versements (gardés sans nom pour la comptabilité)" : "versements"] = versements.size;

  const rapportsTouches = [];   // historique mensuel : la ligne du compte dans chaque « point »
  for (const r of (await db.collection("rapports").get()).docs) { if (((r.data().lignes) || {})[uid]) rapportsTouches.push(r.ref); }
  rapport.aSupprimer["lignes de l'historique mensuel"] = rapportsTouches.length;
  const seancesTouchees = [];
  for (const s of (await db.collection("seances").get()).docs) {
    if ((s.data().presences || {})[uid]) seancesTouchees.push(s.ref);
  }
  rapport.aSupprimer["présences aux séances"] = seancesTouchees.length;

  // --- Collections inconnues contenant un champ uid = cette personne : à vérifier à la main
  for (const col of await db.listCollections()) {
    if (CONNUES.has(col.id)) continue;
    try {
      const r = await col.where("uid", "==", uid).get();
      if (!r.empty) rapport.avertissements.push(`${r.size} document(s) dans « ${col.id} » ne sont pas traités par ce programme`);
    } catch (e) { /* pas de champ uid exploitable */ }
  }

  if (SIMULATION) { rapport.ok = true; rapport.simulation = true; return rapport; }

  // --- 1. Trace comptable anonyme (avant tout effacement ; si ça échoue, on s'arrête pour cette personne)
  if (GARDER_FINANCES) {
    const lot = db.batch();
    const stamp = new Date().toISOString();
    versements.docs.forEach((d) => {
      const x = d.data();
      lot.set(db.collection("archives_finances").doc(), {
        type: "versement", montant: x.montant ?? null, mode: x.mode ?? null, date: x.date ?? x.creeLe ?? null,
        recuNum: x.recuNum ?? null, annule: !!x.annule, archiveLe: stamp,
      });
    });
    dons.docs.forEach((d) => {
      const x = d.data();
      lot.set(db.collection("archives_finances").doc(), {
        type: "don-solidarite", montant: x.montant ?? null, mode: x.mode ?? null, statut: x.statut ?? null,
        date: x.creeLe ?? null, recuNum: x.recuNum ?? null, archiveLe: stamp,
      });
    });
    await lot.commit();
  }

  // --- 2. Effacement
  for (const ref of Object.values(cibles)) await db.recursiveDelete(ref);
  for (const id of enrIds) await db.doc(`enrollments/${id}`).delete();
  for (const ref of binomes.values()) await ref.delete();
  for (const d of dons.docs) await d.ref.delete();
  for (const ref of seancesTouchees) await ref.update(new FieldPath("presences", uid), FieldValue.delete());
  for (const ref of rapportsTouches) await ref.update(new FieldPath("lignes", uid), FieldValue.delete());

  // --- 3. Compte de connexion
  try { await auth.deleteUser(uid); }
  catch (e) { if (e.code !== "auth/user-not-found") throw e; }

  // --- 4. La demande elle-même, en dernier (si quelque chose a échoué avant, elle reste pour une nouvelle tentative)
  await db.doc(`deletionRequests/${uid}`).delete();
  // Trace dans le journal des actions (identifiant seulement : ni nom ni e-mail, la personne a demandé l'effacement)
  await db.collection("journal").add({ action: "compte_supprime", cible: uid, detail: GARDER_FINANCES ? "trace comptable anonyme gardée" : "versements et dons effacés", par: "programme de suppression (GitHub)", parUid: "", date: FieldValue.serverTimestamp() });
  rapport.ok = true;
  return rapport;
}

async function main() {
  log(SIMULATION ? "=== SIMULATION : rien n'est effacé ===" : "=== SUPPRESSION RÉELLE ===");
  log(`Trace comptable anonyme : ${GARDER_FINANCES ? "oui" : "non (versements et dons effacés)"}`);
  const demandes = await db.collection("deletionRequests").get();
  let cibles = demandes.docs.map((d) => d.id);
  if (UID_SEUL) cibles = cibles.filter((id) => id === UID_SEUL);
  log(`${cibles.length} demande(s) de suppression à traiter`);
  let erreurs = 0, faits = 0, refus = 0;
  for (const uid of cibles) {
    const nomDemande = (demandes.docs.find((d) => d.id === uid).data() || {}).nom || "";
    log(`\n→ ${nomDemande || "(sans nom)"} [${uid}]`);
    try {
      const r = await traiter(uid);
      log(`   e-mail : ${r.email}`);
      if (r.refus) { log(`   ⛔ NON TRAITÉ — ${r.refus}`); refus++; continue; }
      for (const [k, v] of Object.entries(r.aSupprimer)) log(`   ${SIMULATION ? "à supprimer" : "supprimé"} : ${k} → ${v}`);
      r.avertissements.forEach((a) => log(`   ⚠ ${a}`));
      if (r.ok) faits++;
    } catch (e) {
      erreurs++;
      log(`   ❌ ERREUR : ${e.code || e.message} (la demande est conservée, tu peux relancer)`);
    }
  }
  log(`\nTerminé : ${faits} ${SIMULATION ? "prête(s) à supprimer" : "supprimé(s)"}, ${refus} non traité(s), ${erreurs} erreur(s)`);
  if (erreurs > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
