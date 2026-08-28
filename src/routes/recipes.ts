// Routes : Recettes (CRUD, scan fiche technique, génération d'étapes)
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

export default function createRouter(db: Database) {
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
  const prepSteps = optionalString(req, "preparation_steps", 50000) || "";
  const srcImage = optionalString(req, "source_image_url", 500) || null;
  const recipeLang = language || ollamaSettingsRef.current.language || 'fr';
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
      allergens ? JSON.stringify(allergens) : "[]",
      recipeLang,
    ],
  );
  for (const ing of ingredients || []) {
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
          ing.unit || "g",
          "OUT_OF_STOCK",
          "Ingr\xE9dient g\xE9n\xE9r\xE9",
        ],
      );
    }
    await db.run(
      "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person) VALUES (?, ?, ?, ?)",
      [
        Math.random().toString(36).substr(2, 9),
        recipeId,
        invId,
        ing.quantity_per_person || 0,
      ],
    );
  }
  res.json({ status: "success", id: recipeId });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to save recipe" });
}
});
router.put("/api/recipes/:id", async (req, res) => {
try {
  const { name, ingredients, preparation_steps } = req.body;
  await db.run(
    "UPDATE recipes SET name = ?, preparation_steps = ? WHERE id = ?",
    [name, preparation_steps, req.params.id],
  );
  await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [
    req.params.id,
  ]);
  for (const ing of ingredients || []) {
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
          ing.unit || "g",
          "OUT_OF_STOCK",
          "Ingr\xE9dient g\xE9n\xE9r\xE9",
        ],
      );
    }
    await db.run(
      "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person) VALUES (?, ?, ?, ?)",
      [
        Math.random().toString(36).substr(2, 9),
        req.params.id,
        invId,
        ing.quantity_per_person || 0,
      ],
    );
  }
  res.json({ status: "success" });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to update recipe" });
}
});
router.delete("/api/recipes/:id", async (req, res) => {
try {
  await db.run("DELETE FROM recipes WHERE id = ?", [req.params.id]);
  await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [
    req.params.id,
  ]);
  res.json({ status: "success" });
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
  await db.run("UPDATE recipes SET is_saved = 1 WHERE id = ?", [
    req.params.id,
  ]);
  res.json({ status: "success" });
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
  res.json({ preparation_steps: prepSteps });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Failed to generate steps" });
}
});

  return router;
}
