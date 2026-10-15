// Boite de réception de suggestions (chantier 3, feuille de route §8).
// La SEULE ecriture de l'agent : il PROPOSE, jamais n'execute. La suggestion
// porte une action PRE-REMPLIE (route + payload) que l'humain applique a SA
// signature — l'application rejoue la route cible par le serveur (jamais un
// client tiers), donc la mutation passe par le contrat de SA route (validation
// + audit trail du chantier 2) et JAMAIS par un court-circuit.
//
// Regles :
//   - POST /api/suggestions            -> agent (ou maitre) seulement
//   - GET  /api/suggestions            -> lecture libre (l'UI du chef la lit)
//   - POST /api/suggestions/:id/appliquer -> maitre SEUL ; rejoue l'action
//   - POST /api/suggestions/:id/rejeter   -> maitre SEUL, motif obligatoire
//   - GET  /api/suggestions/:id        -> lecture libre
// Une suggestion deja decidee (applique/rejete) n'est plus decidable (409).
// L'application est refusee si l'action pre-remplie vise une route que le
// produit ne connait pas — on ne rejoue pas un payload invente.
import { Router } from "express";
import type { Database } from "sqlite";
import crypto from "crypto";
import { sessionGate } from "../middleware/auth.js";
import type { SessionUser } from "../middleware/auth.js";
import type { AuditLogger } from "../services/audit.js";

// Les routes cibles QUE LE PRODUIT CONNAIT. Une suggestion qui en vise une
// autre est refusee a la CREATION (l'agent ne peut pas pre-remplir un POST
// vers /api/users ou /api/admin : la boite n'est pas une voie de contournement
// de la gate §8). Le verbe d'application est toujours POST — les routes
// cibles d'ecriture du produit le sont deja, sauf PUT/DELETE que l'on exprime
// via leur payload {"__method": ...} rejoue en interne.
// Les routes cibles QUE LE PRODUIT CONNAIT — EXPORTÉES : le cerveau Hermes
// (src/services/hermes.ts) valide ses propositions contre LA MEME liste
// (une seule source de verité, le chantier 5 ne peut pas la diverger).
export const ROUTES_CIBLES = new Set([
  "/api/inventory", "/api/inventory/bulk", "/api/inventory/consume",
  "/api/recipes", "/api/menu-planning", "/api/staff",
  "/api/suppliers", "/api/purchasing/order", "/api/supplier-prices",
  "/api/supplier-prices/import-confirm",
  "/api/documents", "/api/haccp/temperature", "/api/haccp/batches",
  "/api/haccp/cleaning", "/api/haccp/production", "/api/haccp/corrective-action",
  "/api/haccp/iot-sensors", "/api/robots/assign",
]);

const TYPES = ["stock", "achat", "menu", "haccp", "general", "anomalie"];
const PRIORITES = ["basse", "normale", "haute"];

function currentUser(res: { locals: Record<string, unknown> }): SessionUser | undefined {
  return res.locals.user as SessionUser | undefined;
}

