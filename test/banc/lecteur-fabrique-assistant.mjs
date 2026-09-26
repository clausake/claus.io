// Le lecteur FABRIQUE de la porte de l'assistant (Tache 10).
//
// La porte ne doit JAMAIS jouer le vrai moteur Paddle sur 18 bandes : la
// course des portes jugerait l'etat d'une infrastructure qui n'est pas la
// sienne, et trainerait. Ce module est LA voie injectee
// (COOKDRIVE_EPREUVE_LECTEUR) : il LIT un fichier de consigne (chemin dans
// COOKDRIVE_EPREUVE_FICHIER) que le juge ecrit AVANT chaque appel — le juge
// decide donc, a chaud, quelles lignes « le moteur » a rendues : toutes, une
// de moins (le juge doit nommer le champ), ou aucune (la morsure muette).
//
// Le fichier porte { lignes: string[] }. Un fichier absent ou mal forme est
// une faute NOMMEE (le module leve), pas une liste vide deguisee en muet —
// la morsure muette est JOUEE par le juge, pas par une absence d'outillage.
import fs from "node:fs";

export async function lire() {
  const chemin = process.env.COOKDRIVE_EPREUVE_FICHIER;
  if (!chemin) throw new Error("LECTEUR_FABRIQUE_SANS_FICHIER: COOKDRIVE_EPREUVE_FICHIER absent");
  if (!fs.existsSync(chemin)) throw new Error(`FICHIER_DE_CONSIGNE_ABSENT: ${chemin}`);
  const brut = JSON.parse(fs.readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut.lignes))
    throw new Error(`FICHIER_DE_CONSIGNE_MAL_FORME: ${chemin} (Attendu {lignes:[...]})`);
  return brut.lignes.map((l) => String(l));
}
