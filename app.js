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
  if (unsubGeste) { unsubGeste(); unsubGeste = null; }
  if (unsubZonesConfig) { unsubZonesConfig(); unsubZonesConfig = null; }
  if (unsubMyZones) { unsubMyZones(); unsubMyZones = null; }
  Object.values(unsubDimensions).forEach(fn => fn && fn());
  unsubDimensions = {};

  if (!user) {
    CURRENT_USER = null;
    IS_ADMIN = false;
    MODULES_CONFIG = [];
    MODULES_TERMINES = [];
    ZONES_CONFIG = [];
    MY_ZONES = {};
    MY_DIMENSIONS = {};
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
    renderZonesEditor();
    if (IS_ADMIN) { renderCoordModules(); loadBinomesManager(); }
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
  body.innerHTML = `<tr><td colspan="5">Chargement…</td></tr>`;
  try {
    const rows = await window.AbbaSync.loadAllSummaries();
    rows.sort((a, b) => (b.modulesFaits || 0) - (a.modulesFaits || 0));
    body.innerHTML = "";
    emptyHint.style.display = rows.length === 0 ? "block" : "none";
    const mk = currentMonthKey();
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const dimPct = r.dimensionsMoisRef === mk ? `${r.dimensionsPct || 0}%` : "—";
      tr.innerHTML = `
        <td>${r.nom || r.email || "—"}</td>
        <td>${r.telephone || "—"}</td>
        <td>${r.modulesTotal ? `${r.modulesFaits || 0}/${r.modulesTotal}` : "—"}</td>
        <td>${r.zonesMoisFait === mk ? "✓" : "—"}</td>
        <td>${dimPct}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5">Erreur de chargement.</td></tr>`;
    console.error(err);
  }
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
  const note = document.getElementById("dim_" + key + "_note").value.trim();
  const data = { objectif, statut: statutInput ? statutInput.value : "", note };

  const btn = document.getElementById("dim_" + key + "_save");
  const original = btn.textContent;
  try {
    await window.AbbaSync.saveMyDimensionMonth(CURRENT_USER.uid, key, mk, data);
    if (!MY_DIMENSIONS[key]) MY_DIMENSIONS[key] = {};
    MY_DIMENSIONS[key][mk] = data;
    const pct = computeDimensionsPct(mk);
    window.AbbaSync.saveModulesSummary(CURRENT_USER.uid, { dimensionsPct: pct, dimensionsMoisRef: mk }).catch(() => {});
    btn.textContent = "Enregistré ✓";
    setTimeout(() => btn.textContent = original, 1400);
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
      <label class="field"><span>Note (facultatif)</span>
        <input type="text" id="dim_${d.key}_note" class="text-input" value="${escapeAttr(rec.note || "")}">
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
        html += `<p class="settings-hint" style="margin:2px 0;">${d.icone} ${escapeAttr(rec.objectif)} — ${escapeAttr(statutLabel(rec.statut))}</p>`;
      }
    });
    row.innerHTML = html;
    wrap.appendChild(row);
  });
}
