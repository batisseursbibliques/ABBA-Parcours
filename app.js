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
  { id: "z6", titre: "Parole" },
];
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthLabel(mk) {
  const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const [y, m] = mk.split("-").map(Number);
  return `${MOIS[m-1]} ${y}`;
}
let unsubAdmins = null;
let unsubModulesConfig = null;
let unsubParcours = null;
let unsubBinome = null;
let unsubGeste = null;
let MY_BINOME = null;
let MY_GESTE = "";

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
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
   AUTHENTIFICATION (connexion seule — le compte se crée sur ABBA Life)
   ============================================================ */
/* ============================================================
   ENROLLMENT — écran d'attente et gestion admin
   ============================================================ */
function showEnrollmentScreen(status) {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "none";
  const screen = document.getElementById("enrollmentScreen");
  screen.style.display = "flex";

  const msg = status === "refused"
    ? { titre: "Accès refusé", texte: "Le coordinateur n'a pas pu valider ton accès au Parcours Bâtisseur. Contacte-le directement pour plus d'informations.", icone: "❌" }
    : { titre: "Accès en attente", texte: "Ta demande d'accès au Parcours Bâtisseur a bien été enregistrée. Le coordinateur doit la valider avant que tu puisses entrer. Tu recevras un accès dès qu'il aura approuvé ta demande.", icone: "⏳" };

  document.getElementById("enrollmentTitle").textContent = msg.titre;
  document.getElementById("enrollmentText").textContent = msg.texte;
  document.getElementById("enrollmentIcon").textContent = msg.icone;
}

// Gestion admin des enrollments — appelée dans renderCoordModules
let ALL_ENROLLMENTS = [];
let unsubEnrollments = null;

function setupEnrollmentsAdmin() {
  if (!IS_ADMIN) return;
  if (unsubEnrollments) return; // déjà actif
  unsubEnrollments = window.AbbaSync.watchPendingEnrollments("parcours", (list) => {
    ALL_ENROLLMENTS = list;
    renderEnrollmentsAdmin();
  });
}

function renderEnrollmentsAdmin() {
  const container = document.getElementById("enrollmentsContainer");
  if (!container) return;

  const pending  = ALL_ENROLLMENTS.filter(e => e.status === "pending");
  const active   = ALL_ENROLLMENTS.filter(e => e.status === "active");
  const refused  = ALL_ENROLLMENTS.filter(e => e.status === "refused");

  const rowHtml = (e, showActions) => {
    const nom = `${e.prenom || ""} ${e.nom || ""}`.trim() || e.email;
    const date = e.requestedAt?.toDate ? e.requestedAt.toDate().toLocaleDateString("fr-FR") : "—";
    return `<div class="enrollment-row">
      <div class="enrollment-info">
        <span class="enrollment-name">${nom}</span>
        <span class="enrollment-email">${e.email}</span>
        <span class="enrollment-date">Demande : ${date}</span>
      </div>
      ${showActions ? `
        <div class="enrollment-actions">
          <button class="btn-small btn-approve" onclick="approveEnrollment('${e.uid}')">✓ Approuver</button>
          <button class="btn-small btn-refuse"  onclick="refuseEnrollment('${e.uid}')">✕ Refuser</button>
        </div>` : `<span class="enrollment-status-badge ${e.status}">${e.status === "active" ? "✓ Actif" : "✕ Refusé"}</span>`}
    </div>`;
  };

  container.innerHTML = `
    ${pending.length ? `
      <p class="eyebrow" style="color:var(--gold);">En attente (${pending.length})</p>
      ${pending.map(e => rowHtml(e, true)).join("")}
    ` : `<p class="settings-hint">Aucune demande en attente.</p>`}
    ${active.length ? `
      <p class="eyebrow" style="margin-top:16px;">Accès actifs (${active.length})</p>
      ${active.map(e => rowHtml(e, false)).join("")}
    ` : ""}
    ${refused.length ? `
      <p class="eyebrow" style="margin-top:16px;color:var(--brick);">Refusés (${refused.length})</p>
      ${refused.map(e => rowHtml(e, false)).join("")}
    ` : ""}
  `;
}

