// Routes : Menus (analyse de menu + génération créatif/traditionnel/gastronomique)
import { Router } from "express";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse, LlmResponse } from "../shared/util.js";
import { upload } from "../shared/upload.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import { uploadsDir } from "../services/paths.js";
import { STANDARD_QUANTITIES_PROMPT, STANDARD_QUANTITIES_ES_PROMPT, STANDARD_QUANTITIES_DE_PROMPT, STANDARD_QUANTITIES_IT_PROMPT, STANDARD_QUANTITIES_ENG_PROMPT } from "../prompts/menuPrompts.js";

export default function createRouter(db: Database) {
  const router = Router();

router.post("/api/analyze-menu", upload.single("file"), async (req, res) => {
console.log(
  "[OLLAMA] Re\xE7u une demande d'analyse de menu (D\xE9composer menu)...",
);
try {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const isImage = file.mimetype.startsWith("image/");
  let imageUrl: string | null = null;
  if (isImage) {
    const ext = file.originalname.split(".").pop() || "jpg";
    const filename = `scan_${Date.now()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, file.buffer);
    imageUrl = `/uploads/${filename}`;
  }
  
  const base64Image = file.buffer.toString("base64");
  let pdfText = null;
  if (file.originalname.toLowerCase().endsWith('.pdf')) {
    console.log("[PDF-PARSE] Extraction texte Menu PDF...");
    try {
      const pdfData = await pdfParse(file.buffer);
      pdfText = pdfData.text || " ";
    } catch (e) {
      console.error("[ERROR] Menu PDF parse failed:", e);
      return res.status(400).json({ error: "Echec de lecture du fichier Menu PDF." });
    }
  }

  const targetModel = getModel(ollamaSettingsRef.current);
  const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
  const langName = langMap[ollamaSettingsRef.current.language as keyof typeof langMap] || "ENGLISH";
  let prompt =
    ollamaSettingsRef.current.language === "it"
      ? `Analizza questo menu o documento ed estrai le schede tecniche.

REGOLE IMPORTANTI:
1. Identifica ogni ricetta.
2. Menziona sempre gli allergeni.
3. Elenco degli ingredienti in questo formato ESATTO: "ingredients": [{"name": "[NOME_DEL_VERO_INGREDIENTE_es_Pomodoro_o_Manzo_Wagyu]", "quantite": "[NUMERO_ESATTO]", "unite": "[g_o_ml]"}]
4. Passaggi della preparazione: devono essere ESTREMAMENTE DETTAGLIATI.
${STANDARD_QUANTITIES_IT_PROMPT}
RISPONDI ESCLUSIVAMENTE IN JSON:` + `\n` + JSON.stringify({
status: "success",
fiches_techniques: [{
recette: "Recipe Name", categorie: "Categoria", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." 
}]
})
      : ollamaSettingsRef.current.language === "es"
        ? `Analiza este men\xFA y extrae las fichas t\xE9cnicas descompuestas.

Instrucciones:
1. Identifica cada receta.
2. Menci\xF3n Obligatoria: lista de al\xE9rgenos.
3. Extraer ingredientes.
4. Instrucciones detalladas.
${STANDARD_QUANTITIES_ES_PROMPT}
RESPONDER \xDANICAMENTE EN JSON:` + `\n` + JSON.stringify({
status: "success",
fiches_techniques: [{
recette: "Recipe Name", categorie: "Categoria", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." 
}]
})
        : ollamaSettingsRef.current.language === "de"
          ? `Analysiere dieses Menü und extrahiere die Datenblätter in Einzelteilen.
MANDAT DE SPRACHE: ANTWORT AUF DEUTSCH.
Anweisungen:
1. Identifiziere jedes Rezept.
2. Pflichterkennung: Liste der Allergene.
3. Zutaten extrahieren.
4. Ausführliche Anweisungen.
${STANDARD_QUANTITIES_DE_PROMPT}
ANTSWORTE AUSSCHLIESSLICH IN JSON:` + `\n` + JSON.stringify({
status: "success",
fiches_techniques: [{
recette: "Recipe Name", categorie: "Kategorie", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." 
}]
})
          : ollamaSettingsRef.current.language === "en"
            ? `Analyze this menu and extract the decomposed technical sheets.
  
  Instructions:
  1. Identify every recipe present on the document.
  2. MANDATORY MENTION: For each dish, list potential allergens.
  3. Extract each ingredient with the recommended quantity per person.
  4. Indicate detailed preparation steps for each recipe.
  5. ${STANDARD_QUANTITIES_ENG_PROMPT}

  IMPORTANT: YOUR ENTIRE RESPONSE MUST BE IN ${langName}.
  Respond ONLY in JSON with this format:
  {
    "status": "success",
    "fiches_techniques": [
      {
        "recette": "Recipe Name",
        "categorie": "Starter, Main Course, or Dessert",
        "ingredients": [
          {"name": "Ingredient Name", "quantite": 0, "unite": "g"}
        ],
        "allergens": ["Allergen 1", "Allergen 2"],
        "preparation_steps": "Detailed step-by-step preparation..."
      }
    ]
  }`
            : `Analyse ce menu et extrait les fiches techniques d\xE9compos\xE9es.
  
  Instructions:
  1. Identifie chaque recette pr\xE9sente sur le document.
  2. MENTION OBLIGATOIRE : Pour chaque plat, liste les allerg\xE8nes potentiels.
  3. Extraire chaque ingr\xE9dient avec la quantit\xE9 recommand\xE9e par personne.
  4. Indique les \xE9tapes de pr\xE9paration d\xE9taill\xE9es pour chaque recette.
  5. ${STANDARD_QUANTITIES_PROMPT}

  IMPORTANT : TOUTE TA R\xC9PONSE DOIT \xCATRE EN ${langName}.
  R\xE9ponds UNIQUEMENT en JSON avec ce format :
  {
    "status": "success",
    "fiches_techniques": [
      {
        "recette": "Recipe Name",
        "categorie": "Starter, Main Course, or Dessert",
        "ingredients": [
          {"name": "Ingredient Name", "quantite": 0, "unite": "g"}
        ],
        "allergens": ["Allergen 1", "Allergen 2"],
        "preparation_steps": "Detailed preparation steps..."
      }
    ]
  }`;
  
  if (pdfText) {
    prompt += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + pdfText;
  }
  const response = await ollama.generate({
    model: targetModel,
    system: `CRITICAL MANDATE: You MUST output all actual content (dish names, ingredients, steps, allergens) in ${langName}. Do NOT use French unless ${langName} is FRANÇAIS. The JSON keys must remain as specified. NO EXCEPTIONS.`,
    prompt,
    images: isImage ? [base64Image] : undefined,

    format: "json",
    options: { temperature: 0.2 },
  });
  let cleanResponse = response.response;
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  const parsedData = safeJsonParse(cleanResponse) as LlmResponse & { fiches_techniques?: Array<Record<string, unknown>> };
  if (parsedData.fiches_techniques) {
    parsedData.fiches_techniques = parsedData.fiches_techniques.map(
      (recipe) => ({ ...recipe, source_image_url: imageUrl }),
    );
  }
  res.json(parsedData);
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Processing failed" });
}
});

router.post("/api/generate-creative-menu", upload.single("file"), async (req, res) => {
try {
  const file = req.file;
  const targetModel = getModel(ollamaSettingsRef.current);
  let base64Image;
  if (file && file.mimetype.startsWith("image/")) {
    base64Image = file.buffer.toString("base64");
  }
  
  const pastRecipes = await db.all("SELECT name FROM recipes");
  const pastNames = pastRecipes.map(r => r.name).slice(-100).join(", ");
  
  const isSingle = !(req.body.week && req.body.rotation_data);
  const rotationText = isSingle ? "" : `You must strictly follow this 7-day rotation plan for Week ${req.body.week}:\n${typeof req.body.rotation_data === 'string' ? req.body.rotation_data : JSON.stringify(req.body.rotation_data)}\n`;
  
  const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
  const langName = langMap[ollamaSettingsRef.current.language as keyof typeof langMap] || "ENGLISH";
  let prompt = `CRITICAL LANGUAGE MANDATE: THE ENTIRE RESPONSE (INCLUDING DISH NAMES, INGREDIENTS, RECIPE STEPS, AND ALLERGENS) MUST BE WRITTEN IN PERFECT, GRAMMATICALLY CORRECT ${langName}. IF THE LANGUAGE IS NOT FRENCH, YOU MUST FULLY TRANSLATE ALL CULINARY TERMS AND DISH NAMES. DO NOT MIX LANGUAGES.\n\n`;
  
  if (pastNames) {
    prompt += `MEMORY MANDATE: Do NOT generate or suggest any of the following previously generated recipes: ${pastNames}.\n\n`;
  }
  
  if (isSingle) {
    const typeStr = req.body.dishType ? `1 ${req.body.dishType.toUpperCase()}` : `FULL-COURSE MENU (1 Entree, 1 Plat, 1 Dessert)`;
    prompt += `Act as a Visionary Avant-Garde Chef specializing in Modernist and Global Fusion Cuisine. Generate a SINGLE HIGHLY ELABORATE CREATIVE ${typeStr}. YOU MUST USE PROFESSIONAL CULINARY TECHNIQUES (fermentations, foams, ashes, unexpected savory/sweet crossovers). FOCUS ON SHOCKINGLY CREATIVE FLAVOR PAIRINGS, AVANT-GARDE FUSION, AND EXTREME INNOVATION.\n`;
  } else {
    prompt += `Act as a Visionary Avant-Garde Chef specializing in Modernist and Global Fusion Cuisine. Generate a 7-DAY HIGHLY ELABORATE CREATIVE FULL-COURSE MENU. Each day must include exactly 1 Entree, 1 Plat, and 1 Dessert. YOU MUST USE PROFESSIONAL CULINARY TECHNIQUES. FOCUS ON SHOCKINGLY CREATIVE FLAVOR PAIRINGS, AVANT-GARDE FUSION, AND EXTREME INNOVATION.\n${rotationText}\n`;
  }
  
  prompt += `Operational Mandates:
1. CULINARY EXCELLENCE: Break the rules of traditional cooking. Invent new concepts (e.g., savory ice creams, vegetable demiglaces, fermented fruit sauces). Write sophisticated chef techniques in eloquent paragraphs.
2. FULL COURSE MENUS: Every day MUST have a complete 'entree', 'plat', and 'dessert' object. Do not leave any course empty.
3. PREPARATION STEPS QUALITY: Provide ULTRA DETAILED preparation_steps (min 6 sentences per recipe). IMPORTANT: DO NOT write robotic, repetitive steps. Write natural, flowing paragraphs describing the culinary process chronologically like in a modern culinary manifesto.
4. COHERENT RECIPES: Each dish MUST have at least 5 distinct ingredients. The flavor profiles must be wildly creative but make culinary sense. Include a rigorous allergens list.
5. STRICT REALISTIC QUANTITIES (FOR 1 PORTION ONLY): Ensure ALL ingredient quantities are scaled precisely for exactly ONE SINGLE PORTION. Use professional units ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
6. CRITICAL NAME UNIQUENESS: DO NOT use cliché names. If ingredients are provided, absolutely TRANSFORM them into highly creative names.

YOUR ULTIMATE GOAL IS TO OUTPUT 3 FULLY POPULATED COURSES IN ${langName} LANGUAGE.
`;

  if (isSingle) {
    prompt += `CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ${langName} LANGUAGE. THIS MEANS THE ACTUAL STRINGS AND VALUES INSIDE THE JSON MUST BE IN ${langName}. NOTE: The JSON keys (like 'jour', 'entree', 'nom') are in French for system compatibility, but you MUST write the actual dish names, ingredients, and steps entirely in ${langName}!\n`;
    prompt += `REQUIRED STRUCTURE (Fill every property. No placeholders. You MUST generate at least 6 to 10 distinct, highly specific premium ingredients inside the 'ingredients' array, with custom quantities/units and highly elaborate preparation steps.):\n{\n  "status": "success",\n  "creative_menu": [\n    {\n      "jour": "Unique Creation",\n`;
    if (!req.body.dishType || req.body.dishType === "entree") {
      prompt += `      "entree": {"nom": "...", "ingredients": [{"name": "Ingrédient Principal", "quantite": 120, "unite": "g"}, {"name": "Second Composant", "quantite": 40, "unite": "g"}, {"name": "Émulsion/Sauce", "quantite": 15, "unite": "ml"}, {"name": "Garniture Texturée", "quantite": 5, "unite": "pièce"}, {"name": "Épice/Assaisonnement", "quantite": 1, "unite": "pincée"}], "allergens": ["..."], "preparation_steps": "E.g., detailed step-by-step paragraphs... min 6/8 sentences per recipe detailing temperatures, culinary emulsification..."}${!req.body.dishType ? ',' : ''}\n`;
    }
    if (!req.body.dishType || req.body.dishType === "plat") {
      prompt += `      "plat": {"nom": "...", "ingredients": [{"name": "Ingrédient Principal", "quantite": 150, "unite": "g"}, {"name": "Accompagnement", "quantite": 100, "unite": "g"}, {"name": "Sauce Corsée", "quantite": 30, "unite": "ml"}, {"name": "Éléments Décoratifs", "quantite": 4, "unite": "pièce"}, {"name": "Assaisonnement Élite", "quantite": 1, "unite": "pincée"}], "allergens": ["..."], "preparation_steps": "E.g., detailed step-by-step paragraphs... min 6/8 sentences per recipe detailing temperatures, culinary emulsification..."}${!req.body.dishType ? ',' : ''}\n`;
    }
    if (!req.body.dishType || req.body.dishType === "dessert") {
      prompt += `      "dessert": {"nom": "...", "ingredients": [{"name": "Élément Principal Sucré", "quantite": 80, "unite": "g"}, {"name": "Crème/Coulis injecté", "quantite": 30, "unite": "ml"}, {"name": "Infusion Parfumée", "quantite": 10, "unite": "g"}, {"name": "Tuile/Craquant", "quantite": 2, "unite": "pièce"}], "allergens": ["..."], "preparation_steps": "E.g., detailed step-by-step paragraphs... min 6/8 sentences per recipe detailing temperatures, culinary emulsification..."}\n`;
    }
    prompt += `    }\n  ]\n}`;
  } else {
    prompt += `CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ${langName} LANGUAGE. THIS MEANS THE ACTUAL STRINGS AND VALUES INSIDE THE JSON MUST BE IN ${langName}. NOTE: The JSON keys (like 'jour', 'entree', 'nom') are in French for system compatibility, but you MUST write the actual dish names, ingredients, and steps entirely in ${langName}!
REQUIRED STRUCTURE FOR EVERY DAY (You MUST generate entree, plat, AND dessert for each day. You MUST generate at least 6 to 10 distinct ingredients for each course.):
{
"status": "success",
"creative_menu": [
{
  "jour": "Day Name in ${langName}",
  "entree": {"nom": "...", "ingredients": [{"name": "Composant 1", "quantite": 50, "unite": "g"}, {"name": "Composant 2", "quantite": 20, "unite": "g"}, {"name": "Composant 3", "quantite": 10, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Paragraph..."},
  "plat": {"nom": "...", "ingredients": [{"name": "Composant 1", "quantite": 150, "unite": "g"}, {"name": "Composant 2", "quantite": 80, "unite": "g"}, {"name": "Composant 3", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Paragraph..."},
  "dessert": {"nom": "...", "ingredients": [{"name": "Composant 1", "quantite": 50, "unite": "g"}, {"name": "Composant 2", "quantite": 15, "unite": "ml"}, {"name": "Composant 3", "quantite": 5, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Paragraph..."}
}
]
}`;
  }

  const response = await ollama.generate({
    model: targetModel,
    system: `CRITICAL MANDATE: You MUST output all actual content (dish names, ingredients, steps, allergens) in ${langName}. Do NOT use French unless ${langName} is FRANÇAIS. The JSON keys must remain as specified. NO EXCEPTIONS.`,
    prompt: prompt,
    images: base64Image ? [base64Image] : void 0,
    format: "json",
    options: { temperature: 0.85, top_p: 0.9, num_ctx: 4096, num_predict: 4000 },
  });
  let cleanResponse = response.response;
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    let parsedData: LlmResponse = safeJsonParse(cleanResponse) as LlmResponse;
    if (Array.isArray(parsedData)) {
        parsedData = { status: "success", creative_menu: parsedData };
    } else if (parsedData && !parsedData.creative_menu && (parsedData.dejeuner || parsedData.entree)) {
        parsedData = { status: "success", creative_menu: [parsedData] };
    } else if (parsedData && !parsedData.creative_menu && !parsedData.error && !parsedData.message) {
        const arrProp = Object.values(parsedData).find(v => Array.isArray(v));
        if (arrProp) {
            parsedData.creative_menu = arrProp;
            parsedData.status = "success";
        } else {
            parsedData.creative_menu = [{ jour: "Généré", dejeuner: parsedData.dejeuner || parsedData }];
            parsedData.status = "success";
        }
    }
    
    if (parsedData.creative_menu && !Array.isArray(parsedData.creative_menu)) {
        parsedData.creative_menu = [parsedData.creative_menu];
    }
    const outputStatus = parsedData.status === "error" ? "error" : "success";
    if (outputStatus === "error" && !parsedData.error && !parsedData.message) {
      parsedData.error = "L'IA a refusé la requête (statut d'erreur).";
    }
    res.json({ status: outputStatus, ...parsedData });
  } catch (error) {
    console.error("\n\nCRITICAL JSON PARSING ERROR:");
    console.error("Raw response:", cleanResponse);
    console.error("Error:", error);
    res.status(500).json({ error: `Erreur de décodage JSON du menu généré par [${getModel(ollamaSettingsRef.current)}]`, raw: cleanResponse });
  }
  } catch (error) {
    console.error(error);
    const errMsg = error instanceof Error ? error.message : "Erreur inconnue.";
    res.status(500).json({ error: `Échec de génération de menu créatif avec l'IA [${getModel(ollamaSettingsRef.current)}]: ${errMsg}` });
  }
});

router.post("/api/generate-traditional-menu", upload.single("file"), async (req, res) => {
console.log("[OLLAMA] Reçu requête generate-traditional-menu...");
try {
  const file = req.file;
  const targetModel = getModel(ollamaSettingsRef.current);
  let base64Image;
  if (file && file.mimetype.startsWith("image/")) {
    base64Image = file.buffer.toString("base64");
  }
  
  const pastRecipes = await db.all("SELECT name FROM recipes");
  const pastNames = pastRecipes.map(r => r.name).slice(-100).join(", ");
  
  const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
  const langName = langMap[ollamaSettingsRef.current.language as keyof typeof langMap] || "ENGLISH";
  
  let prompt = `CRITICAL LANGUAGE MANDATE: THE ENTIRE RESPONSE (INCLUDING DISH NAMES, INGREDIENTS, RECIPE STEPS, AND ALLERGENS) MUST BE WRITTEN IN PERFECT, GRAMMATICALLY CORRECT ${langName}. IF THE LANGUAGE IS NOT FRENCH, YOU MUST FULLY TRANSLATE ALL CULINARY TERMS AND DISH NAMES. DO NOT MIX LANGUAGES.\n\n`;
  if (pastNames) {
    prompt += `MEMORY MANDATE: Do NOT generate or suggest any of the following previously generated recipes: ${pastNames}.\n\n`;
  }
  const typeStr = req.body.dishType ? `1 ${req.body.dishType.toUpperCase()}` : `menu (1 Entree, 1 Plat, 1 Dessert)`;
  prompt += `Act as an Elite Maître Restaurateur and Guardian of French Terroir. Generate a SINGLE EXTREMELY DETAILED traditional bistro ${typeStr}.\n`;
  prompt += `Operational Mandates:
1. CHIC BISTRO CUISINE: Focus on comforting, generous, time-honored classic French authentic recipes (like boeuf bourguignon, blanquette, tarte tatin) elevated to modern Bistronomy standards. NO molecular gastronomy. NO weird fusions. Just pure, authentic, heartwarming terroir cuisine cooked to perfection.
2. PREPARATION STEPS QUALITY: Provide ULTRA DETAILED preparation_steps (min 6 sentences per recipe). IMPORTANT: DO NOT write robotic steps. Write natural, flowing paragraphs describing the long simmering, deglazing, and roasting processes chronologically.
3. COHERENT RECIPES: Each dish MUST have at least 5 distinct ingredients. The flavor profiles must be authentic bistro classics. Use proper pairings. Include a rigorous allergens list.
4. STRICT REALISTIC QUANTITIES (FOR 1 PORTION ONLY): Ensure ALL ingredient quantities are scaled precisely for exactly ONE SINGLE PORTION. Do NOT use absurd amounts. Use professional units ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
5. CRITICAL NAME UNIQUENESS: The dish names must sound like a real, authentic, rustic chalk board menu. Avoid generic words.

CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ${langName} LANGUAGE. THIS MEANS THE ACTUAL STRINGS AND VALUES INSIDE THE JSON MUST BE IN ${langName}. NOTE: The JSON keys (like 'jour', 'entree', 'nom') are in French for system compatibility, but you MUST write the actual dish names, ingredients, and steps entirely in ${langName}!
REQUIRED STRUCTURE (Fill every property. No placeholders.):
{
"status": "success",
"traditional_menu": [
{
  "jour": "Unique Menu",\n`;
  if (!req.body.dishType || req.body.dishType === "entree") {
    prompt += `      "entree": {"nom": "...", "ingredients": [{"name": "Composant du Terroir", "quantite": 120, "unite": "g"}, {"name": "Légume d'accompagnement", "quantite": 50, "unite": "g"}, {"name": "Beurre de cuisson", "quantite": 15, "unite": "g"}, {"name": "Aromates frais", "quantite": 5, "unite": "g"}, {"name": "Pincée de gros sel", "quantite": 1, "unite": "pincée"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed traditional preparation steps chronologically... min 6/8 sentences..."}${!req.body.dishType ? ',' : ''}\n`;
  }
  if (!req.body.dishType || req.body.dishType === "plat") {
    prompt += `      "plat": {"nom": "...", "ingredients": [{"name": "Viande ou Poisson noble", "quantite": 180, "unite": "g"}, {"name": "Fonds de sauce brun/blanc", "quantite": 50, "unite": "ml"}, {"name": "Garniture grand-mère", "quantite": 80, "unite": "g"}, {"name": "Huile d'olive/Graisse", "quantite": 15, "unite": "ml"}, {"name": "Assaisonnement bistrot", "quantite": 1, "unite": "pincée"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed traditional preparation steps chronologically... min 6/8 sentences..."}${!req.body.dishType ? ',' : ''}\n`;
  }
  if (!req.body.dishType || req.body.dishType === "dessert") {
    prompt += `      "dessert": {"nom": "...", "ingredients": [{"name": "Fruit de saison ou Chocolat", "quantite": 100, "unite": "g"}, {"name": "Sucre semoule", "quantite": 40, "unite": "g"}, {"name": "Lait entier ou Crème", "quantite": 50, "unite": "ml"}, {"name": "Gousse de vanille ou Arôme", "quantite": 1, "unite": "pièce"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed traditional preparation steps chronologically... min 6/8 sentences..."}\n`;
  }
  prompt += `    }\n  ]\n}`;

  const response = await ollama.generate({
    model: targetModel,
    system: `CRITICAL MANDATE: You MUST output all actual content (dish names, ingredients, steps, allergens) in ${langName}. Do NOT use French unless ${langName} is FRANÇAIS. The JSON keys must remain as specified. NO EXCEPTIONS.`,
    prompt: prompt,
    images: base64Image ? [base64Image] : void 0,
    format: "json",
    options: { temperature: 0.85, top_p: 0.9, num_ctx: 4096, num_predict: 4000 },
  });
  let cleanResponse = response.response;
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    let parsedData: LlmResponse = safeJsonParse(cleanResponse) as LlmResponse;
    if (Array.isArray(parsedData)) {
        parsedData = { status: "success", traditional_menu: parsedData };
    } else if (parsedData && !parsedData.traditional_menu && (parsedData.entree || parsedData.plat)) {
        parsedData = { status: "success", traditional_menu: [parsedData] };
    } else if (parsedData && !parsedData.traditional_menu && !parsedData.error && !parsedData.message) {
        const arrProp = Object.values(parsedData).find(v => Array.isArray(v));
        if (arrProp) {
            parsedData.traditional_menu = arrProp;
            parsedData.status = "success";
        } else {
            parsedData.traditional_menu = [{ jour: "Généré", entree: parsedData.entree, plat: parsedData.plat, dessert: parsedData.dessert }];
            parsedData.status = "success";
        }
    }
    
    if (parsedData.traditional_menu && !Array.isArray(parsedData.traditional_menu)) {
        parsedData.traditional_menu = [parsedData.traditional_menu];
    }
    const outputStatus = parsedData.status === "error" ? "error" : "success";
    if (outputStatus === "error" && !parsedData.error && !parsedData.message) {
      parsedData.error = "L'IA a refusé la requête (statut d'erreur).";
    }
    res.json({ status: outputStatus, ...parsedData });
  } catch (error) {
    console.error("\n\nCRITICAL JSON PARSING ERROR:");
    console.error("Raw response:", cleanResponse);
    console.error("Error:", error);
    res.status(500).json({ error: `Erreur de décodage JSON du menu traditionnel généré par [${getModel(ollamaSettingsRef.current)}]`, raw: cleanResponse });
  }
} catch (error) {
  console.error(error);
  const errMsg = error instanceof Error ? error.message : "Erreur inconnue.";
  res.status(500).json({ error: `Échec de génération de menu traditionnel avec l'IA [${getModel(ollamaSettingsRef.current)}]: ${errMsg}` });
}
});

router.post("/api/generate-gastronomic-menu", upload.single("file"), async (req, res) => {
console.log("[OLLAMA] Reçu requête generate-gastronomic-menu...");
try {
  const file = req.file;
  const targetModel = getModel(ollamaSettingsRef.current);
  let base64Image;
  if (file && file.mimetype.startsWith("image/")) {
    base64Image = file.buffer.toString("base64");
  }
  
  const pastRecipes = await db.all("SELECT name FROM recipes");
  const pastNames = pastRecipes.map(r => r.name).slice(-100).join(", ");
  
  const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
  const langName = langMap[ollamaSettingsRef.current.language as keyof typeof langMap] || "ENGLISH";
  
  let prompt = `CRITICAL LANGUAGE MANDATE: THE ENTIRE RESPONSE (INCLUDING DISH NAMES, INGREDIENTS, RECIPE STEPS, AND ALLERGENS) MUST BE WRITTEN IN PERFECT, GRAMMATICALLY CORRECT ${langName}. IF THE LANGUAGE IS NOT FRENCH, YOU MUST FULLY TRANSLATE ALL CULINARY TERMS AND DISH NAMES. DO NOT MIX LANGUAGES.\n\n`;
  if (pastNames) {
    prompt += `MEMORY MANDATE: Do NOT generate or suggest any of the following previously generated recipes: ${pastNames}.\n\n`;
  }
  const typeStr = req.body.dishType ? `1 ${req.body.dishType.toUpperCase()}` : `meal (1 Entree, 1 Plat, 1 Dessert)`;
  prompt += `Act as a 3-Michelin Star Executive Chef of a world-renowned Fine Dining Restaurant. Generate a SINGLE EXTREMELY DETAILED gastronomic full-course ${typeStr}. DO NOT TRUNCATE.\n`;
  prompt += `Operational Mandates:
1. PURE LUXURY & FINE DINING: Use ONLY high-end, noble ingredients (foie gras, truffles, sea urchin, caviar, lobster, wagyu, edible gold, rare herbs). Focus on absolute perfection, minimalist but striking presentation, and poetic, elegant dish names. Mandate sophisticated chef techniques (emulsions, clear consommés, exquisite searing, jus corsé, mirror glazes).
2. PREPARATION STEPS QUALITY: Provide ULTRA DETAILED preparation_steps (min 6 sentences per recipe). Write natural, flowing paragraphs describing the culinary process chronologically in high-end gastronomic terms, focusing on extreme precision, temperatures, and plating architecture.
3. COHERENT RECIPES: Each dish MUST have at least 5 distinct ingredients. The dishes must be poetic, innovative, and perfectly paired to create a majestic tasting experience. Include an accurate allergens list.
4. STRICT REALISTIC QUANTITIES (FOR 1 PORTION ONLY): Ensure ALL ingredient quantities are scaled precisely for EXACTLY ONE FINELY PLATED TASTING PORTION. Fine dining plates use small precise amounts (e.g., '10 g' of caviar, '5 ml' of infused oil, '80 g' of meat). Use professional units ('g', 'ml', 'cl', 'pincée', 'pièce', 'goutte').
5. CRITICAL NAME UNIQUENESS: Give the dishes poetic, minimalist, high-end fine dining names. NEVER just say generic words like "Steak" or "Carpaccio".

CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ${langName} LANGUAGE. THIS MEANS THE ACTUAL STRINGS AND VALUES INSIDE THE JSON MUST BE IN ${langName}. NOTE: The JSON keys (like 'jour', 'entree', 'nom') are in French for system compatibility, but you MUST write the actual dish names, ingredients, and steps entirely in ${langName}!
REQUIRED STRUCTURE (Fill every property. No placeholders.):
{
"status": "success",
"gastronomic_menu": [
{
  "jour": "Unique Dish",\n`;
  if (!req.body.dishType || req.body.dishType === "entree") {
    prompt += `      "entree": {"nom": "...", "ingredients": [{"name": "Ingrédient de Prestige (p. ex., St-Jacques, Foie Gras)", "quantite": 60, "unite": "g"}, {"name": "Élément Floral/Herbe Rare", "quantite": 3, "unite": "pièce"}, {"name": "Gel ou Émulsion aromatisée", "quantite": 10, "unite": "ml"}, {"name": "Tuile fine Croustillante", "quantite": 1, "unite": "pièce"}, {"name": "Fleur de sel de Guérande", "quantite": 1, "unite": "pincée"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed custom Michelin-star preparation steps... min 6/8 sentences..."}${!req.body.dishType ? ',' : ''}\n`;
  }
  if (!req.body.dishType || req.body.dishType === "plat") {
    prompt += `      "plat": {"nom": "...", "ingredients": [{"name": "Protéine Noble d'Exception (p. ex., Wagyu, Homard)", "quantite": 140, "unite": "g"}, {"name": "Jus Corsé ou Réduction", "quantite": 20, "unite": "ml"}, {"name": "Botanique/Légume racine glacé", "quantite": 60, "unite": "g"}, {"name": "Beurre noisette infusé", "quantite": 10, "unite": "g"}, {"name": "Poudre déshydratée (cendres/aromates)", "quantite": 2, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed custom Michelin-star preparation steps... min 6/8 sentences..."}${!req.body.dishType ? ',' : ''}\n`;
  }
  if (!req.body.dishType || req.body.dishType === "dessert") {
    prompt += `      "dessert": {"nom": "...", "ingredients": [{"name": "Mousse ou Ganache d'exception", "quantite": 50, "unite": "g"}, {"name": "Sorbet de fruits rares", "quantite": 30, "unite": "g"}, {"name": "Coulis scintillant / Miroir", "quantite": 10, "unite": "ml"}, {"name": "Feuille d'or comestible", "quantite": 1, "unite": "pièce"}], "allergens": ["..."], "preparation_steps": "Paragraph describing detailed custom Michelin-star preparation steps... min 6/8 sentences..."}\n`;
  }
  prompt += `    }\n  ]\n}`;

  const response = await ollama.generate({
    model: targetModel,
    system: `CRITICAL MANDATE: You MUST output all actual content (dish names, ingredients, steps, allergens) in ${langName}. Do NOT use French unless ${langName} is FRANÇAIS. The JSON keys must remain as specified. NO EXCEPTIONS.`,
    prompt: prompt,
    images: base64Image ? [base64Image] : void 0,
    format: "json",
    options: { temperature: 0.85, top_p: 0.9, num_ctx: 4096, num_predict: 4000 },
  });
  let cleanResponse = response.response;
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    let parsedData: LlmResponse = safeJsonParse(cleanResponse) as LlmResponse;
    if (Array.isArray(parsedData)) {
        parsedData = { status: "success", gastronomic_menu: parsedData };
    } else if (parsedData && !parsedData.gastronomic_menu && (parsedData.entree || parsedData.plat)) {
        parsedData = { status: "success", gastronomic_menu: [parsedData] };
    } else if (parsedData && !parsedData.gastronomic_menu && !parsedData.error && !parsedData.message) {
        const arrProp = Object.values(parsedData).find(v => Array.isArray(v));
        if (arrProp) {
            parsedData.gastronomic_menu = arrProp;
            parsedData.status = "success";
        } else {
            parsedData.gastronomic_menu = [{ jour: "Généré", entree: parsedData.entree, plat: parsedData.plat, dessert: parsedData.dessert }];
            parsedData.status = "success";
        }
    }
    
    if (parsedData.gastronomic_menu && !Array.isArray(parsedData.gastronomic_menu)) {
        parsedData.gastronomic_menu = [parsedData.gastronomic_menu];
    }
    const outputStatus = parsedData.status === "error" ? "error" : "success";
    if (outputStatus === "error" && !parsedData.error && !parsedData.message) {
      parsedData.error = "L'IA a refusé la requête (statut d'erreur).";
    }
    res.json({ status: outputStatus, ...parsedData });
  } catch (error) {
    console.error("\n\nCRITICAL JSON PARSING ERROR:");
    console.error("Raw response:", cleanResponse);
    console.error("Error:", error);
    res.status(500).json({ error: `Erreur de décodage JSON du menu gastronomique généré par [${getModel(ollamaSettingsRef.current)}]`, raw: cleanResponse });
  }
} catch (error) {
  console.error(error);
  const errMsg = error instanceof Error ? error.message : "Erreur inconnue.";
  res.status(500).json({ error: `Échec de génération de menu gastronomique avec l'IA [${getModel(ollamaSettingsRef.current)}]: ${errMsg}` });
}
});

  return router;
}
