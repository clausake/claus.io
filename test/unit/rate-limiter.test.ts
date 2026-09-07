// Contrat du rate-limit par categorie : figure le comportement qui a ete casse,
// pas une valeur de reglage. Si on inverse un jour read et auth, ces tests
// doivent rougir. Le routeur est une fonction pure sur (method, url) : testable
// sans serveur ni base.
import { describe, it, expect } from "vitest";
import { bucketFor, isExempt, routePath, BUDGETS } from "../../src/middleware/api-rate-limiter.js";
import type { Request } from "express";

const req = (method: string, url: string) => ({ method, originalUrl: url, url }) as unknown as Request;

describe("rate-limit : classement par categorie de surface", () => {
  it("classe les methodes par cout et non par chemin seul", () => {
    expect(bucketFor(req("GET", "/api/inventory"))).toBe("read");
    expect(bucketFor(req("HEAD", "/api/inventory"))).toBe("read");
    expect(bucketFor(req("POST", "/api/inventory"))).toBe("mutate");
    expect(bucketFor(req("PUT", "/api/inventory/42"))).toBe("mutate");
    expect(bucketFor(req("DELETE", "/api/inventory/42"))).toBe("delete");
  });

  it("reserve le budget le plus etroit a la surface d'authentification", () => {
    // L'invariant de securite : unlock est plus strict que n'importe quel POST
    // metier, sinon le brute-force de cle de licence coute moins cher qu'une saisie.
    expect(bucketFor(req("POST", "/api/unlock"))).toBe("auth");
    expect(BUDGETS.auth.limit).toBeLessThan(BUDGETS.mutate.limit);
  });

  it("isole les routes IA (une requete = une generation Ollama / un launch Chromium)", () => {
    expect(bucketFor(req("POST", "/api/ai/chat"))).toBe("ai");
    expect(bucketFor(req("POST", "/api/voice"))).toBe("ai");
    expect(bucketFor(req("POST", "/api/agent/command"))).toBe("ai");
    // et ne confond pas un GET metier avec une generation
    expect(bucketFor(req("GET", "/api/epicure/recommendations"))).toBe("read");
  });

  it("ne compte ni le flux SSE ni le statut de licence", () => {
    // Le SSE est une connexion unique volontairement longue : la compter
    // punirait le client qui reste simplement branche sur ses capteurs.
    expect(bucketFor(req("GET", "/api/sensors/stream"))).toBe(null);
    expect(bucketFor(req("GET", "/api/trial-status"))).toBe(null);
    expect(isExempt("/api/sensors/stream")).toBe(true);
  });

  it("laisse sortir du budget tout ce qui n'est pas /api", () => {
    // assets statiques, /health, catch-all du SPA : les compter detruirait le
    // budget d'un onglet simplement ouvert sur l'application.
    expect(bucketFor(req("GET", "/health"))).toBe(null);
    expect(bucketFor(req("GET", "/assets/index-abc123.js"))).toBe(null);
    expect(bucketFor(req("GET", "/"))).toBe(null);
  });

  it("ignore la query string (une recherche ne devient pas un autre budget)", () => {
    expect(bucketFor(req("GET", "/api/search?q=carotte&lang=fr"))).toBe("read");
    expect(routePath(req("GET", "/api/search?q=x"))).toBe("/api/search");
  });

  it("donne a chaque categorie une fenetre et un budget exploitables", () => {
    // Le 429 herite venait d'un budget global trop bas pour le temps reel :
    // read doit tenir le polling cumule des trois sondes (mesure : ~29 req/min).
    const perMinute = (b: keyof typeof BUDGETS) => (BUDGETS[b].limit / BUDGETS[b].windowMs) * 60_000;
    expect(perMinute("read")).toBeGreaterThan(29);
    // Et aucune categorie ne doit rester silencieusement sans plafond.
    for (const b of (["read", "mutate", "delete", "auth", "ai"] as const)) {
      expect(BUDGETS[b].limit).toBeGreaterThan(0);
      expect(BUDGETS[b].windowMs).toBeGreaterThan(0);
    }
  });
});