window.approveEnrollment = async function(uid) {
  await window.AbbaSync.reviewEnrollment(uid, "parcours", "active", CURRENT_USER.email);
};
window.refuseEnrollment = async function(uid) {
  if (!confirm("Refuser l'accès à ce Bâtisseur ?")) return;
  await window.AbbaSync.reviewEnrollment(uid, "parcours", "refused", CURRENT_USER.email);
};

/* ============================================================
   FIN ENROLLMENT
   ============================================================ */

function setupAuthScreen() {
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    try {
      await window.AbbaSync.logIn(email, password);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await window.AbbaSync.logOut();
  });
}
function traduireErreurAuth(err) {
  const code = err && err.code ? err.code : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-mail ou mot de passe incorrect.";
  if (code.includes("invalid-email")) return "Adresse e-mail invalide.";
  if (code.includes("network-request-failed")) return "Pas de connexion internet. Réessaie plus tard.";
  return "Une erreur est survenue. Réessaie.";
}

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

  // ── Vérification enrollment ──────────────────────────────────
  // Les admins passent directement — ils n'ont pas besoin d'enrollment
  const isBootstrapAdmin = window.AbbaSync.isAdminEmail(user.email);
  if (!isBootstrapAdmin) {
    try {
      CURRENT_PROFILE = await window.AbbaSync.getUserProfile(user.uid) || {};
    } catch (e) { CURRENT_PROFILE = {}; }

    const enrollment = await window.AbbaSync.getMyEnrollment(user.uid, "parcours");

    if (!enrollment) {
      // Première connexion → créer la demande automatiquement
      await window.AbbaSync.requestEnrollment(
        user.uid, "parcours",
        CURRENT_PROFILE.nom || "", CURRENT_PROFILE.prenom || "", user.email
      );
      showEnrollmentScreen("pending");
      return;
    }
    if (enrollment.status === "pending") {
      showEnrollmentScreen("pending");
      return;
    }
    if (enrollment.status === "refused") {
      showEnrollmentScreen("refused");
      return;
    }
    // status === "active" → on continue normalement
  }
  // ── Fin vérification enrollment ──────────────────────────────

  document.getElementById("authScreen").style.display = "none";
  document.getElementById("enrollmentScreen").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("accountEmailHint").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;
  document.getElementById("accountEmailHintAccueil").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;

  try {
    if (!CURRENT_PROFILE || !Object.keys(CURRENT_PROFILE).length) {
      CURRENT_PROFILE = await window.AbbaSync.getUserProfile(user.uid) || {};
    }
  } catch (err) {
    CURRENT_PROFILE = {};
  }

  unsubAdmins = window.AbbaSync.watchAdmins((emails) => {
    const isBootstrap = window.AbbaSync.isAdminEmail(user.email);
    const inList = (emails || []).map(e => e.toLowerCase()).includes(user.email.toLowerCase());
    IS_ADMIN = isBootstrap || inList;
    document.querySelectorAll(".admin-only").forEach(el => { el.style.display = IS_ADMIN ? "" : "none"; });
    renderModulesEditor();
    renderZonesEditor();
    if (IS_ADMIN) { renderCoordModules(); loadBinomesManager(); renderSeancesAdmin(); setupEnrollmentsAdmin(); }
  });

  unsubModulesConfig = window.AbbaSync.watchModulesConfig((list) => {
    MODULES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_MODULES);
    renderModulesList();
    renderModulesEditor();
  });

  unsubZonesConfig = window.AbbaSync.watchZonesConfig((list) => {
    ZONES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_ZONES);
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
  document.getElementById("addModuleBtn").addEventListener("click", () => {
    EDIT_MODULES.push({ id: "mod_" + Date.now(), titre: "Nouveau module" });
    renderModulesEditorDom();
  });
  document.getElementById("saveModulesBtn").addEventListener("click", async () => {
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
  if (!IS_ADMIN) return;
  EDIT_MODULES = deepClone(MODULES_CONFIG);
  renderModulesEditorDom();
}
function renderModulesEditorDom() {
  const wrap = document.getElementById("modulesEditor");
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
async function renderCoordModules() {
  if (!IS_ADMIN) return;
  const body = document.getElementById("coordModulesBody");
  const emptyHint = document.getElementById("coordModulesEmpty");
  body.innerHTML = `<tr><td colspan="8">Chargement…</td></tr>`;
  try {
    // Charger uniquement les UIDs avec enrollment actif pour "parcours"
    const activeEnrollments = await window.AbbaSync.loadActiveEnrollments("parcours");
    const activeUids = new Set(activeEnrollments.map(e => e.uid));

    const allRows = await window.AbbaSync.loadAllSummaries();
    // Admin bootstrap voit tout ; sinon filtrer par enrollment actif
    const rows = window.AbbaSync.isAdminEmail(CURRENT_USER?.email)
      ? allRows  // Paul voit tout même sans enrollment
      : allRows.filter(r => activeUids.has(r.uid));
    rows.sort((a, b) => (b.modulesFaits || 0) - (a.modulesFaits || 0));
    LAST_COORD_ROWS = rows;
    body.innerHTML = "";
    emptyHint.style.display = rows.length === 0 ? "block" : "none";
    const mk = currentMonthKey();
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const dimPct = r.dimensionsMoisRef === mk ? `${r.dimensionsPct || 0}%` : "—";
      let marquees = 0, presentes = 0;
      SEANCES.forEach(s => {
        const rec = (s.presences || {})[r.uid];
        if (rec) { marquees++; if (rec.present) presentes++; }
      });
      const presPct = marquees > 0 ? `${Math.round((presentes / marquees) * 100)}%` : "—";
      tr.innerHTML = `
        <td>${r.nom || r.email || "—"}</td>
        <td>${r.telephone || "—"}</td>
        <td>${r.modulesTotal ? `${r.modulesFaits || 0}/${r.modulesTotal}` : "—"}</td>
        <td>${r.zonesMoisFait === mk ? "✓" : "—"}</td>
        <td>${dimPct}</td>
        <td>${presPct}</td>
        <td>${r.pctToday !== undefined ? r.pctToday + "%" : "—"}</td>
        <td>${r.streak !== undefined ? r.streak + "j" : "—"}</td>
      `;
      body.appendChild(tr);
    });
    renderCoordProfils(rows);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8">Erreur de chargement.</td></tr>`;
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
    const row = document.createElement("div");
    row.className = "editor-category";
    row.innerHTML = `
      <p style="font-weight:600;font-size:13px;margin:0 0 4px;">${escapeAttr(r.nom || r.email)}</p>
      ${r.mbti ? `<p class="settings-hint" style="margin:2px 0;">Type MBTI : <strong>${escapeAttr(r.mbti)}</strong></p>` : ""}
      ${r.donsSpirituels ? `<p class="settings-hint" style="margin:2px 0;">Dons : ${escapeAttr(r.donsSpirituels)}</p>` : ""}
    `;
    wrap.appendChild(row);
  });
}

