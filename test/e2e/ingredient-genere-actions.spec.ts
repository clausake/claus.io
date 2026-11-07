// Porte C38-A : un ingredient NE d'UNE fiche IA (categorie « Ingrédient
// généré », la VOIE reelle mesuree dans src/routes/recipes.ts:187 —
// l'insertion d'un ingredient inconnu du stock porte cette categorie) est
// editable COMME les autres : les trois actions (crayon, poubelle, caddie)
// sont rendues pour SA ligne, et le crayon OUVRE le formulaire d'edition.
//
// Pourquoi ce spec existe : le maitre d'ouvrage rapporte le 06/11 « les
// ingredients generes ne sont pas editables comme les autres ». Avant cette
// porte, AUCUN test ne jugeait le rendu du groupe de categorie genere, donc
// le doute restait entier entre un defaut de rendu et un bundle perime.
//
// Contrat harnais : identique a ui-tabs.spec.ts (port libre, NODE_ENV=production,
// COOKDRIVE_AUTH_OFF=1, semis reals, on entre par la landing).

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import { entrerDansAppSansNavigation } from "./entrer-dans-app";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-ingredient-genere");
let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

const portLibre = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "settings.json"),
    JSON.stringify({ install_termine_le: new Date().toISOString(),
                    fournisseur_choisi: "ollama" }));
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("dist/ absent : lancer `npm run build` avant cette suite");
  }
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  serveurFini = new Promise<void>((res) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COOKDRIVE_AUTH_OFF: "1",
        COOKDRIVE_RATELIMIT_OFF: "1",
        PORT: String(PORT),
        USER_DATA_PATH: DATA_DIR,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });
    server.on("exit", () => res());
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  // Semer : DEUX ingredients generes (la categorie porte par recipes.ts) et
  // UN article normal (la reference « comme les autres »).
  for (const corps of [
    { name: "Filet de Canard (test genere)", quantity: 0, minStock: 5,
      unit: "g", category: "Ingr\xE9dient g\xE9n\xE9r\xE9" },
    { name: "Quantit\xE9 de sel marin (test genere)", quantity: 0, minStock: 5,
      unit: "g", category: "Ingr\xE9dient g\xE9n\xE9r\xE9" },
    { name: "Botte de carottes (test normal)", quantity: 4, minStock: 2,
      unit: "kg", category: "Legumes" },
  ]) {
    const r = await fetch(`${BASE}/api/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (!r.ok) throw new Error(`semis refuse : ${r.status} pour ${corps.name}`);
  }
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test.setTimeout(150_000);

test.describe("C38 — Ingredient genere editable comme les autres", () => {
  // Le chemin utilisateur : entrer, ouvrir Inventaire, filtrer l'onglet
  // « Ingrédient généré » (le filtre categoriel du composant), lire la ligne.
  test("les actions (crayon/poubelle/caddie) rendent pour le groupe genere", async ({ page }) => {
    await page.goto(BASE + "/");
    await entrerDansAppSansNavigation(page);
    await page.waitForTimeout(1_200);

    // ouvrir Inventaire
    await page.getByRole("button", { name: /inventaire/i }).first().click();
    await page.waitForTimeout(800);

    // filtrer sur le groupe genere (la categorie apres le semis)
    const ongletGenere = page.getByRole("button", {
      name: /ingr[ée]dient g[ée]n[ée]r[ée]/i,
    });
    await expect(ongletGenere).toBeVisible();
    await ongletGenere.first().click();
    await page.waitForTimeout(500);

    // la ligne semee est RENDUE dans ce groupe et porte les TROIS actions
    const ligneGenere = page.locator("tr", { hasText: "Filet de Canard (test genere)" });
    await expect(ligneGenere).toBeVisible();
    const actions = ligneGenere.getByRole("button");
    expect(await actions.count(), "trois actions pour la ligne generee").toBe(3);

    // le crayon (premiere action) OUVRIT le formulaire d'edition : le champ
    // nom est PREFILLE = le chemin complet crayon -> form -> edition marche.
    await actions.first().click();
    const champNom = page.locator("form input[type=text]").first();
    await expect(champNom).toBeVisible();
    await expect(champNom).toHaveValue(/Filet de Canard/);
  });

  test("la ligne d'une categorie NORMALE porte aussi trois actions (reference)", async ({ page }) => {
    await page.goto(BASE + "/");
    await entrerDansAppSansNavigation(page);
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: /inventaire/i }).first().click();
    await page.waitForTimeout(800);
    const ligneNormale = page.locator("tr", { hasText: "Botte de carottes (test normal)" });
    await expect(ligneNormale).toBeVisible();
    expect(await ligneNormale.getByRole("button").count(), "trois actions pour la ligne normale").toBe(3);
  });
});
