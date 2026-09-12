// Validation des inputs API — helpers partagés
// Style : minimal, pas de dépendance externe.

import type { Request, Response } from "express";

/**
 * Valide que le champ `field` dans req.body est une chaîne non vide.
 * Retourne true si OK, sinon renvoie une réponse 400 et retourne false.
 */
export function requireString(
  req: Request,
  res: Response,
  field: string,
  maxLen = 500,
): boolean {
  const val = req.body?.[field];
  if (typeof val !== "string" || val.length === 0) {
    res.status(400).json({ error: `${field} is required (string)` });
    return false;
  }
  if (val.length > maxLen) {
    res.status(400).json({ error: `${field} too long (max ${maxLen})` });
    return false;
  }
  return true;
}

/**
 * Valide que le champ `field` dans req.body est un nombre fini.
 * Retourne true si OK, sinon renvoie une réponse 400 et retourne false.
 */
export function requireNumber(
  req: Request,
  res: Response,
  field: string,
): boolean {
  const val = req.body?.[field];
  if (typeof val !== "number" || !Number.isFinite(val)) {
    res.status(400).json({ error: `${field} must be a finite number` });
    return false;
  }
  return true;
}

/**
 * Valide que le champ `field` dans req.body est un tableau.
 * Retourne true si OK, sinon renvoie une réponse 400 et retourne false.
 */
export function requireArray(
  req: Request,
  res: Response,
  field: string,
  maxItems = 500,
): boolean {
  const val = req.body?.[field];
  if (!Array.isArray(val)) {
    res.status(400).json({ error: `${field} must be an array` });
    return false;
  }
  if (val.length > maxItems) {
    res.status(400).json({ error: `${field} too large (max ${maxItems} items)` });
    return false;
  }
  return true;
}

/**
 * Valide que le champ `field` dans req.body est une chaîne (peut être vide).
 * Retourne la valeur tronquée à maxLen, ou undefined si le champ est absent.
 * (Ne renvoie PAS d'erreur — pour les champs optionnels.)
 */
