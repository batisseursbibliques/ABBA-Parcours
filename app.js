/* ============================================================
   PARCOURS BÂTISSEUR
   Utilise le même compte et la même base de données qu'ABBA Life.
   Voir sync.js pour la couche Firebase.
   ============================================================ */

// Liste par défaut des 14 modules — identique à celle d'ABBA Life.
// Les coordinateurs peuvent la modifier depuis cette app ; le changement
// est visible partout (même document partagé).
const DEFAULT_MODULES = [
  { id: "m1", titre: "M1 — Disciple de Christ" },
  { id: "m2", titre: "M2 — Guérir des Blessures de l'Âme" },
  { id: "m3", titre: "M3 — Cure d'Âme Personnelle" },
  { id: "m4", titre: "M4 — Aimer" },
  { id: "m5", titre: "M5 — Bâtir le Caractère" },
  { id: "m6", titre: "M6 — Le Saint-Esprit" },
  { id: "m7", titre: "M7 — Victoire par la Prière" },
  { id: "m8", titre: "M8" },
  { id: "m9", titre: "M9" },
  { id: "m10", titre: "M10" },
  { id: "m11", titre: "M11" },
  { id: "m12", titre: "M12" },
  { id: "m13", titre: "M13" },
  { id: "m14", titre: "M14" },
];
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
function escapeAttr(s) {
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

let CURRENT_USER = null;
let CURRENT_PROFILE = {};
let IS_ADMIN = false;
let RIGHTS = {};
let ADMINS_DATA = {};
const DROITS_LABELS = { apercu: "Aperçu des cours", suivi: "Suivi des étudiants", corrections: "Corrections et correcteurs", presences: "Séances et présences", binomes: "Binômes", paiements: "Paiements" };
let MODULES_CONFIG = [];
let MODULES_TERMINES = [];
let EDIT_MODULES = [];
let ZONES_CONFIG = [];
let MY_ZONES = {};
let EDIT_ZONES = [];
let unsubZonesConfig = null;
let unsubMyZones = null;
let unsubDimensions = {};
let MY_DIMENSIONS = {};
let unsubSeances = null;
let SEANCES = [];
let unsubProfilFormation = null;
let MY_PROFIL = {};
let LAST_COORD_ROWS = [];

const STATUTS_OBJECTIF = [
  { valeur: "pas_commence", label: "Pas commencé" },
  { valeur: "en_cours", label: "En cours" },
  { valeur: "atteint", label: "Atteint" },
];

const DIMENSIONS_KEYS = [
  { key: "esprit", titre: "Esprit", icone: "🙏" },
  { key: "psychologie", titre: "Psychologie", icone: "🧠" },
  { key: "physique", titre: "Physique", icone: "💪" },
  { key: "subsistance", titre: "Subsistance", icone: "🏠" },
  { key: "education", titre: "Éducation", icone: "📚" },
  { key: "profession", titre: "Profession", icone: "💼" },
  { key: "finance", titre: "Finance", icone: "💰" },
  { key: "societe", titre: "Société", icone: "🤝" },
];

const DEFAULT_ZONES = [
  { id: "z1", titre: "Émotions" },
  { id: "z2", titre: "Personnalité" },
  { id: "z3", titre: "Pensée" },
  { id: "z4", titre: "Décision" },
  { id: "z5", titre: "Habitudes" },
  { id: "z6", titre: "Manier son caractère par son esprit" },
];
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthLabel(mk) {
  const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const [y, m] = mk.split("-").map(Number);
  return `${window.I18N ? window.I18N.t(MOIS[m-1]) : MOIS[m-1]} ${y}`;
}
let unsubAdmins = null;
let LAST_ADMIN_EMAILS = [];
const COORD_OPEN = new Set();
let unsubModulesConfig = null;
let unsubParcours = null;
let unsubBinome = null;
let unsubGeste = null;
let MY_BINOME = null;
let MY_GESTE = "";

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupTaille();
  setupInstallCard();
  setupDiagnostic();
  setupProtection();
  setupTabs();
  setupAuthScreen();
  setupModulesEditor();
  setupCoordModules();
  setupBinome();
  setupZones();
  setupSeances();
  setupProfilFormation();
  setupResume();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }

  window.AbbaSync.watchAuth(onAuthChanged);
});

/* ============================================================
   AUTHENTIFICATION : connexion, inscription, mot de passe oublié
   (même compte qu'ABBA Life ; l'accès au Parcours reste validé par un coordinateur)
   ============================================================ */
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5.5 19 1.5 12 1.5 12a19.7 19.7 0 0 1 4.6-5.4M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10.5 7 10.5 7a19.6 19.6 0 0 1-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
// Ajoute l'œil « afficher / masquer » sur tous les champs mot de passe (à appeler aussi pour les champs ajoutés plus tard)
function addPasswordEyes(root) {
  (root || document).querySelectorAll('input[type="password"], input[data-pw]').forEach((inp) => {
    if (inp.dataset.pwEye) return;
    inp.dataset.pwEye = "1"; inp.dataset.pw = "1";
    const wrap = document.createElement("span"); wrap.className = "pw-wrap";
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "pw-eye"; btn.innerHTML = EYE_SVG;
    btn.title = "Afficher le mot de passe"; btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
      btn.title = show ? "Masquer le mot de passe" : "Afficher le mot de passe";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
    });
    wrap.appendChild(btn);
  });
}
window.AbbaUI = { addPasswordEyes };
function ageFromBirth(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const b = new Date(iso + "T00:00:00"), t = new Date();
  if (isNaN(b.getTime()) || b > t || b.getFullYear() < 1900) return null;
  return t.getFullYear() - b.getFullYear() - ((t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) ? 1 : 0);
}
function setupAuthScreen() {
  addPasswordEyes(document.getElementById("authScreen"));
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const showTab = (name) => {
    loginForm.style.display = name === "login" ? "" : "none";
    signupForm.style.display = name === "signup" ? "" : "none";
    document.querySelectorAll("#authTabs .auth-tab").forEach(b => b.classList.toggle("active", b.dataset.authTab === name));
    document.getElementById("loginError").textContent = ""; document.getElementById("loginInfo").textContent = "";
    document.getElementById("signupError").textContent = "";
  };
  document.querySelectorAll("#authTabs .auth-tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.authTab)));

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.textContent = ""; document.getElementById("loginInfo").textContent = "";
    try {
      await window.AbbaSync.logIn(email, password);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    }
  });

  document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const errEl = document.getElementById("loginError"), infoEl = document.getElementById("loginInfo");
    errEl.textContent = ""; infoEl.textContent = "";
    if (!email) { errEl.textContent = "Écris d'abord ton adresse e-mail ci-dessus, puis clique sur « Mot de passe oublié ? »."; return; }
    try {
      await window.AbbaSync.resetPassword(email);
      infoEl.textContent = "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé (cela peut prendre quelques minutes). Pense à regarder dans les courriers indésirables. Si rien n'arrive, écris à contact@batisseursbibliques.org.";
      // une seule demande par minute : évite les clics répétés (et le blocage temporaire par Firebase)
      const bouton = document.getElementById("forgotPasswordBtn"); bouton.disabled = true; setTimeout(() => { bouton.disabled = false; }, 60000);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    }
  });

  // Date de naissance : adapte le formulaire (15-17 ans = autorisation parentale)
  const naiss = document.getElementById("signupNaissance");
  naiss.max = new Date().toISOString().slice(0, 10);
  const tuteurBox = document.getElementById("signupTuteurBox");
  const refreshTuteur = () => {
    const age = ageFromBirth(naiss.value);
    const mineur = age !== null && age >= 15 && age < 18;
    tuteurBox.style.display = mineur ? "" : "none";
    ["signupTuteurNom", "signupTuteurTel"].forEach(id => { document.getElementById(id).required = mineur; });
    document.getElementById("signupTuteurOk").required = mineur;
  };
  naiss.addEventListener("input", refreshTuteur); naiss.addEventListener("change", refreshTuteur);

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("signupError"); errEl.textContent = "";
    const val = (id) => document.getElementById(id).value.trim();
    const d = {
      prenom: val("signupPrenom"), nom: val("signupNom"), telephone: val("signupTel"),
      email: val("signupEmail"), password: document.getElementById("signupPassword").value,
      naissance: val("signupNaissance"), tuteurNom: val("signupTuteurNom"), tuteurTel: val("signupTuteurTel"),
    };
    if (d.prenom.length < 2 || d.nom.length < 2) { errEl.textContent = "Écris ton prénom et ton nom."; return; }
    if (d.telephone.replace(/\D/g, "").length < 8) { errEl.textContent = "Numéro de téléphone invalide (au moins 8 chiffres, avec l'indicatif du pays si tu es à l'étranger)."; return; }
    if (d.password.length < 8) { errEl.textContent = "Le mot de passe doit faire au moins 8 caractères."; return; }
    const age = ageFromBirth(d.naissance);
    if (age === null) { errEl.textContent = "Date de naissance invalide."; return; }
    if (age < 15) { errEl.textContent = "Le Parcours est ouvert à partir de 15 ans."; return; }
    if (age < 18) {
      if (d.tuteurNom.length < 3 || d.tuteurTel.replace(/\D/g, "").length < 8) { errEl.textContent = "Indique le nom et le téléphone de ton parent ou tuteur."; return; }
      if (!document.getElementById("signupTuteurOk").checked) { errEl.textContent = "L'accord de ton parent ou tuteur est nécessaire."; return; }
    }
    if (!document.getElementById("signupConsent").checked) { errEl.textContent = "Coche la case d'accord pour continuer."; return; }
    const btn = signupForm.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      await window.AbbaSync.signUp(d);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    } finally { btn.disabled = false; }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await window.AbbaSync.logOut();
  });
}
function traduireErreurAuth(err) {
  const code = err && err.code ? err.code : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-mail ou mot de passe incorrect.";
  if (code.includes("email-already-in-use")) return "Cette adresse e-mail a déjà un compte (par exemple sur ABBA Life). Utilise l'onglet « Se connecter ».";
  if (code.includes("weak-password")) return "Mot de passe trop faible : au moins 8 caractères.";
  if (code.includes("invalid-email")) return "Adresse e-mail invalide.";
  if (code.includes("missing-email")) return "Écris ton adresse e-mail.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Patiente quelques minutes puis réessaie.";
  if (code.includes("network-request-failed")) return "Pas de connexion internet. Réessaie plus tard.";
  return "Une erreur est survenue. Réessaie.";
}

window.addEventListener("abba:profil-modifie", async (e) => {
  try {
    if (!CURRENT_USER) return;
    CURRENT_PROFILE = (await window.AbbaSync.getUserProfile(CURRENT_USER.uid)) || {};
    const nom = (e.detail && e.detail.nom) || CURRENT_USER.displayName || CURRENT_USER.email;
    const t = `Connecté(e) en tant que ${nom} (${CURRENT_USER.email})`;
    const h1 = document.getElementById("accountEmailHint"); if (h1) h1.textContent = t;
    const h2 = document.getElementById("accountEmailHintAccueil"); if (h2) h2.textContent = t;
    pushModulesSummary();
  } catch (err) { console.error("profil-modifie:", err); }
});
async function onAuthChanged(user) {
  if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; }
  if (unsubModulesConfig) { unsubModulesConfig(); unsubModulesConfig = null; }
  if (unsubParcours) { unsubParcours(); unsubParcours = null; }
  if (unsubBinome) { unsubBinome(); unsubBinome = null; }
  if (unsubGeste) { unsubGeste(); unsubGeste = null; }
  if (unsubZonesConfig) { unsubZonesConfig(); unsubZonesConfig = null; }
  if (unsubMyZones) { unsubMyZones(); unsubMyZones = null; }
  Object.values(unsubDimensions).forEach(fn => fn && fn());
  unsubDimensions = {};
  if (unsubSeances) { unsubSeances(); unsubSeances = null; }
  if (unsubProfilFormation) { unsubProfilFormation(); unsubProfilFormation = null; }

  if (!user) {
    CURRENT_USER = null;
    IS_ADMIN = false;
    MODULES_CONFIG = [];
    MODULES_TERMINES = [];
    ZONES_CONFIG = [];
    MY_ZONES = {};
    MY_DIMENSIONS = {};
    SEANCES = [];
    MY_PROFIL = {};
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }

  CURRENT_USER = user;

  // ── Enrollment : vérifier l'accès (sauf pour les admins) ───
  if (!window.AbbaSync.isAdminEmail(user.email)) {
    let profile = {};
    try { profile = await window.AbbaSync.getUserProfile(user.uid) || {}; } catch (e) {}
    const enrollment = await window.AbbaSync.getMyEnrollment(user.uid, "parcours");
    if (!enrollment) {
      await window.AbbaSync.requestEnrollment(
        user.uid, "parcours",
        profile.nom || "", profile.prenom || "", user.email
      );
      showEnrollmentScreen("pending"); return;
    }
    if (enrollment.status === "pending") { showEnrollmentScreen("pending"); return; }
    if (enrollment.status === "refused") { showEnrollmentScreen("refused"); return; }
  }
  // ── Accès validé ────────────────────────────────────────────

  document.getElementById("authScreen").style.display = "none";
  document.getElementById("enrollmentScreen").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("accountEmailHint").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;
  const ehA = document.getElementById("accountEmailHintAccueil"); if (ehA) ehA.textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;

  try {
    CURRENT_PROFILE = await window.AbbaSync.getUserProfile(user.uid) || {};
  } catch (err) {
    CURRENT_PROFILE = {};
  }

  unsubAdmins = window.AbbaSync.watchAdminsData((map) => {
    ADMINS_DATA = map || {};
    RIGHTS = window.AbbaSync.droitsDe(user.email, ADMINS_DATA);
    IS_ADMIN = !!RIGHTS.admin;
    document.querySelectorAll(".admin-only").forEach(el => { const d = el.dataset.droit; el.style.display = IS_ADMIN && (!d || RIGHTS[d]) ? "" : "none"; });
    renderModulesEditor();
    renderZonesEditor();
    LAST_ADMIN_EMAILS = Object.keys(ADMINS_DATA);
    if (RIGHTS.coordinateurs) renderAdminsCard();
    if (RIGHTS.suivi) renderCoordModules();
    if (RIGHTS.binomes) loadBinomesManager();
    if (RIGHTS.presences) { renderSeancesAdmin(); setupEnrollmentsAdmin(); }
  });

  unsubModulesConfig = window.AbbaSync.watchModulesConfig((list) => {
    MODULES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_MODULES);
    renderModulesList();
    renderModulesEditor();
  });

  unsubZonesConfig = window.AbbaSync.watchZonesConfig((list) => {
    ZONES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_ZONES);
    // Alignement avec le manuel et le cahier : l'ancienne zone « Parole » devient « Manier son caractère par son esprit »
    ZONES_CONFIG = ZONES_CONFIG.map(z => (z.titre && z.titre.trim().toLowerCase() === "parole") ? { ...z, titre: "Manier son caractère par son esprit" } : z);
    renderZones();
    renderZonesEditor();
  });

  unsubMyZones = window.AbbaSync.watchMyZones(user.uid, (parMois) => {
    MY_ZONES = parMois || {};
    renderZones();
  });

  DIMENSIONS_KEYS.forEach(d => {
    unsubDimensions[d.key] = window.AbbaSync.watchMyDimension(user.uid, d.key, (parMois) => {
      MY_DIMENSIONS[d.key] = parMois || {};
      renderDimensions();
    });
  });

  unsubSeances = window.AbbaSync.watchSeances((list) => {
    SEANCES = list || [];
    renderPresence();
    if (IS_ADMIN) renderSeancesAdmin();
  });

  unsubProfilFormation = window.AbbaSync.watchMyProfilFormation(user.uid, (data) => {
    MY_PROFIL = data || {};
    renderProfilFormation();
  });

  unsubParcours = window.AbbaSync.watchParcours(user.uid, (modulesTermines) => {
    MODULES_TERMINES = modulesTermines || [];
    renderModulesList();
    pushModulesSummary();
  });

  // Mon geste du mois (strictement privé)
  unsubGeste = window.AbbaSync.watchMyGeste(user.uid, (geste) => {
    MY_GESTE = geste || "";
    renderGeste();
  });

  // Cherche si je fais partie d'un binôme, puis écoute son contenu en direct
  try {
    const pair = await window.AbbaSync.findMyBinome(user.uid);
    if (pair) {
      unsubBinome = window.AbbaSync.watchBinome(pair.id, (data) => {
        MY_BINOME = data;
        renderBinome();
      });
    } else {
      MY_BINOME = null;
    }
    renderBinome();
  } catch (err) {
    console.error("Recherche binôme :", err);
    MY_BINOME = null;
    renderBinome();
    const errEl = document.getElementById("binomeErrorHint");
    if (errEl) errEl.textContent = "Erreur technique : " + (err && err.message ? err.message : String(err));
  }
}

