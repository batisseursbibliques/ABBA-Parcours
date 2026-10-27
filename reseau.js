// reseau.js — bandeau clair sur l'état de la connexion et de l'enregistrement des réponses.
//   📴 hors connexion : « ce que tu fais est gardé sur ton téléphone, envoyé au retour du réseau »
//   ⏳ envoi en cours : des modifications attendent encore l'accord du serveur
//   ✅ tout est enregistré : affiché 4 secondes après un retour au calme
// Aucun calcul sur les données de l'étudiant : on demande seulement à Firestore si des écritures attendent (waitForPendingWrites).

const TEXTES = {
  fr: {
    horsLigneRien: "📴 Pas de connexion. Tu peux continuer : ce que tu fais est gardé sur ton téléphone et sera envoyé dès que le réseau revient.",
    horsLigneAttente: "📴 Pas de connexion. Tes modifications sont gardées sur ton téléphone et seront envoyées dès que le réseau revient. Ne vide pas les données de l'application d'ici là.",
    envoi: "⏳ Envoi de tes modifications…",
    ok: "✅ Tout est enregistré.",
  },
  en: {
    horsLigneRien: "📴 No connection. You can keep going: what you do is kept on your phone and will be sent as soon as the network is back.",
    horsLigneAttente: "📴 No connection. Your changes are kept on your phone and will be sent as soon as the network is back. Do not clear the app’s data until then.",
    envoi: "⏳ Sending your changes…",
    ok: "✅ Everything is saved.",
  },
};

// Décide de ce qu'il faut afficher (fonction pure : testable sans navigateur)
export function etatAffiche({ horsLigne, enAttente, vientDeSynchroniser }) {
  if (horsLigne) return { niveau: "hors", cle: enAttente ? "horsLigneAttente" : "horsLigneRien" };
  if (enAttente) return { niveau: "envoi", cle: "envoi" };
  if (vientDeSynchroniser) return { niveau: "ok", cle: "ok" };
  return null;
}

export function initReseau({ attendreEcritures, estHorsLigne, langue, doc }) {
  const d = doc || document;
  let barre = null, horsLigne = estHorsLigne(), enAttente = false, vientDeSynchroniser = false, minuteurOk = null, sonde = null;

  function dessiner() {
    const e = etatAffiche({ horsLigne, enAttente, vientDeSynchroniser });
    if (!e) { if (barre) { barre.remove(); barre = null; d.body.classList.remove("reseau-actif"); } return; }
    if (!barre) {
      barre = d.createElement("div"); barre.className = "reseau-bar"; barre.setAttribute("role", "status"); barre.setAttribute("aria-live", "polite");
      d.body.insertBefore(barre, d.body.firstChild); d.body.classList.add("reseau-actif");
    }
    barre.dataset.niveau = e.niveau;
    barre.textContent = (TEXTES[langue() === "en" ? "en" : "fr"])[e.cle];
    d.body.style.setProperty("--reseau-h", barre.offsetHeight + "px");
  }
  function terminerOk() {
    vientDeSynchroniser = true; dessiner();
    clearTimeout(minuteurOk); minuteurOk = setTimeout(() => { vientDeSynchroniser = false; dessiner(); }, 4000);
  }
  // Y a-t-il des écritures en attente ? On interroge Firestore, au plus une question à la fois.
  function sonder() {
    if (sonde) return;
    let fini = false;
    sonde = attendreEcritures().then(() => { fini = true; sonde = null; if (enAttente) { enAttente = false; if (!horsLigne) terminerOk(); else dessiner(); } }).catch(() => { fini = true; sonde = null; });
    setTimeout(() => { if (!fini && !enAttente) { enAttente = true; dessiner(); } }, 700);
  }
  const majReseau = () => {
    const avant = horsLigne; horsLigne = estHorsLigne();
    if (avant && !horsLigne) { sonder(); }    // retour du réseau : on vérifie ce qui reste à envoyer
    dessiner();
  };
  window.addEventListener("offline", majReseau);
  window.addEventListener("online", majReseau);
  setInterval(() => { if (!d.hidden) sonder(); }, 3000);   // détecte les écritures faites entre-temps
  sonder(); dessiner();
  return { sonder, etat: () => ({ horsLigne, enAttente }) };
}
