// Orchestration multi-agents — domaine 5 de GH-600.
//
// Une execution passe par TROIS ROLES, chacun avec sa propre entree/sortie :
//   observateur (lit l'etat, n'ecrit rien) -> analyste (produit des
//   propositions via le cerveau INJECTE) -> verificateur (controle, dedupe,
//   conflits, puis depose dans la SEULE boite d'ecriture autorisee).
//
// Les handoffs sont des ARTIFACTS durables dans SQLite (agent_runs,
// agent_handoffs) : relisables, auditables, et repris sans refaire une étape
// deja faite (domaine 3 : memoire/state/continuite). Aucun role n'ecrit dans
// une table metier — c'est la meme regle §8 que Hermes.
import type { Database } from "sqlite";
import crypto from "crypto";
import {
  construireContexte, construireConsigne, parseSuggestions,
  type ContexteHermes, type Cerveau, type PropositionHermes,
} from "../hermes.js";
import { deposerProposition } from "../outils/index.js";
import { ROUTES_CIBLES } from "../../routes/suggestions.js";

export type StatutRun = "en_cours" | "termine" | "echeche";
export type Role = "observateur" | "analyste" | "verificateur";

export interface EtapeRun {
  etape: number;
  role: Role;
  action: string;
}

export interface ResultatOrchestration {
  run_id: string;
  statut: StatutRun;
  etapes: EtapeRun[];
  propositions: Array<{ id: string; titre: string; action_route: string }>;
  conflits: string[];
  refusees: string[];
  erreur?: string;
}

function vide(runId: string, statut: StatutRun): ResultatOrchestration {
  return { run_id: runId, statut, etapes: [], propositions: [], conflits: [], refusees: [] };
}

