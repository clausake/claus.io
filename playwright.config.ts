// Configuration de la suite e2e.
// Le serveur est demarre par le spec lui-meme (beforeAll).
//
// Les trois reglages de preuve ci-dessous ne sont pas du confort : un job e2e
// rouge sans artifact est AVEUGLE. Verifie par sonde (un test volontairement
// faux) : sans eux, seul error-context.md survit et rien de visuel ; avec eux,
// un echec laisse une capture, une trace rejouable et un rapport. Ils ne
// s'appliquent qu'aux fixtures qui lancent un navigateur (page/browser/context) :
// la suite historique, qui na utilise que "request", ne paie rien.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 90_000,
  // Un seul worker : les specs demarrent chacun LEUR serveur sur un port fixe.
  workers: 1,
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3999",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
