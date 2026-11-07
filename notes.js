/* =========================================================================
   MES NOTES — notes personnelles de l'élève (Parcours Bâtisseur)
   - Un bouton ✏️ reste visible partout : on touche, on écrit, on enregistre, on reprend sa lecture.
   - Chaque note retient l'endroit où l'on était (verset de la Bible, module et étape du cours, onglet) et permet d'y revenir.
   - Les notes sont rangées dans users/{uid}/notes : lisibles par l'élève seul. Aucun correcteur, aucun coordinateur ne les voit.
   - Sans connexion, la note est gardée sur le téléphone et envoyée seule au retour du réseau.
   ========================================================================= */
const EN = () => window.I18N && window.I18N.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const S = () => window.AbbaSync;
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MAX = 5000;
const ONGLETS = { accueil: ["Accueil", "Home"], declaration: ["Ma journée", "My day"], bible: ["Bible", "Bible"], parcours: ["Mon Parcours", "My Course"], binome: ["Binôme", "Partner"], caractere: ["Caractère", "Character"], dimensions: ["Dimensions", "Dimensions"], presence: ["Présence", "Attendance"], reglages: ["Réglages", "Settings"], coordination: ["Coordination", "Coordination"] };

const N = { user: null, notes: [], unsub: null, ouvert: false, ecran: false, recherche: "", filtre: "toutes", edition: null, suppr: null, chargees: false };
const BROUILLON = "abba_note_brouillon";
const lire = (k) => { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } };
const ecrire = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} };

/* ---------- Où est l'élève ? ---------- */
function ongletActif() { const p = document.querySelector(".panel.active"); return p ? p.id.replace("panel-", "") : "accueil"; }
function contexte() {
  const tab = ongletActif();
  try {
    if (tab === "bible" && window.AbbaBible && window.AbbaBible.contexte) return { tab, ...window.AbbaBible.contexte() };
    if (tab === "parcours" && window.Formation && window.Formation.contexte) return { tab, ...window.Formation.contexte() };
  } catch (e) {}
  const n = ONGLETS[tab] || [tab, tab];
  return { tab, label: T(n[0], n[1]) };
}
function genre(c) { return c && c.tab === "bible" ? "bible" : c && c.tab === "parcours" ? "cours" : "autres"; }
function retourner(c) {
  fermerEcran();
  if (!c) return;
  if (c.tab === "bible" && c.l && window.AbbaBible) { const t = document.querySelector('.tab[data-tab="bible"]'); if (t) t.click(); window.AbbaBible.aller(c.l, c.c, c.v || undefined); return; }
  if (c.tab === "parcours" && c.mid && window.Formation && window.Formation.aller) { window.Formation.aller(c.mid, c.step); return; }
  const t = document.querySelector('.tab[data-tab="' + c.tab + '"]'); if (t) t.click();
}

/* ---------- Données ---------- */
function ecouter() {
  if (N.unsub) { try { N.unsub(); } catch (e) {} N.unsub = null; }
  N.notes = []; N.chargees = false;
  if (!N.user || !S() || !S().watchNotes) return;
  N.unsub = S().watchNotes(N.user.uid, (l) => { N.notes = l; N.chargees = true; majBouton(); if (N.ecran) dessinerEcran(); });
}
function surConnexion(u) { N.user = u || null; ecouter(); majBouton(); if (!u) { fermerPanneau(); fermerEcran(); } }
if (S() && S().watchAuth) S().watchAuth(surConnexion);
else window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth(surConnexion); });

/* ---------- Bouton flottant et panneau de saisie ---------- */
let bouton = null, panneau = null, toast = null;
function creer() {
  if (bouton) return;
  bouton = document.createElement("button");
  bouton.id = "noteBtn"; bouton.type = "button"; bouton.hidden = true; bouton.textContent = "✏️";
  bouton.addEventListener("click", () => (N.ouvert ? fermerPanneau() : ouvrirPanneau()));
  panneau = document.createElement("div");
  panneau.id = "noteSheet"; panneau.hidden = true; panneau.setAttribute("role", "dialog");
  toast = document.createElement("div"); toast.id = "noteToast"; toast.hidden = true; toast.setAttribute("role", "status");
  document.body.append(bouton, panneau, toast);
  // le bouton se place au-dessus du lecteur audio flottant quand il est affiché
  new MutationObserver(placer).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", placer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (N.ecran) fermerEcran(); else if (N.ouvert) fermerPanneau(); } });
  window.addEventListener("popstate", () => { if (N.ecran) fermerEcran(true); });
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-notes]"); if (b) { e.preventDefault(); ouvrirEcran(); } });
}
function placer() {
  if (!bouton) return;
  const m = document.getElementById("bibMini");
  const lecteur = m && !m.hidden ? 66 : 0;
  bouton.style.setProperty("--note-haut", lecteur + "px");
  panneau.style.setProperty("--note-haut", lecteur + "px");
}
function majBouton() { if (!bouton) return; const visible = !!N.user && !N.ecran; bouton.hidden = !visible; if (!visible) fermerPanneau(); placer(); }
function flash(t) { toast.textContent = t; toast.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { toast.hidden = true; }, 2200); }

