// Routes : Recettes (CRUD, scan fiche technique, génération d'étapes)
// CONTRAT DES LIGNES D'INGREDIENT (sprint 12):
//   - les payloads juges sont CEUX QUE L'UI ENVOIE REELLEMENT (R1 scan, R2
//     saveGeneratedRecipes, R3 handleSaveFicheToBook, R4 saveRecipe manual-, R5
//     PUT editeur, R6 deleteRecipe) — sonde scripts/probe-recipes-voices.mjs.
//   - le contrat de la COLONNE quantity_per_person: absent = defaut EXPLICITE
//     0; texte/blanc/negatif/non-fini = REJETE (400 + refused) — la colonne est
//     REAL NOT NULL, le binding jette, et l'affinite dynamique stocke du TEXTE
//     dans une colonne REAL sans se plaindre (sonde: 'beaucoup' relu).
//   - inventory_name: requireString PAR LIGNE (l'editeur PUT n'a pas de defaut)
//     — NOT NULL sur inventory.name, le binding undefined jette (500).
//   - allergens: tableau (ou absent -> []); une chaine JSON.stringify entre
//     comme garbage et la relecture JSON.parse(« gluten ») JETTE (la UI affiche
//     l'Allergens Display qui attend un tableau).
//   - language: une chaine; un nombre rendait la recette INVISIBLE dans
//     GET /api/recipes (WHERE language = ? compare TEXT a TEXT).
//   - preparation_steps: une chaine OU un tableau d'etapes {step_order,
//     instructions} — la UI R3 poste un TABLEAU et la route l'avale en "".
//   - TOUT le lot se rejoue atomiquement: aucune ligne si une seule ligne d'
//     ingredient est refusee (les lignes recipes + recipe_ingredients +
//     inventory se posent ENSEMBLE), et la reponse REND LA LIGNE RELUE (pas le
//     corps de la requete) et NOMME les nouvelles lignes d'inventaire crees.
import { Router } from "express";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse } from "../shared/util.js";
import { findMatchingInventoryItem } from "../shared/fuzzy.js";
import { upload } from "../shared/upload.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import { requireString, optionalString } from "../middleware/validate.js";
import type { AuditLogger } from "../services/audit.js";

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/recipes", async (req, res) => {
try {
  const recipes = await db.all("SELECT * FROM recipes WHERE language = ?", [ollamaSettingsRef.current.language || 'fr']);
  for (const recipe of recipes) {
    recipe.ingredients = await db.all(
      `SELECT ri.id, ri.inventory_id, ri.quantity_per_person, i.name as inventory_name, i.unit, i.unit_price, i.yield_percent 
       FROM recipe_ingredients ri 
       JOIN inventory i ON ri.inventory_id = i.id 
       WHERE ri.recipe_id = ?`,
      [recipe.id],
    );
    if (recipe.allergens) {
      try {
        recipe.allergens = JSON.parse(recipe.allergens);
      } catch (e) {}
    }
  }
  res.json(recipes);
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to load recipes" });
}
});
router.post("/api/recipes", async (req, res) => {
try {
  if (!requireString(req, res, "name", 200)) return;
  const {
    name,
    category,
    dish_type,
    ingredients,
    preparation_steps,
    source_image_url,
    allergens,
    language
  } = req.body;
  const categoryVal = optionalString(req, "category", 100) || "Général";
  const dishTypeVal = optionalString(req, "dish_type", 50) || 'plat';
  // preparation_steps : la UI R3 (MenuAnalysis.handleSaveFicheToBook) poste un
  // TABLEAU d'etapes {step_order, instructions}. Une chaine passe telle quelle;
  // un tableau est JOINT en une chaine (l'intention de la UI est de sauver les
  // etapes, et la colonne schema est TEXT); tout autre type est REJETE.
  let prepStepsRaw = req.body?.preparation_steps;
  let prepSteps = "";
  if (Array.isArray(prepStepsRaw)) {
    prepSteps = prepStepsRaw.map((s: any) => s?.instructions ?? s?.step ?? "").join("\n");
  } else if (typeof prepStepsRaw === "string") {
    prepSteps = prepStepsRaw.length > 50000 ? prepStepsRaw.slice(0, 50000) : prepStepsRaw;
  } else if (prepStepsRaw === undefined || prepStepsRaw === null) {
    prepSteps = "";
  } else {
    return res.status(400).json({ status: "error", refused: ["preparation_steps"] });
  }
  const srcImage = optionalString(req, "source_image_url", 500) || null;
  // language : une chaine. Un nombre rendait la recette INVISIBLE dans
  // GET /api/recipes (WHERE language = ? compare TEXT a TEXT).
  let recipeLang: string | undefined;
  if (language !== undefined && language !== null) {
    if (typeof language !== "string") {
      return res.status(400).json({ status: "error", refused: ["language"] });
    }
    recipeLang = language;
  }
  // allergens : tableau (ou absent -> []). Une chaine JSON.stringify entre comme
  // garbage et la relecture JSON.parse(« gluten ») JETTE, ce qui casse l'Allergens
  // Display de la UI qui attend un tableau.
  let allergensVal: unknown = allergens;
  if (allergens !== undefined && allergens !== null && !Array.isArray(allergens)) {
    return res.status(400).json({ status: "error", refused: ["allergens"] });
  }
  // ingredients : un tableau. Un non-tableau ne rendait AUCUN ingredient (le
  // for(...) sur `ingredients || []` avalait tout sans rien nommer).
  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {
    return res.status(400).json({ status: "error", refused: ["ingredients"] });
  }
  const lignes = (Array.isArray(ingredients) ? ingredients : []);
  // Le lot se rejoue ATOMIQUEMENT: la validation par ligne se fait AVANT
  // l'ecriture d'une seule ligne (recipes + recipe_ingredients + inventory se
  // posent ENSEMBLE). Une ligne refusee refuse TOUT le lot (400 + rejetees).
  const rejetees: Array<{ index: number; raison: string }> = [];
  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];
  for (let i = 0; i < lignes.length; i++) {
    const ing = lignes[i] as any;
    const nomBrut = ing?.inventory_name;
    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {
      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });
      continue;
    }
    // quantity_per_person : absent = defaut EXPLICITE 0; un texte/negatif/
    // non-fini est REJETE (colonne REAL NOT NULL; l'affinite dynamique stocke
    // du TEXTE dans une colonne REAL sans se plaindre — sonde S2 'beaucoup').
    let qte: number | undefined;
    const brutQte = ing?.quantity_per_person;
    if (brutQte === undefined || brutQte === null || brutQte === "") {
      qte = 0;
    } else {
      const n = typeof brutQte === "number" ? brutQte : (typeof brutQte === "string" && brutQte.trim() !== "" ? Number(brutQte) : NaN);
      if (!Number.isFinite(n) || n < 0) {
        rejetees.push({ index: i, raison: "quantity_per_person_inexploitable" });
        continue;
      }
      qte = n;
    }
    const unitBrut = ing?.unit;
    if (unitBrut !== undefined && unitBrut !== null && typeof unitBrut !== "string") {
      rejetees.push({ index: i, raison: "unit_non_texte" });
      continue;
    }
    lignesValides.push({
      inventory_name: nomBrut,
      unit: typeof unitBrut === "string" ? unitBrut : null,
      qte,
    });
  }
  if (rejetees.length > 0) {
    return res.status(400).json({ status: "error", rejetees, refused: ["ingredients"] });
  }
  const recipeLangFinal = recipeLang ?? (ollamaSettingsRef.current.language || 'fr');
  const allergensJson = Array.isArray(allergensVal) ? JSON.stringify(allergensVal) : "[]";
  const recipeId = Math.random().toString(36).substr(2, 9);
  await db.run(
    "INSERT INTO recipes (id, name, category, dish_type, preparation_steps, source_image_url, allergens, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      recipeId,
      name,
      categoryVal,
      dishTypeVal,
      prepSteps,
      srcImage,
      allergensJson,
      recipeLangFinal,
    ],
  );
  const crees: string[] = [];
  for (const ing of lignesValides) {
    let invItem = await findMatchingInventoryItem(db, ing.inventory_name);
    let invId = invItem?.id;
    if (!invId) {
      invId = Math.random().toString(36).substr(2, 9);
      await db.run(
        "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          invId,
          ing.inventory_name,
          0,
          5,
          ing.unit ?? "g",
          "OUT_OF_STOCK",
          "Ingr\xE9dient g\xE9n\xE9r\xE9",
        ],
      );
      crees.push(ing.inventory_name);
    }
    await db.run(
      "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person) VALUES (?, ?, ?, ?)",
      [
        Math.random().toString(36).substr(2, 9),
        recipeId,
        invId,
        ing.qte,
      ],
    );
  }
  // La reponse REND LA LIGNE RELUE (pas le corps de la requete) et NOMME les
  // nouvelles lignes d'inventaire crees (la UI lit id; le chef doit savoir
  // quelles lignes sont nées).
  const recetteRelue = await db.get(
    "SELECT id, name, category, dish_type, preparation_steps, allergens, language FROM recipes WHERE id = ?",
    [recipeId],
  );
  await logAudit(req, res, { route: "/api/recipes", action: "create", entite: recipeId, payload: { apres: { name: name, category: categoryVal, dish_type: dishTypeVal } } });
  res.json({
    status: "success",
    id: recipeId,
    recipe: recetteRelue,
    ingredients: lignesValides.map((l) => ({ inventory_name: l.inventory_name, quantity_per_person: l.qte })),
    created_inventory: crees,
  });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to save recipe" });
}
});
router.put("/api/recipes/:id", async (req, res) => {
try {
  const { name, ingredients, preparation_steps } = req.body;
  // Sprint 16 : le chef peut DEPLACER une fiche d'une carte a l'autre puis
  // sauvegarder — dish_type est PORTE au PUT. Une valeur hors cartes (entree
  // / plat / dessert) est REJETEE nommee (la colonne est aussi le range du
  // dossier UI ; un « steak » ici ferait la fiche invisible des dossiers).
  let dishTypeCible: string | undefined;
  if (req.body?.dish_type !== undefined && req.body?.dish_type !== null) {
    if (!["entree", "plat", "dessert"].includes(String(req.body.dish_type))) {
      return res.status(400).json({ status: "error", refused: ["dish_type"] });
    }
    dishTypeCible = String(req.body.dish_type);
  }
  const recetteExistante = await db.get(
    "SELECT id FROM recipes WHERE id = ?",
    [req.params.id],
  );
  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });
  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ status: "error", refused: ["name"] });
  }
  let prepSteps = "";
  if (preparation_steps !== undefined && preparation_steps !== null) {
    if (typeof preparation_steps !== "string") {
      return res.status(400).json({ status: "error", refused: ["preparation_steps"] });
    }
    prepSteps = preparation_steps;
  }
  const lignes = Array.isArray(ingredients) ? ingredients : [];
  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {
    return res.status(400).json({ status: "error", refused: ["ingredients"] });
  }
  const rejetees: Array<{ index: number; raison: string }> = [];
  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];
  for (let i = 0; i < lignes.length; i++) {
    const ing = lignes[i] as any;
    const nomBrut = ing?.inventory_name;
    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {
      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });
      continue;
    }
    let qte: number | undefined;
    const brutQte = ing?.quantity_per_person;
    if (brutQte === undefined || brutQte === null || brutQte === "") {
      qte = 0;
    } else {
      const n = typeof brutQte === "number" ? brutQte : (typeof brutQte === "string" && brutQte.trim() !== "" ? Number(brutQte) : NaN);
      if (!Number.isFinite(n) || n < 0) {
        rejetees.push({ index: i, raison: "quantity_per_person_inexploitable" });
        continue;
      }
      qte = n;
    }
    const unitBrut = ing?.unit;
    if (unitBrut !== undefined && unitBrut !== null && typeof unitBrut !== "string") {
      rejetees.push({ index: i, raison: "unit_non_texte" });
      continue;
    }
    lignesValides.push({
      inventory_name: nomBrut,
      unit: typeof unitBrut === "string" ? unitBrut : null,
      qte,
    });
  }
  if (rejetees.length > 0) {
    return res.status(400).json({ status: "error", rejetees, refused: ["ingredients"] });
  }
  await db.run(
    dishTypeCible
      ? "UPDATE recipes SET name = ?, preparation_steps = ?, dish_type = ? WHERE id = ?"
      : "UPDATE recipes SET name = ?, preparation_steps = ? WHERE id = ?",
    dishTypeCible
      ? [name, prepSteps, dishTypeCible, req.params.id]
      : [name, prepSteps, req.params.id],
  );
  await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [req.params.id]);
  const crees: string[] = [];
  for (const ing of lignesValides) {
    let invItem = await findMatchingInventoryItem(db, ing.inventory_name);
    let invId = invItem?.id;
    if (!invId) {
      invId = Math.random().toString(36).substr(2, 9);
      await db.run(
        "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          invId,
          ing.inventory_name,
          0,
          5,
          ing.unit ?? "g",
          "OUT_OF_STOCK",
          "Ingr\xE9dient g\xE9n\xE9r\xE9",
        ],
      );
      crees.push(ing.inventory_name);
    }
    // L'unite du formulaire est PORTEE a la ligne d'inventaire : sans elle,
    // la correction du chef restait purement locale et le prix calculé
    // demain resterait dans l'ancienne unité. Un texte vide est INTERDIT
    // (NOT NULL sur inventory.unit; l'ancien code y écrivait '').
    const unitCible = ing.unit && String(ing.unit).trim() !== "" ? String(ing.unit) : invItem?.unit ?? "g";
    await db.run(
      "UPDATE inventory SET unit = ? WHERE id = ?",
      [unitCible, invId],
    );
    await db.run(
      "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person) VALUES (?, ?, ?, ?)",
      [
        Math.random().toString(36).substr(2, 9),
        req.params.id,
        invId,
        ing.qte,
      ],
    );
  }
  const recetteRelue = await db.get(
    "SELECT id, name, category, dish_type, preparation_steps, allergens, language FROM recipes WHERE id = ?",
    [req.params.id],
  );
  await logAudit(req, res, { route: "/api/recipes/:id", action: "update", entite: req.params.id, payload: { apres: { name: name, dish_type: dishTypeCible } } });
  res.json({
    status: "success",
    recipe: recetteRelue,
    ingredients: lignesValides.map((l) => ({ inventory_name: l.inventory_name, quantity_per_person: l.qte })),
    created_inventory: crees,
  });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to update recipe" });
}
});
router.delete("/api/recipes/:id", async (req, res) => {
try {
  // Le DELETE d'un id absent rendait 200 SILENCIEUX sur une ligne qui ne part
  // pas (DELETE FROM recipes WHERE id = ? retourne 0 ligne modifiee), et la
  // DELETE ne partait PAS avec les sous-lignes d'ingredients ni avec les
  // lignes d'inventaire creees PAR LA RECETTE (elles restaient en orphelines
  // chez le chef — sonde S11/S5). Le contrat exige un 404 sur une recette
  // absente, et la DELETE emporte les sous-lignes avec la recette.
  const recetteExistante = await db.get(
    "SELECT id FROM recipes WHERE id = ?",
    [req.params.id],
  );
  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });
  const ingredientsRelus = await db.all(
    "SELECT inventory_id FROM recipe_ingredients WHERE recipe_id = ?",
    [req.params.id],
  );
  await db.run("DELETE FROM recipes WHERE id = ?", [req.params.id]);
  await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [
    req.params.id,
  ]);
  // Les lignes d'inventaire creees PAR LA RECETTE (dont la recette supprimee
  // etait le SEUL proprietaire) partent avec elle; celles partagees avec une
  // autre recette restent chez le chef.
  const idsAEnlever = ingredientsRelus.map((r: any) => r.inventory_id);
  let enlevees: string[] = [];
  for (const invId of idsAEnlever) {
    const autres = await db.get(
      "SELECT id FROM recipe_ingredients WHERE inventory_id = ? AND recipe_id != ? LIMIT 1",
      [invId, req.params.id],
    );
    if (!autres) {
      const inv = await db.get("SELECT id, name FROM inventory WHERE id = ?", [invId]);
      if (inv) {
        await db.run("DELETE FROM inventory WHERE id = ?", [invId]);
        enlevees.push(inv.name);
      }
    }
  }
  await logAudit(req, res, { route: "/api/recipes/:id", action: "delete", entite: req.params.id, payload: { inventory_enlevees: enlevees } });
  res.json({ status: "success", removed_inventory: enlevees });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to delete recipe" });
}
});

