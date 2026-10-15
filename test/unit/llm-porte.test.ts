// Le juge unitaire de la porte unique de génération (chantier 11).
//
// LA RÈGLE DU TRANSPORT INJECTÉ (tâche 4, rappelée par reglage-llm.ts) : un
// test unitaire ne doit JAMAIS dépendre du réseau. Ici on n'injecte même pas
// un transport : `generer()` lit ollamaSettingsRef et dispatch — on juge le
// dispatch en jouant de FAUX SERVEURS (fetch mocké) et en mutant le réglage.
//
// Ce que ce juge prouve (mesuré, jamais supposé) :
//   1. ollama par défaut : llm_choix absent = Ollama joué (pas une supposition)
//   2. llamacpp sans URL = URL_ABSENTE (nommé, pas un crash)
//   3. llamacpp avec URL = /v1/chat/completions REÇU (le serveur voit le POST)
//   4. vLLM accepté comme choix (le contrat élargi du chantier 11)
//   5. cloud hors liste = HORS_LISTE_BLANCHE (la liste reste la liste)
//   6. cloud sans clef ENV = CLEF_ABSENTE (la clef ne vit QUE dans l'env)
//   7. cloud avec clef = la clef part en header Bearer, la base est VERROUILLÉE
//      (une URL saisie différente de la blanche ne remplace pas la liste)
//   8. réponse muette = erreur nommée (jamais un texte vide rendu)
//   9. vision : l'image part en multi-parties OpenAI-compatible
//  10. morsure : changer llm_choix CHANGE le serveur appelé (le réglage est
//      effectif — le défaut que le chantier 11 corrigeait)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generer, reglageActuel, type ReglageLlmActuel } from "../../src/shared/llm.js";
import { ollamaSettingsRef } from "../../src/shared/ollama.js";

// Le faux fetch : chaque URL jouée est consignée (le serveur « voit » le POST).
type ReponseFaux = { status: number; body: unknown };
const urlsJouees: string[] = [];
const headersVus: Record<string, string>[] = [];
const corpsVus: unknown[] = [];
let reponse: ReponseFaux | "MOURIR" = "MOURIR";

function monterFauxServeur(r: ReponseFaux | "MOURIR") {
  reponse = r;
}

vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
  urlsJouees.push(String(url));
  headersVus.push((init?.headers ?? {}) as Record<string, string>);
  corpsVus.push(init?.body ? JSON.parse(init.body as string) : null);
  if (reponse === "MOURIR") throw new Error("refus (faux serveur éteint)");
  return {
    ok: reponse.status >= 200 && reponse.status < 300,
    status: reponse.status,
    json: async () => reponse.body,
  } as Response;
}));

function poserReglage(r: ReglageLlmActuel) {
  ollamaSettingsRef.current = r as typeof ollamaSettingsRef.current;
}

const REPO = { choices: [{ message: { content: "OK12" } }] };

