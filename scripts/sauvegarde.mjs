// Sauvegarde complète de la base (Firestore) + liste des comptes de connexion (sans mots de passe).
// Lancé par le workflow « Sauvegarde des données » (jamais en clair sur GitHub : le workflow chiffre le résultat).
// Écrit deux fichiers dans le dossier courant : donnees.ndjson (un document par ligne) et comptes.json.
// Ne montre aucune donnée personnelle dans les journaux : seulement des nombres.
import { writeFileSync, createWriteStream } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export function serialiser(v) {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Timestamp) return { __t: "ts", s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __t: "gp", lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: "ref", path: v.path };
  if (v instanceof Uint8Array) return { __t: "b64", v: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(serialiser);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialiser(x)]));
  return v;
}

async function main() {
  const projet = process.env.GCLOUD_PROJECT || "abba-life-c6b5c";
  initializeApp({ credential: applicationDefault(), projectId: projet });
  const db = getFirestore();
  const sortie = createWriteStream("donnees.ndjson");
  const compteurs = {};
  let total = 0;

  async function parcourirDoc(ref, racine) {
    const snap = await ref.get();
    if (snap.exists) {
      sortie.write(JSON.stringify({ path: ref.path, data: serialiser(snap.data()) }) + "\n");
      compteurs[racine] = (compteurs[racine] || 0) + 1; total++;
    }
    for (const sub of await ref.listCollections()) await parcourirCollection(sub, racine);
  }
  async function parcourirCollection(col, racine) {
    const refs = await col.listDocuments();      // inclut les documents « vides » qui n'ont que des sous-collections
    for (let i = 0; i < refs.length; i += 20) await Promise.all(refs.slice(i, i + 20).map((r) => parcourirDoc(r, racine)));
  }

  for (const col of await db.listCollections()) await parcourirCollection(col, col.id);
  await new Promise((ok) => sortie.end(ok));

  // Comptes de connexion : identifiant, e-mail, date de création — sans mot de passe
  const comptes = [];
  let page;
  do {
    const r = await getAuth().listUsers(1000, page);
    r.users.forEach((u) => comptes.push({ uid: u.uid, email: u.email || "", nom: u.displayName || "", cree: u.metadata.creationTime, derniereConnexion: u.metadata.lastSignInTime, desactive: !!u.disabled }));
    page = r.pageToken;
  } while (page);
  writeFileSync("comptes.json", JSON.stringify(comptes));

  console.log(`Sauvegarde de ${projet} : ${total} documents, ${comptes.length} comptes de connexion`);
  for (const [k, n] of Object.entries(compteurs).sort()) console.log(`  ${k} : ${n}`);
}

if (process.argv[1] && process.argv[1].endsWith("sauvegarde.mjs")) main().catch((e) => { console.error(e.code || e.message); process.exit(1); });