/* ============================================================
   MON PROFIL (MBTI, dons spirituels)
   ============================================================ */
function setupProfilFormation() {
  document.getElementById("saveProfilBtn").addEventListener("click", async () => {
    if (!CURRENT_USER) return;
    const mbti = document.getElementById("profilMbti").value;
    const donsSpirituels = document.getElementById("profilDons").value.trim();
    const btn = document.getElementById("saveProfilBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveMyProfilFormation(CURRENT_USER.uid, { mbti, donsSpirituels });
      // Poussé aussi dans le résumé partagé pour que le coordinateur le voie
      window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { mbti, donsSpirituels }).catch(() => {});
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Erreur technique : " + (err && err.message ? err.message : String(err)));
      console.error(err);
    }
  });
}
function renderProfilFormation() {
  const mbtiSel = document.getElementById("profilMbti");
  const donsInput = document.getElementById("profilDons");
  if (!mbtiSel || !donsInput) return;
  mbtiSel.value = MY_PROFIL.mbti || "";
  donsInput.value = MY_PROFIL.donsSpirituels || "";
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

  document.getElementById("addZoneBtn").addEventListener("click", () => {
    EDIT_ZONES.push({ id: "zone_" + Date.now(), titre: "Nouvelle zone" });
    renderZonesEditorDom();
  });
  document.getElementById("saveZonesConfigBtn").addEventListener("click", async () => {
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
  if (!IS_ADMIN) return;
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
    const card = document.createElement("div");
    card.className = "editor-category";
    card.innerHTML = `
      <div class="editor-cat-head">
        <span style="font-weight:600;font-size:13.5px;flex:1;">${escapeAttr(s.titre)} — ${s.date || ""}</span>
        <button type="button" class="editor-del-cat" title="Supprimer la séance">🗑</button>
      </div>
      <div class="seance-membres"></div>
    `;
    card.querySelector(".editor-del-cat").addEventListener("click", async () => {
      if (!confirm(`Supprimer la séance "${s.titre}" ?`)) return;
      try { await window.AbbaSync.deleteSeance(s.id); } catch (err) { alert("Impossible de supprimer."); console.error(err); }
    });
    const membresWrap = card.querySelector(".seance-membres");
    membres.forEach(m => {
      const rec = (s.presences || {})[m.uid];
      const row = document.createElement("div");
      row.className = "editor-item-row";
      row.innerHTML = `
        <span class="text-input" style="border:none;padding:6px 0;flex:1;">${escapeAttr(m.nom)}</span>
        <button type="button" class="btn-secondary presence-btn" data-present="true" style="${rec && rec.present ? 'background:var(--sage);color:#fff;' : ''}">Présent</button>
        <button type="button" class="btn-secondary presence-btn" data-present="false" style="${rec && !rec.present ? 'background:var(--brick);color:#fff;' : ''}">Absent</button>
      `;
      row.querySelectorAll(".presence-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const present = btn.dataset.present === "true";
          try {
            await window.AbbaSync.markPresence(s.id, m.uid, m.nom, present);
          } catch (err) {
            alert("Impossible d'enregistrer la présence.");
            console.error(err);
          }
        });
      });
      membresWrap.appendChild(row);
    });
    wrap.appendChild(card);
  });
}