function pushModulesSummary() {
  if (!CURRENT_USER) return;
  window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, {
    nom: CURRENT_USER.displayName || CURRENT_USER.email,
    email: CURRENT_USER.email,
    telephone: CURRENT_PROFILE.telephone || "",
    modulesFaits: MODULES_TERMINES.length,
    modulesTotal: (MODULES_CONFIG && MODULES_CONFIG.length) || 0,
  }).catch(err => console.error("Résumé modules :", err));
}

/* ============================================================
   NAVIGATION (onglets)
   ============================================================ */
function setupTabs() {
  document.querySelectorAll(".tab, .bnav-btn, [data-goto]").forEach(btn => {
    const target = btn.dataset.tab || btn.dataset.goto;
    if (target) btn.addEventListener("click", () => goToTab(target));
  });
}
function goToTab(name) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`panel-${name}`).classList.add("active");
  document.querySelectorAll(".tab, .bnav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "coordination") renderCoordModules();
  if (name === "bible") window.dispatchEvent(new Event("abba:bible-ouvert"));
  if (name === "reglages") window.dispatchEvent(new Event("abba:reglages-ouvert"));
  window.scrollTo({ top: 0 });
}

/* ============================================================
   MODE CLAIR / SOMBRE (mêmes réglages que sur ABBA Life)
   ============================================================ */
function setupTheme() {
  const saved = localStorage.getItem("abbalife_theme");
  const preferred = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}
function applyTheme(theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("abbalife_theme", theme);
}

/* ============================================================
   MES MODULES
   ============================================================ */
