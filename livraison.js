// livraison.js — remettre un fichier à l'étudiant : téléchargement direct dans le navigateur,
// ou (application Android, qui ne sait pas enregistrer un fichier) ouverture d'une page dans le navigateur du téléphone.
// Les données voyagent dans l'adresse de la page (après le #) : elles ne sont envoyées à aucun serveur.
export const estAppAndroid = () => !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
const HOTE = "https://abba-g.web.app/ABBA-Parcours/";   // adresse volontairement hors de la liste de l'application : Android l'ouvre dans le navigateur

export function telechargerTexte(nom, contenu, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([contenu], { type: type || "text/plain;charset=utf-8" })); a.download = nom;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
// Renvoie true si la page a été ouverte, false si les données sont trop volumineuses pour cette méthode.
export async function ouvrirDansNavigateur(page, objet, tailleMax) {
  const json = JSON.stringify(objet);
  let oct = new TextEncoder().encode(json), mode = "p";
  try { if (globalThis.CompressionStream) { oct = new Uint8Array(await new Response(new Blob([oct]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()); mode = "g"; } } catch (e) { mode = "p"; oct = new TextEncoder().encode(json); }
  let b = ""; for (let i = 0; i < oct.length; i += 8192) b += String.fromCharCode.apply(null, oct.subarray(i, i + 8192));
  const url = HOTE + page + "#d=" + mode + ":" + btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (url.length > (tailleMax || 250000)) return false;
  location.href = url; return true;
}
