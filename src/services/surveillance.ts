// Moteur de surveillance (chantier 4, feuille de route §8).
// Des REGLES -> des SUGGESTIONS. Le produit est DETERMINISTE : pas de LLM
// ici, jamais. Les regles lisent la base et produisent des propositions
// pre-remplies (route + payload) que l'humain applique a SA signature via la
// boite de suggestions (chantier 3) — le moteur n'ecrit JAMAIS le metier.
//
// Les regles (chaque suggestion porte sa preuve dans explication) :
//   R1  rupture imminente   : quantity <= minStock + seuil.marge_rupture %
//   R2  stock mort          : quantity <= 0 sur un article dont le prix > 0
//   R3  DLC proche          : batches.expiration_date <= aujourd'hui + seuil.jours_dlc
//   R4  temperature HACCP   : dernier releve d'un equipment hors bornes
//                             [seuil.temp_min, seuil.temp_max] (regl. 852/2004)
//   R5  anti-gaspillage     : lots dont la DLC arrive et quantity > 0 ->
//                             pre-remplir la generation anti-waste existante
//
// Seuils du MAITRE (src/services/settings.ts, modifiables via POST
// /api/settings) avec des valeurs par defaut sane. Un seuil ABSENT du
// fichier reprend son defaut — jamais undefined dans une regle.
import type { Database } from "sqlite";

export interface SeuilsSurveillance {
  /** Marge au-dessus du minStock qui declenche une alerte rupture (unite du
   *  minStock, pas un pourcentage : un minStock a 0 ne doit pas diviser). */
  marge_rupture: number;
  /** Nombre de jours avant la DLC qui declenchent l'alerte. */
  jours_dlc: number;
  /** Bornes de temperature HACCP (regl. (CE) 852/2004 art. 5). */
  temp_min: number;
  temp_max: number;
}

export const SEUILS_DEFAUT: SeuilsSurveillance = {
  marge_rupture: 5,
  jours_dlc: 3,
  temp_min: -20,
  temp_max: 60,
};

