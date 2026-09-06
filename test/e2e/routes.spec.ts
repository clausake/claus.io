// Test e2e des routes critiques : démarre le serveur (USER_DATA_PATH isolé)
// et vérifie le CRUD + le middleware de licence.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(process.cwd(), "test", "tmp-data");

let server: ChildProcess;

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA_DIR },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stderr.write(d));
  // wait for server to listen
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}, 45_000);

test.afterAll(() => {
  server?.kill("SIGTERM");
});

test("GET /health répond", async ({ request }) => {
  const res = await request.get(`${BASE}/health`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.ollamaReachable).toBe("boolean");
});

test("CRUD inventaire", async ({ request }) => {
  // create
  let res = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Carotte Test", quantity: 10, minStock: 2, unit: "kg", status: "active", category: "Légumes", unit_price: 1.5 },
  });
  expect(res.status()).toBe(200);
  const item = await res.json();
  expect(item.name).toBe("Carotte Test");

  // read
  res = await request.get(`${BASE}/api/inventory`);
  const items = await res.json();
  expect(items.find((i: any) => i.id === item.id)).toBeTruthy();

  // update
  res = await request.put(`${BASE}/api/inventory/${item.id}`, {
    data: { name: "Carotte Test", quantity: 8, minStock: 2, unit: "kg", status: "active", category: "Légumes", unit_price: 1.6 },
  });
  expect(res.status()).toBe(200);

  // delete
  res = await request.delete(`${BASE}/api/inventory/${item.id}`);
  expect(res.status()).toBe(200);
  res = await request.get(`${BASE}/api/inventory`);
  const after = await res.json();
  expect(after.find((i: any) => i.id === item.id)).toBeFalsy();
});

test("GET /api/trial-status retourne l'état licence", async ({ request }) => {
  const res = await request.get(`${BASE}/api/trial-status`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.isUnlocked).toBe("boolean");
  expect(typeof body.machineId).toBe("string");
});

test("POST /api/unlock avec clé invalide → 401", async ({ request }) => {
  const res = await request.post(`${BASE}/api/unlock`, { data: { key: "clé-faux" } });
  expect(res.status()).toBe(401);
});

test("GET /api/suppliers + POST", async ({ request }) => {
  const res = await request.post(`${BASE}/api/suppliers`, {
    data: { name: "Fournisseur E2E", email: "a@b.fr", phone: "0101" },
  });
  expect(res.status()).toBe(200);
  const sup = await res.json();
  expect(sup.name).toBe("Fournisseur E2E");

  const list = await (await request.get(`${BASE}/api/suppliers`)).json();
  expect(list.find((s: any) => s.id === sup.id)).toBeTruthy();
});

test("GET /api/dashboard/stats", async ({ request }) => {
  const res = await request.get(`${BASE}/api/dashboard/stats`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.totalStockValue).toBe("number");
});

