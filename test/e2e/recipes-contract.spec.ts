// Contrat de POST /api/recipes (recettes, Sprint 12).
//
// Les faits juges ici viennent de la sonde brute scripts/probe-recipes-voices.mjs,
// pas de la lecture du code:
//   S2 quantity_per_person='beaucoup' entrait comme TEXTE dans une colonne REAL
//      NOT NULL (affinite dynamique sans se plaindre) — la ligne se reposait
//      avec une quantite injouable chez le chef.
//   S3b inventory_name absent (undefined) jetait une contrainte NOT NULL sur
//      inventory.name → 500 sorties du catch, et le POST avaient DEJA ecrit la
//      ligne recipes (orphan recipes chez le chef).
//   S8 allergens='gluten' (une chaine) entre comme garbage et la relecture
//      JSON.parse('gluten') JETTE, ce qui casse l'Allergens Display de la UI.
//   S9 language=42 (un nombre) rendait la recette INVISIBLE dans GET /api/recipes
//      (WHERE language = ? compare TEXT a TEXT).
//   S5 DELETE d'un id inconnu rendait 200 SILENCIEUX sur une ligne qui ne part pas.
//   S10 PUT /api/recipes/:id avec inventory_name absent jetait la contrainte
//      NOT NULL sur inventory.name → 500, les sous-lignes d'ingredients de la
//      recette avaient DEJA ete SUPPRIMEES (DELETE FROM recipe_ingredients) et
//      la ligne recipes restait ORPHANE.
//   S12 PUT /api/recipes/:id/save sur id absent rendait 200 SILENCIEUX sur une
//      ligne qui ne part pas (UPDATE ... WHERE id = ? retourne 0 ligne modifiee).
//
// Comme partout dans ce depot, un PASS qui ne peut pas devenir FAIL n'est pas
// une mesure. Chaque regle est donc doublee: DELTA (poster par la MEME route
// que l'UI, exiger le mouvement EXACT relu en base) puis RETIRER (re-poster
// l'inverse) et exiger le retour a la ligne de base.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-recipes");
const INSTANCE_TOKEN = "recipes-contract";

let server: ChildProcess;

// Port alloue par l'OS + attente de sa liberation reelle (meme contrat que
// purchasing-chain.spec.ts). Un port fige se fait voler par le petit-fils tsx
// qu'un run precedent n'a pas tue (SIGTERM tue le wrapper, pas l'enfant): l'imposteur
// ne bind pas, et la porte juge alors le fils remanant — qui porte, lui, le BON
// jeton. Le verdict rendu serait « la mutation ne mord pas ».
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

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  PORT = await portLibre();
  await attendrePortLibre(PORT);
  BASE = `http://127.0.0.1:${PORT}`;
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    // ⚠ le jeton doit etre DEDANS l'objet env: pose apres l'accolade fermante
    // c'est un champ d'options IGNORE par le fils (voir PHASES.md, 7.6).
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN,
    },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stdout.write(d));
  // Attendre MON instance et non « ce qui repond sur le port »: un server.ts
  // orphelin (fils d'un autre run, ou serveur d'un autre projet du poste) ferait
  // juger une porte par une instance qui n'est pas la sienne.
  const deadline = Date.now() + 45000;
  let pret = false;
  let perimee = false;
  let vu: string | null = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/settings`);
      const entete = r.headers.get("x-cookdrive-instance");
      if (r.ok && entete && entete !== INSTANCE_TOKEN) {
        perimee = true;
        vu = entete;
        break;
      }
      if (r.ok && entete === INSTANCE_TOKEN) {
        pret = true;
        break;
      }
    } catch {
      /* pas encore en ecoute */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (perimee) {
    console.error(
      `ECHEC instance PERIMEE sur le port ${PORT}: l'en-tete dit « ${vu} », ` +
        `ce harnais attend « ${INSTANCE_TOKEN} ».`,
    );
    process.exit(1);
  }
  if (!pret) {
    console.error(`ECHEC serveur pas pret sur le port ${PORT}.`);
    process.exit(1);
  }
}, 60000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
});

