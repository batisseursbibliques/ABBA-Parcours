/* =========================================================================
   MON PROFIL (onglet Réglages)
   - Identité : prénom, nom, téléphone, WhatsApp, date de naissance, sexe
   - Adresse : pays → (Bénin : département → commune → arrondissement) → quartier ou village → complément
   - Contact : canal et moment préférés, contact d'urgence, église ou assemblée, rappel quotidien
   - Mot de passe, téléchargement des données, demande de suppression du compte
   Les données sensibles vont dans users/{uid}/priv/contact : visibles de la personne, des coordinateurs
   avec le droit « suivi » et de son correcteur (pour pouvoir la retrouver et l'aider).
   ========================================================================= */
import { BENIN_GEO, listePays } from "./geo.js";

const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const S = () => window.AbbaSync;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const todayISO = () => new Date().toISOString().slice(0, 10);
const AUTRE = "__autre__";

const P = { user: null, profil: {}, contact: {}, pays: [], chargement: false, demandeSuppr: null };

function ageDe(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const b = new Date(iso + "T00:00:00"), t = new Date();
  if (isNaN(b.getTime()) || b > t || b.getFullYear() < 1900) return null;
  return t.getFullYear() - b.getFullYear() - ((t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) ? 1 : 0);
}
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;

function html() {
  const c = P.contact || {}, pr = P.profil || {};
  const prenom = pr.prenomSaisi || (pr.nom || "").split(" ")[0] || "";
  const nomFam = pr.nomFamille || (pr.nom || "").split(" ").slice(1).join(" ") || "";
  const pays = c.pays || "BJ";
  const sexes = [["", T("— choisir —", "— choose —")], ["M", T("Homme", "Man")], ["F", T("Femme", "Woman")]];
  const canaux = [["appel", T("Appel téléphonique", "Phone call")], ["whatsapp", "WhatsApp"], ["sms", "SMS"]];
  const moments = [["", T("Peu importe", "Any time")], ["matin", T("Le matin", "In the morning")], ["midi", T("À midi", "At midday")], ["soir", T("Le soir", "In the evening")]];
  return `
  <div class="card settings-card" id="profilCard">
    <p class="eyebrow">${T("Mon profil", "My profile")}</p>
    <p class="settings-hint">${T("Ces informations sont visibles seulement par toi, par les coordinateurs chargés du suivi et par ton correcteur. Elles servent à te retrouver et à t'aider si tu as des difficultés à suivre le Parcours.", "This information is visible only to you, to the coordinators in charge of follow-up and to your corrector. It is used to find you and help you if you have difficulty following the Course.")}</p>

    <p class="pf-sub">${T("Identité", "Identity")}</p>
    <label class="field"><span>${T("Prénom", "First name")}</span><input type="text" id="pf-prenom" value="${esc(prenom)}" autocomplete="given-name"></label>
    <label class="field"><span>${T("Nom de famille", "Last name")}</span><input type="text" id="pf-nom" value="${esc(nomFam)}" autocomplete="family-name"></label>
    <label class="field"><span>${T("Téléphone", "Phone")}</span><input type="tel" id="pf-tel" value="${esc(pr.telephone || "")}" autocomplete="tel" placeholder="+229 01 …"></label>
    <label class="field"><span>${T("Numéro WhatsApp (s'il est différent)", "WhatsApp number (if different)")}</span><input type="tel" id="pf-whatsapp" value="${esc(c.whatsapp || "")}" placeholder="+229 01 …"></label>
    <label class="field"><span>${T("Date de naissance", "Date of birth")}</span><input type="date" id="pf-naissance" value="${esc(c.naissance || "")}" max="${todayISO()}"></label>
    <label class="field"><span>${T("Sexe", "Sex")}</span><select id="pf-sexe" class="text-input">${sexes.map(([v, l]) => opt(v, l, (c.sexe || "") === v)).join("")}</select></label>

    <p class="pf-sub">${T("Où habites-tu ?", "Where do you live?")}</p>
    <label class="field"><span>${T("Pays", "Country")}</span><select id="pf-pays" class="text-input">${P.pays.map((x) => opt(x.code, x.nom, x.code === pays)).join("")}</select></label>
    <div id="pf-geo-bj" style="display:${pays === "BJ" ? "" : "none"};">
      <label class="field"><span>${T("Département", "Department")}</span><select id="pf-dep" class="text-input"></select></label>
      <label class="field"><span>${T("Commune", "Commune")}</span><select id="pf-com" class="text-input"></select></label>
      <label class="field"><span>${T("Arrondissement", "Arrondissement")}</span><select id="pf-arr" class="text-input"></select></label>
      <label class="field" id="pf-arr-libre-box" style="display:none;"><span>${T("Écris ton arrondissement", "Write your arrondissement")}</span><input type="text" id="pf-arr-libre" value="${esc(c.arrondissement || "")}"></label>
    </div>
    <div id="pf-geo-autre" style="display:${pays === "BJ" ? "none" : ""};">
      <label class="field"><span>${T("Région, province ou État", "Region, province or state")}</span><input type="text" id="pf-region" value="${esc(c.region || "")}"></label>
      <label class="field"><span>${T("Ville", "City")}</span><input type="text" id="pf-ville" value="${esc(c.ville || "")}"></label>
    </div>
    <label class="field"><span>${T("Quartier ou village", "Neighborhood or village")}</span><input type="text" id="pf-quartier" value="${esc(c.quartier || "")}"></label>
    <label class="field"><span>${T("Complément d'adresse (maison, numéro de carré, nom du propriétaire, repère connu…)", "Address details (house, plot number, owner's name, known landmark…)")}</span><textarea id="pf-complement" class="text-input" rows="3">${esc(c.complement || "")}</textarea></label>

    <p class="pf-sub">${T("Comment te joindre", "How to reach you")}</p>
    <label class="field"><span>${T("Canal préféré", "Preferred channel")}</span><select id="pf-canal" class="text-input">${canaux.map(([v, l]) => opt(v, l, (c.canal || "appel") === v)).join("")}</select></label>
    <label class="field"><span>${T("Meilleur moment pour te joindre", "Best time to reach you")}</span><select id="pf-moment" class="text-input">${moments.map(([v, l]) => opt(v, l, (c.moment || "") === v)).join("")}</select></label>
    <label class="field"><span>${T("Église ou assemblée que tu fréquentes", "Church or assembly you attend")}</span><input type="text" id="pf-eglise" value="${esc(c.eglise || "")}"></label>

    <p class="pf-sub">${T("Contact d'urgence", "Emergency contact")}</p>
    <p class="settings-hint">${T("Une personne proche à prévenir si on n'arrive plus à te joindre.", "A close person to contact if you can no longer be reached.")}</p>
    <label class="field"><span>${T("Nom", "Name")}</span><input type="text" id="pf-urg-nom" value="${esc(c.urgenceNom || "")}"></label>
    <label class="field"><span>${T("Lien avec toi (conjoint, parent, frère, ami…)", "Relationship (spouse, parent, brother, friend…)")}</span><input type="text" id="pf-urg-lien" value="${esc(c.urgenceLien || "")}"></label>
    <label class="field"><span>${T("Téléphone", "Phone")}</span><input type="tel" id="pf-urg-tel" value="${esc(c.urgenceTel || "")}"></label>

    <p class="pf-sub">${T("Rappel quotidien", "Daily reminder")}</p>
    <label class="fm-check"><input type="checkbox" id="pf-rappel-on"${c.rappelActif ? " checked" : ""}><span>${T("Me rappeler de faire ma journée", "Remind me to do my day")}</span></label>
    <label class="field"><span>${T("Heure du rappel", "Reminder time")}</span><input type="time" id="pf-rappel-heure" value="${esc(c.heureRappel || "20:00")}"></label>
    <p class="settings-hint">${T("Le rappel s'affiche quand l'application est ouverte sur ton appareil.", "The reminder is shown when the app is open on your device.")}</p>

    <p class="auth-error" id="pf-err"></p>
    <p class="auth-ok" id="pf-ok"></p>
    <button class="btn-primary" id="pf-save" type="button">${T("Enregistrer mon profil", "Save my profile")}</button>
  </div>

  <div class="card settings-card" id="pwCard">
    <p class="eyebrow">${T("Mot de passe", "Password")}</p>
    <label class="field"><span>${T("Mot de passe actuel", "Current password")}</span><input type="password" id="pw-actuel" autocomplete="current-password"></label>
    <label class="field"><span>${T("Nouveau mot de passe (6 caractères minimum)", "New password (6 characters minimum)")}</span><input type="password" id="pw-nouveau" autocomplete="new-password"></label>
    <p class="auth-error" id="pw-err"></p>
    <p class="auth-ok" id="pw-ok"></p>
    <button class="btn-secondary" id="pw-save" type="button">${T("Changer mon mot de passe", "Change my password")}</button>
  </div>

  <div class="card settings-card" id="dataCard">
    <p class="eyebrow">${T("Mes données", "My data")}</p>
    <p class="settings-hint">${T("Tu peux télécharger toutes les données que le Parcours garde sur toi. Tu peux aussi demander la suppression de ton compte : un coordinateur la traitera.", "You can download all the data the Course keeps about you. You can also ask for your account to be deleted: a coordinator will process it.")}</p>
    <button class="btn-secondary" id="data-export" type="button">${T("Télécharger mes données", "Download my data")}</button>
    <div id="data-suppr" style="margin-top:12px;"></div>
    <p class="auth-error" id="data-err"></p>
  </div>`;
}

