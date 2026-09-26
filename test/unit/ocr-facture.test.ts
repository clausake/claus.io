import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Tache 6 : le moteur OCR local, juge sur la piece du banc (test/banc/).
//
// La piece d'essai est CELLE DU BANC (git, scellee `876842cba13f`), pas une
// copie de traval : le juge et la piece vivent au meme endroit, sous la meme
// loi. Les attendus sont LUS du fichier du banc, pas recopies ici — un attendu
// recopie se perime en silence quand le generateur change (la lecon des budgets
// recopies dans audit-perf.mjs).
//
// LA REGLE DU JUGE (retractation 1 du contrat, mesuree): comparer par LIGNES
// SEPAREES. Un `includes` sur le texte fondu approuve des coquillages : la
// facture disait 7/7 et le juge mal separeur en rendoit 6/7.

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANC = path.resolve(ICI, "..", "banc");
const IMAGE = path.join(BANC, "facture-synthetique.png");
const ATTENDUS = path.join(BANC, "facture-synthetique.attendus.json");

describe("OCR local sur la piece du banc (Tache 6)", () => {
  it("la piece et ses attendus existent (sinon le juge ne juge rien)", () => {
    expect(fs.existsSync(IMAGE)).toBe(true);
    expect(fs.existsSync(ATTENDUS)).toBe(true);
  });

  it("PaddleOCR lit la piece HORS LIGNE et rend les sept champs (7/7)", async () => {
    const attendus = JSON.parse(fs.readFileSync(ATTENDUS, "utf-8")) as Record<string, string>;
    expect(Object.keys(attendus)).toHaveLength(7);

    const { lireTexte } = await import("../../src/shared/ocr.js");
    const lu = await lireTexte(IMAGE, { moteur: "paddle" });

    // Le juge par LIGNES: chaque valeur attendue doit egaler UNE ligne (au
    // sens de contenu), pas « nager » dans un bloc fondu.
    const lignes = lu.lignes.map((l) => l.trim());
    const trous: string[] = [];
    for (const [champ, valeur] of Object.entries(attendus)) {
      // La comparaison normalise les blancs interieurs: l'OCR rend le SIRET
      // avec ses espaces de grlse (mesure du spike); le juge ne doit pas
      // rougir pour un espace, mais il doit rougir pour UN CHIFFRE FAUX.
      const cle = (s: string) => s.replace(/\s+/g, " ").trim();
      const cible = cle(valeur);
      const trouve = lignes.some((l) => cle(l) === cible || cle(l).includes(cible));
      if (!trouve) trous.push(`${champ}=${valeur}`);
    }
    expect(trous, `champs non relus par lignes: ${trous.join(", ")}`).toEqual([]);
  }, 120_000);

  it("la voie tesseract est ECRITE mais signale sa dependance reseau", async () => {
    // Le defaut mesure du sprint: tesseract.js telecharge sa langue depuis un
    // CDN a froid. La voie reste reglable, mais le moteur doit le DIRE.
    const { lireTexte } = await import("../../src/shared/ocr.js");
    const { MOTEURS } = await import("../../src/shared/ocr.js");
    expect(MOTEURS.tesseract.horsLigne).toBe(false);
    expect(MOTEURS.paddle.horsLigne).toBe(true);
  });
});