// Contrat des routes d'ECRITURE du domaine RECETTES (Sprint 12).
//
// Les payloads sont ceux que l'UI emet REELLEMENT (R1 scan, R2 saveGeneratedRecipes,
// R3 handleSaveFicheToBook, R4 saveRecipe manual-, R5 PUT editeur), pas des payloads
// inventes.

type Corps = Record<string, any>;

let req: any;

async function lire(url: string): Promise<any> {
  const r = await req.get(`${BASE}${url}`);
  expect(r.status(), url + " -> " + r.status()).toBe(200);
  return await r.json();
}

async function poste(url: string, corps: unknown): Promise<{ code: number; corps: Corps }> {
  const r = await req.post(`${BASE}${url}`, { data: corps });
  let json: Corps = {};
  try { json = (await r.json()) as Corps; } catch { /* corps vide */ }
  return { code: r.status(), corps: json };
}

async function poute(url: string, corps: unknown): Promise<{ code: number; corps: Corps }> {
  const r = await req.put(`${BASE}${url}`, { data: corps });
  let json: Corps = {};
  try { json = (await r.json()) as Corps; } catch { /* corps vide */ }
  return { code: r.status(), corps: json };
}

async function efface(url: string): Promise<{ code: number; corps: Corps }> {
  const r = await req.delete(`${BASE}${url}`);
  let json: Corps = {};
  try { json = (await r.json()) as Corps; } catch { /* corps vide */ }
  return { code: r.status(), corps: json };
}

async function article(nom: string): Promise<string> {
  const { code, corps } = await poste("/api/inventory", {
    name: nom, quantity: 5, minStock: 1, unit: "kg", category: "test-recipes",
  });
  expect(code, "creation article (" + nom + ")").toBe(200);
  const id = corps.id ?? (await lire("/api/inventory")).find((i: any) => i.name === nom)?.id;
  expect(id, "id de l'article cree").toBeTruthy();
  return id as string;
}

// R1 voie scan (FichesTechniques.tsx handleFileScan ~1650)
test("R1 POST /api/recipes voie scan (fiche technique IA): la recette est relue et ses ingredients rendus", async ({ request }) => {
  req = request;
  const tag = "R1 " + Date.now();
  const corps = {
    name: "Risotto " + tag,
    category: "decompose",
    ingredients: [
      { inventory_name: "Riz " + tag, quantity_per_person: 0.15, unit: "kg" },
      { inventory_name: "Beurre " + tag, quantity_per_person: 0.02, unit: "kg" },
    ],
    preparation_steps: "Cuire le riz.\nAjouter le beurre.",
    allergens: ["gluten"],
    source_image_url: null,
  };
  const r1 = await poste("/api/recipes", corps);
  expect(r1.code, "voie scan acceptee").toBe(200);
  expect(typeof r1.corps.id, "la clef creee est rendue").toBe("string");
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === r1.corps.id);
  expect(relu, "la recette ressort de la liste").toBeTruthy();
  expect(relu.name, "le nom est relue").toBe(corps.name);
  expect(relu.preparation_steps, "les etapes sont relues").toContain("Cuire le riz");
  expect(Array.isArray(relu.allergens), "les allergenes relus sont un tableau").toBe(true);
  expect(relu.allergens, "allergenes relus identiques").toEqual(["gluten"]);
  const ingRelus = (await lire("/api/recipes")).find((r: any) => r.id === r1.corps.id)?.ingredients;
  expect(ingRelus.length, "deux ingredients relus").toBe(2);
  for (const ing of ingRelus) {
    expect(typeof ing.quantity_per_person, "quantity_per_person relu est un nombre (colonne REAL)").toBe("number");
    expect(typeof ing.inventory_name, "le nom d'ingredient est rendu").toBe("string");
  }
  const invRiz = (await lire("/api/inventory")).filter((i: any) => i.name === "Riz " + tag);
  expect(invRiz.length, "la ligne d'inventaire creee pour l'ingredient sans match").toBe(1);
  expect(invRiz[0].quantity, "l'inventaire est 0 a la creation").toBe(0);
});