function remplirGeo() {
  const c = P.contact || {};
  const dep = $("pf-dep"), com = $("pf-com"), arr = $("pf-arr"), libre = $("pf-arr-libre-box"), libreIn = $("pf-arr-libre");
  if (!dep) return;
  const deps = Object.keys(BENIN_GEO);
  dep.innerHTML = opt("", T("— choisir —", "— choose —"), !c.departement) + deps.map((d) => opt(d, d, d === c.departement)).join("");
  const majCommunes = (garder) => {
    const d = dep.value, communes = d ? Object.keys(BENIN_GEO[d]) : [];
    com.innerHTML = opt("", T("— choisir —", "— choose —"), true) + communes.map((x) => opt(x, x, garder && x === c.commune)).join("");
    majArr(garder);
  };
  const majArr = (garder) => {
    const d = dep.value, k = com.value, liste = d && k ? BENIN_GEO[d][k] : [];
    if (!d || !k) { arr.innerHTML = opt("", T("— choisis d'abord la commune —", "— choose the commune first —"), true); libre.style.display = "none"; return; }
    const enListe = garder && liste.includes(c.arrondissement);
    arr.innerHTML = opt("", T("— choisir —", "— choose —"), !c.arrondissement || !garder)
      + liste.map((a) => opt(a, a, garder && a === c.arrondissement)).join("")
      + opt(AUTRE, T("Autre (je l'écris)", "Other (I write it)"), garder && !!c.arrondissement && !enListe);
    if (!liste.length) { arr.value = AUTRE; }
    libre.style.display = arr.value === AUTRE ? "" : "none";
    if (arr.value !== AUTRE) libreIn.value = "";
  };
  dep.addEventListener("change", () => majCommunes(false));
  com.addEventListener("change", () => majArr(false));
  arr.addEventListener("change", () => { libre.style.display = arr.value === AUTRE ? "" : "none"; });
  dep.value = c.departement || "";
  majCommunes(true);
  if (c.commune) { com.value = c.commune; majArr(true); }
}

