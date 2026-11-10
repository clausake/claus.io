// Chantier 43 — LA GARDE DES EXPORTS, centralisee en un seul endroit.
//
// Le defaut mesure (audit senior du 09/11) : la restriction "maitre seulement"
// etait ecrite DANS la route admin.ts (GET /api/admin/db-download) mais pas
// dans l'autre export (POST /api/backup). Un compte STAFF obtenait donc un
// ZIP contenant la base entiere — hachages argon2, sessions vivantes et
// journal d'audit inclus.
//
// Pourquoi un module et non une copie dans chaque route : la demande du
// client est explicite ("centraliser la garde pour qu'un nouvel export ne
// contourne pas la regle"). Une regle copiee deux fois diverge a la
// premiere route ajoutee ; une regle centralisee ne peut pas diverger.
//
// Le code distingue les DEUX refus :
//   - aucune session du tout  -> 401 AUTH_REQUISE (l'identite est requise,
//     le client doit d'abord se connecter) ;
//   - session d'un autre role  -> 403 MAITRE_REQUIS (l'identite est connue,
//     le role ne suffit pas).
// C'est la table d'acceptation du client pour les DEUX exports :
// anonyme 401 / agent 403 / staff 403 / maitre 200.
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { SessionUser } from "./auth.js";

/** L'utilisateur de la requete, ou undefined (aucune session valide). */
export function utilisateurDeLaRequete(res: Response): SessionUser | undefined {
  return (res.locals as Record<string, unknown>).user as SessionUser | undefined;
}

/**
 * Middleware : reserve la route au role `maitre`.
 * Repond 401 (pas de session) ou 403 (mauvais role) et NE PASSUIT PAS la
 * route. A poser sur TOUTE route d'export ou de restauration.
 */
export function exigerMaitre(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = utilisateurDeLaRequete(res);
    if (!user) {
      res.status(401).json({
        error: "AUTH_REQUISE",
        message: "Connectez-vous pour exporter les donnees.",
      });
      return;
    }
    if (user.role !== "maitre") {
      res.status(403).json({
        error: "MAITRE_REQUIS",
        message: "L'export des donnees est reserve au maitre.",
      });
      return;
    }
    next();
  };
}