describe("generer() — la porte unique de génération (chantier 11)", () => {
  beforeEach(() => {
    urlsJouees.length = 0;
    headersVus.length = 0;
    corpsVus.length = 0;
    reponse = "MOURIR";
  });

  afterEach(() => {
    poserReglage({}); // jamais de fuite de réglage entre tests
    vi.unstubAllEnvs();
  });

  it("1. llm_choix ABSENT = Ollama par défaut (le réglage n'est pas obligatoire)", async () => {
    poserReglage({ model_name: "llama3.2-vision" });
    // Le client Ollama réel tentera 127.0.0.1:11434 (injoignable en test) :
    // on juge le NOM de l'erreur, qui cite ollama — la porte a bien DISPATCHÉ.
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/ollama/);
  });

  it("2. llamacpp SANS URL = URL_ABSENTE (nommé, jamais un appel à l'URL vide)", async () => {
    poserReglage({ llm_choix: "llamacpp" });
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/URL_ABSENTE/);
    expect(urlsJouees).toHaveLength(0); // rien n'a été appelé nulle part
  });

  it("2 bis. voie « sans IA » = IA_DESACTIVEE (choix du premier démarrage — l'app est complète en saisie manuelle)", async () => {
    poserReglage({ llm_choix: "sans" });
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/IA_DESACTIVEE/);
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/sans IA/);
    expect(urlsJouees).toHaveLength(0); // rien n'a été appelé nulle part
  });

  it("3. llamacpp AVEC URL = POST /v1/chat/completions reçu par le serveur", async () => {
    poserReglage({ llm_choix: "llamacpp", llm_url: "http://127.0.0.1:8080", llm_modele: "mistral-7b" });
    monterFauxServeur({ status: 200, body: REPO });
    const rep = await generer({ prompt: "salut", format: "json", temperature: 0.1 });
    expect(rep.texte).toBe("OK12");
    expect(rep.source).toContain("llamacpp");
    expect(urlsJouees).toEqual(["http://127.0.0.1:8080/v1/chat/completions"]);
    const corps = corpsVus[0] as { model: string; messages: unknown[] };
    expect(corps.model).toBe("mistral-7b");
    expect(corps.messages.length).toBeGreaterThanOrEqual(1);
  });

  it("4. vLLM est un choix LICITE (le contrat élargi du chantier 11)", async () => {
    poserReglage({ llm_choix: "vllm", llm_url: "http://127.0.0.1:8000", llm_modele: "qwen3-8b" });
    monterFauxServeur({ status: 200, body: REPO });
    const rep = await generer({ prompt: "salut" });
    expect(urlsJouees).toEqual(["http://127.0.0.1:8000/v1/chat/completions"]);
    expect(rep.source).toContain("vllm");
  });

  it("5. cloud HORS liste blanche = HORS_LISTE_BLANCHE (la liste reste la liste)", async () => {
    poserReglage({ llm_choix: "evil-cloud", llm_url: "https://evil.example.com" });
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/HORS_LISTE_BLANCHE/);
    expect(urlsJouees).toHaveLength(0); // rien n'a fui vers l'URL hors liste
  });

  it("6. cloud de la liste SANS clef ENV = CLEF_ABSENTE (la clef ne vit que dans l'env)", async () => {
    poserReglage({ llm_choix: "openai" });
    // Aucune OPENAI_API_KEY dans l'environnement du test.
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/CLEF_ABSENTE/);
    expect(urlsJouees).toHaveLength(0);
  });

  it("7. cloud AVEC clef : header Bearer + base VERROUILLÉE par la liste blanche", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "clef-de-test");
    poserReglage({ llm_choix: "mistral", llm_url: "https://api.mistral.ai" });
    monterFauxServeur({ status: 200, body: REPO });
    const rep = await generer({ prompt: "salut" });
    expect(rep.source).toBe("Mistral");
    expect(urlsJouees).toEqual(["https://api.mistral.ai/v1/chat/completions"]);
    expect(headersVus[0].authorization).toBe("Bearer clef-de-test");
  });

  it("7b. l'URL saisie ne peut PAS remplacer la base blanche (anti evil-proxy)", async () => {
    // La règle du 25/09 : l'URL saisie ne peut que CONFIRMER la base. La porte
    // generer() ne lit JAMAIS llm_url pour un fournisseur cloud — le POST part
    // sur la base de la liste, même si on tente une autre URL.
    vi.stubEnv("MISTRAL_API_KEY", "clef-de-test");
    poserReglage({ llm_choix: "mistral", llm_url: "https://evil.example.com" });
    monterFauxServeur({ status: 200, body: REPO });
    await generer({ prompt: "salut" });
    expect(urlsJouees).toEqual(["https://api.mistral.ai/v1/chat/completions"]);
  });

  it("8. réponse MUETTE = erreur nommée (jamais un texte vide rendu)", async () => {
    poserReglage({ llm_choix: "llamacpp", llm_url: "http://127.0.0.1:8080" });
    monterFauxServeur({ status: 200, body: { choices: [{ message: { content: "   " } }] } });
    await expect(generer({ prompt: "salut" })).rejects.toThrow(/muette/);
  });

  it("9. vision : l'image part en multi-parties OpenAI-compatible", async () => {
    poserReglage({ llm_choix: "vllm", llm_url: "http://127.0.0.1:8000" });
    monterFauxServeur({ status: 200, body: REPO });
    await generer({ prompt: "décris", image: "aGVsbG8=" });
    const corps = corpsVus[0] as { messages: Array<{ content: unknown }> };
    const contenu = corps.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(Array.isArray(contenu)).toBe(true);
    expect(contenu[1].type).toBe("image_url");
    expect(contenu[1].image_url?.url).toContain("base64,aGVsbG8=");
  });

  it("10. MORSURE : changer llm_choix CHANGE le serveur appelé (le réglage est effectif)", async () => {
    // LE défaut que le chantier 11 corrigeait : avant, changer le réglage ne
    // changeait rien à la génération. Ce test rougit si ça revient.
    monterFauxServeur({ status: 200, body: REPO });
    poserReglage({ llm_choix: "vllm", llm_url: "http://127.0.0.1:8000" });
    await generer({ prompt: "salut" });
    expect(urlsJouees[0]).toContain(":8000");
    urlsJouees.length = 0;
    poserReglage({ llm_choix: "llamacpp", llm_url: "http://127.0.0.1:8080" });
    await generer({ prompt: "salut" });
    expect(urlsJouees[0]).toContain(":8080");
    // Deux réglages différents, deux serveurs appelés : le réglage COMMANDE.
  });

  it("11. reglageActuel() rend le réglage vivant (jamais undefined)", () => {
    poserReglage({ llm_choix: "vllm" });
    expect(reglageActuel().llm_choix).toBe("vllm");
    poserReglage({});
    expect(reglageActuel().llm_choix).toBeUndefined(); // forme du réglage vide = défaut géré par generer()
  });
});
