// Identité (chantier 1, audit 2026-10-02 §8). Le produit a DEUX modes depuis
// l'origine : avec agent Hermes (lecture seule — il informe, l'humain clique)
// et sans agent (saisie manuelle). Dans les deux cas il faut savoir QUI parle :
// ces middlewares attachent la session a la requete et bloquent les mutations
// non authentifiees. Les GET restent ouverts (contrat license : lecture libre),
// et /api/auth/* est exemptee (on ne peut pas exiger une session pour en
// OBTENIR une). Le role `agent` est refuse sur TOUTE route mutable — sa seule
// ecriture future sera sa table de suggestions (chantier 3).
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Database } from "sqlite";
import crypto from "crypto";
import argon2 from "argon2";

export const SESSION_COOKIE = "cd_session";
// Une journee de service : le matin on se reconnecte, pas a 14h en plein rush.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1e3;

export type Role = "maitre" | "staff" | "agent";
export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Charge la session depuis la base. Renvoie undefined si absente/invalide/
// inactive — jamais une exception (la gate decide, pas le parseur).
export async function loadSession(
  db: Database,
  token: string | undefined,
): Promise<SessionUser | undefined> {
  if (!token) return undefined;
  const row = await db.get(
    `SELECT u.id, u.username, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(String(token)), Date.now()],
  ) as { id: string; username: string; role: Role; active: number | boolean } | undefined;
  if (!row || !row.active) return undefined;
  return { id: row.id, username: row.username, role: row.role };
}

// La gate : GET libre (contrat license), /api/auth/* libre, sinon session
// requise. Le role agent est refuse sur toute mutation — Hermes informe,
// l'humain execute (§8). SEULES exceptions d'ecriture agent, posees par §8 :
// sa table `suggestions` (chantier 3) et la lecture de son propre audit.
// COOKDRIVE_AUTH_OFF=1 est une env de HARNAIS (comme USER_DATA_PATH /
// COOKDRIVE_INSTANCE_TOKEN) : le spec e2e du METIER (routes.spec.ts) boote le
// serveur avec, pour juger les contrats metier sans identite. Le produit ne
// la lit que si elle est explicitement posee ; la porte verify:auth, elle,
// juge la gate ACTIVE (elle ne la pose pas). Une installation qui mettrait
// cette env dans son lancement n'aurait plus d'auth — c'est un defaut
// d'exploitation, pas du produit.
// ATTENTION : cette gate est montee sous /api (server.ts), donc req.path est
// RELATIF — c'est "/suggestions", pas "/api/suggestions". Le piege de la
// premiere version : comparer au chemin absolu n'a JAMAIS matche, l'exemption
// etait morte et l'agent etait refuse sur sa propre boite.
const ECRITURES_AGENT = new Set([
  "/suggestions", // chantier 3 : la seule ecriture de l'agent
]);

export function sessionGate(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.COOKDRIVE_AUTH_OFF === "1") return next();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.path.startsWith("/auth/")) return next();
    const user = (res.locals as Record<string, unknown>).user as SessionUser | undefined;
    if (!user) {
      return res.status(401).json({
        error: "AUTH_REQUISE",
        message: "Connectez-vous pour effectuer cette action.",
      });
    }
    if (user.role === "agent" && ![...ECRITURES_AGENT].some((p) => req.path.startsWith(p))) {
      return res.status(403).json({
        error: "AGENT_LECTURE_SEULE",
        message: "L'agent ne peut pas ecrire dans le metier. L'humain execute.",
      });
    }
    next();
  };
}

// Middleware async : lit le cookie, charge la session, la pose sur
// res.locals.user. Un seul point de branchement dans server.ts.
export function sessionMiddleware(db: Database): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    try {
      const user = await loadSession(db, cookies?.[SESSION_COOKIE]);
      if (user) (res.locals as Record<string, unknown>).user = user;
    } catch {
      // base indisponible : on continue sans identite, la gate decidera
    }
    next();
  };
}

// Cree la session en base et rend le token a poser en cookie httpOnly.
export async function createSession(db: Database, userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.run(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [hashToken(token), userId, Date.now() + SESSION_TTL_MS],
  );
  return token;
}

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1e3)}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

export async function destroySession(db: Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

export { argon2 };
