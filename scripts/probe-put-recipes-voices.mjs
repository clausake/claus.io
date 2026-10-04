// Sonde PUT /api/recipes/:id (sprint 12) : les voies PUT de la UI
// (FichesTechniques.tsx saveRecipe ~11789 — editeur PUT — et PUT /api/recipes/:id
// avec inventory_name absent/inconnu) et leur morsure. Ce fichier est INDEPENDANT
// de probe-recipes-voices.mjs (qui couvre POST/DELETE/scan). Il se joue SEUL
// avec un DATA_DIR neuf.
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-put-recipes");
const TOKEN = "probe-put-recipes";

async function portLibre() {
  return await new Promise((resolve, reject) => {
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
  env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: TOKEN },
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

const recetteLu = async (id) => {
  const r = await fetch(`${BASE}/api/recipes`);
  const tout = await r.json();
  return (Array.isArray(tout) ? tout : []).find((x) => x.id === id) || null;
};
const relIngredient = async (recetteId) => {
  const recette = await recetteLu(recetteId);
  return recette ? recette.ingredients : null;
};
const inventoryParNom = async (nom) => {
  const r = await fetch(`${BASE}/api/inventory`);
  const tout = await r.json();
  return (Array.isArray(tout) ? tout : []).filter((i) => i.name === nom);
};
const poste = async (label, corps) => {
  const r = await fetch(`${BASE}/api/recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  let c = null;
  try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### ${label}`);
  console.log(`    status_http=${r.status}  corps=${JSON.stringify(c).slice(0, 160)}`);
  return { http: r.status, corps: c };
};
const poute = async (label, id, corps) => {
  const r = await fetch(`${BASE}/api/recipes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  let c = null;
  try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### ${label}`);
  console.log(`    status_http=${r.status}  corps=${JSON.stringify(c).slice(0, 160)}`);
  return { http: r.status, corps: c };
};

// --- P1 : PUT valide (nom + ingredients + etapes) ---

// --- P1 : PUT valide (nom + ingredients + etapes) ----------------------------
const r1 = await poste("R1 precursier pour P1", {
  name: "Sonde PUT P1", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P1", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
const p1 = await poute("P1 PUT valide", r1.corps.id, {
  name: "Sonde PUT P1 RENOMME",
  ingredients: [{ inventory_name: "Riz Sonde", quantity_per_person: 0.3, unit: "kg" }],
  preparation_steps: "Cuire le riz. Ajouter le beurre.",
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r1.corps.id)).slice(0, 240)}`);
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r1.corps.id)).slice(0, 220)}`);

// --- P2 : PUT avec name absent ----------------------------------------------
const r2 = await poste("R1 precursier pour P2", {
  name: "Sonde PUT P2", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P2", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P2 PUT name absent", r2.corps.id, {
  ingredients: [{ inventory_name: "Sonde PUT P2", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r2.corps.id)).slice(0, 200)}`);

// --- P3 : PUT avec preparation_steps non-chaine ------------------------------
const r3 = await poste("R1 precursier pour P3", {
  name: "Sonde PUT P3", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P3", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P3 PUT preparation_steps=42", r3.corps.id, {
  name: "Sonde PUT P3",
  ingredients: [{ inventory_name: "Sonde PUT P3", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: 42,
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r3.corps.id)).slice(0, 200)}`);

// --- P4 : PUT quantity_per_person='beaucoup' ---------------------------------
const r4 = await poste("R1 precursier pour P4", {
  name: "Sonde PUT P4", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P4", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P4 PUT quantity_per_person='beaucoup'", r4.corps.id, {
  name: "Sonde PUT P4",
  ingredients: [{ inventory_name: "Sonde PUT P4", quantity_per_person: "beaucoup", unit: "kg" }],
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r4.corps.id)).slice(0, 220)}`);

// --- P5 : PUT inventory_name absent -----------------------------------------
const r5 = await poste("R1 precursier pour P5", {
  name: "Sonde PUT P5", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P5", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P5 PUT inventory_name absent", r5.corps.id, {
  name: "Sonde PUT P5",
  ingredients: [{ quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r5.corps.id)).slice(0, 220)}`);

// --- P6 : PUT ingredients non-tableau ----------------------------------------
const r6 = await poste("R1 precursier pour P6", {
  name: "Sonde PUT P6", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P6", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P6 PUT ingredients='beaucoup' (une chaine)", r6.corps.id, {
  name: "Sonde PUT P6",
  ingredients: "beaucoup",
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r6.corps.id)).slice(0, 220)}`);

// --- P7 : PUT quantity_per_person absent -------------------------------------
const r7 = await poste("R1 precursier pour P7", {
  name: "Sonde PUT P7", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT P7", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
await poute("P7 PUT quantity_per_person absent", r7.corps.id, {
  name: "Sonde PUT P7",
  ingredients: [{ inventory_name: "Sonde PUT P7", unit: "kg" }],
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r7.corps.id)).slice(0, 220)}`);

// --- P8 : PUT d'un id inconnu ------------------------------------------------
const idFantome = "recette-fantome-" + Date.now();
await poute("P8 PUT id inconnu", idFantome, {
  name: "Sonde PUT Fantome",
  ingredients: [{ inventory_name: "Sonde PUT Fantome", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(idFantome)).slice(0, 120)}`);

// --- S12 : POST /api/recipes/:id/save sur id inconnu -----------------------
{
  const r = await fetch(`${BASE}/api/recipes/recette-fantome-save-${Date.now()}/save`, { method: "PUT" });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S12 /save sur id inconnu\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 120)}`);
}

// --- S13 : POST /api/recipes/:id/generate-steps sur id inconnu --------------
{
  const r = await fetch(`${BASE}/api/recipes/recette-fantome-steps-${Date.now()}/generate-steps`, { method: "POST" });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S13 /generate-steps sur id inconnu\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 120)}`);
}

server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s'est jouee; les verdicts sont ci-dessus).");