/* ============================================================
   RÉSUMÉ POUR RAPPORT SEMESTRIEL (coordinateurs)
   ============================================================ */
function setupResume() {
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

  const dimPctParPersonne = rows.filter(r => r.dimensionsMoisRef === mk).map(r => r.dimensionsPct || 0);
  const moyDim = moyenne(dimPctParPersonne);

  const espritPctParPersonne = rows.map(r => r.pctToday);
  const moyEsprit = moyenne(espritPctParPersonne);

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
  const periodeLabel = (dateDebut || dateFin)
    ? `${dateDebut || "début"} → ${dateFin || "aujourd'hui"}`
    : "toutes les séances enregistrées";

  const texte = `RÉSUMÉ PARCOURS BÂTISSEUR — généré le ${dateStr}
———————————————————————————
Nombre de Bâtisseurs inscrits : ${total}

PRÉSENCE — période : ${periodeLabel}
Nombre de séances sur cette période : ${seancesPeriode.length}
Taux de présence moyen : ${moyPresence}%
  dont ${sous80} Bâtisseur(s) sous le seuil de 80% exigé par la charte

ÉTAT ACTUEL (au ${dateStr}, non rattaché à la période ci-dessus) :
Avancement modules (moyenne) : ${moyModules}%
Régularité spirituelle du jour (moyenne) : ${moyEsprit}%
Dimensions de l'Homme Fait — objectifs atteints ce mois-ci (moyenne) : ${moyDim}%
Bâtisseurs ayant renseigné leur profil (MBTI) : ${avecMbti}/${total}
———————————————————————————`;

  const ta = document.getElementById("resumeOutput");
  ta.value = texte;
  ta.style.display = "block";
  document.getElementById("copyResumeBtn").style.display = "inline-block";
}
