import { describe, it, expect } from "vitest";
import {
  FOURNISSEURS_BLANCS,
  estBlanc,
  FournisseurInconnu,
  Fournisseur,
} from "../../src/shared/fournisseur/index.js";

describe("liste blanche des fournisseurs (Sprint 15, Tache 1-4)", () => {
  it("retient chaque fournisseur de la liste", () => {
    for (const f of FOURNISSEURS_BLANCS) {
      expect(estBlanc(f.domaine)).toBe(true);
    }
  });

  it("refuse Groq: son inventaire /v1/models rend 404, donc non verifie", () => {
    expect(estBlanc("groq.com")).toBe(false);
  });

  it("refuse toute URL que le chef aurait inventee", () => {
    for (const d of ["evil.example.com", "openai.com.evil.com", ""]) {
      expect(estBlanc(d)).toBe(false);
    }
  });

  it("lev FournisseurInconnu DES LA CONSTRUCTION si hors-liste", () => {
    // La sémantique voulue est plus forte qu'une levée à la génération: un
    // hors-liste ne doit pas pouvoir EXISTER comme objet du code. Un objet
    // construit puis refusé à l'usage laisserait une fenêtre ouverte.
    const f = () => new Fournisseur(
      { nom: "Mauvais", domaine: "evil.example.com" } as any);
    expect(f).toThrow(FournisseurInconnu);
    expect(f).toThrow(/liste blanche/);
  });

  it("refuse aussi la construction d'un secours hors-liste", () => {
    for (const d of ["openai.com.evil.com", "", "api.openai.com"]) {
      const f = () => new Fournisseur({ nom: d, domaine: d } as any);
      expect(f).toThrow(FournisseurInconnu);
    }
  });

  it("ne promeut jamais la clef dans l'URL, et nest HTTPS seulement", () => {
    expect(FOURNISSEURS_BLANCS.length).toBeGreaterThan(0);
    for (const f of FOURNISSEURS_BLANCS) {
      expect(f.urlBase.startsWith("https://")).toBe(true);
      expect(f.urlBase).toContain(f.domaine);
      expect(f.urlBase).not.toMatch(/sk-|key=|token=/i);
    }
  });
});
