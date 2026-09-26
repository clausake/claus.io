// Le moteur Tesseract, GARDE COMME REGLABLE et non comme défaut (Sprint 15, Tache 6).
//
// Le defaut MESURE du 25/09 (sonde tess-hors-ligne.py, HOME neuf, cache vierge):
// tesseract.js TELECHARGE ses donnees de langue depuis un CDN (jsdelivr) au
// premier usage. Sur la piece d'essai il lit bien (7/7, 669 ms, cache chaud),
// mais dans le livrable d'un restaurateur SANS reseau — ou derriere un filtre —
// la premiere facture du jour echoue. C'est la raison exacte du passage a
// PaddleOCR comme defaut, pas une question de precision.
//
// Le moteur reste donc reglable (le chef peut le choisir), mais il DOIT dire
// qu'il n'est pas hors ligne: `horsLigne: false` est une donnee du produit,
// affichee dans les Reglages, pas un commentaire de code.

import { assemble, type LectureOcr } from "../ocr-commun.js";

// L'import reste paresseux: le produit doit pouvoir demarrer sans reseau avec
// paddle seul; tesseract ne se charge que si le chef le choisit.
export async function lireParCheminTesseract(cheminImage: string,
                                             langue = "fra"): Promise<LectureOcr> {
  const t0 = Date.now();
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(cheminImage, langue);
  const texte = typeof data?.text === "string" ? data.text : "";
  if (texte.trim() === "") {
    throw new Error("SortieOcrInattendue: tesseract n'a rendu aucun texte");
  }
  return assemble(texte.split("\n"), "tesseract", t0);
}
