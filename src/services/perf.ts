// Collecteur de latence par route (anneau circulaire + percentiles).
//
// Pourquoi ce fichier : l'audit de perf devait se placer A L'EXTERIEUR pour
// mesurer les percentiles, parce que /health ne connait aucun percentile. Sans
// ca, toute decision de perf est devinee; avec ca, elle est mesuree dans
// l'app elle-meme.
//
// Trois pieces qui ne sont pas negociables (chacune est un defaut que la
// version naive introduirait) :
//
//  1. Horodatage en process.hrtime.bigint(), pas Date.now(). Le logger herite
//     mesurait en millisecondes : sur des endpoints dont le p50 reel est ~2 ms,
//     toute l'echelle etait noyee dans l'arrondi (le "(2ms)" du log herite).
//     On mesure en microsecondes et on rapporte en ms a 1 decimale.
//
//  2. Bucket par MOTIF de route, pas par chemin brut. Clef sur
//     /api/inventory/123 donnerait une serie distincte par id : cardinalite non
//     bornee (fuite memoire lente) et moyenne qui ne veut rien dire. On
//     utilise le motif Express (req.route.path -> /api/inventory/:id) quand il
//     est dispo, sinon une normalisation heuristique, et TOUJOURS un plafond de
//     cardinalite (point 3) pour que la limite memoire ne depende pas de la
//     justesse de l'heuristique.
//
//  3. Cardinalite BORNEE par construction. MAX_ROUTES motifs distincts; au-dela,
//     tout est agrege dans OVERFLOW_KEY. Une route inattendue ou un id non
//     reconnu ne peut pas faire grossir la table indefiniment.
//
// La lecture (percentiles) trie une COPIE d'un anneau de 256 flottants : coute
// negligeable et se fait a la demande (snapshot), jamais a chaque requete - le
// chemin chaud reste O(1), sans tri ni allocation par requete.
export const RING_SIZE = 256;
export const MAX_ROUTES = 80;
export const OVERFLOW_KEY = "*overflow*";

type Entry = {
  ring: Float64Array; // dures en microsecondes, anneau circulaire
  count: number; // nombre total observe (peut depasser RING_SIZE : la table a tourne)
  sum: number; // somme des microsecondes de TOUT l'observe (base de la moyenne globale)
  errors: number; // reponses >= 400
};

export type RouteStats = {
  route: string;
  samples: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errors: number;
};

/** Rang au percentile (plus proche rang, index [0..n-1]). */
function rankOf(n: number, p: number): number {
  if (n <= 0) return -1;
  const rank = Math.ceil((p / 100) * n);
  return Math.min(n - 1, Math.max(0, rank - 1));
}

/** Segment qui ressemble a un identifiant (et non a un nom de ressource). */
export function looksLikeId(seg: string): boolean {
  if (seg === "") return false;
  if (/^\d+$/.test(seg)) return true; // Date.now(), auto-increment
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return true; // uuid
  if (/^(?:token|key|tmp|file|doc|img)_[0-9a-z]+$/i.test(seg)) return true;
  // base-36 de Math.random()/Date.now() : 6+ alphanum avec au moins un chiffre
  if (seg.length >= 6 && /[0-9]/.test(seg) && /[a-z]/i.test(seg) && /^[0-9a-z]+$/i.test(seg)) return true;
  return false;
}

/**
 * Clef stable pour un chemin. Exportee pure pour etre testable sans serveur :
 * /api/inventory/123 et /api/inventory/456 doivent tomber sur la MEME clef,
 * /api/inventory et /api/suppliers sur des clefs DISTINCTES.
 */
export function normalizeRoute(method: string, rawPath: string, expressPattern?: string): string {
  const m = String(method || "").toUpperCase();
  // Le motif Express est autoritaire quand present (/api/inventory/:id).
  if (expressPattern && expressPattern.includes(":")) {
    const pat = expressPattern.startsWith("/") ? expressPattern : "/" + expressPattern;
    return `${m} ${pat}`;
  }
  const noQuery = String(rawPath || "").split("?")[0];
  const segs = noQuery.split("/").map((s) => (looksLikeId(s) ? ":id" : s));
  return `${m} ${segs.join("/") || "/"}`;
}

