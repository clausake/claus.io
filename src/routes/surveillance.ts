// Route du moteur de surveillance (chantier 4). POST /api/surveillance/scan
// fait tourner les regles (src/services/surveillance.ts) et DEPOSE les
// propositions dans la boite de suggestions (chantier 3) — le moteur
// n'ecrit JAMAIS le metier lui-meme (§8) : il propose, l'humain execute.
//
// Droits : le MAITRE declenche le scan (il peut aussi le programmer en
// externe). L'AGENT peut le declencher AUSSI (c'est son role §8 :
// "SURVEILLE ... et INFORME") — le scan n'ecrit que dans SA table. Le STAFF
// est refuse (ce n'est pas son ecran, et un scan de sa part polluerait la
// boite).
//
// Deduplication : une cle de proposition (regle+objet+jour) est stockee dans
// la colonne explication-prefixee du dedup (suggestions ne porte pas de
// colonne cle — on REPOSUR le payload JSON : la suggestion proposee deux
// fois le meme jour pour le meme objet est DETECTEE par son contenu, sans
// schema supplementaire). Simple, jugeable, sans migration.
import { Router } from "express";
import type { Database } from "sqlite";
import { sessionGate } from "../middleware/auth.js";
import type { SessionUser } from "../middleware/auth.js";
import type { AuditLogger } from "../services/audit.js";
import { scanner, seuilsDe } from "../services/surveillance.js";
import { settingsStore } from "../services/settings.js";
import crypto from "crypto";

function currentUser(res: { locals: Record<string, unknown> }): SessionUser | undefined {
  return res.locals.user as SessionUser | undefined;
}

export default function createSurveillanceRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  router.post("/api/surveillance/scan", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (!actor) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
      if (actor.role === "staff") {
        return res.status(403).json({ error: "STAFF_LECTURE_SEULE", message: "Le scan de surveillance n'est pas l'ecran du staff." });
      }
      // MODE SANS AGENT : le maitre peut scanner a la main (la boite est
      // fermee a l'agent mais la surveillance manuelle reste un outil).
      // L'agent, lui, n'a plus acces au scan dans ce mode.
      if (process.env.COOKDRIVE_AGENT_OFF === "1" && actor.role === "agent") {
        return res.status(403).json({ error: "AGENT_LECTURE_SEULE", message: "Le mode sans agent coupe le scan agent." });
      }

      const seuils = seuilsDe(settingsStore.value as Record<string, unknown>);
      const propositions = await scanner(db, seuils);

      // Deduplication : une proposition dont la cle est DEJA dans une
      // suggestion du jour n'est pas reposee. La cle est prefixee dans
      // l'explication (format jugeable : "[cle] ...").
      const aujourdhuiISO = new Date().toISOString().slice(0, 10);
      const existantes = (await db.all(
        `SELECT explication FROM suggestions WHERE created_at >= ?`,
        [aujourdhuiISO],
      )) as Array<{ explication: string | null }>;
      const clesExistantes = new Set(
        existantes.map((e) => e.explication?.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean) as string[],
      );

      let deposees = 0;
      const ignorees: string[] = [];
      for (const p of propositions) {
        if (clesExistantes.has(p.cle)) { ignorees.push(p.cle); continue; }
        const id = crypto.randomUUID();
        await db.run(
          `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, p.type, p.priorite, p.titre, `[${p.cle}] ${p.explication}`, p.action_route,
           p.action_payload ? JSON.stringify(p.action_payload) : null],
        );
        clesExistantes.add(p.cle);
        deposees++;
      }
      await logAudit(req, res, { route: "/api/surveillance/scan", action: "scan", payload: { deposees, ignorees: ignorees.length, propositions: propositions.length } });
      res.json({ status: "success", propositions: propositions.length, deposees, ignorees: ignorees.length, seuils });
    } catch (e) {
      res.status(500).json({ error: "SCAN_ERREUR", message: String(e) });
    }
  });

  // Les seuils ACTIFS (lecture libre : l'UI les affiche dans le reglage).
  router.get("/api/surveillance/seuils", (_req, res) => {
    res.json(seuilsDe(settingsStore.value as Record<string, unknown>));
  });

  return router;
}
