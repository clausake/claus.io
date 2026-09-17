// Test e2e des routes critiques : démarre le serveur (USER_DATA_PATH isolé)
// et vérifie le CRUD + le middleware de licence.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
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
