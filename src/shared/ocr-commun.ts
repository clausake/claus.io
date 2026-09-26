// Le juge de lecture OCR — le texte, séparé en LIGNES (Sprint 15, Tache 6).
//
// LA RETRACTATION 1 DU CONTRAT, mesuree au spike du 25/09: un juge qui compare
// par `includes` sur le TEXTE FONDU rend 6/7 sur une piece que le moteur lit
// 7/7. Le texte fondu colle les lignes, le SIRET passe sur deux lignes, et le
// juge aveugle compte un champ manquant. Le juge par LIGNES SEPAREES rend le
// vrai compte. Ce module est ce juge: la sortie de tout moteur passe ici.
//
// Un moteur ne rend JAMAIS un texte fondu au produit: il rend `lignes`, et le
// contrat d'extraction (Tache 15) exigera de chaque valeur qu'elle egale UNE
// ligne (ou une portion de ligne) — jamais une inference sur le bloc entier.

export interface LectureOcr {
  /** Le texte complet, lignes separees par \n (jamais fondu). */
  readonly texte: string;
  /** Les lignes dans l'ordre de lecture, retirees vuides. */
  readonly lignes: string[];
  /** Le moteur QUI a lu: une reponse sans moteur est une reponse sans preuve. */
  readonly moteur: "paddle" | "tesseract";
  readonly duree_ms: number;
}

/** Une sortie de moteur acceptable: au moins une ligne non vue. */
export function estViable(lu: LectureOcr): boolean {
  return lu.lignes.some((l) => l.trim().length > 0);
}

/** Assemble la sortie d'un moteur depuis ses lignes brutes. Un seul point de
 *  passage pour que le juge et le contrat voient la MEME piece.
 *
 *  LA RETRACTATION 1 DU CONTRAT, mesuree le 25/09: la sortie brute du paquet
 *  porte des LIGNES REELLES (lines[] avec .text/.box/.confidence, mesuree par
 *  sonde-8-sortie-porte.mjs), mais un juge qui compare par `includes` sur le
 *  texte fondu rend 6/7 sur une piece que le moteur lit 7/7. Le texte fondu
 *  colle les lignes, le SIRET passe sur deux lignes, and le juge aveugle compte
 *  un champ manquant. Un moteur ne rend JAMAIS un bloc fondu au produit: il rend
 *  `lignes`, et le contrat d'extraction (Tache 15) exigera de chaque valeur
 *  qu'elle egale UNE ligne (ou une portion de ligne) — jamais une inference sur
 *  le bloc entier. */
export function assemble(
  lignesBrutes: readonly string[] | unknown,
  moteur: LectureOcr["moteur"],
  t0: number,
): LectureOcr {
  const lignes: string[] = [];
  const plus = (t: string) => {
    const propre = String(t ?? "").replace(/\s+/g, " ").trim();
    if (propre !== "") lignes.push(propre);
  };
  if (Array.isArray(lignesBrutes)) {
    for (const item of lignesBrutes) {
      if (typeof item === "string") plus(item);
      else if (item && typeof item === "object" && "text" in item) {
        plus(String((item as Record<string, unknown>).text ?? ""));
      } else if (Array.isArray(item)) {
        for (const it of item as unknown[]) {
          if (it && typeof it === "object" && "text" in it) {
            plus(String((it as Record<string, unknown>).text ?? ""));
          }
        }
      }
    }
  } else if (typeof lignesBrutes === "string") {
    // Un moteur qui rend un texte fondu (tesseract): on le SEPARE ici — le juge
    // ne doit pas voir le bloc fondu (le piege mesure au spike).
    for (const t of String(lignesBrutes).split("\n")) plus(t);
  }
  return { texte: lignes.join("\n"), lignes, moteur, duree_ms: Date.now() - t0 };
}