export function seuilsDe(settings: Record<string, unknown>): SeuilsSurveillance {
  const s = settings as Partial<SeuilsSurveillance>;
  const nombre = (v: unknown, defaut: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : defaut;
  return {
    marge_rupture: nombre(s.marge_rupture, SEUILS_DEFAUT.marge_rupture),
    jours_dlc: nombre(s.jours_dlc, SEUILS_DEFAUT.jours_dlc),
    temp_min: nombre(s.temp_min, SEUILS_DEFAUT.temp_min),
    temp_max: nombre(s.temp_max, SEUILS_DEFAUT.temp_max),
  };
}

export interface PropositionSurveillance {
  type: "stock" | "haccp" | "anomalie" | "menu";
  priorite: "basse" | "normale" | "haute";
  titre: string;
  explication: string;
  action_route: string;
  action_payload: Record<string, unknown> | null;
  /** Clef de deduplication : deux scans le meme jour ne doivent pas
   *  reposter la meme alerte pour le meme objet (sinon la boite explose). */
  cle: string;
}

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

function dansJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** R1 + R2 : ruptures et stocks morts, lus sur inventory. */
export async function surveillerStock(
  db: Database, seuils: SeuilsSurveillance,
): Promise<PropositionSurveillance[]> {
  const rows = await db.all(
    "SELECT id, name, quantity, minStock, unit, unit_price FROM inventory",
  ) as Array<{ id: string; name: string; quantity: number; minStock: number; unit: string; unit_price: number }>;
  const jour = aujourdhui();
  const props: PropositionSurveillance[] = [];
  for (const a of rows) {
    if (a.quantity <= 0 && (a.unit_price ?? 0) > 0) {
      // R2 stock mort : de la valeur DORMANTE — ni vendable ni consommable.
      props.push({
        type: "anomalie", priorite: "normale",
        titre: `Stock mort : ${a.name}`,
        explication: `quantity=0 (prix unitaire ${a.unit_price}). Un article sans stock ne peut ni vendre ni consommer : verifier si une commande est attendue ou si l'article doit etre retire de la carte.`,
        action_route: "/api/inventory",
        action_payload: { name: a.name, quantity: 0, minStock: a.minStock, unit: a.unit, category: "stock-mort" },
        cle: `stock-mort:${a.id}:${jour}`,
      });
    } else if (a.quantity > 0 && a.quantity <= a.minStock + seuils.marge_rupture) {
      // R1 rupture imminente : sous le plancher + marge.
      props.push({
        type: "stock", priorite: "haute",
        titre: `Rupture imminente : ${a.name}`,
        explication: `quantity=${a.quantity} ${a.unit} pour un minStock=${a.minStock} (marge de surveillance ${seuils.marge_rupture}). Commander avant la panne.`,
        action_route: "/api/purchasing/order",
        action_payload: { items: [{ inventory_id: a.id, quantity: Math.max(1, a.minStock * 2) }] },
        cle: `rupture:${a.id}:${jour}`,
      });
    }
  }
  return props;
}

/** R3 : DLC proche, lue sur batches (le registre sanitaire). */
export async function surveillerDlc(
  db: Database, seuils: SeuilsSurveillance,
): Promise<PropositionSurveillance[]> {
  const limite = dansJours(seuils.jours_dlc);
  const rows = await db.all(
    `SELECT b.id, b.lot_number, b.expiration_date, b.quantity, b.unit, i.name
       FROM batches b JOIN inventory i ON b.inventory_id = i.id
      WHERE b.expiration_date <= ? AND b.quantity > 0`,
    [limite],
  ) as Array<{ id: string; lot_number: string; expiration_date: string; quantity: number; unit: string | null; name: string }>;
  return rows.map((b) => ({
    type: "haccp" as const, priorite: "haute" as const,
    titre: `DLC proche : ${b.name} (lot ${b.lot_number})`,
    explication: `DLC ${b.expiration_date} sous ${seuils.jours_dlc} jours, quantity=${b.quantity}${b.unit ? " " + b.unit : ""}. Regl. (CE) 852/2004 art. 5 : verifier et traiter avant expiration.`,
    action_route: "/api/haccp/batches",
    action_payload: null, // lecture seule : l'humain verifiera le lot lui-meme
    cle: `dlc:${b.id}:${aujourdhui()}`,
  }));
}

/** R4 : temperatures HACCP hors bornes, lues sur le DERNIER releve de chaque
 *  equipment (le dernier etat est ce que l'humain doit voir, pas l'historique). */
export async function surveillerTemperatures(
  db: Database, seuils: SeuilsSurveillance,
): Promise<PropositionSurveillance[]> {
  const rows = await db.all(
    `SELECT equipment_name, temperature, recorded_at
       FROM temperature_logs tl
      WHERE recorded_at = (SELECT MAX(t2.recorded_at) FROM temperature_logs t2
                            WHERE t2.equipment_name = tl.equipment_name)`,
  ) as Array<{ equipment_name: string; temperature: number; recorded_at: string }>;
  const jour = aujourdhui();
  return rows
    .filter((t) => t.temperature < seuils.temp_min || t.temperature > seuils.temp_max)
    .map((t) => ({
      type: "haccp" as const, priorite: "haute" as const,
      titre: `Temperature hors bornes : ${t.equipment_name} (${t.temperature} deg)`,
      explication: `Dernier releve ${t.recorded_at} : ${t.temperature} deg hors [${seuils.temp_min}, ${seuils.temp_max}]. Regl. (CE) 852/2004 art. 5 : verifier l'equipment et consigner une action corrective.`,
      action_route: "/api/haccp/corrective-action",
      action_payload: null, // l'humain liera l'action a SA releve (log_id juge par la route)
      cle: `temp:${t.equipment_name}:${jour}`,
    }));
}

/** R5 : anti-gaspillage — pre-remplir la voie existante (Sprint 14.c : la
 *  generation annulee est un ECHANGE, mais la lecture des lots critiques
 *  reste une donnee que le moteur rassemble pour l'humain). */
export async function proposerAntiGaspillage(
  db: Database, seuils: SeuilsSurveillance,
): Promise<PropositionSurveillance[]> {
  const limite = dansJours(seuils.jours_dlc);
  const rows = await db.all(
    `SELECT b.id, b.expiration_date, b.quantity, b.unit, i.name
       FROM batches b JOIN inventory i ON b.inventory_id = i.id
      WHERE b.expiration_date <= ? AND b.quantity > 0`,
    [limite],
  ) as Array<{ id: string; expiration_date: string; quantity: number; unit: string | null; name: string }>;
  if (rows.length === 0) return [];
  const resume = rows.map((b) => `${b.name} (${b.quantity}${b.unit ? " " + b.unit : ""}, DLC ${b.expiration_date})`).join(", ");
  return [{
    type: "menu", priorite: "normale",
    titre: `Anti-gaspillage : ${rows.length} lot(s) a DLC proche`,
    explication: `Lots concernes : ${resume}. Generer une proposition anti-gaspillage pour les ecouler.`,
    action_route: "/api/inventory", // pas de generation automatique : pre-remplir la lecture
    action_payload: null,
    cle: `antiwaste:${aujourdhui()}`,
  }];
}

/** Le scan complet : TOUTES les regles, dedupliquees par cle. */
export async function scanner(
  db: Database, seuils: SeuilsSurveillance,
): Promise<PropositionSurveillance[]> {
  const tout = [
    ...(await surveillerStock(db, seuils)),
    ...(await surveillerDlc(db, seuils)),
    ...(await surveillerTemperatures(db, seuils)),
    ...(await proposerAntiGaspillage(db, seuils)),
  ];
  const vues = new Set<string>();
  return tout.filter((p) => {
    if (vues.has(p.cle)) return false;
    vues.add(p.cle);
    return true;
  });
}