async function tracer(
  db: Database, runId: string, etape: number, role: Role,
  action: string, artifact: unknown,
): Promise<void> {
  await db.run(
    `INSERT INTO agent_handoffs (run_id, etape, role, action, artifact)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, etape, role, action, artifact === undefined ? null : JSON.stringify(artifact)],
  );
  await db.run("UPDATE agent_runs SET etape_courante = ? WHERE id = ?", [role, runId]);
}

/** Le verificateur : refuse ce que la boite refuserait deja (route), plus les
 *  doublons du jour et les contradictions entre propositions d'un MEME run. */
export function verifierPropositions(
  propositions: PropositionHermes[],
  dejaLa: Set<string>,
): { retenues: PropositionHermes[]; conflits: string[] } {
  const retenues: PropositionHermes[] = [];
  const conflits: string[] = [];
  const vues = new Map<string, PropositionHermes>();
  for (const p of propositions) {
    if (!ROUTES_CIBLES.has(p.action_route)) {
      conflits.push(`route_inconnue:${p.action_route}`);
      continue;
    }
    const cle = `${p.action_route}|${p.titre}`;
    if (dejaLa.has(cle)) { conflits.push(`doublon:${cle}`); continue; }
    const precedente = vues.get(p.action_route);
    if (precedente && JSON.stringify(precedente.action_payload) !== JSON.stringify(p.action_payload)) {
      conflits.push(`contradiction:${p.action_route}`);
      continue;
    }
    vues.set(p.action_route, p);
    retenues.push(p);
  }
  return { retenues, conflits };
}

async function dejaDeposees(db: Database): Promise<Set<string>> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lignes = await db.all(
    "SELECT titre, action_route FROM suggestions WHERE created_at >= ?",
    [aujourdhui],
  ) as Array<{ titre: string; action_route: string }>;
  return new Set(lignes.map((l) => `${l.action_route}|${l.titre}`));
}

async function executer(
  db: Database, runId: string, cerveau: Cerveau, contexteDejaLu?: ContexteHermes,
): Promise<ResultatOrchestration> {
  const resultat = vide(runId, "en_cours");
  try {
    // 1. Observateur — lecture seule. Le contexte est un artifact inspectable.
    let ctx = contexteDejaLu;
    if (!ctx) {
      ctx = await construireContexte(db);
      await tracer(db, runId, 0, "observateur", "contexte_lu", ctx);
    }
    resultat.etapes.push({ etape: 0, role: "observateur", action: "contexte_lu" });

    // 2. Analyste — le cerveau est INJECTE (factice en CI, LLM reel en produit).
    const texte = await cerveau(construireConsigne(ctx));
    const analyse = parseSuggestions(texte);
    await tracer(db, runId, 1, "analyste", "propositions_analysées", analyse);
    resultat.etapes.push({ etape: 1, role: "analyste", action: "propositions_analysées" });
    resultat.refusees = analyse.refusees;

    // 3. Verificateur — conflits, dedupe, puis depot (la seule ecriture).
    const { retenues, conflits } = verifierPropositions(
      analyse.propositions, await dejaDeposees(db),
    );
    resultat.conflits = conflits;
    for (const p of retenues) {
      const depose = await deposerProposition(db, p);
      if ("erreur" in depose) {
        conflits.push(`depot_refuse:${depose.erreur}`);
        continue;
      }
      resultat.propositions.push({ id: depose.id, titre: p.titre, action_route: p.action_route });
    }
    await tracer(db, runId, 2, "verificateur", "propositions_déposées", {
      propositions: resultat.propositions, conflits, refusees: analyse.refusees,
    });
    resultat.etapes.push({ etape: 2, role: "verificateur", action: "propositions_déposées" });

    resultat.statut = "termine";
    await db.run(
      "UPDATE agent_runs SET statut = 'termine', finished_at = datetime('now') WHERE id = ?",
      [runId],
    );
    return resultat;
  } catch (e) {
    resultat.statut = "echeche";
    resultat.erreur = e instanceof Error ? e.message : String(e);
    await db.run(
      "UPDATE agent_runs SET statut = 'echeche', erreur = ?, finished_at = datetime('now') WHERE id = ?",
      [resultat.erreur, runId],
    );
    return resultat; // refus NOMME, jamais un crash muet
  }
}

/** Nouvelle execution. */
export async function orchestrer(
  db: Database, cerveau: Cerveau,
): Promise<ResultatOrchestration> {
  const runId = crypto.randomUUID();
  await db.run(
    "INSERT INTO agent_runs (id, statut, etape_courante) VALUES (?, 'en_cours', 'demarrage')",
    [runId],
  );
  return executer(db, runId, cerveau);
}

/** Reconstruction d'un run deja termine depuis ses artifacts : aucune ecriture,
 *  aucune re-execution d'une etape deja faite. */
export async function lireRun(
  db: Database, runId: string,
): Promise<ResultatOrchestration | undefined> {
  const run = await db.get("SELECT * FROM agent_runs WHERE id = ?", [runId]) as
    | { id: string; statut: StatutRun; erreur: string | null }
    | undefined;
  if (!run) return undefined;
  const handoffs = await db.all(
    "SELECT * FROM agent_handoffs WHERE run_id = ? ORDER BY etape ASC",
    [runId],
  ) as Array<{ etape: number; role: Role; action: string; artifact: string | null }>;
  const resultat = vide(runId, run.statut);
  resultat.etapes = handoffs.map((h) => ({ etape: h.etape, role: h.role, action: h.action }));
  resultat.erreur = run.erreur ?? undefined;
  const final = [...handoffs].reverse().find((h) => h.role === "verificateur");
  if (final?.artifact) {
    const a = JSON.parse(final.artifact) as Omit<ResultatOrchestration,
      "run_id" | "statut" | "etapes" | "erreur">;
    resultat.propositions = a.propositions ?? [];
    resultat.conflits = a.conflits ?? [];
    resultat.refusees = a.refusees ?? [];
  }
  return resultat;
}

/** Reprise : un run termine est relu (jamais rejoue) ; un run en echec ou
 *  en cours reprend a la derniere etape durable, avec le contexte deja stocke. */
export async function reprendre(
  db: Database, runId: string, cerveau: Cerveau,
): Promise<ResultatOrchestration | undefined> {
  const run = await db.get("SELECT statut FROM agent_runs WHERE id = ?", [runId]) as
    | { statut: StatutRun }
    | undefined;
  if (!run) return undefined;
  if (run.statut === "termine") return lireRun(db, runId);
  const observer = await db.get(
    "SELECT artifact FROM agent_handoffs WHERE run_id = ? AND role = 'observateur' ORDER BY etape ASC LIMIT 1",
    [runId],
  ) as { artifact: string | null } | undefined;
  const ctx = observer?.artifact ? JSON.parse(observer.artifact) as ContexteHermes : undefined;
  return executer(db, runId, cerveau, ctx);
}

export async function listerRuns(db: Database): Promise<ResultatOrchestration[]> {
  const lignes = await db.all("SELECT id FROM agent_runs ORDER BY created_at DESC LIMIT 50") as
    Array<{ id: string }>;
  const resultats = await Promise.all(lignes.map((l) => lireRun(db, l.id)));
  return resultats.filter((r): r is ResultatOrchestration => Boolean(r));
}
