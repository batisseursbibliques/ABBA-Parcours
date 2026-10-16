/* ============================================================
   FORMATION EN AUTONOMIE — Parcours Bâtisseur
   Lecture du manuel → questions → exercices → fiche → validation
   par le correcteur → module suivant.
   S'appuie sur sync.js (window.AbbaSync). Contenu : dossier content/.
   ============================================================ */
const S = () => window.AbbaSync;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const MODULES = [
  { id: "m1", titre: "Disciple de Christ", ready: true },
  { id: "m2", titre: "Guérir des Blessures de l'Âme", ready: true },
  { id: "m3", titre: "Cure d'Âme Personnelle", ready: true },
  { id: "m4", titre: "Aimer", ready: true },
  { id: "m5", titre: "Bâtir le Caractère", ready: true },
  { id: "m6", titre: "Le Saint-Esprit", preview: true },
  { id: "m7", titre: "Victoire par la Prière" },
  { id: "m8", titre: "Le Monde Spirituel" },
  { id: "m9", titre: "Évangélisation, Guérison, Délivrance" },
  { id: "m10", titre: "Les Ministères de Dieu" },
  { id: "m11", titre: "Maîtriser sa Santé et son Argent" },
  { id: "m12", titre: "Citoyenneté Responsable" },
  { id: "m13", titre: "Les Gestes de Premiers Secours" },
  { id: "m14", titre: "Création de Richesse" },
];
const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const dayIndex = (start) => dayNum(todayStr()) - dayNum(start) + 1; // 1 = jour de départ
const fmtDate = (start, k) => { const [y, m, d] = start.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d + k - 1)); return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}`; };
const suiviKey = (mid, exId, fid) => `${mid}_${exId}_${fid}`;
const modTitle = (m) => `M${m.id.slice(1)} — ${m.titre}`;
const STEPS = [["lecture", "Lecture"], ["qcm", "Questions"], ["exercices", "Exercices"], ["fiche", "Fiche"]];

const st = {
  user: null, isAdmin: false, isCorrecteur: false,
  meta: {}, prog: {}, parcours: [], lien: null, profile: {}, suivis: {}, focus: null, openEx: {}, tasksOpen: false, zp: { plan: {}, content: null, open: {} },
  content: {}, view: { mod: null, step: "lecture" },
  cache: {}, msg: "",
  corr: { open: false, rows: null, loading: false },
  adm: { open: false, correcteurs: [], liens: [], students: [], loaded: false },
  qcmDraft: {},
};
let unsubs = [];
let lastSync = "";

/* ---------- Démarrage / arrêt ---------- */
function stop() {
  unsubs.forEach((f) => { try { f && f(); } catch (e) {} });
  unsubs = [];
  if (st.adm && st.adm.unsub) { try { st.adm.unsub(); } catch (e) {} }
  st.adm = { open: false, correcteurs: [], liens: [], students: [], loaded: false };
  st.user = null; st.meta = {}; st.prog = {}; st.suivis = {}; st.zp.plan = {}; st.parcours = []; st.lien = null;
  st.isAdmin = false; st.isCorrecteur = false; st.view = { mod: null, step: "lecture" };
  render();
}
async function start(user) {
  stop();
  st.user = user;
  const root = $("formationRoot");
  if (root) root.innerHTML = '<p class="settings-hint">Chargement…</p>';
  unsubs.push(S().watchAdmins((emails) => {
    st.isAdmin = S().isAdminEmail(user.email) || (emails || []).map((e) => e.toLowerCase()).includes(user.email.toLowerCase());
    render();
  }));
  S().getUserProfile(user.uid).then((p) => { st.profile = p || {}; renderDash(); }).catch(() => {});
  MODULES.filter((m) => m.ready).forEach((m) => loadContent(m.id).then(() => { render(); }));
  st.isCorrecteur = await S().amICorrecteur(user.email);
  st.lien = await S().getMyLien(user.uid);
  unsubs.push(S().watchFormationMeta(user.uid, (m) => { st.meta = m || {}; afterProgress(); render(); }));
  unsubs.push(S().watchFormationModules(user.uid, (p) => { st.prog = p || {}; afterProgress(); render(); }));
  unsubs.push(S().watchZonesPlan(user.uid, (p) => { st.zp.plan = p || {}; render(); }));
  loadZonesContent();
  unsubs.push(S().watchSuivis(user.uid, (m) => { st.suivis = m || {}; render(); }));
  unsubs.push(S().watchParcours(user.uid, (l) => { st.parcours = l || []; afterProgress(); }));
  render();
}

/* ---------- Règles de progression ---------- */
const acquis = () => st.meta.acquis || [];
const isComplete = (mid) => acquis().includes(mid) || (st.prog[mid] && st.prog[mid].ficheStatus === "validated" && st.prog[mid].qcm && st.prog[mid].qcm.ok);
const autoevalDone = () => !!(st.meta.autoevalFaite || (st.prog.autoeval && st.prog.autoeval.done));
function isUnlocked(i) {
  if (!autoevalDone()) return false;
  if (i === 0) return true;
  return isComplete(MODULES[i - 1].id);
}
function afterProgress() {
  if (!st.user) return;
  const done = MODULES.filter((m) => isComplete(m.id)).map((m) => m.id);
  const key = done.join(",") + "|" + st.parcours.join(",");
  if (key === lastSync) return;
  lastSync = key;
  const missing = done.filter((id) => !st.parcours.includes(id));
  if (missing.length) S().saveParcours(st.user.uid, [...st.parcours, ...missing]).catch(() => {});
  S().saveModulesSummary(st.user.uid, { formationValides: done.length }).catch(() => {});
}

async function loadContent(mid) {
  if (st.content[mid]) return st.content[mid];
  const file = mid === "autoeval" ? "autoeval" : "m" + String(mid.slice(1)).padStart(2, "0");
  try {
    const r = await fetch(`content/${file}.json`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    st.content[mid] = await r.json();
  } catch (e) {
    st.content[mid] = { error: true };
  }
  return st.content[mid];
}

/* ---------- Valeurs des champs (brouillon local + enregistré) ---------- */
function getVal(scope, fid, saved) {
  const k = scope + ":" + fid;
  return k in st.cache ? st.cache[k] : (saved ? saved[fid] : undefined);
}
function fieldDone(f, v, prefix) {
  if (f.type === "lienZones") return zonesEverComplete();
  if (f.type === "suivi") return !!st.suivis[`${prefix}_${f.id}`];
  if (f.type === "check") return f.optional ? true : v === true;
  if (f.type === "oui_non" || f.type === "scores") return v && Object.keys(v).length >= f.items.length;
  if (f.type === "grille") return !!v && Object.values(v).filter(Boolean).length >= f.rows.length * f.cols.length;
  if (f.type === "scale") return !!v;
  if (f.required) return typeof v === "string" ? v.trim().length > 0 : !!v;
  return true;
}
function fieldsComplete(fields, values, prefix) {
  return (fields || []).every((f) => fieldDone(f, values ? values[f.id] : undefined, prefix));
}
function exoComplete(c, p) {
  return (c.exercices || []).every((ex) => fieldsComplete(ex.champs, (p.exercices || {})[ex.id], c.id + "_" + ex.id));
}
function stepStatus(c, p) {
  const lu = (p.lu || []).length >= (c.lecons || []).length;
  const q = !!(p.qcm && p.qcm.ok);
  const e = exoComplete(c, p);
  const f = p.ficheStatus === "submitted" || p.ficheStatus === "validated";
  return { lecture: lu, qcm: q, exercices: e, fiche: f };
}

/* ---------- Rendu des champs ---------- */
function renderSuivi(f, key) {
  const sv = st.suivis[key];
  const labels = f.labels || ["Fait"];
  let h = '<div class="fm-suivi">';
  if (!sv) {
    h += `${f.intro ? `<p class="small">${esc(f.intro)}</p>` : ""}<p class="small">Cet exercice dure ${f.jours} jours. <strong>Tu n'as pas besoin d'attendre la fin pour avancer</strong> : dès que tu le commences, tu peux continuer le parcours. Chaque jour, il apparaîtra sur ta page d'accueil jusqu'à ce que tu l'aies fait.</p>
      <button class="btn-primary" data-act="suivi-start" data-sk="${key}">▶ Commencer aujourd'hui</button></div>`;
    return h;
  }
  const idx = dayIndex(sv.start), done = sv.done || {};
  const nDone = Object.values(done).reduce((a, x) => a + x.length, 0), total = sv.jours * labels.length;
  h += `<p class="small"><strong>${nDone}/${total}</strong> faits — commencé le ${fmtDate(sv.start, 1)}${idx > sv.jours ? " — période terminée" : ""}</p><div class="fm-days">`;
  for (let d = 1; d <= sv.jours; d++) {
    const future = d > idx, isToday = d === idx, got = done[String(d)] || [];
    const late = !future && !isToday && got.length < labels.length;
    h += `<div class="fm-day ${isToday ? "today" : ""} ${late ? "late" : ""} ${future ? "future" : ""}"><span class="fm-day-d">J${d}<small>${fmtDate(sv.start, d)}</small></span><span class="fm-day-s">` +
      labels.map((lb, i) => `<label><input type="checkbox" data-sv="${key}|${d}|${i}" ${got.includes(i) ? "checked" : ""} ${future ? "disabled" : ""}><b>${esc(lb)}</b></label>`).join("") +
      `</span>${late ? "<em>en retard</em>" : ""}${(sv.cibles || [])[d - 1] ? `<span class="fm-day-c">${esc(sv.cibles[d - 1])}</span>` : ""}</div>`;
    if ((f.notesJours || []).includes(d) && !future) {
      h += `<textarea class="text-input fm-day-note" rows="2" placeholder="${esc(f.notePlaceholder || "Ce que j'observe (facultatif)")}" data-svn="${key}|${d}">${esc((sv.notes || {})[String(d)] || "")}</textarea>`;
    }
  }
  return h + "</div></div>";
}
function renderField(f, scope, saved, readonly) {
  if (f.type === "suivi") return renderSuivi(f, suiviKey(st.view.mod, scope.slice(3), f.id));
  if (f.type === "lienZones") return `<div class="fm-suivi"><p class="small"><strong>${zonesChosenCount()}/6</strong> zones avec un exercice choisi pour ${esc(monthLabel(monthKey()))}.</p><button class="btn-secondary" data-act="goto-zones">Choisir mes exercices dans l'onglet Zones de caractère →</button></div>`;
  const v = getVal(scope, f.id, saved);
  const key = `${scope}:${f.id}`;
  const dis = readonly ? "disabled" : "";
  if (f.type === "check") {
    return `<label class="fm-check"><input type="checkbox" data-f="${key}" data-t="check" ${v === true ? "checked" : ""} ${dis}><span>${esc(f.label)}</span></label>`;
  }
  if (f.type === "textarea") {
    return `<label class="field"><span>${esc(f.label)}</span><textarea class="text-input" rows="3" data-f="${key}" data-t="text" ${dis}>${esc(v || "")}</textarea></label>`;
  }
  if (f.type === "text") {
    return `<label class="field"><span>${esc(f.label)}</span><input class="text-input" type="text" data-f="${key}" data-t="text" value="${esc(v || "")}" ${dis}></label>`;
  }
  if (f.type === "select") {
    return `<label class="field"><span>${esc(f.label)}</span><select class="text-input" data-f="${key}" data-t="text" ${dis}><option value="">—</option>${(f.options || []).map((o) => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  }
  if (f.type === "scale") {
    return `<div class="field"><span>${esc(f.label)}</span><div class="fm-scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${key}" data-f="${key}" data-t="num" value="${n}" ${String(v) === String(n) ? "checked" : ""} ${dis}><b>${n}</b></label>`).join("")}</div></div>`;
  }
  if (f.type === "oui_non") {
    const ans = v || {};
    const done = Object.keys(ans).length;
    let h = `<p class="settings-hint">${done}/${f.items.length} réponses</p><div class="fm-yn">`;
    f.items.forEach((it, i) => {
      const k = String(i + 1);
      h += `<div class="fm-yn-row"><span class="fm-yn-n">${k}</span><span class="fm-yn-q">${esc(it)}</span><span class="fm-yn-b">` +
        ["oui", "non"].map((o) => `<label><input type="radio" name="${key}-${k}" data-f="${key}" data-t="yn" data-i="${k}" value="${o}" ${ans[k] === o ? "checked" : ""} ${dis}><b>${o === "oui" ? "Oui" : "Non"}</b></label>`).join("") + `</span></div>`;
    });
    h += "</div>";
    if (done >= f.items.length) h += renderIndicateurs(f, ans);
    return h;
  }
  if (f.type === "grille") {
    const ans = v || {};
    let h = `<p class="settings-hint">${Object.values(ans).filter(Boolean).length}/${f.rows.length * f.cols.length} réponses</p>`;
    f.rows.forEach((r, i) => {
      h += `<div class="fm-grid-row"><p class="fm-grid-t">${esc(r)}</p>`;
      f.cols.forEach((cl, j) => {
        const k = `${i}_${j}`;
        h += `<label class="fm-grid-c"><span>${esc(cl)}</span><select class="text-input" data-f="${key}" data-t="grille" data-i="${k}" ${dis}><option value="">—</option>${f.options.map((o) => `<option ${ans[k] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
      });
      h += "</div>";
    });
    return h;
  }
  if (f.type === "scores") {
    const ans = v || {};
    const done = Object.keys(ans).length;
    let h = `<p class="settings-hint">${done}/${f.items.length} réponses</p><div class="fm-yn">`;
    f.items.forEach((it, i) => {
      const k = String(i + 1);
      const sec = (f.sections || []).find((s) => s.de === i + 1);
      if (sec) h += `<p class="fm-bloc">${esc(sec.titre)}</p>`;
      h += `<div class="fm-yn-row"><span class="fm-yn-n">${k}</span><span class="fm-yn-q">${esc(it)}<span class="fm-sc">` +
        [0, 1, 2, 3].map((n) => `<label><input type="radio" name="${key}-${k}" data-f="${key}" data-t="sc" data-i="${k}" value="${n}" ${String(ans[k]) === String(n) ? "checked" : ""} ${dis}><b>${n}</b></label>`).join("") + `</span></span></div>`;
    });
    h += "</div>";
    if (done >= f.items.length) h += f.dimensions ? renderMbtiResult(f, ans) : renderScoresResult(f, ans);
    return h;
  }
  return "";
}
function mbtiResult(f, ans) {
  const sum = (items) => items.reduce((a, n) => a + Number(ans[String(n)] || 0), 0);
  const rows = (f.dimensions || []).map((d) => {
    const sa = sum(d.a.items), sb = sum(d.b.items);
    return { d, sa, sb, letter: sa > sb ? d.a.l : d.b.l };
  });
  return { rows, type: rows.map((r) => r.letter).join("") };
}
function renderMbtiResult(f, ans) {
  const r = mbtiResult(f, ans);
  let h = '<div class="fm-result"><p class="eyebrow">Tes résultats</p>';
  r.rows.forEach((x, i) => { h += `<p><strong>Dimension ${i + 1}</strong> : ${esc(x.d.a.nom)} (${x.d.a.l}) ${x.sa}/15 · ${esc(x.d.b.nom)} (${x.d.b.l}) ${x.sb}/15 → <strong>${x.letter}</strong></p>`; });
  return h + `<p>Ton type MBTI : <strong style="font-size:20px;letter-spacing:.15em;">${esc(r.type)}</strong></p><p class="small"><em>Note-le dans ta fiche. C'est un outil pour mieux te connaître, pas un diagnostic : tu n'es jamais réduit(e) à quatre lettres.</em></p></div>`;
}
function scoreTotals(f, ans) {
  return (f.groupes || []).map((g) => ({ g, total: g.items.reduce((a, n) => a + Number(ans[String(n)] || 0), 0) }));
}
function scoreLevel(f, t) { return (f.interpretation || [])[t <= 5 ? 0 : t <= 10 ? 1 : t <= 15 ? 2 : 3] || ""; }
function renderScoresResult(f, ans) {
  const rows = scoreTotals(f, ans);
  const max = Math.max(...rows.map((r) => r.total));
  let h = '<div class="fm-result"><p class="eyebrow">Tes résultats</p>';
  rows.forEach((r) => { h += `<p><strong>${esc(r.g.nom)}</strong> (${esc(r.g.masque)}) : ${r.total} / ${r.g.items.length * 3}${r.total === max ? " ← la plus élevée" : ""}<br><span class="small">${esc(scoreLevel(f, r.total))}</span></p>`; });
  if (f.note) h += `<p class="small"><em>${esc(f.note)}</em></p>`;
  return h + "</div>";
}
function renderIndicateurs(f, ans) {
  let h = '<div class="fm-result"><p class="eyebrow">Tes résultats</p>';
  (f.indicateurs || []).forEach((ind, i) => {
    let oui = 0, total = 0;
    for (let k = ind.a; k <= ind.b; k++) { total++; if (ans[String(k)] === "oui") oui++; }
    h += `<p><strong>${esc(ind.t)}</strong> — ${oui} « Oui » sur ${total} (questions ${ind.a} à ${ind.b})<br><span class="small">${esc((f.resultats || [])[i] || "")}</span></p>`;
  });
  if (f.resultats && f.resultats[7]) h += `<p class="small"><em>${esc(f.resultats[7])}</em></p>`;
  return h + "</div>";
}

/* ---------- Écran principal ---------- */
function render() {
  renderDash();
  renderZonesPlan();
  const root = $("formationRoot");
  if (!root) return;
  if (!st.user) { root.innerHTML = ""; return; }
  let h = "";
  if (st.view.mod === "autoeval") h += renderAutoeval();
  else if (st.view.mod) h += renderModuleView();
  else h += renderModuleList();
  if (st.isCorrecteur || st.isAdmin) h += renderCorrCard();
  if (st.isAdmin) h += renderAdminCard();
  root.innerHTML = h;
  if (st.msg) { const m = root.querySelector(".fm-msg"); if (m) setTimeout(() => { st.msg = ""; if (m.parentNode) m.remove(); }, 4000); }
  if (st.view.mod && !st.content[st.view.mod]) loadContent(st.view.mod).then(render);
  if (st.focus) { const el = document.getElementById("ex-" + st.focus); if (el) { st.focus = null; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60); } }
  if (st.corr.open && st.corr.rows == null && !st.corr.loading) loadCorrections();
  if (st.adm.open && !st.adm.loaded) loadAdmin();
}