function surPays() {
  const bj = $("pf-pays").value === "BJ";
  $("pf-geo-bj").style.display = bj ? "" : "none";
  $("pf-geo-autre").style.display = bj ? "none" : "";
}

async function enregistrer() {
  const err = $("pf-err"), ok = $("pf-ok"); err.textContent = ""; ok.textContent = "";
  const v = (id) => ($(id) ? $(id).value.trim() : "");
  const prenom = v("pf-prenom"), nom = v("pf-nom"), tel = v("pf-tel");
  if (prenom.length < 2 || nom.length < 2) { err.textContent = T("Écris ton prénom et ton nom.", "Write your first name and last name."); return; }
  if (tel.replace(/\D/g, "").length < 8) { err.textContent = T("Numéro de téléphone invalide (au moins 8 chiffres).", "Invalid phone number (at least 8 digits)."); return; }
  const naiss = v("pf-naissance");
  if (naiss) {
    const a = ageDe(naiss);
    if (a === null) { err.textContent = T("Date de naissance invalide.", "Invalid date of birth."); return; }
    if (a < 15) { err.textContent = T("Le Parcours est ouvert à partir de 15 ans.", "The Course is open from age 15."); return; }
  }
  const pays = $("pf-pays").value;
  const paysNom = ($("pf-pays").selectedOptions[0] || {}).text || pays;
  const contact = {
    naissance: naiss, sexe: v("pf-sexe"), whatsapp: v("pf-whatsapp"),
    pays, paysNom, quartier: v("pf-quartier"), complement: v("pf-complement"),
    canal: v("pf-canal"), moment: v("pf-moment"), eglise: v("pf-eglise"),
    urgenceNom: v("pf-urg-nom"), urgenceLien: v("pf-urg-lien"), urgenceTel: v("pf-urg-tel"),
    rappelActif: $("pf-rappel-on").checked, heureRappel: v("pf-rappel-heure") || "20:00",
  };
  if (pays === "BJ") {
    contact.departement = v("pf-dep"); contact.commune = v("pf-com");
    contact.arrondissement = $("pf-arr").value === AUTRE ? v("pf-arr-libre") : v("pf-arr");
    contact.region = ""; contact.ville = "";
  } else {
    contact.region = v("pf-region"); contact.ville = v("pf-ville");
    contact.departement = ""; contact.commune = ""; contact.arrondissement = "";
  }
  if (contact.rappelActif && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) {} }
  const btn = $("pf-save"); btn.disabled = true;
  try {
    const r = await S().saveProfil(P.user.uid, { prenom, nom, telephone: tel }, contact);
    P.contact = { ...P.contact, ...contact }; P.profil = { ...P.profil, nom: r.nom, prenomSaisi: prenom, nomFamille: nom, telephone: r.telephone, prenom: "" };
    window.dispatchEvent(new CustomEvent("abba:profil-modifie", { detail: { nom: r.nom, telephone: r.telephone } }));
    ok.textContent = T("Profil enregistré. Merci !", "Profile saved. Thank you!");
  } catch (e) {
    console.error("profil:", e);
    err.textContent = T("Impossible d'enregistrer pour le moment. Vérifie ta connexion et réessaie.", "Unable to save right now. Check your connection and try again.");
  } finally { btn.disabled = false; }
}

