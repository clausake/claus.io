// Audit trail (chantier 2, AGENTS.md §8). UN SEUL point d'entrée : toute
// route mutable des 20 routeurs src/routes/ ecrit ici AVANT sa reponse.
// Le reglement sanitaire (regl. (CE) n°852/2004 art. 5) exige la tracabilite
// HACCP : scan, lots, temperatures sont obligatoirement journalises.
// actor_kind distingue l'humain de l'agent ; payload porte avant/apres quand
// la route en a un (PUT/DELETE). L'ecriture audit ne doit JAMAIS faire echouer
// la route metier : une panne de journal ne peut pas bloquer un releve de
// temperature (mais elle est crie, cf. catch).
import type { Database } from "sqlite";
import type { Request, Response } from "express";
import type { SessionUser } from "../middleware/auth.js";

export interface AuditEntry {
  route: string;
  action: string;
  entite?: string | null;
  payload?: unknown;
}

export type ActorKind = "humain" | "agent" | "harnais" | "anonyme";

export function actorDe(res: Response): { actor_id: string; actor_kind: ActorKind } {
  const user = (res.locals as Record<string, unknown>).user as SessionUser | undefined;
  if (!user) {
    // Harnais (COOKDRIVE_AUTH_OFF=1) : les specs e2e bootent sans identite.
    // L'audit journalise quand meme — sinon un contrat HACCP juge sous harnais
    // n'ecrireait rien et la porte verify:audit rougirait pour une raison
    // d'infrastructure, pas de produit.
    if (process.env.COOKDRIVE_AUTH_OFF === "1") {
      return { actor_id: "harnais", actor_kind: "harnais" };
    }
    return { actor_id: "anonyme", actor_kind: "anonyme" };
  }
  return { actor_id: user.id, actor_kind: user.role === "agent" ? "agent" : "humain" };
}

export function createAuditLogger(db: Database) {
  return async function logAudit(
    req: Request,
    res: Response,
    entry: AuditEntry,
  ): Promise<void> {
    try {
      const { actor_id, actor_kind } = actorDe(res);
      const payload = entry.payload === undefined ? null : JSON.stringify(entry.payload);
      await db.run(
        `INSERT INTO audit_log (actor_id, actor_kind, route, action, entite, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [actor_id, actor_kind, req.path, entry.action, entry.entite ?? null, payload],
      );
    } catch (e) {
      console.error("[AUDIT] ecriture impossible:", e);
    }
  };
}

export type AuditLogger = ReturnType<typeof createAuditLogger>;

// Les DEUX routeurs racine (settings.ts, backup.ts) ne sont pas factorises:
// server.ts pose ici la db a laquelle leur logger paresseux accede. C'est un
// pointeur, pas un import — une importation circulaire settings<->server
// serait pire qu'un setter explicite.
let dbLazy: Database | null = null;

export function setAuditDb(db: Database): void {
  dbLazy = db;
}

export function logAuditRacine(
  req: Request,
  res: Response,
  entry: AuditEntry,
): Promise<void> {
  if (!dbLazy) {
    // La db n'est pas encore posee (demarrage) : on n'echoue pas la route.
    console.error("[AUDIT] db absente pour route racine:", entry.route);
    return Promise.resolve();
  }
  return createAuditLogger(dbLazy)(req, res, entry);
}
