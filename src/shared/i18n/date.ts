// La date selon la locale DECLAREE (Sprint 15, Tache 16).
//
// Le fait qui decide (mesure 25/09) : sur les 365 dates licites en [jj/mm],
// 144 sont licites AUSSI en [mm/jj] — 39 % sont STRUCTURELLEMENT AMBIGUES.
// Pour ces 144, aucune verification ne peut dire la bonne lecture : 5/9 est
// licite deux fois. C'est la classe de faute la plus dangereuse du lot —
// 05/09/2026 est une date valide dans les deux ordres. Seule la locale
// DECLAREE tranche ; jamais une inférence du contenu.

import { resoudreLocale, type VerdictLocale } from "./locales.js";

export type VerdictDate =
  | "VALEUR"
  | "LOCALE_REQUISE"
  | "DATE_AMBIGUE"      // licite dans les DEUX ordres : null + les deux lectures
  | "DATE_INVALIDE";    // 31/02, 13/13 : refusee

export interface ResultatDate {
  readonly brut: string;
  readonly verdict: VerdictDate;
  /** ISO (YYYY-MM-DD) quand VALEUR, sinon null. */
  readonly iso: string | null;
  /** Les deux lectures ISO quand DATE_AMBIGUE. */
  readonly lectures?: readonly [string, string];
}

function dateLicite(j: number, mo: number, a: number): boolean {
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

const iso = (j: number, mo: number, a: number): string =>
  `${String(a).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

/** Le juge : jj/mm(/aaaa) lu selon l'ordre DECLARE de la locale. Les formes
 *  sans année sont acceptées (l'OCR d'une facture les rend souvent) — l'année
 *  est comblée par l'appelant, pas ici (le juge ne connait pas l'horloge). */
export function lireDate(brut: string, codeLocale: string | null | undefined): ResultatDate {
  const base = { brut };
  const r = resoudreLocale(codeLocale);
  if (!r.ok) {
    const v: VerdictLocale = r.verdict;
    return { ...base, verdict: v === "LOCALE_REQUISE" ? "LOCALE_REQUISE" : "DATE_INVALIDE", iso: null };
  }
  const l = r.locale;
  const propre = brut.trim();
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(propre);
  if (!m) return { ...base, verdict: "DATE_INVALIDE", iso: null };
  const n1 = Number(m[1]);
  const n2 = Number(m[2]);
  const a = m[3] ? Number(m[3]) : null;

  const [j, mo] = l.ordre_date === "jmma" ? [n1, n2] : [n2, n1];
  const la = a !== null ? dateLicite(j, mo, a) : j >= 1 && j <= 31 && mo >= 1 && mo <= 12;
  if (!la) return { ...base, verdict: "DATE_INVALIDE", iso: null };

  // L'autre ordre est-il licite AUSSI et rend-il une date DIFFERENTE ?
  const [j2, mo2] = l.ordre_date === "jmma" ? [n2, n1] : [n1, n2];
  if (j2 !== j || mo2 !== mo) {
    const autreLicite = a !== null ? dateLicite(j2, mo2, a) : j2 >= 1 && j2 <= 31 && mo2 >= 1 && mo2 <= 12;
    if (autreLicite) {
      return {
        ...base,
        verdict: "DATE_AMBIGUE",
        iso: null,
        lectures: [iso(j, mo, a ?? 2000), iso(j2, mo2, a ?? 2000)],
      };
    }
  }
  if (a === null) return { ...base, verdict: "VALEUR", iso: iso(j, mo, 2000) };
  return { ...base, verdict: "VALEUR", iso: iso(j, mo, a) };
}
