// reponses.js — « Mon carnet de réponses » : un document lisible avec le travail de l'étudiant, module par module.
// Dans l'ordre du module : questions, exercices, fiche, remarque du correcteur.
// Pur (sans accès au réseau ni à la page) : on donne les données, on obtient des « blocs », puis du HTML ou un PDF.

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
    case "check": return v === true ? t("Oui", "Yes") : t("Non", "No");
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
const blocsChamps = (champs, valeurs, lang) => {
  const out = [];
  (champs || []).filter((f) => f.type !== "suivi" && f.type !== "lienZones").forEach((f) => {
    const txt = valeurLisible(f, (valeurs || {})[f.id], lang);
    if (!txt) return;
    if (f.label) out.push({ t: "q", x: f.label });
    out.push({ t: "r", x: txt });
  });
  return out;
};

// ---------- 1. Les blocs (la matière du carnet) ----------
export function construireBlocs({ nom, modules, contenus, lang, aujourdhui }) {
  const t = T(lang), L = lang === "en" ? "en" : "fr";
  const blocs = [{ t: "h1", x: t("Mon carnet de réponses — Parcours Bâtisseur", "My answer notebook — Builder Path") }, { t: "meta", x: `${nom || ""} · ${aujourdhui || ""}` }];
  const ids = Object.keys(modules || {}).filter((mid) => contenus[mid]).sort((a, b) => ORDRE(a) - ORDRE(b));
  let nb = 0;
  ids.forEach((mid) => {
    const p = modules[mid] || {}, c = contenus[mid], b = [];
    // a) Questions du module (avant les exercices)
    const q = p.qcm;
    if (q && typeof q.score === "number") {
      b.push({ t: "h3", x: t("Questions du module", "Module questions") });
      b.push({ t: "r", x: `${q.score} / ${q.total} (${q.pct} %) — ${q.ok ? t("réussi", "passed") : t("pas encore réussi", "not passed yet")}${q.essais ? ` · ${q.essais} ${t("essai(s)", "attempt(s)")}` : ""}`, etat: q.ok ? "ok" : "ko" });
      if (Array.isArray(q.answers) && Array.isArray(c.qcm)) {
        c.qcm.forEach((it, i) => {
          const a = q.answers[i]; if (a == null) return;
          const bon = a === it.b, choix = it.c || [];
          b.push({ t: "q", x: `${i + 1}. ${it.q}` });
          let rep = `${t("Ta réponse", "Your answer")} : ${choix[a] != null ? choix[a] : a} (${bon ? t("juste", "correct") : t("à revoir", "to review")})`;
          if (!bon) { rep += `\n${t("Bonne réponse", "Correct answer")} : ${choix[it.b] != null ? choix[it.b] : it.b}`; if (it.e) rep += `\n${it.e}`; }
          b.push({ t: "r", x: rep, etat: bon ? "ok" : "ko" });
        });
      }
    }
    // b) Exercices
    (c.exercices || []).forEach((ex) => {
      const x = blocsChamps(ex.champs, (p.exercices || {})[ex.id], lang);
      if (x.length) { b.push({ t: "h3", x: ex.titre || ex.id }); b.push(...x); }
    });
    // c) Fiche
    const fiche = c.fiche ? blocsChamps(c.fiche.champs, p.ficheData, lang) : [];
    if (fiche.length) { b.push({ t: "h3", x: (c.fiche && c.fiche.titre) || t("Fiche", "Worksheet") }); b.push(...fiche); }
    // d) Statut de la fiche et remarque du correcteur
    const statuts = { draft: t("brouillon", "draft"), submitted: t("envoyée au correcteur", "sent to your corrector"), returned: t("renvoyée pour correction", "returned for correction"), validated: t("validée", "validated") };
    if (p.ficheStatus && statuts[p.ficheStatus]) b.push({ t: "meta", x: `${t("Fiche", "Worksheet")} : ${statuts[p.ficheStatus]}${p.validatedAt && (p.ficheStatus === "validated" || p.ficheStatus === "returned") ? " · " + dateCourte(p.validatedAt, L) : ""}` });
    if (p.correctorComment) b.push({ t: "corr", titre: t("Remarque de ton correcteur", "Your corrector's remark"), x: p.correctorComment });
    if (b.length) { nb++; blocs.push({ t: "h2", x: c.titre || mid }); blocs.push(...b); }
  });
  if (!nb) blocs.push({ t: "meta", x: t("Il n'y a pas encore de réponses enregistrées.", "There are no saved answers yet.") });
  return { titre: t("Mon carnet de réponses", "My answer notebook"), blocs, nb, nom, lang: L };
}

// ---------- 2. Version page web ----------
export const CSS_CARNET = `
  .carnet { font:16px/1.55 Georgia,'Times New Roman',serif; color:#2b2a28; max-width:760px; margin:0 auto; }
  .carnet h1 { font-size:1.5rem; color:#1a3b9a; margin:0 0 4px; } .carnet h2 { font-size:1.2rem; color:#1a3b9a; border-bottom:2px solid #c9a227; padding-bottom:3px; margin:28px 0 8px; page-break-after:avoid; }
  .carnet h3 { font-size:1.02rem; margin:16px 0 4px; color:#5b574f; } .carnet .meta { color:#5b574f; font-size:.9rem; margin:6px 0; }
  .carnet .q { margin:10px 0 2px; font-weight:700; } .carnet .r { margin:0 0 6px; padding:6px 10px; background:#f6f1e3; border-left:3px solid #c9a227; }
  .carnet .r.ok { border-left-color:#2e7d4f; } .carnet .r.ko { border-left-color:#b23b3b; }
  .carnet .corr { margin:10px 0; padding:8px 10px; background:#e8efff; border-left:3px solid #1a3b9a; }
  @media (prefers-color-scheme: dark) { .carnet { color:#ece8de; } .carnet h1,.carnet h2 { color:#8fa8ff; } .carnet .r { background:#242836; } .carnet .corr { background:#1f2a4a; } .carnet h3,.carnet .meta { color:#b8b2a3; } }
  @media print { .carnet { color:#000; } .carnet .r { background:#f6f1e3 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }`;