function renderModuleList() {
  const faits = MODULES.filter((m) => isComplete(m.id)).length;
  let h = st.msg ? `<p class="fm-msg">${esc(st.msg)}</p>` : "";
  h += `<div class="card"><p class="eyebrow">Ma formation</p>
    <p class="settings-hint">${faits}/${MODULES.length} modules validés. Pour passer au module suivant : lis le manuel, réponds aux questions, fais les exercices, puis envoie ta fiche. Ton correcteur la valide.</p>`;
  if (st.lien && st.lien.correcteurNom) h += `<p class="settings-hint">Ton correcteur : <strong>${esc(st.lien.correcteurNom)}</strong></p>`;
  else if (!st.isAdmin) h += `<p class="settings-hint">Aucun correcteur ne t'est encore attribué. Tu peux lire et répondre, mais l'envoi de ta fiche attendra qu'un correcteur te soit lié.</p>`;
  h += renderAutoCard();
  h += '<div class="fm-mods">';
  MODULES.forEach((m, i) => {
    const done = isComplete(m.id), open = isUnlocked(i), p = st.prog[m.id] || {};
    let badge = "🔒 Verrouillé", cls = "locked";
    if (done) { badge = "✅ Validé"; cls = "done"; }
    else if (open && !m.ready) { badge = "Bientôt disponible"; cls = "soon"; }
    else if (open) {
      cls = "open";
      badge = p.ficheStatus === "submitted" ? "⏳ En correction" : p.ficheStatus === "returned" ? "↩️ À reprendre" : (p.lu || p.qcm || p.exercices) ? "En cours" : "À commencer";
    }
    const prev = st.isAdmin && m.preview && !m.ready;
    if (prev) { cls = "open"; badge = "👁 Aperçu coordinateur"; }
    const clickable = (open && m.ready) || done || prev;
    h += `<button class="fm-mod ${cls}" ${clickable ? `data-act="open" data-m="${m.id}"` : "disabled"}><span class="fm-mod-t">${esc(modTitle(m))}</span><span class="fm-mod-b">${badge}</span></button>`;
  });
  return h + "</div></div>";
}