function saveParcoursData() {
  if (CURRENT_USER) {
    window.AbbaSync.saveParcours(CURRENT_USER.uid, MODULES_TERMINES)
      .catch(err => console.error("Sauvegarde du parcours :", err));
  }
}
function toggleModuleTermine(moduleId, done) {
  if (done && !MODULES_TERMINES.includes(moduleId)) MODULES_TERMINES.push(moduleId);
  if (!done) MODULES_TERMINES = MODULES_TERMINES.filter(id => id !== moduleId);
  saveParcoursData();
  renderModulesList();
}
function renderModulesList() {
  const card = document.getElementById("modulesCard");
  const wrap = document.getElementById("modulesList");
  if (!MODULES_CONFIG || MODULES_CONFIG.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";

  const total = MODULES_CONFIG.length;
  const faits = MODULES_TERMINES.length;
  document.getElementById("modulesProgressHint").textContent = `${faits}/${total} modules terminés`;

  wrap.innerHTML = "";
  MODULES_CONFIG.forEach(m => {
    const checked = MODULES_TERMINES.includes(m.id);
    const row = document.createElement("label");
    row.className = "check-item";
    row.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""}><span class="${checked ? "done" : ""}">${escapeAttr(m.titre)}</span>`;
    row.querySelector("input").addEventListener("change", (e) => toggleModuleTermine(m.id, e.target.checked));
    wrap.appendChild(row);
  });
}

/* ---------- Éditeur de la liste des modules (coordinateurs uniquement) ---------- */
function setupModulesEditor() {
  document.getElementById("addModuleBtn")?.addEventListener("click", () => {
    EDIT_MODULES.push({ id: "mod_" + Date.now(), titre: "Nouveau module" });
    renderModulesEditorDom();
  });
  document.getElementById("saveModulesBtn")?.addEventListener("click", async () => {
    const clean = EDIT_MODULES.map(m => ({ ...m, titre: m.titre.trim() })).filter(m => m.titre !== "");
    if (clean.length === 0) { alert("Ajoute au moins un module."); return; }
    const btn = document.getElementById("saveModulesBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveModulesConfig(clean);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });
}
function renderModulesEditor() {
  if (!IS_ADMIN || !document.getElementById("modulesEditor")) return;
  EDIT_MODULES = deepClone(MODULES_CONFIG);
  renderModulesEditorDom();
}
function renderModulesEditorDom() {
  const wrap = document.getElementById("modulesEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  EDIT_MODULES.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "editor-item-row";
    row.innerHTML = `
      <input type="text" class="text-input editor-item-label" value="${escapeAttr(m.titre)}">
      <button type="button" class="editor-del-item" title="Supprimer">🗑</button>
    `;
    row.querySelector(".editor-item-label").addEventListener("input", (e) => { EDIT_MODULES[i].titre = e.target.value; });
    row.querySelector(".editor-del-item").addEventListener("click", () => {
      if (!confirm(`Supprimer le module "${EDIT_MODULES[i].titre}" ?`)) return;
      EDIT_MODULES.splice(i, 1);
      renderModulesEditorDom();
    });
    wrap.appendChild(row);
  });
}

/* ---------- Avancement de tous les Bâtisseurs (coordinateurs uniquement) ---------- */
function setupCoordModules() {
  const btn = document.getElementById("refreshCoordModules");
  if (btn) btn.addEventListener("click", renderCoordModules);
}
function renderAdminsCard() {
  const list = document.getElementById("adminsList");
  if (!list) return;
  const me = (CURRENT_USER && CURRENT_USER.email || "").toLowerCase();
  const all = Array.from(new Set(LAST_ADMIN_EMAILS.map(e => e.toLowerCase())));
  list.innerHTML = all.length ? all.map(e => {
    const principal = window.AbbaSync.isAdminEmail(e);
    const dd = (ADMINS_DATA[e] || {}).droits, val = (k) => dd ? dd[k] === true : (k !== "apercu" && k !== "paiements");
    const cases = principal ? "" : `<div class="fm-acq" style="margin:2px 0 10px;">${Object.keys(DROITS_LABELS).map(k => `<label><input type="checkbox" data-dk="${k}" data-dkemail="${escC(e)}" ${val(k) ? "checked" : ""}> ${DROITS_LABELS[k]}</label>`).join("")}</div>`;
    return `<div>` + `<p class="small" style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><span>${escC(e)}${principal ? " (principal)" : ""}${e === me ? " — vous" : ""}</span>${principal || e === me ? "" : `<button class="btn-secondary" data-rmadmin="${escC(e)}">Retirer</button>`}</p>` + cases + `</div>`;
  }).join("") : `<p class="settings-hint">Aucun coordinateur dans la liste (le coordinateur principal reste actif).</p>`;
  if (!list.dataset.bound) {
    list.dataset.bound = "1";
    list.addEventListener("change", async (ev) => {
      const c = ev.target.closest("[data-dk]");
      if (!c) return;
      const em = c.dataset.dkemail, droits = {};
      list.querySelectorAll(`[data-dkemail="${em}"]`).forEach(x => { droits[x.dataset.dk] = x.checked; });
      try { await window.AbbaSync.setDroits(em, droits); document.getElementById("adminsMsg").textContent = "Droits de " + em + " enregistrés."; }
      catch (e2) { document.getElementById("adminsMsg").textContent = "Impossible d'enregistrer : " + (e2.code || e2.message); }
    });
    list.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-rmadmin]");
      if (!b || !confirm("Retirer " + b.dataset.rmadmin + " des coordinateurs ?")) return;
      try { await window.AbbaSync.removeAdmin(b.dataset.rmadmin); } catch (e) { document.getElementById("adminsMsg").textContent = "Impossible de retirer."; }
    });
    document.getElementById("addAdminBtn").addEventListener("click", async () => {
      const inp = document.getElementById("newAdminEmail"), msg = document.getElementById("adminsMsg");
      const em = inp.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = "Entre une adresse e-mail valide."; return; }
      try { await window.AbbaSync.addAdmin(em, CURRENT_USER.email); inp.value = ""; msg.textContent = em + " est maintenant coordinateur, sans aucun droit : coche ses droits dans la liste."; }
      catch (e) { msg.textContent = "Impossible d'ajouter : " + (e.code || e.message); }
    });
  }
}
const escC = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FICHE_TXT = { draft: "fiche en préparation", submitted: "fiche envoyée, en correction", returned: "fiche à reprendre", validated: "fiche validée" };
function etapeTexte(a) {
  const m = a.current;
  if (!m) return "tous les modules validés";
  if (!m.started) return `M${m.n} · pas commencé`;
  if (m.lu < m.nLecons) return `M${m.n} · lecture ${m.lu}/${m.nLecons}`;
  if (!m.qcm || !m.qcm.ok) return `M${m.n} · questions${m.qcm ? " " + m.qcm.pct + "%" : ""}`;
  if (m.exOk < m.exTot) return `M${m.n} · exercices ${m.exOk}/${m.exTot}`;
  return `M${m.n} · ${FICHE_TXT[m.fiche] || "fiche à remplir"}`;
}
function joursDepuis(ms) { return ms ? Math.floor((Date.now() - ms) / 86400000) : null; }
function activiteTexte(ms) {
  const d = joursDepuis(ms);
  if (d === null) return "—";
  return d <= 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} j`;
}
function absencesDeSuite(uid) {
  const marques = SEANCES.filter(s => (s.presences || {})[uid]).sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const n = marques.length;
  return n >= 2 && !marques[n - 1].presences[uid].present && !marques[n - 2].presences[uid].present;
}
function alertesDe(r) {
  const a = r.a, out = [];
  if (!a) return out;
  if (a.indispo && a.indispo.nonVu) out.push("indisponibilité signalée, pas encore prise en compte");
  if (a.indispo && a.indispo.actif) {
    if (a.indispo.finInconnue && a.indispo.jours >= 14) out.push(`indisponible depuis ${a.indispo.jours} jours, fin inconnue`);
    return out;
  }
  if (a.lecture && a.lecture.retard >= 3) out.push(`lecture en retard de ${a.lecture.retard} jours`);
  const d = joursDepuis(a.lastMs);
  if (d !== null && d >= 7) out.push(`sans activité depuis ${d} jours`);
  a.modules.forEach(m => {
    if (m.fiche === "submitted" && m.submittedAt && joursDepuis(m.submittedAt) >= 3) out.push(`fiche du module ${m.n} en attente de correction depuis ${joursDepuis(m.submittedAt)} jours`);
  });
  if (a.decl && a.decl.idx >= 7 && a.decl.ok < 4) out.push(`déclaration faite ${a.decl.ok} jour(s) sur ${a.decl.tot}`);
  if (a.journee && a.journee.idx >= 7 && a.journee.ok < 4) out.push(`« Ma journée » tenue ${a.journee.ok} jour(s) sur ${a.journee.tot}`);
  if (absencesDeSuite(r.uid)) out.push("absent aux deux dernières séances");
  if (a.current && a.refMs && joursDepuis(a.refMs) >= 21 && a.current.started) out.push(`bloqué sur le module ${a.current.n} depuis plus de 3 semaines`);
  if (a.current && a.current.qcm && !a.current.qcm.ok && a.current.qcm.essais >= 3) out.push(`questions du module ${a.current.n} ratées ${a.current.qcm.essais} fois`);
  return out;
}
function detailEleve(r) {
  const a = r.a;
  if (!a) return "<p class=\"settings-hint\">Données indisponibles.</p>";
  let h = `<p style="margin:0 0 8px;"><button type="button" class="btn-secondary" data-fiche="${escC(r.uid)}" data-nom="${escC(r.nom || r.email || "")}">📍 Fiche de contact</button></p>`;
  if (r.mbti || r.donsSpirituels) h += `<p class="small">${r.mbti ? "<strong>MBTI</strong> : " + escC(r.mbti) : ""}${r.mbti && r.donsSpirituels ? " · " : ""}${r.donsSpirituels ? "<strong>Dons spirituels</strong> : " + escC(r.donsSpirituels) : ""}</p>`;
  const fait = a.modules.filter(m => m.started || m.complete);
  if (!fait.length) h += `<p class="small">Aucun module commencé.</p>`;
  fait.forEach(m => {
    const q = m.qcm ? `questions ${m.qcm.pct}%${m.qcm.essais ? ` (${m.qcm.essais} essai${m.qcm.essais > 1 ? "s" : ""})` : ""}` : "questions —";
    h += `<p class="small"><strong>M${m.n}</strong> ${m.complete ? "✅ validé" : ""}${m.acq ? " (acquis en séance)" : ""}<br>lecture ${m.lu}/${m.nLecons} · ${q} · exercices ${m.exOk}/${m.exTot} · ${FICHE_TXT[m.fiche] || "fiche —"}</p>`;
  });
  if (a.enCours.length) h += `<p class="small"><strong>Suivis en cours</strong><br>${a.enCours.map(e => `${escC(e.titre)} : jour ${e.jour}/${e.jours}${e.rates ? `, ${e.rates} jour(s) raté(s)` : ""}`).join("<br>")}</p>`;
  if (a.decl) h += `<p class="small"><strong>Déclaration</strong> : ${a.decl.ok}/${a.decl.tot} jours sur les 7 derniers${a.decl.streak >= 2 ? ` · 🔥 ${a.decl.streak} jours de suite` : ""}</p>`;
  else h += `<p class="small"><strong>Déclaration</strong> : pas commencée</p>`;
  if (a.journee) h += `<p class="small"><strong>Ma journée</strong> : ${a.journee.ok}/${a.journee.tot} jours tenus sur les 7 derniers (4 cases sur 5 ou plus)${a.journee.streak >= 2 ? ` · 🔥 ${a.journee.streak} jours de suite` : ""}</p>`;
  else h += `<p class="small"><strong>Ma journée</strong> : pas commencée</p>`;
  h += `<p class="small"><strong>Charte</strong> : ${a.charte ? "signée" + (a.charte > 1 ? " le " + new Date(a.charte).toLocaleDateString(window.I18N && window.I18N.lang === "en" ? "en-GB" : "fr-FR") : "") : "pas encore signée"}</p>`;
  if (a.lecture) h += `<p class="small"><strong>Lecture</strong> : jour ${a.lecture.jour}/180 · ${a.lecture.chapitres}/260 chapitres${a.lecture.retard ? ` · ⚠ en retard de ${a.lecture.retard} jour(s)` : a.lecture.auj ? " · à jour" : ""}${a.lecture.dernier ? " · dernière lecture le " + new Date(a.lecture.dernier + "T00:00:00").toLocaleDateString(window.I18N && window.I18N.lang === "en" ? "en-GB" : "fr-FR") : ""}</p>`;
  else h += `<p class="small"><strong>Lecture</strong> : calendrier pas commencé</p>`;
  if (a.indispo && a.indispo.liste.length) h += `<div class="small"><strong>Indisponibilités signalées</strong>${a.indispo.liste.map(v => `<p>${v.vivant ? "⏸ " : ""}${escC(v.texte)}<br>${escC(v.motif)}<br>${v.vu ? "✓ Pris en compte" : `<button class="btn-secondary" data-indvu="${v.id}">Pris en compte</button>`}</p>`).join("")}</div>`;
  if (a.suiviForce && a.valides === a.total) h += `<button class="btn-secondary" data-suivi="off">Parcours terminé : retirer du suivi</button>`;
  h += `<p class="small"><strong>Correcteur</strong> : ${escC(r.correcteur || "non attribué")}</p>`;
  if (a.bloque) h += `<div class="coord-bloc"><p class="small" style="color:#b3261e"><strong>Parcours bloqué</strong>${a.bloque.motif ? " — " + escC(a.bloque.motif) : ""}</p><button class="btn-secondary" data-bloc="off">Débloquer le Parcours</button></div>`;
  else h += `<div class="coord-bloc"><input type="text" class="text-input" data-bloc-motif placeholder="Motif (ex. absent à la présentielle sans excuse)"><button class="btn-secondary" data-bloc="on">Bloquer l'accès au Parcours</button></div>`;
  return h;
}
async function renderCoordModules() {
  if (!IS_ADMIN) return;
  const body = document.getElementById("coordModulesBody");
  const emptyHint = document.getElementById("coordModulesEmpty");
  const alertsBox = document.getElementById("coordAlerts");
  body.innerHTML = `<tr><td colspan="5">Chargement…</td></tr>`;
  try {
    const [sums, liens] = await Promise.all([window.AbbaSync.loadAllSummaries(), window.AbbaSync.loadAllLiens().catch(() => [])]);
    const rows = sums.filter(r => r.email || r.nom);
    await Promise.all(rows.map(async r => {
      try { r.a = await window.Formation.analyse(r.uid); } catch (e) { console.error("analyse", r.uid, e); r.a = null; }
      const l = liens.find(x => (x.uid || x.id) === r.uid);
      r.correcteur = l ? (l.correcteurNom || l.correcteurEmail || "") : "";
      if (r.a) {
        r.modulesFaits = r.a.valides; r.modulesTotal = r.a.total;
        r.declPct7 = r.a.decl && r.a.decl.tot ? Math.round((r.a.decl.ok / r.a.decl.tot) * 100) : undefined;
      } else { r.modulesFaits = 0; r.modulesTotal = 0; }
      r.alertes = alertesDe(r);
    }));
    rows.sort((x, y) => (y.modulesFaits || 0) - (x.modulesFaits || 0) || ((y.a && y.a.lastMs) || 0) - ((x.a && x.a.lastMs) || 0));
    LAST_COORD_ROWS = rows;
    const anciens = rows.filter(r => r.a && r.a.termine), actifs = rows.filter(r => !(r.a && r.a.termine));
    body.innerHTML = "";
    emptyHint.style.display = rows.length === 0 ? "block" : "none";
    actifs.forEach(r => {
      let marquees = 0, presentes = 0;
      SEANCES.forEach(s => { const rec = (s.presences || {})[r.uid]; if (rec) { marquees++; if (rec.present) presentes++; } });
      const presPct = marquees > 0 ? `${Math.round((presentes / marquees) * 100)}%` : "—";
      const a = r.a, d = a ? joursDepuis(a.lastMs) : null;
      const decl = a && a.decl ? `${a.decl.ok}/${a.decl.tot}${a.decl.streak >= 2 ? `<small>🔥${a.decl.streak}</small>` : ""}` : "—";
      const jour = a && a.journee ? `<small>Jour. ${a.journee.ok}/${a.journee.tot}</small>` : "";
      const tr = document.createElement("tr");
      tr.className = "coord-row";
      tr.innerHTML = `
        <td>${r.alertes.length ? "⚠ " : ""}${escC(r.nom || r.email || "—")}<small>${escC(r.telephone || "")}</small>${a && a.bloque ? '<small class="warn">🔒 Parcours bloqué</small>' : ""}${a && a.indispo && a.indispo.actif ? `<small class="warn">⏸ Indisponible${a.indispo.finInconnue ? ", fin inconnue" : a.indispo.fin ? " jusqu'au " + a.indispo.fin.split("-").reverse().join("/") : ""}</small>` : ""}</td>
        <td>${a ? `<b>${a.valides}/${a.total}</b><small>${escC(etapeTexte(a))}</small>` : "—"}</td>
        <td>${decl}${jour}</td>
        <td>${presPct}</td>
        <td class="${d !== null && d >= 7 ? "warn" : ""}">${a ? activiteTexte(a.lastMs) : "—"}</td>`;
      const det = document.createElement("tr");
      det.className = "coord-detail"; det.style.display = COORD_OPEN.has(r.uid) ? "" : "none";
      det.innerHTML = `<td colspan="5">${detailEleve(r)}</td>`;
      tr.addEventListener("click", () => { const open = det.style.display === "none"; det.style.display = open ? "" : "none"; if (open) COORD_OPEN.add(r.uid); else COORD_OPEN.delete(r.uid); });
      det.addEventListener("click", async (ev) => {
        const sf = ev.target.closest("[data-suivi]");
        if (sf) {
          try { await window.AbbaSync.setSuiviForce(r.uid, sf.dataset.suivi === "on"); renderCoordModules(); }
          catch (e) { alert("Impossible de modifier le suivi : " + (e.code || e.message)); }
          return;
        }
        const vu = ev.target.closest("[data-indvu]");
        if (vu) {
          try { await window.AbbaSync.updateIndispo(r.uid, vu.dataset.indvu, { vu: { par: CURRENT_USER.email, at: new Date().toISOString() } }); renderCoordModules(); }
          catch (e) { alert("Impossible d'enregistrer : " + (e.code || e.message)); }
          return;
        }
        const b = ev.target.closest("[data-bloc]");
        if (!b) return;
        const on = b.dataset.bloc === "on", nom = r.nom || r.email;
        if (!confirm(on ? "Bloquer l'accès de " + nom + " au Parcours ? Il gardera la Bible et sa déclaration." : "Débloquer " + nom + " ?")) return;
        const motif = (det.querySelector("[data-bloc-motif]") || {}).value || "";
        try {
          await window.AbbaSync.setBloque(r.uid, on ? { actif: true, motif: motif.trim(), par: CURRENT_USER.email, le: new Date().toISOString() } : { actif: false, leveLe: new Date().toISOString(), levePar: CURRENT_USER.email });
          renderCoordModules();
        } catch (e) { alert("Impossible de modifier le blocage : " + (e.code || e.message)); }
      });
      body.appendChild(tr); body.appendChild(det);
    });
    const boxA = document.getElementById("coordAnciens");
    if (boxA) {
      boxA.innerHTML = anciens.length
        ? `<details><summary><strong>Anciens — parcours terminé (${anciens.length})</strong></summary>${anciens.map(r => `<p class="small"><strong>${escC(r.nom || r.email || "—")}</strong> — terminé${r.a.termineLe ? " le " + new Date(r.a.termineLe).toLocaleDateString(window.I18N && window.I18N.lang === "en" ? "en-GB" : "fr-FR") : ""} <button class="btn-secondary" data-cert="${escC(r.uid)}">🎓 Certificat</button> <button class="btn-secondary" data-suivi="on" data-uid="${r.uid}">Remettre dans le suivi</button></p>`).join("")}</details>`
        : "";
      boxA.style.display = anciens.length ? "" : "none";
      boxA.onclick = async (ev) => {
        const cb = ev.target.closest("[data-cert]");
        if (cb) {
          const uid = cb.dataset.cert, r = anciens.find(x => x.uid === uid); if (!r) return;
          try {
            const S = window.AbbaSync, ex = await S.getAttestation(uid, "parcours"); let rec = ex;
            if (!rec) {
              const profil = (await S.getUserProfile(uid)) || {}, nom = String(profil.nom || r.nom || "").trim();
              if (!nom) { alert("Cette personne n'a pas de nom dans son profil."); return; }
              if (!confirm("Délivrer le certificat de fin de formation à " + nom + " ?\n(14 modules validés. Pense à vérifier sa situation avant de confirmer.)")) return;
              const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              rec = await S.delivrerCertificat(uid, { type: "parcours", nom, titre: "Parcours Bâtisseur — phase de formation", date: iso });
            }
            const A = await import("./attestation.js"); await A.telecharger(rec, "fr");
          } catch (e) { alert("Certificat non disponible : " + (e.code || e.message)); }
          return;
        }
        const b = ev.target.closest("[data-suivi]");
        if (!b) return;
        try { await window.AbbaSync.setSuiviForce(b.dataset.uid, b.dataset.suivi === "on"); renderCoordModules(); }
        catch (e) { alert("Impossible de modifier le suivi : " + (e.code || e.message)); }
      };
    }
    const avec = actifs.filter(r => r.alertes.length);
    const cA = document.getElementById("coordAlertsCount"); if (cA) cA.textContent = avec.length ? "(" + avec.length + ")" : "";
    alertsBox.innerHTML = avec.length
      ? avec.map(r => `<p class="small"><strong>${escC(r.nom || r.email)}</strong> — ${r.alertes.map(escC).join(" · ")}</p>`).join("")
      : `<p class="settings-hint">Rien à signaler pour l'instant ✓</p>`;
    renderCoordProfils(rows);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5">Erreur de chargement.</td></tr>`;
    console.error(err);
  }
}

function renderCoordProfils(rows) {
  const wrap = document.getElementById("coordProfilsList");
  const emptyEl = document.getElementById("coordProfilsEmpty");
  if (!wrap) return;
  const avecProfil = rows.filter(r => r.mbti || r.donsSpirituels);
  wrap.innerHTML = "";
  emptyEl.style.display = avecProfil.length === 0 ? "block" : "none";
  avecProfil.forEach(r => {
    const item = document.createElement("div");
    item.className = "accord-item";
    item.innerHTML = `
      <p style="font-weight:600;font-size:13px;margin:0 0 4px;">${escapeAttr(r.nom || r.email)}</p>
      ${r.mbti ? `<p class="settings-hint" style="margin:2px 0;">Type MBTI : <strong>${escapeAttr(r.mbti)}</strong></p>` : ""}
      ${r.donsSpirituels ? `<p class="settings-hint" style="margin:2px 0;">Dons : ${escapeAttr(r.donsSpirituels)}</p>` : ""}
    `;
    wrap.appendChild(item);
  });
}

/* ============================================================
   MON PROFIL (MBTI, dons spirituels)
   ============================================================ */
function setupProfilFormation() {
  document.getElementById("saveProfilBtn").addEventListener("click", async () => {
    if (!CURRENT_USER) return;
    const donsSpirituels = document.getElementById("profilDons").value.trim();
    const btn = document.getElementById("saveProfilBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveMyProfilFormation(CURRENT_USER.uid, { donsSpirituels });
      // Poussé aussi dans le résumé partagé pour que le coordinateur le voie
      window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { donsSpirituels }).catch(() => {});
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Erreur technique : " + (err && err.message ? err.message : String(err)));
      console.error(err);
    }
  });
}
function renderProfilFormation() {
  window.__monProfil = MY_PROFIL;   // lu par la formation (module 5) pour savoir si le MBTI est déjà confirmé
  const box = document.getElementById("profilMbtiBox");
  const donsInput = document.getElementById("profilDons");
  if (!box || !donsInput) return;
  const calc = MY_PROFIL.mbtiCalcule, conf = MY_PROFIL.mbti;
  const lbl = '<span style="font-size:14px;">Mon type MBTI</span><br>';
  if (conf && (!calc || calc === conf)) box.innerHTML = lbl + `<strong style="font-size:20px;letter-spacing:.15em;">${escC(conf)}</strong> <span class="small" style="color:#4C7A5E;">✓ confirmé</span>`;
  else if (calc) box.innerHTML = lbl + `<strong style="font-size:20px;letter-spacing:.15em;">${escC(calc)}</strong> <span class="small">(calculé d'après ton test du module 5)</span><br><button class="btn-primary" id="mbtiConfirmBtn" type="button" style="margin-top:8px;">Je confirme ce résultat</button>`;
  else box.innerHTML = lbl + '<span class="small">Il se calculera automatiquement quand tu feras le test de personnalité du module 5.</span>';
  const cb = document.getElementById("mbtiConfirmBtn");
  if (cb) cb.addEventListener("click", async () => {
    if (!CURRENT_USER) return; cb.disabled = true;
    try {
      await window.AbbaSync.saveMyProfilFormation(CURRENT_USER.uid, { mbti: calc });
      window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { mbti: calc }).catch(() => {});
    } catch (err) { cb.disabled = false; alert("Erreur technique : " + (err && err.message ? err.message : String(err))); }
  });
  if (document.activeElement !== donsInput) donsInput.value = MY_PROFIL.donsSpirituels || "";
}

