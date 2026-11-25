// Registre d'outils — domaine 2 de GH-600 (Tool Use / Environment Interaction).
//
// Une seule source de verite pour ce qu'un agent PEUT faire ici :
//   - cinq outils de LECTURE (aucune ecriture metier) ;
//   - un seul outil d'ecriture, `proposer_action`, qui depose dans la boite
//     `suggestions` (§8 : l'IA propose, l'humain applique).
//
// Il n'y a DELIBEREMENT aucun outil ecrivant dans inventory, recipes, haccp…
// Le controle n'est pas une promesse dans un doc : il est dans CE registre,
// dans la gate de session (ECRITURES_AGENT) et dans la porte verify:agents.
//
// Allow-list : COOKDRIVE_MCP_OUTILS (noms separes par des virgules). Defaut =
// tous les outils de lecture + `proposer_action`. COOKDRIVE_AGENT_OFF=1 retire
// `proposer_action` : un poste sans agent n'a pas de voie de proposition.
import type { Database } from "sqlite";
import crypto from "crypto";
import { ROUTES_CIBLES, TYPES, PRIORITES } from "../../routes/suggestions.js";
import type { PropositionHermes } from "../hermes.js";

export type AccesOutil = "lecture" | "proposition";

export interface Outil {
  nom: string;
  description: string;
  acces: AccesOutil;
}

export const OUTILS: readonly Outil[] = [
  { nom: "etat_inventaire", description: "Articles tries par quantite critique (lecture seule).", acces: "lecture" },
  { nom: "alertes_actives", description: "Alertes ouvertes de l'etablissement (lecture seule).", acces: "lecture" },
  { nom: "dlc_proches", description: "Lots dont la DLC approche (lecture seule).", acces: "lecture" },
  { nom: "temperature_derniere", description: "Derniers releves de temperature (lecture seule).", acces: "lecture" },
  { nom: "proposer_action", description: "Depose UNE proposition dans la boite de suggestions — jamais dans le metier.", acces: "proposition" },
] as const;

/** La liste autorisee. MATCH EXACT, jamais de prefixe : un nom d'outil inconnu
 *  reste inconnu, et un outil non autorise est refuse NOMMENT. */
export function allowList(): Set<string> {
  const autorises = new Set<string>(
    OUTILS.filter((o) => o.acces === "lecture").map((o) => o.nom),
  );
  if (process.env.COOKDRIVE_AGENT_OFF !== "1") {
    autorises.add("proposer_action");
  }
  const env = process.env.COOKDRIVE_MCP_OUTILS;
  if (env && env.trim() !== "") {
    const explicite = new Set(env.split(",").map((s) => s.trim()).filter(Boolean));
    return new Set([...autorises].filter((nom) => explicite.has(nom)));
  }
  return autorises;
}

/** Vue publique (sans secrets) : l'outil est-il autorise sur CE poste ? */
export function catalogue(autorises: Set<string> = allowList()): Array<Outil & { autorise: boolean }> {
  return OUTILS.map((o) => ({ ...o, autorise: autorises.has(o.nom) }));
}

export interface ResultatAppel {
  outil: string;
  ok: boolean;
  donnees?: unknown;
  erreur?: string;
}

/** Validation partagee avec la boite de suggestions : les memes enums et la
 *  MEME liste de routes cibles (importee, pas recopiee). */
