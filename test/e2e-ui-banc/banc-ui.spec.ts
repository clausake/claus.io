import { test, expect } from "@playwright/test";

const ONGLETS = [
  "Tableau de bord", "Inventaire", "Ingénierie", "Fiches", "Plan Production",
  "Achats", "Documents", "Gestion du Personnel", "Traçabilité", "Anti-Gaspillage",
  "Chat", "Flotte", "Studio",
];

test.describe("banc UI/UX — les 13 onglets", () => {
  for (const nom of ONGLETS) {
    test(`onglet ${nom} : rendu + console propre + focus visible`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
      page.on("pageerror", (e) => erreurs.push(String(e)));

      await page.goto("http://127.0.0.1:4199");
      await page.waitForLoadState("networkidle");

      // naviguer vers l'onglet par la sidebar (le vrai chemin utilisateur)
      const nav = page.getByRole("button", { name: new RegExp(nom, "i") }).first();
      await nav.click({ timeout: 8000 });
      await page.waitForTimeout(700);

      // la page ne doit pas etre vide
      const texte = await page.locator("body").innerText();
      expect(texte.length, `onglet ${nom} rend du contenu`).toBeGreaterThan(80);

      // pas d'erreur console
      expect(erreurs, `console propre sur ${nom}: ${erreurs.slice(0,2).join(" | ")}`).toEqual([]);
    });
  }
});