/* ============================================================
   FICHE BINÔME
   ============================================================ */
function setupBinome() {
  document.getElementById("saveBinomeBtn").addEventListener("click", async () => {
    if (!MY_BINOME || !CURRENT_USER) return;
    const content = {
      priereCible: document.getElementById("binomePriere").value,
      zoneCaractere: document.getElementById("binomeZone").value,
      exerciceDuMois: document.getElementById("binomeExercice").value,
    };
    const btn = document.getElementById("saveBinomeBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveMyFiche(MY_BINOME.id, CURRENT_USER.email, content);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });

  document.getElementById("saveGesteBtn").addEventListener("click", async () => {
    if (!CURRENT_USER) return;
    const geste = document.getElementById("binomeGeste").value;
    const btn = document.getElementById("saveGesteBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveMyGeste(CURRENT_USER.uid, geste);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });
}

function partnerEmailOf(binome, myEmail) {
  return binome.membre1 === myEmail ? binome.membre2 : binome.membre1;
}

function renderBinome() {
  const noneCard = document.getElementById("binomeNoneCard");
  const card = document.getElementById("binomeCard");
  const gesteCard = document.getElementById("binomeGesteCard");
  const partnerCard = document.getElementById("binomePartnerCard");

  if (!MY_BINOME) {
    noneCard.style.display = "";
    card.style.display = "none";
    gesteCard.style.display = "none";
    partnerCard.style.display = "none";
    return;
  }
  noneCard.style.display = "none";
  card.style.display = "";
  gesteCard.style.display = "";
  partnerCard.style.display = "";

  const myEmail = CURRENT_USER.email.toLowerCase();
  const partnerEmail = partnerEmailOf(MY_BINOME, myEmail);
  const fiches = MY_BINOME.fiches || {};
  const myFiche = fiches[myEmail] || {};
  const partnerFiche = fiches[partnerEmail] || {};

  document.getElementById("binomePartnerHint").textContent = `(visible par ${partnerEmail})`;
  document.getElementById("binomePriere").value = myFiche.priereCible || "";
  document.getElementById("binomeZone").value = myFiche.zoneCaractere || "";
  document.getElementById("binomeExercice").value = myFiche.exerciceDuMois || "";

  document.getElementById("binomeGestePartnerName").textContent = partnerEmail;

  document.getElementById("binomePartnerName").textContent = partnerEmail;
  const disp = document.getElementById("binomePartnerDisplay");
  const hasContent = partnerFiche.priereCible || partnerFiche.zoneCaractere || partnerFiche.exerciceDuMois;
  disp.innerHTML = hasContent ? `
    <p class="settings-hint"><strong>Prière :</strong> ${escapeAttr(partnerFiche.priereCible || "—")}</p>
    <p class="settings-hint"><strong>Zone de caractère :</strong> ${escapeAttr(partnerFiche.zoneCaractere || "—")}</p>
    <p class="settings-hint"><strong>Exercice du mois :</strong> ${escapeAttr(partnerFiche.exerciceDuMois || "—")}</p>
  ` : `<p class="empty-hint" style="display:block;">${escapeAttr(partnerEmail)} n'a pas encore rempli sa fiche.</p>`;
}

function renderGeste() {
  const input = document.getElementById("binomeGeste");
  if (input) input.value = MY_GESTE;
}

/* ---------- Gestion des binômes (coordinateurs uniquement) ---------- */
async function loadBinomesManager() {
  if (!IS_ADMIN) return;
  try {
    const [summaries, binomes] = await Promise.all([
      window.AbbaSync.loadAllSummaries(),
      window.AbbaSync.loadAllBinomes(),
    ]);
    const nameByEmail = {};
    const uidByEmail = {};
    summaries.forEach(s => {
      if (s.email) {
        nameByEmail[s.email.toLowerCase()] = s.nom || s.email;
        uidByEmail[s.email.toLowerCase()] = s.uid;
      }
    });

    const sel1 = document.getElementById("binomeMembre1");
    const sel2 = document.getElementById("binomeMembre2");
    const options = summaries
      .filter(s => s.email)
      .map(s => `<option value="${escapeAttr(s.email)}">${escapeAttr(s.nom || s.email)}</option>`)
      .join("");
    sel1.innerHTML = `<option value="">— Choisir le 1er Bâtisseur —</option>` + options;
    sel2.innerHTML = `<option value="">— Choisir le 2e Bâtisseur —</option>` + options;

    const wrap = document.getElementById("binomesList");
    wrap.innerHTML = "";
    if (binomes.length === 0) {
      wrap.innerHTML = `<p class="empty-hint" style="display:block;">Aucun binôme créé pour l'instant.</p>`;
    }
    binomes.forEach(b => {
      const nom1 = nameByEmail[b.membre1] || b.membre1;
      const nom2 = nameByEmail[b.membre2] || b.membre2;
      const row = document.createElement("div");
      row.className = "editor-item-row";
      row.innerHTML = `
        <span class="text-input" style="border:none;padding:8px 0;">${escapeAttr(nom1)} 🤝 ${escapeAttr(nom2)}</span>
        <button type="button" class="editor-del-item" title="Délier">🗑</button>
      `;
      row.querySelector(".editor-del-item").addEventListener("click", async () => {
        if (!confirm(`Délier ${nom1} et ${nom2} ?`)) return;
        try {
          await window.AbbaSync.deleteBinome(b.id, uidByEmail[b.membre1], uidByEmail[b.membre2]);
          loadBinomesManager();
        } catch (err) {
          alert("Impossible de délier ce binôme.");
          console.error(err);
        }
      });
      wrap.appendChild(row);
    });
  } catch (err) {
    console.error("Chargement des binômes :", err);
  }

  document.getElementById("createBinomeBtn").onclick = async () => {
    const e1 = document.getElementById("binomeMembre1").value;
    const e2 = document.getElementById("binomeMembre2").value;
    const errEl = document.getElementById("binomeManagerError");
    errEl.textContent = "";
    if (!e1 || !e2) { errEl.textContent = "Choisis les deux Bâtisseurs."; return; }
    if (e1 === e2) { errEl.textContent = "Choisis deux Bâtisseurs différents."; return; }
    try {
      const summaries = await window.AbbaSync.loadAllSummaries();
      const s1 = summaries.find(s => (s.email || "").toLowerCase() === e1.toLowerCase());
      const s2 = summaries.find(s => (s.email || "").toLowerCase() === e2.toLowerCase());
      if (!s1 || !s2) { errEl.textContent = "Bâtisseur introuvable — réessaie."; return; }
      await window.AbbaSync.createBinome({ email: s1.email, uid: s1.uid }, { email: s2.email, uid: s2.uid }, CURRENT_USER.email);
      loadBinomesManager();
    } catch (err) {
      errEl.textContent = "Impossible de créer ce binôme. Vérifie ta connexion.";
      console.error(err);
    }
  };
}

/* ============================================================
   ZONES DE CARACTÈRE
   ============================================================ */
const NIVEAUX_ZONE = [
  { valeur: "difficulte", label: "En difficulté" },
  { valeur: "progresse", label: "Je progresse" },
  { valeur: "maitrisee", label: "Maîtrisée" },
];

function setupZones() {
  document.getElementById("saveZonesBtn").addEventListener("click", async () => {
    if (!CURRENT_USER) return;
    const mk = currentMonthKey();
    const evaluation = {};
    ZONES_CONFIG.forEach(z => {
      const niveau = document.querySelector(`input[name="zoneNiveau_${z.id}"]:checked`);
      const note = document.getElementById(`zoneNote_${z.id}`);
      evaluation[z.id] = { niveau: niveau ? niveau.value : "", note: note ? note.value : "" };
    });
    const btn = document.getElementById("saveZonesBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveMyZonesMonth(CURRENT_USER.uid, mk, evaluation);
      window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { zonesMoisFait: mk }).catch(() => {});
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });

  document.getElementById("addZoneBtn")?.addEventListener("click", () => {
    EDIT_ZONES.push({ id: "zone_" + Date.now(), titre: "Nouvelle zone" });
    renderZonesEditorDom();
  });
  document.getElementById("saveZonesConfigBtn")?.addEventListener("click", async () => {
    const clean = EDIT_ZONES.map(z => ({ ...z, titre: z.titre.trim() })).filter(z => z.titre !== "");
    if (clean.length === 0) { alert("Ajoute au moins une zone."); return; }
    const btn = document.getElementById("saveZonesConfigBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveZonesConfig(clean);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });
}

function renderZones() {
  const card = document.getElementById("zonesCard");
  const wrap = document.getElementById("zonesList");
  if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";

  const mk = currentMonthKey();
  document.getElementById("zonesMonthLabel").textContent = fmtMonthLabel(mk);
  const monthData = MY_ZONES[mk] || {};

  wrap.innerHTML = "";
  ZONES_CONFIG.forEach(z => {
    const current = monthData[z.id] || {};
    const row = document.createElement("div");
    row.className = "editor-category";
    const niveauxHtml = NIVEAUX_ZONE.map(n => `
      <label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:13px;">
        <input type="radio" name="zoneNiveau_${z.id}" value="${n.valeur}" ${current.niveau === n.valeur ? "checked" : ""}>
        ${n.label}
      </label>
    `).join("");
    row.innerHTML = `
      <p style="font-weight:600;font-size:13.5px;margin:0 0 8px;">${escapeAttr(z.titre)}</p>
      <div style="margin-bottom:8px;">${niveauxHtml}</div>
      <input type="text" id="zoneNote_${z.id}" class="text-input" placeholder="Note (facultatif)" value="${escapeAttr(current.note || "")}">
    `;
    wrap.appendChild(row);
  });

  renderZonesHistory();
}

function renderZonesHistory() {
  const wrap = document.getElementById("zonesHistory");
  const emptyEl = document.getElementById("zonesHistoryEmpty");
  const months = Object.keys(MY_ZONES).sort((a, b) => b.localeCompare(a)).slice(0, 12);
  wrap.innerHTML = "";
  emptyEl.style.display = months.length === 0 ? "block" : "none";
  months.forEach(mk => {
    const data = MY_ZONES[mk];
    const row = document.createElement("div");
    row.className = "editor-category";
    const lignes = ZONES_CONFIG.map(z => {
      const d = data[z.id];
      if (!d || !d.niveau) return "";
      const label = (NIVEAUX_ZONE.find(n => n.valeur === d.niveau) || {}).label || d.niveau;
      return `<p class="settings-hint" style="margin:2px 0;">${escapeAttr(z.titre)} — ${escapeAttr(label)}${d.note ? " · " + escapeAttr(d.note) : ""}</p>`;
    }).join("");
    row.innerHTML = `<p style="font-weight:600;font-size:13px;margin:0 0 4px;">${fmtMonthLabel(mk)}</p>${lignes}`;
    wrap.appendChild(row);
  });
}

/* ---------- Éditeur des zones (coordinateurs uniquement) ---------- */
function renderZonesEditor() {
  if (!IS_ADMIN || !document.getElementById("zonesEditor")) return;
  EDIT_ZONES = deepClone(ZONES_CONFIG);
  renderZonesEditorDom();
}
function renderZonesEditorDom() {
  const wrap = document.getElementById("zonesEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  EDIT_ZONES.forEach((z, i) => {
    const row = document.createElement("div");
    row.className = "editor-item-row";
    row.innerHTML = `
      <input type="text" class="text-input editor-item-label" value="${escapeAttr(z.titre)}">
      <button type="button" class="editor-del-item" title="Supprimer">🗑</button>
    `;
    row.querySelector(".editor-item-label").addEventListener("input", (e) => { EDIT_ZONES[i].titre = e.target.value; });
    row.querySelector(".editor-del-item").addEventListener("click", () => {
      if (!confirm(`Supprimer la zone "${EDIT_ZONES[i].titre}" ?`)) return;
      EDIT_ZONES.splice(i, 1);
      renderZonesEditorDom();
    });
    wrap.appendChild(row);
  });
}


/* ============================================================
   DIMENSIONS — les 8 dimensions de l'Homme Fait, objectif libre du mois
   ============================================================ */
function computeDimensionsPct(mk) {
  const total = DIMENSIONS_KEYS.length;
  let atteintes = 0;
  DIMENSIONS_KEYS.forEach(d => {
    const rec = (MY_DIMENSIONS[d.key] || {})[mk];
    if (rec && rec.statut === "atteint") atteintes++;
  });
  return Math.round((atteintes / total) * 100);
}

async function saveDimension(key) {
  if (!CURRENT_USER) return;
  const mk = currentMonthKey();
  const objectif = document.getElementById("dim_" + key + "_objectif").value.trim();
  const statutInput = document.querySelector(`input[name="dimStatut_${key}"]:checked`);
  const noteInput = document.getElementById("dim_" + key + "_note").value.trim();

  const existing = (MY_DIMENSIONS[key] || {})[mk] || {};
  const notes = Array.isArray(existing.notes) ? [...existing.notes] : [];
  if (noteInput) {
    const jour = new Date().toISOString().slice(0, 10);
    notes.push({ text: noteInput, date: jour });
  }
  const data = { objectif, statut: statutInput ? statutInput.value : "", notes };

  const btn = document.getElementById("dim_" + key + "_save");
  const original = btn.textContent;
  try {
    await window.AbbaSync.saveMyDimensionMonth(CURRENT_USER.uid, key, mk, data);
    if (!MY_DIMENSIONS[key]) MY_DIMENSIONS[key] = {};
    MY_DIMENSIONS[key][mk] = data;
    const pct = computeDimensionsPct(mk);
    window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { dimensionsPct: pct, dimensionsMoisRef: mk }).catch(() => {});
    document.getElementById("dim_" + key + "_note").value = ""; // prêt pour la prochaine note
    btn.textContent = "Enregistré ✓";
    setTimeout(() => btn.textContent = original, 1400);
    renderDimensions();
  } catch (err) {
    alert("Impossible d'enregistrer. Vérifie ta connexion.");
    console.error(err);
  }
}

function renderDimensions() {
  const wrap = document.getElementById("dimensionsCards");
  if (!wrap) return;
  const mk = currentMonthKey();

  wrap.innerHTML = "";
  DIMENSIONS_KEYS.forEach(d => {
    const rec = (MY_DIMENSIONS[d.key] || {})[mk] || {};
    const card = document.createElement("div");
    card.className = "card";
    const radios = STATUTS_OBJECTIF.map(s => `
      <label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:13px;">
        <input type="radio" name="dimStatut_${d.key}" value="${s.valeur}" ${rec.statut === s.valeur ? "checked" : ""}>
        ${s.label}
      </label>
    `).join("");
    card.innerHTML = `
      <p class="eyebrow">${d.icone} ${escapeAttr(d.titre)} — ${fmtMonthLabel(mk)}</p>
      <label class="field"><span>Mon objectif ce mois-ci</span>
        <input type="text" id="dim_${d.key}_objectif" class="text-input" value="${escapeAttr(rec.objectif || "")}">
      </label>
      <div style="margin:10px 0;">${radios}</div>
      <label class="field"><span>Ajouter une note</span>
        <input type="text" id="dim_${d.key}_note" class="text-input" placeholder="S'ajoute à la suite des notes précédentes — visible dans Mon historique en bas">
      </label>
      <button class="btn-primary" id="dim_${d.key}_save" type="button" style="margin-top:10px;">Enregistrer</button>
    `;
    card.querySelector(`#dim_${d.key}_save`).addEventListener("click", () => saveDimension(d.key));
    wrap.appendChild(card);
  });

  renderDimensionsHistory();
}

function renderDimensionsHistory() {
  const wrap = document.getElementById("dimensionsHistory");
  const emptyEl = document.getElementById("dimensionsHistoryEmpty");
  const allMonths = new Set();
  DIMENSIONS_KEYS.forEach(d => Object.keys(MY_DIMENSIONS[d.key] || {}).forEach(mk => allMonths.add(mk)));
  const months = Array.from(allMonths).sort((a, b) => b.localeCompare(a)).slice(0, 12);
  wrap.innerHTML = "";
  emptyEl.style.display = months.length === 0 ? "block" : "none";
  const statutLabel = (v) => (STATUTS_OBJECTIF.find(s => s.valeur === v) || {}).label || v;
  months.forEach(mk => {
    const row = document.createElement("div");
    row.className = "editor-category";
    let html = `<p style="font-weight:600;font-size:13px;margin:0 0 4px;">${fmtMonthLabel(mk)} — ${computeDimensionsPct(mk)}%</p>`;
    DIMENSIONS_KEYS.forEach(d => {
      const rec = (MY_DIMENSIONS[d.key] || {})[mk];
      if (rec && rec.objectif) {
        html += `<p class="settings-hint" style="margin:6px 0 0;"><strong>${d.icone} ${escapeAttr(rec.objectif)}</strong> — ${escapeAttr(statutLabel(rec.statut))}</p>`;
        const notes = Array.isArray(rec.notes) ? rec.notes : [];
        notes.forEach(n => {
          html += `<p class="settings-hint" style="margin:1px 0 0 20px;font-size:12px;">📝 ${escapeAttr(n.date)} — ${escapeAttr(n.text)}</p>`;
        });
      }
    });
    row.innerHTML = html;
    wrap.appendChild(row);
  });
}

/* ============================================================
   PRÉSENCE AUX SÉANCES (marquée par le coordinateur)
   ============================================================ */
function setupSeances() {
  document.getElementById("addSeanceForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = document.getElementById("seanceTitre").value.trim();
    const date = document.getElementById("seanceDate").value;
    if (!titre || !date) return;
    try {
      await window.AbbaSync.createSeance(titre, date, CURRENT_USER.email);
      document.getElementById("addSeanceForm").reset();
    } catch (err) {
      alert("Impossible de créer la séance. Vérifie ta connexion.");
      console.error(err);
    }
  });
}

/* ---------- Vue personnelle : mon suivi de présence ---------- */
function renderPresence() {
  const wrap = document.getElementById("presenceList");
  const emptyEl = document.getElementById("presenceEmpty");
  const tauxHint = document.getElementById("presenceTauxHint");
  if (!wrap || !CURRENT_USER) return;

  wrap.innerHTML = "";
  emptyEl.style.display = SEANCES.length === 0 ? "block" : "none";

  let marquees = 0, presentes = 0;
  const myUid = CURRENT_USER.uid;
  SEANCES.forEach(s => {
    const rec = (s.presences || {})[myUid];
    if (rec) { marquees++; if (rec.present) presentes++; }
    const row = document.createElement("div");
    row.className = "agenda-item";
    let statutTxt = "Non marqué", statutColor = "var(--ink-soft)";
    if (rec) {
      statutTxt = rec.present ? "✓ Présent" : "✗ Absent";
      statutColor = rec.present ? "var(--sage)" : "var(--brick)";
    }
    row.innerHTML = `
      <div class="agenda-item-body">
        <div class="agenda-item-title">${escapeAttr(s.titre)}</div>
        <div class="agenda-item-meta">${s.date ? fmtMonthLabel(s.date.slice(0,7)) + " · " + s.date.slice(8,10) : ""} — <span style="color:${statutColor};font-weight:600;">${statutTxt}</span></div>
      </div>
    `;
    wrap.appendChild(row);
  });

  tauxHint.textContent = marquees > 0
    ? `${presentes}/${marquees} séances marquées présent (${Math.round((presentes / marquees) * 100)}%)`
    : "Aucune séance marquée pour l'instant.";
}

/* ---------- Gestion des séances (coordinateurs uniquement) ---------- */
async function renderSeancesAdmin() {
  if (!IS_ADMIN) return;
  const wrap = document.getElementById("seancesAdminList");
  if (!wrap) return;

  let summaries = [];
  try { summaries = await window.AbbaSync.loadAllSummaries(); } catch (err) { console.error(err); }
  const membres = summaries.filter(s => s.email).map(s => ({ uid: s.uid, nom: s.nom || s.email }));

  wrap.innerHTML = "";
  SEANCES.forEach(s => {
    const bodyId = "seance-body-" + s.id;
    const arrowId = "seance-arrow-" + s.id;
    const card = document.createElement("div");
    card.className = "accord-item";

    // Générer les lignes membres
    const lignesMembres = membres.map(m => {
      const rec = (s.presences || {})[m.uid];
      return { uid: m.uid, nom: m.nom, present: rec ? rec.present : null };
    });

    card.innerHTML = `
      <div class="accord-head" style="display:flex;align-items:center;gap:8px;">
        <button type="button" style="flex:1;background:none;border:none;text-align:left;cursor:pointer;padding:0;font-family:inherit;"
          onclick="toggleAccord('${bodyId}','${arrowId}')">
          <span style="font-weight:600;font-size:13.5px;">${escapeAttr(s.titre)} — ${escC(s.date || "")}</span>
        </button>
        <span id="${arrowId}" class="accord-arrow" onclick="toggleAccord('${bodyId}','${arrowId}')" style="cursor:pointer;">▸</span>
        <button type="button" class="editor-del-cat" title="Supprimer la séance" data-seance-id="${escC(s.id)}">🗑</button>
      </div>
      <div id="${bodyId}" style="display:none;" class="seance-membres-wrap">
        ${lignesMembres.map(m => `
          <div class="editor-item-row" id="seance-row-${escC(s.id)}-${escC(m.uid)}">
            <span class="text-input" style="border:none;padding:6px 0;flex:1;">${escapeAttr(m.nom)}</span>
            <button type="button" class="btn-secondary presence-btn" data-present="true"
              data-sid="${escC(s.id)}" data-uid="${escC(m.uid)}" data-nom="${escapeAttr(m.nom)}"
              style="${m.present === true ? 'background:var(--sage);color:#fff;' : ''}">Présent</button>
            <button type="button" class="btn-secondary presence-btn" data-present="false"
              data-sid="${escC(s.id)}" data-uid="${escC(m.uid)}" data-nom="${escapeAttr(m.nom)}"
              style="${m.present === false ? 'background:var(--brick);color:#fff;' : ''}">Absent</button>
          </div>`).join("")}
      </div>`;

    card.querySelector(".editor-del-cat").addEventListener("click", async () => {
      if (!confirm(`Supprimer la séance "${s.titre}" ?`)) return;
      try { await window.AbbaSync.deleteSeance(s.id); } catch (err) { alert("Impossible de supprimer."); console.error(err); }
    });

    card.querySelectorAll(".presence-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const present = btn.dataset.present === "true";
        const sid = btn.dataset.sid;
        const uid = btn.dataset.uid;
        const nom = btn.dataset.nom;
        try {
          await window.AbbaSync.markPresence(sid, uid, nom, present);
          // Mettre à jour le style sans rechargement
          const row = document.getElementById(`seance-row-${sid}-${uid}`);
          if (row) {
            row.querySelectorAll(".presence-btn").forEach(b => b.style = "");
            btn.style.background = present ? "var(--sage)" : "var(--brick)";
            btn.style.color = "#fff";
          }
        } catch (err) {
          alert("Impossible d'enregistrer la présence.");
          console.error(err);
        }
      });
    });

    wrap.appendChild(card);
  });
}

/* ============================================================
   RÉSUMÉ POUR RAPPORT SEMESTRIEL (coordinateurs)
   ============================================================ */

/* ============================================================
   RAPPORT DE LA PROMOTION (coordinateurs) : état actuel de la formation, à partir de la liste des étudiants
   ============================================================ */
function calculerRapport(rows, maintenant) {
  const jours = (ms) => (ms ? Math.floor(((maintenant || Date.now()) - ms) / 86400000) : null);
  const R = rows.filter(r => r.a);
  const statut = (r) => r.a.termine ? "Terminé" : r.a.bloque ? "Bloqué" : (r.a.indispo && r.a.indispo.actif) ? "Indisponible" : "En formation";
  const enF = R.filter(r => statut(r) === "En formation");
  const dj = (r) => jours(r.a.lastMs);
  const rien = enF.filter(r => r.a.modules.every(m => !m.started && !m.complete));
  const g = {
    total: rows.length, termines: R.filter(r => statut(r) === "Terminé").length, bloques: R.filter(r => statut(r) === "Bloqué").length,
    indispos: R.filter(r => statut(r) === "Indisponible").length, enFormation: enF.length, rien: rien.length,
    actifs: enF.filter(r => dj(r) !== null && dj(r) <= 7).length,
    arelancer: enF.filter(r => dj(r) !== null && dj(r) >= 8 && dj(r) < 30).length,
    abandon: enF.filter(r => dj(r) !== null && dj(r) >= 30).length,
    sansDonnees: rows.length - R.length,
  };
  const modeles = (R[0] && R[0].a.modules) || [];
  const parModule = modeles.map((mod, i) => {
    const lignes = R.map(r => ({ r, m: r.a.modules[i] })).filter(x => x.m);
    return {
      n: mod.n,
      valides: lignes.filter(x => x.m.complete).length,
      enCours: R.filter(r => statut(r) === "En formation" && r.a.current && r.a.current.n === mod.n).length,
      renvoyees: lignes.filter(x => !x.m.complete && x.m.fiche === "returned").length,
      qcmRates: lignes.filter(x => !x.m.complete && x.m.qcm && !x.m.qcm.ok && x.m.qcm.essais >= 3).length,
      bloques: R.filter(r => r.a.current && r.a.current.n === mod.n && r.a.current.started && r.a.refMs && jours(r.a.refMs) >= 21 && statut(r) === "En formation").length,
    };
  });
  const corr = {};
  R.forEach(r => r.a.modules.filter(m => m.fiche === "submitted").forEach(m => {
    const k = r.correcteur || "Pas de correcteur attribué";
    const c = corr[k] = corr[k] || { nom: k, nb: 0, plus: 0 };
    c.nb++; c.plus = Math.max(c.plus, m.submittedAt ? jours(m.submittedAt) : 0);
  }));
  const sansCorrecteur = enF.filter(r => !r.correcteur).length;
  return { g, parModule, correcteurs: Object.values(corr).sort((a, b) => b.plus - a.plus), sansCorrecteur, date: new Date(maintenant || Date.now()).toLocaleDateString("fr-FR") };
}
function htmlRapport(d) {
  const td = "padding:5px 6px;border-bottom:1px solid var(--line);text-align:center;font-size:13px;";
  const th = "padding:5px 6px;border-bottom:2px solid var(--line);text-align:center;font-size:12px;";
  const g = d.g;
  let h = `<p class="small" style="margin-top:12px;"><strong>État au ${escC(d.date)}</strong></p>
    <p class="small">👥 <strong>${g.total}</strong> étudiant(s) · ✅ ${g.termines} ont terminé · 📚 ${g.enFormation} en formation${g.bloques ? ` · ⛔ ${g.bloques} bloqué(s)` : ""}${g.indispos ? ` · ⏸ ${g.indispos} indisponible(s)` : ""}</p>
    <p class="small">Parmi ceux qui sont en formation : 🟢 <strong>${g.actifs}</strong> actifs (7 derniers jours) · 🟠 <strong>${g.arelancer}</strong> à relancer (8 à 29 jours sans activité) · 🔴 <strong>${g.abandon}</strong> risque d'abandon (30 jours ou plus)${g.rien ? ` · ⚪ ${g.rien} n'ont encore rien commencé` : ""}.</p>`;
  if (g.sansDonnees) h += `<p class="settings-hint">${g.sansDonnees} étudiant(s) sans données (compte récent ou non synchronisé).</p>`;
  h += `<p class="eyebrow" style="margin-top:14px;">Module par module</p>
    <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><tr><th style="${th}text-align:left;">Module</th><th style="${th}">Ont validé</th><th style="${th}">En cours</th><th style="${th}">Fiches renvoyées</th><th style="${th}">Questions ratées 3×+</th><th style="${th}">Bloqués 3 sem.+</th></tr>`
    + d.parModule.map(m => `<tr><td style="${td}text-align:left;"><strong>M${escC(m.n)}</strong></td><td style="${td}">${m.valides}</td><td style="${td}">${m.enCours}</td><td style="${td}${m.renvoyees ? "font-weight:700;" : ""}">${m.renvoyees}</td><td style="${td}${m.qcmRates ? "font-weight:700;" : ""}">${m.qcmRates}</td><td style="${td}${m.bloques ? "font-weight:700;" : ""}">${m.bloques}</td></tr>`).join("")
    + `</table></div><p class="settings-hint">Les colonnes en gras montrent où ça coûte : fiches renvoyées par le correcteur, questions ratées trois fois ou plus, étudiants bloqués sur le même module depuis plus de trois semaines.</p>`;
  h += `<p class="eyebrow" style="margin-top:14px;">Corrections en attente</p>`;
  h += d.correcteurs.length
    ? d.correcteurs.map(c => `<p class="small"><strong>${escC(c.nom)}</strong> — ${c.nb} fiche(s)${c.plus >= 1 ? ` · la plus ancienne attend depuis ${c.plus} jour(s)` : ""}${c.plus >= 3 ? " ⚠" : ""}</p>`).join("")
    : `<p class="small">✅ Aucune fiche en attente.</p>`;
  if (d.sansCorrecteur) h += `<p class="small">⚠ ${d.sansCorrecteur} étudiant(s) en formation n'ont pas de correcteur attribué.</p>`;
  return h;
}
function tableauRapport(rows) {
  const jours = (ms) => (ms ? Math.floor((Date.now() - ms) / 86400000) : "");
  const colonnes = ["Nom", "Statut", "Correcteur", "Modules validés", "Module en cours", "Jours sans activité", "Fiches en attente", "Fiches renvoyées", "Alertes"];
  const lignes = rows.filter(r => r.a).map(r => {
    const a = r.a, st = a.termine ? "Terminé" : a.bloque ? "Bloqué" : (a.indispo && a.indispo.actif) ? "Indisponible" : "En formation";
    return [r.nom || r.email || "", st, r.correcteur || "", `${a.valides}/${a.total}`, a.termine ? "" : (a.current ? "M" + a.current.n : ""), jours(a.lastMs),
      a.modules.filter(m => m.fiche === "submitted").length, a.modules.filter(m => !m.complete && m.fiche === "returned").length, (r.alertes || []).join(" | ")];
  });
  return { colonnes, lignes };
}
const csvCase = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
function setupRapport() {
  const gen = document.getElementById("genRapportBtn"); if (!gen) return;
  let dernier = null;
  gen.addEventListener("click", () => {
    const out = document.getElementById("rapportOut");
    if (!LAST_COORD_ROWS || !LAST_COORD_ROWS.length) { out.innerHTML = `<p class="settings-hint">La liste des étudiants n'est pas encore chargée : patiente quelques secondes, puis réessaie.</p>`; return; }
    dernier = tableauRapport(LAST_COORD_ROWS);
    out.innerHTML = htmlRapport(calculerRapport(LAST_COORD_ROWS));
    document.getElementById("rapportActions").style.display = "";
    if (window.__pointDuMois) window.__pointDuMois();
  });
  document.getElementById("rapportCopier").addEventListener("click", () => {
    if (!dernier) return;
    const txt = [dernier.colonnes].concat(dernier.lignes).map(l => l.map(v => String(v).replace(/[\t\n\r]+/g, " ")).join("\t")).join("\n");
    const b = document.getElementById("rapportCopier"), orig = b.textContent;
    const fait = () => { b.textContent = "Copié ✓"; setTimeout(() => b.textContent = orig, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fait).catch(() => {});
    else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand && document.execCommand("copy"); ta.remove(); fait(); }
  });
  document.getElementById("rapportTelecharger").addEventListener("click", () => {
    if (!dernier) return;
    const csv = "\ufeff" + [dernier.colonnes].concat(dernier.lignes).map(l => l.map(csvCase).join(";")).join("\r\n");
    const nomFichier = "rapport-promotion-" + new Date().toISOString().slice(0, 10) + ".csv";
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      // L'application Android ne sait pas enregistrer un fichier : on envoie le tableau (dans l'adresse, jamais à un serveur) vers une page ouverte dans le navigateur
      const tsv = [dernier.colonnes].concat(dernier.lignes).map(l => l.map(v => String(v).replace(/[\t\n\r]+/g, " ")).join("\t")).join("\n");
      (async () => {
        const json = JSON.stringify({ n: nomFichier, c: csv, t: tsv });
        let oct = new TextEncoder().encode(json), mode = "p";
        try { if (window.CompressionStream) { oct = new Uint8Array(await new Response(new Blob([oct]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()); mode = "g"; } } catch (e) { mode = "p"; oct = new TextEncoder().encode(json); }
        let b = ""; for (let i = 0; i < oct.length; i += 8192) b += String.fromCharCode.apply(null, oct.subarray(i, i + 8192));
        const url = "https://abba-g.web.app/ABBA-Parcours/export.html#d=" + mode + ":" + btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (url.length > 200000) { alert("Le tableau est trop grand pour cette méthode : utilise « Copier le tableau »."); return; }
        location.href = url;
      })();
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nomFichier; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
}


/* ---------- Certificats de fin de formation délivrés à la main (personnes sans compte) ---------- */
function setupCertificats() {
  const gen = document.getElementById("certGenerer"); if (!gen) return;
  const S = () => window.AbbaSync, $ = (id) => document.getElementById(id);
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  $("certDate").value = aujourdhui();
  const telecharger = async (rec) => { const A = await import("./attestation.js"); return A.telecharger(rec, "fr"); };
  gen.addEventListener("click", async () => {
    const nom = $("certNom").value.trim().replace(/\s+/g, " "), date = $("certDate").value, err = $("certErr");
    err.textContent = "";
    if (nom.length < 3) { err.textContent = "Écris le nom complet de la personne."; return; }
    if (!date) { err.textContent = "Choisis la date du certificat."; return; }
    if (!confirm("Délivrer le certificat de fin de formation à :\n\n" + nom + "\n\nPense à vérifier l'orthographe : le nom ne pourra plus être modifié, seulement annulé puis refait.")) return;
    gen.disabled = true;
    try {
      const rec = await S().creerCertificatManuel(nom, date);
      $("certNom").value = "";
      err.textContent = ""; err.style.color = "var(--green, #2e7d4f)"; err.textContent = "Certificat créé : N° " + rec.numero;
      await telecharger(rec);
      if ($("certListe").innerHTML) $("certListeBtn").click();
    } catch (e) { err.style.color = ""; err.textContent = "Impossible de créer le certificat : " + (e.code || e.message); }
    gen.disabled = false;
  });
  let liste = [];
  const afficher = () => {
    const out = $("certListe");
    out.innerHTML = liste.length ? liste.map((c, i) => `<div class="enrollment-row" style="display:block;"><strong>${escC(c.nom)}</strong>
        <span class="enrollment-email">${escC(c.type === "parcours" ? "Certificat de fin de formation" : "Attestation de module")} · ${escC(c.date)} · N° ${escC(c.numero)}${c.source === "manuel" ? " · délivré à la main" : ""}</span>
        <button class="btn-secondary" data-cert-dl="${i}">Télécharger</button>${c.source === "manuel" ? ` <button class="btn-secondary" data-cert-annuler="${i}">Annuler ce certificat</button>` : ""}</div>`).join("")
      : '<p class="settings-hint">Aucun certificat pour le moment.</p>';
  };
  $("certListeBtn").addEventListener("click", async () => {
    $("certListe").innerHTML = '<p class="settings-hint">Chargement…</p>';
    try { liste = (await S().listCertificats()).filter(c => c.type === "parcours"); afficher(); }
    catch (e) { $("certListe").innerHTML = `<p class="auth-error">Impossible de lire la liste : ${escC(e.code || e.message)}</p>`; }
  });
  $("certListe").addEventListener("click", async (ev) => {
    const dl = ev.target.closest("[data-cert-dl]"), an = ev.target.closest("[data-cert-annuler]");
    if (dl) { try { await telecharger(liste[Number(dl.dataset.certDl)]); } catch (e) { alert("Téléchargement impossible : " + (e.code || e.message)); } }
    if (an) {
      const c = liste[Number(an.dataset.certAnnuler)];
      if (!c || !confirm("Annuler le certificat de " + c.nom + " (N° " + c.numero + ") ?\nSon QR de vérification ne marchera plus.")) return;
      try { await S().revoquerCertificat(c.numero); liste = liste.filter(x => x.numero !== c.numero); afficher(); }
      catch (e) { alert("Annulation impossible : " + (e.code || e.message)); }
    }
  });
}


/* ---------- Historique mensuel de la promotion ---------- */
function categorieRow(r, maintenant) {
  const a = r.a; if (!a) return null;
  if (a.termine) return "Terminé"; if (a.bloque) return "Bloqué"; if (a.indispo && a.indispo.actif) return "Indisponible";
  if (a.modules.every(m => !m.started && !m.complete)) return "Pas commencé";
  const d = a.lastMs ? Math.floor(((maintenant || Date.now()) - a.lastMs) / 86400000) : null;
  if (d === null) return "Pas commencé"; return d <= 7 ? "Actif" : d < 30 ? "À relancer" : "Risque d'abandon";
}
function instantane(rows) {
  const d = calculerRapport(rows), lignes = {};
  rows.filter(r => r.a).forEach(r => {
    lignes[r.uid] = [categorieRow(r), r.a.valides, r.a.total, r.a.lastMs ? Math.floor((Date.now() - r.a.lastMs) / 86400000) : -1, r.a.current ? String(r.a.current.n) : ""];
  });
  return { g: d.g, parModule: d.parModule, correcteurs: d.correcteurs, sansCorrecteur: d.sansCorrecteur, lignes };
}
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const libelleMois = (m) => { const x = /^(\d{4})-(\d{2})$/.exec(m || ""); return x ? MOIS_FR[Number(x[2]) - 1] + " " + x[1] : m; };
const moisCourant = () => new Date().toISOString().slice(0, 7);
function htmlHistorique(liste) {
  const td = "padding:5px 6px;border-bottom:1px solid var(--line);text-align:center;font-size:13px;";
  if (!liste.length) return '<p class="settings-hint">Aucun point enregistré pour le moment. Génère le rapport ci-dessus : le point du mois sera créé.</p>';
  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><tr><th style="${td}text-align:left;">Mois</th><th style="${td}">Étudiants</th><th style="${td}">En formation</th><th style="${td}">🟢 Actifs</th><th style="${td}">🟠 À relancer</th><th style="${td}">🔴 Abandon</th><th style="${td}">✅ Terminés</th><th style="${td}"></th></tr>`
    + liste.map(p => `<tr><td style="${td}text-align:left;"><strong>${escC(libelleMois(p.mois))}</strong></td><td style="${td}">${p.g.total}</td><td style="${td}">${p.g.enFormation}</td><td style="${td}">${p.g.actifs}</td><td style="${td}">${p.g.arelancer}</td><td style="${td}">${p.g.abandon}</td><td style="${td}">${p.g.termines}</td><td style="${td}"><button class="btn-secondary" data-hist="${escC(p.mois)}">Voir qui</button></td></tr>`).join("")
    + "</table></div>";
}
function htmlDetailMois(p, rows) {
  const noms = {}, actuel = {};
  (rows || []).forEach(r => { noms[r.uid] = r.nom || r.email || "—"; actuel[r.uid] = categorieRow(r); });
  const ordre = ["Actif", "À relancer", "Risque d'abandon", "Pas commencé", "Bloqué", "Indisponible", "Terminé"];
  const groupes = {}; Object.entries(p.lignes || {}).forEach(([uid, l]) => { (groupes[l[0]] = groupes[l[0]] || []).push([uid, l]); });
  let h = `<p class="eyebrow" style="margin-top:12px;">${escC(libelleMois(p.mois))} — qui était où</p>`;
  ordre.filter(k => groupes[k]).forEach(k => {
    h += `<p class="small" style="margin:8px 0 2px;"><strong>${escC(k)} (${groupes[k].length})</strong></p>`
      + groupes[k].sort((a, b) => (noms[a[0]] || "~").localeCompare(noms[b[0]] || "~")).map(([uid, l]) => {
        const auj = actuel[uid], change = auj && auj !== k ? ` <span class="enrollment-email">→ aujourd'hui : ${escC(auj)}</span>` : (!auj && !noms[uid] ? ' <span class="enrollment-email">(compte supprimé)</span>' : "");
        return `<p class="small" style="margin:0 0 2px;">• ${escC(noms[uid] || "—")} — ${l[1]}/${l[2]} modules${l[4] ? ", module en cours M" + escC(l[4]) : ""}${l[3] >= 0 ? `, ${l[3]} j sans activité` : ""}${change}</p>`;
      }).join("");
  });
  return h;
}
function setupHistorique() {
  const voir = document.getElementById("histVoir"); if (!voir) return;
  const S = () => window.AbbaSync, $ = (id) => document.getElementById(id);
  let liste = [];
  const enregistrer = async (silencieux) => {
    if (!LAST_COORD_ROWS || !LAST_COORD_ROWS.length) return false;
    try { await S().saveRapportMois(moisCourant(), instantane(LAST_COORD_ROWS)); return true; }
    catch (e) { if (!silencieux) alert("Point du mois non enregistré : " + (e.code || e.message)); return false; }
  };
  window.__pointDuMois = async () => {   // appelé quand le rapport est généré : crée le point du mois s'il n'existe pas encore
    try { if (!(await S().getRapportMois(moisCourant()))) await enregistrer(true); } catch (e) {}
  };
  voir.addEventListener("click", async () => {
    $("histOut").innerHTML = '<p class="settings-hint">Chargement…</p>';
    try { liste = await S().listRapports(); $("histOut").innerHTML = htmlHistorique(liste); $("histSave").style.display = ""; }
    catch (e) { $("histOut").innerHTML = `<p class="auth-error">Impossible de lire l'historique : ${escC(e.code || e.message)}</p>`; }
  });
  $("histSave").addEventListener("click", async () => {
    if (await enregistrer(false)) { $("histSave").textContent = "Point enregistré ✓"; setTimeout(() => $("histSave").textContent = "Mettre à jour le point de ce mois", 1800); voir.click(); }
  });
  $("histOut").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-hist]"); if (!b) return;
    const p = liste.find(x => x.mois === b.dataset.hist); if (!p) return;
    const zone = $("histDetail") || (() => { const d = document.createElement("div"); d.id = "histDetail"; $("histOut").appendChild(d); return d; })();
    zone.innerHTML = htmlDetailMois(p, LAST_COORD_ROWS);
  });
}

