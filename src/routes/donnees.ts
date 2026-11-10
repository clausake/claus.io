// Chantier 49 — La REPRISE des donnees d'une ancienne installation.
//
// Deux routes :
//   GET  /api/donnees/actif    : le chemin de donnees REELLEMENT actif +
//                                les bases anciennes detectees (lecture seule)
//                                + la proposition d'import (si elle est licite) ;
//   POST /api/donnees/importer : l'HUMAIN demande l'import (le client n'ecrit
//                                jamais tout seul : §8 « l'humain clique et
//                                execute »). Reserve au maitre.
//
// L'import n'est propose QUE si l'installation active est vierge (hors kit
// de demonstration) ; une base active non vide n'est jamais ecrasee.
import { Router } from "express";
import type { Database } from "sqlite";
import type { AuditLogger } from "../services/audit.js";
import { exigerMaitre } from "../middleware/garde-maitre.js";
import {
  baseViergeHorsKit,
  detecterDossiersAnciens,
  dossierDonneesActif,
  importerDonneesAnciennes,
} from "../services/donnees-anciennes.js";

export default function donneesRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  // GET /api/donnees/actif — l'etat reel : ou sont les donnees, et y a-t-il
  // une ancienne base a proposer.
  router.get("/api/donnees/actif", async (_req, res) => {
    try {
      const dossierActif = dossierDonneesActif();
      const candidats = (await detecterDossiersAnciens(dossierActif)).filter((c) => c.present);
      const vierge = await baseViergeHorsKit(db);
      // La proposition n'a de sens que si une ancienne base existe ET que
      // l'installation active est vierge. Sinon : aucun message, aucun
      // ralentissement (regle du cahier des charges).
      const proposition =
        vierge && candidats.length > 0
          ? {
              dossier: candidats[0].dossier,
              base: candidats[0].base,
              tables: candidats[0].tables,
              lignes: candidats[0].lignes,
              modifie_le: candidats[0].modifie_le,
            }
          : null;
      res.json({
        status: "ok",
        chemin_actif: dossierActif,
        base_active: `${dossierActif}/agent_culinaire.db`,
        base_vierge: vierge,
        anciennes_bases: candidats.map((c) => ({
          dossier: c.dossier,
          tables: c.tables,
          lignes: c.lignes,
          modifie_le: c.modifie_le,
        })),
        proposition_import: proposition,
      });
    } catch (e) {
      res.status(500).json({ status: "error", message: String(e) });
    }
  });

  // POST /api/donnees/importer — l'import demande par le client.
  router.post("/api/donnees/importer", exigerMaitre(), async (req, res) => {
    const dossier = String((req.body as { dossier?: unknown })?.dossier ?? "");
    if (!dossier) {
      return res.status(400).json({ error: "DOSSIER_ABSENT", message: "Aucun dossier a importer." });
    }
    try {
      const resultat = await importerDonneesAnciennes(db, dossierDonneesActif(), dossier);
      await logAudit(req, res, {
        route: "/api/donnees/importer",
        action: "import",
        entite: dossier,
        payload: { lignes: resultat.lignes, uploads: resultat.uploads },
      });
      res.json({ status: "ok", ...resultat });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code = (message.split(":")[0] || "IMPORT_ECHEC").trim();
      res.status(code === "IMPORT_ECHEC" ? 500 : 409).json({ error: code, message });
    }
  });

  return router;
}
