// Middleware de licence — posé AVANT toutes les routes pour que plus aucune
// endpoint ne contourne le paywall. Il ne bloque QUE les mutations (POST/PUT/
// DELETE/PATCH) une fois le trial expiré et l'app non unlockée ; les GET
// (lecture) restent autorisés pour l'UI.
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Database } from "sqlite";
import { LicenseState } from "../db/init.js";

export const TRIAL_DAYS_GLOBAL = 30;
export const TRIAL_MS_GLOBAL = TRIAL_DAYS_GLOBAL * 24 * 60 * 60 * 1e3;

// Factory : renvoie un middleware Express qui lit l'état de la licence depuis la base.
export function licenseMiddleware(db: Database, license: LicenseState): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/trial-status" || req.path === "/unlock") return next();
    // S'authentifier n'est pas un acte metier : sans cette exemption, un
    // trial expire bloquerait le login lui-meme et personne ne pourrait
    // jamais reprendre la main. (Chantier 1, audit 2026-10-02 §8.)
    if (req.path.startsWith("/auth/")) return next();
    if (!db) return next(); // pas encore initialisé (démarrage)
    let unlockedRow: { value: string } | null | undefined = undefined;
    try {
      unlockedRow = await db.get(
        "SELECT value FROM app_license WHERE key = 'is_unlocked'",
      );
    } catch (e) {
      return next(); // erreur DB → ne pas bloquer à cause d'un bug d'init
    }
    const isUnlocked = unlockedRow ? unlockedRow.value === "true" : false;
    if (!isUnlocked) {
      const installDate = parseInt(license.finalInstallTime) || 0;
      const isExpired = Date.now() - installDate > license.TRIAL_MS;
      const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (isExpired && isMutation) {
        return res.status(403).json({
          error: "TRIAL_EXPIRED",
          message: "La période d'essai de 30 jours est terminée.",
        });
      }
    }
    next();
  };
}
