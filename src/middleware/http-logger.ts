// Logger HTTP minimal -- loggue chaque requete sous la forme :
//   [12:34:56] GET /api/inventory -> 200 (3ms)
// Les requetes /health sont ignorees (trop de bruit).
//
// Il fait deux choses desormais :
//   1. le log console (comportement herite, CONSERVE tel quel : les scripts
//      d'audit et les tests s'appuient dessus) ;
//   2. l'enregistrement de la duree dans le collecteur de latence par route
//      (src/services/perf.ts), pour que /health/perf expose des percentiles
//      mesures dans l'app au lieu d'un audit externe.
//
// SUBTILITE : ce middleware est monte AVANT les routeurs (server.ts), donc a
// son entree req.route n'existe pas encore -- il n'est peuple que lorsque
// Express a matche la route. On capture donc t0 ici, et on lit req.route.path
// dans le callback "finish" : a ce moment la requete a traverse le routeur et
// le motif (/api/inventory/:id) est disponible. Sur le chemin chaud on ne fait
// ni tri ni allocation par requete (le tri est dans snapshot, a la demande).
//
// Exclusions : /health et /health/perf. Sans la seconde, le poll de sante
// injecterait sa propre mesure dans les stats qu'il est cense eclairer
// (auto-bruit) et noierait les series utiles.
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { perf, normalizeRoute } from "../services/perf.js";

/** Routes dont on ne veut ni log ni mesure (bruit du poll de sante). */
function isExcluded(pathname: string): boolean {
  return pathname === "/health" || pathname === "/health/perf";
}

type RouteOnRequest = { path?: string; regex?: { test?: (s: string) => boolean } };
type ExpressRouteOnRequest = Request & { route?: RouteOnRequest };

/**
 * Le motif n'est credible que si Express a reellement matche une route :
 * req.route peut aussi porter le prefixe d'un montage (/api), qui n'est pas le
 * motif complet. Le test de la regex de la route sur le chemin filtre ce cas.
 */
function patternIfMatched(req: ExpressRouteOnRequest, pathname: string): string | undefined {
  const route = req.route;
  if (!route || typeof route.path !== "string" || route.path === "/") return undefined;
  const reg = route.regex;
  if (!reg || typeof reg.test !== "function") return undefined;
  try {
    if (!reg.test(pathname)) return undefined;
  } catch {
    return undefined;
  }
  return route.path;
}

const httpLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const pathname = req.path;
  if (isExcluded(pathname)) return next();

  const method = req.method;
  const start = Date.now();
  // Resolution sub-microseconde : Date.now() (ms) noiait un p50 reel de ~2 ms
  // dans l'arrondi. On mesure en us, on rapporte en ms.
  const t0 = process.hrtime.bigint();
  const perfReq = req as ExpressRouteOnRequest;
  perf.onRequestStart();

  let done = false;
  const finalize = () => {
    if (done) return; // "close" peut suivre "finish" : on ne compte qu'une fois
    done = true;
    const elapsed = Date.now() - start;
    const time = new Date().toTimeString().slice(0, 8);
    console.log(`[${time}] ${method} ${pathname} \u2192 ${res.statusCode} (${elapsed}ms)`);
    try {
      const pattern = patternIfMatched(perfReq, pathname);
      const durationUs = Number(process.hrtime.bigint() - t0) / 1000;
      perf.record(normalizeRoute(method, pathname, pattern), durationUs, res.statusCode);
    } catch {
      // La mesure ne doit jamais casser une reponse ; le log, lui, est deja emis.
    }
  };

  res.on("finish", finalize);
  res.on("close", finalize); // secours : reponse interrompue cote client
  next();
};

export default httpLogger;
