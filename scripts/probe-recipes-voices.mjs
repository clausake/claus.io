// Sonde brute des VOIES d'ecriture d'une RECETTE (POST /api/recipes + PUT /api/recipes/:id
// + DELETE /api/recipes/:id) sur les payloads que l'UI ENVOIE REELLEMENT, releves dans le
// code des composants (et non des payloads inventes par la sonde):
//   R1 FichesTechniques.tsx handleFileScan (~1650) : apres le scan IA il poste
//      {name: recipeName, category: recipe.categorie || "decompose",
//       ingredients: [{inventory_name: ing.name || ing.ingredient || "Ingredient",
//                      quantity_per_person: ing.quantite || ing.qte || 0,
//                      unit: ing.unite || ing.unit || "g"}],
//       preparation_steps: recipe.preparation_steps || null,
//       allergens: recipe.allergens || [], source_image_url: null}.
//   R2 MenuAnalysis.tsx saveGeneratedRecipes (~4612) : poste {name, category,
//       dish_type, ingredients: [{inventory_name, quantity_per_person, unit}],
//       preparation_steps: recipe.preparation_steps || recipe.preparation || null,
//       source_image_url: recipe.source_image_url || null, allergens: [], skip_svg: true}.
//   R3 MenuAnalysis.tsx handleSaveFicheToBook (~23942) : poste {name, category,
//       ingredients: [{inventory_name, quantity_per_person, inventory_id: null}],
//       preparation_steps: fiche.etapes || [{step_order: 1, instructions: "A definir"}]}
//       -- et CE champ est un TABLEAU d'objets, pas une chaine.
//   R4 FichesTechniques.tsx saveRecipe manual- (~11789) : poste {name, category,
//       ingredients: recipe.ingredients (des objets COMPLETS, avec unit, unit_price, id),
//       preparation_steps}.
//   R5 FichesTechniques.tsx PUT /api/recipes/:id (~11789) : {name, ingredients:
//       [{inventory_name, inventory_id, quantity_per_person}], preparation_steps}.
//   R6 FichesTechniques.tsx deleteRecipe (~10884) : DELETE /api/recipes/:id sans corps.
//
// Ce que la sonde doit trancher (et non ce que je suppose):
//   S1 R3: une preparation_steps en TABLEAU sort-elle en 400, ou est-elle
//      AVALEE en "" (le champ schema est TEXT et optionalString rend undefined
//      sur une non-chaine) — et la recette reste-t-elle sans etapes chez le chef?
//   S2 un ingredient quantity_per_person en TEXTE ("beaucoup") survit-il dans une
//      colonne REAL (ing.quantity_per_person || 0)? Et la relecture?
//   S3 un ingredient quantity_per_person ABSENT (le binding undefined sur une
//      colonne NOT NULL) : 500 ou une ligne? Le put a deja eu ce piege (S1 du
//      PUT inventaire).
//   S4 un ingredient inventory_name ABSENT (le UI de l'editeur PUT n'a pas de
//      defaut) : NOT NULL sur inventory.name -> 500?
//   S5 DELETE d'un id inconnu : 200 sur une ligne qui ne part pas? (le PUT
//      inventory avait le meme piege; ici DELETE FROM recipes retourne 0 ligne)
//   S6 la reponse recite-t-elle le corps au lieu de relire la base?
//   S7 l'effet de bord inventaire: la route cree une ligne inventory pour chaque
//      ingredient sans match. Que rend GET /api/inventory et le filtre d'alerte?
//   S8 allergens non-tableau : JSON.stringify(string) entre-t-il en base comme
//      garbage, et la relecture JSON.parse-t-elle ou pas?
//   S9 language non-chaine (nombre) : la recette devient-elle INVISIBLE dans
//      GET /api/recipes (WHERE language = ? compare TEXT a TEXT)?
//   S10 PUT /api/recipes/:id avec un ingredient inventory_name absent : NOT NULL.
//   S11 l'id de DELETE d'une recette qui a des ingredients: les sous-lignes
//      partent-elles avec la recette (DELETE FROM recipe_ingredients)?

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

const DATA_DIR = path.join(process.cwd(), "test", "tmp-probe-recipes");
const TOKEN = "probe-recipes";

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

