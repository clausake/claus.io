import { describe, it, expect } from "vitest";
import {
  jugerChamp, preuveAncre, lireAmbigu, nombreFiniOuRefus,
  type ChampOcr,
} from "../../src/shared/extraction/preuve-ancree.js";
import {
  jugerArithmetique, ligneCoherente, sommeConcorde, chaineTvaConcordante,
  type LigneLue, type TotalLue,
} from "../../src/shared/extraction/garde-arithmetique.js";
import { jugerSiret, jugerTvaFr, clefTvaAttendue } from "../../src/shared/extraction/garde-identifiants.js";
import { jugerDlc, genrePeremption } from "../../src/shared/extraction/garde-dlc.js";

// Tache 15 : le contrat d'extraction. Les valeurs sont CELLES de la piece du
// banc (test/banc/facture-synthetique.attendus.json) — la meme que joue le
// juge Python; un test qui change une valeur ici doit changer la piece.

const LIGNES = [
  "FOURNITURES GASTRONOMIQUES DU SUD-EST",
  "SIRET 412 857 339 00066 - TVA FR 78 412857339",
  "FACTURE N F-2026-000847",
  "Date d'emission : 12/09/2026",
  "Total HT 419,60",
  "TVA 10,0 % 41,96",
  "TOTAL TTC 461,56",
];
const lecture = { texte: LIGNES.join("\n"), lignes: LIGNES, moteur: "paddle" as const, duree_ms: 1 };

const champ = (nom: string, valeur: string, ligne: number, debut?: number, fin?: number): ChampOcr => ({
  nom, valeur,
  preuve: debut === undefined ? null : { texte_ocr: LIGNES[ligne], ligne, debut_octet: debut, fin_octet: fin ?? debut + valeur.length },
});

describe("la preuve ancree (le contrat anti-hallucination)", () => {
  it("un champ dont la tranchee rend la valeur passe", () => {
    const c = champ("siret", "412 857 339 00066", 1, 6);
    expect(preuveAncre(c, lecture)).toBe(true);
    expect(jugerChamp(c, lecture)).toMatchObject({ verdict: "VALEUR", tranchee: "412 857 339 00066" });
  });
  it("un champ SANS preuve est refuse, jamais comble", () => {
    const r = jugerChamp(champ("tva", "41,96", -1), lecture);
    expect(r.verdict).toBe("CHAMP_SANS_PREUVE");
    expect(r.tranchee).toBeNull();
  });
  it("une preuve qui ment (tranchee != valeur) est refusee", () => {
    const c = champ("total_ttc", "461,56", 6, 11, 17); // dcale d'un cran : la tranchee rend une autre chaine
    expect(preuveAncre(c, lecture)).toBe(false);
    expect(jugerChamp(c, lecture).verdict).toBe("PREUVE_MENTIE");
  });
  it("un caractere ambigu rend les DEUX lectures, jamais une correction", () => {
    // « SIRET » cru avec un O a la place du 0 : le LLM n'a pas le droit de trancher.
    const cru = "412 857 339 O0066";
    LIGNES[8] = `SIRET ${cru}`;
    const c = champ("siret", cru, 8, 6);
    const r = jugerChamp(c, lecture, { champChiffre: true });
    expect(r.verdict).toBe("AMBIGU");
    expect(r.lectures).toEqual([cru, "412 857 339 00066"]);
    delete LIGNES[8];
  });
  it("un nombre non fini est refuse A LA PORTE", () => {
    expect(nombreFiniOuRefus("419,60")).toEqual({ ok: true, n: 419.6 });
    expect(nombreFiniOuRefus("NaN").ok).toBe(false);
    expect(nombreFiniOuRefus("Infinity").ok).toBe(false);
    LIGNES[8] = "Total HT NaN";
    const c = champ("total_ht", "NaN", 8, 9);
    expect(jugerChamp(c, lecture, { exigerNombre: true }).verdict).toBe("NOMBRE_NON_FINI");
    delete LIGNES[8];
  });
  it("un O dans un libelle n'est PAS une alerte (seul le sens chiffre compte)", () => {
    // jugerChamp ne teste l'ambiguite QUE sur les champs chiffres (le test de
    // l'autre cote : siret cru avec un O rend bien AMBIGU, ci-dessus).
    const c = champ("raison_sociale", "FOURNITURES GASTRONOMIQUES DU SUD-EST", 0, 0);
    expect(jugerChamp(c, lecture).verdict).toBe("VALEUR");
  });
});