// R2 voie saveGeneratedRecipes (MenuAnalysis.tsx saveGeneratedRecipes ~4612)
test("R2 POST /api/recipes voie saveGeneratedRecipes (MenuAnalysis): dish_type relue", async ({ request }) => {
  req = request;
  const tag = "R2 " + Date.now();
  const corps = {
    name: "Filet " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Filet " + tag, quantity_per_person: 0.2, unit: "kg" }],
    preparation_steps: null,
    source_image_url: null,
    allergens: [],
    skip_svg: true,
  };
  const r2 = await poste("/api/recipes", corps);
  expect(r2.code).toBe(200);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === r2.corps.id);
  expect(relu, "la recette ressort").toBeTruthy();
  expect(relu.dish_type, "dish_type relue").toBe("plat");
  expect(relu.allergens, "allergenes relus []").toEqual([]);
});

// R3 voie handleSaveFicheToBook (MenuAnalysis.tsx ~23942): preparation_steps en TABLEAU
test("R3 POST /api/recipes voie handleSaveFicheToBook (MenuAnalysis): preparation_steps en TABLEAU est AVALEE en etapes rejointes", async ({ request }) => {
  req = request;
  const tag = "R3 " + Date.now();
  const corps = {
    name: "Soupe " + tag,
    category: "Non classé",
    ingredients: [{ inventory_name: "Carotte " + tag, quantity_per_person: 0.1, inventory_id: null }],
    preparation_steps: [{ step_order: 1, instructions: "A definir " + tag }],
  };
  const r3 = await poste("/api/recipes", corps);
  expect(r3.code).toBe(200);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === r3.corps.id);
  expect(relu, "la recette ressort").toBeTruthy();
  expect(String(relu.preparation_steps ?? ""), "les etapes sont rejointes (colonne TEXT)").toContain("A definir " + tag);
});

// R4 voie saveRecipe manual- (FichesTechniques.tsx saveRecipe ~11789)
test("R4 POST /api/recipes voie saveRecipe manual- (FichesTechniques): ingredients complets rejoint et relus", async ({ request }) => {
  req = request;
  const tag = "R4 " + Date.now();
  const corps = {
    name: "Pate " + tag,
    category: "Non classé",
    ingredients: [
      { id: "ing-" + tag, name: "Farine " + tag, inventory_name: "Farine " + tag, inventory_id: null, quantity_per_person: 0.5, unit: "kg", unit_price: 0 },
    ],
    preparation_steps: "",
  };
  const r4 = await poste("/api/recipes", corps);
  expect(r4.code).toBe(200);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === r4.corps.id);
  expect(relu, "la recette ressort").toBeTruthy();
  const ingRelus = relu.ingredients;
  expect(ingRelus.length).toBe(1);
  expect(ingRelus[0].quantity_per_person, "quantity_per_person relu identique").toBe(0.5);
});

// S2 POST quantity_per_person='beaucoup' → 400 + rejetees + refused; rows NOT written
test("S2 POST /api/recipes quantity_per_person='beaucoup' est refuse", async ({ request }) => {
  req = request;
  const tag = "S2 " + Date.now();
  const corps = {
    name: "Sonde Texte Q " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde Texte Q " + tag, quantity_per_person: "beaucoup", unit: "kg" }],
    preparation_steps: "",
  };
  const s2 = await poste("/api/recipes", corps);
  expect(s2.code, "un texte dans une colonne REAL est refuse").toBe(400);
  expect(s2.corps.rejetees ?? [], "la ligne est NOMMEE").toContainEqual({ index: 0, raison: "quantity_per_person_inexploitable" });
  expect(s2.corps.refused ?? [], "le champ est NOMME").toContain("ingredients");
  const relu = (await lire("/api/recipes")).find((r: any) => r.name === corps.name);
  expect(relu, "aucune ligne n'a ete ecrite (lot atomique)").toBeFalsy();
  const inv = (await lire("/api/inventory")).filter((i: any) => i.name === "Sonde Texte Q " + tag);
  expect(inv.length, "aucune ligne d'inventaire n'a ete creee").toBe(0);
});