router.post("/api/recipes/scan", upload.single("file"), async (req, res) => {
console.log("[OLLAMA] Reçu une demande de scan de fiche technique...");
try {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ status: "error", message: "Aucun fichier fourni." });
  }
  const isImage = file.mimetype.startsWith("image/");
  const base64Image = file.buffer.toString("base64");
  let pdfText = "";
  if (file.originalname.toLowerCase().endsWith('.pdf')) {
    console.log("[PDF-PARSE] Extraction texte Fiche Technique PDF...");
    try {
      const pdfData = await pdfParse(file.buffer);
      pdfText = pdfData.text || " ";
    } catch (e) {
      console.error("[ERROR] Recipe PDF parse failed:", e);
      return res.status(400).json({ status: "error", message: "Échec de la lecture du PDF." });
    }
  }

  const targetModel = getModel(ollamaSettingsRef.current);
  const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
  const langName = langMap[ollamaSettingsRef.current.language as keyof typeof langMap] || "ENGLISH";

  let prompt = `Analyze this recipe card (technical sheet, handwritten recipe, text from email, etc.) and extract the recipe structure.
  
  Instructions:
  1. Identify the name of the recipe.
  2. Categorize it as "starter", "main", "dessert", or "general".
  3. Extract all ingredients with estimated/exact quantity per person. If a total quantity is mentioned for N persons, divide by N to get quantity per person.
  4. List allergens.
  5. Provide detailed preparation instructions/steps.

  IMPORTANT: YOUR ENTIRE RESPONSE MUST BE IN ${langName}.
  The JSON keys must match this exact format. Do NOT insert raw, physical newlines inside string values (such as preparation_steps); if there are multiple lines or steps, use '\\n' (the escaped text '\\n') instead of actual enter/line breaks. Every string property must occupy exactly one line in the JSON output.

  Format schema:
  {
    "status": "success",
    "fiches_techniques": [
      {
        "recette": "Nom de la Recette / Recipe Name",
        "categorie": "starter, main, dessert, or general",
        "ingredients": [
          {"name": "Nom de l'ingrédient", "quantite": 0.15, "unite": "kg"}
        ],
        "allergens": ["Allergen 1", "Allergen 2"],
        "preparation_steps": "Step 1... \\nStep 2..."
      }
    ]
  }`;

  if (pdfText) {
    prompt += "\\n\\n--- INSTRUCTIONS/CONTENU EXTRAIT DE LA FICHE ---\\n" + pdfText;
  }

  const response = await ollama.generate({
    model: targetModel,
    system: `CRITICAL MANDATE: You MUST output all actual content (recipe name, ingredient names, steps, allergens) in ${langName}. The JSON keys must remain as specified. Provide exactly the JSON object, NO extra text. NEVER include actual raw physical newlines inside JSON string properties; use \\n for line breaks instead.`,
    prompt,
    format: "json",
    options: { temperature: 0.1 },
    images: isImage ? [base64Image] : undefined,
  });

  console.log("[OLLAMA] Scan Fiche Technique réussi!");
  const parsed = safeJsonParse(response.response);
  res.json(parsed);
} catch (error) {
  console.error("[ERROR] Recipe scan failed:", error);
  const errMsg = error instanceof Error ? error.message : "Erreur inconnue";
  res.status(500).json({ status: "error", message: `Échec du scan IA avec le modèle [${getModel(ollamaSettingsRef.current)}] : ${errMsg}` });
}
});
router.put("/api/recipes/:id/save", async (req, res) => {
try {
  // Le PUT /save sur un id absent rendait 200 SILENCIEUX sur une ligne qui ne
  // part pas (UPDATE recipes SET is_saved = 1 WHERE id = ? retourne 0 ligne
  // modifiee). Le contrat exige un 404 sur une recette absente.
  const recetteExistante = await db.get(
    "SELECT id FROM recipes WHERE id = ?",
    [req.params.id],
  );
  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });
  await db.run("UPDATE recipes SET is_saved = 1 WHERE id = ?", [
    req.params.id,
  ]);
  const relue = await db.get("SELECT id, is_saved FROM recipes WHERE id = ?", [
    req.params.id,
  ]);
  await logAudit(req, res, { route: "/api/recipes/:id/save", action: "update", entite: req.params.id, payload: { apres: { is_saved: 1 } } });
  res.json({ status: "success", recipe: relue });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to save recipe" });
}
});
router.post("/api/recipes/:id/generate-steps", async (req, res) => {
try {
  const recipe = await db.get("SELECT * FROM recipes WHERE id = ?", [
    req.params.id,
  ]);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  const ingredients = await db.all(
    `SELECT ri.quantity_per_person, i.name, i.unit 
     FROM recipe_ingredients ri 
     JOIN inventory i ON ri.inventory_id = i.id 
     WHERE ri.recipe_id = ?`,
    [req.params.id],
  );
  const prompt =
    ollamaSettingsRef.current.language === "it"
      ? `DIRETTIVA CRITICA: Devi rispondere in ITALIANO.
Genera le fasi di preparazione ESTREMAMENTE dettagliate di livello Gastronomico per la ricetta: ${recipe.name}.
Ingredienti: ${ingredients.map(i => `${i.name} (${i.quantity_per_person}${i.unit})`).join(', ')}.
Il testo DEVE essere di almeno 15 frasi. Usa una terminologia professionale da chef stellato. Dividi ogni passaggio con 

.
Rispondi in italiano con SOLO il testo delle fasi di preparazione.`
      : ollamaSettingsRef.current.language === "es"
        ? `DIRECTIVA CR\xCDTICA: Debes responder en ESPA\xD1OL.
    Genera pasos de preparaci\xF3n detallados para la receta: ${recipe.name}.
    Ingredientes: ${ingredients.map((i) => `${i.name} (${i.quantity_per_person}${i.unit})`).join(", ")}.
    Responde en espa\xF1ol con S\xD3LO el texto de los pasos de preparaci\xF3n. Sin introducciones.`
        : ollamaSettingsRef.current.language === "de"
          ? `WICHTIGE RICHTLINIE: Sie müssen auf DEUTSCH antworten.
Generieren Sie äußerst detaillierte Zubereitungsschritte für folgendes Rezept: ${recipe.name}.
Zutaten: ${ingredients.map((i) => `${i.name} (${i.quantity_per_person}${i.unit})`).join(", ")}.
Antworten Sie auf Deutsch NUR mit dem reinen Text der Zubereitungsschritte.`
          : ollamaSettingsRef.current.language === "en"
            ? `CRITICAL DIRECTIVE: You MUST respond entirely in ENGLISH.
    Generate highly detailed, professional preparation steps for the following recipe: ${recipe.name}.
    Ingredients: ${ingredients.map((i) => `${i.name} (${i.quantity_per_person}${i.unit})`).join(", ")}.
    Respond in English with ONLY the preparation steps string. No introduction, no formatting tags.`
            : `DIRECTIVE CRITIQUE : Tu DOIS r\xE9pondre enti\xE8rement en FRAN\xC7AIS.
    G\xE9n\xE8re les \xE9tapes de pr\xE9paration d\xE9taill\xE9es pour la recette suivante : ${recipe.name}.
    Ingr\xE9dients : ${ingredients.map((i) => `${i.name} (${i.quantity_per_person}${i.unit})`).join(", ")}.
    R\xE9ponds en fran\xE7ais avec UNIQUEMENT la cha\xEEne de caract\xE8res des \xE9tapes de pr\xE9paration d\xE9taill\xE9es. Pas d'introduction.`;
  const response = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt,
  });
  const prepSteps = response.response;
  await db.run("UPDATE recipes SET preparation_steps = ? WHERE id = ?", [
    prepSteps,
    req.params.id,
  ]);
  await logAudit(req, res, { route: "/api/recipes/:id/generate-steps", action: "update", entite: req.params.id, payload: { apres: { preparation_steps: "<genere>" } } });
  res.json({ preparation_steps: prepSteps });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to generate steps" });
}
});

  return router;
}
