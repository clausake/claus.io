import { describe, it, expect } from "vitest";
import {
  safeJsonParse,
  backendGetCostModifier,
  calculatePricePerRef,
  getOllamaHost,
} from "../../src/shared/util.js";

describe("safeJsonParse", () => {
  it("parse du JSON valide", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("retourne le même objet pour un JSON valide imbriqué", () => {
    expect(safeJsonParse('{"a":{"b":[1,2,3]}}')).toEqual({ a: { b: [1, 2, 3] } });
  });
});

describe("backendGetCostModifier", () => {
  it("unités par défaut", () => {
    expect(backendGetCostModifier("g")).toBe(0.001);
    expect(backendGetCostModifier("ml")).toBe(0.001);
    expect(backendGetCostModifier("cl")).toBe(0.01);
    expect(backendGetCostModifier("mg")).toBe(0.000001);
    expect(backendGetCostModifier("kg")).toBe(1);
    expect(backendGetCostModifier(undefined)).toBe(1);
    expect(backendGetCostModifier("  KG ")).toBe(1);
  });
});

describe("calculatePricePerRef", () => {
  it("même unité → pas de conversion", () => {
    expect(calculatePricePerRef(10, "kg", "kg")).toBe(10);
  });

  it("prix par kg → prix par g", () => {
    // 10 €/kg, on vend en g → 0.01 €/g
    expect(calculatePricePerRef(10, "kg", "g")).toBeCloseTo(0.01);
  });

  it("prix par g → prix par kg", () => {
    expect(calculatePricePerRef(0.01, "g", "kg")).toBeCloseTo(10);
  });
});

describe("getOllamaHost", () => {
  it("url complète → host", () => {
    expect(getOllamaHost({ ollama_url: "http://192.168.1.5:11434/api/generate" }))
      .toBe("http://192.168.1.5:11434");
  });

  it("défaut localhost si absent", () => {
    expect(getOllamaHost({})).toBe("http://localhost:11434");
    expect(getOllamaHost(null)).toBe("http://localhost:11434");
  });
});