function renderModuleView() {
  const mid = st.view.mod, m = MODULES.find((x) => x.id === mid);
  const c = st.content[mid];
  let h = `<div class="card"><button class="btn-secondary" data-act="back">← Mes modules</button>
    <h2 class="fm-h">${esc(modTitle(m))}</h2>`;
  if (!c) return h + '<p class="settings-hint">Chargement du module…</p></div>';
  if (c.error) return h + '<p class="auth-error">Impossible de charger ce module. Vérifie ta connexion puis réessaie.</p></div>';
  const p = st.prog[mid] || {};
  const ss = stepStatus(c, p);
  if (st.msg) h += `<p class="fm-msg">${esc(st.msg)}</p>`;
  h += '<div class="fm-steps">' + STEPS.map(([k, l], i) => `<button class="fm-step ${st.view.step === k ? "on" : ""} ${ss[k] ? "ok" : ""}" data-act="step" data-s="${k}">${ss[k] ? "✓" : i + 1}<small>${l}</small></button>`).join("") + "</div>";
  const readonlyAll = p.ficheStatus === "submitted" || p.ficheStatus === "validated";
  if (st.view.step === "lecture") h += renderLecture(c, p);
  else if (st.view.step === "qcm") h += renderQcm(c, p);
  else if (st.view.step === "exercices") h += renderExercices(c, p, readonlyAll);
  else h += renderFiche(c, p, ss);
  return h + "</div>";
}

function renderLecture(c, p) {
  const lu = p.lu || [];
  let h = "";
  if (c.objectifs && c.objectifs.length) h += `<div class="fm-obj"><p class="eyebrow">Objectif de ce module</p><p class="small">À la fin, quelque chose doit avoir changé dans ta vie :</p><ul>${c.objectifs.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`;
  h += `<p class="settings-hint">${lu.length}/${c.lecons.length} leçons lues. Ouvre chaque leçon, lis-la, puis touche « J'ai lu ».</p>`;
  c.lecons.forEach((l) => {
    const done = lu.includes(l.id);
    h += `<details class="fm-lecon ${done ? "done" : ""}"><summary>${done ? "✓ " : ""}${esc(l.titre)}</summary><div class="fm-texte">${l.html}</div>
      ${done ? '<p class="small">Leçon lue.</p>' : `<button class="btn-primary" data-act="lu" data-l="${l.id}">J'ai lu cette leçon</button>`}</details>`;
  });
  if (lu.length >= c.lecons.length) h += '<button class="btn-primary full" data-act="step" data-s="qcm">Passer aux questions →</button>';
  return h;
}

function renderQcm(c, p) {
  const q = c.qcm || [], res = p.qcm;
  const locked = p.ficheStatus === "submitted" || p.ficheStatus === "validated";
  let h = `<p class="settings-hint">${q.length} questions. Il faut au moins ${c.seuil || 70} % pour avancer. Tu peux recommencer autant de fois que nécessaire.</p>`;
  if (res) {
    h += `<div class="fm-score ${res.ok ? "ok" : "ko"}"><strong>${res.pct} %</strong> — ${res.score}/${res.total} bonnes réponses. ${res.ok ? "Bravo, c'est validé." : "Il te faut " + (c.seuil || 70) + " % : relis les leçons et recommence."}</div>`;
  }
  const showing = !res || st.qcmDraft.retry;
  if (res && !showing) {
    q.forEach((it, i) => {
      const mine = res.answers ? res.answers[i] : null, good = mine === it.b;
      h += `<div class="fm-q ${good ? "good" : "bad"}"><p><strong>${i + 1}. ${esc(it.q)}</strong></p>
        <p class="small">Ta réponse : ${esc(mine == null ? "—" : it.c[mine])} ${good ? "✓" : "✗"}</p>
        ${good ? "" : `<p class="small">Bonne réponse : ${esc(it.c[it.b])}</p>`}<p class="small"><em>${esc(it.e || "")}</em></p></div>`;
    });
    if (!locked) h += '<button class="btn-secondary" data-act="qcm-retry">Recommencer les questions</button>';
    if (res.ok) h += '<button class="btn-primary full" data-act="step" data-s="exercices">Passer aux exercices →</button>';
    return h;
  }
  q.forEach((it, i) => {
    h += `<div class="fm-q"><p><strong>${i + 1}. ${esc(it.q)}</strong></p>` + it.c.map((o, j) =>
      `<label class="fm-opt"><input type="radio" name="q${i}" data-qcm="${i}" value="${j}" ${st.qcmDraft[i] === j ? "checked" : ""}><span>${esc(o)}</span></label>`).join("") + "</div>";
  });
  h += '<button class="btn-primary full" data-act="qcm-submit">Valider mes réponses</button>';
  return h;
}