export default function createSuggestionsRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  // MODE SANS AGENT (§8) : COOKDRIVE_AGENT_OFF=1 ferme la boite ENTIEREMENT —
  // l'agent n'existe pas dans ce mode, il ne peut rien proposer. Env de
  // LANCEMENT (pas de harnais) : une installation qui la pose n'a plus
  // d'agent, la saisie manuelle reste complete. Le maitre peut la poser pour
  // desactiver Hermes sans supprimer ses comptes.
  const agentCoupe = process.env.COOKDRIVE_AGENT_OFF === "1";

  // --- Creation : la SEULE ecriture de l'agent. Validee au niveau du FORMULAIRE,
  // pas du contenu de la proposition (l'agent peut se tromper, l'humain jugera) :
  // type/priorite de l'enum, titre non blanc, action_route dans la liste blanche,
  // action_payload du JSON serialisable.
  router.post("/api/suggestions", async (req, res) => {
    try {
      // Mode sans agent : la boite est fermee. 404 — la route n'existe pas
      // dans ce mode (pas un 403 qui suggererait qu'il suffirait d'etre
      // maitre pour la rouvrir, et pas un 503 qui dirait "reessayez").
      if (agentCoupe) {
        return res.status(404).json({ error: "MODE_SANS_AGENT", message: "Ce poste tourne sans agent : la boite de suggestions est fermee." });
      }
      const actor = currentUser(res);
      // §8 : l'agent propose. Le maitre peut aussi saisir une suggestion a la
      // main (mode sans agent). Le staff non : la boite n'est pas son ecran.
      if (!actor || actor.role === "staff") {
        return res.status(actor ? 403 : 401).json({
          error: actor ? "STAFF_LECTURE_SEULE" : "AUTH_REQUISE",
          message: actor ? "Seul l'agent ou le maitre peut proposer." : "Connectez-vous.",
        });
      }
      const { type, priorite, titre, explication, action_route, action_payload } = req.body ?? {};
      if (!TYPES.includes(type)) {
        return res.status(400).json({ error: "TYPE_INVALIDE", refuse: ["type"], message: "type: " + TYPES.join(" | ") });
      }
      const prio = priorite ?? "normale";
      if (!PRIORITES.includes(prio)) {
        return res.status(400).json({ error: "PRIORITE_INVALIDE", refuse: ["priorite"], message: "priorite: " + PRIORITES.join(" | ") });
      }
      if (typeof titre !== "string" || titre.trim() === "" || titre.length > 200) {
        return res.status(400).json({ error: "TITRE_INVALIDE", refuse: ["titre"], message: "titre requis (200 max)." });
      }
      if (typeof action_route !== "string" || !ROUTES_CIBLES.has(action_route)) {
        return res.status(400).json({ error: "ROUTE_INCONNUE", refuse: ["action_route"], message: "La route cible n'est pas une route d'ecriture du produit." });
      }
      let payloadText: string | null = null;
      if (action_payload !== undefined && action_payload !== null) {
        try { payloadText = JSON.stringify(action_payload); } catch {
          return res.status(400).json({ error: "PAYLOAD_INVALIDE", refuse: ["action_payload"], message: "action_payload doit etre du JSON." });
        }
      }
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, type, prio, titre.trim(), typeof explication === "string" ? explication.slice(0, 5000) : null, action_route, payloadText],
      );
      // La creation est tracee (chantier 2) : actor_kind dira 'agent'.
      await logAudit(req, res, { route: "/api/suggestions", action: "propose", entite: id, payload: { type, priorite: prio, titre: titre.trim() } });
      res.status(201).json({ status: "success", id, statut: "nouveau" });
    } catch (e) {
      res.status(500).json({ error: "SUGGESTION_ERREUR", message: String(e) });
    }
  });

  // --- Lecture libre : l'UI du chef affiche la boite sans etre maitre.
  router.get("/api/suggestions", async (req, res) => {
    try {
      const statut = typeof req.query.statut === "string" ? req.query.statut : undefined;
      const rows = statut && ["nouveau", "applique", "rejete"].includes(statut)
        ? await db.all("SELECT * FROM suggestions WHERE statut = ? ORDER BY created_at DESC", [statut])
        : await db.all("SELECT * FROM suggestions ORDER BY created_at DESC");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "SUGGESTIONS_ERREUR", message: String(e) });
    }
  });

  router.get("/api/suggestions/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM suggestions WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ error: "SUGGESTION_ABSENTE", message: "Suggestion introuvable." });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: "SUGGESTION_ERREUR", message: String(e) });
    }
  });

  // --- Application : le MAITRE SEUL. Il signe, le serveur rejoue l'action
  // pre-remplie EN INTERNE (fetch local sur SA propre API) — le payload passe
  // par le contrat complet de la route cible (validation, transactions,
  // audit). Si la route cible refuse, la suggestion reste 'nouveau' et le
  // refus est NOMME : une application qui echoue en silence serait pire que
  // pas d'application.
  router.post("/api/suggestions/:id/appliquer", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (!actor) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
      if (actor.role !== "maitre") {
        return res.status(403).json({ error: "MAITRE_REQUIS", message: "L'application reservee au maitre." });
      }
      const sug = await db.get("SELECT * FROM suggestions WHERE id = ?", [req.params.id]) as
        { id: string; statut: string; action_route: string; action_payload: string | null } | undefined;
      if (!sug) return res.status(404).json({ error: "SUGGESTION_ABSENTE", message: "Suggestion introuvable." });
      if (sug.statut !== "nouveau") {
        return res.status(409).json({ error: "DEJA_DECIDE", message: `Suggestion deja ${sug.statut}.` });
      }
      if (!ROUTES_CIBLES.has(sug.action_route)) {
        return res.status(409).json({ error: "ROUTE_INCONNUE", message: "L'action pre-remplie vise une route que le produit ne connait plus." });
      }
      // Le serveur s'appelle LUI-MEME sur la route cible, avec la session du
      // maitre qui vient d'appliquer (le cookie de SA requette). La mutation
      // reelle porte donc SA signature — la voie est exactement celle de l'UI.
      const port = Number(process.env.PORT) || 3000;
      const jeton = req.headers["x-cookdrive-instance"];
      const cookie = req.headers.cookie ?? "";
      let codeCible = 0;
      let corpsCible: unknown = null;
      try {
        const r2 = await fetch(`http://127.0.0.1:${port}${sug.action_route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookie,
            ...(jeton ? { "X-Cookdrive-Instance": String(jeton) } : {}),
          },
          body: sug.action_payload ?? "{}",
        });
        codeCible = r2.status;
        try { corpsCible = await r2.json(); } catch { /* corps vide */ }
      } catch (e) {
        return res.status(502).json({ error: "CIBLE_INJOINABLE", message: "La route cible n'a pas repondu.", detail: String(e) });
      }
      if (codeCible < 200 || codeCible >= 300) {
        // Refus NOMME : la suggestion reste 'nouveau', le motif est rendu.
        return res.status(codeCible === 400 ? 422 : 502).json({
          error: "CIBLE_REFUSEE",
          message: `La route cible (${sug.action_route}) a refuse l'action (HTTP ${codeCible}). La suggestion reste nouveau.`,
          cible_status: codeCible,
          cible_corps: corpsCible,
        });
      }
      await db.run(
        "UPDATE suggestions SET statut = 'applique', decided_at = datetime('now'), applique_par = ? WHERE id = ?",
        [actor.id, sug.id],
      );
      await logAudit(req, res, { route: "/api/suggestions/:id/appliquer", action: "applique", entite: sug.id, payload: { cible: sug.action_route, cible_status: codeCible } });
      res.json({ status: "success", id: sug.id, statut: "applique", applique_par: actor.id, cible_status: codeCible, cible_corps: corpsCible });
    } catch (e) {
      res.status(500).json({ error: "SUGGESTION_ERREUR", message: String(e) });
    }
  });

  // --- Rejet : le MAITRE SEUL, motif OBLIGATOIRE (§8 : « rejette avec
  // motif »). Un rejet muet ne dirait rien a l'agent sur POURQUOI sa
  // proposition n'a pas survécu.
  router.post("/api/suggestions/:id/rejeter", async (req, res) => {
    try {
      const actor = currentUser(res);
      if (!actor) return res.status(401).json({ error: "AUTH_REQUISE", message: "Connectez-vous." });
      if (actor.role !== "maitre") {
        return res.status(403).json({ error: "MAITRE_REQUIS", message: "Le rejet reserve au maitre." });
      }
      const motif = typeof req.body?.motif === "string" ? req.body.motif.trim() : "";
      if (motif === "") {
        return res.status(400).json({ error: "MOTIF_REQUIS", refuse: ["motif"], message: "Un rejet sans motif ne dit rien a l'agent." });
      }
      const sug = await db.get("SELECT statut FROM suggestions WHERE id = ?", [req.params.id]) as { statut: string } | undefined;
      if (!sug) return res.status(404).json({ error: "SUGGESTION_ABSENTE", message: "Suggestion introuvable." });
      if (sug.statut !== "nouveau") {
        return res.status(409).json({ error: "DEJA_DECIDE", message: `Suggestion deja ${sug.statut}.` });
      }
      await db.run(
        "UPDATE suggestions SET statut = 'rejete', motif_rejet = ?, decided_at = datetime('now'), applique_par = ? WHERE id = ?",
        [motif.slice(0, 2000), actor.id, req.params.id],
      );
      await logAudit(req, res, { route: "/api/suggestions/:id/rejeter", action: "rejete", entite: req.params.id, payload: { motif: motif.slice(0, 200) } });
      res.json({ status: "success", id: req.params.id, statut: "rejete", motif_rejet: motif });
    } catch (e) {
      res.status(500).json({ error: "SUGGESTION_ERREUR", message: String(e) });
    }
  });

  return router;
}
