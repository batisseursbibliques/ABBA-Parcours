/* =========================================================================
   LECTURE — calendrier de lecture de la Bible (onglet « Bible » > « Calendrier »)
   - Plans décrits dans content/plans/*.json (anglais : content/en/plans/*.json), listés dans index.json.
   - Un plan se suit jour après jour, sans date : on avance à son rythme, avec des jours de rattrapage.
   - L'avancement est enregistré dans formation/{uid}/lecture/{plan} : jours faits + résumé lisible par les coordinateurs.
   - Quand un jour est coché, l'événement « abba-lecture-faite » coche aussi « Lecture de la Bible » dans « Ma journée ».
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = () => window.AbbaSync;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayNum = (str) => { const [y, m, d] = str.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const nomLivre = (l) => (window.AbbaBible && window.AbbaBible.nom ? window.AbbaBible.nom(l) : `#${l}`);

const L = { user: null, plans: [], planId: null, plan: null, prog: null, unsub: null, boite: null, chargement: false, erreur: false, intro: null, ouvert: {} };

async function chargerJSON(chemin) {
  const r = await fetch(chemin, { cache: "no-cache" });
  if (!r.ok) throw new Error(chemin);
  return r.json();
}
async function chargerPlans() {
  if (L.plans.length && L.plan && L.plan._lang === (EN() ? "en" : "fr")) return;
  L.chargement = true; L.erreur = false;
  const dossier = EN() ? "content/en/plans/" : "content/plans/";
  try {
    let idx;
    try { idx = await chargerJSON(dossier + "index.json"); } catch { idx = await chargerJSON("content/plans/index.json"); }
    L.plans = idx.plans || [];
    if (!L.planId) L.planId = (L.plans.find((p) => p.defaut) || L.plans[0] || {}).id;
    const info = L.plans.find((p) => p.id === L.planId) || L.plans[0];
    let plan;
    try { plan = await chargerJSON(dossier + info.fichier); } catch { plan = await chargerJSON("content/plans/" + info.fichier); }
    plan._lang = EN() ? "en" : "fr";
    L.plan = plan;
  } catch (e) { L.erreur = true; }
  L.chargement = false;
}

/* ---------- Données de l'utilisateur ---------- */
function ecouter() {
  if (L.unsub) { try { L.unsub(); } catch (e) {} L.unsub = null; }
  if (!L.user || !L.planId || !S() || !S().watchLecture) return;
  L.unsub = S().watchLecture(L.user.uid, L.planId, (doc) => { L.prog = doc || null; rendre(); });
}
if (S() && S().watchAuth) {
  S().watchAuth((u) => { L.user = u || null; L.prog = null; ecouter(); rendre(); });
} else {
  window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth((u) => { L.user = u || null; L.prog = null; ecouter(); rendre(); }); });
}

/* ---------- Calculs ---------- */
function lecturesDe(j) {
  const out = [];
  (j.lecture || []).forEach((s) => { for (let c = s.de; c <= s.a; c++) out.push({ l: s.l, c }); });
  return out;
}
function libelle(j) {
  if (j.rattrapage) return L.plan.rattrapage;
  return (j.lecture || []).map((s) => (s.de === s.a ? `${nomLivre(s.l)} ${s.de}` : `${nomLivre(s.l)} ${s.de}–${s.a}`)).join(" ; ");
}
function etat() {
  const done = (L.prog && L.prog.done) || {};
  const jours = L.plan.jours, lect = jours.filter((j) => !j.rattrapage);
  const faits = lect.filter((j) => done[j.n]);
  const prochain = lect.find((j) => !done[j.n]) || null;
  const chapitres = faits.reduce((n, j) => n + lecturesDe(j).length, 0);
  const dates = Object.values(done).filter((v) => typeof v === "string").sort();
  const start = L.prog && L.prog.start;
  let attendu = null;
  if (start) attendu = Math.min(180, Math.max(1, dayNum(today()) - dayNum(start) + 1));
  return { done, lect, faits: faits.length, prochain, chapitres, dernier: dates.length ? dates[dates.length - 1] : "", start, attendu, fini: !prochain };
}
const resumeDe = (e) => ({ jour: e.prochain ? e.prochain.n : 180, faits: e.faits, total: e.lect.length, chapitres: e.chapitres, dernier: e.dernier });

