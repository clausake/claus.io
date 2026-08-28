import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3999",
  },
  // Le serveur est démarré par le spec lui-même (beforeAll).
  workers: 1,
});
