// Chantier 42 — LE CLIC UI « SAUVEGARDER » TELECHARGE UN ZIP REEL.
//
// L'ancien code de la route (SettingsView.tsx) faisait :
//     const res = await fetch("/api/backup", { method: "POST" });
//     const data = await res.json();
// alors que la route repond `application/zip`. Mesure de l'audit : « le
// bouton ne telecharge pas l'archive et part en erreur de parsing, meme
// quand le serveur repond 200 ».
//
// Ce spec juge le CHEMIN COMPLET, dans un vrai navigateur :
//   1. le clic « Sauvegarder » declenche un TELECHARGEMENT de fichier ;
//   2. le fichier telecharge est une archive ZIP, ouverte, dont la base
//      contient le marqueur ecrit juste avant ;
//   3. sur une reponse EN ERREUR, AUCUN message de succes n'apparait.
//
// Le harness est celui de reception-view.spec.ts : serveur a port ephemere
// (mode developpement, donc le frontend Vite est servi), session du maitre
// posee dans le navigateur, entree dans l'app par le helper partage.

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import { entrerDansAppSansNavigation } from "./entrer-dans-app";
import { lireZip } from "../banc/zip-lire";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-export-ui");
let server: ChildProcess;

const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

test.describe.configure({ mode: "serial" });

test("le bouton Sauvegarder telecharge un ZIP reel ; sur erreur, aucun succes", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // L'assistant de premier demarrage tient l'ecran tant que le demarrage n'est
  // pas consigne : on consigne par le MEME chemin que le produit ecrit.
  fs.writeFileSync(
    path.join(DATA_DIR, "settings.json"),
    JSON.stringify({
      install_termine_le: new Date().toISOString(),
      fournisseur_choisi: "ollama",
    }),
  );
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error(
      "dist/ absent : lancer `npm run build` avant cette suite (meme contrat que reception-view.spec.ts)",
    );
  }

  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  const instance = `export-ui-${PORT}`;
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: instance,
      // ⚠ NODE_ENV=production est OBLIGATOIRE pour un test qui juge le
      // RENDU : en dev, les middlewares Vite montent et la page reste BLANCHE
      // sous Chromium (la CSP bloque le script inline du react-refresh).
      // Mesure consignee dans reception-view.spec.ts.
      NODE_ENV: "production",
      COOKDRIVE_RATELIMIT_OFF: "1",
    },
    stdio: "pipe",
  });
  server.stdout?.on("data", () => undefined);
  server.stderr?.on("data", () => undefined);

  const deadline = Date.now() + 60_000;
  let pret = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok && res.headers.get("x-cookdrive-instance") === instance) {
        pret = true;
        break;
      }
    } catch {
      /* pas encore pret */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(pret, "le serveur de test n'a pas demarre").toBe(true);

  try {
    // --- Session du maitre (l'export est reserve au maitre) -------------
    const setup = await fetch(`${BASE}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "maitre-ui", password: "passe-ui-2026" }),
    });
    expect([201, 409]).toContain(setup.status);
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "maitre-ui", password: "passe-ui-2026" }),
    });
    expect(login.status).toBe(200);
    const cookie = (login.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0])[0];
    expect(cookie, "le cookie de session est pose").toBeTruthy();

    // --- Le marqueur : ecrit AVANT le clic ------------------------------
    const marqueur = `audit-ui-marker-${Date.now().toString(36)}`;
    const marque = await fetch(`${BASE}/api/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: marqueur,
        quantity: 5,
        minStock: 1,
        unit: "kg",
        category: "Test",
      }),
    });
    expect([200, 201]).toContain(marque.status);

    // --- Le navigateur, avec la session du maitre -----------------------
    await context.addCookies([
      { name: "cd_session", value: cookie.split("=")[1], domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await entrerDansAppSansNavigation(page);
    await page.waitForTimeout(1_000);

    // Reglages : le menu profil porte le bouton « Reglages ».
    // Le declencheur du menu profil est un DIV (pas un bouton) : il porte
    // l'icone utilisateur dans `.profile-container`.
    const profil = page.locator(".profile-container > div").first();
    await expect(profil, "le declencheur du menu profil est absent du header").toBeVisible({
      timeout: 20_000,
    });
    await profil.click({ timeout: 8_000 });
    await page.waitForTimeout(800);
    const reglages = page.getByRole("button", { name: /param[èe]tres|r[ée]glages|settings/i }).first();
    await expect(reglages, "le bouton Reglages est absent du menu profil").toBeVisible({
      timeout: 20_000,
    });
    await reglages.click({ timeout: 8_000 });
    await page.waitForTimeout(1_200);

    // --- Le clic « Sauvegarder » : un TELECHARGEMENT doit partir --------
    const bouton = page.getByRole("button", { name: /sauvegard|backup/i }).first();
    await expect(bouton, "le bouton Sauvegarder est absent des Reglages").toBeVisible({
      timeout: 20_000,
    });
    const [telechargement] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      bouton.click({ timeout: 10_000 }),
    ]);
    expect(telechargement.suggestedFilename()).toContain(".zip");

    // --- Le fichier telecharge est un ZIP REEL, avec la base ------------
    const chemin = path.join(DATA_DIR, "telechargement.zip");
    await telechargement.saveAs(chemin);
    const archive = lireZip(fs.readFileSync(chemin));
    console.log("ENTREES DU TELECHARGEMENT :", JSON.stringify(archive.noms));
    expect(archive.noms, "la base doit etre dans le ZIP telecharge").toContain(
      "agent_culinaire.db",
    );
    const baseExtraite = path.join(DATA_DIR, "base-ui.zip");
    fs.writeFileSync(baseExtraite, archive.contenu("agent_culinaire.db"));
    // Le marqueur est dans la base du ZIP : on le cherche OCTET PAR OCTET
    // dans le fichier extrait (la base est un fichier, pas une archive).
    const octets = fs.readFileSync(baseExtraite);
    expect(
      octets.includes(Buffer.from(marqueur)),
      `le marqueur « ${marqueur} » doit etre dans la base du ZIP telecharge`,
    ).toBe(true);

    // --- Sur une ERREUR : aucun message de succes -----------------------
    // On coupe la route pour que le serveur reponde 500 : le bouton doit
    // afficher une erreur, jamais « sauvegarde telechargee ».
    await page.route("**/api/backup", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "BACKUP_ECHEC" }),
      }),
    );
    const bouton2 = page.getByRole("button", { name: /sauvegard|backup/i }).first();
    // On COMPTE les messages de succes AVANT : le toast du premier clic est
    // encore affiche (il dure quelques secondes), et son absence ferait
    // croire que le second clic a reussi.
    const avant = await page.evaluate(
      () => (document.body?.textContent ?? "").toLowerCase().split("sauvegarde t").length - 1,
    );
    await bouton2.click({ timeout: 10_000 });
    await page.waitForTimeout(2_500);
    const apres = await page.evaluate(
      () => (document.body?.textContent ?? "").toLowerCase().split("sauvegarde t").length - 1,
    );
    expect(
      apres,
      "aucun NOUVEAU message de succes ne doit apparaitre sur une reponse en erreur",
    ).toBe(avant);
    const corps = await page.evaluate(() => (document.body?.textContent ?? "").toLowerCase());
    expect(
      corps,
      "le message d'erreur doit apparaitre",
    ).toMatch(/erreur de synchronisation|erreur|échec|echec|impossible/);
  } finally {
    try {
      if (server.pid) process.kill(-server.pid, "SIGKILL");
    } catch {
      try {
        server.kill("SIGKILL");
      } catch {
        /* deja mort */
      }
    }
  }
});