async function changerMotDePasse() {
  const err = $("pw-err"), ok = $("pw-ok"); err.textContent = ""; ok.textContent = "";
  const a = $("pw-actuel").value, n = $("pw-nouveau").value;
  if (!a) { err.textContent = T("Écris ton mot de passe actuel.", "Write your current password."); return; }
  if (n.length < 6) { err.textContent = T("Le nouveau mot de passe doit faire au moins 6 caractères.", "The new password must be at least 6 characters long."); return; }
  const btn = $("pw-save"); btn.disabled = true;
  try {
    await S().changePassword(a, n);
    $("pw-actuel").value = ""; $("pw-nouveau").value = "";
    ok.textContent = T("Mot de passe modifié.", "Password changed.");
  } catch (e) {
    const code = (e && e.code) || "";
    err.textContent = (code.includes("wrong-password") || code.includes("invalid-credential"))
      ? T("Le mot de passe actuel est incorrect.", "The current password is incorrect.")
      : code.includes("too-many-requests") ? T("Trop de tentatives. Patiente quelques minutes.", "Too many attempts. Wait a few minutes.")
      : code.includes("requires-recent-login") ? T("Reconnecte-toi puis réessaie.", "Log in again and retry.")
      : T("Impossible de changer le mot de passe pour le moment.", "Unable to change the password right now.");
  } finally { btn.disabled = false; }
}

