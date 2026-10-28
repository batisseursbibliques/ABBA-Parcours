// attestation.js — fabrique l'attestation de module et le certificat de fin de formation, en PDF.
// Tout se passe sur le téléphone de la personne (aucun serveur) : on dessine le document sur une image,
// puis on l'enveloppe dans un PDF A4 paysage. La même fonction sert aux tests (voir `env`).

export const URL_VERIF = "https://batisseursbibliques.org/ABBA-Parcours/verifier.html?n=";
const W = 3508, H = 2480;                                    // A4 paysage à 300 points par pouce
const MARINE = "#1a3b9a", OR = "#c9a227", CREME = "#fbf7ef", ENCRE = "#2b2a28", DOUX = "#5b574f";
const SERIF = "Georgia, 'Noto Serif', 'Times New Roman', serif";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";          // sans 0, O, 1, I : pas de confusion à la lecture

export function nouveauNumero() {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  const c = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
  return `ABBA-P-${c.slice(0, 4)}-${c.slice(4)}`;
}

const MOIS = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
export function dateLongue(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); if (!m) return iso || "";
  const j = Number(m[3]), mois = MOIS[lang === "en" ? "en" : "fr"][Number(m[2]) - 1], an = m[1];
  return lang === "en" ? `${j} ${mois} ${an}` : `${j === 1 ? "1er" : j} ${mois} ${an}`;
}

const TXT = {
  fr: {
    module: { titre: "ATTESTATION DE MODULE", sous: "Parcours Bâtisseur", intro: "ABBA atteste que" },
    parcours: { titre: "CERTIFICAT DE FIN DE FORMATION", sous: "Parcours Bâtisseur · Phase de formation", intro: "ABBA certifie que" },
    corpsModule: (r, d) => [["a accompli avec succès le module"], [`« ${r.titre} »`], [`du Parcours Bâtisseur, validé le ${d}.`]],
    corpsParcours: () => [
      ["a accompli la phase de formation du Parcours Bâtisseur, composée de 14 modules, et l'a menée à son terme."],
      ["Cette phase est la première partie du chemin du Bâtisseur. La seconde, la mise en action, conduit au Certificat du Bâtisseur."],
    ],
    delivre: (d) => `Délivré le ${d}`,
    numero: (n) => `N° ${n}`,
    verif: "Vérifier ce document : scanne le QR code ou va sur batisseursbibliques.org/ABBA-Parcours/verifier.html",
    org: "Alliance des Bâtisseurs Bibliques en Action",
    titreSignataire: "Président Porteur de Vision",
    coordNat: (p) => "Coordinateur national" + (p ? " · " + p : ""),
    scanne: "Scanne pour vérifier",
  },
  en: {
    module: { titre: "MODULE ATTESTATION", sous: "Builder Path (Parcours Bâtisseur)", intro: "ABBA attests that" },
    parcours: { titre: "TRAINING COMPLETION CERTIFICATE", sous: "Builder Path (Parcours Bâtisseur) · Training phase", intro: "ABBA certifies that" },
    corpsModule: (r, d) => [["has successfully completed the module"], [`“${r.titreEn || r.titre}”`], [`of the Builder Path, validated on ${d}.`]],
    corpsParcours: () => [
      ["has completed the training phase of the Builder Path, made up of 14 modules, and brought it to completion."],
      ["This phase is the first part of the Builder’s journey. The second, putting it into action, leads to the Builder’s Certificate."],
    ],
    delivre: (d) => `Issued on ${d}`,
    numero: (n) => `No. ${n}`,
    verif: "Verify this document: scan the QR code or visit batisseursbibliques.org/ABBA-Parcours/verifier.html",
    org: "Alliance des Bâtisseurs Bibliques en Action",
    titreSignataire: "Vision-Bearing President",
    coordNat: (p) => "National Coordinator" + (p ? " · " + p : ""),
    scanne: "Scan to verify",
  },
};

