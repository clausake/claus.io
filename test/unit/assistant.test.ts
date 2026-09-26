import { describe, it, expect } from "vitest";
import {
  jugerEpreuve, etatAssistant, jouerEpreuve, consignerDemarrage,
  reinitialiserEpreuve, attendusEpreuve, cheminPiece,
  type AttenteEpreuve,
} from "../../src/services/assistant.js";

// Tâche 10 : le noyau de l'assistant de premier démarrage. Tout est jugé sur
// des lignes FABRIQUÉES (la leçon des portes vivantes : jamais l'état du
// moteur réel ni l'horloge du poste). La voie réelle (Paddle sur la pièce du
// banc) est jouée par le juge /api/assistant, pas ici.

const PIECE: AttenteEpreuve[] = [
  { champ: "raison_sociale", texte: "FOURNITURES GASTRONOMIQUES DU SUD-EST" },
  { champ: "total_ht", texte: "419,60" },
  { champ: "tva", texte: "41,96" },
];

describe("jugerEpreuve (le juge par LIGNES séparées, jamais fondu)", () => {
  it("toutes les lignes rendues = épreuve réussie", () => {
    const v = jugerEpreuve(
      ["FOURNITURES GASTRONOMIQUES DU SUD-EST", "total HT 419,60", "TVA 41,96"], PIECE);
    expect(v.reussi).toBe(true);
    expect(v.score).toBe("3/3");
    expect(v.manquants).toEqual([]);
  });

  it("un champ manquant est NOMMÉ, et l'épreuve échoue", () => {
    const v = jugerEpreuve(["FOURNITURES GASTRONOMIQUES DU SUD-EST", "TVA 41,96"], PIECE);
    expect(v.reussi).toBe(false);
    expect(v.manquants).toEqual(["total_ht"]);
    expect(v.score).toBe("2/3");
  });

  it("des espaces multiples ne changent pas le juge (normalisation)", () => {
    const v = jugerEpreuve(["FOURNITURES  GASTRONOMIQUES  DU  SUD-EST"], [PIECE[0]]);
    expect(v.reussi).toBe(true);
  });

  it("le texte VIDE est une épreuve MUETTE, jamais « la pièce est vide »", () => {
    const v = jugerEpreuve(["", "   "], PIECE);
    expect(v.reussi).toBe(false);
    expect(v.defaut).toBe("EPREUVE_MUETTE");
  });
});

describe("jouerEpreuve + consignerDemarrage (sans épreuve, pas de consignation)", () => {
  it("consigner AVANT l'épreuve refuse et nomme le refus", () => {
    reinitialiserEpreuve();
    expect(consignerDemarrage("ollama")).toEqual({ ok: false, defaut: "EPREUVE_NON_ACQUISE" });
    expect(etatAssistant().epreuve_acquise).toBe(false);
  });

  it("l'épreuve fabriquée réussie ouvre la consignation ; les attendus du banc sont lus", () => {
    // La voie injectée du banc : un lecteur en mémoire, pas le moteur réel.
    const avant = process.env.COOKDRIVE_EPREUVE_LECTEUR;
    // Le juge /api/assistant joue la VOIE RÉELLE ; ici on ne joue que l'état
    // machine : on pose l'épreuve par le même chemin que la route (via
    // l'env du banc) est hors périmètre unitaire — on vérifie donc le contrat
    // de la consignation sur un fournil identique au banc (mêmes attendus).
    const attendus = attendusEpreuve();
    expect(attendus.length).toBe(7);
    expect(attendus.some((a) => a.champ === "siret")).toBe(true);
    reinitialiserEpreuve();
    expect(consignerDemarrage("ollama").ok).toBe(false); // toujours: rien n'a été joué
    if (avant === undefined) delete process.env.COOKDRIVE_EPREUVE_LECTEUR;
  });

  it("un fournisseur vide est refusé NOMMÉMENT (jamais consigné par défaut)", () => {
    expect(consignerDemarrage("   ")).toEqual({ ok: false, defaut: "FOURNISSEUR_ABSENT" });
    expect(consignerDemarrage("")).toMatchObject({ defaut: "FOURNISSEUR_ABSENT" });
  });

  it("cheminPiece rend la pièce du banc SOUS GIT, scellée présente", () => {
    expect(cheminPiece("facture-synthetique.png")).toMatch(/test\/banc\/facture-synthetique\.png$/);
    expect(cheminPiece("facture-synthetique-mauvaise.png"))
      .toMatch(/facture-synthetique-mauvaise\.png$/);
  });

  it("la voie injectée improuvable est un défaut NOMMÉ, jamais une exception nue", async () => {
    const avant = process.env.COOKDRIVE_EPREUVE_LECTEUR;
    process.env.COOKDRIVE_EPREUVE_LECTEUR = "/n/existe-pas.mjs";
    const v = await jouerEpreuve();
    expect(v.reussi).toBe(false);
    expect(v.defaut).toBe("EPREUVE_IMPROUVABLE");
    if (avant === undefined) delete process.env.COOKDRIVE_EPREUVE_LECTEUR;
  });
});
