// Hermes cerveau outillé (chantier 5, feuille de route §8).
// Le cerveau LIT le produit (schema + resume dashboard + alertes), INTERROGE
// par API, et PRODUIT des suggestions — SA SEULE ecriture (chantier 3).
// Il ne touche JAMAIS au metier : §8, l'humain execute.
//
// Architecture (la regle du transport injecte, Tache 4) :
//   - `construireContexte(db)`  : le contexte PUR (lisible, jugeable) —
//     schema resume + dashboard + dernieres suggestions.
//   - `construireConsigne(ctx)` : le prompt systeme (deterministe, teste).
//   - `parseSuggestions(texte)` : la reponse LLM -> propositions validees
//     (route dans la liste blanche, sinon rejetees NOMMEES — le LLM ne peut
//     pas pre-remplir une route hors liste, cf. chantier 3).
//   - `cerveauHermes(db, generer)` : la boucle COMPLETE, avec la fonction de
//     generation INJECTEE. Ollama local par defaut, Gemini optionnel via la
//     couche fournisseur ; le CI injecte un CERVEAU FACTICE DETERMINISTE —
//     JAMAIS de LLM reel en CI.
import type { Database } from "sqlite";
import { ROUTES_CIBLES } from "../routes/suggestions.js";
/** Les routes cibles que le produit connait (MEME liste que la boite de
 *  suggestions — une seule source de verite, importee de la). */
export { ROUTES_CIBLES } from "../routes/suggestions.js";

export interface ContexteHermes {
  schema_resume: string;
  dashboard: {
    articles_total: number;
    articles_critiques: number;
    alerts_actives: number;
    valeur_stock: number;
  };
  rupture: Array<{ name: string; quantity: number; minStock: number; unit: string }>;
  dlc_proches: Array<{ lot: string; produit: string; expiration_date: string; quantity: number }>;
  temperatures: Array<{ equipment_name: string; temperature: number; recorded_at: string }>;
  dernieres_suggestions: number;
}

export interface PropositionHermes {
  type: "stock" | "achat" | "menu" | "haccp" | "general" | "anomalie";
  priorite: "basse" | "normale" | "haute";
  titre: string;
  explication: string;
  action_route: string;
  action_payload: Record<string, unknown> | null;
}

/** Le contexte PUR : ce que le cerveau LIT. Un appel SQL par famille, jamais
 *  un dump brut de la base (budget de contexte du LLM, AGENTS.md "Limites"). */
export async function construireContexte(db: Database): Promise<ContexteHermes> {
  const [stats, rupture, dlc, temps, nbSuggestions] = await Promise.all([
    db.get(
      `SELECT
         (SELECT COUNT(*) FROM inventory) AS articles_total,
         (SELECT COUNT(*) FROM inventory WHERE quantity <= minStock) AS articles_critiques,
         (SELECT COUNT(*) FROM alerts WHERE status = 'active') AS alerts_actives,
         (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM inventory) AS valeur_stock`,
    ) as Promise<{ articles_total: number; articles_critiques: number; alerts_actives: number; valeur_stock: number }>,
    db.all(
      "SELECT name, quantity, minStock, unit FROM inventory WHERE quantity <= minStock + 5 ORDER BY quantity ASC LIMIT 10",
    ) as Promise<Array<{ name: string; quantity: number; minStock: number; unit: string }>>,
    db.all(
      `SELECT b.lot_number AS lot, i.name AS produit, b.expiration_date, b.quantity
         FROM batches b JOIN inventory i ON b.inventory_id = i.id
        WHERE b.expiration_date <= date('now', '+3 days') AND b.quantity > 0
        ORDER BY b.expiration_date ASC LIMIT 10`,
    ) as Promise<Array<{ lot: string; produit: string; expiration_date: string; quantity: number }>>,
    db.all(
      `SELECT equipment_name, temperature, recorded_at FROM temperature_logs
        ORDER BY recorded_at DESC LIMIT 10`,
    ) as Promise<Array<{ equipment_name: string; temperature: number; recorded_at: string }>>,
    db.get("SELECT COUNT(*) AS n FROM suggestions") as Promise<{ n: number }>,
  ]);
  return {
    schema_resume: "Tables: inventory(id,name,quantity,minStock,unit,unit_price), recipes, documents+document_items, suppliers+supplier_prices, batches(lot_number,expiration_date,quantity), temperature_logs(equipment_name,temperature), staff, menu_planning, alerts, suggestions.",
    dashboard: {
      articles_total: stats?.articles_total ?? 0,
      articles_critiques: stats?.articles_critiques ?? 0,
      alerts_actives: stats?.alerts_actives ?? 0,
      valeur_stock: stats?.valeur_stock ?? 0,
    },
    rupture,
    dlc_proches: dlc,
    temperatures: temps,
    dernieres_suggestions: nbSuggestions?.n ?? 0,
  };
}

/** Le prompt systeme : DETERMINISTE (juge par la porte du contrat), en
 *  francais, exigeant le format JSON des propositions. */
