// La matrice des locales (Sprint 15, Tache 16).
//
// LA REGLE CARDINALE : `locale_depuis = DECLARE` — un choix du chef, par
// piece ou par fournisseur, JAMAIS une inference du contenu. Le fait qui
// decide de tout : la langue de l'INTERFACE n'est pas la langue de la PIECE
// (mesure 25/09 : 39 % des dates jj/mm — 144/365 — sont licites AUSSI en
// mm/jj ; pour elles aucune verification ne peut trancher : 5/9 est licite
// deux fois). Une valeur dont la lecture depend d'une locale non declaree
// rend null + alerte LOCALE_REQUISE, comme CHAMP_SANS_PREUVE de la tache 15.
//
// Le dictionnaire de l'OCR est FERMÉ (mesure 25/09 : 774 signes ; un signe
// hors du dictionnaire rend un voisin — le mot se lit, personne ne doute).
// La locale pilote donc le MODELE et les mots-cles, pas une etiquette.
//
// Couverture des scripts PROUVEE par curl (25/09, avec suivi des 302) :
// latin 200/8 066 518, cyrillic 200/8 073 294, arabic 200/8 023 442,
// devanagari 200/7 936 806. Les autres scripts : 404 = UNKNOWN, pas preuve
// d'absence. Donc : INTERDICTION du remplacement silencieux — une locale
// dont le script n'est pas prouvé refuse (SCRIPT_NON_GARANTI + null), elle
// ne substitue jamais le latin. Le poids est a la demande (~8 Mio/script).

export type ScriptOcr = "latin" | "cyrillic" | "arabic" | "devanagari" | "inconnu";

export interface LocaleDeclaraire {
  readonly code: string;                 // "fr-FR", "de-DE"…
  readonly separateur_decimal: string;   // "," | "." (arabe : "٫", le signe natif de la locale)
  readonly separateur_milliers: string;  // " " | "." | ","
  /** Ordre des composantes d'une date numerique : "jmma" ou "amjd". */
  readonly ordre_date: "jmma" | "amjd";
  readonly script_ocr: ScriptOcr;
  /** Le script est-il PROUVE present (HTTP 200 mesure, voir en-tete) ? */
  readonly script_prouve: boolean;
}

/** Les locales que le produit promet. `script_prouve: false` = la case
 *  refuse a l'importation (SCRIPT_NON_GARANTI) jusqu'a preuve du depot. */
export const LOCALES: Readonly<Record<string, LocaleDeclaraire>> = {
  "fr-FR": { code: "fr-FR", separateur_decimal: ",", separateur_milliers: " ", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "de-DE": { code: "de-DE", separateur_decimal: ",", separateur_milliers: ".", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "es-ES": { code: "es-ES", separateur_decimal: ",", separateur_milliers: ".", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "it-IT": { code: "it-IT", separateur_decimal: ",", separateur_milliers: ".", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "pt-PT": { code: "pt-PT", separateur_decimal: ",", separateur_milliers: " ", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "nl-NL": { code: "nl-NL", separateur_decimal: ",", separateur_milliers: ".", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "pl-PL": { code: "pl-PL", separateur_decimal: ",", separateur_milliers: " ", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "tr-TR": { code: "tr-TR", separateur_decimal: ",", separateur_milliers: ".", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  // La mesure 25/09 signale `¡` ABSENT du dictionnaire latin : l'espagnol
  // qui importe l'OCR doit passer par la voie SCRIPT/langue du modele, pas
  // supposer le signe rendu — consigne, pas une surprise a laisser ouverte.
  "en-US": { code: "en-US", separateur_decimal: ".", separateur_milliers: ",", ordre_date: "amjd", script_ocr: "latin", script_prouve: true },
  "en-GB": { code: "en-GB", separateur_decimal: ".", separateur_milliers: ",", ordre_date: "jmma", script_ocr: "latin", script_prouve: true },
  "ru-RU": { code: "ru-RU", separateur_decimal: ",", separateur_milliers: " ", ordre_date: "jmma", script_ocr: "cyrillic", script_prouve: true },
  "ar-SA": { code: "ar-SA", separateur_decimal: "٫", separateur_milliers: "٬", ordre_date: "jmma", script_ocr: "arabic", script_prouve: true },
  "hi-IN": { code: "hi-IN", separateur_decimal: ".", separateur_milliers: ",", ordre_date: "jmma", script_ocr: "devanagari", script_prouve: true },
  // EXEMPLE de case non garantie (la mesure 25/09 n'a pas etabli la
  // nomination du modele ; 404 n'est pas une preuve d'absence) : la voie est
  // ecrite pour refuser, pas pour deviner.
  "th-TH": { code: "th-TH", separateur_decimal: ".", separateur_milliers: ",", ordre_date: "jmma", script_ocr: "inconnu", script_prouve: false },
} as const;

export type VerdictLocale = "DECLARREE" | "LOCALE_REQUISE" | "LOCALE_INCONNUE" | "SCRIPT_NON_GARANTI";

/** L'entree de matrice pour une locale DECLAREE par le chef. Toute autre
 *  reponse est un refus nomme — jamais une lecture par defaut. */
export function resoudreLocale(code: string | null | undefined):
  | { ok: true; locale: LocaleDeclaraire }
  | { ok: false; verdict: VerdictLocale } {
  if (code === null || code === undefined || code.trim() === "") {
    return { ok: false, verdict: "LOCALE_REQUISE" };
  }
  const l = LOCALES[code];
  if (!l) return { ok: false, verdict: "LOCALE_INCONNUE" };
  if (!l.script_prouve) return { ok: false, verdict: "SCRIPT_NON_GARANTI" };
  return { ok: true, locale: l };
}
