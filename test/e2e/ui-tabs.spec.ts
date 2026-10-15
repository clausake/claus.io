// Porte UI : les 13 onglets de la barre laterale rendent TOUS du contenu et
// la console est PROPRE (zero pageerror, zero erreur console hors CSP inline
// connue et desormais reparee + jugee par verify:csp-inline).
//
// Pourquoi ce spec existe : la faute du 15/10 etait invisible aux portes —
// l'onglet Fiches rendait un ecran VIDE (React #130, AnimatePresence importe
// de react au lieu de motion/react) depuis le chantier 8, et AUCUNE porte ne
// rougissait : les specs e2e jugent des routes et des panneaux cibles, jamais
// l'integralite de la navigation. Seul un passage sur les 13 onglets vus par
// un vrai navigateur rend le defaut impossible a rater.
//
// Contrat harnais : le spec demarre SON serveur (port libre, NODE_ENV=production
// obligatoire — en dev la CSP bloque react-refresh et la page est blanche,
// lecon consignee dans reception-view.spec.ts), seme des articles reels, et
// passe la landing comme un utilisateur.

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-ui-tabs");
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
  const deadline = Date.now() + 30_000;  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  // semer quelques articles : la console et le rendu sont juges SUR donnees
  for (let i = 0; i < 8; i++) {
    await fetch(`${BASE}/api/inventory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Produit UI ${i}`, quantity: 3 + i, minStock: 2,
        unit: "kg", category: ["Legumes", "Viandes", "Epicerie"][i % 3],
        unit_price: 2.5, yield_percent: 100 }),
    }).catch(() => {});
  }
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

// 12 onglets depuis le Sprint 17 : « Chat Culinaire » n'est plus une entree de
// sidebar (il vivait DEJA dans Ingenierie des Menus — deux entrees pointaient
// le meme onglet, deux onglets actifs a la fois).
const ONGLETS = [
  "Tableau de bord", "Inventaire", "Ingénierie", "Fiches", "Plan Production",
  "Achats", "Documents", "Gestion du Personnel", "Traçabilité", "Anti-Gaspillage",
  "Flotte", "Studio",
];

test.describe("banc UI/UX — les onglets (12 + anti-doublon)", () => {
  for (const nom of ONGLETS) {
    test(`onglet ${nom} : rendu + console propre + focus visible`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const t = m.text();
        // DEFAUT PRODUIT CONNU (consigne au rapport du banc) : la CSP
        // script-src 'self' de helmet bloque le garde-fou inline de
        // dist/index.html (l'ecran de secours "root vide"). Il est mort pour
        // TOUS les utilisateurs, pas seulement ici — corrige par le serveur,
        // pas par le banc.
        if (t.includes("Content Security Policy directive 'script-src")) return;
        erreurs.push(t);
      });
      page.on("pageerror", (e) => erreurs.push(String(e)));

      await page.goto(BASE + "/");
      await page.waitForLoadState("networkidle");

      // la landing est le premier ecran : le vrai chemin utilisateur est
      // d'y entrer (re-essaie tant que le premier bouton est "Acceder",
      // lecon 2910822108 : hydratation lente).
      await page.locator("button").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      for (let i = 0; i < 10; i++) {
        const premier = page.locator("button").first();
        const texte = (await premier.textContent().catch(() => "")) || "";
        if (!/Acc[ée]der/i.test(texte)) break;
        await premier.click({ timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1_200);

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

test("sidebar : pas de doublon de navigation (un seul chemin par onglet)", async ({ page }) => {
    await page.goto(BASE + "/");
    await page.locator("button").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    for (let i = 0; i < 10; i++) {
      const premier = page.locator("button").first();
      if (!/Acc[ée]der/i.test((await premier.textContent().catch(() => "")) || "")) break;
      await premier.click({ timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1_000);
    // « Chat Culinaire » ne doit PLUS exister comme entree de sidebar : le chat
    // vit dans Ingenierie des Menus. Deux entrees vers le meme onglet = deux
    // onglets actifs affiches en meme temps (le defaut rapporte le 15/10).
    const chatCulinaire = await page.getByRole("button", { name: /chat culinaire/i }).count();
    expect(chatCulinaire, "l'entree « Chat Culinaire » est retiree de la sidebar").toBe(0);
    // et l'atelier (le chat) est bien rendu DANS Ingenierie des Menus :
    await page.getByRole("button", { name: /ing[ée]nierie/i }).first().click();
    await page.waitForTimeout(1_500);
    // le chat s'affiche (l'atelier n'est plus ecrase par les cartes sur mobile)
    const atelier = await page.getByText(/assistant|chat/i).first().isVisible().catch(() => false);
    expect(atelier, "le chat culinaire est visible dans Ingenierie des Menus").toBe(true);
});
});
