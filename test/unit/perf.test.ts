// Tests d'INVARIANT du collecteur de latence : on verifie le comportement qui
// fait la valeur de l'instrumentation (clef agnostique de l'id, percentiles au
// rang exact, moyenne sur l'observe total et non sur l'anneau, cardinalite
// bornee), jamais une valeur de reglage fragile.
import { describe, it, expect, beforeEach } from "vitest";
import {
  perf,
  normalizeRoute,
  looksLikeId,
  RING_SIZE,
  MAX_ROUTES,
  OVERFLOW_KEY,
} from "../../src/services/perf.js";

beforeEach(() => {
  perf.reset();
});

describe("normalizeRoute : clef par motif, pas par chemin brut", () => {
  it("deux ids differents tombent sur la MEME clef", () => {
    expect(normalizeRoute("GET", "/api/inventory/123")).toBe(normalizeRoute("GET", "/api/inventory/456"));
    expect(normalizeRoute("GET", "/api/inventory/123")).toBe("GET /api/inventory/:id");
  });

  it("deux ressources differentes ont des clefs DISTINCTES", () => {
    expect(normalizeRoute("GET", "/api/inventory")).not.toBe(normalizeRoute("GET", "/api/suppliers"));
    expect(normalizeRoute("GET", "/api/inventory")).toBe("GET /api/inventory");
    expect(normalizeRoute("GET", "/api/suppliers")).toBe("GET /api/suppliers");
  });

  it("la query string est ignoree", () => {
    expect(normalizeRoute("GET", "/api/inventory?page=2&q=sel")).toBe("GET /api/inventory");
    expect(normalizeRoute("GET", "/api/inventory/123?t=1")).toBe("GET /api/inventory/:id");
  });

  it("le motif Express est prioritaire sur le chemin brut", () => {
    expect(normalizeRoute("GET", "/api/inventory/123", "/api/inventory/:id")).toBe("GET /api/inventory/:id");
    // Meme clef que l'heuristique : les deux chemins convergent, donc un id
    // passe par le motif Express et un autre par l'heuristique ne creeront
    // jamais deux series pour la meme route.
    expect(normalizeRoute("GET", "/api/inventory/123", "/api/inventory/:id"))
      .toBe(normalizeRoute("GET", "/api/inventory/999"));
  });

  it("la methode fait partie de la clef et est normalisee en majuscules", () => {
    expect(normalizeRoute("post", "/api/inventory")).toBe("POST /api/inventory");
    expect(normalizeRoute("DELETE", "/api/inventory/7")).toBe("DELETE /api/inventory/:id");
    expect(normalizeRoute("POST", "/api/inventory")).not.toBe(normalizeRoute("GET", "/api/inventory"));
  });

  it("les formes d'id typiques sont reconnues, pas les noms de ressource", () => {
    expect(looksLikeId("123")).toBe(true); // auto-increment
    expect(looksLikeId("1725000000000")).toBe(true); // Date.now()
    expect(looksLikeId("3fa85e2a-1b7c-4c1d-9a11-0f2e3d4c5b6a")).toBe(true); // uuid
    expect(looksLikeId("token_9f8a7b")).toBe(true);
    expect(looksLikeId("l0z4ch39")).toBe(true); // base36 de Math.random()
    expect(looksLikeId("inventory")).toBe(false);
    expect(looksLikeId("suppliers")).toBe(false);
    expect(looksLikeId("stats")).toBe(false);
    expect(looksLikeId("")).toBe(false);
  });
});

describe("percentiles : rang exact et lecture sans effet de bord", () => {
  it("p50/p95/p99/max suivent la formule du plus proche rang (rank = ceil(p/100*n))", () => {
    // Durees injectees en microsecondes, par pas de 1 ms (1000..100000 us) :
    // le rapport est en ms a 1 decimale, donc un pas fin serait efface par
    // l'arrondi du rapport et ne prouverait plus le rang.
    for (let i = 1; i <= 100; i++) {
      perf.record("GET /x", i * 1000, 200);
    }
    const [s] = perf.snapshot().routes;
    expect(s.samples).toBe(100);
    // n=100 : p50 -> rang 50 -> 50e valeur ; p95 -> rang 95 ; p99 -> rang 99.
    expect(s.p50Ms).toBeCloseTo(50, 1e-9);
    expect(s.p95Ms).toBeCloseTo(95, 1e-9);
    expect(s.p99Ms).toBeCloseTo(99, 1e-9);
    expect(s.maxMs).toBeCloseTo(100, 1e-9);
    expect(s.p50Ms).toBeLessThan(s.p95Ms);
    expect(s.p95Ms).toBeLessThan(s.p99Ms);
    expect(s.p99Ms).toBeLessThan(s.maxMs);
  });

  it("deux instantanes consecutifs donnent les memes valeurs (le tri ne mute pas l'anneau)", () => {
    for (let i = 0; i < 60; i++) {
      perf.record("GET /stable", ((i * 37) % 61) * 10, 200); // durees en vrac
    }
    const a = perf.snapshot().routes[0];
    const b = perf.snapshot().routes[0];
    expect(b).toEqual(a);
    // Un enregistrement entre les deux lectures ne deplace que ce qu'on ajoute.
    perf.record("GET /stable", 5_000_000, 200);
    const c = perf.snapshot().routes[0];
    expect(c.samples).toBe(a.samples + 1);
    expect(c.maxMs).toBeGreaterThan(a.maxMs);
  });

  it("la moyenne porte sur TOUT l'observe, pas sur la taille de l'anneau", () => {
    const n = 500; // > RING_SIZE : l'anneau a tourne, la moyenne doit rester juste
    for (let i = 0; i < n; i++) perf.record("GET /ring", 1000, 200); // 1000 us = 1.0 ms
    const [s] = perf.snapshot().routes;
    expect(n).toBeGreaterThan(RING_SIZE);
    expect(s.samples).toBe(n);
    expect(s.meanMs).toBeCloseTo(1.0, 1e-9);
    expect(s.p50Ms).toBeCloseTo(1.0, 1e-9);
  });

  it("une duree extreme hors de l'anneau ne contamine plus la moyenne apres rotation", () => {
    // Le premier echantillon est lent : il reste dans sum (donc dans la moyenne
    // globale), mais sort de l'anneau une fois RING_SIZE depasse : les
    // percentiles, eux, refletent la population recente.
    perf.record("GET /mixte", 9_000_000, 200); // 9 s
    for (let i = 0; i < RING_SIZE; i++) perf.record("GET /mixte", 2000, 200); // 2 ms
    const [s] = perf.snapshot().routes;
    expect(s.p95Ms).toBeCloseTo(2, 1e-9);
    expect(s.p95Ms).toBeLessThan(100);
    expect(s.meanMs).toBeGreaterThan(2); // sum porte encore le 9 s
  });
});

