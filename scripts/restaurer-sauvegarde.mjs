// Restauration depuis une sauvegarde déchiffrée (donnees.ndjson).
// Usage (par défaut : SIMULATION, n'écrit rien) :
//   node scripts/restaurer-sauvegarde.mjs donnees.ndjson                      -> simulation, tout le fichier
//   node scripts/restaurer-sauvegarde.mjs donnees.ndjson --prefixe=users/ABC  -> seulement ce qui commence par ce chemin
//   node scripts/restaurer-sauvegarde.mjs donnees.ndjson --ecrire             -> écrit vraiment (remplace les documents existants)
// Nécessite GOOGLE_APPLICATION_CREDENTIALS (clé du compte de service). Les comptes de connexion ne sont PAS recréés ici.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint } from "firebase-admin/firestore";

export function deserialiser(v, db) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => deserialiser(x, db));
  if (v.__t === "ts") return new Timestamp(v.s, v.n);
  if (v.__t === "gp") return new GeoPoint(v.lat, v.lng);
  if (v.__t === "ref") return db.doc(v.path);
  if (v.__t === "b64") return Buffer.from(v.v, "base64");
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deserialiser(x, db)]));
}

async function main() {
  const [fichier, ...opts] = process.argv.slice(2);
  if (!fichier) { console.error("Indique le fichier donnees.ndjson"); process.exit(1); }
  const ecrire = opts.includes("--ecrire");
  const prefixe = (opts.find((o) => o.startsWith("--prefixe=")) || "").slice(10);
  initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "abba-life-c6b5c" });
  const db = getFirestore();
  console.log(ecrire ? "=== RESTAURATION RÉELLE ===" : "=== SIMULATION (rien n'est écrit) ===");
  let n = 0, lot = db.batch(), dansLot = 0;
  for await (const ligne of createInterface({ input: createReadStream(fichier), crlfDelay: Infinity })) {
    if (!ligne.trim()) continue;
    const { path, data } = JSON.parse(ligne);
    if (prefixe && !path.startsWith(prefixe)) continue;
    n++;
    if (!ecrire) continue;
    lot.set(db.doc(path), deserialiser(data, db));
    if (++dansLot >= 400) { await lot.commit(); lot = db.batch(); dansLot = 0; }
  }
  if (ecrire && dansLot) await lot.commit();
  console.log(`${n} document(s) ${ecrire ? "restauré(s)" : "qui seraient restauré(s)"}`);
}
if (process.argv[1] && process.argv[1].endsWith("restaurer-sauvegarde.mjs")) main().catch((e) => { console.error(e.code || e.message); process.exit(1); });