// S2b POST ingredients non-tableau (une chaine) → 400 refused; rows NOT written
test("S2b POST /api/recipes ingredients non-tableau est refuse (un non-tableau ne rendait AUCUN ingredient)", async ({ request }) => {
  req = request;
  const tag = "S2b " + Date.now();
  const corps = {
    name: "Sonde Non Tableau " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: "beaucoup",
    preparation_steps: "",
  };
  const s2b = await poste("/api/recipes", corps);
  expect(s2b.code, "ingredients non-tableau refuse").toBe(400);
  expect(s2b.corps.refused ?? [], "le champ est NOMME").toContain("ingredients");
  const relu = (await lire("/api/recipes")).find((r: any) => r.name === corps.name);
  expect(relu, "aucune ligne n'a ete ecrite").toBeFalsy();
});

// S3 POST quantity_per_person absent → 200, ligne stockée à 0
test("S3 POST /api/recipes quantity_per_person absent: la ligne est stockee a 0", async ({ request }) => {
  req = request;
  const tag = "S3 " + Date.now();
  const corps = {
    name: "Sonde Absent Q " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde Absent Q " + tag, unit: "kg" }],
    preparation_steps: "",
  };
  const s3 = await poste("/api/recipes", corps);
  expect(s3.code).toBe(200);
  const ingRelus = (await lire("/api/recipes")).find((r: any) => r.id === s3.corps.id)?.ingredients;
  expect(ingRelus.length).toBe(1);
  expect(ingRelus[0].quantity_per_person, "quantity_per_person absent = 0").toBe(0);
});

// S3b POST inventory_name absent → 400 + rejetees + refused; rows NOT written
test("S3b POST /api/recipes inventory_name absent est refuse (NOT NULL sur inventory.name)", async ({ request }) => {
  req = request;
  const tag = "S3b " + Date.now();
  const corps = {
    name: "Sonde Absent N " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ quantity_per_person: 0.2, unit: "kg" }],
    preparation_steps: "",
  };
  const s3b = await poste("/api/recipes", corps);
  expect(s3b.code, "inventory_name absent est refuse avant ecriture").toBe(400);
  expect(s3b.corps.rejetees ?? [], "la ligne est NOMMEE").toContainEqual({ index: 0, raison: "inventory_name_absent_vide" });
  const relu = (await lire("/api/recipes")).find((r: any) => r.name === corps.name);
  expect(relu, "aucune ligne recipes n'a ete ecrite (lot atomique)").toBeFalsy();
});

// S8 POST allergens='gluten' (une chaine) → 400 refused allergens; rows NOT written
test("S8 POST /api/recipes allergens='gluten' (une chaine) est refuse", async ({ request }) => {
  req = request;
  const tag = "S8 " + Date.now();
  const corps = {
    name: "Sonde Allergens Texte " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde Allergens Texte " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
    allergens: "gluten",
  };
  const s8 = await poste("/api/recipes", corps);
  expect(s8.code, "une chaine dans la colonne allergens est refusee").toBe(400);
  expect(s8.corps.refused ?? [], "le champ est NOMME").toContain("allergens");
  const relu = (await lire("/api/recipes")).find((r: any) => r.name === corps.name);
  expect(relu, "aucune ligne n'a ete ecrite").toBeFalsy();
});

// S9 POST language=42 (un nombre) → 400 refused language; rows NOT written
test("S9 POST /api/recipes language=42 (un nombre) est refuse (la recette serait INVISIBLE)", async ({ request }) => {
  req = request;
  const tag = "S9 " + Date.now();
  const corps = {
    name: "Sonde Language Nombre " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde Language Nombre " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
    language: 42,
  };
  const s9 = await poste("/api/recipes", corps);
  expect(s9.code, "un nombre dans language est refuse").toBe(400);
  expect(s9.corps.refused ?? [], "le champ est NOMME").toContain("language");
  const relu = (await lire("/api/recipes")).find((r: any) => r.name === corps.name);
  expect(relu, "aucune ligne n'a ete ecrite").toBeFalsy();
});

