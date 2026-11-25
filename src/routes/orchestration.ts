// Orchestration multi-agents HTTP — domaine 5 de GH-600.
// POST /api/orchestration/run        -> {cerveau?: "factice"} lance un run
// POST /api/orchestration/reprendre  -> {run_id, cerveau?} reprend sans refaire
// GET  /api/orchestration/runs       -> liste des runs (lecture libre)
// GET  /api/orchestration/runs/:id   -> artifacts + verdict (lecture libre)
//
// Comme Hermes : le LLM n'est JAMAIS juge dans cette route — il est INJECTE.
// En CI, `cerveau: "factice"` (ou COOKDRIVE_HERMES_FACTICE=1) rend la boucle
// deterministe, sans reseau et sans cle.
import { Router } from "express";
import type { Database } from "sqlite";
import type { AuditLogger } from "../services/audit.js";
import type { SessionUser } from "../middleware/auth.js";
import { cerveauFactice, type Cerveau } from "../services/hermes.js";
import { generer } from "../shared/llm.js";
import {
  orchestrer, reprendre, lireRun, listerRuns,
} from "../services/orchestration/index.js";

function currentUser(res: { locals: Record<string, unknown> }): SessionUser | undefined {
  return res.locals.user as SessionUser | undefined;
}

export default function createOrchestrationRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  function cerveauPour(body: unknown): Cerveau {
    const factice = (body as { cerveau?: string } | null)?.cerveau === "factice"
      || process.env.COOKDRIVE_HERMES_FACTICE === "1";
    if (factice) return cerveauFactice();
    return async (consigne: string) => (await generer({ prompt: consigne, format: "json", temperature: 0.2 })).texte;
  }

  async function lancer(req: Parameters<AuditLogger>[0], res: Parameters<AuditLogger>[1], reprendreId?: string) {
    if (process.env.COOKDRIVE_AGENT_OFF === "1" && currentUser(res)?.role === "agent") {
      return res.status(404).json({ error: "MODE_SANS_AGENT", message: "Ce poste tourne sans agent." });
    }
    const acteur = currentUser(res);
    if (!acteur) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
    if (acteur.role === "staff") {
      return res.status(403).json({ error: "STAFF_LECTURE_SEULE", message: "Le staff n'orchestre pas d'agents." });
    }
    const resultat = reprendreId
      ? await reprendre(db, reprendreId, cerveauPour(req.body))
      : await orchestrer(db, cerveauPour(req.body));
    if (!resultat) return res.status(404).json({ error: "RUN_INCONNU", message: "Run introuvable." });
    await logAudit(req, res, {
      route: reprendreId ? "/api/orchestration/reprendre" : "/api/orchestration/run",
      action: reprendreId ? "run_repris" : "run_lancé",
      entite: resultat.run_id,
      payload: { statut: resultat.statut, propositions: resultat.propositions.length, conflits: resultat.conflits.length },
    });
    return res.status(resultat.statut === "echeche" ? 422 : 201).json({ status: "success", ...resultat });
  }

  router.post("/api/orchestration/run", async (req, res) => {
    try { return await lancer(req, res); } catch (e) {
      return res.status(500).json({ error: "ECHEC_ORCHESTRATION", message: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/api/orchestration/reprendre", async (req, res) => {
    try {
      const id = (req.body as { run_id?: string } | null)?.run_id;
      if (typeof id !== "string" || id.trim() === "") {
        return res.status(400).json({ error: "RUN_ID_REQUIS", refuse: ["run_id"] });
      }
      return await lancer(req, res, id);
    } catch (e) {
      return res.status(500).json({ error: "ECHEC_REPRISE", message: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get("/api/orchestration/runs", async (_req, res) => {
    res.json({ status: "success", runs: await listerRuns(db) });
  });

  router.get("/api/orchestration/runs/:id", async (req, res) => {
    const run = await lireRun(db, String(req.params.id));
    if (!run) return res.status(404).json({ error: "RUN_INCONNU" });
    res.json({ status: "success", run });
  });

  return router;
}