test("GET /api/haccp/iot-sensors", async ({ request }) => {
  const res = await request.get(`${BASE}/api/haccp/iot-sensors`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("CRUD recettes", async ({ request }) => {
  // create
  let res = await request.post(`${BASE}/api/recipes`, {
    data: { name: "Test Recipe", category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "test" },
  });
  expect(res.status()).toBe(200);
  const item = await res.json();
  expect(typeof item.id).toBe("string");

  // read
  res = await request.get(`${BASE}/api/recipes`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list.find((r: any) => r.id === item.id)).toBeTruthy();

  // delete
  res = await request.delete(`${BASE}/api/recipes/${item.id}`);
  expect(res.status()).toBe(200);
});

test("CRUD staff", async ({ request }) => {
  // create
  let res = await request.post(`${BASE}/api/staff`, {
    data: { name: "Chef Test", role: "Chef", hourlyRate: 25 },
  });
  expect(res.status()).toBe(200);
  const item = await res.json();
  expect(typeof item.id).toBe("string");

  // read
  res = await request.get(`${BASE}/api/staff`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  const found = list.find((s: any) => s.id === item.id);
  expect(found).toBeTruthy();
  expect(found.name).toBe("Chef Test");
  expect(found.hourlyRate).toBe(25);

  // delete
  res = await request.delete(`${BASE}/api/staff/${item.id}`);
  expect(res.status()).toBe(200);
});

test("GET /api/search?q=carotte", async ({ request }) => {
  const res = await request.get(`${BASE}/api/search?q=carotte`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.results)).toBe(true);
});

test("GET /api/anti-waste/critical", async ({ request }) => {
  const res = await request.get(`${BASE}/api/anti-waste/critical`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.inventory)).toBe(true);
  expect(Array.isArray(body.expiringBatches)).toBe(true);
});

test("GET /api/epicure/recommendations", async ({ request }) => {
  const res = await request.get(`${BASE}/api/epicure/recommendations?ingredient=carotte`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ingredient).toBe("carotte");
  expect(Array.isArray(body.recommendations)).toBe(true);
});

test("CRUD menu-planning", async ({ request }) => {
  // create
  let res = await request.post(`${BASE}/api/menu-planning`, {
    data: { date: "2025-08-28", meal_type: "lunch", title: "Test Meal", recipe_json: {} },
  });
  expect(res.status()).toBe(200);
  const item = await res.json();
  expect(typeof item.id).toBe("string");

  // read
  res = await request.get(`${BASE}/api/menu-planning`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list.find((p: any) => p.id === item.id)).toBeTruthy();

  // delete
  res = await request.delete(`${BASE}/api/menu-planning/${item.id}`);
  expect(res.status()).toBe(200);
});

test("GET /api/robots", async ({ request }) => {
  const res = await request.get(`${BASE}/api/robots`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("GET /api/documents", async ({ request }) => {
  const res = await request.get(`${BASE}/api/documents`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("GET /api/haccp/temperatures", async ({ request }) => {
  const res = await request.get(`${BASE}/api/haccp/temperatures`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("GET /api/haccp/cleaning", async ({ request }) => {
  const res = await request.get(`${BASE}/api/haccp/cleaning`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("GET /api/haccp/batches", async ({ request }) => {
  const res = await request.get(`${BASE}/api/haccp/batches`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("GET /api/haccp/production-history", async ({ request }) => {
  const res = await request.get(`${BASE}/api/haccp/production-history`);
  expect(res.status()).toBe(200);
  const arr = await res.json();
  expect(Array.isArray(arr)).toBe(true);
});

test("POST /api/backup", async ({ request }) => {
  const res = await request.post(`${BASE}/api/backup`);
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers["content-type"]).toContain("application/zip");
});

test("GET /api/network-info", async ({ request }) => {
  const res = await request.get(`${BASE}/api/network-info`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  // en prod : { ip, port, url } ; en dev le catch-all Vite peut renvoyer index.html
  expect(typeof body.ip).toBe("string");
  expect(typeof body.url).toBe("string");
});

// --- Settings (router settings.ts) -------------------------------------
test("CRUD settings : lecture, écriture, relecture", async ({ request }) => {
  const before = await (await request.get(`${BASE}/api/settings`)).json();
  expect(typeof before).toBe("object");

  const probe = { ...(before ?? {}), language: "en" };
  const put = await request.post(`${BASE}/api/settings`, { data: probe });
  expect(put.status()).toBe(200);
  const written = await put.json();
  expect(written.status).toBe("success");

  const after = await (await request.get(`${BASE}/api/settings`)).json();
  expect(after.language).toBe("en");
});

test("GET /api/ollama/status répond connecte ou deconnecte (jamais 500 nu)", async ({ request }) => {
  const res = await request.get(`${BASE}/api/ollama/status`);
  // Ollama peut etre absent sur le runner : le routeur doit repondre un statut
  // explicite (200 connected | 500 disconnected) avec un corps exploitable.
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(["connected", "disconnected"]).toContain(body.status);
});

// --- Supplier prices (router supplierprices.ts) -------------------------
test("CRUD supplier-prices : depend de inventory + calcul prix/ref", async ({ request }) => {
  const inv = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Farine Test SP", quantity: 5, minStock: 1, unit: "kg", status: "active", category: "Épicerie", unit_price: 2 },
  });
  expect(inv.status()).toBe(200);
  const invRow = await inv.json();
  const invId = invRow.id;

  const sup = await request.post(`${BASE}/api/suppliers`, {
    data: { name: "Fournisseur Test SP", contact: "—", email: "t@t.fr", phone: "01", category: "Gros", delivery_time: "24h" },
  });
  expect(sup.status()).toBe(200);
  const supId = (await sup.json()).id;

  // 404 attendu si l'item d'inventaire n'existe pas (garde d'integrite)
  const missing = await request.post(`${BASE}/api/supplier-prices`, {
    data: { supplier_id: supId, inventory_id: "inexistant", raw_unit_price: 1.2, unit: "kg" },
  });
  expect(missing.status()).toBe(404);

  const created = await request.post(`${BASE}/api/supplier-prices`, {
    data: { supplier_id: supId, inventory_id: invId, raw_unit_price: 1.8, unit: "kg" },
  });
  expect(created.status()).toBe(200);

  const list = await (await request.get(`${BASE}/api/supplier-prices`)).json();
  expect(Array.isArray(list)).toBe(true);
  const row = list.find((r: any) => r.inventory_id === invId);
  expect(row).toBeTruthy();
  expect(typeof row.calculated_price_per_ref).toBe("number");

  const cmp = await (await request.get(`${BASE}/api/supplier-prices/comparison`)).json();
  expect(Array.isArray(cmp)).toBe(true);
  const grp = cmp.find((g: any) => g.inventory_id === invId);
  expect(grp).toBeTruthy();
  expect(typeof grp.savings_percent).toBe("number");

  const del = await request.delete(`${BASE}/api/supplier-prices/${row.id}`);
  expect(del.status()).toBe(200);
  const after = await (await request.get(`${BASE}/api/supplier-prices`)).json();
  expect(after.some((r: any) => r.id === row.id)).toBe(false);

  await request.delete(`${BASE}/api/inventory/${invId}`);
});

// --- Admin (router admin.ts) -------------------------------------------
// /api/agent/command n'est pas couvert : il lance un chromium headless:false
// (impossible sur un runner sans display). A couvrir via un test d'integration
// dedie avec xvfb, pas dans cette suite.
test("GET /api/admin/db-download telecharge la base", async ({ request }) => {
  const res = await request.get(`${BASE}/api/admin/db-download`);
  // la base existe (creee au demarrage) → 200 + en-tete d'attachment
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"] ?? "").toContain("agent_culinaire.db");
});

test("GET /api/admin/guide-download : 200 si guide présent, 404 sinon", async ({ request }) => {
  const res = await request.get(`${BASE}/api/admin/guide-download`);
  expect([200, 404]).toContain(res.status());
  if (res.status() === 404) {
    expect((await res.json()).error).toContain("Guide");
  }
});

// --- IA (router ai.ts) : degrade gracefullent sans Ollama --------------
test("POST /api/ai/chat : reponse textique dans les deux cas", async ({ request }) => {
  const res = await request.post(`${BASE}/api/ai/chat`, {
    data: { message: "Bonjour Chef" },
  });
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(typeof body.response).toBe("string");
  expect(body.response.length).toBeGreaterThan(0);
});