function exerciseState(c, ex, p) {
  const saved = (p.exercices || {})[ex.id] || {};
  if (fieldsComplete(ex.champs, saved, c.id + "_" + ex.id)) return "ok";
  const started = Object.keys(saved).length > 0 || (ex.champs || []).some((fd) => (fd.type === "suivi" && st.suivis[`${c.id}_${ex.id}_${fd.id}`]) || (fd.type === "lienZones" && zonesChosenCount() > 0) || ("ex:" + ex.id + ":" + fd.id) in st.cache);
  return started ? "cours" : "afaire";
}
function renderExercices(c, p, readonly) {
  const done = exoComplete(c, p);
  const nOk = (c.exercices || []).filter((ex) => exerciseState(c, ex, p) === "ok").length;
  let h = `<p class="settings-hint">${nOk}/${(c.exercices || []).length} exercices faits. Ouvre un exercice pour le faire, puis touche « Enregistrer ». Tu peux revenir compléter les autres plus tard.</p>`;
  (c.exercices || []).forEach((ex, exIdx) => {
    const saved = (p.exercices || {})[ex.id] || {};
    const state = exerciseState(c, ex, p);
    const badge = { ok: "✓ Fait", cours: "En cours", afaire: "À faire" }[state];
    const open = !!st.openEx[c.id + ":" + ex.id];
    h += `<details class="fm-ex ${state === "ok" ? "ok" : ""}" id="ex-${ex.id}" data-ex="${c.id}:${ex.id}" ${open ? "open" : ""}><summary><span class="fm-ex-n">${exIdx + 1}</span><span class="fm-ex-t">${esc(ex.titre)}</span><span class="fm-ex-b ${state}">${badge}</span></summary><div class="fm-ex-body"><p class="small">${esc(ex.consigne || "")}</p>${ex.intro_html ? (ex.directIntro ? `<div class="fm-texte">${ex.intro_html}</div>` : `<details class="fm-lecon"><summary>Lire le texte</summary><div class="fm-texte">${ex.intro_html}</div></details>`) : ""}`;
    (ex.champs || []).forEach((f) => { h += renderField(f, "ex:" + ex.id, saved, readonly); });
    if (!readonly) h += `<button class="btn-secondary" data-act="ex-save" data-e="${ex.id}">Enregistrer</button>`;
    h += "</div></details>";
  });
  if (done) h += '<button class="btn-primary full" data-act="step" data-s="fiche">Passer à la fiche →</button>';
  return h;
}

function statusLabel(s) {
  return { draft: "Brouillon", submitted: "Envoyée — en attente de correction", returned: "Renvoyée par ton correcteur", validated: "Validée ✅" }[s || "draft"];
}
function renderFiche(c, p, ss) {
  const f = c.fiche, status = p.ficheStatus || "draft";
  const readonly = status === "submitted" || status === "validated";
  let h = `<p class="eyebrow">${esc(f.titre)}</p><p class="fm-status ${status}">${statusLabel(status)}</p>`;
  if (status === "returned" && p.correctorComment) h += `<div class="fm-return"><strong>Remarque de ton correcteur :</strong><br>${esc(p.correctorComment)}</div>`;
  if (status === "validated" && p.correctorComment) h += `<div class="fm-return"><strong>Mot de ton correcteur :</strong><br>${esc(p.correctorComment)}</div>`;
  const saved = p.ficheData || {};
  f.champs.forEach((fd) => { h += renderField(fd, "fiche", saved, readonly); });
  if (!readonly) {
    h += '<button class="btn-secondary" data-act="fiche-save">Enregistrer le brouillon</button>';
    const prereq = ss.lecture && ss.qcm && ss.exercices;
    h += `<button class="btn-primary full" data-act="fiche-send" ${prereq ? "" : "disabled"}>Envoyer à mon correcteur</button>`;
    if (!prereq) h += '<p class="settings-hint">Pour envoyer : termine la lecture, réussis les questions et complète les exercices.</p>';
  }
  return h;
}

/* ---------- Collecte des champs (saisie en cours) ---------- */
function collect(scope) {
  const out = {};
  const prefix = scope + ":";
  Object.keys(st.cache).forEach((k) => { if (k.startsWith(prefix)) out[k.slice(prefix.length)] = st.cache[k]; });
  return out;
}
function onFieldInput(el) {
  const k = el.dataset.f, t = el.dataset.t;
  if (t === "check") st.cache[k] = el.checked;
  else if (t === "num") { st.cache[k] = Number(el.value); if (k.startsWith("auto:")) rerenderKeepScroll(); }
  else if (t === "grille") {
    const cur = Object.assign({}, st.cache[k] || currentSaved(k) || {});
    cur[el.dataset.i] = el.value;
    st.cache[k] = cur;
  } else if (t === "yn" || t === "sc") {
    const cur = Object.assign({}, st.cache[k] || currentSaved(k) || {});
    cur[el.dataset.i] = el.value;
    st.cache[k] = cur;
    if (Object.keys(cur).length >= 1) rerenderKeepScroll();
  } else st.cache[k] = el.value;
}
function currentSaved(k) {
  const [scope, ...rest] = k.split(":");
  const fid = rest.pop();
  const mid = st.view.mod, p = st.prog[mid] || {};
  if (scope === "fiche") return (p.ficheData || {})[fid];
  if (scope === "ex") { const exId = rest.join(":"); return ((p.exercices || {})[exId] || {})[fid]; }
  return undefined;
}
function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

// Fusionne les champs saisis (cache) avec ce qui est enregistré pour une portée donnée
function scopeValues(scope, saved) {
  return Object.assign({}, saved || {}, collect(scope));
}

/* ---------- Actions ---------- */
async function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act, mid = st.view.mod;
  try {
    if (act === "open" && b.dataset.m === "autoeval") { st.view = { mod: "autoeval", step: "fiche" }; st.cache = {}; render(); window.scrollTo(0, 0); return; }
    if (act === "open") { S().getMyLien(st.user.uid).then((l) => { st.lien = l; }); st.view = { mod: b.dataset.m, step: "lecture" }; st.cache = {}; st.qcmDraft = {}; render(); window.scrollTo(0, 0); return; }
    if (act === "goto-zones") { const t = document.querySelector('.tab[data-tab="caractere"]'); if (t) t.click(); return; }
    if (act === "tasks-toggle") { st.tasksOpen = !st.tasksOpen; renderTasks(); return; }
    if (act === "suivi-start") return suiviStart(b.dataset.sk);
    if (act === "task-open") {
      const sv = st.suivis[b.dataset.sk];
      if (!sv) return;
      st.view = { mod: sv.mid, step: "exercices" }; st.cache = {}; st.focus = sv.exId; st.openEx[sv.mid + ":" + sv.exId] = true; st.tasksOpen = false;
      const t = document.querySelector('.tab[data-tab="parcours"]'); if (t) t.click();
      render(); return;
    }
    if (act === "goto-parcours") { const t = document.querySelector('.tab[data-tab="parcours"]'); if (t) t.click(); return; }
    if (act === "auto-save") return saveAutoeval(false);
    if (act === "auto-send") return saveAutoeval(true);
    if (act === "back") { st.view = { mod: null, step: "lecture" }; st.cache = {}; render(); return; }
    if (act === "step") { st.view.step = b.dataset.s; render(); window.scrollTo(0, 0); return; }
    if (act === "lu") {
      const p = st.prog[mid] || {};
      const lu = Array.from(new Set([...(p.lu || []), b.dataset.l]));
      await S().saveModulePart(st.user.uid, mid, { lu }); return;
    }
    if (act === "qcm-retry") { st.qcmDraft = { retry: true }; render(); return; }
    if (act === "qcm-submit") return submitQcm();
    if (act === "ex-save") return saveExercise(b.dataset.e);
    if (act === "fiche-save") return saveFiche(false);
    if (act === "fiche-send") return saveFiche(true);
    if (act === "corr-toggle") { st.corr.open = !st.corr.open; if (st.corr.open) st.corr.rows = null; render(); return; }
    if (act === "corr-refresh") { st.corr.rows = null; render(); return; }
    if (act === "corr-review") return reviewFromUi(b);
    if (act === "adm-toggle") { st.adm.open = !st.adm.open; render(); return; }
    if (act === "adm-addcorr") return admAddCorrecteur();
    if (act === "adm-delcorr") { await S().removeCorrecteur(b.dataset.e); await loadAdmin(); return; }
    if (act === "adm-setlien") return admSetLien(b.dataset.u);
    if (act === "adm-setacquis") return admSetAcquis(b.dataset.u);
  } catch (err) {
    console.error(err);
    st.msg = "Une erreur est survenue : " + (err && err.message ? err.message : err);
    render();
  }
}
function onChange(e) {
  const sv = e.target.dataset && e.target.dataset.sv;
  if (sv) { suiviTick(sv, e.target.checked).catch((err) => { st.msg = "Erreur : " + err.message; render(); }); return; }
  const svn = e.target.dataset && e.target.dataset.svn;
  if (svn) { suiviNote(svn, e.target.value).catch(() => {}); return; }
  const q = e.target.dataset && e.target.dataset.qcm;
  if (q != null) { st.qcmDraft[q] = Number(e.target.value); return; }
  if (e.target.dataset && e.target.dataset.f) onFieldInput(e.target);
}
function onInput(e) {
  if (e.target.dataset && e.target.dataset.f && (e.target.tagName === "TEXTAREA" || e.target.type === "text")) onFieldInput(e.target);
}

