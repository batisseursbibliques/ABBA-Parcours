/* ============================================================
   FICHE D'UN COORDINATEUR + SAISIE DE SIGNATURE
   - Le coordinateur principal choisit, pour chaque coordinateur : son nom, son type (national, local ou spécial),
     son pays (national, local), son lieu (local), sa mission (spécial) et enregistre sa signature.
   - Un coordinateur national peut refaire sa propre signature (carte « Ma signature »).
   - La signature se prend par photo (le fond est enlevé) ou se dessine au doigt.
   ============================================================ */
import { listePays } from "./geo.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = () => window.AbbaSync;
const TYPES = { national: "Coordinateur national", local: "Coordinateur local", special: "Coordinateur spécial" };
const PAYS_FR = () => listePays("fr"), PAYS_EN = () => listePays("en");
const nomPays = (liste, code) => (liste.find((p) => p.code === code) || {}).nom || code || "";

/* ---------- Fabrication de l'image de signature ---------- */
// Recadre autour de l'encre et réduit à une taille raisonnable (le fichier doit rester petit).
function recadrer(src) {
  const w = src.width, h = src.height, d = src.getContext("2d").getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;                      // rien d'écrit
  const m = 10; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, 700 / cw, 320 / ch);
  const out = document.createElement("canvas"); out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  out.getContext("2d").drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}
// Photo d'une signature sur papier blanc : on enlève le fond (le papier devient transparent, l'encre reste).
async function depuisPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("photo illisible")); i.src = url; });
    const k = Math.min(1, 1500 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data, hist = new Array(256).fill(0);
    const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let i = 0; i < d.length; i += 28) hist[Math.round(lum(i))]++;
    let tot = 0; hist.forEach((n) => { tot += n; });
    let acc = 0, bg = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= tot * 0.85) { bg = Math.max(v, 80); break; } }   // niveau du papier
    for (let i = 0; i < d.length; i += 4) {
      const t = lum(i) / bg;
      const a = t >= 0.82 ? 0 : t <= 0.5 ? 255 : Math.round(255 * (0.82 - t) / 0.32);
      d[i + 3] = a;
      if (a) { d[i] = Math.round(d[i] * 0.6); d[i + 1] = Math.round(d[i + 1] * 0.6); d[i + 2] = Math.round(d[i + 2] * 0.6); }   // encre un peu plus foncée
    }
    x.putImageData(im, 0, 0);
    const r = recadrer(c); return r ? r.toDataURL("image/png") : null;
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Fenêtre de dessin au doigt ---------- */
function dessiner() {
  return new Promise((fin) => {
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:flex;align-items:center;justify-content:center;padding:12px;";
    ov.innerHTML = `<div class="card" style="width:100%;max-width:560px;margin:0;">
      <p class="eyebrow">Dessiner la signature</p>
      <p class="settings-hint">Signe avec le doigt dans le cadre ci-dessous.</p>
      <canvas style="width:100%;aspect-ratio:5/2;background:#fff;border:1px dashed #999;border-radius:8px;touch-action:none;display:block;" width="1000" height="400"></canvas>
      <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn-secondary" data-a="eff">Effacer</button><button class="btn-secondary" data-a="ann">Annuler</button><button class="btn-primary" data-a="ok" style="flex:1;">Valider</button></div></div>`;
    document.body.appendChild(ov);
    const c = ov.querySelector("canvas"), x = c.getContext("2d", { willReadFrequently: true });
    x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 7; x.strokeStyle = "#102a6b";
    let on = false, last = null;
    const pt = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
    c.addEventListener("pointerdown", (e) => { on = true; last = pt(e); c.setPointerCapture(e.pointerId); x.beginPath(); x.arc(last.x, last.y, 3.5, 0, 7); x.fillStyle = "#102a6b"; x.fill(); e.preventDefault(); });
    c.addEventListener("pointermove", (e) => { if (!on) return; const p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; e.preventDefault(); });
    const stop = () => { on = false; }; c.addEventListener("pointerup", stop); c.addEventListener("pointercancel", stop);
    const ferme = (v) => { ov.remove(); fin(v); };
    ov.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]"); if (!a) return;
      if (a.dataset.a === "eff") x.clearRect(0, 0, c.width, c.height);
      else if (a.dataset.a === "ann") ferme(null);
      else { const r = recadrer(c); if (!r) { alert("Le cadre est vide : signe d'abord."); return; } ferme(r.toDataURL("image/png")); }
    });
  });
}
function choisirPhoto() {
  return new Promise((fin) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.addEventListener("change", async () => { try { fin(i.files[0] ? await depuisPhoto(i.files[0]) : null); } catch (e) { alert("Photo illisible : " + e.message); fin(null); } });
    i.click();
  });
}

