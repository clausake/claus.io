import { describe, it, expect } from "vitest";
import { getModel } from "../../src/shared/ollama.js";

describe("getModel", () => {
  it("utilise custom_model si model_name=custom", () => {
    expect(getModel({ model_name: "custom", custom_model: "gemma-12b" })).toBe("gemma-12b");
  });

  it("utilise model_name sinon", () => {
    expect(getModel({ model_name: "llama3.2-vision" })).toBe("llama3.2-vision");  });

  it("défaut si settings vides/absents", () => {
    // C2 : le defaut est le modele installe sur le poste (gemma4, mesure 015).
    expect(getModel({})).toBe("gemma4:e4b-it-qat");
    expect(getModel(undefined)).toBe("gemma4:e4b-it-qat");
  });
});