function setupResume() {
  setupHistorique();
  setupRapport();
  setupCertificats();
  document.getElementById("genResumeBtn").addEventListener("click", generateResume);
  document.getElementById("copyResumeBtn").addEventListener("click", () => {
    const ta = document.getElementById("resumeOutput");
    ta.select();
    navigator.clipboard && navigator.clipboard.writeText(ta.value).catch(() => {});
    document.execCommand && document.execCommand("copy");
    const btn = document.getElementById("copyResumeBtn");
    const original = btn.textContent;
    btn.textContent = "Copié ✓";
    setTimeout(() => btn.textContent = original, 1400);
  });
}

function moyenne(nums) {
  const valid = nums.filter(n => typeof n === "number" && !isNaN(n));
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
}

function generateResume() {
  const rows = LAST_COORD_ROWS;
  const total = rows.length;
  const mk = currentMonthKey();

  const dateDebut = document.getElementById("resumeDateDebut").value;
  const dateFin = document.getElementById("resumeDateFin").value;
  const seancesPeriode = SEANCES.filter(s => {
    if (dateDebut && s.date < dateDebut) return false;
    if (dateFin && s.date > dateFin) return false;
    return true;
  });

  const modulesPctParPersonne = rows.map(r => r.modulesTotal ? (r.modulesFaits / r.modulesTotal) * 100 : null);
  const moyModules = moyenne(modulesPctParPersonne.filter(v => v !== null));

  const moyDecl = moyenne(rows.map(r => r.declPct7).filter(v => v !== undefined));

  let presencesParPersonne = [];
  rows.forEach(r => {
    let marquees = 0, presentes = 0;
    seancesPeriode.forEach(s => {
      const rec = (s.presences || {})[r.uid];
      if (rec) { marquees++; if (rec.present) presentes++; }
    });
    if (marquees > 0) presencesParPersonne.push((presentes / marquees) * 100);
  });
  const moyPresence = moyenne(presencesParPersonne);
  const sous80 = presencesParPersonne.filter(p => p < 80).length;

  const avecMbti = rows.filter(r => r.mbti).length;

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const EN = !!(window.I18N && window.I18N.lang === "en");
  const T = (fr, en) => (EN ? en : fr);
  const periodeLabel = (dateDebut || dateFin)
    ? `${dateDebut || T("début", "start")} → ${dateFin || T("aujourd'hui", "today")}`
    : T("toutes les séances enregistrées", "all recorded sessions");

  const texte = EN
    ? `BUILDER COURSE SUMMARY — generated on ${dateStr}
———————————————————————————
Number of registered Builders: ${total}

ATTENDANCE — period: ${periodeLabel}
Number of sessions in this period: ${seancesPeriode.length}
Average attendance rate: ${moyPresence}%
  of which ${sous80} Builder(s) below the 80% threshold required by the charter

CURRENT STATUS (as of ${dateStr}, not tied to the period above):
Modules completed (average): ${moyModules}%
Daily declaration over the last 7 days (average): ${moyDecl}%
Builders who have filled in their profile (MBTI): ${avecMbti}/${total}
———————————————————————————`
    : `RÉSUMÉ PARCOURS BÂTISSEUR — généré le ${dateStr}
———————————————————————————
Nombre de Bâtisseurs inscrits : ${total}

PRÉSENCE — période : ${periodeLabel}
Nombre de séances sur cette période : ${seancesPeriode.length}
Taux de présence moyen : ${moyPresence}%
  dont ${sous80} Bâtisseur(s) sous le seuil de 80% exigé par la charte

ÉTAT ACTUEL (au ${dateStr}, non rattaché à la période ci-dessus) :
Modules validés (moyenne) : ${moyModules}%
Déclaration quotidienne sur les 7 derniers jours (moyenne) : ${moyDecl}%
Bâtisseurs ayant renseigné leur profil (MBTI) : ${avecMbti}/${total}
———————————————————————————`;

  const ta = document.getElementById("resumeOutput");
  ta.value = texte;
  ta.style.display = "block";
  document.getElementById("copyResumeBtn").style.display = "inline-block";
}

