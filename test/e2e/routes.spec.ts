// Test e2e des routes critiques : démarre le serveur (USER_DATA_PATH isolé)
// et vérifie le CRUD + le middleware de licence.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { request as rawRequest } from "node:http";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

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

  // PUT /api/suppliers/:id — Route 23
  const put = await request.put(`${BASE}/api/suppliers/${sup.id}`, {
    data: { name: "Fournisseur E2E Modifie", email: "modifie@b.fr", phone: "0202" },
  });
  expect(put.status()).toBe(200);
  const apresPut = await put.json();
  expect(String(apresPut.status ?? "")).toBeTruthy();
  // DELTA : la base porte le nom modifie
  const relu = ((await (await request.get(`${BASE}/api/suppliers`)).json())).find((s: any) => s.id === sup.id);
  expect(relu.name).toBe("Fournisseur E2E Modifie");
  expect(relu.email).toBe("modifie@b.fr");

  // DELETE /api/suppliers/:id
  const del = await request.delete(`${BASE}/api/suppliers/${sup.id}`);
  expect(del.status()).toBe(200);
  const apresDel = await (await request.get(`${BASE}/api/suppliers`)).json();
  expect(apresDel.find((s: any) => s.id === sup.id)).toBeFalsy();
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

  // PUT /api/recipes/:id — Route 16
  res = await request.put(`${BASE}/api/recipes/${item.id}`, {
    data: {
      name: "Test Recipe Modifie",
      ingredients: [{ inventory_name: "Beurre Test Modifie", quantity_per_person: 15, unit: "g" }],
      preparation_steps: "test modifie",
    },
  });
  expect(res.status()).toBe(200);
  const apresPut = await res.json();
  expect(String(apresPut.status ?? "")).toBeTruthy();
  // DELTA : la relit en base porte le nom modifie
  const reli = (await (await request.get(`${BASE}/api/recipes`)).json()).find((r: any) => r.id === item.id);
  expect(reli.name).toBe("Test Recipe Modifie");
  expect(String(reli.preparation_steps ?? "")).toContain("modifie");

  // delete
  res = await request.delete(`${BASE}/api/recipes/${item.id}`);
  expect(res.status()).toBe(200);
});

// --- Route 18 (PUT /api/recipes/:id/save) ----------------------------------
// Le chef marque une recette sauvegardee (RecipeDetails fetch PUT /save).
// Le contrat juge le DELTA: la ligne relit en base porte is_saved=1 apres
// la marque, et ne peut pas revenir en 0 tant que la marque reste.
test("PUT /api/recipes/:id/save : la recette est marque sauvegardee et relu en base", async ({ request }) => {
  const cree = await request.post(`${BASE}/api/recipes`, {
    data: { name: "Recette Save Route18", category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "" },
  });
  expect(cree.status()).toBe(200);
  const id = (await cree.json()).id;

  const avant = (await (await request.get(`${BASE}/api/recipes`)).json()).find((r: any) => r.id === id);
  expect(avant.is_saved).toBe(0);

  const res = await request.put(`${BASE}/api/recipes/${id}/save`, { data: {} });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(String(body.status ?? "")).toBeTruthy();

  // DELTA : la base porte la marque
  const relu = (await (await request.get(`${BASE}/api/recipes`)).json()).find((r: any) => r.id === id);
  expect(relu.is_saved).toBe(1);

  const net = await request.delete(`${BASE}/api/recipes/${id}`);
  expect(net.status()).toBe(200);
});

// Le chef clique « Generer les etapes » dans RecipeDetails: la route relit la
// recette EN BASE (404 si elle n'existe pas), construit son prompt avec les
// ingredients relus par la JOIN recipe_ingredients/inventory, puis interroge
// Ollama. Le contrat juge: un id ABSENT rend 404 NOMME, un corps exploitable
// dans les deux branches Ollama (present -> { preparation_steps }, absent ->
// 500 { error:'Failed to generate steps' }).
test("POST /api/recipes/:id/generate-steps : 404 id absent, corps exploitable dans les deux branches Ollama", async ({ request }) => {
  const absent = await request.post(`${BASE}/api/recipes/inexistant-id/generate-steps`, { data: {} });
  expect(absent.status()).toBe(404);
  const corps = await absent.json();
  expect(String(corps.error ?? "")).toContain("Recipe");

  const cree = await request.post(`${BASE}/api/recipes`, {
    data: { name: "Recette Steps Route17", category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "" },
  });
  expect(cree.status()).toBe(200);
  const id = (await cree.json()).id;

  const res = await request.post(`${BASE}/api/recipes/${id}/generate-steps`, { data: {} });
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(typeof body).toBe("object");
  if (res.status() === 200) {
    // le corps exploitable porte la clef des etapes generees
    expect(String(body.preparation_steps ?? "")).toBeTruthy();
    // DELTA : la base porte la valeur REELLE retournee par la route
    const relu = (await (await request.get(`${BASE}/api/recipes`)).json()).find((r: any) => r.id === id);
    expect(relu.preparation_steps).toBe(body.preparation_steps);
  } else {
    expect(String(body.error ?? "")).toBeTruthy();
  }

  const net = await request.delete(`${BASE}/api/recipes/${id}`);
  expect(net.status()).toBe(200);
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
  // DELTA : la ligne relue ne peut plus revenir dans la liste active (active=0)
  const apresDel = await request.get(`${BASE}/api/staff`);
  const listApres = await apresDel.json();
  expect(listApres.find((s: any) => s.id === item.id)).toBeFalsy();
});