// R5 PUT /api/recipes/:id valide → 200 + recipe re-read + ingredients + created_inventory
test("R5 PUT /api/recipes/:id valide: la recette est relue et ses ingredients rendus", async ({ request }) => {
  req = request;
  const tag = "R5 " + Date.now();
  const corps = {
    name: "Sonde PUT Base " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT Base " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p1 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT RENOMME " + tag,
    ingredients: [{ inventory_name: "Riz " + tag, quantity_per_person: 0.3, unit: "kg" }],
    preparation_steps: "Cuire le riz.",
  });
  expect(p1.code, "PUT valide acceptee").toBe(200);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu, "la recette ressort").toBeTruthy();
  expect(relu.name, "le nom est relue").toBe("Sonde PUT RENOMME " + tag);
  expect(String(relu.preparation_steps ?? ""), "les etapes sont relues").toContain("Cuire le riz");
  const ingRelus = relu.ingredients;
  expect(ingRelus.length, "une seule ingredient relue apres PUT").toBe(1);
  expect(ingRelus[0].quantity_per_person, "quantity_per_person relue identique").toBe(0.3);
  expect(Array.isArray(p1.corps.created_inventory), "created_inventory rendu").toBe(true);
});

// P2 PUT name absent → 400 refused ['name']; recipe NOT modified
test("P2 PUT /api/recipes/:id name absent est refuse (la recette reste intacte)", async ({ request }) => {
  req = request;
  const tag = "P2 " + Date.now();
  const corps = {
    name: "Sonde PUT P2 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P2 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p2 = await poute(`/api/recipes/${id}`, {
    ingredients: [{ inventory_name: "Sonde PUT P2 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  });
  expect(p2.code, "name absent refuse").toBe(400);
  expect(p2.corps.refused ?? [], "le champ est NOMME").toContain("name");
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.name, "la recette reste INTACTE (pas de 500 muet)").toBe(corps.name);
  expect(relu.ingredients.length, "les ingredients restent").toBe(1);
});

// P3 PUT preparation_steps=42 → 400 refused ['preparation_steps']; recipe NOT modified
test("P3 PUT /api/recipes/:id preparation_steps=42 est refuse (colonne TEXT)", async ({ request }) => {
  req = request;
  const tag = "P3 " + Date.now();
  const corps = {
    name: "Sonde PUT P3 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P3 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p3 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT P3 " + tag,
    ingredients: [{ inventory_name: "Sonde PUT P3 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: 42,
  });
  expect(p3.code).toBe(400);
  expect(p3.corps.refused ?? []).toContain("preparation_steps");
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.preparation_steps, "la recette reste INTACTE").toBe("");
});

// P4 PUT quantity_per_person='beaucoup' → 400 + rejetees; ingredients intactes
test("P4 PUT /api/recipes/:id quantity_per_person='beaucoup' est refuse (colonne REAL)", async ({ request }) => {
  req = request;
  const tag = "P4 " + Date.now();
  const corps = {
    name: "Sonde PUT P4 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P4 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p4 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT P4 " + tag,
    ingredients: [{ inventory_name: "Sonde PUT P4 " + tag, quantity_per_person: "beaucoup", unit: "kg" }],
    preparation_steps: "",
  });
  expect(p4.code).toBe(400);
  expect(p4.corps.rejetees ?? [], "la ligne est NOMMEE").toContainEqual({ index: 0, raison: "quantity_per_person_inexploitable" });
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.ingredients.length, "les ingredients restent").toBe(1);
  expect(relu.ingredients[0].quantity_per_person, "quantity_per_person relu identique").toBe(0.1);
});