async function submitQcm() {
  const mid = st.view.mod, c = st.content[mid], q = c.qcm;
  const answers = q.map((_, i) => (st.qcmDraft[i] == null ? null : st.qcmDraft[i]));
  if (answers.some((a) => a == null)) { st.msg = "Réponds à toutes les questions avant de valider."; render(); return; }
  const score = answers.filter((a, i) => a === q[i].b).length;
  const pct = Math.round((score / q.length) * 100);
  const qcm = { answers, score, total: q.length, pct, ok: pct >= (c.seuil || 70), at: new Date().toISOString() };
  st.qcmDraft = {};
  await S().saveModulePart(st.user.uid, mid, { qcm });
}
async function saveExercise(exId) {
  const mid = st.view.mod, p = st.prog[mid] || {};
  const saved = (p.exercices || {})[exId] || {};
  const vals = scopeValues("ex:" + exId, saved);
  await S().saveModulePart(st.user.uid, mid, { exercices: { ...(p.exercices || {}), [exId]: vals } });
  const c = st.content[mid], ex = (c.exercices || []).find((x) => x.id === exId);
  if (ex && fieldsComplete(ex.champs, vals, mid + "_" + exId)) delete st.openEx[mid + ":" + exId];
  st.msg = "Exercice enregistré.";
}
async function saveFiche(send) {
  const mid = st.view.mod, c = st.content[mid], p = st.prog[mid] || {};
  const vals = scopeValues("fiche", p.ficheData);
  if (send) {
    if (!fieldsComplete(c.fiche.champs, vals)) { st.msg = "Complète tous les champs de la fiche avant de l'envoyer."; await S().saveModulePart(st.user.uid, mid, { ficheData: vals }); render(); return; }
    if (!st.lien) { st.msg = "Aucun correcteur ne t'est encore attribué. Contacte la coordination."; await S().saveModulePart(st.user.uid, mid, { ficheData: vals }); render(); return; }
    await S().saveModulePart(st.user.uid, mid, { ficheData: vals, ficheStatus: "submitted", submittedAt: new Date().toISOString() });
    st.msg = "Fiche envoyée à ton correcteur.";
  } else {
    await S().saveModulePart(st.user.uid, mid, { ficheData: vals });
    st.msg = "Brouillon enregistré.";
  }
}



/* ---------- Exercices du mois par zone de caractère (onglet Zones de caractère) ---------- */
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthLabel = (mk) => { const [y, m] = mk.split("-").map(Number); return `${MOIS[m - 1]} ${y}`; };
async function loadZonesContent() {
  if (st.zp.content) return;
  try { const r = await fetch("content/zones-exercices.json"); if (!r.ok) throw new Error(r.status); st.zp.content = await r.json(); }
  catch (e) { st.zp.content = { zones: [], error: true }; }
  render();
}
const zpChoix = (mk) => ((st.zp.plan[mk] || {}).choix) || {};
const zonesChosenCount = () => Object.keys(zpChoix(monthKey())).length;
const zonesEverComplete = () => Object.keys(st.zp.plan).some((mk) => Object.keys(zpChoix(mk)).length >= 6);
function renderZonesPlan() {
  const box = $("zonesPlanRoot");
  if (!box) return;
  if (!st.user) { box.innerHTML = ""; return; }
  const c = st.zp.content;
  if (!c) { box.innerHTML = ""; return; }
  if (c.error || !c.zones.length) { box.innerHTML = ""; return; }
  const mk = monthKey(), choix = zpChoix(mk), prat = (st.zp.plan[mk] || {}).pratiques || {};
  const n = Object.keys(choix).length, today = todayStr();
  const prevKeys = Object.keys(st.zp.plan).filter((k) => k < mk && Object.keys(zpChoix(k)).length).sort();
  let h = `<div class="card"><p class="eyebrow">Mes exercices du mois — ${esc(monthLabel(mk))}</p>
    <p class="settings-hint">Pour chaque zone, choisis UN exercice à pratiquer ce mois-ci. <strong>${n}/${c.zones.length}</strong> choisis.</p>`;
  if (!n && prevKeys.length) h += '<button class="btn-secondary" data-zp="reprendre">Reprendre mes choix du mois dernier</button>';
  c.zones.forEach((z, i) => {
    const sel = choix[z.key], chosen = z.exercices.find((e) => e.id === sel);
    const count = (prat[z.key] || []).length, doneToday = (prat[z.key] || []).includes(today);
    h += `<details class="fm-ex ${chosen ? "ok" : ""}" data-zpk="${z.key}" ${st.zp.open[z.key] ? "open" : ""}><summary><span class="fm-ex-n">${i + 1}</span><span class="fm-ex-t">${esc(z.titre)}</span><span class="fm-ex-b ${chosen ? "ok" : "afaire"}">${chosen ? esc(chosen.id + " ✓") : "À choisir"}</span></summary><div class="fm-ex-body">
      ${z.sous ? `<p class="small"><em>${esc(z.sous)}</em></p>` : ""}${z.verset ? `<p class="small">${esc(z.verset)}</p>` : ""}`;
    z.exercices.forEach((e) => {
      h += `<label class="zp-opt ${sel === e.id ? "on" : ""}"><input type="radio" name="zp-${z.key}" data-zp="choisir" data-z="${z.key}" value="${e.id}" ${sel === e.id ? "checked" : ""}><div><strong>${esc(e.id)} — ${esc(e.titre)}</strong><p>${esc(e.comment)}</p><p class="small">Fréquence : ${esc(e.frequence)}</p></div></label>`;
    });
    if (chosen) h += `<div class="zp-prat ${doneToday ? "done" : ""}"><button class="btn-secondary" data-zp="pratique" data-z="${z.key}">${doneToday ? "✓ Pratiqué aujourd'hui" : "Je l'ai pratiqué aujourd'hui"}</button><span class="small">${count} fois ce mois-ci</span></div>`;
    h += "</div></details>";
  });
  box.innerHTML = h + "</div>";
}
async function zpAction(e) {
  const b = e.target.closest("[data-zp]");
  if (!b || !st.user) return;
  const mk = monthKey(), a = b.dataset.zp;
  if (a === "choisir") { if (!b.checked && e.type === "click") return; await S().saveZonesPlan(st.user.uid, mk, { choix: { [b.dataset.z]: b.value } }); return; }
  if (a === "pratique") {
    const z = b.dataset.z, cur = ((st.zp.plan[mk] || {}).pratiques || {})[z] || [], t = todayStr();
    const next = cur.includes(t) ? cur.filter((d) => d !== t) : [...cur, t];
    await S().saveZonesPlan(st.user.uid, mk, { pratiques: { [z]: next } }); return;
  }
  if (a === "reprendre") {
    const prev = Object.keys(st.zp.plan).filter((k) => k < mk && Object.keys(zpChoix(k)).length).sort().pop();
    if (prev) await S().saveZonesPlan(st.user.uid, mk, { choix: zpChoix(prev) });
  }
}

