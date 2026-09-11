// Diagnostique d'une page blanche : la CSP bloque-t-elle le rendu en dev ?
// Compare DEV (middlewares Vite) et PRODUCTION (dist servi par express.static).
// Usage : node scripts/diag-page.mjs <port> [prod]
import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.argv[2] || 3995);
const ENV_PROD = process.argv[3] === "prod";
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "test", "tmp-diag-page");

fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath,
  [path.join(ROOT, "node_modules", ".bin", "tsx"), "server.ts"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA,
         ...(ENV_PROD ? { NODE_ENV: "production" } : {}) },
  stdio: "pipe",
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  try { const r = await fetch(BASE + "/api/settings"); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 400));
}

const browser = await chromium.launch();
const page = await browser.newPage();
const erreurs = [];
page.on("console", (m) => { if (m.type() === "error") erreurs.push("CONSOLE: " + m.text()); });
page.on("pageerror", (e) => erreurs.push("PAGEERROR: " + e.message));

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const etat = await page.evaluate(() => ({
  boutons: Array.from(document.querySelectorAll("button")).length,
  premierBouton: (Array.from(document.querySelectorAll("button"))[0]?.textContent || "").trim(),
  csp: (document.querySelector("meta[http-equiv]") || {}).content || "(pas de meta)",
}));

console.log("=== mode:", ENV_PROD ? "PRODUCTION (dist)" : "DEV (vite middleware)");
console.log("=== etat:", JSON.stringify(etat, null, 1));
console.log("=== erreurs (" + erreurs.length + ") ===");
for (const e of erreurs.slice(0, 8)) console.log("  " + e.slice(0, 200));

await browser.close();
server.kill("SIGTERM");
fs.rmSync(DATA, { recursive: true, force: true });
process.exit(0);
