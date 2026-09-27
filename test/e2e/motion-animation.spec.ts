// Harnais de non-regression visuelle du passage a `m` + `LazyMotion`.
//
// Le risque de cette migration n'est pas la taille du bundle mais le defaut
// SILENCIEUX : un composant rendu avec `m` sans features chargees ne fait rien,
// et un element dont l'etat initial est `opacity: 0` reste FIGE a 0 pour toujours.
// L'utilisateur voit un ecran partiellement vide et le build reste vert : aucun
// test de bundle, ni `tsc`, ne peut voir ca. Seul un navigateur reel le voit.
//
// Ce harnais demarre le `dist` en prod (NODE_ENV=production, la seule branche qui
// sert le vrai bundle) et verifie deux choses :
//   1. le chunk des features Motion est reellement demande (preuve que le
//      chargement a la demande fonctionne et qu'il n'est pas reste dans l'entree) ;
//   2. un element anime par `m` avec initial opacity:0 atteint bien opacity:1.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(process.cwd(), "test", "tmp-motion");
let server: any;

test.beforeAll(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });
  // L'assistant de premier demarrage (Tache 10) tient l'ecran tant que le
  // demarrage n'est pas consigne : meme piege que la landing, consigne ici
  // par le MEME chemin que le produit ecrit (settings.json du serveur de test).
  fs.writeFileSync(path.join(DATA, "settings.json"),
    JSON.stringify({ install_termine_le: new Date().toISOString(),
                    fournisseur_choisi: "ollama" }));
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("dist/ absent : lancer `npm run build` avant cette suite");
  }
  server = spawn(
    process.execPath,
    [path.join(process.cwd(), "node_modules", ".bin", "tsx"), "server.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "production" },
      stdio: "pipe",
    },
  );
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/settings`);
      if (r.ok) return;
    } catch {
      /* pas encore en ecoute */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("serveur prod pas pret sur " + BASE);
}, 60_000);

test.afterAll(() => server?.kill("SIGTERM"));

const chargees = async (page: any) => {
  const vus: string[] = [];
  page.on("request", (req: any) => {
    const u = req.url() as string;
    if (/assets\/[\w.-]+\.js$/.test(u)) vus.push(u.split("/").pop());
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  return vus;
};

test("motion: les features sont chargees a la demande et pas dans le bundle d'entree", async ({ page }) => {
  const chunks = await chargees(page);
  const entree = chunks.find((c) => /^index-/.test(c)) ?? "";
  expect(entree).not.toBe("");
  // L'enveloppe legere (m + LazyMotion) doit etre la ; les features (domAnimation)
  // arrivent dans un chunk ASYNCHRONE distinct. Si Rollup les hoistait dans
  // `index-*`, la reduction de poids serait annulee sans rien casser de visible.
  const hasVendorMotion = chunks.some((c) => /vendor-motion|motion/.test(c) && c !== entree);
  expect(hasVendorMotion, `chunks charges : ${chunks.join(", ")}`).toBe(true);
});

test("motion: un element `m` avec initial opacity:0 atteint opacity:1 (pas fige)", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // La landing occupe l'ecran tant qu'on n'est pas entre ; la barre laterale
  // (contenant l'element anime `initial={{ opacity: 0, x: -10 }}`) n'est pas rendue
  // avant, donc on entre d'abord comme un utilisateur.
  // Le libelle vient de la trad `accessKitchen` ("Accéder à la Cuisine") : on
  // cible le premier bouton du conteneur d'action plutot qu'un libelle dur, qui
  // casserait a la prochaine traduction.
  const entrer = page.locator("button").first();
  if (await entrer.count()) await entrer.click({ timeout: 8_000 }).catch(() => {});
  // Les features se chargent en asynchrone apres le premier rendu : on laisse le
  // cycle se terminer, puis on verifie l'OPACITE REELLE et non la presence du DOM.
  await page.waitForTimeout(1_200);

  const mesure = await page.evaluate(() => {
    const cible = Array.from(document.querySelectorAll("body *")).find(
      (e) => (e.textContent ?? "").trim() === "CLAUS",
    );
    if (!cible) return { absent: true as const };
    // `cible` est un <span> : le noeud anime est son parent (le <m.div> qui porte
    // initial/animate). On rapporte les deux pour qu'un echec soit lisible.
    const own = getComputedStyle(cible).opacity;
    const parent = cible.parentElement;
    return {
      absent: false as const,
      own,
      parent: parent ? getComputedStyle(parent).opacity : null,
      tag: parent ? parent.tagName : null,
    };
  });
  expect(mesure.absent, "marque CLAUS absente du DOM apres entree").toBe(false);
  if (!mesure.absent) {
    expect(
      Number(mesure.parent),
      `element anime fige a opacity ${mesure.parent} : les features Motion ne se sont pas chargees (bug silencieux de la migration vers 'm')`,
    ).toBeCloseTo(1, 0.05);
    expect(Number(mesure.own)).toBeCloseTo(1, 0.05);
  }
});
