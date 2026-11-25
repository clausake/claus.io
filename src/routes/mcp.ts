// Transport HTTP du registre d'outils (domaine 2 de GH-600).
// GET /api/mcp/outils     -> catalogue + allow-list (lecture libre)
// GET /api/mcp/serveurs   -> description du serveur local (aucun secret)
// POST /api/mcp/appel     -> {outil, arguments} -> resultat NOMME, trace
//
// L'agent ne passe PAS outre la gate §8 : /mcp/appel est exempté de la gate
// de session (comme /hermes/reflechir) UNIQUEMENT parce que le registre ne
// contient aucun outil ecrivant dans le metier. Le role est re-juge ici :
// staff refuse, agent refuse si COOKDRIVE_AGENT_OFF=1.
import { Router } from "express";
import type { Database } from "sqlite";
import type { AuditLogger } from "../services/audit.js";
import type { SessionUser } from "../middleware/auth.js";
import { appelerOutil, catalogue, allowList } from "../services/outils/index.js";

function currentUser(res: { locals: Record<string, unknown> }): SessionUser | undefined {
  return res.locals.user as SessionUser | undefined;
}

export default function createMcpRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  router.get("/api/mcp/outils", (_req, res) => {
    res.json({ status: "success", outils: catalogue(), regle: "§8 : l'IA propose, l'humain applique" });
  });

  router.get("/api/mcp/serveurs", (_req, res) => {
    res.json({
      status: "success",
      serveurs: [{
        nom: "clausio-local",
        transport: "http",
        pointEntree: "/api/mcp/outils",
        outils: [...allowList()],
        note: "Aucun secret n'est expose ici. Le serveur stdio (mcp-server.ts) parle au meme registre.",
      }],
      documentation: "docs/GH-600.md",
    });
  });

  router.post("/api/mcp/appel", async (req, res) => {
    try {
      if (process.env.COOKDRIVE_AGENT_OFF === "1") {
        const acteur = currentUser(res);
        if (acteur?.role === "agent") {
          return res.status(404).json({ error: "MODE_SANS_AGENT", message: "Ce poste tourne sans agent." });
        }
      }
      const acteur = currentUser(res);
      if (!acteur) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
      if (acteur.role === "staff") {
        return res.status(403).json({ error: "STAFF_LECTURE_SEULE", message: "Le staff n'appelle pas d'outil d'agent." });
      }
      const { outil, arguments: args } = req.body ?? {};
      if (typeof outil !== "string" || outil.trim() === "") {
        return res.status(400).json({ error: "OUTIL_REQUIS", refuse: ["outil"] });
      }
      if (args !== undefined && args !== null && typeof args !== "object") {
        return res.status(400).json({ error: "ARGUMENTS_INVALIDES", refuse: ["arguments"] });
      }
      const resultat = await appelerOutil(db, outil, (args ?? {}) as Record<string, unknown>);
      await logAudit(req, res, {
        route: "/api/mcp/appel",
        action: resultat.ok ? "outil_appelé" : "outil_refusé",
        entite: outil,
        payload: { erreur: resultat.erreur ?? null },
      });
      if (!resultat.ok) {
        return res.status(resultat.erreur === "OUTIL_INCONNU" || resultat.erreur === "OUTIL_NON_AUTORISE" ? 400 : 422)
          .json({ status: "error", ...resultat });
      }
      return res.status(200).json({ status: "success", ...resultat });
    } catch (e) {
      return res.status(500).json({
        error: "ECHEC_APPEL_OUTIL",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return router;
}