async function exporter() {
  const err = $("data-err"); err.textContent = "";
  try {
    const d = await S().exportMyData(P.user.uid);
    const blob = new Blob([JSON.stringify(d, (k, v) => (v && typeof v === "object" && typeof v.toDate === "function") ? v.toDate().toISOString() : v, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "mes-donnees-parcours.json"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (e) { err.textContent = T("Impossible de préparer tes données pour le moment.", "Unable to prepare your data right now."); }
}

function rendreSuppr() {
  const box = $("data-suppr"); if (!box) return;
  if (P.demandeSuppr) {
    box.innerHTML = `<p class="settings-hint">${T("Ta demande de suppression est enregistrée. Un coordinateur va supprimer ton compte et tes données.", "Your deletion request is recorded. A coordinator will delete your account and your data.")}</p>
      <button class="btn-secondary" id="suppr-annuler" type="button">${T("Annuler ma demande", "Cancel my request")}</button>`;
    $("suppr-annuler").addEventListener("click", async () => {
      try { await S().cancelDeletionRequest(P.user.uid); P.demandeSuppr = null; rendreSuppr(); } catch (e) { $("data-err").textContent = T("Impossible d'annuler pour le moment.", "Unable to cancel right now."); }
    });
  } else {
    box.innerHTML = `<button class="btn-secondary" id="suppr-demander" type="button" style="color:var(--brick);">${T("Demander la suppression de mon compte", "Request deletion of my account")}</button>`;
    $("suppr-demander").addEventListener("click", async () => {
      if (!confirm(T("Demander la suppression de ton compte et de toutes tes données ? Cette demande sera traitée par un coordinateur et ne pourra plus être annulée une fois ton compte supprimé.", "Request deletion of your account and all your data? A coordinator will process this request, and it cannot be undone once your account is deleted."))) return;
      try { await S().requestDeletion(P.user.uid, (P.profil && P.profil.nom) || P.user.displayName, P.user.email); P.demandeSuppr = { status: "pending" }; rendreSuppr(); }
      catch (e) { $("data-err").textContent = T("Impossible d'envoyer la demande pour le moment.", "Unable to send the request right now."); }
    });
  }
}

async function rendre() {
  const host = $("profilHost"); if (!host || !P.user || !S()) return;
  if (P.chargement) return; P.chargement = true;
  try {
    const [pr, ct, dr] = await Promise.all([
      S().getUserProfile(P.user.uid).catch(() => ({})),
      S().getContact(P.user.uid).catch(() => ({})),
      S().getDeletionRequest(P.user.uid).catch(() => null),
    ]);
    P.profil = pr || {}; P.contact = ct || {}; P.demandeSuppr = dr;
    P.pays = listePays(EN() ? "en" : "fr");
    host.innerHTML = html();
    remplirGeo();
    $("pf-pays").addEventListener("change", surPays);
    $("pf-save").addEventListener("click", enregistrer);
    $("pw-save").addEventListener("click", changerMotDePasse);
    $("data-export").addEventListener("click", exporter);
    rendreSuppr();
    if (window.AbbaUI && window.AbbaUI.addPasswordEyes) window.AbbaUI.addPasswordEyes($("pwCard"));
  } finally { P.chargement = false; }
}

/* ----- Rappel quotidien : affiché quand l'application est ouverte ----- */
async function verifierRappel() {
  if (!P.user) return;
  let c = P.contact;
  if (!c || c.__vide) return;
  if (!c.rappelActif || !c.heureRappel) return;
  const now = new Date(), [h, m] = String(c.heureRappel).split(":").map(Number);
  if (isNaN(h)) return;
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + (m || 0)) return;
  const cle = "abba-rappel-" + P.user.uid, dernier = localStorage.getItem(cle);
  if (dernier === todayISO()) return;
  localStorage.setItem(cle, todayISO());
  const msg = T("C'est l'heure de ta journée : ta déclaration et tes habitudes t'attendent.", "It's time for your day: your declaration and your habits are waiting for you.");
  try { if ("Notification" in window && Notification.permission === "granted") { new Notification("ABBA Parcours", { body: msg }); } } catch (e) {}
  if (!$("rappelBanniere")) {
    const b = document.createElement("div"); b.id = "rappelBanniere";
    b.style.cssText = "position:fixed;left:12px;right:12px;bottom:76px;z-index:9999;background:#2b2a26;color:#fff;padding:12px 14px;border-radius:10px;font-size:13.5px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;";
    b.innerHTML = `<span style="flex:1">⏰ ${esc(msg)}</span><button type="button" style="background:#fff;color:#2b2a26;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;">${T("Ouvrir", "Open")}</button><button type="button" aria-label="${T("Fermer", "Close")}" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">×</button>`;
    const [bo, bx] = b.querySelectorAll("button");
    bo.addEventListener("click", () => { const t = document.querySelector('.tab[data-tab="declaration"]'); if (t) t.click(); b.remove(); });
    bx.addEventListener("click", () => b.remove());
    document.body.appendChild(b);
  }
}

const surConnexion = async (u) => {
  P.user = u || null; P.contact = { __vide: true }; P.profil = {};
  if (!P.user) return;
  try { P.contact = await S().getContact(P.user.uid) || {}; } catch (e) { P.contact = {}; }
  verifierRappel();
};
if (S() && S().watchAuth) S().watchAuth(surConnexion);
else window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth(surConnexion); });
setInterval(verifierRappel, 60000);
window.addEventListener("abba:reglages-ouvert", rendre);
window.addEventListener("abba:profil-modifie", () => { P.contact = P.contact || {}; setTimeout(verifierRappel, 500); });


/* ----- Fiche de contact (coordinateurs avec le droit « suivi » et correcteur lié à l'élève) ----- */
const telLien = (n) => { const d = String(n || "").replace(/[^\d+]/g, ""); return d ? `<a href="tel:${esc(d)}">${esc(n)}</a>` : ""; };
const waLien = (n) => { const raw = String(n || "").trim(); const d = raw.replace(/\D/g, ""); if (!d) return ""; const intl = raw.startsWith("+") || raw.startsWith("00"); return intl ? `<a href="https://wa.me/${esc(d.replace(/^00/, ""))}" target="_blank" rel="noopener">${esc(raw)}</a>` : esc(raw); };
async function ouvrirFiche(uid, nom) {
  const old = $("ficheOverlay"); if (old) old.remove();
  const ov = document.createElement("div"); ov.id = "ficheOverlay"; ov.className = "fiche-overlay";
  ov.innerHTML = `<div class="fiche-box"><p class="settings-hint">${T("Chargement…", "Loading…")}</p></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  const box = ov.firstElementChild;
  let c = null, pr = {};
  try { c = await S().getContact(uid); } catch (e) { c = null; }
  try { pr = (await S().getUserProfile(uid)) || {}; } catch (e) { pr = {}; }
  const ligne = (label, val) => val ? `<div class="fiche-row"><b>${esc(label)}</b><span>${val}</span></div>` : "";
  const canaux = { appel: T("Appel téléphonique", "Phone call"), whatsapp: "WhatsApp", sms: "SMS" };
  const moments = { matin: T("Le matin", "In the morning"), midi: T("À midi", "At midday"), soir: T("Le soir", "In the evening") };
  const titre = esc(nom || pr.nom || "");
  let corps;
  if (!c || !Object.keys(c).length) {
    corps = `<p class="settings-hint">${T("Cette personne n'a pas encore rempli sa fiche de contact.", "This person has not filled in their contact sheet yet.")}</p>` + (pr.telephone ? ligne(T("Téléphone", "Phone"), telLien(pr.telephone)) : "");
  } else {
    const age = ageDe(c.naissance);
    const adresse = [c.quartier, c.arrondissement, c.commune, c.departement, c.ville, c.region, c.paysNom].filter(Boolean).map(esc).join(", ");
    corps = ligne(T("Téléphone", "Phone"), telLien(c.telephone || pr.telephone))
      + ligne("WhatsApp", waLien(c.whatsapp))
      + ligne(T("Joindre par", "Reach by"), esc((canaux[c.canal] || "") + (c.moment ? " — " + (moments[c.moment] || "") : "")))
      + ligne(T("Adresse", "Address"), adresse)
      + ligne(T("Précisions", "Details"), esc(c.complement || ""))
      + ligne(T("Né(e) le", "Born on"), c.naissance ? esc(c.naissance) + (age !== null ? " (" + age + " " + T("ans", "years old") + ")" : "") : "")
      + ligne(T("Église", "Church"), esc(c.eglise || ""))
      + ligne(T("Urgence", "Emergency"), (c.urgenceNom || c.urgenceTel) ? esc([c.urgenceNom, c.urgenceLien && "(" + c.urgenceLien + ")"].filter(Boolean).join(" ")) + (c.urgenceTel ? " — " + telLien(c.urgenceTel) : "") : "")
      + ligne(T("Parent / tuteur", "Parent / guardian"), (c.tuteurNom || c.tuteurTel) ? esc(c.tuteurNom || "") + (c.tuteurTel ? " — " + telLien(c.tuteurTel) : "") : "");
    if (!corps) corps = `<p class="settings-hint">${T("Fiche vide.", "Empty sheet.")}</p>`;
  }
  box.innerHTML = `<h3>📍 ${titre}</h3><p class="settings-hint" style="margin:0 0 8px;">${T("Fiche de contact — pour retrouver et aider cette personne. Confidentiel.", "Contact sheet — to find and help this person. Confidential.")}</p>${corps}<button type="button" class="btn-secondary" id="ficheFermer" style="margin-top:14px;">${T("Fermer", "Close")}</button>`;
  $("ficheFermer").addEventListener("click", () => ov.remove());
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-fiche]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  ouvrirFiche(b.dataset.fiche, b.dataset.nom || "");
}, true);
