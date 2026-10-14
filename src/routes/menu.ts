// Routes : Menus (analyse de menu par IA : empreinte optique du menu papier)
import { Router } from "express";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse, LlmResponse } from "../shared/util.js";
import { upload } from "../shared/upload.js";
import { generer } from "../shared/llm.js";
import { ollamaSettingsRef } from "../shared/ollama.js";
import { uploadsDir } from "../services/paths.js";
import { STANDARD_QUANTITIES_PROMPT, STANDARD_QUANTITIES_ES_PROMPT, STANDARD_QUANTITIES_DE_PROMPT, STANDARD_QUANTITIES_IT_PROMPT, STANDARD_QUANTITIES_ENG_PROMPT } from "../prompts/menuPrompts.js";
import type { AuditLogger } from "../services/audit.js";

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

// Sprint 16 : normaliser la catégorie lue par l'IA en une carte du produit
// (entree/plat/dessert). La liste est écrite d'avance, jamais devinée ; la
// même liste joue pour les cinq langues (les libellés français, anglais,
// allemand, espagnol, italien) et toute valeur non reconnue reste telle
// quelle.
const CARTE_LISTE: Array<{ carte: string; mots: RegExp }> = [
  { carte: "entree", mots: /entree|entr[eé]|starter|appetizer|vorspeise|aperitivo|antipasto|primi/i },
  { carte: "plat", mots: /plat|main course|main dish|hauptgang|hauptgericht|secondo|principal/i },
  { carte: "dessert", mots: /dessert|postre|nachspeise/i },
];
function normaliserCarte(categorie: string): string {
  const c = String(categorie).trim().toLowerCase();
  if (c === "") return "";
  for (const { carte, mots } of CARTE_LISTE) {
    if (mots.test(c)) return carte;
  }
  return c;
}

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
  // Chantier 11 : porte unique (system + image supportés quel que soit le serveur).
  const response = await generer({
    prompt,
    system: `CRITICAL MANDATE: You MUST output all actual content (dish names, ingredients, steps, allergens) in ${langName}. Do NOT use French unless ${langName} is FRANÇAIS. The JSON keys must remain as specified. NO EXCEPTIONS.`,
    image: isImage ? base64Image : null,
    format: "json",
    temperature: 0.2,
  });
  let cleanResponse = response.texte;
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  const parsedData = safeJsonParse(cleanResponse) as LlmResponse & { fiches_techniques?: Array<Record<string, unknown>> };
  if (parsedData.fiches_techniques) {
    parsedData.fiches_techniques = parsedData.fiches_techniques.map(
      (recipe) => ({
        ...recipe,
        source_image_url: imageUrl,
        // Sprint 16 : la catégorie lue par l'IA sur le menu papier est NORMALISÉE
        // en une carte du produit (entree/plat/dessert) — « Starter, Main
        // Course, or Dessert » et les catégories textuelles locales (« Entrée »,
        // « Starter »...) se rangent dans la bonne carte. Une valeur non
        // reconnue reste telle quelle (la carte UI la range en « Fiches
        // Importées » ; jamais de devinette).
        dish_type: normaliserCarte(String((recipe as Record<string, unknown>).categorie ?? "")),
      }),
    );
  }
  await logAudit(req, res, { route: "/api/analyze-menu", action: "analyze" });
  res.json(parsedData);
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Processing failed" });
}
});
  return router;
}