async function poserCachet(ctx, env, cx, cy, diametre, angle) {
  try {
    const img = await env.image("cachet.png"), h = diametre * img.height / img.width;
    ctx.save(); ctx.globalAlpha = 0.84; ctx.globalCompositeOperation = "multiply";
    ctx.translate(cx, cy); ctx.rotate(angle); ctx.drawImage(img, -diametre / 2, -h / 2, diametre, h); ctx.restore();
  } catch (e) {}
}


// Deuxième signature : celle du coordinateur national du pays de l'étudiant (si son pays en a un).
// Le document ne garde que le numéro de la version de signature (rec.sigCoord) ; l'image est relue à l'affichage.
async function chargerCoord(rec, env, lang) {
  let c = rec.coord || null;
  if (!c && rec.sigCoord && env.signature) { try { c = await env.signature(rec.sigCoord); } catch (e) { c = null; } }
  if (!c || !c.image) return null;
  const t = TXT[lang === "en" ? "en" : "fr"], pays = lang === "en" ? (c.paysEn || c.paysFr) : (c.paysFr || c.paysEn);
  return { image: c.image, nom: String(c.nom || ""), titre: t.coordNat(pays || "") };
}
// Dessine un QR (matrice m) sur fond blanc, centré en cx, haut en top ; renvoie sa taille.
function poserQR(ctx, m, cx, top, taille) {
  const n = m.length, cell = Math.floor(taille / (n + 4)), qs = cell * (n + 4), qx = Math.round(cx - qs / 2);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, top, qs, qs); ctx.fillStyle = "#111111";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m[r][k]) ctx.fillRect(qx + (k + 2) * cell, top + (r + 2) * cell, cell, cell);
  return qs;
}
// Un bloc de signature : l'image, un trait, le nom, la fonction.
async function blocSignature(ctx, env, o) {
  try {
    const sig = await env.image(o.src);
    let sw = o.sw, sh = sig.height * sw / sig.width;
    if (sh > sw * 0.5) { sh = sw * 0.5; sw = sig.width * sh / sig.height; }
    ctx.drawImage(sig, o.cx - sw / 2, o.base - sh, sw, sh);
  } catch (e) {}
  ctx.textAlign = "center";
  ctx.strokeStyle = ENCRE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.cx - o.sw / 2 - 20, o.base + 8); ctx.lineTo(o.cx + o.sw / 2 + 20, o.base + 8); ctx.stroke();
  let f = o.f1; do { ctx.font = `bold ${f}px ${SERIF}`; f -= 2; } while (ctx.measureText(o.nom).width > o.sw + 120 && f > 28);
  ctx.fillStyle = ENCRE; ctx.fillText(o.nom, o.cx, o.base + o.f1 + 16);
  let g = o.f2; do { ctx.font = `italic ${g}px ${SERIF}`; g -= 2; } while (ctx.measureText(o.titre).width > o.sw + 160 && g > 26);
  ctx.fillStyle = DOUX; ctx.fillText(o.titre, o.cx, o.base + o.f1 + o.f2 + 30);
}

function lignes(ctx, texte, largeurMax) {            // coupe un texte en lignes qui tiennent dans la largeur
  const mots = texte.split(" "), out = []; let cur = "";
  for (const m of mots) {
    const essai = cur ? cur + " " + m : m;
    if (ctx.measureText(essai).width > largeurMax && cur) { out.push(cur); cur = m; } else cur = essai;
  }
  if (cur) out.push(cur);
  return out;
}

