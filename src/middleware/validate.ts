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
