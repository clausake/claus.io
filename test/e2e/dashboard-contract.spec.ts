// Contrat des deux routes de LECTURE DASHBOARD (GET /api/dashboard/cost-data +
// GET /api/dashboard/stock-data) — Sprint 13.
//
// Les faits juges ici viennent de la sonde brute scripts/probe-dashboard-voices.mjs
// (instance isolee, voie UI), pas de la lecture du code:
//   D1 cost-data SANS parametres sur une base sans facture ni planning rendait une
//      SEMAINE FACTICE (Lun 4200, Mar 3800, ... Dim 3100) qui ne venait d aucune
//      donnee: c est la famille de Sprint 10 (« un mode qui ment sur ses donnees »).
//   D2/D3 les voies REELLES (facture via POST /api/documents, planning via POST
//      /api/staff avec dates ISO) rendent le chiffre des donnees relues.
//   D4 stock-data sans article rend [] (l UI de DashboardOverview gere isEmpty).
//   D5 stock-data avec articles rend la SOMME par categorie + la couleur.
//
// Comme partout dans ce depot, un PASS qui ne peut pas devenir FAIL n est pas
// une mesure. Chaque regle est donc doublee: DELTA (poster par la MEME route que
// l UI, exiger le mouvement EXACT relu en base) puis RETIRER (exiger le retour a
// la ligne de base) quand la voie permet de le faire.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-dashboard");
const INSTANCE_TOKEN = "dashboard-contract";

let server: ChildProcess;

// Port alloue par l OS + attente de sa liberation reelle (meme contrat que
// purchasing-chain.spec.ts). Un port fige se fait voler par le petit-fils tsx
// qu un run precedent n a pas tue (SIGTERM tue le wrapper, pas l enfant).
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

