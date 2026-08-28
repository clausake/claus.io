// Helper de log d'erreur — à appeler dans les routes/middlewares quand une
// erreur est catchée (ou dans le middleware d'erreur global) :
//   [ERROR] GET /api/inventory — message d'erreur
//   <stack complète si err est une instance Error>
import type { Request } from "express";

export function logError(req: Request, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ERROR] ${req.method} ${req.path} — ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}
