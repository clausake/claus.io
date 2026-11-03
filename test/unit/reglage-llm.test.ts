import { describe, it, expect } from "vitest";
import {
  cibleDuReglage, argvDeCible, parseSortieSonde, DEFAUT_OLLAMA, baseNue,
} from "../../src/shared/fournisseur/index.js";

// Tache 9 : le reglage LLM visible. Ces fonctions pures sont ce que le
// panneau « Intelligence » ecrit et lit ; la route /api/llm/tester ne fait
// que jouer la VRAIE sonde sur la cible construite ici.
// Les valeurs de `llm_choix` sont CELLES du contrat (ReglageFournisseur,
// tache 1) : llamacpp | ollama | openai | mistral | anthropic | cohere | deepseek.

describe("cibleDuReglage (le reglage lu, la cible de la sonde)", () => {
  it("ollama sans URL prend le port d'usage", () => {
    expect(cibleDuReglage({ llm_choix: "ollama" })).toEqual({
      cible: { nom: "reglage", style: "ollama", base: DEFAUT_OLLAMA, modele: null },
    });
  });

  it("llamacpp SANS URL est un defaut nomme, jamais une URL vide", () => {
    expect(cibleDuReglage({ llm_choix: "llamacpp" })).toEqual({ defaut: "URL_ABSENTE" });
    expect(cibleDuReglage({ llm_choix: "llamacpp", llm_url: "http://hote:8080" }))
      .toEqual({ cible: { nom: "reglage", style: "openai", base: "http://hote:8080", modele: null } });
  });

  // Plan 014 / P1 — defaut mesure le 02/11 sur le poste Windows du maitre :
  // un reglage « http://hote:11434/api/generate » etait utilise comme base,
  // le client rajoutait /api/generate -> chemin double -> 404.
  it("baseNue retire les suffixes d'endpoint, en boucle", () => {
    expect(baseNue("http://localhost:11434/api/generate")).toBe("http://localhost:11434");
    expect(baseNue("http://localhost:11434/api/generate/")).toBe("http://localhost:11434");
    expect(baseNue("http://localhost:11434/api/chat")).toBe("http://localhost:11434");
    expect(baseNue("http://hote:8080/v1/chat/completions")).toBe("http://hote:8080");
    expect(baseNue("http://hote:8080/v1/")).toBe("http://hote:8080");
    expect(baseNue("http://hote:11434/api")).toBe("http://hote:11434");
    expect(baseNue("http://hote:11434///")).toBe("http://hote:11434");
    // base nue -> inchangee ; chaine vide -> chaine vide
    expect(baseNue("http://localhost:11434")).toBe("http://localhost:11434");
    expect(baseNue("")).toBe("");
    // R1 : un prefixe sous-chemin (proxy) n'est JAMAIS retire
    expect(baseNue("https://proxy.exemple/ollama")).toBe("https://proxy.exemple/ollama");
  });

  it("un reglage ollama porte l'endpoint est normalise a la lecture", () => {
    expect(cibleDuReglage({ llm_choix: "ollama", llm_url: "http://localhost:11434/api/generate" }))
      .toEqual({ cible: { nom: "reglage", style: "ollama", base: "http://localhost:11434", modele: null } });
    expect(cibleDuReglage({ llm_choix: "ollama", llm_url: "http://192.168.1.8:11434/api/generate/" }))
      .toEqual({ cible: { nom: "reglage", style: "ollama", base: "http://192.168.1.8:11434", modele: null } });
    // A6 : une URL reduite a un suffixe ne laisse JAMAIS une base vide
    // (une base vide ne peut pas etre sondee) -> on retombe sur la base d'usage.
    expect(cibleDuReglage({ llm_choix: "ollama", llm_url: "/v1" }))
      .toEqual({ cible: { nom: "reglage", style: "ollama", base: DEFAUT_OLLAMA, modele: null } });
    expect(cibleDuReglage({ llm_choix: "ollama", llm_url: "/api" }))
      .toEqual({ cible: { nom: "reglage", style: "ollama", base: DEFAUT_OLLAMA, modele: null } });
  });

  it("un reglage llamacpp porte l'endpoint est normalise idem, et URL_ABSENTE survit", () => {
    expect(cibleDuReglage({ llm_choix: "llamacpp", llm_url: "http://hote:8080/v1/chat/completions" }))
      .toEqual({ cible: { nom: "reglage", style: "openai", base: "http://hote:8080", modele: null } });
    // une URL composee uniquement de suffixes s'efface -> defaut nomme, pas une base vide
    expect(cibleDuReglage({ llm_choix: "llamacpp", llm_url: "/v1" })).toEqual({ defaut: "URL_ABSENTE" });
  });

  it("un fournisseur en ligne se nomme, il ne s'invente pas", () => {
    expect(cibleDuReglage({ llm_choix: "mistral" })).toEqual({
      cible: { nom: "reglage", style: "openai", base: "https://api.mistral.ai", modele: null },
    });
    expect(cibleDuReglage({ llm_choix: "mistral.ai" }))
      .toMatchObject({ cible: { base: "https://api.mistral.ai" } });
    // L'URL de traverse est refusee NOMMEEMENT (la decision du 25/09).
    expect(cibleDuReglage({ llm_choix: "mistral", llm_url: "https://api.evil.com" }))
      .toEqual({ defaut: "URL_HORS_LISTE" });
    // La meme base que la liste, barre finale ou non, CONFIRME.
    expect(cibleDuReglage({ llm_choix: "mistral", llm_url: "https://api.mistral.ai/" }))
      .toMatchObject({ cible: { base: "https://api.mistral.ai" } });
  });

  it("vide et hors liste sont des defauts nommes, jamais des cibles", () => {
    expect(cibleDuReglage({ llm_choix: "groq" })).toEqual({ defaut: "HORS_LISTE_BLANCHE" });
    expect(cibleDuReglage({})).toEqual({ defaut: "CHOIX_ABSENT" });
    expect(cibleDuReglage({ llm_choix: "  " })).toEqual({ defaut: "CHOIX_ABSENT" });
    expect(cibleDuReglage({ llm_choix: "openai.evil.com" }))
      .toEqual({ defaut: "HORS_LISTE_BLANCHE" });
  });

  it("argvDeCible porte le modele quand il existe (le format de la sonde)", () => {
    expect(argvDeCible({ nom: "r", style: "ollama", base: "http://h:11434", modele: null }))
      .toEqual(["--cible=r|ollama|http://h:11434"]);
    expect(argvDeCible({ nom: "r", style: "openai", base: "http://h:1", modele: "qwen" }))
      .toEqual(["--cible=r|openai|http://h:1|qwen"]);
  });
});