export function construireConsigne(ctx: ContexteHermes): string {
  return [
    "Tu es Hermes, le cerveau de claus.io. Tu LIS l'etat de l'etablissement et PROPOSES des actions.",
    "Tu ne peux PAS executer : l'humain tranche. Chaque proposition est une SUGGESTION.",
    "",
    "ETAT DE L'ETABLISSEMENT :",
    `- Articles: ${ctx.dashboard.articles_total} (dont ${ctx.dashboard.articles_critiques} sous le plancher)`,
    `- Valeur du stock: ${ctx.dashboard.valeur_stock.toFixed(2)}`,
    `- Alertes actives: ${ctx.dashboard.alerts_actives}`,
    `- En rupture imminente: ${ctx.rupture.map((a) => `${a.name} (${a.quantity}${a.unit})`).join(", ") || "aucune"}`,
    `- DLC sous 3 jours: ${ctx.dlc_proches.map((d) => `${d.produit} lot ${d.lot} (${d.expiration_date})`).join(", ") || "aucune"}`,
    `- Dernieres temperatures: ${ctx.temperatures.map((t) => `${t.equipment_name} ${t.temperature}deg`).join(", ") || "aucune"}`,
    "",
    "Reponds UNIQUEMENT en JSON: {\"suggestions\":[{\"type\":\"stock|achat|menu|haccp|general|anomalie\",\"priorite\":\"basse|normale|haute\",\"titre\":\"...\",\"explication\":\"...\",\"action_route\":\"/api/...\",\"action_payload\":{...}}]}",
    "action_route doit ETRE une route d'ecriture du produit (ex: /api/inventory, /api/haccp/temperature, /api/purchasing/order).",
    "Pas de proposition -> {\"suggestions\":[]}. Ne JAMAIS inventer de route.",
  ].join("\n");
}

/** La reponse LLM -> propositions VALIDEES. Une route hors liste blanche est
 *  rejetee NOMMEE (le LLM ne contourne pas la liste du chantier 3) ; un JSON
 *  illisible est un refus NOMME, jamais un crash ni un [] invente. */
export function parseSuggestions(texte: string): { propositions: PropositionHermes[]; refusees: string[] } {
  const propositions: PropositionHermes[] = [];
  const refusees: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(texte);
  } catch {
    return { propositions, refusees: ["JSON_ILLISIBLE"] };
  }
  const liste = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(liste)) {
    return { propositions, refusees: ["SUGGESTIONS_ABSENTES"] };
  }
  const TYPES = ["stock", "achat", "menu", "haccp", "general", "anomalie"];
  const PRIORITES = ["basse", "normale", "haute"];
  for (const [i, brut] of liste.entries()) {
    const s = brut as Record<string, unknown>;
    if (!TYPES.includes(String(s.type))) { refusees.push(`${i}:type`); continue; }
    if (!PRIORITES.includes(String(s.priorite ?? "normale"))) { refusees.push(`${i}:priorite`); continue; }
    if (typeof s.titre !== "string" || s.titre.trim() === "") { refusees.push(`${i}:titre`); continue; }
    if (typeof s.action_route !== "string" || !ROUTES_CIBLES.has(s.action_route)) {
      refusees.push(`${i}:route_inconnue(${String(s.action_route)})`); continue;
    }
    let payload: Record<string, unknown> | null = null;
    if (s.action_payload !== undefined && s.action_payload !== null) {
      if (typeof s.action_payload !== "object") { refusees.push(`${i}:payload`); continue; }
      payload = s.action_payload as Record<string, unknown>;
    }
    propositions.push({
      type: s.type as PropositionHermes["type"],
      priorite: (s.priorite ?? "normale") as PropositionHermes["priorite"],
      titre: s.titre.trim().slice(0, 200),
      explication: typeof s.explication === "string" ? s.explication.slice(0, 5000) : "",
      action_route: s.action_route,
      action_payload: payload,
    });
  }
  return { propositions, refusees };
}

/** Le "cerveau" : une fonction (consigne + contexte -> texte JSON). Le CI
 *  injecte un cerveau factice ; le produit injecte le vrai LLM. */
export type Cerveau = (consigne: string) => Promise<string>;

/** La boucle complete : contexte -> consigne -> LLM -> propositions validees.
 *  Aucune ecriture ICI : la route depose dans la boite (sa table). */
export async function cerveauHermes(
  db: Database, cerveau: Cerveau,
): Promise<{ propositions: PropositionHermes[]; refusees: string[] }> {
  const ctx = await construireContexte(db);
  const texte = await cerveau(construireConsigne(ctx));
  return parseSuggestions(texte);
}

/** Le cerveau FACTICE DETERMINISTE : JAMAIS de LLM reel en CI. Il regarde le
 *  contexte encode DANS la consigne (les lignes "En rupture imminente:", etc.)
 *  et repond avec les propositions attendues — le meme contexte produit
 *  TOUJOURS la meme reponse. La porte du contrat l'injecte. */
export function cerveauFactice(): Cerveau {
  return async (consigne: string) => {
    const suggestions: PropositionHermes[] = [];
    const ligne = (prefixe: string) =>
      consigne.split("\n").find((l) => l.startsWith(prefixe)) ?? "";
    const rupture = ligne("- En rupture imminente: ");
    if (rupture && !rupture.endsWith("aucune")) {
      suggestions.push({
        type: "achat", priorite: "haute",
        titre: "Hermes: commander les articles en rupture",
        explication: "Detecte dans le contexte: articles sous le plancher.",
        action_route: "/api/purchasing/order",
        action_payload: { items: [] },
      });
    }
    const dlc = ligne("- DLC sous 3 jours: ");
    if (dlc && !dlc.endsWith("aucune")) {
      suggestions.push({
        type: "haccp", priorite: "haute",
        titre: "Hermes: verifier les DLC proches",
        explication: "Detecte dans le contexte: lots dont la DLC arrive.",
        action_route: "/api/haccp/batches",
        action_payload: null,
      });
    }
    return JSON.stringify({ suggestions });
  };
}
