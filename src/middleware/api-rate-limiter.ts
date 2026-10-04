// Rate-limit a budgets differencies par categorie de surface.
//
// Pourquoi ce fichier : le limiteur herite (300 req / 15 min, un seul budget pour
// tout /api) etait un defaut de conception, pas un reglage. Mesure par
// scripts/audit-perf.mjs : une simple tablette laissee sur l'onglet HACCP emet
// ~29 req/min (capteurs 4 s + robots 5 s + alertes 30 s) et declenchait un 429
// GLOBAL au bout de ~10 min, sans autre activite. Dans une cuisine, l'app
// "mourait" pendant le service. A l'inverse, /api/unlock (surface de brute-force
// de la cle de licence) disposait de 300 tentatives par fenetre : trop genereux.
//
// Decision : un budget par categorie, chacun avec sa FENETRE et son compteur
// (une instance de MemoryStore par categorie, donc aucune double comptabilite :
// une requete traverse exactement un budget).
//
//   read   : le polling temps reel est legitime, on le laisse respirer.
//   mutate : l'humain ne saisit pas 150 ecritures en 5 min a la main.
//   delete : suppression de masse accidentelle (tout effacer d'un onglet ouvert).
//   auth   : la cle de licence se verifie par RSA, 20 tentatives / 15 min suffisent.
//   ai     : 1 appel = 1 generation Ollama (ou 1 launch Chromium) = couteux.
//
// Les en-tetes RateLimit sont ems par la lib en draft-8 : le seul format qui
// publie le NOM du quota. Le client connait donc son budget restant ET la
// categorie qui sature, sans interrogater le serveur.
import rateLimit from "express-rate-limit";
import type { Request, RequestHandler, Response, NextFunction } from "express";

export type Bucket = "read" | "mutate" | "delete" | "auth" | "ai";

type Budget = { windowMs: number; limit: number };

const MIN = 60_000;

export const BUDGETS: Record<Bucket, Budget> = {
  read: { windowMs: 5 * MIN, limit: 600 },
  mutate: { windowMs: 5 * MIN, limit: 150 },
  delete: { windowMs: 5 * MIN, limit: 40 },
  auth: { windowMs: 15 * MIN, limit: 20 },
  ai: { windowMs: 5 * MIN, limit: 60 },
};

// Les routes qui ne sont pas comptees : le flux SSE est une connexion unique
// volontairement longue (1 requete = toute la duree de l'onglet ouvert) et le
// statut de licence est lu a chaque rendu de l'ecran de deblocage.
const EXEMPT_PREFIXES = ["/api/sensors/stream", "/api/trial-status"];

export function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

/** Chemin normalise, sans la query string, tel que vu par le routeur Express. */
export function routePath(req: Request): string {
  const url = req.originalUrl ?? req.url ?? "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Classe une requete dans un budget. Retourne null si la requete n'est pas
 * sous /api (assets statiques, /health, catch-all du SPA) ou si elle est exempte.
 * Exportee pure pour etre testee sans serveur (test/unit/rate-limiter.test.ts).
 */
export function bucketFor(req: Request): Bucket | null {
  const path = routePath(req);
  if (!path.startsWith("/api/")) return null;
  if (isExempt(path)) return null;

  // L'authentification est verifiee AVANT la methode : c'est la surface sensible.
  if (path === "/api/unlock") return "auth";
  // Identite (chantier 1) : login/logout/setup sont la surface brute-force
  // par excellence — le bucket auth (20/15 min) leur convient.
  if (path.startsWith("/api/auth/")) return "auth";

  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return "read";
  if (method === "DELETE") return "delete";

  // Les routes IA sont cheres : generation Ollama complete / automatisation RPA.
  if (path === "/api/ai/chat" || path === "/api/voice" || path.startsWith("/api/agent/")) return "ai";

  return "mutate";
}

export default function apiRateLimiter(): RequestHandler {
  // COOKDRIVE_RATELIMIT_OFF=1 : env de HARNAIS (comme COOKDRIVE_AUTH_OFF).
  // La sonde d'identite (scripts/verify-auth.mjs) joue ~10 appels /api/auth/*
  // a la suite : le bucket auth (20/15 min, par IP) est sature au 2e run et le
  // harnais rougit selon l'historique des runs — un capteur mort. Le contrat
  // rate-limit a SA porte (verify:ratelimit), qui juge sans cette env.
  if (process.env.COOKDRIVE_RATELIMIT_OFF === "1") {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const handlers = new Map<Bucket, RequestHandler>();
  for (const [bucket, budget] of Object.entries(BUDGETS)) {
    handlers.set(
      bucket as Bucket,
      rateLimit({
        windowMs: budget.windowMs,
        limit: budget.limit,
        // draft-8 publie le nom du quota dans RateLimit-Policy ("read"; q=...)
        // et RateLimit ("read"; r=..). Un 429 devient diagnostiquable depuis le
        // client sans avoir a interrogater le serveur. draft-7 ne publie pas le
        // nom : c'est ce qui a fait rougir la verification de ce meme fichier.
        identifier: `${bucket}-in-${budget.windowMs}`,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        // message accepte une fonction par requete : meme corps pour tous les
        // 429, avec la categorie qui a saute (le client peut rebondir juste).
        message: () => ({
          status: "error",
          error: `Trop de requetes (${bucket}), reessaie dans quelques minutes.`,
          bucket,
          limit: budget.limit,
          windowMs: budget.windowMs,
        }),
      }) as unknown as RequestHandler,
    );
  }

  return function limiter(req: Request, res, next) {
    const bucket = bucketFor(req);
    if (bucket === null) return next();
    const handler = handlers.get(bucket);
    if (!handler) return next();
    return handler(req, res, next);
  };
}