// Mise en page du certificat de fin de formation sur le fond illustré « fond-certificat.jpg » (format 4:3)
async function dessinerCertificatFinal(rec, lang, env, fond) {
  const coord = await chargerCoord(rec, env, lang);
  const t = TXT[lang === "en" ? "en" : "fr"], FW = 3508, FH = Math.round(FW * fond.height / fond.width);
  const c = env.canvas(FW, FH), ctx = c.getContext("2d"), cx = FW / 2;
  ctx.drawImage(fond, 0, 0, FW, FH);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const MAR = "#0b2a6b", BRUN = "#8a6410";
  // bandeau doré : le mot-clé
  ctx.fillStyle = MAR; ctx.font = `bold 128px ${SERIF}`; ctx.fillText(lang === "en" ? "CERTIFICATE" : "CERTIFICAT", cx, 595);
  ctx.font = `bold 104px ${SERIF}`; ctx.fillText(lang === "en" ? "OF COMPLETION OF TRAINING" : "DE FIN DE FORMATION", cx, 905);
  ctx.fillStyle = BRUN; ctx.font = `italic 58px ${SERIF}`; ctx.fillText(lang === "en" ? "Builder Path (Parcours Bâtisseur) · Training phase" : "Parcours Bâtisseur · Phase de formation", cx, 985);
  ctx.strokeStyle = OR; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 420, 1030); ctx.lineTo(cx + 420, 1030); ctx.stroke();
  ctx.fillStyle = DOUX; ctx.font = `italic 62px ${SERIF}`; ctx.fillText(t.parcours.intro, cx, 1108);
  let taille = 150; const nom = String(rec.nom || "").trim();
  do { ctx.font = `bold ${taille}px ${SERIF}`; taille -= 8; } while (ctx.measureText(nom).width > 2500 && taille > 70);
  ctx.fillStyle = MAR; ctx.fillText(nom, cx, 1250);
  const lw = Math.min(ctx.measureText(nom).width + 160, 2700);
  ctx.strokeStyle = OR; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - lw / 2, 1298); ctx.lineTo(cx + lw / 2, 1298); ctx.stroke();
  let y = 1372;
  t.corpsParcours().forEach((p) => {
    ctx.fillStyle = ENCRE; ctx.font = `56px ${SERIF}`;
    lignes(ctx, p[0], 1600).forEach((l) => { ctx.fillText(l, cx, y); y += 76; });
    y += 22;
  });
  // panneau du bas (lisible sur le paysage) : QR, date et numéro, signature
  const pw = 2200, px = Math.round(FW / 2 - pw / 2), py = 2030, ph = 500;
  ctx.fillStyle = "rgba(255,255,255,0.86)"; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = OR; ctx.lineWidth = 4; ctx.strokeRect(px, py, pw, ph);
  const m = await env.qr(URL_VERIF + encodeURIComponent(rec.numero));
  if (!coord) {
    const n = m.length, cell = Math.floor(300 / (n + 4)), qs = cell * (n + 4);
    const qx = px + 40, qy = py + 40;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, qy, qs, qs); ctx.fillStyle = "#111111";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m[r][k]) ctx.fillRect(qx + (k + 2) * cell, qy + (r + 2) * cell, cell, cell);
    ctx.fillStyle = DOUX; ctx.font = `38px ${SERIF}`; ctx.textAlign = "left"; ctx.fillText(t.scanne, qx, qy + qs + 48); ctx.textAlign = "center";
  }
  if (coord) {                       // deux signatures de part et d'autre, QR au milieu, sans cachet (le bas-gauche de l'image reste visible)
    const mid = px + pw / 2;
    ctx.fillStyle = ENCRE; ctx.font = `44px ${SERIF}`; ctx.fillText(t.delivre(dateLongue(rec.date, lang)), mid, py + 52);
    ctx.fillStyle = MAR; ctx.font = `bold 50px ${SERIF}`; ctx.fillText(t.numero(rec.numero), mid, py + 106);
    ctx.fillStyle = DOUX; ctx.font = `32px ${SERIF}`; ctx.fillText(t.org, mid, py + 146);
    const qs2 = poserQR(ctx, m, mid, py + 170, 230);
    ctx.fillStyle = DOUX; ctx.font = `30px ${SERIF}`; ctx.fillText(t.scanne, mid, py + 170 + qs2 + 36);
    const base = py + 318;
    await blocSignature(ctx, env, { src: coord.image, cx: mid - 650, base, sw: 480, nom: coord.nom, titre: coord.titre, f1: 42, f2: 34 });
    await blocSignature(ctx, env, { src: "signature.png", cx: mid + 650, base, sw: 480, nom: "Paul HOUEKIN", titre: t.titreSignataire, f1: 42, f2: 34 });
  } else {
    const mx = px + pw / 2 - 40;
    ctx.fillStyle = ENCRE; ctx.font = `58px ${SERIF}`; ctx.fillText(t.delivre(dateLongue(rec.date, lang)), mx, py + 190);
    ctx.fillStyle = MAR; ctx.font = `bold 60px ${SERIF}`; ctx.fillText(t.numero(rec.numero), mx, py + 270);
    ctx.fillStyle = DOUX; ctx.font = `42px ${SERIF}`; ctx.fillText(t.org, mx, py + 335);
    try {
      const sig = await env.image("signature.png"), sw = 520, sh = sig.height * sw / sig.width, sx = px + pw - 70 - sw, base = py + 285;
      ctx.drawImage(sig, sx, base - sh, sw, sh);
      ctx.strokeStyle = ENCRE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 15, base + 6); ctx.lineTo(sx + sw + 15, base + 6); ctx.stroke();
      ctx.fillStyle = ENCRE; ctx.font = `bold 46px ${SERIF}`; ctx.fillText("Paul HOUEKIN", sx + sw / 2, base + 58);
      ctx.fillStyle = DOUX; ctx.font = `italic 38px ${SERIF}`; ctx.fillText(t.titreSignataire, sx + sw / 2, base + 104);
    } catch (e) {}
  }
  ctx.fillStyle = DOUX; ctx.font = `33px ${SERIF}`; ctx.fillText(t.verif, px + pw / 2, py + ph - 20);
  return c;
}