/* ---------- Écriture ---------- */
async function sauver(done, start) {
  if (!L.user) return;
  const e = (() => { const sv = L.prog; L.prog = { ...(sv || {}), done, start }; const r = etat(); L.prog = sv; return r; })();
  await S().saveLecture(L.user.uid, L.planId, { plan: L.planId, start: start || today(), done, resume: resumeDe(e) });
}
async function basculer(n) {
  const done = { ...((L.prog && L.prog.done) || {}) };
  const marquer = !done[n];
  if (marquer) done[n] = today(); else delete done[n];
  await sauver(done, (L.prog && L.prog.start) || today());
  if (marquer) { try { window.dispatchEvent(new CustomEvent("abba-lecture-faite", { detail: { jour: n } })); } catch (e) {} }
}
async function demarrer() { await sauver({ ...((L.prog && L.prog.done) || {}) }, today()); }

/* ---------- Affichage ---------- */
const puce = (l, c) => `<button type="button" class="lec-chap" data-lec="lire" data-l="${l}" data-c="${c}">${esc(nomLivre(l))} ${c}</button>`;
const puces = (j) => lecturesDe(j).map((x) => puce(x.l, x.c)).join("");

function carteProchain(e) {
  if (e.fini) return `<div class="card lec-carte"><p class="eyebrow">🎉 ${T("Plan terminé", "Plan completed")}</p><p>${esc(L.plan.fin)}</p></div>`;
  const j = e.prochain;
  let h = `<div class="card lec-carte"><p class="eyebrow">${T("Prochaine lecture", "Next reading")} · ${T("Jour", "Day")} ${j.n}</p><p class="lec-titre">${esc(libelle(j))}</p><div class="lec-puces">${puces(j)}</div>`;
  h += `<button type="button" class="btn-primary full" data-lec="fait" data-j="${j.n}">✓ ${T("J’ai lu", "I have read")}</button>`;
  const suiv = L.plan.jours[j.n]; // jour suivant (index = n)
  if (suiv && suiv.rattrapage) h += `<p class="small">${T("Le jour suivant est un jour de rattrapage.", "The next day is a catch-up day.")}</p>`;
  return h + "</div>";
}
function ligneRythme(e) {
  if (!e.start || e.fini) return "";
  const ecart = e.attendu - (e.prochain ? e.prochain.n : 180);
  let msg;
  if (ecart > 3) msg = T(`Tu as environ ${ecart} jours de retard sur un rythme de six mois. Aucune panique : avance à ton rythme et utilise les jours de rattrapage.`, `You are about ${ecart} days behind a six-month pace. No panic: move at your own pace and use the catch-up days.`);
  else if (ecart < -3) msg = T(`Tu as environ ${-ecart} jours d’avance sur un rythme de six mois. Bravo !`, `You are about ${-ecart} days ahead of a six-month pace. Well done!`);
  else msg = T("Tu es dans le rythme des six mois.", "You are on a six-month pace.");
  return `<p class="small lec-rythme">${esc(msg)}</p>`;
}
function phaseHtml(p, e) {
  const done = e.done;
  const jr = L.plan.jours.filter((j) => j.n >= p.de && j.n <= p.a);
  const chLus = jr.filter((j) => !j.rattrapage && done[j.n]).reduce((n, j) => n + lecturesDe(j).length, 0);
  const contient = e.prochain && e.prochain.n >= p.de && e.prochain.n <= p.a;
  const ouvert = L.ouvert[p.n] !== undefined ? L.ouvert[p.n] : contient;
  let h = `<details class="lec-phase" data-phase="${p.n}"${ouvert ? " open" : ""}><summary><strong>${T("Phase", "Phase")} ${p.n}</strong> · ${esc(p.titre)}<br><span class="small">${T("Jours", "Days")} ${p.de}–${p.a} · ${chLus}/${p.chapitres} ${T("chapitres", "chapters")}</span></summary>`;
  h += `<p class="small"><em>${esc(p.resume)}</em></p>`;
  h += `<details class="lec-livres"><summary class="small">${T("Les livres de cette phase", "The books in this phase")}</summary>${p.livres.map((b) => `<p class="small"><strong>${esc(nomLivre(b.l))}</strong> (${b.ch} ${T("ch.", "ch.")}) : ${esc(b.desc)}</p>`).join("")}</details>`;
  h += '<div class="lec-jours">';
  jr.forEach((j) => {
    const fait = !!done[j.n], prochain = e.prochain && e.prochain.n === j.n;
    h += `<div class="lec-row${fait ? " fait" : ""}${prochain ? " prochain" : ""}${j.rattrapage ? " ratt" : ""}"><button type="button" class="lec-box" data-lec="toggle" data-j="${j.n}" aria-label="${T("Jour", "Day")} ${j.n}" aria-pressed="${fait}">${fait ? "☑" : "☐"}</button><span class="lec-n">${T("Jour", "Day")} ${j.n}</span><span class="lec-lect">${j.rattrapage ? `<em>${esc(L.plan.rattrapage)}</em>` : puces(j)}</span></div>`;
  });
  return h + "</div></details>";
}
function rendre() {
  const box = L.boite;
  if (!box || !box.isConnected) return;
  if (L.chargement) { box.innerHTML = `<p class="small">${T("Chargement…", "Loading…")}</p>`; return; }
  if (L.erreur || !L.plan) { box.innerHTML = `<p class="bib-alerte">${T("Impossible de charger le calendrier. Vérifie ta connexion puis rouvre cet onglet.", "The calendar could not be loaded. Check your connection and reopen this tab.")}</p>`; return; }
  if (!L.user) { box.innerHTML = `<p class="small">${T("Connecte-toi pour suivre ton calendrier de lecture.", "Sign in to follow your reading calendar.")}</p>`; return; }
  const e = etat();
  let h = "";
  if (L.plans.length > 1) h += `<label class="field"><span>${T("Calendrier", "Calendar")}</span><select class="text-input" data-lec="plan">${L.plans.map((p) => `<option value="${esc(p.id)}"${p.id === L.planId ? " selected" : ""}>${esc(EN() ? (p.titre_en || p.titre) : p.titre)}</option>`).join("")}</select></label>`;
  h += `<div class="card"><p class="eyebrow">${esc(L.plan.titre)}</p><p class="small">${esc(L.plan.sous)}</p>`;
  const pct = Math.round((e.faits / e.lect.length) * 100);
  h += `<div class="lec-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  h += `<p class="small"><strong>${e.chapitres}</strong> / ${L.plan.chapitres} ${T("chapitres lus", "chapters read")} · ${e.faits} / ${e.lect.length} ${T("jours de lecture", "reading days")}</p>`;
  h += ligneRythme(e);
  if (!L.prog) h += `<button type="button" class="btn-primary full" data-lec="demarrer">▶ ${T("Commencer le plan", "Start the plan")}</button>`;
  h += "</div>";
  h += carteProchain(e);
  const ouvertIntro = L.intro !== null ? L.intro : !L.prog;
  h += `<details class="lec-intro card" data-intro${ouvertIntro ? " open" : ""}><summary><strong>${T("Comment utiliser ce plan", "How to use this plan")}</strong></summary><ul>${L.plan.intro.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>`;
  h += L.plan.phases.map((p) => phaseHtml(p, e)).join("");
  box.innerHTML = h;
}

/* ---------- Événements ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-lec]");
  if (!b || !L.boite || !L.boite.contains(b)) return;
  const a = b.dataset.lec;
  try {
    if (a === "lire") { if (window.AbbaBible && window.AbbaBible.lire) window.AbbaBible.lire(Number(b.dataset.l), Number(b.dataset.c)); return; }
    if (a === "fait" || a === "toggle") { await basculer(Number(b.dataset.j)); return; }
    if (a === "demarrer") { await demarrer(); return; }
  } catch (err) { alert(T("Impossible d’enregistrer : ", "Unable to save: ") + (err.code || err.message)); }
});
document.addEventListener("change", (ev) => {
  const s = ev.target.closest('[data-lec="plan"]');
  if (s && L.boite && L.boite.contains(s)) { L.planId = s.value; L.plan = null; L.prog = null; chargerPlans().then(() => { ecouter(); rendre(); }); }
});
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!(d instanceof HTMLElement) || !L.boite || !L.boite.contains(d)) return;
  if (d.matches("[data-phase]")) L.ouvert[d.dataset.phase] = d.open;
  if (d.matches("[data-intro]")) L.intro = d.open;
}, true);

window.AbbaLecture = {
  rendre: async (boite) => {
    L.boite = boite;
    L.chargement = true; rendre();
    await chargerPlans();
    if (L.user && !L.unsub) ecouter();
    rendre();
  },
};
