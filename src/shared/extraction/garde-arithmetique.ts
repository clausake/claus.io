// La garde ARITHMÉTIQUE (Sprint 15, Tache 15).
//
// Le LLM ne CALCULE jamais : il range. Le calcul est ICI, déterministe, et
// chaque incohérence entre les valeurs LUES rougit la ligne (mesure du
// 25/09 : les quatre mutations — confusion 0→O, 5→S, transposition 71→17,
// glissement decimal 112,50→11,25 — sont toutes rougies par ces regles).
//
// Les regles, dans l'ordre du contrat :
//   round(qte × pu, 2) == montant        par ligne ;
//   Σ montants         == total HT       ;
//   HT × taux          == TVA            ;
//   HT + TVA           == TTC            .
// Toute valeur non finie arrive ici REFUSEE en amont (voir nombreFiniOuRefus) :
// cette garde ne voit que des nombres sains et juge la COHERENCE.

export interface LigneLue {
  readonly design: string;
  readonly quantite: number;
  readonly prix_unitaire: number;
  readonly montant: number;
}

export interface TotalLue {
  readonly total_ht: number;
  readonly taux_tva: number;   // 0.10 pour 10 %
  readonly tva: number;
  readonly total_ttc: number;
}

/** 0.005 est le seuil de la piece : deux centimes d'écart sont une faute de
 *  lecture (un 69,80 cru 69,08 est une carte d'achat fausse), pas un arrondi. */
const cents = (n: number): number => Math.round(n * 100);

/** Regle 1 : la ligne est-elle coherentement lue ? */
export function ligneCoherente(l: LigneLue): boolean {
  if (![l.quantite, l.prix_unitaire, l.montant].every(Number.isFinite)) return false;
  return Math.abs(cents(l.quantite * l.prix_unitaire) - cents(l.montant)) <= 0;
}

/** Regle 2 : la somme des lignes rend-elle le total HT lu ? */
export function sommeConcorde(lignes: readonly LigneLue[], totalHt: number): boolean {
  if (!Number.isFinite(totalHt)) return false;
  if (!lignes.every((l) => Number.isFinite(l.montant))) return false;
  const s = lignes.reduce((acc, l) => acc + cents(l.montant), 0);
  return Math.abs(s - cents(totalHt)) <= 0;
}

/** Regles 3 et 4 : la chaine TVA (HT × taux == TVA ; HT + TVA == TTC). */
export function chaineTvaConcordante(t: TotalLue): boolean {
  const vals = [t.total_ht, t.taux_tva, t.tva, t.total_ttc];
  if (!vals.every(Number.isFinite)) return false;
  const tvaCalcule = Math.round(t.total_ht * t.taux_tva * 100) / 100;
  const ttcCalcule = t.total_ht + t.tva;
  return (
    Math.abs(cents(tvaCalcule) - cents(t.tva)) <= 0 &&
    Math.abs(cents(ttcCalcule) - cents(t.total_ttc)) <= 0
  );
}

export interface VerdictArithmetique {
  readonly ok: boolean;
  /** Les lignes dont le montant n'est PAS round(qte × pu) — elles attendent le chef. */
  readonly lignes_en_faute: readonly string[];
  /** Faute de somme : le total HT lu ne rend pas Σ montants. */
  readonly somme_faute: boolean;
  /** Faute de chaine : TVA ou TTC incoherents. */
  readonly chaine_tva_faute: boolean;
}

/** Le juge complet : tout ce qui n'est pas cohérent RESTE en null cote
 *  appelant (le contrat de la preuve ancrée), cette garde NOMME ce qui coince. */
export function jugerArithmetique(
  lignes: readonly LigneLue[],
  totaux: TotalLue,
): VerdictArithmetique {
  const lignesEnFaute = lignes.filter((l) => !ligneCoherente(l)).map((l) => l.design);
  const somme = sommeConcorde(lignes, totaux.total_ht);
  const chaine = chaineTvaConcordante(totaux);
  return {
    ok: lignesEnFaute.length === 0 && somme && chaine,
    lignes_en_faute: lignesEnFaute,
    somme_faute: !somme,
    chaine_tva_faute: !chaine,
  };
}