function isoJour(decal: number): string {
  const d = new Date(Date.now() - decal * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  PORT = await portLibre();
  await attendrePortLibre(PORT);
  BASE = `http://127.0.0.1:${PORT}`;
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    // ⚠ le jeton doit etre DEDANS l objet env: pose apres l accolade fermante
    // c est un champ d options IGNORE par le fils (voir PHASES.md, 7.6).
    env: {
      ...process.env,
          COOKDRIVE_AUTH_OFF: "1",
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN,
    },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stdout.write(d));
  const deadline = Date.now() + 45000;
  let pret = false;
  let perimee = false;
  let vu: string | null = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/settings`);
      const jeton = r.headers.get("x-cookdrive-instance");
      if (r.ok && jeton === INSTANCE_TOKEN) { pret = true; break; }
      if (r.ok && jeton && jeton !== INSTANCE_TOKEN) { perimee = true; vu = jeton; break; }
    } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (perimee) {
    throw new Error(
      `INSTANCE PERIMEE sur le port ${PORT}: jeton ${vu} (attendu ${INSTANCE_TOKEN}). ` +
      `Un server.ts orphelin d un autre run tenait le port et la porte jugeait QUI REPONDAIT.`,
    );
  }
  if (!pret) throw new Error(`SERVEUR PAS PRET sur ${BASE}`);
}, 60000);

test.afterAll(() => {
  server?.kill("SIGTERM");
});

// --- T1: la voie par defaut sur une base SANS donnee ne rend PAS une semaine
// factice: chaque jour du creneau porte cout=0 et labor=0, et les BORNES du
// creneau sont incluses (start et end sont dans le corps).
test("D1 GET /api/dashboard/cost-data sans parametres: fenetre REELLE (8 jours inclusifs), zeros", async ({ request }) => {
  const res = await request.get(`${BASE}/api/dashboard/cost-data`);
  expect(res.status()).toBe(200);
  const corps = await res.json();
  expect(Array.isArray(corps)).toBe(true);
  expect(corps.length).toBe(8); // inclusif des deux bornes: aujourdhui - 7 .. aujourdhui = 8 jours
  for (const ligne of corps) {
    expect(typeof ligne.cout).toBe("number");
    expect(typeof ligne.labor).toBe("number");
    expect(ligne.cout).toBe(0);
    expect(ligne.labor).toBe(0);
    expect(typeof ligne.date).toBe("string");
    expect(ligne.date.length).toBe(10);
  }
  const auj = isoJour(0);
  const moins7 = isoJour(7);
  expect(corps.some((l: any) => l.date === auj)).toBe(true);
  expect(corps.some((l: any) => l.date === moins7)).toBe(true);
});

// --- T2: la voie REELLE (facture poste par DocumentManager) rend le chiffre des
// donnees relues, pas un nombre invente. La facture SURVIT au creneau: la ligne
// hors du creneau est EXCLUE du corps (le contrat DELTA du creneau).
test("D2 GET /api/dashboard/cost-data avec facture: cout EXACT du jour, hors creneau EXCLU", async ({ request }) => {
  const auj = isoJour(0);
  const avant = isoJour(2);
  const horsCreneau = isoJour(6);
  const post = await request.post(`${BASE}/api/documents`, {
    data: {
      type: "FACTURE",
      supplier: "Sonde Sup",
      date: auj,
      total_amount: 123.45,
      source_image_url: "",
      items: [{ inventory_id: "", original_name: "Sonde Art", quantity: 5, unit_price: 24.69 }],
    },
  });
  expect(post.status()).toBe(200);
  const corpsDoc = await post.json();
  expect(corpsDoc.id).toBeTruthy();
  const post2 = await request.post(`${BASE}/api/documents`, {
    data: {
      type: "FACTURE",
      supplier: "Sonde Sup 2",
      date: horsCreneau,
      total_amount: 77.7,
      source_image_url: "",
      items: [{ inventory_id: "", original_name: "Sonde Art 2", quantity: 3, unit_price: 25.9 }],
    },
  });
  expect(post2.status()).toBe(200);
  const res = await request.get(`${BASE}/api/dashboard/cost-data?start=${avant}&end=${auj}`);
  expect(res.status()).toBe(200);
  const corps = await res.json();
  expect(Array.isArray(corps)).toBe(true);
  expect(corps.length).toBe(3);
  const aujRow = corps.find((l: any) => l.date === auj);
  expect(aujRow.cout).toBe(123.45);
  expect(aujRow.labor).toBe(0);
  const autre = corps.find((l: any) => l.date !== auj);
  expect(autre.cout).toBe(0);
  expect(autre.labor).toBe(0);
});

// --- T3: la voie REELLE (planning poste par StaffPlanning avec dates ISO) rend le
// labor exact (2h * 20). Un planning keyed par nom de jour ne DOIT pas jouer dans
// cette fenetre (la route filtre date = dateStr).
test("D3 GET /api/dashboard/cost-data avec planning ISO: labor EXACT", async ({ request }) => {
  const auj = isoJour(0);
  const staff = await request.post(`${BASE}/api/staff`, {
    data: {
      name: "Sonde Chef",
      role: "Chef",
      hourlyRate: 20,
      schedule: { [auj]: [{ start: "09:00", end: "11:00" }] },
      datesObj: { [auj]: auj },
    },
  });
  expect(staff.status()).toBe(200);
  const res = await request.get(`${BASE}/api/dashboard/cost-data?start=${auj}&end=${auj}`);
  expect(res.status()).toBe(200);
  const corps = await res.json();
  expect(Array.isArray(corps)).toBe(true);
  expect(corps.length).toBe(1);
  expect(corps[0].date).toBe(auj);
  expect(corps[0].labor).toBe(40);
});

// --- T4: stock-data sans article rend [] (l UI gere isEmpty); une couleur sur
// une valeur nulle est un PASS creux: la route ne rend PAS de ligne pour un
// groupe dont la somme est 0.
test("D4 GET /api/dashboard/stock-data sans article: corps vide", async ({ request }) => {
  const res = await request.get(`${BASE}/api/dashboard/stock-data`);
  expect(res.status()).toBe(200);
  const corps = await res.json();
  expect(Array.isArray(corps)).toBe(true);
  expect(corps.length).toBe(0);
});

// --- T5: stock-data avec articles rend la SOMME par categorie + la couleur.
// Les articles sont postes par la MEME voie que l UI (InventoryAudit).
test("D5 GET /api/dashboard/stock-data avec articles: somme par categorie + couleur", async ({ request }) => {
  const inv1 = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Sonde Legume", quantity: 3, unit: "kg", category: "Legumes", minStock: 1, unit_price: 2.5 },
  });
  expect(inv1.status()).toBe(200);
  const inv2 = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Sonde Viande", quantity: 2, unit: "kg", category: "Viandes", minStock: 1, unit_price: 10 },
  });
  expect(inv2.status()).toBe(200);
  const res = await request.get(`${BASE}/api/dashboard/stock-data`);
  expect(res.status()).toBe(200);
  const corps = await res.json();
  expect(Array.isArray(corps)).toBe(true);
  const legumes = corps.find((d: any) => d.name === "Legumes");
  const viandes = corps.find((d: any) => d.name === "Viandes");
  expect(legumes.value).toBe(7.5); // 3 * 2.5
  expect(viandes.value).toBe(20); // 2 * 10
  expect(typeof legumes.color).toBe("string");
  expect(legumes.color.length).toBeGreaterThan(0);
});

// --- S1: la stats route rend le chiffre des donnees relues (DELTA), pas un
// nombre fige. La ligne BAS est poste par la MEME voie que l UI (InventoryAudit
// derive le statut des quantites), puis la DELETE ramene les DEUX champs a la
// ligne de base. Le champs activeAlerts/totalStockValue sont juges ICI (la
// regle du statut critique est jugee par S2 seule).
test("S1 GET /api/dashboard/stats: DELTA activeAlerts + totalStockValue, puis retour a la ligne de base", async ({ request }) => {
  const base = await request.get(`${BASE}/api/dashboard/stats`);
  expect(base.status()).toBe(200);
  const baseBody = await base.json();
  const baseAlerts = baseBody.activeAlerts;
  const baseValue = baseBody.totalStockValue;
  const inv = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Sonde Bas", quantity: 1, minStock: 2, unit: "kg", category: "Sec", unit_price: 1.5, yield_percent: 100 },
  });
  expect(inv.status()).toBe(200);
  const relu = await inv.json();
  expect(relu.status).toBe("critical"); // la voie UI derive le statut des quantites
  const apres = await request.get(`${BASE}/api/dashboard/stats`);
  expect(apres.status()).toBe(200);
  const apresBody = await apres.json();
  expect(apresBody.activeAlerts).toBe(baseAlerts + 1);
  expect(apresBody.totalStockValue).toBe(baseValue + 1.5);
  const del = await request.delete(`${BASE}/api/inventory/${relu.id}`);
  expect(del.status()).toBe(200);
  const retour = await request.get(`${BASE}/api/dashboard/stats`);
  expect(retour.status()).toBe(200);
  const retourBody = await retour.json();
  expect(retourBody.activeAlerts).toBe(baseAlerts);
  expect(retourBody.totalStockValue).toBe(baseValue);
});

// --- S2: la stats route rend le champ criticalItems des lignes REELLEMENT en
// base (DELTA), pas un nombre fige. La ligne poste par la MEME voie que l UI
// (InventoryAudit) porte le statut critique derive des quantites.
test("S2 GET /api/dashboard/stats: DELTA criticalItems, puis retour a la ligne de base", async ({ request }) => {
  const base = await request.get(`${BASE}/api/dashboard/stats`);
  expect(base.status()).toBe(200);
  const baseBody = await base.json();
  const baseCritical = baseBody.criticalItems;
  const inv = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Sonde Critique", quantity: 0, minStock: 2, unit: "kg", category: "Sec", unit_price: 1.5, yield_percent: 100 },
  });
  expect(inv.status()).toBe(200);
  const relu = await inv.json();
  expect(relu.status).toBe("critical");
  const apres = await request.get(`${BASE}/api/dashboard/stats`);
  expect(apres.status()).toBe(200);
  const apresBody = await apres.json();
  expect(apresBody.criticalItems).toBe(baseCritical + 1);
  const del = await request.delete(`${BASE}/api/inventory/${relu.id}`);
  expect(del.status()).toBe(200);
  const retour = await request.get(`${BASE}/api/dashboard/stats`);
  expect(retour.status()).toBe(200);
  const retourBody = await retour.json();
  expect(retourBody.criticalItems).toBe(baseCritical);
});