describe("la garde arithmetique (le LLM ne calcule pas)", () => {
  const LIGNES_SAINES: readonly LigneLue[] = [
    { design: "Pommes de terre", quantite: 2, prix_unitaire: 34.9, montant: 69.8 },
    { design: "Vin rouge", quantite: 6, prix_unitaire: 18.75, montant: 112.5 },
  ];
  const TOTAUX: TotalLue = { total_ht: 182.3, taux_tva: 0.1, tva: 18.23, total_ttc: 200.53 };

  it("la piece saine passe entiere", () => {
    expect(ligneCoherente(LIGNES_SAINES[0])).toBe(true);
    expect(sommeConcorde(LIGNES_SAINES, 182.3)).toBe(true);
    expect(chaineTvaConcordante(TOTAUX)).toBe(true);
    expect(jugerArithmetique(LIGNES_SAINES, TOTAUX).ok).toBe(true);
  });
  it("glissement decimal 112,50 -> 11,25 rougit la ligne ET la somme", () => {
    const mutilees = LIGNES_SAINES.map((l) => l.design === "Vin rouge" ? { ...l, montant: 11.25 } : l);
    const v = jugerArithmetique(mutilees, TOTAUX);
    expect(v.lignes_en_faute).toContain("Vin rouge");
    expect(v.somme_faute).toBe(true);
    expect(v.ok).toBe(false);
  });
  it("transposition 112,50 -> 121,50 rougit sans crier sur la ligne (q x pu la voit)", () => {
    const mutilees = LIGNES_SAINES.map((l) => l.design === "Vin rouge" ? { ...l, montant: 121.5 } : l);
    expect(ligneCoherente(mutilees[1])).toBe(false);
  });
  it("un total HT falsifie seul rougit la somme, pas les lignes", () => {
    const v = jugerArithmetique(LIGNES_SAINES, { ...TOTAUX, total_ht: 183.3 });
    expect(v.lignes_en_faute).toEqual([]);
    expect(v.somme_faute).toBe(true);
  });
  it("TVA falsifiee rougit la chaine (HT x taux != TVA)", () => {
    expect(chaineTvaConcordante({ ...TOTAUX, tva: 18.99 })).toBe(false);
  });
  it("un montant non fini (Infinity) est refuse par la garde", () => {
    expect(ligneCoherente({ design: "x", quantite: 1, prix_unitaire: 1, montant: Infinity })).toBe(false);
    expect(sommeConcorde([{ design: "x", quantite: 1, prix_unitaire: 1, montant: Infinity }], 1)).toBe(false);
  });
});

describe("la garde des identifiants (clefs INSEE)", () => {
  it("le SIRET de la piece est VALIDE (clef 066 — le banc portoit 00027, corrige)", () => {
    expect(jugerSiret("412 857 339 00066")).toMatchObject({ verdict: "VALIDE", normalise: "41285733900066" });
  });
  it("le SIRET fautif du vieil banc est ROUGI par la clef", () => {
    expect(jugerSiret("412 857 339 00027").verdict).toBe("CLEF_SIRET_FAUSSE");
  });
  it("une forme sans 14 chiffres est FORME_INVALIDE", () => {
    expect(jugerSiret("412 857 339").verdict).toBe("FORME_INVALIDE");
    expect(jugerSiret("412 857 339 O0066").verdict).toBe("FORME_INVALIDE");
    expect(jugerSiret("").verdict).toBe("FORME_INVALIDE");
  });
  it("la clef TVA mesuree: SIREN 412857339 -> 78", () => {
    expect(clefTvaAttendue(412857339)).toBe(78);
    expect(jugerTvaFr("FR78 412857339")).toMatchObject({ verdict: "VALIDE" });
    expect(jugerTvaFr("FR79 412857339").verdict).toBe("CLEF_TVA_FAUSSE");
    expect(jugerTvaFr("FR78 412857340").verdict).toBe("CLEF_TVA_FAUSSE");
    expect(jugerTvaFr("412857339").verdict).toBe("FORME_INVALIDE");
  });
  it("TVA + SIRET : les deux identifiants doivent se ressembler", () => {
    expect(jugerTvaFr("FR78 412857339", "999 999 999 00011").verdict).toBe("CLEF_TVA_FAUSSE");
  });
});

describe("la garde DLC/DDM (deux regles distinctes)", () => {
  const AUJOURDHUI = new Date(Date.UTC(2026, 8, 25)); // fige par le banc
  it("DLC future acceptee, DLC passee refusee", () => {
    expect(jugerDlc("05/10/2026", "a consommer jusqu'au", AUJOURDHUI).verdict).toBe("ACCEPTE");
    expect(jugerDlc("20/09/2026", "a consommer jusqu'au", AUJOURDHUI).verdict).toBe("PASSEE");
  });
  it("DDM passee est LICITE (la date du 20/09 ne refuse rien)", () => {
    expect(jugerDlc("20/09/2026", "a consommer de preference jusqu'au", AUJOURDHUI).verdict).toBe("ACCEPTE");
    expect(genrePeremption("a consommer de preference jusqu'au")).toBe("ddm");
  });
  it("les libelles etrangers sont reconnus (la garde multilingue)", () => {
    expect(genrePeremption("Verbrauchen bis")).toBe("dlc");
    expect(genrePeremption("Mindestens haltbar bis")).toBe("ddm");
    expect(genrePeremption("Da consumarsi entro")).toBe("dlc");
    expect(genrePeremption("Te gebruiken tot")).toBe("ddm");
  });
  it("dates inexistantes et caracteres ambigus sont REFUSES", () => {
    expect(jugerDlc("31/02/2026", "a consommer jusqu'au", AUJOURDHUI).verdict).toBe("DATE_INVALIDE");
    expect(jugerDlc("13/13/2026", "a consommer jusqu'au", AUJOURDHUI).verdict).toBe("DATE_INVALIDE");
    expect(jugerDlc("05/l0/2026", "a consommer jusqu'au", AUJOURDHUI).verdict).toBe("DATE_INVALIDE");
  });
  it("un libelle inconnu ne tranche pas : la ligne attend le chef", () => {
    expect(jugerDlc("05/10/2026", "perime le", AUJOURDHUI).verdict).toBe("LIBELLE_INCONNU");
  });
});
