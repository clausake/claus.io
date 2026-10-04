// Routes d'identite (chantier 1). Un installation = un etablissement
// (tranche le 03/10) : le PREMIER compte cree devient maitre (setup), les
// suivants sont crees par lui (routes /api/users, maitre only). Aucune route
// ici n'est jugeable par la sessionGate (exemption /auth/*) ; les routes
// /api/users SONT jugees (maitre only).
import { Router, type Request, type Response } from "express";
import type { Database } from "sqlite";
import crypto from "crypto";
import {
  argon2,
  SESSION_COOKIE,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  type Role,
  type SessionUser,
} from "../middleware/auth.js";

const ROLES: Role[] = ["maitre", "staff", "agent"];

function currentUser(res: Response): SessionUser | undefined {
  return (res.locals as Record<string, unknown>).user as SessionUser | undefined;
}

export default function createAuthRouter(db: Database) {
  const router = Router();

  // --- Setup : le premier compte de l'installation. Refuse s'il en existe
  // deja un — sinon quiconque atteint le serveur reprendrait la main.
  router.post("/api/auth/setup", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || username.trim().length < 3 || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          error: "SETUP_INVALIDE",
          message: "username (3+ caracteres) et password (8+ caracteres) requis.",
        });
      }
      const count = await db.get("SELECT COUNT(*) AS n FROM users") as { n: number };
      if (count.n > 0) {
        return res.status(409).json({
          error: "SETUP_DEJA_FAIT",
          message: "Un compte existe deja. Passez par /api/auth/login.",
        });
      }
      const id = crypto.randomUUID();
      const passwordHash = await argon2.hash(password);
      await db.run(
        "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'maitre')",
        [id, username.trim(), passwordHash],
      );
      const token = await createSession(db, id);
      setSessionCookie(res, token);
      res.status(201).json({ ok: true, user: { id, username: username.trim(), role: "maitre" } });
    } catch (e) {
      res.status(500).json({ error: "SETUP_ERREUR", message: String(e) });
    }
  });

  // --- Login. Le hash n'est lu qu'ici ; argon2.verify est a temps constant.
  router.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "LOGIN_INVALIDE", message: "username et password requis." });
      }
      const row = await db.get(
        "SELECT id, username, password_hash, role, active FROM users WHERE username = ?",
        [username.trim()],
      ) as { id: string; username: string; password_hash: string; role: Role; active: number | boolean } | undefined;
      // Meme message pour compte inexistant et mot de passe faux — pas
      // d'enumeration de comptes.
      const bad = { status: 401, body: { error: "IDENTIFIANTS_REFUSES", message: "Identifiants refuses." } };
      if (!row || !row.active) return res.status(bad.status).json(bad.body);
      const ok = await argon2.verify(row.password_hash, password).catch(() => false);
      if (!ok) return res.status(bad.status).json(bad.body);
      const token = await createSession(db, row.id);
      setSessionCookie(res, token);
      res.json({ ok: true, user: { id: row.id, username: row.username, role: row.role } });
    } catch (e) {
      res.status(500).json({ error: "LOGIN_ERREUR", message: String(e) });
    }
  });

  router.post("/api/auth/logout", async (req, res) => {
    try {
      await destroySession(db, (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE]);
    } catch { /* la deconnexion ne doit jamais echouer cote client */ }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/api/auth/me", (req, res) => {
    const user = currentUser(res);
    if (!user) return res.status(401).json({ error: "AUTH_REQUISE", message: "Pas de session valide." });
    res.json({ user });
  });

  // --- Gestion des comptes (maitre only). Le staff/agent est cree par le
  // maitre ; la reinitialisation et la desactivation aussi.
  router.get("/api/users", (req, res) => {
    const user = currentUser(res);
    if (user?.role !== "maitre") {
      return res.status(403).json({ error: "MAITRE_REQUIS", message: "Gestion des comptes reservee au maitre." });
    }
    db.all("SELECT id, username, role, active, created_at FROM users ORDER BY created_at")
      .then((rows) => res.json({ users: rows }))
      .catch((e) => res.status(500).json({ error: "USERS_ERREUR", message: String(e) }));
  });

  router.post("/api/users", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (actor?.role !== "maitre") {
        return res.status(403).json({ error: "MAITRE_REQUIS", message: "Gestion des comptes reservee au maitre." });
      }
      const { username, password, role } = req.body ?? {};
      if (typeof username !== "string" || username.trim().length < 3 || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "USER_INVALIDE", message: "username (3+) et password (8+) requis." });
      }
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: "ROLE_INVALIDE", message: "role: maitre | staff | agent." });
      }
      const id = crypto.randomUUID();
      const passwordHash = await argon2.hash(password);
      await db.run(
        "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        [id, username.trim(), passwordHash, role],
      );
      res.status(201).json({ ok: true, user: { id, username: username.trim(), role } });
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("UNIQUE")) {
        return res.status(409).json({ error: "USERNAME_PRIS", message: "Ce username existe deja." });
      }
      res.status(500).json({ error: "USER_ERREUR", message: msg });
    }
  });

  // Desactivation / reactivation + reinitialisation de mot de passe.
  // Un compte desactive ne peut plus se loguer (loadSession verifie active).
  router.post("/api/users/:id", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (actor?.role !== "maitre") {
        return res.status(403).json({ error: "MAITRE_REQUIS", message: "Gestion des comptes reservee au maitre." });
      }
      const { active, password } = req.body ?? {};
      const target = await db.get("SELECT id, role FROM users WHERE id = ?", [req.params.id]) as { id: string; role: Role } | undefined;
      if (!target) return res.status(404).json({ error: "USER_ABSENT", message: "Compte introuvable." });
      if (typeof active === "boolean") {
        // Auto-desactivation refusee : le dernier maitre actif ne doit pas
        // pouvoir se retrouver seul compte desactive (verrouillage total).
        if (target.id === actor.id && !active) {
          return res.status(400).json({ error: "AUTO_DESACTIVATION", message: "Desactivez un autre compte maitre d'abord." });
        }
        await db.run("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, target.id]);
        if (!active) {
          // Revoquer les sessions ouvertes du compte desactive.
          await db.run("DELETE FROM sessions WHERE user_id = ?", [target.id]);
        }
      }
      if (typeof password === "string" && password.length >= 8) {
        const passwordHash = await argon2.hash(password);
        await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, target.id]);
        await db.run("DELETE FROM sessions WHERE user_id = ?", [target.id]);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "USER_ERREUR", message: String(e) });
    }
  });

  return router;
}