describe("cardinalite et erreurs", () => {
  it("au-dela de MAX_ROUTES motifs, tout agrege dans OVERFLOW_KEY sans exploser la table", () => {
    // Encodage base-26 purement alpha (aucun chiffre) : les segments ne
    // peuvent pas etre reconnus comme des ids par l'heuristique, donc chaque
    // chemin reste un motif distinct -> on depasse vraiment le plafond.
    const letters = (n: number): string => {
      let s = "";
      let k = n;
      do {
        s = String.fromCharCode(97 + (k % 26)) + s;
        k = Math.floor(k / 26) - 1;
      } while (k >= 0);
      return s;
    };
    for (let i = 1; i <= 200; i++) {
      perf.record(`GET /r/${letters(i)}`, i, 200);
    }
    const snap = perf.snapshot(1000);
    expect(snap.series).toBeLessThanOrEqual(MAX_ROUTES + 1);
    expect(snap.routes.some((r) => r.route === OVERFLOW_KEY)).toBe(true);
    // L'overflow a quand meme absorbe les durees perdues pour la vue globale.
    const ovf = snap.routes.find((r) => r.route === OVERFLOW_KEY)!;
    expect(ovf.samples).toBeGreaterThan(0);
    expect(snap.routes.reduce((acc, r) => acc + r.samples, 0)).toBe(200);
  });

  it("une pluie d'ids inventes ne cree pas une serie par id", () => {
    for (let i = 0; i < 300; i++) {
      perf.record(normalizeRoute("GET", `/api/inventory/${i}`), 500, 200);
    }
    const snap = perf.snapshot(1000);
    expect(snap.series).toBe(1);
    expect(snap.routes[0].route).toBe("GET /api/inventory/:id");
    expect(snap.routes[0].samples).toBe(300);
  });

  it("un statut >= 400 incremente errors de la serie, pas celui des autres", () => {
    perf.record("GET /a", 100, 200);
    perf.record("GET /a", 120, 404);
    perf.record("GET /a", 130, 500);
    perf.record("GET /b", 110, 200);
    const snap = perf.snapshot(1000);
    const a = snap.routes.find((r) => r.route === "GET /a")!;
    const b = snap.routes.find((r) => r.route === "GET /b")!;
    expect(a.errors).toBe(2);
    expect(b.errors).toBe(0);
    expect(a.samples).toBe(3);
  });

  it("snapshot trie par p95 decroissant et honorele plafond top + les compteurs", () => {
    perf.record("GET /lent", 9_000_000, 200); // 9 s
    perf.record("GET /rapide", 1000, 200); // 1 ms
    perf.record("GET /moyen", 1_000_000, 200); // 1 s
    const snap = perf.snapshot();
    expect(snap.routes.map((r) => r.route)).toEqual(["GET /lent", "GET /moyen", "GET /rapide"]);
    expect(snap.series).toBe(3);
    expect(snap.total).toBe(3);
    expect(snap.inflight).toBe(0);
    expect(perf.snapshot(2).routes.length).toBe(2);
  });

  it("onRequestStart alimente la jauge des requetes concurrentes", () => {
    perf.onRequestStart();
    perf.onRequestStart();
    expect(perf.snapshot().inflight).toBe(2);
    perf.record("GET /x", 100, 200);
    expect(perf.snapshot().inflight).toBe(1);
  });

  it("reset() vide la table et les compteurs", () => {
    perf.onRequestStart();
    perf.record("GET /x", 100, 200);
    perf.reset();
    const snap = perf.snapshot();
    expect(snap.routes).toEqual([]);
    expect(snap.series).toBe(0);
    expect(snap.total).toBe(0);
    expect(snap.inflight).toBe(0);
  });
});
