// Sonde brute de la voie UI POST /api/inventory/bulk (InventoryAudit.tsx CSV import).
// L UI poste { items } au route. Trancher: le route existe-t-il? rc=404 = route absente (le UI affiche une erreur et AUCUNE ligne n entre).
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-inventory-bulk");
const TOKEN = "inventory-bulk";

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = await portLibre();
const BASE = `http://127.0.0.1:${PORT}`;
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const server = spawn(process.execPath, [tsxBin, "server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
  stdio: "pipe",
});
server.on("error", () => process.exit(9));

const deadline = Date.now() + 45000;
let pret = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
    if (r.ok) { console.log("INSTANCE ETRANGERE sur le port:", r.headers.get("x-cookdrive-instance")); process.exit(9); }
  } catch { /* pas encore */ }
  await new Promise((r2) => setTimeout(r2, 300));
}
if (!pret) { console.log("SERVEUR PAS PRET sur", BASE); process.exit(9); }

const r = await fetch(`${BASE}/api/inventory/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ name: "Sonde Bulk", quantity: 2, minStock: 1, unit: "kg", category: "Sec", unit_price: 1.5, yield_percent: 100 }] }) });
console.log("POST /api/inventory/bulk ->", r.status);
const j = await r.json().catch(() => null);
console.log("corps:", JSON.stringify(j));
console.log("\nSONDE JOUEE (rc=0 = elle s est jouee; les verdicts sont ci-dessus).");
server.kill();
process.exit(0);
