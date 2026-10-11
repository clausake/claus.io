// Route du cerveau Hermes (chantier 5). POST /api/hermes/reflechir fait
// tourner la boucle COMPLETE (contexte -> consigne -> LLM -> propositions
// validees) et DEPOSE les propositions dans la boite de suggestions — la
// SEULE ecriture du cerveau (§8). Le LLM n'est JAMAIS juge ici : il est
// INJECTE (la regle du transport injecte), et la porte du contrat utilise le
// cerveau factice deterministe.
//
// Droits : MAITRE et AGENT declenchent (le cerveau n'ecrit que dans SA
// table). STAFF refuse. Sous COOKDRIVE_AGENT_OFF=1, le cerveau est coupe.
//
// Le LLM reel : Ollama local par defaut (llm_choix=ollama), un fournisseur de
// la liste blanche optionnel (la couche fournisseur du Sprint 15). Si le LLM
// est muet/jetable, le refus est NOMME — jamais un 200 muet.
import { Router } from "express";
import type { Database } from "sqlite";
import { sessionGate } from "../middleware/auth.js";
import type { SessionUser } from "../middleware/auth.js";
import type { AuditLogger } from "../services/audit.js";
import {
  cerveauHermes, construireConsigne, construireContexte,
  parseSuggestions, type PropositionHermes,
} from "../services/hermes.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import crypto from "crypto";

function currentUser(res: { locals: Record<string, unknown> }): SessionUser | undefined {
  return res.locals.user as SessionUser | undefined;
}

export default function createHermesRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  router.post("/api/hermes/reflechir", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (!actor) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
      if (actor.role === "staff") {
        return res.status(403).json({ error: "STAFF_LECTURE_SEULE", message: "Le cerveau n'est pas l'ecran du staff." });
      }
      if (process.env.COOKDRIVE_AGENT_OFF === "1" && actor.role === "agent") {
        return res.status(403).json({ error: "AGENT_LECTURE_SEULE", message: "Le mode sans agent coupe le cerveau." });
      }

      // Le contexte + la consigne sont CONSTRUITS AVANT tout appel LLM (jugeable
      // par la porte sans jamais toucher le modele).
      const ctx = await construireContexte(db);
      const consigne = construireConsigne(ctx);

      // Le cerveau : le TEST peut injecter le sien (corps {cerveau: "factice"}),
      // le produit joue le vrai (Ollama local). Aucune clef ne passe ici.
      let texte: string;
      let source: string;
      if (req.body?.cerveau === "factice" || process.env.COOKDRIVE_HERMES_FACTICE === "1") {
        // Le cerveau factice deterministe du service (JAMAIS de LLM en CI).
        const { cerveauFactice } = await import("../services/hermes.js");
        texte = await cerveauFactice()(consigne);
        source = "factice";
      } else {
        const response = await ollama.generate({
          model: getModel(ollamaSettingsRef.current),
          prompt: consigne,
          format: "json",
          options: { temperature: 0.2 },
        });
        texte = response.response;
        source = getModel(ollamaSettingsRef.current);
      }

      const { propositions, refusees } = parseSuggestions(texte);

      // Deduplication : une cle (route+titre) deja deposee aujourd'hui n'est
      // pas reposee (le meme piege que le scan du chantier 4).
      const aujourdhuiISO = new Date().toISOString().slice(0, 10);
      const existantes = (await db.all(
        "SELECT titre, action_route FROM suggestions WHERE created_at >= ?",
        [aujourdhuiISO],
      )) as Array<{ titre: string; action_route: string }>;
      const dejaLa = new Set(existantes.map((e) => `${e.action_route}|${e.titre}`));

      let deposees = 0;
      const ignorees: string[] = [];
      for (const p of propositions) {
        const cle = `${p.action_route}|${p.titre}`;
        if (dejaLa.has(cle)) { ignorees.push(cle); continue; }
        const id = crypto.randomUUID();
        await db.run(
          `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, p.type, p.priorite, p.titre, p.explication, p.action_route,
           p.action_payload ? JSON.stringify(p.action_payload) : null],
        );
        dejaLa.add(cle);
        deposees++;
      }
      await logAudit(req, res, { route: "/api/hermes/reflechir", action: "reflechir", payload: { source, deposees, ignorees: ignorees.length, refusees: refusees.length } });
      res.json({ status: "success", source, propositions: propositions.length, deposees, ignorees: ignorees.length, refusees });
    } catch (e) {
      // Le LLM muet/jetable est un refus NOMME, jamais un 200 muet ni un 500 nu.
      res.status(502).json({ error: "CERVEAU_INJOIGNABLE", message: String((e as Error)?.message ?? e) });
    }
  });

  // Le contexte PUR, pour l'UI et le diagnostic (lecture libre).
  router.get("/api/hermes/contexte", async (_req, res) => {
    try {
      res.json(await construireContexte(db));
    } catch (e) {
      res.status(500).json({ error: "CONTEXTE_ERREUR", message: String(e) });
    }
  });

  return router;
}
