// reponses.js — fabrique « Mon carnet de réponses » : un document lisible avec les réponses de l'étudiant, module par module.
// Pur (sans accès au réseau ni à la page) : on lui donne les données, il rend du HTML. Tout texte est protégé (esc).

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (s) => esc(s).replace(/\r?\n/g, "<br>");
const T = (lang) => (fr, en) => (lang === "en" ? en : fr);
const ORDRE = (mid) => (mid === "charte" ? -2 : mid === "autoeval" ? -1 : parseFloat(String(mid).replace(/^m/, "")) + (/b$/.test(mid) ? 0.5 : 0));
const dateCourte = (x, lang) => {
  const ms = !x ? 0 : typeof x === "number" ? x : typeof x.seconds === "number" ? x.seconds * 1000 : Date.parse(x);
  return ms && !isNaN(ms) ? new Date(ms).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
};

// Valeur d'un champ → texte lisible (ou "" si rien n'a été répondu)
export function valeurLisible(f, v, lang) {
  const t = T(lang);
  if (v == null || v === "" || (typeof v === "object" && !Object.keys(v).length)) return "";
  switch (f.type) {
    case "check": return v === true ? "✔ " + t("Oui", "Yes") : "☐ " + t("Non", "No");
    case "scale": return v + " / 5";
    case "cases": return Object.entries(v).filter(([, x]) => x).map(([i]) => (f.items || [])[Number(i)] || i).join(" ; ");
    case "oui_non": return Object.keys(v).sort((a, b) => a - b).map((k) => `${k}. ${(f.items || [])[Number(k) - 1] || ""} — ${v[k] === "oui" ? t("Oui", "Yes") : t("Non", "No")}`).join("\n");
    case "scores": return Object.keys(v).sort((a, b) => a - b).map((k) => `${k}. ${(f.items || [])[Number(k) - 1] || ""} — ${v[k]}`).join("\n");
    case "grille": case "tableau": {
      const lignes = [];
      (f.rows || []).forEach((r, i) => {
        const cells = (f.cols || [""]).map((c, j) => { const x = v[`${i}_${j}`]; return x == null || x === "" ? "" : (c ? `${c} : ` : "") + x; }).filter(Boolean);
        if (cells.length) lignes.push(`${r} — ${cells.join(" ; ")}`);
      });
      return lignes.join("\n");
    }
    default: return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}
const champsAffiches = (champs, valeurs, lang) => (champs || []).filter((f) => f.type !== "suivi" && f.type !== "lienZones").map((f) => {
  const txt = valeurLisible(f, (valeurs || {})[f.id], lang);
  return txt ? `${f.label ? `<p class="q">${esc(f.label)}</p>` : ""}<p class="r">${para(txt)}</p>` : "";
}).join("");

export const CSS_CARNET = `
  .carnet { font:16px/1.55 Georgia,'Times New Roman',serif; color:#2b2a28; max-width:760px; margin:0 auto; }
  .carnet h1 { font-size:1.5rem; color:#1a3b9a; margin:0 0 4px; } .carnet h2 { font-size:1.2rem; color:#1a3b9a; border-bottom:2px solid #c9a227; padding-bottom:3px; margin:28px 0 8px; page-break-after:avoid; }
  .carnet h3 { font-size:1.02rem; margin:16px 0 4px; color:#5b574f; } .carnet .meta { color:#5b574f; font-size:.9rem; }
  .carnet .q { margin:10px 0 2px; font-weight:700; } .carnet .r { margin:0 0 6px; padding:6px 10px; background:#f6f1e3; border-left:3px solid #c9a227; }
  .carnet .corr { margin:10px 0; padding:8px 10px; background:#e8efff; border-left:3px solid #1a3b9a; }
  @media (prefers-color-scheme: dark) { .carnet { color:#ece8de; } .carnet h1,.carnet h2 { color:#8fa8ff; } .carnet .r { background:#242836; } .carnet .corr { background:#1f2a4a; } .carnet h3,.carnet .meta { color:#b8b2a3; } }
  @media print { .carnet { color:#000; } .carnet .r { background:#f6f1e3 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }`;

// modules : { mid: documentEnregistré } ; contenus : { mid: contenuDuModule } ; renvoie { titre, corps }
export function construireCarnet({ nom, modules, contenus, lang, aujourdhui }) {
  const t = T(lang);
  const ids = Object.keys(modules || {}).filter((mid) => contenus[mid]).sort((a, b) => ORDRE(a) - ORDRE(b));
  let corps = `<div class="carnet"><h1>${esc(t("Mon carnet de réponses — Parcours Bâtisseur", "My answer notebook — Builder Path"))}</h1>
    <p class="meta">${esc(nom || "")} · ${esc(aujourdhui || "")}</p>`;
  let nb = 0;
  ids.forEach((mid) => {
    const p = modules[mid] || {}, c = contenus[mid];
    let h = "";
    (c.exercices || []).forEach((ex) => {
      const x = champsAffiches(ex.champs, (p.exercices || {})[ex.id], lang);
      if (x) h += `<h3>${esc(ex.titre || ex.id)}</h3>${x}`;
    });
    const fiche = c.fiche ? champsAffiches(c.fiche.champs, p.ficheData, lang) : "";
    if (fiche) h += `<h3>${esc((c.fiche && c.fiche.titre) || t("Fiche", "Worksheet"))}</h3>${fiche}`;
    const q = p.qcm;
    if (q && typeof q.score === "number") h += `<h3>${esc(t("Questions du module", "Module questions"))}</h3><p class="r">${q.score} / ${q.total} (${q.pct} %) — ${q.ok ? esc(t("réussi", "passed")) : esc(t("pas encore réussi", "not passed yet"))}${q.essais ? ` · ${q.essais} ${esc(t("essai(s)", "attempt(s)"))}` : ""}</p>`;
    const statuts = { draft: t("brouillon", "draft"), submitted: t("envoyée au correcteur", "sent to your corrector"), returned: t("renvoyée pour correction", "returned for correction"), validated: t("validée", "validated") };
    if (p.ficheStatus && statuts[p.ficheStatus]) h += `<p class="meta">${esc(t("Fiche", "Worksheet"))} : ${esc(statuts[p.ficheStatus])}${p.validatedAt && (p.ficheStatus === "validated" || p.ficheStatus === "returned") ? " · " + esc(dateCourte(p.validatedAt, lang)) : ""}</p>`;
    if (p.correctorComment) h += `<div class="corr"><strong>${esc(t("Remarque de ton correcteur", "Your corrector's remark"))} :</strong><br>${para(p.correctorComment)}</div>`;
    if (h) { nb++; corps += `<h2>${esc(c.titre || c.titreManuel || mid)}</h2>${h}`; }
  });
  if (!nb) corps += `<p>${esc(t("Il n'y a pas encore de réponses enregistrées.", "There are no saved answers yet."))}</p>`;
  corps += `</div>`;
  return { titre: t("Mon carnet de réponses", "My answer notebook"), corps, nb };
}

export function documentComplet(carnet, lang) {
  return `<!DOCTYPE html><html lang="${lang === "en" ? "en" : "fr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(carnet.titre)}</title><style>body{margin:0;padding:18px;background:#fbf7ef}@media (prefers-color-scheme: dark){body{background:#14161c}}${CSS_CARNET}</style></head><body>${carnet.corps}</body></html>`;
}