/* ---------- La fiche ---------- */
// ouvrirFiche(email, adminsData, { soi: true }) : soi = le coordinateur national refait sa propre signature (sans toucher à sa fiche).
function ouvrirFiche(email, adminsData, opt) {
  const soi = !!(opt && opt.soi), em = String(email).toLowerCase(), prev = (adminsData || {})[em] || {};
  let nouvelle = null;                                           // image de signature choisie dans cette fenêtre
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow:auto;";
  const optsPays = (sel) => `<option value="">— choisir le pays —</option>` + PAYS_FR().map((p) => `<option value="${p.code}" ${p.code === sel ? "selected" : ""}>${esc(p.nom)}</option>`).join("");
  ov.innerHTML = `<div class="card" style="width:100%;max-width:560px;margin:auto;">
    <p class="eyebrow">${soi ? "Ma signature" : "Fiche du coordinateur"}</p>
    <p class="settings-hint">${esc(em)}</p>
    ${soi ? "" : `
    <label class="settings-hint">Nom complet (tel qu'il apparaîtra sur les documents)</label>
    <input class="text-input" id="fcNom" value="${esc(prev.nom || "")}" autocomplete="off">
    <label class="settings-hint" style="margin-top:8px;display:block;">Type de coordinateur</label>
    <select class="text-input" id="fcType"><option value="">— choisir —</option>${Object.keys(TYPES).map((k) => `<option value="${k}" ${prev.fonction === k ? "selected" : ""}>${TYPES[k]}</option>`).join("")}</select>
    <div id="fcPaysBloc" style="display:none;"><label class="settings-hint" style="margin-top:8px;display:block;">Pays</label><select class="text-input" id="fcPays">${optsPays(prev.pays)}</select></div>
    <div id="fcLieuBloc" style="display:none;"><label class="settings-hint" style="margin-top:8px;display:block;">Lieu (ville, région, église…)</label><input class="text-input" id="fcLieu" value="${esc(prev.lieu || "")}" autocomplete="off"></div>
    <div id="fcMissionBloc" style="display:none;"><label class="settings-hint" style="margin-top:8px;display:block;">À quoi ce coordinateur est-il spécialement destiné ?</label><textarea class="text-input" id="fcMission" rows="3">${esc(prev.mission || "")}</textarea></div>`}
    <div id="fcSigBloc" style="margin-top:12px;"><p class="settings-hint" id="fcSigTitre">Signature</p>
      <div id="fcApercu" style="background:#fff;border:1px solid #ddd;border-radius:8px;min-height:70px;display:flex;align-items:center;justify-content:center;padding:6px;"><span class="settings-hint">Aucune signature enregistrée</span></div>
      <div style="display:flex;gap:8px;margin-top:8px;"><button class="btn-secondary" data-a="photo" style="flex:1;">📷 Photo</button><button class="btn-secondary" data-a="dessin" style="flex:1;">✍️ Dessiner</button></div>
      <p class="settings-hint">Photo : signe sur une feuille blanche, bien éclairée et à plat. Le fond est enlevé automatiquement.</p></div>
    <p class="settings-hint" id="fcMsg"></p>
    <div style="display:flex;gap:8px;"><button class="btn-secondary" data-a="ann">Annuler</button><button class="btn-primary" data-a="ok" style="flex:1;">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const $ = (s) => ov.querySelector(s), msg = (t) => { $("#fcMsg").textContent = t; };
  const montrer = (src) => { $("#fcApercu").innerHTML = src ? `<img src="${src}" style="max-width:100%;max-height:140px;">` : `<span class="settings-hint">Aucune signature enregistrée</span>`; };
  const type = () => (soi ? "national" : $("#fcType").value);
  const majChamps = () => {
    if (soi) return;
    const t = type();
    $("#fcPaysBloc").style.display = t === "national" || t === "local" ? "" : "none";
    $("#fcLieuBloc").style.display = t === "local" ? "" : "none";
    $("#fcMissionBloc").style.display = t === "special" ? "" : "none";
    $("#fcSigTitre").textContent = t === "national" ? "Signature (obligatoire : elle figurera sur les documents des étudiants de son pays)" : "Signature (facultative)";
  };
  majChamps(); if (!soi) $("#fcType").addEventListener("change", majChamps);
  // signature déjà enregistrée
  (async () => {
    try {
      let id = prev.sigId;
      if (prev.fonction === "national" && prev.pays) { const g = await S().getSignataire(prev.pays); if (g && g.email === em) id = g.sigId; }
      if (id) { const sg = await S().getSignature(id); if (sg && !nouvelle) montrer(sg.image); }
    } catch (e) {}
  })();
  ov.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-a]"); if (!a) return;
    const k = a.dataset.a;
    if (k === "ann") { ov.remove(); return; }
    if (k === "photo" || k === "dessin") {
      const img = k === "photo" ? await choisirPhoto() : await dessiner();
      if (img) { nouvelle = img; montrer(img); msg(""); }
      return;
    }
    if (k !== "ok") return;
    const t = type(), nom = soi ? String(prev.nom || "") : $("#fcNom").value.trim();
    const pays = soi ? String(prev.pays || "") : (t === "national" || t === "local" ? $("#fcPays").value : "");
    if (!nom) return msg("Écris le nom complet.");
    if (!t) return msg("Choisis le type de coordinateur.");
    if ((t === "national" || t === "local") && !pays) return msg("Choisis le pays.");
    const lieu = !soi && t === "local" ? $("#fcLieu").value.trim() : "", mission = !soi && t === "special" ? $("#fcMission").value.trim() : "";
    if (t === "special" && !mission) return msg("Écris à quoi ce coordinateur est spécialement destiné.");
    if (t === "national" && !soi) {          // un seul coordinateur national par pays
      const autre = Object.keys(adminsData || {}).find((e2) => e2 !== em && (adminsData[e2] || {}).fonction === "national" && (adminsData[e2] || {}).pays === pays);
      if (autre) return msg("Il y a déjà un coordinateur national pour ce pays (" + (adminsData[autre].nom || autre) + "). Change d'abord son type, ou choisis « local ».");
    }
    const besoin = t === "national" && (soi ? !nouvelle : (!prev.sigId && !nouvelle) || ((prev.fonction !== "national" || prev.pays !== pays) && !nouvelle));
    if (soi && !nouvelle) return msg("Choisis d'abord une photo ou dessine ta signature.");
    if (besoin) return msg("Ajoute la signature de ce coordinateur national (photo ou dessin).");
    $("[data-a=ok]").disabled = true; msg("Enregistrement…");
    try {
      let sigId = prev.sigId;
      if (nouvelle) sigId = await S().enregistrerSignature(em, { nom, fonction: t, pays, paysFr: nomPays(PAYS_FR(), pays), paysEn: nomPays(PAYS_EN(), pays), image: nouvelle });
      if (!soi) await S().setCoordProfil(em, { nom, fonction: t, pays, lieu, mission, sigId });
      ov.remove();
      if (opt && opt.apres) opt.apres();
    } catch (e) { $("[data-a=ok]").disabled = false; msg("Impossible d'enregistrer : " + (e.code || e.message)); }
  });
}

/* ---------- Petits textes pour la liste des coordinateurs ---------- */
function resume(d) {
  d = d || {};
  if (!d.fonction) return "Fiche à compléter (type, pays, signature).";
  const p = d.pays ? nomPays(PAYS_FR(), d.pays) : "";
  return [d.nom, TYPES[d.fonction], p, d.fonction === "local" ? d.lieu : "", d.fonction === "special" ? d.mission : ""].filter(Boolean).join(" · ");
}
// Ajoute « ✓ signature » ou « signature manquante » (pour un national, on regarde la signature publiée de son pays).
async function completerResumes(racine, adminsData) {
  for (const el of racine.querySelectorAll("[data-coordres]")) {
    const e = el.dataset.coordres, d = (adminsData || {})[e] || {};
    let ok = !!d.sigId;
    try { if (d.fonction === "national" && d.pays) { const g = await S().getSignataire(d.pays); ok = !!(g && g.email === e && g.sigId); } } catch (x) {}
    if (d.fonction) el.textContent = resume(d) + (ok ? " · ✓ signature" : (d.fonction === "national" ? " · ⚠ signature manquante" : ""));
  }
}
// Carte « Ma signature » : visible pour un coordinateur national (non principal)
function majMaSignature(adminsData, email) {
  const carte = document.getElementById("maSignatureCard"); if (!carte) return;
  const em = String(email || "").toLowerCase(), d = (adminsData || {})[em] || {};
  const veut = d.fonction === "national" && d.pays && !(S().isAdminEmail && S().isAdminEmail(em));
  carte.style.display = veut ? "" : "none"; if (!veut) return;
  carte.querySelector("[data-info]").textContent = "Coordinateur national · " + nomPays(PAYS_FR(), d.pays) + ". Ta signature et ton nom figurent sur les attestations et certificats des étudiants de ton pays.";
  carte._admins = adminsData; const b = carte.querySelector("button");
  if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", () => ouvrirFiche(em, carte._admins, { soi: true, apres: () => majMaSignature(carte._admins, em) })); }
}

window.AbbaCoord = { ouvrirFiche, resume, completerResumes, majMaSignature };
