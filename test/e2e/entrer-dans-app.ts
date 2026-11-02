// Helper partage d'entree dans l'app : il franchit la landing (« Accéder à la
// Cuisine ») puis ATTESTE que la barre laterale est visible.
//
// Pourquoi ce fichier existe (plan-correction-qwen-2026-11-02.md, E1) : la
// boucle d'entree que les specs e2e copiaient- collisionnait avec le budget du
// test. Mesure du 02/11 sur l'arbre 51daab1, lot `run-all-gates.py` =>
// GATES=98 ROUGES=2 (verify:ui-tabs, verify:reception), mais les memes specs
// seuls rendaient 13 passed (46.1s) et 1 passed (6.0s). Le defaut n'etait pas
// dans le produit : c'etait `10 clics x click({timeout: 8_000}).catch(()=>{})`.
// Sous charge, l'hydratation depasse 8 s, chaque clic rend un Timeout que le
// .catch avale, et 10 x 8 s = 80 s partent en clics avalés. Le test meurt alors
// sur `Test timeout of 90000ms exceeded` en accusant la sidebar d'etre absente.
//
// Ce que change ce helper :
//   1. la condition de sortie est « la sidebar est visible », pas « 10
//      iterations faites » — un clic avale n'est plus confondu avec un clic reussi ;
//   2. le budget est une donnee nommee (budgetMs) et l'echec rend l'etat REEL de
//      la page (URL + libelles des boutons), jamais un `Timeout` nu.
//
// Le chemin juge reste celui de l'utilisateur : on clique le bouton d'entree, on
// ne saute PAS la landing (aucun hack d'etat React, aucune exclusion de test).
import { Page } from "@playwright/test";

export async function entrerDansApp(page: Page, budgetMs = 60_000): Promise<void> {
  await page.goto(page.url().replace(/\/$/, "") + "/", { waitUntil: "domcontentloaded" });
  // La sidebar est la preuve qu'on est ENTRE : elle n'est pas rendue avant
  // l'entree (piege deja consigne par le harnais Motion et reception-view.spec.ts).
  const nav = page.getByRole("button", { name: /Tableau de bord/i }).first();
  // Le premier bouton de la landing est celui d'entree ; on le cible par son
  // libelle et non par sa position, pour ne pas casser a la prochaine traduction.
  const entree = page.getByRole("button", { name: /Acc[ée]der/i }).first();
  const fin = Date.now() + budgetMs;
  while (Date.now() < fin) {
    if (await nav.isVisible().catch(() => false)) return;       // entré
    if (await entree.isVisible().catch(() => false)) {
      // noWaitAfter + timeout court : un clic qui ne rend pas dans 4 s n'avale
      // plus le budget, on boucle et on re-essaie jusqu'a la fin du budget.
      await entree.click({ timeout: 4_000, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  const etat = await page.evaluate(() => ({
    url: location.href,
    boutons: Array.from(document.querySelectorAll("button")).slice(0, 25)
      .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean),
  }));
  throw new Error("landing non passee en " + budgetMs + " ms — etat reel: " + JSON.stringify(etat));
}

// Variante pour les specs qui montent EUX-MEMES leur serveur sur un port
// ephemere : `page.url()` vaut encore "about:blank" au premier appel, donc le
// helper ci-dessus ne peut pas en deduire la base. On lui passe la base explicitement.
export async function entrerDansAppDepuis(page: Page, base: string, budgetMs = 60_000): Promise<void> {
  await page.goto(base.replace(/\/$/, "") + "/", { waitUntil: "domcontentloaded" });
  await entrerDansAppSansNavigation(page, budgetMs);
}

// Le corps du helper, sans le goto : pour les specs qui ont deja navigue (ou qui
// doivent re-naviguer eux-memes, comme le second passage de reception-view.spec.ts).
export async function entrerDansAppSansNavigation(page: Page, budgetMs = 60_000): Promise<void> {
  const nav = page.getByRole("button", { name: /Tableau de bord/i }).first();
  const entree = page.getByRole("button", { name: /Acc[ée]der/i }).first();
  const fin = Date.now() + budgetMs;
  while (Date.now() < fin) {
    if (await nav.isVisible().catch(() => false)) return;       // entré
    if (await entree.isVisible().catch(() => false)) {
      await entree.click({ timeout: 4_000, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  const etat = await page.evaluate(() => ({
    url: location.href,
    boutons: Array.from(document.querySelectorAll("button")).slice(0, 25)
      .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean),
  }));
  throw new Error("landing non passee en " + budgetMs + " ms — etat reel: " + JSON.stringify(etat));
}
