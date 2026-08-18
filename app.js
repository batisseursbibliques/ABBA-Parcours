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
let unsubAdmins = null;
let unsubModulesConfig = null;
let unsubParcours = null;
let unsubBinome = null;
let MY_BINOME = null;

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupTabs();
  setupAuthScreen();
  setupModulesEditor();
  setupCoordModules();
  setupBinome();

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

  if (!user) {
    CURRENT_USER = null;
    IS_ADMIN = false;
    MODULES_CONFIG = [];
    MODULES_TERMINES = [];
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }

  CURRENT_USER = user;
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("accountEmailHint").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;
  document.getElementById("accountEmailHintAccueil").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;

  try {
    CURRENT_PROFILE = await window.AbbaSync.getUserProfile(user.uid) || {};
  } catch (err) {
    CURRENT_PROFILE = {};
  }

  unsubAdmins = window.AbbaSync.watchAdmins((emails) => {
    const isBootstrap = window.AbbaSync.isAdminEmail(user.email);
    const inList = (emails || []).map(e => e.toLowerCase()).includes(user.email.toLowerCase());
    IS_ADMIN = isBootstrap || inList;
    document.querySelectorAll(".admin-only").forEach(el => { el.style.display = IS_ADMIN ? "" : "none"; });
    renderModulesEditor();
    if (IS_ADMIN) { renderCoordModules(); loadBinomesManager(); }
  });

  unsubModulesConfig = window.AbbaSync.watchModulesConfig((list) => {
    MODULES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_MODULES);
    renderModulesList();
    renderModulesEditor();
  });

  unsubParcours = window.AbbaSync.watchParcours(user.uid, (modulesTermines) => {
    MODULES_TERMINES = modulesTermines || [];
    renderModulesList();
    pushModulesSummary();
  });

  // Cherche si je fais partie d'un binôme, puis écoute son contenu en direct
  try {
    const pair = await window.AbbaSync.findMyBinome(user.email);
    if (pair) {
      unsubBinome = window.AbbaSync.watchBinome(pair.id, (data) => {
        MY_BINOME = data;
        renderBinome();
      });
    } else {
      MY_BINOME = null;
      renderBinome();
    }
  } catch (err) {
    console.error("Recherche binôme :", err);
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
  body.innerHTML = `<tr><td colspan="3">Chargement…</td></tr>`;
  try {
    const rows = await window.AbbaSync.loadAllSummaries();
    rows.sort((a, b) => (b.modulesFaits || 0) - (a.modulesFaits || 0));
    body.innerHTML = "";
    emptyHint.style.display = rows.length === 0 ? "block" : "none";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nom || r.email || "—"}</td>
        <td>${r.telephone || "—"}</td>
        <td>${r.modulesTotal ? `${r.modulesFaits || 0}/${r.modulesTotal}` : "—"}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="3">Erreur de chargement.</td></tr>`;
    console.error(err);
  }
}

/* ============================================================
   FICHE BINÔME
   ============================================================ */
function setupBinome() {
  document.getElementById("saveBinomeBtn").addEventListener("click", async () => {
    if (!MY_BINOME) return;
    const content = {
      priereCible: document.getElementById("binomePriere").value,
      gesteDuMois: document.getElementById("binomeGeste").value,
      zoneCaractere: document.getElementById("binomeZone").value,
      exerciceDuMois: document.getElementById("binomeExercice").value,
    };
    const btn = document.getElementById("saveBinomeBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveBinomeContent(MY_BINOME.id, content);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });
}
function renderBinome() {
  const noneCard = document.getElementById("binomeNoneCard");
  const card = document.getElementById("binomeCard");
  if (!MY_BINOME) {
    noneCard.style.display = "";
    card.style.display = "none";
    return;
  }
  noneCard.style.display = "none";
  card.style.display = "";

  const myEmail = CURRENT_USER.email.toLowerCase();
  const partnerEmail = MY_BINOME.membre1 === myEmail ? MY_BINOME.membre2 : MY_BINOME.membre1;
  document.getElementById("binomePartnerHint").textContent = `Ton binôme : ${partnerEmail}`;
  document.getElementById("binomePriere").value = MY_BINOME.priereCible || "";
  document.getElementById("binomeGeste").value = MY_BINOME.gesteDuMois || "";
  document.getElementById("binomeZone").value = MY_BINOME.zoneCaractere || "";
  document.getElementById("binomeExercice").value = MY_BINOME.exerciceDuMois || "";
  const updHint = document.getElementById("binomeUpdatedHint");
  updHint.textContent = MY_BINOME.updatedAt ? "Dernière mise à jour récente" : "";
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
    summaries.forEach(s => { if (s.email) nameByEmail[s.email.toLowerCase()] = s.nom || s.email; });

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
          await window.AbbaSync.deleteBinome(b.id);
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
      await window.AbbaSync.createBinome(e1, e2, CURRENT_USER.email);
      loadBinomesManager();
    } catch (err) {
      errEl.textContent = "Impossible de créer ce binôme. Vérifie ta connexion.";
      console.error(err);
    }
  };
}
