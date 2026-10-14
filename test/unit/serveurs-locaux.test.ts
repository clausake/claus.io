import { describe, it, expect } from "vitest";
import {
  detecterServeursLocaux, etatMoteurLocal, modelesDeLaReponse,
  MESSAGE_AUCUN_MOTEUR, PORTS_USAGE,
  type FetchModeles,
} from "../../src/shared/fournisseur/index.js";

// Tache 8 : le moteur de recherche de l'IA locale. Le reseau n'est JAMAIS
// touche ici — la voie est INJECTEE (la regle du transport injecte, tache 4).
// Les verdicts sont ecrits d'avance ; chaque faux serveur est un stub dont le
// comportement est decide a l'avance.

type Rep = { status: number; json(): Promise<unknown> };

function fauxFetch(table: Record<string, (() => Promise<Rep>) | "MOURIR">): FetchModeles {
  return async (url: string) => {
    const cle = Object.keys(table).find((k) => url.endsWith(k));
    const entree = cle !== undefined ? table[cle] : "MOURIR";
    if (entree === "MOURIR") throw new Error("ECONNREFUSED");
    return entree();
  };
}

const ok = (corps: unknown): (() => Promise<Rep>) =>
  async () => ({ status: 200, json: async () => corps });

describe("detecterServeursLocaux (Tache 8)", () => {
  it("les ports d'usage sont ceux du contrat (11434, 8080, 1234, 8000=vLLM)", () => {
    // tri NUMERIQUE: .sort() sans comparateur trie en chaines et "11434"
    // passe avant "1234" (faute mesuree a l'ecriture de ce test).
    // Chantier 11 : vLLM (port 8000) rejoint la detection auto.
    expect(PORTS_USAGE.map((p) => p.port).sort((a, b) => a - b)).toEqual([1234, 8000, 8080, 11434]);
  });

  it("un serveur vivant est TROUVE avec ses modeles", async () => {
    const s = await detecterServeursLocaux(fauxFetch({
      ":11434/v1/models": ok({ data: [{ id: "qwen3:8b" }, { id: "llama3.2" }] }),
    }));
    expect(s).toHaveLength(1);
    expect(s[0].moteur).toBe("ollama");
    expect(s[0].modeles.map((m) => m.nom)).toEqual(["qwen3:8b", "llama3.2"]);
    expect(s[0].urlBase).toBe("http://127.0.0.1:11434");
  });

  it("un 404 est un serveur VIVANT a inventaire non public (etat licite)", async () => {
    const s = await detecterServeursLocaux(fauxFetch({
      ":8080/v1/models": async () => ({ status: 404, json: async () => ({}) }),
    }));
    expect(s).toHaveLength(1);
    expect(s[0].moteur).toBe("llamacpp");
    expect(s[0].modeles).toEqual([]);
  });

  it("port refuse, corps pourri, 500 : AUCUN serveur (et aucune erreur levee)", async () => {
    const s = await detecterServeursLocaux(fauxFetch({
      ":11434/v1/models": "MOURIR",
      ":8080/v1/models": async () => ({
        status: 200, json: async () => { throw new SyntaxError("pas du JSON"); },
      }),
      ":1234/v1/models": async () => ({ status: 500, json: async () => ({}) }),
    }));
    expect(s).toEqual([]);
  });

  it("deux serveurs trouves sont rendus dans l'ordre des ports d'usage", async () => {
    const s = await detecterServeursLocaux(fauxFetch({
      ":1234/v1/models": ok({ models: ["mistral-7b"] }),
      ":11434/v1/models": ok({ data: [{ model: "phi3" }] }),
    }));
    expect(s.map((x) => x.port)).toEqual([11434, 1234]);
    expect(s[1].modeles.map((m) => m.nom)).toEqual(["mistral-7b"]);
  });
});

describe("modelesDeLaReponse (la forme lue sans rien presumer)", () => {
  it("data[].id, data[].model, models[] de chaines, et le vide licite", () => {
    expect(modelesDeLaReponse({ data: [{ id: "a" }] }).map((m) => m.nom)).toEqual(["a"]);
    expect(modelesDeLaReponse({ data: [{ model: "b" }] }).map((m) => m.nom)).toEqual(["b"]);
    expect(modelesDeLaReponse({ models: ["c", "d"] }).map((m) => m.nom)).toEqual(["c", "d"]);
    expect(modelesDeLaReponse({})).toEqual([]);
    expect(modelesDeLaReponse(null)).toEqual([]);
    expect(modelesDeLaReponse({ data: [{ id: "  " }, { id: 42 }, null] })).toEqual([]);
  });
});

describe("etatMoteurLocal (jamais un tableau muet, tache 8 point 4)", () => {
  it("rien trouve -> le message AUCUN_MOTEUR_TROUVE, nommant les trois voies", async () => {
    const { serveurs, message } = await etatMoteurLocal(fauxFetch({}));
    expect(serveurs).toEqual([]);
    expect(message).toBe(MESSAGE_AUCUN_MOTEUR);
    expect(message).toContain("llama.cpp");
    expect(message).toContain("Ollama");
    expect(message).toContain("ligne");
    expect(message).toContain("11434");
  });

  it("un trouve -> les serveurs, message nul", async () => {
    const { serveurs, message } = await etatMoteurLocal(fauxFetch({
      ":11434/v1/models": ok({ data: [{ id: "qwen3:8b" }] }),
    }));
    expect(serveurs).toHaveLength(1);
    expect(message).toBeNull();
  });
});