function ouvrirPanneau() {
  const c = contexte();
  N.ouvert = true; N.ctx = c;
  panneau.hidden = false; bouton.classList.add("on");
  panneau.innerHTML = `
    <p class="note-ctx">📍 ${esc(c.label)}</p>
    <textarea id="noteTexte" rows="5" maxlength="${MAX}" placeholder="${esc(T("Écris ta note ici…", "Write your note here…"))}">${esc(lire(BROUILLON))}</textarea>
    <p class="note-erreur" id="noteErreur" hidden></p>
    <div class="note-actions">
      <button type="button" class="btn-primary btn-compact" id="noteSave">${T("Enregistrer", "Save")}</button>
      <button type="button" class="btn-secondary btn-compact" id="noteClose">${T("Fermer", "Close")}</button>
      <button type="button" class="link-btn note-toutes" id="noteToutes">${T("Mes notes", "My notes")} (${N.notes.length})</button>
    </div>`;
  const ta = panneau.querySelector("#noteTexte");
  ta.addEventListener("input", () => ecrire(BROUILLON, ta.value));
  panneau.querySelector("#noteSave").addEventListener("click", enregistrer);
  panneau.querySelector("#noteClose").addEventListener("click", fermerPanneau);
  panneau.querySelector("#noteToutes").addEventListener("click", () => { fermerPanneau(); ouvrirEcran(); });
  setTimeout(() => ta.focus(), 50);
}
function fermerPanneau() { N.ouvert = false; if (panneau) panneau.hidden = true; if (bouton) bouton.classList.remove("on"); }
async function enregistrer() {
  const ta = panneau.querySelector("#noteTexte"), err = panneau.querySelector("#noteErreur"), t = ta.value.trim();
  if (!t) { ta.focus(); return; }
  err.hidden = true;
  const { label, tab, l, c, v, mid, step } = N.ctx || contexte();
  const ctx = { tab, label }; if (l) { ctx.l = l; ctx.c = c; if (v) ctx.v = v; } if (mid) { ctx.mid = mid; ctx.step = step || null; }
  try {
    // hors connexion, l'enregistrement reste en attente sur le téléphone : on n'attend pas la réponse du serveur
    S().addNote(N.user.uid, { texte: t, ctx }).catch(() => {});
    ecrire(BROUILLON, ""); fermerPanneau(); flash(T("Note enregistrée ✓", "Note saved ✓"));
  } catch (e) { err.textContent = T("La note n'a pas pu être enregistrée. Ton texte est conservé.", "The note could not be saved. Your text is kept."); err.hidden = false; }
}

