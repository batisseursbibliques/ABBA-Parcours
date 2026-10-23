/* =========================================================================
   PAIEMENTS — Parcours Bâtisseur : 5 000 F pour la formation et la Mise en Action
   - L'étudiant verse en une ou plusieurs fois (Mobile Money, espèces…) à ABBA, puis clique « J'ai payé ».
   - Le coordinateur principal et la trésorière (droit « paiements ») enregistrent les versements.
   - Cinq paliers : modules 1-3 dès 1/5 payé, 4-6 dès 2/5, 7-9 dès 3/5, 10-12 dès 4/5, 13-15 dès 5/5.
   - La base de données applique aussi le blocage (firestore.rules : payeOk) : un module non débloqué n'accepte
     ni réponses, ni fiche. Un étudiant sans compte de paiement (cohorte d'avant) n'est jamais bloqué.
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = () => window.AbbaSync;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (n) => `${new Intl.NumberFormat(EN() ? "en-GB" : "fr-FR").format(Math.round(Number(n) || 0)).replace(/[\u202f\u00a0]/g, " ")} F`;
const num = (v) => Math.round(Number(String(v ?? "").replace(/[\s\u202f\u00a0]/g, "").replace(",", ".")));
const dateFr = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(EN() ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }); };

const ORDRE = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "m13", "m14", "m14b"];
const PLAGE = { 1: "M1–M3", 2: "M4–M6", 3: "M7–M9", 4: "M10–M12", 5: "M13–M15" };
const MODES = { "mobile-money": ["Mobile Money", "Mobile Money"], especes: ["Espèces", "Cash"], virement: ["Virement", "Bank transfer"], autre: ["Autre", "Other"], solidarite: ["Fonds de solidarité", "Solidarity fund"] };
const modeNom = (m) => (MODES[m] ? MODES[m][EN() ? 1 : 0] : m || "");
const palierDe = (mid) => (mid === "charte" || mid === "autoeval" ? 1 : Math.ceil((Math.max(0, ORDRE.indexOf(mid)) + 1) / 3));
const requis = (total, k) => Math.ceil((total * k) / 5);

const P = { user: null, compte: null, paiements: [], declarations: [], instructions: "", formOuvert: false, unsubs: [], nom: "" };

/* ---------- calculs (utilisés aussi par formation.js) ---------- */
function etat() {
  const c = P.compte;
  if (!c || c.actif === false) return { actif: false, complet: true };
  const total = Number(c.total ?? 5000), paye = Number(c.paye || 0);
  let debloque = 0;
  for (let k = 1; k <= 5; k++) if (paye * 5 >= total * k) debloque = k;
  const complet = paye >= total;
  const suiv = complet ? null : { k: debloque + 1, requis: requis(total, debloque + 1), manque: requis(total, debloque + 1) - paye, plage: PLAGE[debloque + 1] };
  return { actif: true, total, paye, debloque, complet, m1: debloque >= 1, suiv, reste: Math.max(0, total - paye) };
}
const autorise = (mid) => { const e = etat(); return !e.actif || e.paye * 5 >= e.total * palierDe(mid); };
const complet = () => etat().complet;
function emettre() { try { window.dispatchEvent(new CustomEvent("abba-paiement-maj")); } catch (e) {} }

function recuTexte(p, nom, e) {
  const t = T(
    `REÇU ${p.recuNum || ""}\nABBA — Alliance des Bâtisseurs Bibliques en Action\nReçu de : ${nom || ""}\nMontant : ${fmt(p.montant)}\nDate : ${dateFr(p.date || p.creeLe)}\nMode : ${modeNom(p.mode)}${p.reference ? `\nRéférence : ${p.reference}` : ""}${e && e.actif ? `\nTotal versé : ${fmt(e.paye)} sur ${fmt(e.total)}` : ""}`,
    `RECEIPT ${p.recuNum || ""}\nABBA — Alliance of Biblical Builders in Action\nReceived from: ${nom || ""}\nAmount: ${fmt(p.montant)}\nDate: ${dateFr(p.date || p.creeLe)}\nMethod: ${modeNom(p.mode)}${p.reference ? `\nReference: ${p.reference}` : ""}${e && e.actif ? `\nTotal paid: ${fmt(e.paye)} of ${fmt(e.total)}` : ""}`);
  return t;
}
async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = texte; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {} ta.remove(); return ok;
  }
}

/* =========================================================================
   CÔTÉ ÉTUDIANT : carte « Mon paiement » sur l'accueil
   ========================================================================= */