const recipes = async () => {
  const r = await fetch(`${BASE}/api/recipes`);
  return await r.json();
};
const inventaire = async () => {
  const r = await fetch(`${BASE}/api/inventory`);
  return await r.json();
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
const recetteLu = async (id) => {
  const tout = await recipes();
  return (Array.isArray(tout) ? tout : []).find((x) => x.id === id) || null;
};
const relIngredient = async (recetteId) => {
  const recette = await recetteLu(recetteId);
  return recette ? recette.ingredients : null;
};
const inventoryParNom = async (nom) => {
  const tout = await inventaire();
  return (Array.isArray(tout) ? tout : []).filter((i) => i.name === nom);
};
const mone = (n) => typeof n === "number" && Number.isFinite(n) ? n : String(n);

// --- R1 : la voie scan (FichesTechniques handleFileScan) telle qu'elle poste ---
const r1 = await poste("R1 voie scan (fiche technique IA)", {
  name: "Risotto Sonde",
  category: "decompose",
  ingredients: [
    { inventory_name: "Riz Sonde", quantity_per_person: 0.15, unit: "kg" },
    { inventory_name: "Beurre Sonde", quantity_per_person: 0.02, unit: "kg" },
  ],
  preparation_steps: "Cuire le riz.\nAjouter le beurre.",
  allergens: ["gluten"],
  source_image_url: null,
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r1.corps.id)).slice(0, 260)}`);
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r1.corps.id)).slice(0, 240)}`);
console.log(`    inventory_avec_nom[Riz Sonde]=${JSON.stringify(await inventoryParNom("Riz Sonde")).slice(0, 160)}`);

// --- R2 : la voie saveGeneratedRecipes (MenuAnalysis) telle qu'elle poste ----
const r2 = await poste("R2 voie saveGeneratedRecipes (MenuAnalysis)", {
  name: "Filet Sonde",
  category: "Plat",
  dish_type: "plat",
  ingredients: [
    { inventory_name: "Filet Sonde", quantity_per_person: 0.2, unit: "kg" },
  ],
  preparation_steps: null,
  source_image_url: null,
  allergens: [],
  skip_svg: true,
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r2.corps.id)).slice(0, 220)}`);

// --- R3 : la voie handleSaveFicheToBook (MenuAnalysis) -- preparation_steps en TABLEAU
const r3 = await poste("R3 voie handleSaveFicheToBook (MenuAnalysis, steps en TABLEAU)", {
  name: "Soupe Sonde",
  category: "Non classé",
  ingredients: [
    { inventory_name: "Carotte Sonde", quantity_per_person: 0.1, inventory_id: null },
  ],
  preparation_steps: [{ step_order: 1, instructions: "A definir" }],
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r3.corps.id)).slice(0, 240)}`);
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r3.corps.id)).slice(0, 220)}`);
console.log(`    inventory_avec_nom[Carotte Sonde]=${JSON.stringify(await inventoryParNom("Carotte Sonde")).slice(0, 140)}`);

// --- R4 : la voie saveRecipe manual- (FichesTechniques) ----------------------
const r4 = await poste("R4 voie saveRecipe manual- (FichesTechniques)", {
  name: "Pate Sonde",
  category: "Non classé",
  ingredients: [
    { id: "ing-sonde-1", name: "Farine Sonde", inventory_name: "Farine Sonde", inventory_id: null, quantity_per_person: 0.5, unit: "kg", unit_price: 0 },
  ],
  preparation_steps: "",
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r4.corps.id)).slice(0, 200)}`);

// --- S2 : quantity_per_person en TEXTE --------------------------------------
const r5 = await poste("S2 quantity_per_person='beaucoup'", {
  name: "Sonde Texte Q", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde Texte Q", quantity_per_person: "beaucoup", unit: "kg" }],
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r5.corps.id)).slice(0, 220)}`);
const invT = await inventoryParNom("Sonde Texte Q");
console.log(`    inventory[0] quantity=${invT.length ? mone(invT[0].quantity) : "AUCUNE"}`);

// --- S3 : quantity_per_person ABSENT (NOT NULL sur la colonne) --------------
const r6 = await poste("S3 quantity_per_person absent (undefined)", {
  name: "Sonde Absent Q", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde Absent Q", unit: "kg" }],
  preparation_steps: "",
});
console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r6.corps.id)).slice(0, 220)}`);