/* ---------- Exercices sur plusieurs jours ---------- */
async function suiviStart(sk) {
  const mid = st.view.mod, c = st.content[mid];
  let field = null, ex0 = null;
  (c.exercices || []).forEach((ex) => (ex.champs || []).forEach((f) => { if (f.type === "suivi" && suiviKey(mid, ex.id, f.id) === sk) { field = f; ex0 = ex; } }));
  if (!field) return;
  await S().startSuivi(st.user.uid, sk, { mid, exId: ex0.id, fid: field.id, titre: ex0.titre, jours: field.jours, labels: field.labels || ["Fait"], ...(field.cibles ? { cibles: field.cibles } : {}), start: todayStr() });
  st.msg = "C'est parti ! Cette tâche apparaîtra chaque jour sur ta page d'accueil.";
}
async function suiviTick(attr, checked) {
  const [key, d, i] = attr.split("|"), sv = st.suivis[key];
  if (!sv) return;
  const done = JSON.parse(JSON.stringify(sv.done || {}));
  const set = new Set(done[d] || []);
  if (checked) set.add(Number(i)); else set.delete(Number(i));
  done[d] = Array.from(set).sort();
  await S().updateSuivi(st.user.uid, key, { done });
}
async function suiviNote(attr, val) {
  const [key, d] = attr.split("|"), sv = st.suivis[key];
  if (!sv) return;
  await S().updateSuivi(st.user.uid, key, { notes: { ...(sv.notes || {}), [d]: val } });
}
function tasksToday() {
  const out = [];
  Object.entries(st.suivis).forEach(([key, sv]) => {
    const idx = dayIndex(sv.start);
    if (idx < 1 || idx > sv.jours + 7) return;
    const labels = sv.labels || ["Fait"], done = sv.done || {};
    const upTo = Math.min(idx, sv.jours);
    const todo = [], late = [];
    for (let d = 1; d <= upTo; d++) {
      const got = done[String(d)] || [];
      const miss = labels.filter((_, i) => !got.includes(i));
      if (!miss.length) continue;
      if (d === idx) todo.push(...miss); else late.push({ d, miss });
    }
    if (todo.length || late.length) out.push({ key, sv, idx, todo, late });
  });
  return out;
}
function renderTasks() {
  const box = $("dashTasks");
  if (!box) return;
  const tasks = st.user ? tasksToday() : [];
  if (!tasks.length) { box.innerHTML = ""; box.style.display = "none"; return; }
  box.style.display = "";
  const open = st.tasksOpen, anyLate = tasks.some((t) => t.late.length);
  let h = `<div class="dash-tasks ${open ? "open" : ""}"><button class="dash-tasks-head" data-act="tasks-toggle"><span>⏰ Tâches à accomplir aujourd'hui <b>${tasks.length}</b>${anyLate ? ' <em>⚠ en retard</em>' : ""}</span><span>${open ? "▾" : "▸"}</span></button>`;
  if (open) {
    h += tasks.map((t) =>
      `<div class="dash-task"><div class="dash-task-t"><strong>${esc(t.sv.titre)}</strong>
        <small>${t.idx <= t.sv.jours ? `Jour ${t.idx}/${t.sv.jours}` : "À rattraper"}${t.todo.length ? " · à faire : " + esc(t.todo.join(", ")) : ""}</small>
        ${t.idx <= t.sv.jours && (t.sv.cibles || [])[t.idx - 1] ? `<small class="cible">👉 ${esc(t.sv.cibles[t.idx - 1])}</small>` : ""}
        ${t.late.length ? `<small class="late">⚠ En retard : ${t.late.map((l) => `J${l.d} (${esc(l.miss.join(", "))})`).join(" ; ")}</small>` : ""}</div>
        <button class="btn-primary" data-act="task-open" data-sk="${esc(t.key)}">Ouvrir</button></div>`).join("");
  }
  box.innerHTML = h + "</div>";
}

/* ---------- Auto-évaluation de départ ---------- */
function autoFields(c) {
  const f = [];
  c.dimensions.forEach((d) => {
    f.push({ id: "d" + d.n, type: "scale", label: `${d.nom} — ${d.desc}`, required: true, bloc: d.bloc });
    f.push({ id: "o" + d.n, type: "textarea", label: "Ce que j'observe (facultatif)" });
  });
  c.questions.forEach((q, i) => f.push({ id: "q" + (i + 1), type: "textarea", label: q, required: true }));
  f.push({ id: "engage", type: "check", label: c.engagement });
  return f;
}
function renderAutoCard() {
  if (autoevalDone()) {
    return `<div class="fm-auto done"><p class="eyebrow">✅ Auto-évaluation de départ faite</p><button class="btn-secondary" data-act="open" data-m="autoeval">Revoir mes résultats</button></div>`;
  }
  return `<div class="fm-auto"><p class="eyebrow">Première étape</p><p class="small">Avant de commencer les modules, fais ton auto-évaluation : elle te montre où tu en es dans les 8 dimensions de ta vie (une dizaine de minutes).</p><button class="btn-primary" data-act="open" data-m="autoeval">Commencer mon auto-évaluation</button></div>`;
}
function autoBilan(c, vals) {
  const dims = c.dimensions.filter((d) => vals["d" + d.n]);
  if (dims.length < c.dimensions.length) return "";
  const total = dims.reduce((a, d) => a + Number(vals["d" + d.n]), 0);
  const sorted = dims.slice().sort((a, b) => Number(vals["d" + b.n]) - Number(vals["d" + a.n]));
  const fort = sorted[0], faible = sorted[sorted.length - 1];
  return `<div class="fm-bilan"><p class="eyebrow">Mon bilan</p>
    <p>Total : <strong>${total} / 40</strong> — moyenne : <strong>${(total / 8).toFixed(1)} / 5</strong></p>
    <p>Ma dimension la plus forte : <strong>${esc(fort.nom)}</strong> (${vals["d" + fort.n]}/5)<br>Ma dimension la plus faible : <strong>${esc(faible.nom)}</strong> (${vals["d" + faible.n]}/5)</p></div>`;
}
function renderAutoeval() {
  const c = st.content.autoeval;
  let h = `<div class="card"><button class="btn-secondary" data-act="back">← Mon parcours</button><h2 class="fm-h">${c ? esc(c.titre) : "Auto-évaluation"}</h2>`;
  if (!c) return h + '<p class="settings-hint">Chargement…</p></div>';
  if (c.error) return h + '<p class="auth-error">Impossible de charger l\'auto-évaluation. Vérifie ta connexion.</p></div>';
  const p = st.prog.autoeval || {}, saved = p.ficheData || {}, done = !!p.done;
  if (st.msg) h += `<p class="fm-msg">${esc(st.msg)}</p>`;
  h += `<p class="small">${esc(c.intro)}</p>`;
  const fields = autoFields(c);
  let lastBloc = "";
  fields.forEach((fd) => {
    if (fd.bloc && fd.bloc !== lastBloc) { h += `<p class="fm-bloc">${esc(fd.bloc)}</p>`; lastBloc = fd.bloc; }
    if (fd.id === "q1") h += '<p class="fm-bloc">Trois questions pour aller plus loin</p>';
    if (fd.id === "engage") h += '<p class="fm-bloc">Mon engagement aujourd\'hui</p>';
    h += renderField(fd, "auto", saved, done);
  });
  const vals = scopeValues("auto", saved);
  h += autoBilan(c, vals);
  if (done) {
    h += '<p class="fm-status validated">Auto-évaluation validée ✅</p><button class="btn-primary full" data-act="back">Commencer les modules →</button>';
  } else {
    h += '<button class="btn-secondary" data-act="auto-save">Enregistrer le brouillon</button>';
    h += '<button class="btn-primary full" data-act="auto-send">Valider mon auto-évaluation</button>';
  }
  return h + "</div>";
}
async function saveAutoeval(final) {
  const c = st.content.autoeval, p = st.prog.autoeval || {};
  const vals = scopeValues("auto", p.ficheData);
  if (final) {
    if (!fieldsComplete(autoFields(c), vals)) { await S().saveModulePart(st.user.uid, "autoeval", { ficheData: vals }); st.msg = "Réponds à toutes les dimensions, aux trois questions et coche ton engagement."; render(); return; }
    await S().saveModulePart(st.user.uid, "autoeval", { ficheData: vals, done: true, doneAt: new Date().toISOString() });
    st.msg = "Auto-évaluation enregistrée. Tu peux commencer les modules.";
  } else {
    await S().saveModulePart(st.user.uid, "autoeval", { ficheData: vals });
    st.msg = "Brouillon enregistré.";
  }
}