function ecouter(u) {
  P.unsubs.forEach((f) => { try { f(); } catch (e) {} }); P.unsubs = [];
  P.user = u || null; P.compte = null; P.paiements = []; P.declarations = [];
  if (!P.user || !S() || !S().watchCompte) { rendre(); emettre(); return; }
  const uid = P.user.uid;
  P.nom = P.user.displayName || P.user.email || "";
  P.unsubs.push(S().watchCompte(uid, (c) => { P.compte = c; P.compteCharge = true; rendre(); emettre(); programmerSoutien(); }));
  P.unsubs.push(S().watchPaiements(uid, (l) => { P.paiements = (l || []).filter((x) => !x.annule).sort((a, b) => String(b.date || b.creeLe).localeCompare(String(a.date || a.creeLe))); rendre(); }));
  P.unsubs.push(S().watchDeclarations(uid, (l) => { P.declarations = l || []; rendre(); }));
  P.unsubs.push(S().watchConfigPaiement((c) => { P.instructions = (c && c.instructions) || ""; rendre(); }));
}
function rendre() { carteEtudiant(); }
function carteEtudiant() {
  const box = $("dashPaiement");
  if (!box) return;
  const e = etat();
  if (!P.user || !e.actif) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const attente = P.declarations.filter((d) => d.statut === "attente");
  const pct = e.total > 0 ? Math.min(100, Math.round((e.paye * 100) / e.total)) : 100;
  box.className = `card pay-carte ${e.complet ? "pay-ok" : !e.m1 ? "pay-rouge" : "pay-orange"}`;
  let h = "";
  if (e.complet) {
    h += `<p class="eyebrow">✓ ${T("Paiement complet", "Payment complete")}</p><p>${T(`Tu as versé ${fmt(e.paye)}. Merci !`, `You have paid ${fmt(e.paye)}. Thank you!`)}</p>`;
  } else {
    h += `<p class="eyebrow">💰 ${T("Mon paiement", "My payment")}</p><p class="pay-montants"><strong>${fmt(e.paye)}</strong> / ${fmt(e.total)}</p>`;
    h += `<div class="lec-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
    if (!e.m1) h += `<p class="pay-msg rouge">🔒 ${T(`Le Parcours s’ouvre après un premier versement de ${fmt(e.suiv.requis)}. Il te manque ${fmt(e.suiv.manque)}.`, `The Course opens after a first payment of ${fmt(e.suiv.requis)}. You are missing ${fmt(e.suiv.manque)}.`)}</p>`;
    else h += `<p class="pay-msg">${T(`Prochain versement : ${fmt(e.suiv.manque)} pour ouvrir les modules ${e.suiv.plage}.`, `Next payment: ${fmt(e.suiv.manque)} to open modules ${e.suiv.plage}.`)}</p>`;
    h += `<p class="small">${T("Tu peux payer d’avance, en une ou plusieurs fois : 1 000, 2 000, 3 000 F ou tout d’un coup.", "You can pay ahead, in one or several payments: 1,000, 2,000, 3,000 F or all at once.")}</p>`;
  }
  const soutien = P.paiements.filter((p) => p.mode === "solidarite").reduce((n, p) => n + Number(p.montant || 0), 0);
  if (soutien > 0) h += `<p class="small">💛 ${T(`Un frère ou une sœur t’a soutenu(e) de ${fmt(soutien)}. Que Dieu le lui rende.`, `A brother or sister has supported you with ${fmt(soutien)}. May God repay them.`)}</p>`;
  attente.forEach((d) => { h += `<p class="small pay-attente">⏳ ${T(`Ton versement de ${fmt(d.montant)} est en attente de confirmation.`, `Your payment of ${fmt(d.montant)} is waiting for confirmation.`)}</p>`; });
  if (!e.complet) {
    if (P.formOuvert) {
      h += `<div class="pay-form"><label for="payMontant">${T("Montant versé (F)", "Amount paid (F)")}</label><input id="payMontant" class="text-input" type="number" inputmode="numeric" min="100" step="100" placeholder="1000">
        <label for="payMode">${T("Comment as-tu payé ?", "How did you pay?")}</label><select id="payMode" class="text-input"><option value="mobile-money">${modeNom("mobile-money")}</option><option value="especes">${modeNom("especes")}</option><option value="autre">${modeNom("autre")}</option></select>
        <label for="payRef">${T("Référence (numéro de transaction, nom de la personne qui a reçu…)", "Reference (transaction number, name of the person who received it…)")}</label><input id="payRef" class="text-input" type="text" maxlength="120">
        <p class="ind-err" id="payMsg"></p>
        <button type="button" class="btn-primary full" data-pay="envoyer">${T("Envoyer", "Send")}</button> <button type="button" class="btn-secondary" data-pay="fermer">${T("Fermer", "Close")}</button></div>`;
    } else {
      h += `<button type="button" class="btn-primary full" data-pay="ouvrir">${T("J’ai payé", "I have paid")}</button>`;
    }
    h += `<details class="lec-intro"><summary><strong>${T("Comment payer ?", "How to pay?")}</strong></summary><p class="small">${esc(P.instructions || T("Contacte la coordination d’ABBA pour payer (Mobile Money ou espèces), puis clique sur « J’ai payé » pour prévenir.", "Contact the ABBA coordination to pay (Mobile Money or cash), then tap “I have paid” to let us know.")).replace(/\n/g, "<br>")}</p></details>`;
  }
  if (P.paiements.length) {
    h += `<details class="lec-intro"><summary><strong>${T("Mes versements", "My payments")} (${P.paiements.length})</strong></summary>${P.paiements.map((p, i) => `<div class="lec-ligne-j"><span>${esc(dateFr(p.date || p.creeLe))} · <strong>${fmt(p.montant)}</strong> · ${esc(modeNom(p.mode))}</span><button type="button" class="btn-secondary" data-pay="recu" data-i="${i}">${T("Reçu", "Receipt")}</button></div>`).join("")}</details>`;
  }
  box.innerHTML = h;
}
async function actionEtudiant(ev) {
  const b = ev.target.closest("[data-pay]");
  if (!b || !P.user) return;
  const a = b.dataset.pay;
  try {
    if (a === "ouvrir") { P.formOuvert = true; carteEtudiant(); return; }
    if (a === "fermer") { P.formOuvert = false; carteEtudiant(); return; }
    if (a === "recu") {
      const p = P.paiements[Number(b.dataset.i)];
      if (p && await copier(recuTexte(p, P.nom, etat()))) { b.textContent = T("Reçu copié ✓", "Receipt copied ✓"); setTimeout(() => { b.textContent = T("Reçu", "Receipt"); }, 2500); }
      return;
    }
    if (a === "envoyer") {
      const msg = $("payMsg"), say = (m) => { if (msg) msg.textContent = m; };
      const montant = num(($("payMontant") || {}).value), mode = ($("payMode") || {}).value || "autre", reference = (($("payRef") || {}).value || "").trim();
      if (!Number.isFinite(montant) || montant < 100) return say(T("Indique le montant que tu as versé (100 F au moins).", "Enter the amount you paid (at least 100 F)."));
      if (montant > 100000) return say(T("Ce montant semble trop grand : vérifie-le.", "This amount looks too large: please check it."));
      if (mode !== "especes" && !reference) return say(T("Ajoute la référence de la transaction pour que la trésorière retrouve ton versement.", "Add the transaction reference so the treasurer can find your payment."));
      say("");
      await S().addDeclaration(P.user.uid, { montant, mode, reference, statut: "attente", creeLe: new Date().toISOString() });
      P.formOuvert = false; carteEtudiant();
    }
  } catch (err) {
    const m = $("payMsg"); const t = T("Impossible d’enregistrer : ", "Unable to save: ") + (err.code || err.message);
    if (m) m.textContent = t; else alert(t);
  }
}

/* =========================================================================
   CÔTÉ COORDINATION : carte « Paiements » (coordinateur principal et trésorière)
   ========================================================================= */
const A = { fonds: null, dons: [], droit: false, liste: [], comptes: {}, decl: {}, sel: null, pays: [], q: "", filtre: "tous", recu: "", msg: "", unsubEnr: null, chargement: false, instr: null };

function nomDe(r) { return `${r.prenom || ""} ${r.nom || ""}`.trim() || r.email || r.uid; }
async function chargerTout() {
  if (!A.droit || !S()) return;
  A.chargement = true; rendreAdmin();
  await Promise.all(A.liste.map(async (r) => {
    try { A.comptes[r.uid] = await S().loadCompte(r.uid); } catch (e) { A.comptes[r.uid] = undefined; }
    try { A.decl[r.uid] = (await S().loadDeclarations(r.uid)).filter((d) => d.statut === "attente"); } catch (e) { A.decl[r.uid] = []; }
  }));
  try { A.fonds = await S().loadFonds(); A.dons = (await S().loadDonsAttente()).sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe))); } catch (e) { A.fonds = null; A.dons = []; }
  A.chargement = false; rendreAdmin();
}
async function chargerEtudiant(uid) {
  A.comptes[uid] = await S().loadCompte(uid);
  A.pays = (await S().loadPaiements(uid)).sort((a, b) => String(b.date || b.creeLe).localeCompare(String(a.date || a.creeLe)));
  A.decl[uid] = (await S().loadDeclarations(uid)).filter((d) => d.statut === "attente");
}
function statutLigne(r) {
  const c = A.comptes[r.uid], n = (A.decl[r.uid] || []).length;
  if (!c) return { cl: "neutre", txt: T("Pas de compte de paiement", "No payment account") + (n ? ` · ⏳ ${n}` : "") };
  const total = Number(c.total ?? 5000), paye = Number(c.paye || 0);
  const solde = total <= 0 || paye >= total;
  return { cl: solde ? "ok" : paye * 5 >= total ? "orange" : "rouge", txt: `${fmt(paye)} / ${fmt(total)}${solde ? " ✓" : ""}${n ? ` · ⏳ ${n}` : ""}` };
}
function rendreAdmin() {
  const box = $("paiementsCard");
  if (!box || !A.droit) return;
  const ouvert = box.querySelector("details.pay-admin")?.open ?? A.ouvert;
  A.ouvert = ouvert;
  let h = `<details class="pay-admin"${ouvert ? " open" : ""}><summary><strong>💰 ${T("Paiements des étudiants", "Student payments")}</strong></summary>`;
  if (A.msg) h += `<p class="small">${esc(A.msg)}</p>`;
  if (A.sel) h += detailEtudiant(); else h += blocFonds() + listeEtudiants();
  h += `<details class="lec-intro"><summary><strong>${T("Texte « Comment payer »", "“How to pay” text")}</strong></summary><p class="small">${T("Ce texte est montré aux étudiants (numéros Mobile Money, lieux de paiement…).", "This text is shown to students (Mobile Money numbers, payment places…).")}</p><textarea id="apInstr" class="text-input" rows="4" maxlength="1500">${esc(A.instr ?? P.instructions)}</textarea><button type="button" class="btn-secondary" data-ap="instr">${T("Enregistrer le texte", "Save the text")}</button></details>`;
  box.innerHTML = h + "</details>";
}
function blocFonds() {
  const f = A.fonds || { solde: 0, totalRecu: 0, totalAffecte: 0 };
  let h = `<div class="ind-item"><p class="eyebrow">💛 ${T("Fonds de solidarité", "Solidarity fund")}</p><p><strong>${fmt(f.solde || 0)}</strong> ${T("disponibles", "available")}<br><span class="small">${T("Reçu", "Received")} ${fmt(f.totalRecu || 0)} · ${T("affecté", "allocated")} ${fmt(f.totalAffecte || 0)}</span></p>`;
  if (A.dons.length) h += `<p class="small"><strong>${T("Dons à confirmer", "Gifts to confirm")}</strong></p>` + A.dons.map((d) => `<div class="lec-ligne-j"><span>${esc(d.nom || "")} · <strong>${fmt(d.montant)}</strong> · ${esc(modeNom(d.mode))}${d.reference ? ` · ${esc(d.reference)}` : ""}<br><span class="small">${esc(dateFr(d.creeLe))}</span></span><button type="button" class="btn-primary" data-ap="don-ok" data-did="${esc(d.id)}" data-m="${d.montant}">${T("Confirmer", "Confirm")}</button><button type="button" class="btn-secondary" data-ap="don-non" data-did="${esc(d.id)}">${T("Non retrouvé", "Not found")}</button></div>`).join("");
  return h + "</div>";
}
function listeEtudiants() {
  const q = A.q.trim().toLowerCase();
  const rows = A.liste.filter((r) => (!q || nomDe(r).toLowerCase().includes(q) || String(r.email || "").toLowerCase().includes(q)))
    .map((r) => ({ r, s: statutLigne(r) }))
    .filter(({ s, r }) => A.filtre === "tous" || (A.filtre === "attente" && (A.decl[r.uid] || []).length) || (A.filtre === "cours" && (s.cl === "orange" || s.cl === "rouge")) || (A.filtre === "soldes" && s.cl === "ok"));
  let h = `<div class="pay-barre"><input id="apQ" class="text-input" type="search" placeholder="${T("Chercher un étudiant", "Search a student")}" value="${esc(A.q)}"><select id="apFiltre" class="text-input"><option value="tous"${A.filtre === "tous" ? " selected" : ""}>${T("Tous", "All")}</option><option value="attente"${A.filtre === "attente" ? " selected" : ""}>${T("À confirmer", "To confirm")}</option><option value="cours"${A.filtre === "cours" ? " selected" : ""}>${T("En cours", "In progress")}</option><option value="soldes"${A.filtre === "soldes" ? " selected" : ""}>${T("Soldés", "Paid in full")}</option></select></div>`;
  h += `<div class="fm-nav"><button type="button" class="btn-secondary" data-ap="actualiser">${T("Actualiser", "Refresh")}</button><button type="button" class="btn-secondary" data-ap="csv">${T("Exporter (CSV)", "Export (CSV)")}</button></div>`;
  if (A.chargement) h += `<p class="small">${T("Chargement…", "Loading…")}</p>`;
  h += rows.length ? rows.map(({ r, s }) => `<button type="button" class="pay-ligne pay-${s.cl}" data-ap="ouvrir" data-uid="${esc(r.uid)}"><span class="pay-nom">${esc(nomDe(r))}</span><span class="pay-etat">${esc(s.txt)}</span></button>`).join("") : `<p class="small">${T("Aucun étudiant à afficher.", "No student to show.")}</p>`;
  return h;
}
function detailEtudiant() {
  const r = A.liste.find((x) => x.uid === A.sel) || { uid: A.sel }, c = A.comptes[A.sel], decl = A.decl[A.sel] || [];
  const e = c ? { actif: true, total: Number(c.total ?? 5000), paye: Number(c.paye || 0) } : null;
  let h = `<button type="button" class="btn-secondary" data-ap="retour">← ${T("Retour à la liste", "Back to the list")}</button><h3 class="fm-h">${esc(nomDe(r))}</h3>`;
  h += c ? `<p><strong>${fmt(e.paye)}</strong> / ${fmt(e.total)}${c.note ? ` · <em>${esc(c.note)}</em>` : ""}</p>` : `<p class="small">${T("Cet étudiant n’a pas de compte de paiement : il n’est pas soumis au paiement.", "This student has no payment account: they are not subject to payment.")}</p><button type="button" class="btn-secondary" data-ap="activer">${T("Activer le paiement (5 000 F)", "Enable payment (5,000 F)")}</button>`;
  if (A.recu) h += `<div class="ind-item"><p class="small"><strong>${T("Reçu", "Receipt")}</strong></p><pre class="pay-recu">${esc(A.recu)}</pre><button type="button" class="btn-secondary" data-ap="copier">${T("Copier le reçu", "Copy the receipt")}</button></div>`;
  decl.forEach((d) => { h += `<div class="ind-item"><p>⏳ <strong>${fmt(d.montant)}</strong> · ${esc(modeNom(d.mode))}${d.reference ? ` · ${esc(d.reference)}` : ""}<br><span class="small">${T("Déclaré le", "Declared on")} ${esc(dateFr(d.creeLe))}</span></p><button type="button" class="btn-primary" data-ap="valider" data-did="${esc(d.id)}" data-m="${d.montant}" data-mode="${esc(d.mode)}" data-ref="${esc(d.reference || "")}">${T("Valider et enregistrer", "Confirm and record")}</button> <button type="button" class="btn-secondary" data-ap="refuser" data-did="${esc(d.id)}">${T("Refuser", "Refuse")}</button></div>`; });
  h += `<div class="pay-form"><p class="eyebrow">${T("Enregistrer un versement", "Record a payment")}</p>
    <label for="apMontant">${T("Montant (F)", "Amount (F)")}</label><input id="apMontant" class="text-input" type="number" inputmode="numeric" min="100" step="100">
    <label for="apMode">${T("Mode", "Method")}</label><select id="apMode" class="text-input">${["mobile-money", "especes", "virement", "autre", "solidarite"].map((m) => `<option value="${m}">${modeNom(m)}</option>`).join("")}</select>
    <label for="apDate">${T("Date", "Date")}</label><input id="apDate" class="text-input" type="date" value="${todayStr()}" max="${todayStr()}">
    <label for="apRef">${T("Référence", "Reference")}</label><input id="apRef" class="text-input" type="text" maxlength="120">
    <label for="apNote">${T("Note (facultatif)", "Note (optional)")}</label><input id="apNote" class="text-input" type="text" maxlength="200">
    <p class="ind-err" id="apErr"></p><button type="button" class="btn-primary full" data-ap="enregistrer">${T("Enregistrer le versement", "Record the payment")}</button></div>`;
  if (A.pays.length) h += `<p class="eyebrow">${T("Versements", "Payments")}</p>` + A.pays.map((p) => `<div class="lec-ligne-j${p.annule ? " pay-annule" : ""}"><span>${esc(dateFr(p.date || p.creeLe))} · <strong>${fmt(p.montant)}</strong> · ${esc(modeNom(p.mode))}${p.reference ? ` · ${esc(p.reference)}` : ""}${p.annule ? ` · ${T("annulé", "cancelled")}` : ""}<br><span class="small">${esc(p.recuNum || "")}</span></span>${p.annule ? "" : `<button type="button" class="btn-secondary" data-ap="recu" data-pid="${esc(p.id)}">${T("Reçu", "Receipt")}</button><button type="button" class="btn-secondary" data-ap="annuler" data-pid="${esc(p.id)}">${T("Annuler", "Cancel")}</button>`}</div>`).join("");
  if (c && A.fonds && Number(A.fonds.solde) > 0 && e.paye < e.total) h += `<div class="pay-form"><p class="eyebrow">💛 ${T("Affecter depuis le fonds de solidarité", "Allocate from the solidarity fund")}</p><p class="small">${T("Disponible", "Available")} : ${fmt(A.fonds.solde)}. ${T("L’étudiant verra seulement qu’un frère ou une sœur l’a soutenu.", "The student will only see that a brother or sister supported them.")}</p><label for="apSol">${T("Montant (F)", "Amount (F)")}</label><input id="apSol" class="text-input" type="number" min="100" step="100" max="${Math.min(A.fonds.solde, e.total - e.paye)}"><p class="ind-err" id="apSolErr"></p><button type="button" class="btn-secondary" data-ap="affecter">${T("Affecter", "Allocate")}</button></div>`;
  h += `<details class="lec-intro"><summary><strong>${T("Tarif de cet étudiant", "This student’s fee")}</strong></summary><p class="small">${T("Réduire le montant total ou dispenser (0 F) pour quelqu’un qui a peu de moyens. Une note garde la trace de la raison.", "Reduce the total or exempt (0 F) someone with few means. A note keeps a record of the reason.")}</p>
    <label for="apTotal">${T("Montant total (F)", "Total amount (F)")}</label><input id="apTotal" class="text-input" type="number" min="0" step="500" value="${e ? e.total : 5000}">
    <label for="apTarifNote">${T("Raison", "Reason")}</label><input id="apTarifNote" class="text-input" type="text" maxlength="200" value="${esc((c && c.note) || "")}">
    <button type="button" class="btn-secondary" data-ap="tarif">${T("Enregistrer le tarif", "Save the fee")}</button></details>`;
  return h;
}
async function actionAdmin(ev) {
  const b = ev.target.closest("[data-ap]");
  if (!b || !A.droit || !P.user) return;
  const a = b.dataset.ap, par = P.user.email, say = (m) => { A.msg = m; };
  try {
    if (a === "actualiser") { await chargerTout(); return; }
    if (a === "ouvrir") { A.sel = b.dataset.uid; A.recu = ""; A.msg = ""; await chargerEtudiant(A.sel); rendreAdmin(); return; }
    if (a === "retour") { A.sel = null; A.recu = ""; A.msg = ""; rendreAdmin(); return; }
    if (a === "copier") { await copier(A.recu); b.textContent = T("Copié ✓", "Copied ✓"); return; }
    if (a === "instr") { const t = (($("apInstr") || {}).value || "").trim(); await S().setInstructions(t, par); A.instr = t; say(T("Texte enregistré.", "Text saved.")); rendreAdmin(); return; }
    if (a === "csv") { await exporterCSV(); return; }
    if (a === "don-ok") { await S().confirmerDon(b.dataset.did, Number(b.dataset.m), par); say(T("Don confirmé : le fonds augmente.", "Gift confirmed: the fund increases.")); await chargerTout(); return; }
    if (a === "don-non") { await S().refuserDon(b.dataset.did, par); say(T("Don marqué « non retrouvé ».", "Gift marked “not found”.")); await chargerTout(); return; }
    const uid = A.sel;
    if (!uid) return;
    const nom = nomDe(A.liste.find((x) => x.uid === uid) || { uid });
    if (a === "activer") { await S().activerCompte(uid); await chargerEtudiant(uid); say(T("Paiement activé pour cet étudiant.", "Payment enabled for this student.")); rendreAdmin(); return; }
    if (a === "enregistrer" || a === "valider") {
      let montant, mode, reference, date, note = "", did = null;
      if (a === "valider") { montant = Number(b.dataset.m); mode = b.dataset.mode; reference = b.dataset.ref; date = todayStr(); did = b.dataset.did; }
      else {
        montant = num(($("apMontant") || {}).value); mode = ($("apMode") || {}).value; reference = (($("apRef") || {}).value || "").trim(); date = ($("apDate") || {}).value || todayStr(); note = (($("apNote") || {}).value || "").trim();
        const err = $("apErr"), fail = (m) => { if (err) err.textContent = m; };
        if (!Number.isFinite(montant) || montant < 100 || montant > 100000) return fail(T("Montant invalide (entre 100 et 100 000 F).", "Invalid amount (between 100 and 100,000 F)."));
        if (date > todayStr()) return fail(T("La date ne peut pas être dans le futur.", "The date cannot be in the future."));
      }
      const p = { montant, mode, reference, date, note, parEmail: par };
      const pid = await S().enregistrerPaiement(uid, p, did);
      await chargerEtudiant(uid);
      const rec = A.pays.find((x) => x.id === pid) || { ...p, recuNum: "" };
      const c = A.comptes[uid];
      A.recu = recuTexte(rec, nom, c ? { actif: true, paye: Number(c.paye || 0), total: Number(c.total ?? 5000) } : null);
      say(T("Versement enregistré.", "Payment recorded.")); rendreAdmin(); return;
    }
    if (a === "affecter") {
      const m = num(($("apSol") || {}).value), c = A.comptes[uid], reste = c ? Number(c.total ?? 5000) - Number(c.paye || 0) : 0, err = $("apSolErr"), fail = (t) => { if (err) err.textContent = t; };
      if (!Number.isFinite(m) || m < 100) return fail(T("Montant invalide (100 F au moins).", "Invalid amount (at least 100 F)."));
      if (m > Number(A.fonds.solde)) return fail(T("Le fonds ne contient pas assez.", "The fund does not hold enough."));
      if (m > reste) return fail(T("Ce montant dépasse ce qu’il reste à payer à cet étudiant.", "This amount is more than what this student still has to pay."));
      await S().affecterSolidarite(uid, m, par); A.fonds = await S().loadFonds(); await chargerEtudiant(uid); say(T("Soutien affecté.", "Support allocated.")); rendreAdmin(); return;
    }
    if (a === "refuser") { await S().traiterDeclaration(uid, b.dataset.did, "refuse", par); await chargerEtudiant(uid); say(T("Déclaration refusée.", "Declaration refused.")); rendreAdmin(); return; }
    if (a === "recu") { const p = A.pays.find((x) => x.id === b.dataset.pid); const c = A.comptes[uid]; if (p) { A.recu = recuTexte(p, nom, c ? { actif: true, paye: Number(c.paye || 0), total: Number(c.total ?? 5000) } : null); rendreAdmin(); } return; }
    if (a === "annuler") {
      const p = A.pays.find((x) => x.id === b.dataset.pid);
      if (!p || !confirm(T(`Annuler le versement de ${fmt(p.montant)} ?`, `Cancel the payment of ${fmt(p.montant)}?`))) return;
      await S().annulerPaiement(uid, p.id, p.montant, par); await chargerEtudiant(uid); say(T("Versement annulé.", "Payment cancelled.")); rendreAdmin(); return;
    }
    if (a === "tarif") {
      const total = num(($("apTotal") || {}).value), note = (($("apTarifNote") || {}).value || "").trim();
      if (!Number.isFinite(total) || total < 0 || total > 100000) { say(T("Montant invalide.", "Invalid amount.")); rendreAdmin(); return; }
      if (total < 5000 && !note) { say(T("Écris la raison de la réduction.", "Write the reason for the reduction.")); rendreAdmin(); return; }
      await S().setTarif(uid, total, note, par); await chargerEtudiant(uid); say(T("Tarif enregistré.", "Fee saved.")); rendreAdmin();
    }
  } catch (err) { A.msg = T("Impossible : ", "Not possible: ") + (err.code || err.message); rendreAdmin(); }
}
async function exporterCSV() {
  const lignes = [["Date", "N° reçu", "Étudiant", "E-mail", "Montant (F)", "Mode", "Référence", "Enregistré par", "Annulé"]];
  for (const r of A.liste) {
    const l = await S().loadPaiements(r.uid);
    l.sort((a, b) => String(a.date || a.creeLe).localeCompare(String(b.date || b.creeLe))).forEach((p) => lignes.push([p.date || String(p.creeLe).slice(0, 10), p.recuNum || "", nomDe(r), r.email || "", p.montant, modeNom(p.mode), p.reference || "", p.parEmail || "", p.annule ? "oui" : ""]));
  }
  const csv = "\ufeff" + lignes.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `paiements-abba-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function droitsAdmin() {
  if (!S() || !S().watchAdminsData) return;
  S().watchAdminsData((map) => {
    const u = P.user; if (!u) return;
    const d = S().droitsDe(u.email, map || {});
    const avait = A.droit; A.droit = !!d.paiements;
    if (A.droit && !avait) {
      if (A.unsubEnr) { try { A.unsubEnr(); } catch (e) {} }
      A.unsubEnr = S().watchAllEnrollments("parcours", (rows) => { A.liste = (rows || []).filter((r) => r.status === "active").sort((a, b) => nomDe(a).localeCompare(nomDe(b))); chargerTout(); });
    }
    if (!A.droit) A.liste = [];
    rendreAdmin();
  });
}

/* =========================================================================
   FONDS DE SOLIDARITÉ — dons anonymes pour couvrir les frais d'un Bâtisseur qui n'en a pas les moyens
   - Le donateur déclare son don (montant, mode, référence) ; la trésorière le confirme : le fonds augmente.
   - Le coordinateur principal ou la trésorière affectent une somme du fonds à un étudiant (versement « Fonds de solidarité »).
   - Le bénéficiaire voit « un frère ou une sœur t'a soutenu », jamais le nom du donateur.
   ========================================================================= */
const D = { mes: [], formOuvert: false, merci: false, montre: false, timer: null };
const cleSoutien = () => "abba_soutien_" + (P.user ? P.user.uid : "");
const lireVu = () => { try { return JSON.parse(localStorage.getItem(cleSoutien()) || "{}"); } catch (e) { return {}; } };
const ecrireVu = (o) => { try { localStorage.setItem(cleSoutien(), JSON.stringify({ ...lireVu(), ...o })); } catch (e) {} };
// Proposé à ceux qui ont fini de payer ou qui ne sont pas soumis au paiement ; jamais à ceux qui paient par versements,
// ont un tarif réduit ou ont reçu un soutien (pour ne pas les mettre mal à l'aise).
function soutienEligible() {
  if (!P.user || !P.compteCharge) return false;
  const e = etat();
  if (e.actif && !(e.complet && e.total >= 5000)) return false;
  if (P.paiements.some((p) => p.mode === "solidarite")) return false;
  return true;
}
function soutienAProposer() {
  const v = lireVu();
  if (v.jamais || (v.plusTard && Date.now() - v.plusTard < 7 * 86400000)) return false;
  return soutienEligible();
}
function formDon() {
  return `<div class="pay-form"><div class="pay-puces">${[500, 1000, 2000, 5000].map((m) => `<button type="button" class="lec-chap" data-sou="montant" data-m="${m}">${fmt(m)}</button>`).join("")}</div>
    <label for="souMontant">${T("Montant du don (F)", "Gift amount (F)")}</label><input id="souMontant" class="text-input" type="number" inputmode="numeric" min="100" step="100">
    <label for="souMode">${T("Comment as-tu donné ?", "How did you give?")}</label><select id="souMode" class="text-input"><option value="mobile-money">${modeNom("mobile-money")}</option><option value="especes">${modeNom("especes")}</option><option value="autre">${modeNom("autre")}</option></select>
    <label for="souRef">${T("Référence (numéro de transaction…)", "Reference (transaction number…)")}</label><input id="souRef" class="text-input" type="text" maxlength="120">
    <p class="small">${esc(P.instructions || T("Pour donner, utilise les moyens indiqués par ABBA (Mobile Money ou espèces), puis déclare ton don ici.", "To give, use the means indicated by ABBA (Mobile Money or cash), then declare your gift here."))}</p>
    <p class="ind-err" id="souMsg"></p><button type="button" class="btn-primary full" data-sou="envoyer">${T("Envoyer mon don", "Send my gift")}</button></div>`;
}
function modalSoutien() {
  let m = $("soutienModal");
  if (!m) { m = document.createElement("div"); m.id = "soutienModal"; m.className = "soutien-fond"; document.body.appendChild(m); }
  m.hidden = false;
  m.innerHTML = `<div class="soutien-boite" role="dialog" aria-modal="true" aria-labelledby="souTitre"><h2 id="souTitre">💛 ${T("Soutenir un autre Bâtisseur", "Support another Builder")}</h2>
    ${D.merci ? `<p>${T("Merci pour ta générosité ! La trésorière va confirmer ton don.", "Thank you for your generosity! The treasurer will confirm your gift.")}</p><button type="button" class="btn-primary full" data-sou="fermer">${T("Fermer", "Close")}</button>`
      : `<p>${T("Certains Bâtisseurs n’ont pas les moyens de payer leur parcours. Si tu le peux, ton don couvre les frais d’un frère ou d’une sœur.", "Some Builders cannot afford their course. If you can, your gift covers the costs of a brother or sister.")}</p>
      <p class="small">${T("Ton don reste anonyme : il ne saura pas que c’est toi, et tu ne sauras pas qui.", "Your gift stays anonymous: they will not know it is you, and you will not know who.")}</p>
      ${D.formOuvert ? formDon() : `<button type="button" class="btn-primary full" data-sou="ouvrir">${T("Je veux soutenir", "I want to support")}</button>`}
      <div class="fm-nav"><button type="button" class="btn-secondary" data-sou="plus-tard">${T("Plus tard", "Later")}</button><button type="button" class="btn-secondary" data-sou="jamais">${T("Ne plus me le proposer", "Don’t suggest it again")}</button></div>`}</div>`;
}
function fermerSoutien() { const m = $("soutienModal"); if (m) { m.hidden = true; m.innerHTML = ""; } D.formOuvert = false; D.merci = false; }
function programmerSoutien() {
  if (D.montre || D.timer) return;
  D.timer = setTimeout(() => { D.timer = null; if (!D.montre && soutienAProposer()) { D.montre = true; modalSoutien(); } }, 2500);
}
async function chargerMesDons() { if (P.user && S() && S().loadMesDons) { try { D.mes = (await S().loadMesDons(P.user.uid)).sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe))); } catch (e) { D.mes = []; } } rendreSoutienCard(); }
function rendreSoutienCard() {
  const box = $("soutienCard");
  if (!box) return;
  if (!P.user) { box.innerHTML = ""; return; }
  let h = `<p class="eyebrow">💛 ${T("Soutenir un Bâtisseur", "Support a Builder")}</p><p class="settings-hint">${T("Ton don, anonyme, couvre les frais d’un Bâtisseur qui n’a pas les moyens de payer son parcours.", "Your anonymous gift covers the costs of a Builder who cannot afford the course.")}</p>`;
  h += D.formOuvert && !$("soutienModal")?.innerHTML ? formDon() : `<button type="button" class="btn-secondary" data-sou="ouvrir-carte">${T("Faire un don", "Make a gift")}</button>`;
  if (D.mes.length) h += `<details class="lec-intro"><summary><strong>${T("Mes dons", "My gifts")} (${D.mes.length})</strong></summary>${D.mes.map((d) => `<p class="small">${esc(dateFr(d.creeLe))} · <strong>${fmt(d.montant)}</strong> · ${d.statut === "valide" ? "✓ " + T("confirmé", "confirmed") + (d.recuNum ? " · " + esc(d.recuNum) : "") : d.statut === "refuse" ? T("non retrouvé", "not found") : "⏳ " + T("en attente", "pending")}</p>`).join("")}</details>`;
  box.innerHTML = h;
}
async function actionSoutien(ev) {
  const b = ev.target.closest("[data-sou]");
  if (!b || !P.user) return;
  const a = b.dataset.sou;
  try {
    if (a === "ouvrir") { D.formOuvert = true; modalSoutien(); return; }
    if (a === "ouvrir-carte") { D.formOuvert = true; D.merci = false; modalSoutien(); return; }
    if (a === "plus-tard") { ecrireVu({ plusTard: Date.now() }); fermerSoutien(); return; }
    if (a === "jamais") { ecrireVu({ jamais: true }); fermerSoutien(); return; }
    if (a === "fermer") { fermerSoutien(); rendreSoutienCard(); return; }
    if (a === "montant") { const i = $("souMontant"); if (i) i.value = b.dataset.m; return; }
    if (a === "envoyer") {
      const say = (m) => { const e = $("souMsg"); if (e) e.textContent = m; };
      const montant = num(($("souMontant") || {}).value), mode = ($("souMode") || {}).value || "autre", reference = (($("souRef") || {}).value || "").trim();
      if (!Number.isFinite(montant) || montant < 100) return say(T("Indique le montant de ton don (100 F au moins).", "Enter the amount of your gift (at least 100 F)."));
      if (montant > 1000000) return say(T("Ce montant semble trop grand : vérifie-le.", "This amount looks too large: please check it."));
      if (mode !== "especes" && !reference) return say(T("Ajoute la référence de la transaction pour que la trésorière retrouve ton don.", "Add the transaction reference so the treasurer can find your gift."));
      await S().addDon(P.user.uid, { nom: P.user.displayName || P.user.email || "", montant, mode, reference, creeLe: new Date().toISOString() });
      D.merci = true; D.formOuvert = false; ecrireVu({ plusTard: Date.now() }); modalSoutien(); await chargerMesDons();
    }
  } catch (err) { const e = $("souMsg"); const t = T("Impossible d’enregistrer : ", "Unable to save: ") + (err.code || err.message); if (e) e.textContent = t; else alert(t); }
}

/* ---------- démarrage ---------- */
const onAuth = (u) => { P.compteCharge = false; D.montre = false; fermerSoutien(); ecouter(u); if (u) { droitsAdmin(); chargerMesDons(); } else { D.mes = []; rendreSoutienCard(); } };
if (S() && S().watchAuth) S().watchAuth(onAuth);
else window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth(onAuth); });
document.addEventListener("click", (ev) => {
  if (ev.target.closest("#dashPaiement")) actionEtudiant(ev);
  else if (ev.target.closest("#paiementsCard")) actionAdmin(ev);
  else if (ev.target.closest("#soutienModal") || ev.target.closest("#soutienCard")) actionSoutien(ev);
});
document.addEventListener("input", (ev) => { if (ev.target.id === "apQ") { A.q = ev.target.value; const pos = ev.target.selectionStart; rendreAdmin(); const n = $("apQ"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } } });
document.addEventListener("change", (ev) => { if (ev.target.id === "apFiltre") { A.filtre = ev.target.value; rendreAdmin(); } });

window.AbbaPaiements = { etat, autorise, complet, palierDe, requis, ORDRE, soutienEligible, soutienAProposer };