export async function dessiner(rec, lang, env) {
  if (rec.type === "parcours") {   // fond illustré propre au certificat final, s'il est présent
    let fond = null; try { fond = await env.image("fond-certificat.jpg"); } catch (e) {}
    if (fond) return dessinerCertificatFinal(rec, lang, env, fond);
  }
  const t = TXT[lang === "en" ? "en" : "fr"], estParcours = rec.type === "parcours", bloc = estParcours ? t.parcours : t.module;
  const coord = await chargerCoord(rec, env, lang);
  const c = env.canvas(W, H), ctx = c.getContext("2d");
  const centre = W / 2;
  let fondOk = false;                                     // décor : fond illustré (cadre bleu et or, vagues, livre ouvert)
  for (const nomFond of (estParcours ? ["fond-certificat.jpg", "fond.jpg"] : ["fond.jpg"])) {   // le certificat final peut avoir son propre fond
    try { ctx.drawImage(await env.image(nomFond), 0, 0, W, H); fondOk = true; break; } catch (e) {}
  }
  if (!fondOk) {                                          // repli si l'image du fond ne se charge pas : cadre simple
    ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = MARINE; ctx.lineWidth = 16; ctx.strokeRect(90, 90, W - 180, H - 180);
    ctx.strokeStyle = OR; ctx.lineWidth = 6; ctx.strokeRect(135, 135, W - 270, H - 270);
  }
  // logo
  try { const logo = await env.image("logo.png"); ctx.drawImage(logo, centre - 150, 190, 300, 300); } catch (e) {}
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MARINE; ctx.font = `bold ${estParcours ? 124 : 138}px ${SERIF}`; ctx.fillText(bloc.titre, centre, 660);
  ctx.fillStyle = OR; ctx.font = `64px ${SERIF}`; ctx.fillText(bloc.sous, centre, 750);
  ctx.strokeStyle = OR; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(centre - 520, 805); ctx.lineTo(centre + 520, 805); ctx.stroke();
  ctx.fillStyle = DOUX; ctx.font = `italic 64px ${SERIF}`; ctx.fillText(bloc.intro, centre, 930);
  // nom (réduit si trop long)
  let taille = 190; const nom = String(rec.nom || "").trim();
  do { ctx.font = `bold ${taille}px ${SERIF}`; taille -= 8; } while (ctx.measureText(nom).width > 2900 && taille > 70);
  ctx.fillStyle = MARINE; ctx.fillText(nom, centre, 1125);
  const lw = Math.min(ctx.measureText(nom).width + 160, 3000);
  ctx.strokeStyle = OR; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(centre - lw / 2, 1175); ctx.lineTo(centre + lw / 2, 1175); ctx.stroke();
  // corps du texte
  const dateTxt = dateLongue(rec.date, lang);
  const paras = estParcours ? t.corpsParcours() : t.corpsModule(rec, dateTxt);
  let y = 1310;
  paras.forEach((p, i) => {
    const gras = !estParcours && i === 1;
    ctx.fillStyle = gras ? MARINE : ENCRE; ctx.font = `${gras ? "bold 84px" : "66px"} ${SERIF}`;
    lignes(ctx, p[0], 2600).forEach((l) => { ctx.fillText(l, centre, y); y += gras ? 108 : 92; });
    if (estParcours) y += 26;
  });
  // pied : QR, date et numéro, signature
  const lienVerif = URL_VERIF + encodeURIComponent(rec.numero);
  const m = await env.qr(lienVerif), n = m.length, cell = Math.floor(330 / (n + 4)), taille2 = cell * (n + 4);
  if (!coord) {
    const qx = 380, qy = 1790;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(qx, qy, taille2, taille2);
    ctx.fillStyle = "#111111";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m[r][k]) ctx.fillRect(qx + (k + 2) * cell, qy + (r + 2) * cell, cell, cell);
    ctx.fillStyle = DOUX; ctx.font = `42px ${SERIF}`; ctx.textAlign = "left"; ctx.fillText(t.scanne, qx, qy + taille2 + 55);
    ctx.textAlign = "center";
  }
  ctx.textAlign = "center";
  if (coord) {                       // deux signatures de part et d'autre, QR au milieu, sans cachet
    ctx.fillStyle = ENCRE; ctx.font = `50px ${SERIF}`; ctx.fillText(t.org, centre, 1650);
    ctx.fillStyle = MARINE; ctx.font = `bold 58px ${SERIF}`; ctx.fillText(t.numero(rec.numero), centre, 1722);
    const qs2 = poserQR(ctx, m, centre, 1760, 320);
    ctx.fillStyle = DOUX; ctx.font = `36px ${SERIF}`; ctx.fillText(t.scanne, centre, 1760 + qs2 + 52);
    const base = 2085;
    await blocSignature(ctx, env, { src: coord.image, cx: centre - 760, base, sw: 560, nom: coord.nom, titre: coord.titre, f1: 50, f2: 42 });
    await blocSignature(ctx, env, { src: "signature.png", cx: centre + 760, base, sw: 560, nom: "Paul HOUEKIN", titre: t.titreSignataire, f1: 50, f2: 42 });
  } else {
    ctx.fillStyle = ENCRE; ctx.font = `60px ${SERIF}`;
    ctx.fillText(estParcours ? t.delivre(dateLongue(rec.date, lang)) : t.org, centre, 2030);
    ctx.fillStyle = MARINE; ctx.font = `bold 62px ${SERIF}`; ctx.fillText(t.numero(rec.numero), centre, 2115);
    if (estParcours) { ctx.fillStyle = DOUX; ctx.font = `44px ${SERIF}`; ctx.fillText(t.org, centre, 2185); }
    // signature
    try {
      const sig = await env.image("signature.png"), sw = 640, sh = sig.height * sw / sig.width, sx = W - 400 - sw, base = 2090;
      ctx.drawImage(sig, sx, base - sh, sw, sh);
      ctx.strokeStyle = ENCRE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 20, base + 8); ctx.lineTo(sx + sw + 20, base + 8); ctx.stroke();
      ctx.fillStyle = ENCRE; ctx.font = `bold 52px ${SERIF}`; ctx.fillText("Paul HOUEKIN", sx + sw / 2, base + 70);
      ctx.fillStyle = DOUX; ctx.font = `italic 44px ${SERIF}`; ctx.fillText(t.titreSignataire, sx + sw / 2, base + 124);
    } catch (e) {}
  }
  ctx.fillStyle = DOUX; ctx.font = `38px ${SERIF}`; ctx.fillText(t.verif, centre, H - 190);
  return c;
}