/* ---------- Tableau de bord (page d'accueil) ---------- */
function moduleFraction(m) {
  if (isComplete(m.id)) return 1;
  if (!m.ready) return 0;
  const c = st.content[m.id], p = st.prog[m.id] || {};
  if (!c || c.error) return 0;
  const s = stepStatus(c, p);
  return ((s.lecture ? 1 : 0) + (s.qcm ? 1 : 0) + (s.exercices ? 1 : 0) + (p.ficheStatus === "validated" ? 1 : 0)) / 4;
}
function nextStepText() {
  if (!autoevalDone()) return ["Commence par ton auto-évaluation", "Elle te montre où tu en es avant de plonger dans les modules."];
  const i = MODULES.findIndex((m) => !isComplete(m.id));
  if (i < 0) return ["Parcours terminé 🎉", ""];
  const m = MODULES[i];
  if (!m.ready) return [modTitle(m), "Ce module arrive bientôt dans l'application."];
  const c = st.content[m.id], p = st.prog[m.id] || {};
  if (!c || c.error) return [modTitle(m), ""];
  if (p.ficheStatus === "submitted") return [modTitle(m), "Ta fiche est chez ton correcteur."];
  if (p.ficheStatus === "returned") return [modTitle(m), "Ton correcteur t'a renvoyé ta fiche : reprends-la."];
  const s = stepStatus(c, p);
  const next = !s.lecture ? "Lecture" : !s.qcm ? "Questions" : !s.exercices ? "Exercices" : "Fiche";
  return [modTitle(m), "Prochaine étape : " + next];
}
function renderDash() {
  renderTasks();
  const hello = $("dashHello"), box = $("dashRing");
  if (!hello || !box) return;
  if (!st.user) { box.innerHTML = ""; return; }
  const prenom = (st.profile && st.profile.prenom) || (st.user.displayName || "").split(" ")[0] || "";
  hello.textContent = prenom ? `Bienvenue, ${prenom} 👋` : "Bienvenue 👋";
  const pct = Math.round(MODULES.reduce((a, m) => a + moduleFraction(m), 0) / MODULES.length * 100);
  const C = 2 * Math.PI * 52;
  const [t1, t2] = nextStepText();
  box.innerHTML = `<p class="eyebrow">Mon parcours</p>
    <div class="dash-ring"><svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--paper)" stroke-width="10"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--navy)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 60 60)"/></svg>
      <div class="dash-ring-n"><b>${pct}%</b><small>de ton parcours</small></div></div>
    <p class="dash-next"><strong>${esc(t1)}</strong>${t2 ? `<small>${esc(t2)}</small>` : ""}</p>
    <button class="link-btn" data-act="goto-parcours">Ouvrir mon parcours →</button>`;
}

/* ---------- Correcteur : fiches à valider ---------- */
function renderCorrCard() {
  let h = `<div class="card"><button class="fm-acc" data-act="corr-toggle"><span class="eyebrow">Corrections</span><span>${st.corr.open ? "▾" : "▸"}</span></button>`;
  if (!st.corr.open) return h + "</div>";
  h += '<button class="btn-secondary" data-act="corr-refresh">Actualiser</button>';
  if (st.corr.rows == null) return h + '<p class="settings-hint">Chargement…</p></div>';
  const pend = st.corr.rows.filter((r) => r.doc.ficheStatus === "submitted");
  if (!pend.length) h += '<p class="settings-hint">Aucune fiche en attente.</p>';
  pend.forEach((r, i) => { h += renderCorrRow(r, i); });
  const hist = st.corr.rows.filter((r) => r.doc.ficheStatus !== "submitted");
  if (hist.length) h += '<p class="eyebrow" style="margin-top:14px;">Déjà traitées</p>' + hist.map((r) => `<p class="small">${esc(r.nom)} — ${esc(modTitle(MODULES.find((m) => m.id === r.mid)))} : ${statusLabel(r.doc.ficheStatus)}</p>`).join("");
  return h + "</div>";
}
async function loadCorrections() {
  st.corr.loading = true;
  try {
    const liens = st.isAdmin ? await S().loadAllLiens() : await S().loadMyStudents(st.user.email);
    const rows = [];
    for (const l of liens) {
      let mods = {};
      let sv = {};
      try { mods = await S().loadStudentModules(l.uid || l.id); } catch (e) {}
      try { sv = await S().loadStudentSuivis(l.uid || l.id); } catch (e) {}
      Object.keys(mods).forEach((mid) => {
        const d = mods[mid];
        if (["submitted", "validated", "returned"].includes(d.ficheStatus)) rows.push({ uid: l.uid || l.id, nom: l.nom || l.email || "", mid, doc: d, suivis: sv });
      });
    }
    st.corr.rows = rows;
  } catch (e) { st.corr.rows = []; st.msg = "Impossible de charger les fiches : " + e.message; }
  st.corr.loading = false;
  render();
  for (const r of st.corr.rows) await loadContent(r.mid).then(() => {});
  render();
}
function renderCorrRow(r, i) {
  const c = st.content[r.mid];
  const m = MODULES.find((x) => x.id === r.mid);
  let h = `<div class="fm-ex"><p class="eyebrow">${esc(r.nom)} — ${esc(modTitle(m))}</p>`;
  if (r.doc.qcm) h += `<p class="small">Questions : <strong>${r.doc.qcm.pct} %</strong> (${r.doc.qcm.score}/${r.doc.qcm.total})</p>`;
  if (!c || c.error) h += '<p class="small">Chargement du contenu…</p>';
  else {
    h += `<details class="fm-lecon"><summary>Voir la fiche et les exercices</summary><div class="fm-texte">`;
    (c.exercices || []).forEach((ex) => {
      const v = (r.doc.exercices || {})[ex.id] || {};
      h += `<p><strong>${esc(ex.titre)}</strong></p>` + (ex.champs || []).map((f) => readValue(f, v[f.id])).join("");
    });
    Object.values(r.suivis || {}).filter((s) => s.mid === r.mid).forEach((s) => {
      const tot = s.jours * (s.labels || [1]).length, nd = Object.values(s.done || {}).reduce((a, x) => a + x.length, 0);
      h += `<p class="small"><strong>Suivi « ${esc(s.titre)} » :</strong> ${nd}/${tot} faits (commencé le ${fmtDate(s.start, 1)})</p>`;
    });
    h += `<p><strong>${esc(c.fiche.titre)}</strong></p>` + c.fiche.champs.map((f) => readValue(f, (r.doc.ficheData || {})[f.id])).join("");
    h += "</div></details>";
  }
  h += `<label class="field"><span>Remarque pour l'étudiant (obligatoire si tu renvoies)</span><textarea class="text-input" rows="2" id="corrc-${i}"></textarea></label>
    <button class="btn-primary" data-act="corr-review" data-i="${i}" data-s="validated">Valider</button>
    <button class="btn-secondary" data-act="corr-review" data-i="${i}" data-s="returned">Renvoyer pour correction</button></div>`;
  return h;
}
function readValue(f, v) {
  if (f.type === "suivi") return "";
  if (f.type === "grille") return `<p class="small"><strong>Cartographie :</strong> ${Object.values(v || {}).filter(Boolean).length}/${f.rows.length * f.cols.length} réponses — ${f.rows.map((r, i) => esc(r) + " : " + f.cols.map((_, j) => esc(((v || {})[i + "_" + j] || "—"))).join("/")).join(" · ")}</p>`;
  if (f.type === "oui_non") {
    const oui = Object.values(v || {}).filter((x) => x === "oui").length;
    return `<p class="small">${esc(f.id.toUpperCase())} : ${oui} « Oui » sur ${f.items.length}</p>`;
  }
  if (f.type === "scores" && f.dimensions) {
    return Object.keys(v || {}).length >= f.items.length ? `<p class="small"><strong>Test MBTI :</strong> type ${esc(mbtiResult(f, v).type)}</p>` : `<p class="small"><strong>Test MBTI :</strong> incomplet</p>`;
  }
  if (f.type === "scores") {
    const rows = scoreTotals(f, v || {});
    return `<p class="small"><strong>Test :</strong> ${rows.map((r) => `${esc(r.g.nom)} ${r.total}/${r.g.items.length * 3}`).join(" · ")}</p>`;
  }
  if (f.type === "check") return `<p class="small">${v === true ? "☑" : "☐"} ${esc(f.label)}</p>`;
  return `<p class="small"><em>${esc(f.label)}</em><br>${esc(v == null || v === "" ? "—" : v)}</p>`;
}
async function reviewFromUi(b) {
  const pend = st.corr.rows.filter((r) => r.doc.ficheStatus === "submitted");
  const r = pend[Number(b.dataset.i)];
  const status = b.dataset.s;
  const comment = ($("corrc-" + b.dataset.i) || {}).value || "";
  if (status === "returned" && !comment.trim()) { st.msg = "Écris une remarque pour expliquer ce qui est à reprendre."; render(); return; }
  await S().reviewFiche(r.uid, r.mid, status, comment, st.user.email);
  st.msg = status === "validated" ? "Fiche validée." : "Fiche renvoyée.";
  st.corr.rows = null;
  render();
}

