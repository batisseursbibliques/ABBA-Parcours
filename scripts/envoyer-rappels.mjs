// Envoi des rappels quotidiens (notifications push) — lancé toutes les 10 minutes par .github/workflows/rappels.yml
// Lit pushTokens/{uid} (heure choisie, fuseau, langue, appareils), envoie le rappel une fois par jour
// dans la fenêtre [heure, heure + FENETRE_MIN], puis note la date d'envoi.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const PROJET = process.env.GCLOUD_PROJECT || "abba-life-c6b5c";
const FENETRE_MIN = Number(process.env.FENETRE_MIN || 180);   // on n'envoie plus après 3 h de retard
const SIMULATION = process.env.SIMULATION === "1";            // 1 = ne rien envoyer, seulement afficher

initializeApp({ credential: applicationDefault(), projectId: PROJET });
const db = getFirestore();
const messaging = getMessaging();

const TEXTES = {
  fr: { title: "ABBA Parcours", body: "C'est l'heure de ta journée : ta déclaration et tes habitudes t'attendent." },
  en: { title: "ABBA Parcours", body: "It's time for your day: your declaration and your habits are waiting for you." },
};

export function heureLocale(fuseau, maintenant = new Date()) {
  let f;
  try { f = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch (e) { f = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Porto-Novo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); }
  const p = Object.fromEntries(f.formatToParts(maintenant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
export function doitEnvoyer(d, maintenant = new Date(), fenetre = FENETRE_MIN) {
  if (!d || !d.actif || !Array.isArray(d.tokens) || !d.tokens.length || !d.heure) return false;
  const [h, m] = String(d.heure).split(":").map(Number);
  if (isNaN(h)) return false;
  const loc = heureLocale(d.fuseau || "Africa/Porto-Novo", maintenant);
  if (d.dernierEnvoi === loc.date) return false;
  const cible = h * 60 + (m || 0);
  return loc.minutes >= cible && loc.minutes <= cible + fenetre;
}

async function main() {
  const snap = await db.collection("pushTokens").where("actif", "==", true).get();
  let envoyes = 0, ignores = 0, erreurs = 0, tokensRetires = 0;
  console.log(`${snap.size} personne(s) avec un rappel actif`);
  for (const docu of snap.docs) {
    const d = docu.data();
    if (!doitEnvoyer(d)) { ignores++; continue; }
    const t = TEXTES[d.langue === "en" ? "en" : "fr"];
    console.log(`→ rappel pour ${docu.id} (${d.heure} ${d.fuseau}, ${d.tokens.length} appareil(s))`);
    if (SIMULATION) { envoyes++; continue; }
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: d.tokens,
        data: { title: t.title, body: t.body, url: "./", tag: "abba-rappel" },
        webpush: { headers: { TTL: "7200", Urgency: "high" } },
      });
      const morts = [];
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" || code === "messaging/invalid-argument") morts.push(d.tokens[i]);
          else { erreurs++; console.error("  erreur d'envoi:", code, r.error && r.error.message); }
        }
      });
      const loc = heureLocale(d.fuseau || "Africa/Porto-Novo");
      const maj = { dernierEnvoi: loc.date, dernierEnvoiAt: FieldValue.serverTimestamp() };
      if (morts.length) { maj.tokens = FieldValue.arrayRemove(...morts); tokensRetires += morts.length; }
      if (res.successCount > 0 || morts.length === d.tokens.length) await docu.ref.set(maj, { merge: true });
      envoyes += res.successCount > 0 ? 1 : 0;
    } catch (e) { erreurs++; console.error("  échec:", e.code || e.message); }
  }
  console.log(`Terminé : ${envoyes} rappel(s) envoyé(s), ${ignores} ignoré(s), ${tokensRetires} appareil(s) retiré(s), ${erreurs} erreur(s)`);
  if (erreurs > 0 && envoyes === 0) process.exitCode = 1;
}
if (process.argv[1] && process.argv[1].endsWith("envoyer-rappels.mjs") && !process.env.TEST_IMPORT) main().catch((e) => { console.error(e); process.exit(1); });