// PDF minimal : une page A4 paysage contenant l'image JPEG
export function jpegVersPdf(jpeg, wPx, hPx) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const add = (x) => { const u = typeof x === "string" ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, tete, flux) => {
    offs[n] = len; add(`${n} 0 obj\n${tete}\n`);
    if (flux) { add("stream\n"); add(flux); add("\nendstream\n"); }
    add("endobj\n");
  };
  const PW = 842, PH = Math.round(842 * hPx / wPx);   // A4 paysage (842 x 595) ou 4:3 selon le fond
  add("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  const contenu = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${contenu.length} >>`, contenu);
  const xref = len;
  add(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) add(String(offs[i]).padStart(10, "0") + " 00000 n \n");
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let p = 0; parts.forEach((u) => { out.set(u, p); p += u.length; });
  return out;
}

export async function creerPdf(rec, lang, env) {
  const c = await dessiner(rec, lang, env);
  const jpeg = await env.jpeg(c);
  return jpegVersPdf(jpeg, c.width, c.height);
}
export const nomFichier = (rec) => (rec.type === "parcours" ? "Certificat-fin-de-formation-" : `Attestation-module-${String(rec.mid || "").replace(/^m/, "")}-`) + rec.numero + ".pdf";

/* ---------- Environnement du navigateur ---------- */
function chargerScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("script " + src)); document.head.appendChild(s); });
}
export const envNavigateur = {
  // lit la version de signature : par l'application (AbbaSync) ou, sur la page certificat.html, par la fonction qu'elle fournit
  signature: (id) => (globalThis.AbbaSync && globalThis.AbbaSync.getSignature ? globalThis.AbbaSync.getSignature(id) : globalThis.__abbaGetSignature ? globalThis.__abbaGetSignature(id) : null),
  canvas: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
  image: (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("image " + src)); i.src = src; }),
  jpeg: (c) => new Promise((ok, ko) => c.toBlob((b) => (b ? b.arrayBuffer().then((x) => ok(new Uint8Array(x))) : ko(new Error("jpeg"))), "image/jpeg", 0.92)),
  qr: async (texte) => {
    if (!globalThis.qrcode) await chargerScript("vendor/qrcode.js");
    const q = globalThis.qrcode(0, "M"); q.addData(texte); q.make();
    const n = q.getModuleCount(); return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, k) => q.isDark(r, k)));
  },
};

const estAppAndroid = () => !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
// L'application Android ne sait pas enregistrer un fichier : on ouvre la page du document dans le navigateur du téléphone.
// (Adresse « web.app » volontairement hors de la liste des adresses gardées dans l'application : Android l'ouvre alors dans le navigateur.)
export const urlPageDocument = (rec, lang) => `https://abba-g.web.app/ABBA-Parcours/certificat.html?n=${encodeURIComponent(rec.numero)}&lang=${lang === "en" ? "en" : "fr"}`;
export async function telecharger(rec, lang) {
  if (estAppAndroid()) { location.href = urlPageDocument(rec, lang); return "externe"; }
  return telechargerFichier(rec, lang);
}
export async function telechargerFichier(rec, lang) {   // enregistre le PDF (navigateur)
  const pdf = await creerPdf(rec, lang, envNavigateur);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nomFichier(rec);
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return "telecharge";
}