// --- S3b : inventory_name ABSENT (NOT NULL sur inventory.name) --------------
const r7 = await poste("S3b inventory_name absent (undefined)", {
  name: "Sonde Absent N", category: "Plat", dish_type: "plat",
  ingredients: [{ quantity_per_person: 0.2, unit: "kg" }],
  preparation_steps: "",
});
console.log(`    recette_relue=${JSON.stringify(await recetteLu(r7.corps.id)).slice(0, 200)}`);

// --- S5 : DELETE d'un id inconnu ------------------------------------------
const idFantome = "recette-fantome-" + Date.now();
{
  const r = await fetch(`${BASE}/api/recipes/${idFantome}`, { method: "DELETE" });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S5 DELETE id inconnu\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 120)}`);
}

// --- S8 : allergens non-tableau ------------------------------------------
const r8 = await poste("S8 allergens='gluten' (une chaine)", {
  name: "Sonde Allergens Texte", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde Allergens Texte", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
  allergens: "gluten",
});
console.log(`    recette_relue.allergens=${JSON.stringify(((await recetteLu(r8.corps.id))?.allergens) ?? "<recette absente>").slice(0, 120)}`);

// --- S9 : language nombre --------------------------------------------------
const r9 = await poste("S9 language=42 (un nombre)", {
  name: "Sonde Language Nombre", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde Language Nombre", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
  language: 42,
});
const lu9 = await recetteLu(r9.corps.id);
console.log(`    recette_relue_visible=${lu9 ? "OUI" : "NON (WHERE language = ? compare TEXT a TEXT)"}`);

// --- S10 : PUT /api/recipes/:id avec inventory_name absent -----------------
const r10 = await poste("R5 precursier pour S10", {
  name: "Sonde PUT Base", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde PUT Base", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
{
  const r = await fetch(`${BASE}/api/recipes/${r10.corps.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Sonde PUT Base",
      ingredients: [{ inventory_id: null, quantity_per_person: 0.1 }],
      preparation_steps: "",
    }),
  });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S10 PUT inventory_name absent\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 140)}`);
  console.log(`    ingredients_relus=${JSON.stringify(await relIngredient(r10.corps.id)).slice(0, 220)}`);
}

// --- S11 : DELETE d'une recette qui a des ingredients -----------------------
const r11 = await poste("R1 precursier pour S11", {
  name: "Sonde Delete Ingredients", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Sonde Delete Ing", quantity_per_person: 0.1, unit: "kg" }],
  preparation_steps: "",
});
{
  const r = await fetch(`${BASE}/api/recipes/${r11.corps.id}`, { method: "DELETE" });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S11 DELETE avec ingredients\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 100)}`);
  console.log(`    recette_relue=${JSON.stringify(await recetteLu(r11.corps.id)).slice(0, 80)}`);
}

// --- S11b : DELETE enleve les lignes d inventaire creees PAR LA RECETTE ----
{
  const apres = await inventoryParNom("Sonde Delete Ing");
  console.log(`\n### S11b DELETE inventory[0] Sonde Delete Ing\n    lignes_restantes=${apres.length} (attendu=0 si la DELETE emporte les lignes creees par la recette)`);
}

// --- S11c : DELETE d une recette qui PARTAGE un ingredient ------------------
const r12 = await poste("R2 precursier pour S11c", {
  name: "Sonde Delete Partage A", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Riz Sonde", quantity_per_person: 0.2, unit: "kg" }],
  preparation_steps: "",
});
const r13 = await poste("R2 precursier pour S11c", {
  name: "Sonde Delete Partage B", category: "Plat", dish_type: "plat",
  ingredients: [{ inventory_name: "Riz Sonde", quantity_per_person: 0.2, unit: "kg" }],
  preparation_steps: "",
});
{
  const r = await fetch(`${BASE}/api/recipes/${r13.corps.id}`, { method: "DELETE" });
  let c = null; try { c = await r.json(); } catch { c = "<pas de json>"; }
  console.log(`\n### S11c DELETE Partage B\n    status_http=${r.status} corps=${JSON.stringify(c).slice(0, 120)}`);
  console.log(`    inventory_avec_nom[Riz Sonde]=${JSON.stringify(await inventoryParNom("Riz Sonde")).slice(0, 140)}`);
  console.log(`    recette_relue[Partage A]=${JSON.stringify(await recetteLu(r12.corps.id)).slice(0, 140)}`);
}

server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 600));
console.log("\nSONDE JOUEE (rc=0 = elle s'est jouee; les verdicts sont ci-dessus).");
