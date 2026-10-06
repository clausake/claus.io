// Sonde UI auth : l'ecran de connexion se rend reellement sous Chromium
// (production), le setup cree le compte maitre, la garde ramene au login
// apres logout — preuve par la page, pas par l'API seule.
// ⚠ COOKDRIVE_AUTH_OFF NE DOIT PAS ETRE POSE pour ce spec (il juge la garde).
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-sonde-ui-auth");

// Revoque toutes les sessions directement dans la base (pas de CLI sqlite3
// dans le conteneur) — equivaut a une revocation serveur des sessions.
async function effacerSessions() {
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"),
    driver: sqlite3.Database,
  });
  await db.run("PRAGMA busy_timeout = 8000");
  await db.run("DELETE FROM sessions");
  await db.close();
}

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

async function portLibre(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as any).port;
      srv.close(() => resolve(p));
    });
  });
}

async function attendrePortLibre(port: number, maxMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const libre = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => {
        srv.close(() => resolve(true));
      });
    });
    if (libre) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// L'assistant de premier demarrage tient l'ecran tant que le demarrage n'est
// pas consigne : on consigne AVANT le boot, par le MEME chemin que le produit
// (settings.json), sinon l'ecran d'auth n'est jamais atteint (piege consigne
// par reception-view.spec.ts).
function consignerDemarrage() {
  fs.writeFileSync(
    path.join(DATA_DIR, "settings.json"),
    JSON.stringify({ install_termine_le: new Date().toISOString(), fournisseur_choisi: "ollama" }),
  );
}

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  consignerDemarrage();
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("dist/ absent : lancer `npm run build` avant cette suite");
  }
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  serveurFini = new Promise<void>((resolve) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        USER_DATA_PATH: DATA_DIR,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });
    server.on("exit", () => resolve());
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stderr.write(d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/auth/etat`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("le serveur de test n'a pas demarre");
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  if (PORT) await attendrePortLibre(PORT);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("ecran de connexion : setup -> logout -> login -> session revoquee", async ({ page }) => {
  // --- A. la landing se rend puis on entre : l'assistant de demarrage est
  // deja consigne (settings.json ecrit avant le boot) => l'ecran de PREMIER
  // DEMARRAGE doit prendre la main sous Chromium (production) --------------
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Acc[ée]der/i }).click();
  await expect(page.getByText("Premier demarrage")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[name="username"]')).toBeVisible();

  // --- B. le setup cree le compte maitre et entre dans l'app ---------------
  await page.locator('input[name="username"]').fill("chef");
  await page.locator('input[name="password"]').fill("MotDePasse!42");
  await page.locator('input[name="confirmation"]').fill("MotDePasse!42");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("text=RESTAURATION IO").first()).toBeVisible({ timeout: 30_000 });

  // --- C. deconnexion via le menu profil (avatar -> "Deconnexion") ----------
  await page.locator(".profile-container > div").first().click();
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page.getByText("Connexion")).toBeVisible({ timeout: 15_000 });

  // --- D. reconnexion valide ------------------------------------------------
  await page.locator('input[name="username"]').fill("chef");
  await page.locator('input[name="password"]').fill("MotDePasse!42");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("text=RESTAURATION IO").first()).toBeVisible({ timeout: 30_000 });

  // --- E. session revoquee -> mutation 401 -> la garde ramene au login ------
  expect(page.locator('input[name="username"]'), "le login est rendu").toBeVisible();
  await effacerSessions();
  // Une mutation 401 leve cd-auth-expiree : AuthGate doit ramener au login.
  await page.evaluate(() =>
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}),
  );
  await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 15_000 });
});