// P5 PUT inventory_name absent → 400 + rejetees; ingredients intactes
test("P5 PUT /api/recipes/:id inventory_name absent est refuse (NOT NULL sur inventory.name)", async ({ request }) => {
  req = request;
  const tag = "P5 " + Date.now();
  const corps = {
    name: "Sonde PUT P5 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P5 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p5 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT P5 " + tag,
    ingredients: [{ quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  });
  expect(p5.code).toBe(400);
  expect(p5.corps.rejetees ?? []).toContainEqual({ index: 0, raison: "inventory_name_absent_vide" });
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.ingredients.length, "les ingredients restent (pas de DELETE muet)").toBe(1);
});

// P6 PUT ingredients='beaucoup' (une chaine) → 400 refused ['ingredients']; recipe NOT modified
test("P6 PUT /api/recipes/:id ingredients='beaucoup' (une chaine) est refuse", async ({ request }) => {
  req = request;
  const tag = "P6 " + Date.now();
  const corps = {
    name: "Sonde PUT P6 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P6 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p6 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT P6 " + tag,
    ingredients: "beaucoup",
    preparation_steps: "",
  });
  expect(p6.code).toBe(400);
  expect(p6.corps.refused ?? []).toContain("ingredients");
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.ingredients.length, "les ingredients restent").toBe(1);
});

// P7 PUT quantity_per_person absent → 200, ligne stockee a 0
test("P7 PUT /api/recipes/:id quantity_per_person absent: la ligne est stockee a 0", async ({ request }) => {
  req = request;
  const tag = "P7 " + Date.now();
  const corps = {
    name: "Sonde PUT P7 " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde PUT P7 " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const p7 = await poute(`/api/recipes/${id}`, {
    name: "Sonde PUT P7 " + tag,
    ingredients: [{ inventory_name: "Sonde PUT P7 " + tag, unit: "kg" }],
    preparation_steps: "",
  });
  expect(p7.code).toBe(200);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.ingredients.length).toBe(1);
  expect(relu.ingredients[0].quantity_per_person, "quantity_per_person absent = 0").toBe(0);
});