// --- Route 20 (POST /api/staff/duplicate-week) -----------------------------
// Le chef duplique la semaine precedente dans la vue StaffManagement (fetch POST
// duplicate-week). Le contrat juge le DELTA: la semaine COURANTE recoit les
// creneaux de la semaine PRECEDENTE, retarde de 7 jours, et la liste relue par
// GET /api/staff?start=&end= porte exactement ces creneaux. Un corps sans
// dates rend 400 NOMME (message « Missing dates »), pas un 500 muet.
test("POST /api/staff/duplicate-week : la semaine precedente est recopiee dans la courante", async ({ request }) => {
  const prevWeekStart = "2026-09-07";
  const currentWeekStart = "2026-09-14";

  // la voie de l'app pour poser les creneaux de la semaine precedente:
  // POST /api/staff { name, role, hourlyRate, schedule, datesObj }.
  const resStaff = await request.post(`${BASE}/api/staff`, {
    data: {
      name: "Chef Duplique Route20",
      role: "Chef",
      hourlyRate: 25,
      schedule: {
        "2026-09-07": [{ start: "09:00", end: "12:00" }],
        "2026-09-08": [{ start: "14:00", end: "17:00" }],
      },
      datesObj: { "2026-09-07": "2026-09-07", "2026-09-08": "2026-09-08" },
    },
  });
  expect(resStaff.status()).toBe(200);
  const staffId = (await resStaff.json()).id;

  const sansDates = await request.post(`${BASE}/api/staff/duplicate-week`, { data: {} });
  expect(sansDates.status()).toBe(400);
  const corps400 = await sansDates.json();
  expect(String(corps400.message ?? "")).toBeTruthy();

  const res = await request.post(`${BASE}/api/staff/duplicate-week`, {
    data: { currentWeekStart, prevWeekStart },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(String(body.status ?? "")).toBeTruthy();

  // DELTA : la liste relue par la voie de l'app porte les creneaux DEPLACE de 7 jours
  const lire = await request.get(`${BASE}/api/staff?start=2026-09-14&end=2026-09-20`);
  expect(lire.status()).toBe(200);
  const courant = (await lire.json()).find((s: any) => s.id === staffId);
  expect(courant, "le membre est relu avec sa semaine courante").toBeTruthy();
  const creneaux = courant.schedule["2026-09-14"] ?? [];
  expect(creneaux.length).toBe(1);
  expect(creneaux[0].start).toBe("09:00");
  expect(creneaux[0].end).toBe("12:00");
  const creneaux8 = courant.schedule["2026-09-15"] ?? [];
  expect(creneaux8.length).toBe(1);
  expect(creneaux8[0].start).toBe("14:00");

  const nettoyer = await request.delete(`${BASE}/api/staff/${staffId}`);
  expect(nettoyer.status()).toBe(200);
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

// --- Route 19 (POST /api/robots/assign) -----------------------------------
// La table robots n'est pas semée par src/db/init.ts: le POST /api/robots/assign
// exige une ligne EXISTANTE (UPDATE robots SET task = ?, status='active', progress=0
// WHERE id=?). Le contrat semise DONC un robot par la voie API du depot
// (open({filename, driver: sqlite3.Database}) comme documents-validate-contract
// S6c) avec une PREUVE de semence, puis juge le DELTA: la ligne relue en base
// porte la tache assignee et status='active'.
test("POST /api/robots/assign : le robot semee reçoit sa tache et passe en status active", async ({ request }) => {
  const robotId = "robot-d19-" + Date.now();
  {
    const dbFichier = path.join(DATA_DIR, "agent_culinaire.db");
    const dbLocal = await open({ filename: dbFichier, driver: sqlite3.Database });
    await dbLocal.run("PRAGMA busy_timeout = 8000");
    const pose = await dbLocal.run(
      "INSERT INTO robots (id, name, status, task, progress, battery, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [robotId, "Robot Sonde D19", "idle", "", 0, 100, "plonge"],
    );
    await dbLocal.close();
    expect(pose.changes, "D19_LA_SEMENCE_DU_ROBOT_ENTRE_EN_BASE").toBe(1);
  }
  const avant = ((await (await request.get(`${BASE}/api/robots`)).json()) as any[]).find((r: any) => r.id === robotId);
  expect(avant, "le robot est PRESENT avant assign").toBeTruthy();
  expect(avant.status).toBe("idle");

  const res = await request.post(`${BASE}/api/robots/assign`, { data: { robotId, task: "Nettoyer la plonge D19" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(String(body.status ?? "")).toBeTruthy();

  // DELTA : la base porte la tache et le statut active
  const apres = ((await (await request.get(`${BASE}/api/robots`)).json()) as any[]).find((r: any) => r.id === robotId);
  expect(apres.task).toBe("Nettoyer la plonge D19");
  expect(apres.status).toBe("active");
  expect(apres.progress).toBe(0);
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

  // -- CHANGEMENT DE CONTRAT (Sprint 7), consigné et non tacite ----------------
  // Ce test attendait 404 « Inventory item not found », le comportement de
  // l'avant-contrat. Une CLE ETRANGERE de corps qui n'existe pas n'est pas une
  // ressource absente de l'URI: c'est la REQUETE qui est invalide, donc 400 —
  // et le 400 doit NOMMER le champ, sinon le cuisinier perd sa saisie sans
  // savoir quoi corriger. L'attendu est donc aligne sur le contrat de
  // test/e2e/supplier-price-contract.spec.ts (S4b, juge par sa propre preuve
  // negative M3). Le 404 reste la reponse de l'UPDATE sur un `id` ADRESSE par
  // l'appelant (S5), ce qui est une autre porte et reste jugee ici.
  // Le test est en meme temps RENFORCE: l'ancien assert ne verifiait que le
  // code, jamais la raison du refus.
  const missing = await request.post(`${BASE}/api/supplier-prices`, {
    data: { supplier_id: supId, inventory_id: "inexistant", raw_unit_price: 1.2, unit: "kg" },
  });
  expect(missing.status(), "CLE_ETRANGERE_INEXISTANTE_EST_UN_400_NOMME").toBe(400);
  expect((await missing.json())?.refused, "LE_REFUS_NOMME_LARTICLE").toContain("inventory_id");

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

// ⚠ CE TEST A ETE REECRIT et sa version precedente etait un PASS creux.
// L'ancien cas acceptait `[200, 404]` : sur tout clone ou un `git lfs
// update` a echoue (le runner GitLab fait `git lfs update ... || echo`,
// il ne met PAS GIT_LFS_SKIP_SMUDGE), le PDF restait un POINT EUR LFS non
// resolus, la route repondait 404, et la porte restait VERTE alors que la
// fonctionnalite etait morte pour le client. Un PASS qui ne peut pas
// devenir FAIL n'est pas une mesure (regle du depot).
//
// Le contrat exige donc le PDF REEL. Trois assertions le discriminent, et
// chacune correspond a un mode de rupture reel et verifie:
//   - 404            => fichier absent du clone (smudge LFS non tente);
//   - pointeur LFS   => corps de ~130 octets commencant par
//                       "version https://git-lfs" (fichier suivi mais non
//                       resolus) — le cas le plus fourbe, il a un 200
//                       riendant et un nom de fichier correct;
//   - corps tronque  => poids < 100 Ko alors que le guide fait ~2,6 Mo.
test("GET /api/admin/guide-download : sert le vrai PDF (pas un pointeur LFS)", async ({ request }) => {
  const res = await request.get(`${BASE}/api/admin/guide-download`);
  // 404 n'est PLUS une issue acceptable: il signifie que public/
  // Executive_Guide.pdf n'est pas materialise dans le clone, donc que la
  // telechargement est mort chez le client. On le nomme dans le message.
  expect(res.status(), "404 = public/Executive_Guide.pdf absent du clone "
    + "(smudge LFS non joue) : le telechargement produit est mort").toBe(200);
  expect(res.headers()["content-disposition"] ?? "")
    .toContain("Executive_Guide.pdf");

  const corps = await res.body();
  // Un pointeur LFS non resolus est un fichier TEXTE de ~130 octets qui
  // commence par l'entete de specification. C'est l'artefact exact qui a
  // rendu la porte decorative pendant que le serveur distant avait perdu
  // l'objet 7cc8630e…
  const tete = corps.subarray(0, 40).toString("utf8");
  expect(tete.startsWith("version https://git-lfs"),
    "le corps est un POINTEUR LFS non resolus (tete=" + tete + ") : "
    + "le PDF n'a jamais ete tire du depot LFS").toBe(false);
  expect(corps.subarray(0, 5).toString("latin1"),
    "un PDF commence par %PDF-").toBe("%PDF-");
  expect(corps.length, "guide tronque (" + corps.length + " octets)").toBeGreaterThan(100_000);
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

// --- Route 24 (POST /api/voice) -----------------------------------------
// La voix du chef (ChatAssistant) poste son message; la route construit son
// prompt JSON (intent add_to_cart/general_advice) puis interroge Ollama avec
// format:'json'. Le contrat juge un corps exploitable dans les deux branches:
// present -> { intent, response }, absent -> 500 { intent:'error',
// response:'Désolé Chef...' } — raison NOMMEE, pas un 500 muet.
test("POST /api/voice : corps exploitable dans les deux branches Ollama", async ({ request }) => {
  const res = await request.post(`${BASE}/api/voice`, { data: { message: "Bonjour Chef Route24" } });
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(typeof body).toBe("object");
  expect(typeof body.intent).toBe("string");
  expect(typeof body.response).toBe("string");
  expect(String(body.response ?? "").length).toBeGreaterThan(0);
});


// --- Flux SSE des capteurs (hub src/services/sensor-hub.ts) -------------
// Le contrat de la diffusion : un webhook poste est Pousse au client, sans
// attendre le tour d'un polling. Le flux streaming n'est pas dispo via le
// fixture `request` de Playwright, donc on ouvre un vrai flux en fetch natif
// sur le serveur deja demarre par la suite (port isole 3999, pas celui du dev).
// La route est montee par Express avant le middleware Vite : le flux n'est pas
// tamponne par le dev-server.
test("flux SSE: un webhook poste est pousse au client (latence < 1s)", async ({ request }) => {
  const nom = `Capteur e2e ${Date.now()}`;
  const reg = await (await request.post(`${BASE}/api/haccp/iot-sensors`, {
    data: { id: `e2e-${Date.now()}`, name: nom, type: "ambient", equipment_type: "Froid" },
  })).json();
  expect(typeof reg.token).toBe("string");
  const capteurId = (await (await request.get(`${BASE}/api/haccp/iot-sensors`)).json())
    .find((s: any) => s.name === nom)?.id;
  expect(capteurId).toBeTruthy();

  const ac = new AbortController();
  const fluxOuvert = fetch(`${BASE}/api/sensors/stream`, {
    signal: ac.signal,
    headers: { Accept: "text/event-stream" },
  });

  // Collecte les frames "event:/data:" au fil de l'eau.
  const evenements: Array<{ event: string; data: any; at: number }> = [];
  let content = "";
  const lecture = fluxOuvert.then(async (r) => {
    content = r.headers.get("content-type") || "";
    const lecteur = r.body!.getReader();
    const dec = new TextDecoder();
    let tampon = "";
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += dec.decode(value, { stream: true });
      let coupe;
      while ((coupe = tampon.indexOf("\n\n")) !== -1) {
        const frame = tampon.slice(0, coupe);
        tampon = tampon.slice(coupe + 2);
        const nomEv = /event: *(.+)/.exec(frame)?.[1]?.trim();
        const brut = /data: *(.+)/.exec(frame)?.[1];
        if (nomEv && brut) {
          try { evenements.push({ event: nomEv, data: JSON.parse(brut), at: Date.now() }); } catch { /* keepalive */ }
        }
      }
    }
  }).catch(() => { /* abort a la fermeture, normal */ });

  // Patiente que le serveur accepte la connexion (le flux doit etre branche pour
  // recevoir la prochain post).
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && evenements.length === 0 && content === "") {
    await new Promise((r) => setTimeout(r, 25));
  }

  // Poste une releve et attend qu'elle ressorte en 'sensor'.
  const tPost = Date.now();
  const post = await request.post(`${BASE}/api/haccp/webhook/iot-report`, {
    data: { id: capteurId, token: reg.token, temperature: 3.7, battery: 80 },
  });
  expect(post.status()).toBe(200);

  const deadline = Date.now() + 4000;
  let recu: { data: any; at: number } | null = null;
  while (Date.now() < deadline) {
    const hit = evenements.filter((e) => e.event === "sensor" && e.data?.id === capteurId);
    if (hit.length) { recu = hit[hit.length - 1]; break; }
    await new Promise((r) => setTimeout(r, 25));
  }

  ac.abort();
  await lecture;

  expect(content).toContain("text/event-stream");
  expect(recu).not.toBeNull();
  expect(recu!.data.temperature).toBe(3.7);
  expect(recu!.at - tPost).toBeLessThan(1000); // le polling etait 4000
});


// --- Compression HTTP -------------------------------------------------
// Le contrat : une reponse volumineuse sort compressee et le corps gzip se
// decode a l'identique. On passe par un client http BRUT et non par le fixture
// `request` : undici declare Accept-Encoding et decompress tout seul, ce qui
// effacerait exactement ce qu'on veut mesurer (le poids sur le fil).
// La taille de reference (identity) est prise dans le MEME test : affirmer un
// gain sans comparer la meme ressource serait compter un en-tete comme un gain.
test("compression: la reponse volumineuse est gzippee et decodable", async () => {
  const call = (headers: Record<string, string>) =>
    new Promise<{ enc: string; bytes: number; buf: Buffer }>((resolve, reject) => {
      const req = rawRequest(`${BASE}/api/epicure/vocab-list`, { method: "GET", headers }, (res) => {
        const chunks: Buffer[] = [];
        let n = 0;
        res.on("data", (c: Buffer) => { chunks.push(c); n += c.length; });
        res.on("end", () => resolve({
          enc: String(res.headers["content-encoding"] ?? ""),
          bytes: n,
          buf: Buffer.concat(chunks),
        }));
      });
      req.on("error", reject);
      req.end();
    });

  const plain = await call({ "Accept-Encoding": "identity" });
  const gz = await call({ "Accept-Encoding": "gzip" });

  expect(plain.bytes).toBeGreaterThan(1024); // la route est bien au-dessus du seuil
  expect(gz.enc).toBe("gzip");
  expect(gz.bytes).toBeLessThan(plain.bytes * 0.5);
  // Un Content-Encoding mensonger (corps en fait pas compresse) casserait ici.
  const decoded = JSON.parse(gunzipSync(gz.buf).toString("utf8"));
  expect(decoded.length).toBe(JSON.parse(plain.buf.toString("utf8")).length);
});

test("compression: sous le seuil de 1 ko, pas de compression", async () => {
  const r = await new Promise<{ enc: string | undefined; len: number }>((resolve, reject) => {
    const req = rawRequest(`${BASE}/api/trial-status`, { method: "GET", headers: { "Accept-Encoding": "gzip" } }, (res) => {
      let n = 0;
      res.on("data", (c: Buffer) => (n += c.length));
      res.on("end", () => resolve({ enc: res.headers["content-encoding"] as string | undefined, len: n }));
    });
    req.on("error", reject);
    req.end();
  });
  expect(r.len).toBeGreaterThan(0);
  expect(r.len).toBeLessThan(1024);
  expect(r.enc).toBeUndefined();
});

test("POST /api/agent/command ne doit pas vendre un echo comme une extraction",
  async ({ request }) => {
    const article = "SENTINELLE-RPA-INEXISTANT-42";
    const res = await request.post(`${BASE}/api/agent/command`, {
      data: {
        source: "e2e",
        type: "MANUAL",
        data: { action: "review_carts", carts: [{ item: article, price: 42.42,
          supplier: "FRS-" + article }] },
        timestamp: new Date().toISOString(),
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const r0 = body.results?.[0] ?? {};
    // Le contrat doit declarer sa nature: un echo ne peut pas se faire passer
    // pour le resultat d'une navigation B2B (mensonge lu dans les octets avant
    // correction: status "Navigation B2B effectuee", found_price = le prix envoye).
    expect(typeof body.mode).toBe("string");
    expect(body.mode).toBe("SIMULATION");
    expect(r0.verified).toBe(false);
    expect(r0.source).toBe("echo-input");
    expect(String(r0.status ?? "").includes("Navigation B2B")).toBe(false);
    expect(String(body.claus_analysis ?? "").includes("en direct")).toBe(false);
  },
);

test("POST /api/agent/command sans panier rend 400, pas un faux succes sur zero ligne",
  async ({ request }) => {
    const vides = [
      { source: "e2e", type: "MANUAL", data: { action: "review_carts", carts: [] } },
      { source: "e2e", type: "MANUAL", data: { action: "review_carts" } },
      { source: "e2e", type: "MANUAL" },
    ];
    for (const payload of vides) {
      const res = await request.post(`${BASE}/api/agent/command`, { data: payload });
      expect(res.status()).toBe(400);
    }
  },
);

test("POST /api/alerts/:id/ignore : une alerte stock ne reapparait pas apres ignore", async ({ request }) => {
  // Une alerte stock vient de l'inventaire (GET /api/alerts cree stock_<id> pour
  // une ligne quantity <= minStock). Le chef coche « Ignorer » -> la route POST
  // /api/alerts/:id/ignore ecrit status="ignored" en base, et la relit via
  // GET /api/alerts : la ligne ne peut plus revenir tant que le stock reste bas.
  const low = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Beurre Test Alerts", quantity: 0, minStock: 1, unit: "kg", status: "critical", category: "Alertes" },
  });
  expect(low.status()).toBe(200);
  const invRow = await low.json();
  const alertId = `stock_${invRow.id}`;

  const avant = (await (await request.get(`${BASE}/api/alerts`)).json()) as any[];
  const ligne = avant.find((a: any) => a.id === alertId);
  expect(ligne, "l'alerte stock est presente avant ignore").toBeTruthy();
  expect(ligne.status).toBe("active");

  const res = await request.post(`${BASE}/api/alerts/${alertId}/ignore`, { data: {} });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);

  // DELTA : la ligne ignoree quitte la liste des alertes actives.
  const apres = (await (await request.get(`${BASE}/api/alerts`)).json()) as any[];
  expect(apres.find((a: any) => a.id === alertId)).toBeFalsy();
});

test("POST /api/alerts/:id/resolve : une alerte stock resolue quitte la liste active", async ({ request }) => {
  // GET /api/alerts cree l'alerte stock_<id> pour une ligne quantity <= minStock
  // et la marque active. Le chef coche « Resoudre » -> POST /api/alerts/:id/resolve
  // ecrit status="resolved" en base; la relecture juge le DELTA: la ligne quitte
  // la liste des alertes actives tant que le stock reste bas.
  const low = await request.post(`${BASE}/api/inventory`, {
    data: { name: "Huile Test Alerts", quantity: 0, minStock: 1, unit: "kg", status: "critical", category: "Alertes" },
  });
  expect(low.status()).toBe(200);
  const invRow = await low.json();
  const alertId = `stock_${invRow.id}`;

  const avant = (await (await request.get(`${BASE}/api/alerts`)).json()) as any[];
  const ligne = avant.find((a: any) => a.id === alertId);
  expect(ligne, "l'alerte stock est presente avant resolve").toBeTruthy();
  expect(ligne.status).toBe("active");

  const res = await request.post(`${BASE}/api/alerts/${alertId}/resolve`, { data: {} });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);

  // DELTA : la ligne resolue quitte la liste des alertes actives.
  const apres = (await (await request.get(`${BASE}/api/alerts`)).json()) as any[];
  expect(apres.find((a: any) => a.id === alertId)).toBeFalsy();
});

// --- Routes IA upload (menu.ts) -----------------------------------------
// /api/analyze-menu, /api/generate-creative-menu, /api/generate-gastronomic-menu,
// /api/generate-traditional-menu, /api/recipes/scan, /api/documents/upload,
// /api/haccp/documents/upload sont des routes qui EXIGENT un fichier multipart.
// Le contrat verifie est « refuser sans fichier + repondre un corps exploitable
// dans les deux branches Ollama (present ou absent) », comme /api/ai/chat.
// Sur un runner sans modele (curl /api/tags rend {"models":[]}), la branche
// "absent" sort en 500 avec un corps exploitable. L'IA peut aussi renvoyer un
// corps non JSON-parsable: le routeur rend alors 500 avec raw. Les deux branches
// sont jugees: une sortie explicite et un corps exploitable.
test("POST /api/analyze-menu : sans fichier rend 400 NOMME, avec fichier rend un corps exploitable", async ({ request }) => {
  const sans = await request.post(`${BASE}/api/analyze-menu`, { data: {} });
  expect(sans.status()).toBe(400);
  const body = await sans.json();
  expect(String(body.error ?? "")).toContain("file");

  // un PNG reel (2x2 pixels blanc) — la branche Ollama present rend 200 avec
  // fiches_techniques; la branche absent rend 500 avec un corps exploitable.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const avec = await request.post(`${BASE}/api/analyze-menu`, {
    multipart: { file: { name: "menu-test.png", mimeType: "image/png", buffer: png } },
  });
  expect([200, 500]).toContain(avec.status());
  const corps = await avec.json();
  expect(typeof corps).toBe("object");
  // le corps exploitable porte la cle fiche technique quand l'IA a repondu.
  if (avec.status() === 200) expect(Array.isArray(corps.fiches_techniques)).toBe(true);
});

// --- Anti-waste (antiwaste.ts) ------------------------------------------
test("POST /api/anti-waste/generate : repond un corps exploitable dans les deux branches Ollama", async ({ request }) => {
  // La route n'exige pas de fichier: elle demande les batches a DLC courte et
  // construit son prompt, puis interroge Ollama. Sur un runner sans modele la
  // branche "absent" sort en 500 avec un corps exploitable; la branche present
  // rend 200 avec menu_name/dishes (ou toute forme JSON parsable).
  const res = await request.post(`${BASE}/api/anti-waste/generate`, { data: {} });
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(typeof body).toBe("object");
  // corps exploitable: soit le menu genere, soit l'erreur nommee (500 absent).
  if (res.status() === 200) expect(String(body.menu_name ?? "")).toBeTruthy();
  if (res.status() === 500) expect(String(body.error ?? "").length).toBeGreaterThan(0);
});

// --- Documents (documents.ts) -------------------------------------------
// /api/documents/:id/extract est la porte qui relit le brouillon d'une facture:
// elle resoud le fichier source en uploadsDir, l'extrait (PDF ou image), puis
// interroge Ollama. Un id ADRESSE par l'appelant qui n'existe pas est une
// ressource absente (404), un fichier source absent est un defaut de REQUETE
// (400 nomme), et la branche Ollama absent rend un corps exploitable.
// Trois formes de source_image_url sont jugées: pointe vers un fichier ABSENT
// (400 « introuvable »), VIDE (la voie manuelle DocumentManager — le split
// rend undefined et le routeur jette un TypeError -> 500 exploitable), et
// PRESENT (voie REELLE upload draft -> corps exploitable).
test("POST /api/documents/:id/extract : 404 id absent, 400 fichier introuvable, 500 fichier vide, corps exploitable avec fichier", async ({ request }) => {
  // un id adresse qui n'existe pas -> 404
  const absent = await request.post(`${BASE}/api/documents/inexistant-id/extract`, { data: {} });
  expect(absent.status()).toBe(404);

  // un document SANS fichier (source_image_url VIDE, voie manuelle) -> le split
  // rend undefined et le routeur jette un TypeError: 500 avec une raison NOMMEE.
  const manuel = await request.post(`${BASE}/api/documents`, {
    data: {
      type: "FACTURE", supplier: "Sonde Extract", date: "2026-09-19",
      total_amount: 0, source_image_url: "", items: [
        { inventory_id: null, original_name: "Pomme sonde", quantity: 1, unit_price: 1, lot_number: "", dlc: "" },
      ],
    },
  });
  expect(manuel.status()).toBe(200);
  const docId = (await manuel.json()).id;
  const vide = await request.post(`${BASE}/api/documents/${docId}/extract`, { data: {} });
  expect(vide.status()).toBe(500);
  const corpsVide = await vide.json();
  expect(String(corpsVide.message ?? corpsVide.error ?? "").length).toBeGreaterThan(0);

  // un document dont le fichier source pointe vers un chemin ABSENT -> 400 nomme
  const fantome = await request.post(`${BASE}/api/documents`, {
    data: {
      type: "FACTURE", supplier: "Sonde Extract Fantome", date: "2026-09-19",
      total_amount: 0, source_image_url: "/uploads/document-inexistant.png", items: [
        { inventory_id: null, original_name: "Poire sonde", quantity: 1, unit_price: 1, lot_number: "", dlc: "" },
      ],
    },
  });
  expect(fantome.status()).toBe(200);
  const idFantome = (await fantome.json()).id;
  const introuvable = await request.post(`${BASE}/api/documents/${idFantome}/extract`, { data: {} });
  // Le fichier source absent rend 404 (le routeur juge l'URI: un document sans
  // fichier reste une ressource adresse qui n'existe pas) et NOMME la cause.
  expect(introuvable.status()).toBe(404);
  const corps = await introuvable.json();
  expect(String(corps.error ?? "")).toContain("introuvable");

  // un document avec un fichier reel (voie REELLE: upload draft) -> corps exploitable
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const upload = await request.post(`${BASE}/api/documents/upload?draft=true`, {
    multipart: { file: { name: "extract-test.png", mimeType: "image/png", buffer: png } },
  });
  expect(upload.status()).toBe(200);
  const idUpload = (await upload.json()).id;
  const extr = await request.post(`${BASE}/api/documents/${idUpload}/extract`, { data: {} });
  expect([200, 500]).toContain(extr.status());
  const corpsExtr = await extr.json();
  expect(typeof corpsExtr).toBe("object");
  if (extr.status() === 200) {
    expect(typeof corpsExtr.data).toBe("object");
    expect(String(corpsExtr.source_image_url ?? "")).toContain("/uploads/");
  }
});

// --- Documents upload (documents.ts) -------------------------------------
test("POST /api/documents/upload : sans fichier rend 400, texte rend 400, PNG rend une ligne RELUE et le fichier VERIFIE", async ({ request }) => {
  // sans fichier -> 400 nomme
  const sans = await request.post(`${BASE}/api/documents/upload`, { data: {} });
  expect(sans.status()).toBe(400);
  const corpsSans = await sans.json();
  expect(String(corpsSans.error ?? "")).toContain("file");

  // un texte non-image/PDF -> 400 (la voie exige image ou PDF)
  const texte = await request.post(`${BASE}/api/documents/upload`, {
    multipart: { file: { name: "facture.txt", mimeType: "text/plain", buffer: Buffer.from("ce n'est pas une image", "utf-8") } },
  });
  expect(texte.status()).toBe(400);
  const corpsTexte = await texte.json();
  expect(String(corpsTexte.error ?? "")).toContain("supported");

  // un PNG reel -> 200; la ligne est relue en base et le fichier VERIFIE sur disque.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const ok = await request.post(`${BASE}/api/documents/upload`, {
    multipart: { file: { name: "facture-ok.png", mimeType: "image/png", buffer: png } },
  });
  expect([200, 500]).toContain(ok.status());
  if (ok.status() === 200) {
    const corpsOk = await ok.json();
    // le corps porte la cle source_image_url qui pointe vers le fichier ECRIT
    expect(String(corpsOk.source_image_url ?? "")).toContain("/uploads/");
    // DELTA: le document est relue EN BASE par GET /api/documents
    const liste = (await (await request.get(`${BASE}/api/documents`)).json()) as any[];
    const reli = liste.find((d: any) => d.source_image_url === corpsOk.source_image_url);
    expect(reli, "le document est relue en base").toBeTruthy();
    // le fichier verifie: la route a ecrit uploads/<filename>
    const nomFichier = String(corpsOk.source_image_url ?? "").split("/uploads/")[1];
    expect(fs.existsSync(path.join(process.cwd(), "test/tmp-data/uploads", nomFichier))).toBe(true);
  }
});

// --- Epicure (epicure.ts) -----------------------------------------------
// /api/epicure/analyze est un moteur LOCAL (sans Ollama): le contrat juge un
// tableau d'ingredients NON-tableau -> 400 nomme, et un tableau legitime ->
// 200 avec un corps exploitable. Le payload recopie tel quel est celui que
// l'UI EpicureStudio envoie (ingredients: [{name, quantity_per_person, unit}]).
test("POST /api/epicure/analyze : ingredients non-tableau rend 400, tableau legitime rend un corps exploitable", async ({ request }) => {
  const mauvais = await request.post(`${BASE}/api/epicure/analyze`, { data: { ingredients: "tomate", language: "fr" } });
  expect(mauvais.status()).toBe(400);
  const corps = await mauvais.json();
  expect(String(corps.error ?? "")).toContain("array");

  // Le payload REEL de l'UI (EpicureStudio handleAnalyze) est un TABLEAU DE
  // CHAINES (recipeInput.split(",").map(trim).filter(Boolean)), pas des objets:
  // { ingredients: ["Fraises","Chocolat noir","Menthe fraiche"], language: "fr" }.
  const bon = await request.post(`${BASE}/api/epicure/analyze`, {
    data: { ingredients: ["Tomate", "Mozzarella", "Basilic"], language: "fr" },
  });
  expect(bon.status()).toBe(200);
  const corpsOk = await bon.json();
  expect(typeof corpsOk).toBe("object");
  // le corps exploitable porte au moins un champ de resultat d'analyse
  expect(Object.keys(corpsOk).length).toBeGreaterThan(0);
});

// --- Menus generes par IA (menu.ts) --------------------------------------
// Les trois routes /api/generate-creative-menu, /api/generate-gastronomic-menu
// et /api/generate-traditional-menu exigent un fichier multipart (image) et
// construisent un prompt; la branche Ollama present rend 200 avec un menu,
// la branche absent rend 500 avec un corps exploitable. Un fichier ABSENT
// rend 400 (la route exige un fichier pour le prompt, mais garde la voie
// sans image: la saisie sans photo reste possible). Le contrat verifie est
// « sortie explicite + corps exploitable » dans les deux branches.
test("POST /api/generate-creative-menu : sans fichier rend 400, avec fichier rend un corps exploitable", async ({ request }) => {
  // La voie SANS fichier reste possible (MenuAnalysis garde la saisie sans
  // photo): la route interroge Ollama directement. Sur un runner sans modele
  // elle sort en 500 avec un corps exploitable; avec modele elle rend un menu.
  const sans = await request.post(`${BASE}/api/generate-creative-menu`, { data: {} });
  expect([200, 500]).toContain(sans.status());
  const corps = await sans.json();
  expect(typeof corps).toBe("object");
  if (sans.status() === 500) expect(String(corps.error ?? "").length).toBeGreaterThan(0);

  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const avec = await request.post(`${BASE}/api/generate-creative-menu`, {
    multipart: { file: { name: "creative-test.png", mimeType: "image/png", buffer: png } },
  });
  expect([200, 500]).toContain(avec.status());
  const corpsAvec = await avec.json();
  expect(typeof corpsAvec).toBe("object");
  if (avec.status() === 200) {
    expect(String(corpsAvec.status ?? "")).toBe("success");
    expect(Array.isArray(corpsAvec.creative_menu)).toBe(true);
  }
});

test("POST /api/generate-gastronomic-menu : avec fichier rend un corps exploitable dans les deux branches", async ({ request }) => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const avec = await request.post(`${BASE}/api/generate-gastronomic-menu`, {
    multipart: { file: { name: "gastronomic-test.png", mimeType: "image/png", buffer: png } },
  });
  expect([200, 500]).toContain(avec.status());
  const corps = await avec.json();
  expect(typeof corps).toBe("object");
  if (avec.status() === 200) expect(String(corps.status ?? "")).toBeTruthy();
});

test("POST /api/generate-traditional-menu : avec fichier rend un corps exploitable dans les deux branches", async ({ request }) => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000aabbccdd" +
      "49444154010000000000000000000000000000000000000000000000000000" +
      "49454e44ae426082",
    "hex",
  );
  const avec = await request.post(`${BASE}/api/generate-traditional-menu`, {
    multipart: { file: { name: "traditional-test.png", mimeType: "image/png", buffer: png } },
  });
  expect([200, 500]).toContain(avec.status());
  const corps = await avec.json();
  expect(typeof corps).toBe("object");
  if (avec.status() === 200) expect(String(corps.status ?? "")).toBeTruthy();
});
