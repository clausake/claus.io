// Harnais d'evaluation — domaine 4 de GH-600 (Evaluation / Error Analysis).
//
// Des CAS DORES rejouables, juges SANS LLM REEL : le cerveau factice de Hermes
// produit une sortie deterministe, `parseSuggestions` la valide, et le score
// compare types + routes + refus attendus. Un cas ne passe PAS parce que le
// code "semble" juste : il passe parce que la sortie observee est jugee.
//
// Signaux : score par cas (0..1), taux de reussite, et la LISTE NOMMEE des
// ecarts. La porte verify:agents rougit si un cas doré tombe, et le mordant
// (verify:agents-mord) prouve qu'un attendu corrompu fait bien rougir.
import { parseSuggestions, type PropositionHermes } from "../hermes.js";

export interface CasEval {
  nom: string;
  consigne: string;
  sortie: string;
  attendu: {
    types: string[];
    routes: string[];
    refuse: string[];
  };
}

export interface VerdictEval {
  nom: string;
  reussi: boolean;
  score: number;
  types: string[];
  routes: string[];
  refusees: string[];
  ecarts: string[];
}

function trier(a: string[]): string[] { return [...a].sort(); }

function egale(a: string[], b: string[]): boolean {
  const x = trier(a).join("|");
  const y = trier(b).join("|");
  return x === y;
}

export function evaluerCas(cas: CasEval): VerdictEval {
  const analyse = parseSuggestions(cas.sortie);
  const types = analyse.propositions.map((p: PropositionHermes) => p.type);
  const routes = analyse.propositions.map((p: PropositionHermes) => p.action_route);
  const refusees = analyse.refusees;
  const ecarts: string[] = [];
  if (!egale(types, cas.attendu.types)) ecarts.push("types");
  if (!egale(routes, cas.attendu.routes)) ecarts.push("routes");
  if (!egale(refusees, cas.attendu.refuse)) ecarts.push("refus");
  const dimensions = 3;
  const score = (dimensions - ecarts.length) / dimensions;
  return {
    nom: cas.nom, reussi: ecarts.length === 0, score,
    types, routes, refusees, ecarts,
  };
}

/** Les entrees sont des consignes REJOUABLES : memes lignes que le cerveau
 *  factice sait lire (voir src/services/hermes.ts:cerveauFactice). */
export const CAS_DORES: CasEval[] = [
  {
    nom: "rupture -> proposition d'achat",
    consigne: "- En rupture imminente: Farine (2kg)",
    sortie: JSON.stringify({ suggestions: [{
      type: "achat", priorite: "haute", titre: "Hermes: commander les articles en rupture",
      explication: "Detecte dans le contexte.", action_route: "/api/purchasing/order",
      action_payload: { items: [] },
    }] }),
    attendu: { types: ["achat"], routes: ["/api/purchasing/order"], refuse: [] },
  },
  {
    nom: "DLC -> proposition HACCP",
    consigne: "- DLC sous 3 jours: Yoghourt lot L7 (2026-11-27)",
    sortie: JSON.stringify({ suggestions: [{
      type: "haccp", priorite: "haute", titre: "Hermes: verifier les DLC proches",
      explication: "Detecte dans le contexte.", action_route: "/api/haccp/batches",
      action_payload: null,
    }] }),
    attendu: { types: ["haccp"], routes: ["/api/haccp/batches"], refuse: [] },
  },
  {
    nom: "rien a signaler -> sortie vide",
    consigne: "- En rupture imminente: aucune\n- DLC sous 3 jours: aucune",
    sortie: JSON.stringify({ suggestions: [] }),
    attendu: { types: [], routes: [], refuse: [] },
  },
  {
    nom: "route invente -> refus NOMME, jamais une ecriture",
    consigne: "- En rupture imminente: Farine (2kg)",
    sortie: JSON.stringify({ suggestions: [{
      type: "general", priorite: "normale", titre: "Escalade", explication: "hors liste",
      action_route: "/api/admin/users", action_payload: null,
    }] }),
    attendu: { types: [], routes: [], refuse: ["0:route_inconnue(/api/admin/users)"] },
  },
  {
    nom: "JSON illisible -> refus NOMME, pas un [] invente",
    consigne: "- En rupture imminente: Farine (2kg)",
    sortie: "{ceci n'est pas du JSON",
    attendu: { types: [], routes: [], refuse: ["JSON_ILLISIBLE"] },
  },
];

export function evaluerTous(cas: CasEval[] = CAS_DORES): {
  total: number; reussis: number; score_moyen: number; verdicts: VerdictEval[];
} {
  const verdicts = cas.map(evaluerCas);
  const reussis = verdicts.filter((v) => v.reussi).length;
  const score_moyen = verdicts.length
    ? verdicts.reduce((s, v) => s + v.score, 0) / verdicts.length
    : 0;
  return { total: verdicts.length, reussis, score_moyen, verdicts };
}