/* ---------- Coordinateur : correcteurs, liens, modules acquis ---------- */
async function loadAdmin() {
  try {
    const [liens, sums] = await Promise.all([S().loadAllLiens(), S().loadAllSummaries()]);
    st.adm.liens = liens;
    st.adm.students = sums.filter((s) => s.email).sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
    const metas = {};
    await Promise.all(st.adm.students.map(async (s) => {
      metas[s.uid] = await new Promise((res) => { const u = S().watchFormationMeta(s.uid, (m) => { u(); res(m); }); });
    }));
    st.adm.metas = metas;
  } catch (e) { st.msg = "Chargement impossible : " + e.message; }
  if (!st.adm.unsub) st.adm.unsub = S().watchCorrecteurs((l) => { st.adm.correcteurs = l; render(); });
  st.adm.loaded = true;
  render();
}
function renderAdminCard() {
  let h = `<div class="card"><button class="fm-acc" data-act="adm-toggle"><span class="eyebrow">Gestion des correcteurs et des étudiants</span><span>${st.adm.open ? "▾" : "▸"}</span></button>`;
  if (!st.adm.open) return h + "</div>";
  if (!st.adm.loaded) return h + '<p class="settings-hint">Chargement…</p></div>';
  h += '<p class="eyebrow">Correcteurs</p>';
  if (!st.adm.correcteurs.length) h += '<p class="settings-hint">Aucun correcteur pour l\'instant.</p>';
  st.adm.correcteurs.forEach((c) => { h += `<p class="small">${esc(c.nom || "")} — ${esc(c.email)} <button class="btn-small btn-refuse" data-act="adm-delcorr" data-e="${esc(c.email)}">Retirer</button></p>`; });
  h += `<div class="fm-add"><input class="text-input" id="admCorrNom" placeholder="Nom du correcteur"><input class="text-input" id="admCorrEmail" type="email" placeholder="E-mail du compte du correcteur"><button class="btn-secondary" data-act="adm-addcorr">Ajouter ce correcteur</button></div>`;
  h += '<p class="eyebrow" style="margin-top:16px;">Étudiants</p><p class="settings-hint">Lie chaque étudiant à un correcteur. « Modules acquis » : les modules déjà faits en séance, comptés comme validés.</p>';
  st.adm.students.forEach((s) => {
    const lien = st.adm.liens.find((l) => (l.uid || l.id) === s.uid);
    const acq = ((st.adm.metas || {})[s.uid] || {}).acquis || [];
    h += `<div class="fm-ex"><p class="eyebrow">${esc(s.nom || s.email)}</p><p class="small">${esc(s.email)}</p>
      <label class="field"><span>Correcteur</span><select class="text-input" id="admLien-${s.uid}"><option value="">— aucun —</option>${st.adm.correcteurs.map((c) => `<option value="${esc(c.email)}" ${lien && lien.correcteurEmail === c.email ? "selected" : ""}>${esc(c.nom || c.email)}</option>`).join("")}</select></label>
      <button class="btn-secondary" data-act="adm-setlien" data-u="${s.uid}">Enregistrer le lien</button>
      <label class="fm-check"><input type="checkbox" id="admAuto-${s.uid}" ${((st.adm.metas || {})[s.uid] || {}).autoevalFaite ? "checked" : ""}><span>Auto-évaluation déjà faite (dispensée)</span></label>
      <div class="fm-acq">${MODULES.map((m) => `<label><input type="checkbox" id="admAcq-${s.uid}-${m.id}" ${acq.includes(m.id) ? "checked" : ""}> M${m.id.slice(1)}</label>`).join("")}</div>
      <button class="btn-secondary" data-act="adm-setacquis" data-u="${s.uid}">Enregistrer les modules acquis</button></div>`;
  });
  return h + "</div>";
}
async function admAddCorrecteur() {
  const nom = ($("admCorrNom") || {}).value || "", email = ($("admCorrEmail") || {}).value || "";
  if (!email.includes("@")) { st.msg = "Saisis un e-mail valide."; render(); return; }
  await S().addCorrecteur(email, nom.trim(), st.user.email);
  st.msg = "Correcteur ajouté.";
}
async function admSetLien(uid) {
  const email = ($("admLien-" + uid) || {}).value || "";
  const s = st.adm.students.find((x) => x.uid === uid);
  if (!email) { await S().deleteLien(uid); st.adm.liens = st.adm.liens.filter((l) => (l.uid || l.id) !== uid); st.msg = "Lien supprimé."; render(); return; }
  const c = st.adm.correcteurs.find((x) => x.email === email);
  const data = { nom: s.nom || s.email, email: s.email, correcteurEmail: email, correcteurNom: c ? c.nom || c.email : email };
  await S().setLien(uid, data);
  st.adm.liens = st.adm.liens.filter((l) => (l.uid || l.id) !== uid).concat([{ uid, ...data }]);
  st.msg = "Lien enregistré.";
  render();
}
async function admSetAcquis(uid) {
  const list = MODULES.filter((m) => { const el = $(`admAcq-${uid}-${m.id}`); return el && el.checked; }).map((m) => m.id);
  const autoevalFaite = !!($(`admAuto-${uid}`) || {}).checked;
  await S().setAcquis(uid, list, { autoevalFaite });
  st.adm.metas[uid] = { acquis: list, autoevalFaite };
  st.msg = "Modules acquis enregistrés.";
  render();
}

/* ---------- Branchement ---------- */
function boot() {
  const root = $("formationRoot");
  if (!root) return;
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("input", onInput);
  root.addEventListener("toggle", (e) => { const d = e.target; if (d && d.dataset && d.dataset.ex) { if (d.open) st.openEx[d.dataset.ex] = true; else delete st.openEx[d.dataset.ex]; } }, true);
  const dash = $("dashRing");
  if (dash) dash.addEventListener("click", onClick);
  const dt = $("dashTasks");
  if (dt) dt.addEventListener("click", onClick);
  const zr = $("zonesPlanRoot");
  if (zr) {
    zr.addEventListener("change", (e) => { if (e.target.dataset && e.target.dataset.zp === "choisir") zpAction(e).catch((err) => console.error(err)); });
    zr.addEventListener("click", (e) => { const b = e.target.closest("[data-zp]"); if (b && b.dataset.zp !== "choisir") zpAction(e).catch((err) => console.error(err)); });
    zr.addEventListener("toggle", (e) => { const d = e.target; if (d && d.dataset && d.dataset.zpk) { if (d.open) st.zp.open[d.dataset.zpk] = true; else delete st.zp.open[d.dataset.zpk]; } }, true);
  }
  S().watchAuth((user) => { if (user) start(user); else stop(); });
}
if (window.AbbaSync) boot(); else window.addEventListener("load", boot);
window.Formation = { start, stop };