export function validerProposition(p: unknown):
  | { proposition: PropositionHermes }
  | { erreur: string } {
  const s = (p ?? {}) as Record<string, unknown>;
  if (!TYPES.includes(String(s.type))) return { erreur: "TYPE_INVALIDE" };
  const prio = s.priorite ?? "normale";
  if (!PRIORITES.includes(String(prio))) return { erreur: "PRIORITE_INVALIDE" };
  if (typeof s.titre !== "string" || s.titre.trim() === "" || s.titre.length > 200) {
    return { erreur: "TITRE_INVALIDE" };
  }
  if (typeof s.action_route !== "string" || !ROUTES_CIBLES.has(s.action_route)) {
    return { erreur: "ROUTE_INCONNUE" };
  }
  let payload: Record<string, unknown> | null = null;
  if (s.action_payload !== undefined && s.action_payload !== null) {
    if (typeof s.action_payload !== "object" || Array.isArray(s.action_payload)) {
      return { erreur: "PAYLOAD_INVALIDE" };
    }
    payload = s.action_payload as Record<string, unknown>;
  }
  return {
    proposition: {
      type: s.type as PropositionHermes["type"],
      priorite: prio as PropositionHermes["priorite"],
      titre: s.titre.trim(),
      explication: typeof s.explication === "string" ? s.explication.slice(0, 5000) : "",
      action_route: s.action_route,
      action_payload: payload,
    },
  };
}

/** La SEULE ecriture du registre. Rejouable depuis un outil MCP ou de
 *  l'orchestration ; l'humain reste seul juge via /api/suggestions/:id/*. */
export async function deposerProposition(
  db: Database, p: unknown,
): Promise<{ id: string } | { erreur: string }> {
  const valide = validerProposition(p);
  if ("erreur" in valide) return valide;
  const { proposition } = valide;
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, proposition.type, proposition.priorite, proposition.titre, proposition.explication,
      proposition.action_route,
      proposition.action_payload ? JSON.stringify(proposition.action_payload) : null],
  );
  return { id };
}

function limite(args: Record<string, unknown> | undefined): number {
  const brut = Number(args?.limite ?? 10);
  if (!Number.isFinite(brut)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(brut)));
}

/** Appel d'un outil. Aucun `default` permissif : un nom hors registre est un
 *  refus, pas un passage a une autre fonction. */
export async function appelerOutil(
  db: Database,
  nom: string,
  args: Record<string, unknown> | undefined,
  autorises: Set<string> = allowList(),
): Promise<ResultatAppel> {
  const outil = OUTILS.find((o) => o.nom === nom);
  if (!outil) return { outil: nom, ok: false, erreur: "OUTIL_INCONNU" };
  if (!autorises.has(nom)) return { outil: nom, ok: false, erreur: "OUTIL_NON_AUTORISE" };
  try {
    switch (nom) {
      case "etat_inventaire": {
        const donnees = await db.all(
          "SELECT id, name, quantity, minStock, unit FROM inventory ORDER BY quantity ASC LIMIT ?",
          [limite(args)],
        );
        return { outil: outil.nom, ok: true, donnees };
      }
      case "alertes_actives": {
        const donnees = await db.all(
          "SELECT id, type, message, severity, status FROM alerts WHERE status = 'active' ORDER BY id ASC LIMIT ?",
          [limite(args)],
        );
        return { outil: outil.nom, ok: true, donnees };
      }
      case "dlc_proches": {
        const donnees = await db.all(
          `SELECT b.lot_number AS lot, i.name AS produit, b.expiration_date, b.quantity
             FROM batches b JOIN inventory i ON b.inventory_id = i.id
            WHERE b.quantity > 0
            ORDER BY b.expiration_date ASC LIMIT ?`,
          [limite(args)],
        );
        return { outil: outil.nom, ok: true, donnees };
      }
      case "temperature_derniere": {
        const donnees = await db.all(
          "SELECT equipment_name, temperature, recorded_at FROM temperature_logs ORDER BY recorded_at DESC LIMIT ?",
          [limite(args)],
        );
        return { outil: outil.nom, ok: true, donnees };
      }
      case "proposer_action": {
        const resultat = await deposerProposition(db, args);
        if ("erreur" in resultat) return { outil: outil.nom, ok: false, erreur: resultat.erreur };
        return { outil: outil.nom, ok: true, donnees: { id: resultat.id, statut: "nouveau" } };
      }
      default:
        return { outil: nom, ok: false, erreur: "OUTIL_INCONNU" };
    }
  } catch (e) {
    return { outil: nom, ok: false, erreur: "ECHEC_OUTIL: " + (e instanceof Error ? e.message : String(e)) };
  }
}