describe("parseSortieSonde (le verdict du bouton Tester)", () => {
  it("une cible verte, un seul verdict vivant", () => {
    const v = parseSortieSonde(
      "SONDE VERT cible=reglage vivant=OUI modeles=2 modele=qwen3:8b duree_ms=412\n"
      + "SONDE_FOURNISSEUR: VERT (rouges=0/1)");
    expect(v.vivant).toBe(true);
    expect(v.cibles).toHaveLength(1);
    expect(v.cibles[0].modele).toBe("qwen3:8b");
    expect(v.cibles[0].duree_ms).toBe(412);
  });

  it("une cible rouge nomme son defaut et le verdict est rouge", () => {
    const v = parseSortieSonde("SONDE ROUGE cible=reglage vivant=NON defaut=MODELES_ABSENTS duree_ms=7");
    expect(v.vivant).toBe(false);
    expect(v.cibles[0].defaut).toBe("MODELES_ABSENTS");
  });

  it("sonde MUETTE = verdict rouge (une sonde qui ne rend rien n'est pas verte)", () => {
    expect(parseSortieSonde("").vivant).toBe(false);
    expect(parseSortieSonde("n'importe quoi").vivant).toBe(false);
  });

  it("deux cibles, une rouge : le verdict est rouge", () => {
    const v = parseSortieSonde("SONDE VERT cible=a vivant=OUI\nSONDE ROUGE cible=b vivant=NON defaut=CLEF_ABSENTE");
    expect(v.vivant).toBe(false);
    expect(v.cibles.map((c) => c.vivant)).toEqual([true, false]);
  });
});