const us2ms = (v: number): number => Math.round(v / 100) / 10; // us -> ms, 1 decimale

class Perf {
  private map = new Map<string, Entry>();
  private inflight = 0;
  private total = 0;

  /** Marque le demarrage d'une requete (jauge des concurrents en cours). */
  onRequestStart(): void {
    this.inflight += 1;
  }

  /** Consigne une duree en microsecondes pour un motif de route. */
  record(routeKey: string, durationUs: number, status: number): void {
    this.inflight = Math.max(0, this.inflight - 1);
    this.total += 1;

    let entry = this.map.get(routeKey);
    if (!entry && this.map.size >= MAX_ROUTES) {
      // Plafond atteint : on n'ouvre pas de nouvelle serie, on agrege dans
      // l'overflow. La limite memoire ne depend donc pas de la justesse de la
      // normalisation ni de ce qu'un client invente comme chemins.
      routeKey = OVERFLOW_KEY;
      entry = this.map.get(routeKey);
    }
    if (!entry) {
      entry = { ring: new Float64Array(RING_SIZE), count: 0, sum: 0, errors: 0 };
      this.map.set(routeKey, entry);
    }
    const slot = entry.count % RING_SIZE;
    entry.ring[slot] = durationUs;
    entry.count += 1; // moyenne sur TOUT l'observe, pas sur la taille d'anneau
    entry.sum += durationUs;
    if (status >= 400) entry.errors += 1;
  }

  private statsFor(key: string, e: Entry): RouteStats {
    // Echantillons reellement presents dans l'anneau : une fois la rotation
    // passee, count continue de croitre mais l'anneau reste a RING_SIZE cases.
    // Sans ce clamp, max irait lire un indice hors bornes (=> 0) des la 257e
    // mesure et tous les rangs seraient decales d'un cran.
    const n = Math.min(e.count, RING_SIZE);
    const meanUs = e.count > 0 ? e.sum / e.count : 0;
    let p50 = 0, p95 = 0, p99 = 0, max = 0;
    if (n > 0) {
      // Copie (subarray -> Float64Array.from alloue) : on ne mute JAMAIS
      // l'anneau vivant, sinon un snapshot detruirait l'ordre d'arrivee.
      const sorted = Float64Array.from(e.ring.subarray(0, n));
      sorted.sort(); // TypedArray.sort() est numerique par defaut
      p50 = sorted[rankOf(n, 50)] ?? 0;
      p95 = sorted[rankOf(n, 95)] ?? 0;
      p99 = sorted[rankOf(n, 99)] ?? 0;
      max = sorted[n - 1] ?? 0;
    }
    return {
      route: key,
      samples: e.count,
      meanMs: us2ms(meanUs),
      p50Ms: us2ms(p50),
      p95Ms: us2ms(p95),
      p99Ms: us2ms(p99),
      maxMs: us2ms(max),
      errors: e.errors,
    };
  }

  /**
   * Instantane trie par p95 decroissant (le plus lent d'abord : c'est ce qu'on
   * regarde quand on cherche un col). Appelle a la demande sur /health/perf.
   */
  snapshot(top = 20): { routes: RouteStats[]; inflight: number; total: number; series: number } {
    const routes: RouteStats[] = [];
    for (const [key, e] of this.map) routes.push(this.statsFor(key, e));
    routes.sort((a, b) => b.p95Ms - a.p95Ms);
    return {
      routes: routes.slice(0, top),
      inflight: this.inflight,
      total: this.total,
      series: this.map.size,
    };
  }

  /** Remise a zero (utile pour les tests / bench scriptees). */
  reset(): void {
    this.map.clear();
    this.inflight = 0;
    this.total = 0;
  }
}

// Un seul collecteur par process : le logger ECrit, la route de sante Lit.
export const perf = new Perf();
