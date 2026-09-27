// Le nombre selon la locale DECLAREE (Sprint 15, Tache 16).
//
// Le separateur est le MULTIPLICATEUR du prix. Lu avec la mauvaise regle,
// `419,60` devient 41960.00 (x100) et `1.234,56` devient 1.23456 (x1000) —
// sans exception, sans crash : rien ne revele la faute. D'ou la regle du
// depot (document-items.ts) elevee en regle cardinale d'importation : on ne
// DEVINE pas le separateur decimal.
//
// Locale DECLAREE : la lecture est CELLE de la locale, sans discussion.
// Locale NON declaree : aucune valeur ne sort. Une forme que les DEUX
// ecoles (fr : virgule decimal / us : point decimal) lisent en des nombres
// DIFFERENTS rend SEPARATEUR_AMBIGU + les deux lectures (le cas `1.234` —
// licite 1234 en allemand ET 1.234 en anglais, mesure 25/09) ; toute autre
// forme rend LOCALE_REQUISE. Le detecteur structurel n'est qu'un ASSISTANT
// de pre-cochage (precocherAssistant), jamais la source de la valeur.

import { resoudreLocale, type LocaleDeclaraire } from "./locales.js";

export type VerdictNombre =
  | "VALEUR"
  | "LOCALE_REQUISE"     // pas de locale declaree : null, comme CHAMP_SANS_PREUVE
  | "SEPARATEUR_AMBIGU"  // licite dans les DEUX ecoles, valeurs DIFFERENTES
  | "FORME_REFUSEE";     // ecriture melangee, vide, signe sans role…

export interface ResultatNombre {
  readonly brut: string;
  readonly verdict: VerdictNombre;
  readonly valeur: number | null;
  /** Les deux lectures licites quand SEPARATEUR_AMBIGU. */
  readonly lectures?: readonly [number, number];
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parse une chaine selon UNE ecriture (dec = decimal, mil = milliers).
 *  Regles : les blocs de milliers font exactement 3 chiffres ; le decimal
 *  apparait au plus une fois, suivi de 1 a 3 chiffres, et rien apres ; tout
 *  caractere hors chiffres/signe/propres-separateurs est refuse (le point
 *  sans role dans la locale courante n'est PAS rabote — il refuse). */
export function parseDansEcriture(brut: string, dec: string, mil: string): number | null {
  const propre = brut.trim();
  if (propre === "") return null;
  if (dec === mil) return null;
  const motifSansMil = new RegExp(`^-?\\d+(?:${esc(dec)}\\d{1,3})?$`);
  const motifAvecMil = new RegExp(`^-?\\d{1,3}(?:${esc(mil)}\\d{3})+(?:${esc(dec)}\\d{1,3})?$`);
  let sansMil: string | null = null;
  if (motifSansMil.test(propre)) sansMil = propre;
  else if (motifAvecMil.test(propre)) sansMil = propre.split(mil).join("");
  if (sansMil === null) return null;
  const n = Number(sansMil.split(dec).join("."));
  return Number.isFinite(n) ? n : null;
}

const ECOLES: readonly (Pick<LocaleDeclaraire, "separateur_decimal" | "separateur_milliers">)[] = [
  { separateur_decimal: ",", separateur_milliers: " " }, // ecole francophone
  { separateur_decimal: ",", separateur_milliers: "." }, // ecole germanophone
  { separateur_decimal: ".", separateur_milliers: "," }, // ecole anglophone
];

/** Le juge : LA locale est declaree (code fournisseur, piece, reglage du
 *  chef) → la lecture est celle de la locale. Sans declaration, rien ne
 *  sort : null + le verdict nomme. */
export function lireNombre(brut: string, codeLocale: string | null | undefined): ResultatNombre {
  const base = { brut };
  const r = resoudreLocale(codeLocale);
  if (r.ok) {
    const n = parseDansEcriture(brut, r.locale.separateur_decimal, r.locale.separateur_milliers);
    if (n === null) return { ...base, verdict: "FORME_REFUSEE", valeur: null };
    return { ...base, verdict: "VALEUR", valeur: n };
  }
  if (r.verdict === "SCRIPT_NON_GARANTI" || r.verdict === "LOCALE_INCONNUE") {
    return { ...base, verdict: "FORME_REFUSEE", valeur: null };
  }
  // Locale NON declaree : on ne rend jamais une valeur, on nomme l'ambiguite.
  const lectures = new Set<number>();
  for (const e of ECOLES) {
    const n = parseDansEcriture(brut, e.separateur_decimal, e.separateur_milliers);
    if (n !== null) lectures.add(n);
  }
  if (lectures.size >= 2) {
    const [a, b] = [...lectures];
    return { ...base, verdict: "SEPARATEUR_AMBIGU", valeur: null, lectures: [a, b] };
  }
  return { ...base, verdict: "LOCALE_REQUISE", valeur: null };
}

/** L'assistant de saisie : il PRE-COHE (un choix propose a l'operateur), il
 *  ne rend JAMAIS la valeur. Un code appele pour decider une valeur est une
 *  faute de conception (mesure 25/09 : il tranche souvent, pas toujours). */
export function precocherAssistant(brut: string): { readonly propose: "fr" | "us" | "aucun" } {
  const propre = brut.trim();
  const fr = parseDansEcriture(propre, ",", " ") !== null || parseDansEcriture(propre, ",", ".") !== null;
  const us = parseDansEcriture(propre, ".", ",") !== null;
  if (fr && !us) return { propose: "fr" };
  if (us && !fr) return { propose: "us" };
  return { propose: "aucun" };
}