/* ============================================================
   ENROLLMENT — écran d'attente + panneau admin
   ============================================================ */
function showEnrollmentScreen(status) {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("enrollmentScreen").style.display = "flex";
  const msgs = {
    pending: { icone: "⏳", titre: "Accès en attente",
      texte: "Ta demande d'accès au Parcours Bâtisseur a bien été enregistrée. Le coordinateur doit la valider avant que tu puisses entrer." },
    refused: { icone: "❌", titre: "Accès refusé",
      texte: "Le coordinateur n'a pas validé ton accès. Contacte-le directement pour plus d'informations." },
  };
  const m = msgs[status] || msgs.pending;
  document.getElementById("enrollmentIcon").textContent  = m.icone;
  document.getElementById("enrollmentTitle").textContent = m.titre;
  document.getElementById("enrollmentText").textContent  = m.texte;
}

let ALL_ENROLLMENTS = [];
let unsubEnrollments = null;

function setupEnrollmentsAdmin() {
  if (!IS_ADMIN || unsubEnrollments) return;
  unsubEnrollments = window.AbbaSync.watchAllEnrollments("parcours", (list) => {
    ALL_ENROLLMENTS = list;
    renderEnrollmentsAdmin();
  });
}

async function renderDeletionRequests() {
  const box = document.getElementById("deletionRequestsBox"); if (!box) return;
  let list = [];
  try { list = await window.AbbaSync.loadDeletionRequests(); } catch (e) { box.innerHTML = ""; return; }
  if (!list.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<p class="eyebrow" style="margin-top:14px;">Demandes de suppression de compte</p>
    <p class="settings-hint">Ces personnes ont demandé la suppression de leur compte et de leurs données. Pour les supprimer proprement : GitHub → Actions → « Supprimer les comptes demandés » → Run workflow (d'abord en simulation, puis en écrivant SUPPRIMER). Les demandes traitées disparaissent d'elles-mêmes d'ici ; « Traité » sert seulement à retirer une demande sans rien supprimer.</p>` +
    list.map(d => `<div class="enrollment-row"><div><strong>${escC(d.nom || "—")}</strong><span class="enrollment-email">${escC(d.email || "")}</span></div><button class="btn-secondary" data-delreq="${escC(d.id)}">Traité</button></div>`).join("");
  box.querySelectorAll("[data-delreq]").forEach(b => b.addEventListener("click", async () => {
    try { await window.AbbaSync.cancelDeletionRequest(b.dataset.delreq); renderDeletionRequests(); }
    catch (e) { alert("Impossible de mettre à jour : " + (e.code || e.message)); }
  }));
}
const JOURNAL_LIBELLES = {
  coordinateur_ajoute: "Coordinateur ajouté", coordinateur_retire: "Coordinateur retiré", droits_modifies: "Droits modifiés",
  acces_bloque_modifie: "Accès bloqué / débloqué", modules_ouverts_modifies: "Modules ouverts modifiés", binome_cree: "Binôme créé",
  binome_supprime: "Binôme supprimé", seance_supprimee: "Séance supprimée", inscription_revue: "Inscription traitée",
  paiement_enregistre: "Versement enregistré", paiement_annule: "Versement annulé", declaration_traitee: "Déclaration de versement traitée",
  compte_paiement_active: "Compte de paiement activé", tarif_modifie: "Tarif modifié", instructions_paiement_modifiees: "Instructions de paiement modifiées",
  don_confirme: "Don confirmé", don_refuse: "Don refusé", solidarite_affectee: "Solidarité affectée", correcteur_ajoute: "Correcteur ajouté",
  correcteur_retire: "Correcteur retiré", lien_correcteur_pose: "Correcteur attribué", lien_correcteur_retire: "Correcteur retiré d'un élève",
  acquis_modifies: "Acquis modifiés", suivi_force: "Suivi forcé", fiche_revue: "Fiche corrigée", compte_supprime: "Compte supprimé (programme de suppression)", certificat_delivre: "Certificat de fin de formation délivré", certificat_manuel_delivre: "Certificat délivré à la main (sans compte)", certificat_revoque: "Certificat annulé",
};
async function renderJournal() {
  const box = document.getElementById("journalBox"); if (!box) return;
  const S = window.AbbaSync;
  const jCard = document.getElementById("journalCard");
  if (!S || !S.isAdminEmail(S.currentEmail())) { box.innerHTML = ""; if (jCard) jCard.style.display = "none"; return; }   // réservé au coordinateur principal
  if (jCard) jCard.style.display = "";
  box.innerHTML = `<p class="settings-hint">Qui a fait quoi, et quand (les 150 dernières actions). Une ligne ne peut plus être modifiée ni effacée.</p>
    <button class="btn-secondary" id="journalVoir" type="button">Afficher le journal</button><div id="journalListe"></div>`;
  document.getElementById("journalVoir").addEventListener("click", async () => {
    const out = document.getElementById("journalListe"); out.innerHTML = '<p class="settings-hint">Chargement…</p>';
    try {
      const list = await S.loadJournal(150);
      const noms = {}; try { (await S.loadAllSummaries()).forEach(s => { if (s.nom) noms[s.uid] = s.nom; }); } catch (e) {}
      const qui = (c) => (c && noms[c]) ? noms[c] : c;
      out.innerHTML = list.length ? list.map(j => {
        const d = j.date && j.date.toDate ? j.date.toDate().toLocaleString("fr-FR") : "…";
        return `<div class="enrollment-row" style="display:block;"><strong>${escC(JOURNAL_LIBELLES[j.action] || j.action)}</strong>
          <span class="enrollment-email">${escC(d)} · par ${escC(j.par)}</span>
          <span class="enrollment-email">${escC([qui(j.cible), j.detail].filter(Boolean).join(" — "))}</span></div>`;
      }).join("") : '<p class="settings-hint">Le journal est vide pour le moment.</p>';
    } catch (e) { out.innerHTML = `<p class="auth-error">Impossible de lire le journal : ${escC(e.code || e.message)}</p>`; }
  });
}
function renderEnrollmentsAdmin() {
  renderDeletionRequests();
  renderJournal();
  const container = document.getElementById("enrollmentsContainer");
  if (!container) return;

  const pending = ALL_ENROLLMENTS.filter(e => e.status === "pending");
  const active  = ALL_ENROLLMENTS.filter(e => e.status === "active");
  const refused = ALL_ENROLLMENTS.filter(e => e.status === "refused");
  const cEl = document.getElementById("coordDemandesCount"); if (cEl) cEl.textContent = pending.length ? "(" + pending.length + " en attente)" : "";

  const row = (e, mode) => {
    const uidS = String(e.uid || "").replace(/[^A-Za-z0-9_-]/g, "");   // identifiant nettoyé (sert dans les boutons)
    const nom  = escC(`${e.prenom || ""} ${e.nom || ""}`.trim() || e.email || "—");
    const date = e.requestedAt?.toDate ? e.requestedAt.toDate().toLocaleDateString(window.I18N && window.I18N.lang === "en" ? "en-US" : "fr-FR") : "—";
    const actions = mode === "pending"
      ? `<div class="enrollment-actions">
           <button class="btn-small btn-approve" onclick="approveEnrollment('${uidS}')">✓ Approuver</button>
           <button class="btn-small btn-refuse"  onclick="refuseEnrollment('${uidS}')">✕ Refuser</button>
         </div>`
      : mode === "refused"
      ? `<div class="enrollment-actions">
           <span class="enrollment-status-badge refused">✕ Refusé</span>
           <button class="btn-small btn-approve" onclick="approveEnrollment('${uidS}')" title="Réactiver">↩ Réactiver</button>
           <button class="btn-small btn-refuse" onclick="radierEnrollment('${uidS}')" title="Radier définitivement">⊗ Radier</button>
         </div>`
      : `<div class="enrollment-actions">
           <span class="enrollment-status-badge active">✓ Actif</span>
           <button class="btn-small btn-refuse" onclick="radierEnrollment('${uidS}')" title="Sortir du parcours">⊗ Sortir</button>
         </div>`;
    return `<div class="enrollment-row">
      <div class="enrollment-info">
        <span class="enrollment-name">${nom}</span>
        <span class="enrollment-email">${escC(e.email)}</span>
        <span class="enrollment-date">Demande : ${date}</span>
        ${e.telephone ? `<span class="enrollment-email">Tél : ${escC(e.telephone)}</span>` : ""}
        ${e.naissance ? `<span class="enrollment-email">Né(e) le ${escC(e.naissance)}${ageFromBirth(e.naissance) !== null ? " · " + ageFromBirth(e.naissance) + " ans" : ""}</span>` : ""}
        ${e.mineur ? `<span class="enrollment-email" style="color:var(--brick);font-weight:600;">Mineur(e) : autorisation parentale déclarée — ${escC(e.tuteurNom || "?")}, ${escC(e.tuteurTel || "?")}</span>` : ""}
      </div>
      ${actions}
    </div>`;
  };

  // Accordéon par groupe
  const groupHtml = (id, label, color, items, mode, defaultOpen) => {
    if (!items.length && mode !== "pending") return "";
    const bodyId = "enroll-body-" + id;
    const arrowId = "enroll-arrow-" + id;
    return `
      <button class="accord-head" onclick="toggleAccord('${bodyId}','${arrowId}')">
        <span style="color:${color};font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;">${label} (${items.length})</span>
        <span id="${arrowId}" class="accord-arrow">${defaultOpen ? "▾" : "▸"}</span>
      </button>
      <div id="${bodyId}" style="${defaultOpen ? "" : "display:none;"}padding-top:4px;">
        ${items.length ? items.map(e => row(e, mode)).join("") : '<p class="settings-hint">Aucune demande en attente.</p>'}
      </div>`;
  };

  container.innerHTML =
    groupHtml("pending", "En attente", "var(--gold)",   pending, "pending", true) +
    groupHtml("active",  "Actifs",     "#4C7A5E",       active,  "active",  false) +
    groupHtml("refused", "Refusés",    "var(--brick)",   refused, "refused", false);
}

window.approveEnrollment = async (uid) => {
  await window.AbbaSync.reviewEnrollment(uid, "parcours", "active", CURRENT_USER.email);
};
window.refuseEnrollment = async (uid) => {
  if (!confirm("Refuser l'accès à ce Bâtisseur ?")) return;
  await window.AbbaSync.reviewEnrollment(uid, "parcours", "refused", CURRENT_USER.email);
};
window.radierEnrollment = async (uid) => {
  if (!confirm("Sortir définitivement ce Bâtisseur du Parcours ? Son nom disparaîtra des listes.")) return;
  await window.AbbaSync.reviewEnrollment(uid, "parcours", "radie", CURRENT_USER.email);
};

/* ============================================================
   ACCORDÉON GÉNÉRIQUE
   ============================================================ */
window.toggleAccord = function(bodyId, arrowId) {
  const body  = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  if (!body) return;
  const open = body.style.display === "none" || body.style.display === "";
  // Si pas encore affiché (display none par défaut via style attr)
  const isHidden = body.style.display === "none" || body.style.display === "";
  body.style.display = isHidden ? "block" : "none";
  if (arrow) arrow.textContent = isHidden ? "▾" : "▸";
};


/* ============================================================
   TAILLE DU TEXTE (bouton « Aa » en haut) — retenue sur l'appareil
   ============================================================ */
const TAILLES = [1, 1.15, 1.3, 1.5, 1.7];
function appliquerTaille(i) {
  const n = Math.min(TAILLES.length - 1, Math.max(0, i));
  document.documentElement.style.setProperty("--tl", String(TAILLES[n]));
  try { localStorage.setItem("abba_taille_texte", String(n)); } catch { /* ignoré */ }
  const lib = document.getElementById("tailleVal");
  if (lib) lib.textContent = `${Math.round(TAILLES[n] * 100)} %`;
  return n;
}
function setupTaille() {
  let idx = Number(localStorage.getItem("abba_taille_texte"));
  idx = appliquerTaille(Number.isFinite(idx) ? idx : 0);
  const bouton = document.getElementById("tailleToggle");
  if (!bouton) return;
  const boite = document.createElement("div");
  boite.id = "tailleBox"; boite.className = "taille-box"; boite.hidden = true;
  boite.innerHTML = `<span class="taille-t">Taille du texte</span>
    <button type="button" class="taille-b" data-t="-" aria-label="Réduire le texte">A−</button>
    <span id="tailleVal" class="taille-v"></span>
    <button type="button" class="taille-b" data-t="+" aria-label="Agrandir le texte">A+</button>
    <button type="button" class="taille-r" data-t="0" aria-label="Taille normale">↺</button>`;
  document.body.appendChild(boite);
  appliquerTaille(idx);
  bouton.addEventListener("click", (e) => { e.stopPropagation(); boite.hidden = !boite.hidden; });
  boite.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    idx = appliquerTaille(b.dataset.t === "+" ? idx + 1 : b.dataset.t === "-" ? idx - 1 : 0);
  });
  document.addEventListener("click", (e) => { if (!boite.hidden && !boite.contains(e.target)) boite.hidden = true; });
}