/* ---------- Écran « Mes notes » ---------- */
let ecran = null;
function ouvrirEcran() {
  if (!N.user) return;
  creer(); fermerPanneau();
  if (!ecran) { ecran = document.createElement("div"); ecran.id = "notesEcran"; ecran.setAttribute("role", "dialog"); document.body.appendChild(ecran); ecran.addEventListener("click", surClic); ecran.addEventListener("input", surSaisie); }
  N.ecran = true; N.edition = null; N.suppr = null;
  try { history.pushState({ notes: 1 }, ""); } catch (e) {}
  document.body.classList.add("notes-ouvert");
  majBouton(); dessinerEcran();
}
function fermerEcran(depuisRetour) {
  if (!N.ecran) return;
  N.ecran = false; document.body.classList.remove("notes-ouvert");
  if (ecran) ecran.remove(), (ecran = null);
  if (!depuisRetour) { try { if (history.state && history.state.notes) history.back(); } catch (e) {} }
  majBouton();
}
const date = (n) => {
  const t = n.creeLe && n.creeLe.toDate ? n.creeLe.toDate() : new Date();
  return t.toLocaleString(EN() ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
function filtrees() {
  const q = N.recherche.trim().toLowerCase();
  return N.notes.filter((n) => (N.filtre === "toutes" || genre(n.ctx) === N.filtre) && (!q || String(n.texte).toLowerCase().includes(q) || String((n.ctx || {}).label || "").toLowerCase().includes(q)));
}
function dessinerEcran() {
  if (!ecran) return;
  const actif = document.activeElement, garde = actif && actif.id === "notesRecherche" ? [actif.selectionStart, actif.selectionEnd] : null;
  const liste = filtrees();
  const f = (k, fr, en) => `<button type="button" class="note-filtre${N.filtre === k ? " on" : ""}" data-nf="${k}">${T(fr, en)}</button>`;
  let h = `<div class="notes-tete"><button type="button" class="link-btn" data-na="fermer">← ${T("Retour", "Back")}</button><h2>📝 ${T("Mes notes", "My notes")} <small>(${N.notes.length})</small></h2></div>
    <p class="note-prive">🔒 ${T("Tes notes sont privées : toi seul peux les lire.", "Your notes are private: only you can read them.")}</p>
    <input id="notesRecherche" class="text-input" type="search" placeholder="${esc(T("Chercher dans mes notes…", "Search my notes…"))}" value="${esc(N.recherche)}">
    <div class="note-filtres">${f("toutes", "Toutes", "All")}${f("bible", "Bible", "Bible")}${f("cours", "Cours", "Course")}${f("autres", "Autres", "Other")}</div>`;
  if (!N.chargees) h += `<p class="note-vide">${T("Chargement…", "Loading…")}</p>`;
  else if (!liste.length) h += `<p class="note-vide">${N.notes.length ? T("Aucune note ne correspond.", "No matching note.") : T("Tu n'as pas encore de note. Touche le bouton ✏️ pendant que tu lis ou que tu travailles : tu écris, tu enregistres, tu continues.", "You have no notes yet. Tap the ✏️ button while you read or work: write, save, carry on.")}</p>`;
  liste.forEach((n) => {
    const c = n.ctx || {}, enEdition = N.edition === n.id;
    h += `<article class="note-carte" data-id="${esc(n.id)}"><div class="note-meta"><span>${esc(date(n))}</span>`;
    if (c.label) h += `<button type="button" class="note-lieu" data-na="aller" data-id="${esc(n.id)}">📍 ${esc(c.label)} ↗</button>`;
    h += `</div>`;
    if (enEdition) h += `<textarea class="note-edit" rows="5" maxlength="${MAX}" data-ne="${esc(n.id)}">${esc(N.brouillonEdition != null ? N.brouillonEdition : n.texte)}</textarea>
      <div class="note-actions"><button type="button" class="btn-primary btn-compact" data-na="ok" data-id="${esc(n.id)}">${T("Enregistrer", "Save")}</button><button type="button" class="btn-secondary btn-compact" data-na="annuler">${T("Annuler", "Cancel")}</button></div>`;
    else {
      h += `<p class="note-texte">${esc(n.texte)}</p><div class="note-actions">
        <button type="button" class="link-btn" data-na="modifier" data-id="${esc(n.id)}">✏️ ${T("Modifier", "Edit")}</button>
        <button type="button" class="link-btn" data-na="copier" data-id="${esc(n.id)}">📋 ${T("Copier", "Copy")}</button>`;
      h += N.suppr === n.id ? `<span class="note-conf">${T("Supprimer ?", "Delete?")} <button type="button" class="link-btn" data-na="oui" data-id="${esc(n.id)}">${T("Oui", "Yes")}</button> · <button type="button" class="link-btn" data-na="non">${T("Non", "No")}</button></span>`
        : `<button type="button" class="link-btn note-suppr" data-na="suppr" data-id="${esc(n.id)}">🗑 ${T("Supprimer", "Delete")}</button>`;
      h += `</div>`;
    }
    h += `</article>`;
  });
  ecran.innerHTML = h;
  if (garde) { const r = ecran.querySelector("#notesRecherche"); if (r) { r.focus(); try { r.setSelectionRange(garde[0], garde[1]); } catch (e) {} } }
}
function surSaisie(e) {
  if (e.target.id === "notesRecherche") { N.recherche = e.target.value; dessinerEcran(); }
  else if (e.target.dataset && e.target.dataset.ne) N.brouillonEdition = e.target.value;
}
async function surClic(e) {
  const f = e.target.closest("[data-nf]");
  if (f) { N.filtre = f.dataset.nf; dessinerEcran(); return; }
  const b = e.target.closest("[data-na]"); if (!b) return;
  const a = b.dataset.na, id = b.dataset.id, n = N.notes.find((x) => x.id === id);
  try {
    if (a === "fermer") fermerEcran();
    else if (a === "aller" && n) retourner(n.ctx);
    else if (a === "modifier") { N.edition = id; N.brouillonEdition = null; dessinerEcran(); }
    else if (a === "annuler") { N.edition = null; N.brouillonEdition = null; dessinerEcran(); }
    else if (a === "ok") {
      const t = (N.brouillonEdition != null ? N.brouillonEdition : n.texte).trim(); if (!t) return;
      S().updateNote(N.user.uid, id, { texte: t }).catch(() => {}); N.edition = null; N.brouillonEdition = null; flash(T("Note modifiée ✓", "Note updated ✓")); dessinerEcran();
    }
    else if (a === "copier" && n) { try { await navigator.clipboard.writeText(n.texte); flash(T("Note copiée ✓", "Note copied ✓")); } catch (x) { flash(T("Copie impossible", "Copy not possible")); } }
    else if (a === "suppr") { N.suppr = id; dessinerEcran(); }
    else if (a === "non") { N.suppr = null; dessinerEcran(); }
    else if (a === "oui") { N.suppr = null; S().deleteNote(N.user.uid, id).catch(() => {}); flash(T("Note supprimée", "Note deleted")); }
  } catch (x) { flash(T("Action impossible", "Action not possible")); }
}

creer();
window.AbbaNotes = { ouvrir: ouvrirEcran, contexte };