export function optionalString(
  req: Request,
  field: string,
  maxLen = 1000,
): string | undefined {
  const val = req.body?.[field];
  if (typeof val !== "string") return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

// ---------------------------------------------------------------------------
// Champs NUMERIQUES optionnels : la distinction ABSENT / VALEUR / REFUSE.
//
// Pourquoi ces helpers existent, et pourquoi requireNumber seul ne suffit pas.
// requireNumber est un garde de champ OBLIGATOIRE : il renvoie un 400 quand le
// champ manque. Sur un UPDATE partiel, le champ qui manque n'est pas une faute:
// c'est le client qui dit « je ne touche pas cette colonne ». Deux comportements
// etaient observes avant ces helpers, et les DEUX sont des defauts de donnes :
//
//   1. passer `undefined` au UPDATE : le binding de node-sqlite3 JETTE sur un
//      `undefined` — le PUT partiel sortait donc en 500 (mesure:
//      scripts/probe-inventory-put-partial.mjs, S1_CODE=500 sur un payload
//      parfaitement legal). Et si le binding etait relache, `undefined` devient
//      NULL en base : une mise a jour du seul nom viderait la quantite.
//   2. passer la valeur BRUTE sans la convertir : l'affinite dynamique de SQLite
//      stocke du TEXTE dans une colonne REAL sans se plaindre (mesure:
//      S2_CODE=200 avec quantity="abc" relus dans la base). Des lors,
//      `quantity <= minStock` compare du texte a un reel, le calcul du badge
//      « critique / bas / ok » devient faux, et l'auditeur affiche un statut
//      invente sans qu'aucune erreur serveur ne sorte. C'est la meme classe que
//      le KPI reste fige a 0 pendant des mois (PHASES.md, 10/09).
//
// Le contrat est donc a trois etats, et non a deux : ABSENT (on ne touche pas),
// une VALEUR nette (on ecrit), ou REJETE (le client a envoye une ordure -> 400).
// Un booleen ne peut pas porter ces trois etats; c'est ce qui rend ce petit
// module plus utile qu'un `if (typeof x === "number")`.
// ---------------------------------------------------------------------------

/** Marqueur « le client a envoye ce champ, mais il est inexploitable ». */
export const REJETE = Symbol("champ-rejete");

/** Vrai si `v` est le marqueur REJETE (et non `undefined`, qui veut « absent »). */
export function estRejete(v: unknown): v is typeof REJETE {
  return v === REJETE;
}

/**
 * Lit un nombre optionnel et le NETTOIE.
 *   undefined        -> le champ est absent: le routeur ne doit PAS l'ecrire.
 *   REJETE           -> present mais refuse: le routeur renvoie un 400.
 *   number           -> valeur nette, dans les bornes, finie.
 * Bornes ouvertes par defaut: un prix ou une quantite ne peuvent pas etre
 * negatives (le stock qui passerait en negatif est le defaut que la route
 * `consume` contourne par un `CASE WHEN ... < 0` au lieu de le refuser a la
 * porte); le plafond arrete les entrees qui ne sont pas des nombres de cuisine
 * (`Infinity`, 1e300) mais qui passeraient `Number.isFinite`... ne passent pas,
 * justement — il arrete aussi un `1e400` qui, lui, n'est PAS fini.
 */
export function optionalNumber(
  req: Request,
  field: string,
  opts: { min?: number; max?: number } = {},
): number | typeof REJETE | undefined {
  const brut = req.body?.[field];
  if (brut === undefined || brut === null || brut === "") return undefined;
  const min = opts.min ?? Number.NEGATIVE_INFINITY;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  // `Number(true)` vaut 1 et `Number([])` vaut 0: ce ne sont pas des saisis de
  // cuisine, ce sont des accidents de sérialisation. On n'accepte que le nombre
  // JSON et la chaine numeriquement significative.
  let n: number;
  if (typeof brut === "number") n = brut;
  else if (typeof brut === "string" && brut.trim() !== "") n = Number(brut);
  else return REJETE;
  if (!Number.isFinite(n) || n < min || n > max) return REJETE;
  return n;
}

/**
 * Lit une chaine optionnellement, en tranchant la meme question a trois etats.
 * Un champ texte BLANC ("   ") est REJETE et non "une chaine vide": un nom
 * d'article blanc rend un inventaire ou deux lignes sont indiscernables, et la
 * recherche par nom ne les retrouvera jamais toutes les deux.
 */
export function optionalText(
  req: Request,
  field: string,
  maxLen = 500,
): string | typeof REJETE | undefined {
  const brut = req.body?.[field];
  if (brut === undefined || brut === null) return undefined;
  if (typeof brut !== "string") return REJETE;
  const propre = brut.trim();
  if (propre === "") return REJETE;
  return propre.length > maxLen ? propre.slice(0, maxLen) : propre;
}

/**
 * Lit une valeur d'ENUM. Le jeu autorise est PASSE EN ARGUMENT et non invente
 * ici : c'est au routeur de dire quelles etiquettes il sait rendre, et a l'UI
 * de lui envoyer l'une d'elles. Sans ce garde, `status` est une chaine que le
 * client choisit (mesure: S3_STATUT="defile" relu dans la base) et le badge de
 * l'auditeur se met a afficher une couleur qui ne correspond a regle d'aucune.
 * Un jeu vide est un defaut de programmation: on le refuse au bruit pres.
 */
export function optionalEnum(
  req: Request,
  field: string,
  autorises: readonly string[],
): string | typeof REJETE | undefined {
  if (autorises.length === 0) throw new Error(`optionalEnum(${field}): jeu vide`);
  const brut = req.body?.[field];
  if (brut === undefined || brut === null) return undefined;
  if (typeof brut !== "string") return REJETE;
  const propre = brut.trim().toLowerCase();
  return autorises.includes(propre) ? propre : REJETE;
}