/* ============================================================
   PROTECTION DES LEÇONS, QUESTIONS ET EXERCICES contre le copier-coller
   (pas la Bible, ni les profils MBTI, ni la déclaration ; les champs de saisie restent libres)
   ============================================================ */
const ZONE_PROTEGEE = "#formationRoot .fm-lecon:not([data-mbti]) .fm-texte, #formationRoot .fm-q, #formationRoot .fm-ex-body";
function setupProtection() {
  const dans = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest(ZONE_PROTEGEE) && !el.closest("input,textarea,select,[contenteditable='true']"); };
  ["contextmenu", "dragstart", "selectstart"].forEach((ev) => document.addEventListener(ev, (e) => { if (dans(e.target)) e.preventDefault(); }, true));
  ["copy", "cut"].forEach((ev) => document.addEventListener(ev, (e) => {
    const s = window.getSelection && window.getSelection();
    if (dans(e.target) || (s && s.anchorNode && dans(s.anchorNode))) { e.preventDefault(); if (e.clipboardData) e.clipboardData.setData("text/plain", ""); }
  }, true));
}


/* Carte « Installer l'application Android » : seulement sur un téléphone Android, dans le navigateur (pas dans l'APK) */
function setupInstallCard() {
  const carte = document.getElementById("installAndroidCard");
  if (!carte) return;
  const android = /Android/i.test(navigator.userAgent);
  const natif = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  carte.hidden = !(android && !natif);
}


