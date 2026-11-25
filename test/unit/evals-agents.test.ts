// Unites pures du harnais GH-600 (sans base, sans LLM, sans reseau).
import { describe, expect, it } from "vitest";
import { CAS_DORES, evaluerCas, evaluerTous } from "../../src/services/evals/index.js";
import { verifierPropositions } from "../../src/services/orchestration/index.js";
import { validerProposition } from "../../src/services/outils/index.js";

describe("evals GH-600", () => {
  it("les 5 cas d'ores sont verts au score parfait", () => {
    const r = evaluerTous();
    expect(r.total).toBe(5);
    expect(r.reussis).toBe(5);
    expect(r.score_moyen).toBe(1);
    for (const v of r.verdicts) expect(v.ecarts).toEqual([]);
  });

  it("un attendu corrompu rougit le cas", () => {
    const cas = {
      ...CAS_DORES[0],
      attendu: { ...CAS_DORES[0].attendu, routes: ["/api/admin/users"] },
    };
    const v = evaluerCas(cas);
    expect(v.reussi).toBe(false);
    expect(v.ecarts).toContain("routes");
    expect(v.score).toBeLessThan(1);
  });

  it("une route hors liste devient un refus NOMME", () => {
    const cas = CAS_DORES[3];
    const v = evaluerCas(cas);
    expect(v.routes).toEqual([]);
    expect(v.refusees).toEqual(["0:route_inconnue(/api/admin/users)"]);
    expect(v.reussi).toBe(true); // le refus ETAIT l'attendu
  });
});

describe("verificateur multi-agents", () => {
  const p = (route: string, payload: Record<string, unknown> | null) => ({
    type: "achat" as const, priorite: "normale" as const,
    titre: "test", explication: "", action_route: route, action_payload: payload,
  });

  it("detecte une contradiction sur une meme route", () => {
    const r = verifierPropositions([p("/api/suppliers", { a: 1 }), p("/api/suppliers", { b: 2 })], new Set());
    expect(r.retenues).toHaveLength(1);
    expect(r.conflits).toContain("contradiction:/api/suppliers");
  });

  it("dedupe les propositions deja deposees aujourd'hui", () => {
    const r = verifierPropositions([p("/api/suppliers", null)], new Set(["/api/suppliers|test"]));
    expect(r.retenues).toHaveLength(0);
    expect(r.conflits[0]).toContain("doublon:");
  });

  it("refuse une route que le produit ne connait pas", () => {
    const r = verifierPropositions([p("/api/admin/users", null)], new Set());
    expect(r.retenues).toHaveLength(0);
    expect(r.conflits[0]).toContain("route_inconnue:");
  });
});

describe("validation de l'outil proposer_action", () => {
  it("accepte une proposition conforme", () => {
    const r = validerProposition({
      type: "stock", priorite: "haute", titre: "ok", action_route: "/api/inventory",
    });
    expect("proposition" in r).toBe(true);
  });

  it("refuse un payload tableau (l'ecriture ne doit pas etre un contournement)", () => {
    const r = validerProposition({
      type: "stock", titre: "piège", action_route: "/api/inventory", action_payload: [1],
    });
    expect(r).toEqual({ erreur: "PAYLOAD_INVALIDE" });
  });
});
