// Sonde brute des VOIES de lecture DASHBOARD (GET /api/dashboard/cost-data + GET
// /api/dashboard/stock-data) sur les VOIES que l'UI ENVOIE REELLEMENT (DashboardOverview
// fetch cost-data?start=&end= + stock-data), relevees dans le code (et non des payloads
// inventes par la sonde).
//
// Ce que la sonde doit trancher (et non ce que je suppose):
//   D1 cost-data SANS parametres (la voie par defaut) sur une base SANS facture ni
//      planning : la route rend-elle une SEMAINE FACTICE (Lun 4200 ... Dim) qui ne
//      vient d AUCUNE donnee? (famille Sprint 10: « mode qui ment sur ses donnees »).
//   D2 cost-data avec une facture au JOUR (voie UI: DocumentManager) : le cout
//      journalier est-il le chiffre des donnees reelles, ou le fallback?
//   D3 cost-data avec planning ISO (voie UI: StaffPlanning) : le labor journalier
//      est-il le chiffre des donnees reelles?
//   D4 stock-data sur une base SANS article : rend-elle [] (l UI gere isEmpty) ou
//      des couleurs sur des valeurs nulles?
//   D5 stock-data avec articles: la SOMME par categorie rend-elle la somme des
//      lignes, et la couleur est-elle presente?
//
// Lancement: node scripts/probe-dashboard-voices.mjs
// rc=0 = elle s est jouee; les verdicts sont ci-dessus (juge par le spec de contrat
// test/e2e/dashboard-contract.spec.ts quand il existe).
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-dashboard");
const TOKEN = "dashboard-voices";

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
  await new Promise((r) => setTimeout(r, 400));
}
if (!pret) { console.log("SERVEUR PAS PRET"); process.exit(9); }

const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const hier = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const avantHier = () => { const d = new Date(Date.now() - 2*864e5); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// --- D1 : la voie par defaut sur une base VIDE -----------------------------
{
  const r = await fetch(`${BASE}/api/dashboard/cost-data`);
  const c = await r.json().catch(() => null);
  console.log(`\n### D1 cost-data sans parametres, base sans facture ni planning`);
  console.log(`    status_http=${r.status}`);
  console.log(`    corps=${JSON.stringify(c).slice(0, 300)}`);
  console.log(`    TRANCHER: des lignes avec cout>0 ou labor>0 qui ne viennent d AUCUNE donnee = SEMAINE FACTICE.`);
}

// --- D2 : cost-data avec une facture au JOUR (voie UI: DocumentManager) -----
// La facture: POST /api/documents, payload document manager (items sans inventory_id -> proposition libre).
{
  const rDoc = await fetch(`${BASE}/api/documents`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "FACTURE", supplier: "Sonde Sup", date: aujourdhui(), total_amount: 123.45, source_image_url: "", items: [{ inventory_id: "", original_name: "Sonde Art", quantity: 5, unit_price: 24.69 }] }),
  });
  const cDoc = await rDoc.json().catch(() => null);
  console.log(`\n### D2 facture au jour poste par la voie UI`);
  console.log(`    status_http=${rDoc.status} corps=${JSON.stringify(cDoc).slice(0, 200)}`);
  const r2 = await fetch(`${BASE}/api/dashboard/cost-data?start=${avantHier()}&end=${aujourdhui()}`);
  const c2 = await r2.json().catch(() => null);
  console.log(`\n### D2b cost-data fenetre 3 jours`);
  console.log(`    status_http=${r2.status}`);
  console.log(`    corps=${JSON.stringify(c2).slice(0, 400)}`);
  console.log(`    TRANCHER: le jour du facture a cout=123.45? les autres jours cout=0 et labor=0?`);
}

// --- D3 : cost-data avec planning ISO (voie UI: StaffPlanning) -------------
// La voie UI POST /api/staff envoie schedule keyed par ISO date et datesObj; hourrate numeric.
{
  const dateS = aujourdhui();
  const rStaff = await fetch(`${BASE}/api/staff`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sonde Chef", role: "Chef", hourlyRate: 20, schedule: { [dateS]: [{ start: "09:00", end: "11:00" }] }, datesObj: { [dateS]: dateS } }),
  });
  const cStaff = await rStaff.json().catch(() => null);
  console.log(`\n### D3 staff avec planning ISO (voie UI)`);
  console.log(`    status_http=${rStaff.status} corps=${JSON.stringify(cStaff).slice(0, 120)}`);
  const r3 = await fetch(`${BASE}/api/dashboard/cost-data?start=${dateS}&end=${dateS}`);
  const c3 = await r3.json().catch(() => null);
  console.log(`\n### D3b cost-data fenetre 1 jour`);
  console.log(`    corps=${JSON.stringify(c3).slice(0, 300)}`);
  console.log(`    TRANCHER: labor=40 (2h*20)? cout=123.45?`);
}

// --- D4 : stock-data sur base SANS article --------------------------------
{
  const r = await fetch(`${BASE}/api/dashboard/stock-data`);
  const c = await r.json().catch(() => null);
  console.log(`\n### D4 stock-data sans article`);
  console.log(`    status_http=${r.status}`);
  console.log(`    corps=${JSON.stringify(c).slice(0, 200)}`);
  console.log(`    TRANCHER: [] ou des couleurs sur des valeurs nulles?`);
}

// --- D5 : stock-data avec articles (voie UI: InventoryAudit ajoute articles) ---
{
  const rInv1 = await fetch(`${BASE}/api/inventory`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sonde Legume", quantity: 3, unit: "kg", category: "Legumes", minStock: 1, unit_price: 2.5 }),
  });
  const cInv1 = await rInv1.json().catch(() => null);
  console.log(`\n### D5 inventory[0] poste par la voie UI`);
  console.log(`    status_http=${rInv1.status} corps=${JSON.stringify(cInv1).slice(0, 160)}`);
  const rInv2 = await fetch(`${BASE}/api/inventory`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sonde Viande", quantity: 2, unit: "kg", category: "Viandes", minStock: 1, unit_price: 10 }),
  });
  const cInv2 = await rInv2.json().catch(() => null);
  console.log(`    inventory[1] status_http=${rInv2.status} corps=${JSON.stringify(cInv2).slice(0, 160)}`);
  const r5 = await fetch(`${BASE}/api/dashboard/stock-data`);
  const c5 = await r5.json().catch(() => null);
  console.log(`\n### D5b stock-data avec articles`);
  console.log(`    corps=${JSON.stringify(c5).slice(0, 300)}`);
  console.log(`    TRANCHER: value=7.5 (3*2.5) pour Legumes + 20 (2*10) pour Viandes? couleur presente?`);
}

server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s est jouee; les verdicts sont ci-dessus).");
