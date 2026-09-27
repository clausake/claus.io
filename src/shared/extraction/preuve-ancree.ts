// Le juge des CHAMPS OCR — la PREUVE ANCRÉE (Sprint 15, Tache 15).
//
// LA PREUVE ANCRÉE : pour chaque champ rendu, exiger une preuve {texte_ocr,
// ligne, debut_octet, fin_octet} et vérifier texte_ocr.slice(debut, fin) ===
// valeur. Un champ sans preuve = CHAMP_SANS_PREUVE → null, jamais comblé.
// Un nombre non fini (NaN/Infinity) est refusé À LA PORTE (la leçon du dépôt :
// JSON.stringify(Infinity) rend null — la saisie ne peut jamais devenir un
// nombre). Les caractères ambigus (0/O/o, 1/l/I, 5/S, 6/G, 8/B, 9/q) ne sont
// JAMAIS « corrigés » par le LLM : ils rendent une alerte AMBIGU avec les
// DEUX lectures, et la ligne attend le chef.
//
// Ce module est le JUGE DES CHAMPS : il n'EXTRAIT pas ; il juge ce que le
// moteur a rendu. Le LLM, lui, ne fait que RANGER (la règle cardinale du
// sprint : le moteur OCR détermine, le cerveau ne complète rien).

import type { LectureOcr } from "../ocr-commun.js";

export interface PreuveOcr {
  readonly texte_ocr: string;
  readonly ligne: number;          // index DANS lecture.lignes
  readonly debut_octet: number;    // offset DANS cette ligne
  readonly fin_octet: number;      // exclusif
}

export interface ChampOcr {
  readonly nom: string;
  readonly valeur: string;         // la valeur OCR CRUE (jamais normalisée)
  readonly preuve: PreuveOcr | null;
}

export type VerdictChamp =
  | "VALEUR"            // la preuve est ancrée : tranchee = valeur
  | "CHAMP_SANS_PREUVE" // refus : tranchee = null, jamais comblee
  | "PREUVE_MENTIE"     // la tranchee de la preuve ne rend PAS la valeur
  | "AMBIGU"            // caractere ambigu : deux lectures, attend le chef
  | "NOMBRE_NON_FINI";  // NaN/Infinity refuse a la porte

export interface ResultatChamp {
  readonly nom: string;
  readonly verdict: VerdictChamp;
  readonly tranchee: string | null;
  /** Les DEUX lectures licites quand verdict = AMBIGU (sinon absent). */
  readonly lectures?: readonly [string, string];
}

/** Les paires de caractères ambigüs, mesurees le 25/09 (la sortie brute du
 *  moteur les rend dans les deux formes selon la ligne). Le LLM n'a JAMAIS le
 *  droit de trancher : ces paires produisent une alerte avec les deux lectures. */
export const PAIRES_AMBIGUES: readonly (readonly [string, string])[] = [
  ["0", "O"], ["1", "l"], ["1", "I"], ["5", "S"], ["6", "G"], ["8", "B"], ["9", "q"],
] as const;

/** Une valeur est-elle le siège d'un caractère ambigu (au sens d'un champ
 *  CHIFFRÉ : siret, tva, montants) ? Un seul sens est teste : la lettre qui
 *  ressemble à un chiffre. L'inverse (chiffre dans un libellé) n'est jamais
 *  une alerte — « O » dans un nom de raison sociale est un O. */
export function lireAmbigu(valeur: string): readonly [string, string] | null {
  for (const [chiffre, lettre] of PAIRES_AMBIGUES) {
    if (valeur.includes(lettre)) {
      return [valeur, valeur.split(lettre).join(chiffre)];
    }
  }
  return null;
}

/** Le nombre attendu d'un champ monétaire : refuser NaN/Infinity À LA PORTE,
 *  jamais les laisser descendre en base (JSON.stringify les trahit en null). */
export function nombreFiniOuRefus(valeur: string): { ok: true; n: number } | { ok: false } {
  const n = Number(valeur.replace(",", "."));
  return Number.isFinite(n) ? { ok: true, n } : { ok: false };
}

/** Vérifie qu'une preuve est ANCRÉE dans la lecture du moteur : la tranche
 *  demandée de la ligne doit être EGALE à la valeur rendue. */
export function preuveAncre(champ: ChampOcr, lecture: LectureOcr): boolean {
  if (!champ.preuve) return false;
  const ligne = lecture.lignes[champ.preuve.ligne];
  if (ligne === undefined) return false;
  return ligne.slice(champ.preuve.debut_octet, champ.preuve.fin_octet) === champ.valeur;
}

/** LE juge : qu'est-ce qui a le droit d'entrer en base pour ce champ ?
 *  Ordre des portes (mesuré par le banc, chaque porte a sa mutation) :
 *  1. preuve absente         → CHAMP_SANS_PREUVE (null, jamais comblé) ;
 *  2. preuve qui ne rend pas la valeur → PREUVE_MENTIE (null) ;
 *  3. caractère ambigu      → AMBIGU avec les DEUX lectures (pas de correction) ;
 *  4. (champ monétaire, `exigerNombre`) nombre non fini → NOMBRE_NON_FINI ;
 *  5. sinon VALEUR. */
export function jugerChamp(
  champ: ChampOcr,
  lecture: LectureOcr,
  opts: { readonly exigerNombre?: boolean; readonly champChiffre?: boolean } = {},
): ResultatChamp {
  if (!preuveAncre(champ, lecture)) {
    return {
      nom: champ.nom,
      verdict: champ.preuve ? "PREUVE_MENTIE" : "CHAMP_SANS_PREUVE",
      tranchee: null,
    };
  }
  // L'alerte AMBIGU ne regarde que les champs qui DOIVENT être des chiffres
  // (siret, tva, montants) : un « O » dans une raison sociale est un O.
  const amb = opts.champChiffre || opts.exigerNombre ? lireAmbigu(champ.valeur) : null;
  if (amb) return { nom: champ.nom, verdict: "AMBIGU", tranchee: null, lectures: amb };
  if (opts.exigerNombre) {
    const n = nombreFiniOuRefus(champ.valeur);
    if (!n.ok) return { nom: champ.nom, verdict: "NOMBRE_NON_FINI", tranchee: null };
  }
  return { nom: champ.nom, verdict: "VALEUR", tranchee: champ.valeur };
}
