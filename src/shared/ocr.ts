// La porte d'entree OCR unique du produit (Sprint 15, Tache 6).
//
// UN SEUL endroit parle aux moteurs. Les routes, l'extraction, les portes:
// tout passe par lireTexte(). C'est la regle de la source unique du depot
// (Sprint 7): deux voies qui lisent la meme piece = un juge muet.
//
// Le moteur est un CHOIX (reglage `ocr_moteur`, Tache 9), pas une surprise:
// `MOTEURS[moteur].horsLigne` dit la verite de chaque voie, et le produit
// l'affiche. `paddle` est le defaut: hors ligne par construction, et 7/7 sur
// la piece du banc (mesure du 25/09, rejouee par la porte verify:ocr-facture).

import type { LectureOcr } from "./ocr-commun.js";

export type { LectureOcr } from "./ocr-commun.js";
export { estViable, assemble } from "./ocr-commun.js";

export type MoteurOcr = "paddle" | "tesseract";

/** La verite de chaque moteur, donnee du produit (affichee dans les Reglages). */
export const MOTEURS: Record<MoteurOcr, {
  nom: string; horsLigne: boolean; dependance?: string;
}> = {
  paddle: { nom: "PaddleOCR (PP-OCRv5 mobile)", horsLigne: true },
  tesseract: {
    nom: "Tesseract",
    horsLigne: false,
    dependance: "telecharge ses langues depuis un CDN au premier usage",
  },
};

export interface ChoixOcr {
  readonly moteur?: MoteurOcr;
}

export async function lireTexte(cheminImage: string,
                                choix: ChoixOcr = {}): Promise<LectureOcr> {
  const moteur: MoteurOcr = choix.moteur ?? "paddle";
  if (moteur === "paddle") {
    const { lireParChemin } = await import("./ocr-moteurs/paddle.js");
    return lireParChemin(cheminImage);
  }
  const { lireParCheminTesseract } = await import("./ocr-moteurs/tesseract.js");
  return lireParCheminTesseract(cheminImage);
}

/** Le tampon (photo du telephone, voie Electron). Paddle seul — tesseract
 *  accepte aussi les tampons mais reste sur le chemin, plus simple a juger. */
export async function lireTampon(tampon: Buffer,
                                 choix: ChoixOcr = {}): Promise<LectureOcr> {
  const moteur: MoteurOcr = choix.moteur ?? "paddle";
  if (moteur !== "paddle") {
    throw new Error("lireTampon: seul le moteur paddle lit les tampons");
  }
  const { lireParTampon } = await import("./ocr-moteurs/paddle.js");
  return lireParTampon(tampon);
}
