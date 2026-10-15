// Porte : la voie « sans IA » du premier démarrage (15/10).
//
// Pourquoi ce spec existe : le contrat produit dit « l'application est
// complète en saisie manuelle » — l'IA n'est jamais un prérequis. Avant ce
// spec, la seule voie de sortie de l'assistant exigeait une épreuve OCR
// réussie : une machine sans moteur d'IA restait bloquée à l'écran 3, en
// contradiction avec le contrat. Le bouton « Continuer sans IA » saute
// l'épreuve (il n'y a rien à juger sans moteur) et consigne `llm_choix=sans`.
//
// Ce qui est jugé :
//   A. le bouton « Continuer sans IA » existe sur l'écran du moteur
//   B. le cliquer mène à un écran de confirmation (pas d'épreuve demandée)
//   C. « Terminer le démarrage » est ARMÉ sans épreuve (il ne l'était pas)
//   D. après le clic : /api/assistant/etat rend install_termine_le + fournisseur
//      "sans" (la consignation s'est écrite)
//
// Contrat harnais : serveur propre (port libre, production), compte créé par
// le spec (l'assistant vient APRES l'identite — défaut 15/10 réparé).

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-sans-ia");
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
        COOKDRIVE_AUTH_OFF: "0", // la session est partie du parcours
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
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const passerLandingEtIdentite = async (page: import("@playwright/test").Page) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.locator("button").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  // la landing se reaffiche a chaque reload : re-essayer tant que le premier
  // bouton est celui d'entree (lecon 2910822108).
  for (let i = 0; i < 10; i++) {
    const premier = page.locator("button").first();
    if (!/Acc[ée]der/i.test((await premier.textContent().catch(() => "")) || "")) break;
    await premier.click({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  // identite : creation du compte maître (l'assistant vient APRES — defaut
  // 15/10 repare : la consignation est un POST, la gate exige une session).
  // l'ecran porte TROIS champs (nom, mot de passe, confirmation).
  await page.locator("input").first().fill("chefbanc");
  await page.locator("input[type='password']").first().fill("MotDePasseSûr123");
  await page.locator("input[type='password']").nth(1).fill("MotDePasseSûr123");
  await page.getByRole("button", { name: /cr[ée]er le compte|cr[ée]er|valider/i }).first().click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
};

test("voie « sans IA » : consignation sans épreuve, l'app s'ouvre", async ({ page }) => {

  await passerLandingEtIdentite(page);

  // A. le bouton « Continuer sans IA » existe sur l'écran du moteur
  const boutonSans = page.getByRole("button", { name: /continuer sans ia/i }).first();
  await boutonSans.waitFor({ state: "visible", timeout: 20_000 });
  await boutonSans.click();

  // B. l'écran suivant ne demande PAS d'épreuve (pas de bouton « Lire la facture »)
  await page.waitForTimeout(600);
  expect(await page.getByRole("button", { name: /lire la facture/i }).count(),
         "la voie « sans IA » ne doit pas demander l'épreuve de lecture").toBe(0);

  // C. « Terminer le démarrage » est ARMÉ (pas disabled) sans épreuve
  const terminer = page.getByRole("button", { name: /terminer le d[ée]marrage/i }).first();
  await terminer.waitFor({ state: "visible", timeout: 10_000 });
  await expect(terminer).toBeEnabled();

  // D. le clic consigne : /api/assistant/etat porte fournisseur "sans"
  await terminer.click();
  // la consignation + le re-render : on attend que l'assistant DISPARAISSE
  // (l'ecran 'Bienvenue' ne doit plus etre la), 15 s max.
  for (let i = 0; i < 60; i++) {
    if ((await page.getByText(/Bienvenue dans claus\.io/i).count()) === 0) break;
    await page.waitForTimeout(250);
  }
  const etat = await (await fetch(`${BASE}/api/assistant/etat`)).json();
  expect(etat.install_termine_le, "le démarrage est consigné").toBeTruthy();
  expect(etat.fournisseur_choisi, "le fournisseur consigné est 'sans'").toBe("sans");

  // et l'app s'ouvre : la sidebar est rendue (le banc des 13 onglets la juge).
  // L'assistant appelle onTermine -> setAssistantRequis(false) : React rend
  // l'app DANS le meme arbre, sans reload — la sidebar apparait sous la session
  // qui existe. Un court delai d'hydratation est tolere (lecon CI 2910822108).
  let vu = false;
  for (let i = 0; i < 40 && !vu; i++) {
    vu = (await page.getByRole("button", { name: /tableau de bord/i }).count()) > 0;
    if (!vu) await page.waitForTimeout(250);
  }
  if (!vu) {
    const etat = await page.evaluate(() => ({
      corps: (document.body?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 260),
      boutons: Array.from(document.querySelectorAll("button")).slice(0, 10)
        .map((b) => (b.textContent || "").trim()).filter(Boolean),
    }));
    expect(false, "sidebar absente — etat de la page: " + JSON.stringify(etat)).toBe(true);
  }
  expect(vu, "la sidebar (Tableau de bord) est rendue apres la consignation").toBe(true);
});