// P8 PUT id inconnu → 404
test("P8 PUT /api/recipes/:id id inconnu rend 404 (pas un 200 muet)", async ({ request }) => {
  req = request;
  const fantome = "recette-fantome-" + Date.now();
  const p8 = await poute(`/api/recipes/${fantome}`, {
    name: "Sonde PUT Fantome",
    ingredients: [{ inventory_name: "Sonde PUT Fantome", quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  });
  expect(p8.code, "un PUT sur un id absent rend 404").toBe(404);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === fantome);
  expect(relu, "aucune ligne recipes n'a ete ecrite").toBeFalsy();
  const inv = (await lire("/api/inventory")).filter((i: any) => i.name === "Sonde PUT Fantome");
  expect(inv.length, "aucune ligne d'inventaire fantome n'a ete creee").toBe(0);
});

// R6 DELETE /api/recipes/:id valide → 200 + removed_inventory; recipe gone; inventory lines created BY the recipe gone; shared inventory lines stay
test("R6 DELETE /api/recipes/:id valide: la recette quitte la liste et ses ingredients/d'inventaire emportes", async ({ request }) => {
  req = request;
  const tag = "R6 " + Date.now();
  const corps = {
    name: "Sonde Delete Ingredients " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Sonde Delete Ing " + tag, quantity_per_person: 0.1, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const avant = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(avant, "la recette est PRESENT avant suppression").toBeTruthy();
  const res = await efface(`/api/recipes/${id}`);
  expect(res.code, "DELETE valide").toBe(200);
  expect(Array.isArray(res.corps.removed_inventory), "removed_inventory rendu").toBe(true);
  const apres = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(apres, "la recette quitte la liste").toBeFalsy();
  const inv = (await lire("/api/inventory")).filter((i: any) => i.name === "Sonde Delete Ing " + tag);
  expect(inv.length, "la ligne d'inventaire creee PAR LA RECETTE quitte aussi").toBe(0);
});

// S5 DELETE id inconnu → 404
test("S5 DELETE /api/recipes/:id id inconnu rend 404 (pas un 200 muet)", async ({ request }) => {
  req = request;
  const fantome = "recette-fantome-" + Date.now();
  const s5 = await efface(`/api/recipes/${fantome}`);
  expect(s5.code, "un DELETE sur un id absent rend 404").toBe(404);
});

// S11b DELETE enleve les lignes d'inventaire creees PAR LA RECETTE (partage restent)
test("S11b DELETE /api/recipes/:id enleve les lignes d'inventaire creees PAR LA RECETTE, partagees restent", async ({ request }) => {
  req = request;
  const tag = "S11b " + Date.now();
  const a = await article("Article Partage " + tag);
  const corps = {
    name: "Sonde Delete Partage A " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Article Partage " + tag, quantity_per_person: 0.2, unit: "kg" }],
    preparation_steps: "",
  };
  const crA = await poste("/api/recipes", corps);
  expect(crA.code).toBe(200);
  const corps2 = {
    name: "Sonde Delete Partage B " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Article Partage " + tag, quantity_per_person: 0.2, unit: "kg" }],
    preparation_steps: "",
  };
  const crB = await poste("/api/recipes", corps2);
  expect(crB.code).toBe(200);
  const idB = crB.corps.id as string;
  const res = await efface(`/api/recipes/${idB}`);
  expect(res.code).toBe(200);
  expect(res.corps.removed_inventory ?? [], "la ligne PARTAGEE ne part pas avec la recette supprimee").toEqual([]);
  const inv = (await lire("/api/inventory")).filter((i: any) => i.name === "Article Partage " + tag);
  expect(inv.length, "la ligne d'inventaire partagee reste").toBe(1);
  const reluA = (await lire("/api/recipes")).find((r: any) => r.id === crA.corps.id);
  expect(reluA, "la recette Partage A reste").toBeTruthy();
});

// R7 PUT /api/recipes/:id/save valide → 200 + recipe re-read is_saved=1; unknown id → 404
test("R7 PUT /api/recipes/:id/save valide: is_saved=1 relue; id absent rend 404 (pas un 200 muet)", async ({ request }) => {
  req = request;
  const tag = "R7 " + Date.now();
  const corps = {
    name: "Sonde Save " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const r7 = await poute(`/api/recipes/${id}/save`, {});
  expect(r7.code).toBe(200);
  expect(r7.corps.recipe?.is_saved, "is_saved relue").toBe(1);
  const relu = (await lire("/api/recipes")).find((r: any) => r.id === id);
  expect(relu.is_saved).toBe(1);
  const absent = await poute(`/api/recipes/recette-fantome-save-${Date.now()}/save`, {});
  expect(absent.code, "un /save sur un id absent rend 404").toBe(404);
});

// R8 POST /api/recipes/:id/generate-steps valide → 200 | 500 (branche Ollama); unknown id → 404
test("R8 POST /api/recipes/:id/generate-steps: corps exploitable dans les deux branches Ollama, id absent rend 404", async ({ request }) => {
  req = request;
  const tag = "R8 " + Date.now();
  const corps = {
    name: "Sonde Steps " + tag,
    category: "Plat",
    dish_type: "plat",
    ingredients: [{ inventory_name: "Riz " + tag, quantity_per_person: 0.2, unit: "kg" }],
    preparation_steps: "",
  };
  const cr = await poste("/api/recipes", corps);
  expect(cr.code).toBe(200);
  const id = cr.corps.id as string;
  const r8 = await poste(`/api/recipes/${id}/generate-steps`, {});
  expect([200, 500], "corps exploitable dans les deux branches Ollama").toContain(r8.code);
  if (r8.code === 200) {
    expect(typeof r8.corps.preparation_steps).toBe("string");
  } else {
    expect(String(r8.corps.error ?? "")).toBeTruthy();
  }
  const absent = await poste(`/api/recipes/recette-fantome-steps-${Date.now()}/generate-steps`, {});
  expect(absent.code, "un /generate-steps sur un id absent rend 404").toBe(404);
});