export function blocsVersHtml(carnet) {
  const h = carnet.blocs.map((b) => {
    switch (b.t) {
      case "h1": return `<h1>${esc(b.x)}</h1>`;
      case "h2": return `<h2>${esc(b.x)}</h2>`;
      case "h3": return `<h3>${esc(b.x)}</h3>`;
      case "meta": return `<p class="meta">${esc(b.x)}</p>`;
      case "q": return `<p class="q">${esc(b.x)}</p>`;
      case "r": return `<p class="r${b.etat ? " " + b.etat : ""}">${para(b.x)}</p>`;
      case "corr": return `<div class="corr"><strong>${esc(b.titre)} :</strong><br>${para(b.x)}</div>`;
      default: return "";
    }
  }).join("");
  return `<div class="carnet">${h}</div>`;
}
export function documentComplet(carnet) {
  return `<!DOCTYPE html><html lang="${carnet.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(carnet.titre)}</title><style>body{margin:0;padding:18px;background:#fbf7ef}@media (prefers-color-scheme: dark){body{background:#14161c}}${CSS_CARNET}</style></head><body>${blocsVersHtml(carnet)}</body></html>`;
}

// ---------- 3. Version PDF (jsPDF doit être chargé : globalThis.jspdf) ----------
// Les polices standard d'un PDF n'ont pas tous les caractères : on remplace ceux qui manquent (très rares en français).
const pourPdf = (s) => String(s == null ? "" : s).replace(/→/g, "->").replace(/[^\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u20AC\n]/g, "?");
export function blocsVersPdf(carnet, jspdf) {
  const doc = new jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
  const PW = 210, PH = 297, M = 18, LW = PW - 2 * M;
  const BLEU = [26, 59, 154], OR = [201, 162, 39], GRIS = [91, 87, 79], ENCRE = [43, 42, 40];
  let y = M;
  const place = (h) => { if (y + h > PH - 18) { doc.addPage(); y = M; } };
  const lignesDe = (s, taille, style, largeur) => { doc.setFont("times", style); doc.setFontSize(taille); return doc.splitTextToSize(pourPdf(s), largeur); };
  const texte = (s, taille, style, couleur, interligne) => {
    const hl = taille * 0.3528 * (interligne || 1.3); doc.setTextColor(...couleur);
    lignesDe(s, taille, style, LW).forEach((l) => { place(hl); doc.setFont("times", style); doc.setFontSize(taille); doc.setTextColor(...couleur); doc.text(l, M, y + hl * 0.78); y += hl; });
  };
  const boite = (s, taille, style, fond, barre, couleur, titre) => {
    const hl = taille * 0.3528 * 1.3, lignes = (titre ? [pourPdf(titre) + " :"] : []).concat(lignesDe(s, taille, style, LW - 6));
    lignes.forEach((l, i) => {
      place(hl); doc.setFillColor(...fond); doc.rect(M, y, LW, hl, "F"); doc.setFillColor(...barre); doc.rect(M, y, 1, hl, "F");
      doc.setFont("times", titre && i === 0 ? "bold" : style); doc.setFontSize(taille); doc.setTextColor(...couleur); doc.text(l, M + 3.5, y + hl * 0.78); y += hl;
    });
    y += 1.2;
  };
  carnet.blocs.forEach((b) => {
    switch (b.t) {
      case "h1": texte(b.x, 19, "bold", BLEU, 1.2); y += 1; break;
      case "meta": texte(b.x, 10, "italic", GRIS); y += 0.8; break;
      case "h2": y += 5; place(14); texte(b.x, 14, "bold", BLEU, 1.2); doc.setDrawColor(...OR); doc.setLineWidth(0.6); doc.line(M, y + 0.4, M + LW, y + 0.4); y += 3; break;
      case "h3": y += 2.5; place(10); texte(b.x, 11.5, "bold", GRIS); y += 0.5; break;
      case "q": y += 1.5; place(9); texte(b.x, 11, "bold", ENCRE); break;
      case "r": boite(b.x, 11, "normal", b.etat === "ok" ? [232, 243, 235] : b.etat === "ko" ? [248, 232, 232] : [246, 241, 227], b.etat === "ok" ? [46, 125, 79] : b.etat === "ko" ? [178, 59, 59] : OR, ENCRE); break;
      case "corr": y += 1.5; boite(b.x, 11, "normal", [232, 239, 255], BLEU, ENCRE, b.titre); break;
    }
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("times", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text(pourPdf(`${carnet.nom || ""} — ${carnet.titre} — ${i} / ${n}`), PW / 2, PH - 9, { align: "center" }); }
  return new Uint8Array(doc.output("arraybuffer"));
}