/* ============================================================
   DIAGNOSTIC (Réglages) : vérifie le réseau, le compte, le contenu et la base de données
   ============================================================ */
function setupDiagnostic() {
  const btn = document.getElementById("diagBtn"), out = document.getElementById("diagOut");
  if (!btn || !out) return;
  const en = () => !!(window.I18N && window.I18N.lang === "en");
  const t = (fr, e) => (en() ? e : fr);
  const avecDelai = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error("timeout")), ms))]);
  const mesure = async (nom, f, ms = 8000) => {
    const d = Date.now();
    try { const r = await avecDelai(f(), ms); return `✓ ${nom} : OK (${Date.now() - d} ms)${typeof r === "string" && r ? " · " + r : ""}`; }
    catch (e) { return e.message === "timeout" ? `✗ ${nom} : ${t("pas de réponse après", "no answer after")} ${ms / 1000} s` : `✗ ${nom} : ${e.message || e}`; }
  };
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const lignes = [];
    const montrer = () => { out.textContent = lignes.join("\n"); };
    const natif = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    lignes.push(`${t("Application", "App")} : ${natif ? "APK Android" : t("navigateur", "browser")} · ${t("langue", "language")} ${en() ? "en" : "fr"}`);
    lignes.push(`${t("Réseau du téléphone", "Phone network")} : ${navigator.onLine ? t("en ligne", "online") : t("hors ligne", "offline")}`);
    try { const noms = await caches.keys(); lignes.push(`${t("Version du cache", "Cache version")} : ${noms.filter((n) => n.startsWith("abba-parcours")).join(", ") || "—"}`); } catch { /* ignoré */ }
    montrer();
    const S = window.AbbaSync;
    let user = null;
    if (S) {
      user = await new Promise((ok) => { let un = null; const fin = setTimeout(() => ok(null), 4000); un = S.watchAuth((u) => { clearTimeout(fin); ok(u || null); try { un && un(); } catch { /* ignoré */ } }); });
    }
    lignes.push(`${t("Compte", "Account")} : ${user ? t("connecté", "signed in") + " (" + (user.email || "") + ")" : t("non connecté", "not signed in")}`);
    montrer();
    lignes.push(await mesure(t("Contenu des leçons", "Lesson content"), async () => { const r = await fetch("content/m01.json", { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); await r.json(); }));
    montrer();
    lignes.push(await mesure(t("Bible (index)", "Bible (index)"), async () => { const r = await fetch("/bible/index.json", { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); await r.json(); }));
    montrer();
    if (S && user) {
      lignes.push(await mesure(t("Base de données (profil)", "Database (profile)"), () => S.getUserProfile(user.uid)));
      montrer();
      lignes.push(await mesure(t("Base de données (correcteur)", "Database (corrector)"), () => S.amICorrecteur(user.email)));
      montrer();
    }
    const erreurs = (window.__abbaErrs || []).slice(-4);
    lignes.push(erreurs.length ? `${t("Erreurs récentes", "Recent errors")} :\n  - ${erreurs.join("\n  - ")}` : `${t("Erreurs récentes", "Recent errors")} : ${t("aucune", "none")}`);
    montrer();
    btn.disabled = false;
  });
}

/* ---------- Pages lues dans l'application (ex. confidentialité) : on reste sur l'écran en cours, bouton Retour ---------- */
function ouvrirCadre(url) {
  if (document.getElementById("cadreOverlay")) return;
  const en = !!(window.I18N && window.I18N.lang === "en");
  const ov = document.createElement("div"); ov.id = "cadreOverlay"; ov.className = "cadre-overlay";
  ov.innerHTML = `<div class="cadre-barre"><button type="button" class="cadre-retour" id="cadreFermer">← ${en ? "Back" : "Retour"}</button></div>`;
  const fr = document.createElement("iframe"); fr.className = "cadre-iframe"; fr.title = en ? "Privacy policy" : "Politique de confidentialité";
  fr.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cadre=1" + (en ? "#en" : "");
  ov.appendChild(fr); document.body.appendChild(ov);
  try { history.pushState({ cadre: 1 }, ""); } catch (e) {}
  const fermer = () => { ov.remove(); window.removeEventListener("popstate", fermer); };
  window.addEventListener("popstate", fermer);   // le bouton « retour » du téléphone referme la page au lieu de quitter l'application
  document.getElementById("cadreFermer").addEventListener("click", () => { if (history.state && history.state.cadre) history.back(); else fermer(); });
}
document.addEventListener("click", (ev) => {
  const a = ev.target && ev.target.closest ? ev.target.closest("a[data-cadre]") : null;
  if (!a) return;
  ev.preventDefault(); ouvrirCadre(a.getAttribute("href"));
});
