const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const startIndex = code.indexOf('app.post(\n    "/api/generate-creative-menu"');
const endIndex = code.indexOf('app.post("/api/haccp/scan"');

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end index.");
  process.exit(1);
}

const replacement = `app.post("/api/generate-creative-menu", upload.single("file"), async (req, res) => {
    console.log("[OLLAMA] Reçu requête generate-creative-menu...");
    try {
      const file = req.file;
      const mode = req.body.mode || 'weekly';
      const targetModel = getModel(settings);
      let base64Image;
      if (file && file.mimetype.startsWith("image/")) {
        base64Image = file.buffer.toString("base64");
      }
      
      const isSingle = mode === 'single';
      
      let prompt = \`LANGUAGE MANDATE: RESPONSE IN \${settings.language.toUpperCase()}.\nAct as an Avant-Garde International Executive Chef. Generate a \${isSingle ? 'SINGLE creative dish' : '7-DAY creative menu'}.\n\`;
      prompt += \`Operational Mandates:\n1. CREATIVE CUISINE: Mix dishes, flavors from different regions.\n2. DATA INTEGRITY: Provide detailed preparation_steps (min 15 sentences), allergens list, exact quantities in grams or ml.\n\`;
      
      if (isSingle) {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"creative_menu": [{"jour":"Creation Unique", "dejeuner":{"plat_creatif":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."} } ]}\`;
      } else {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"creative_menu": [{"jour":"lundi", "dejeuner":{"plat_creatif":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."}, "diner": {"plat_creatif":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}}]}\`;
      }

      const response = await ollama.generate({
        model: targetModel,
        prompt: prompt,
        images: base64Image ? [base64Image] : void 0,
        format: "json",
        options: { temperature: 0.8, top_p: 0.95 },
      });
      let cleanResponse = response.response;
      const jsonMatch = cleanResponse.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) cleanResponse = jsonMatch[0];
      res.json(JSON.parse(cleanResponse));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed" });
    }
});

app.post("/api/generate-traditional-menu", upload.single("file"), async (req, res) => {
    console.log("[OLLAMA] Reçu requête generate-traditional-menu...");
    try {
      const file = req.file;
      const mode = req.body.mode || 'weekly';
      const targetModel = getModel(settings);
      let base64Image;
      if (file && file.mimetype.startsWith("image/")) {
        base64Image = file.buffer.toString("base64");
      }
      
      const isSingle = mode === 'single';
      
      let prompt = \`LANGUAGE MANDATE: RESPONSE IN \${settings.language.toUpperCase()}.\nAct as a Chic Bistro Chef. Generate a \${isSingle ? 'SINGLE traditional dish' : '7-DAY traditional menu'}.\n\`;
      prompt += \`Operational Mandates:\n1. CHIC BISTRO CUISINE: High quality classical, traditional dishes with a touch of elegance.\n2. DATA INTEGRITY: Provide detailed preparation_steps (min 15 sentences), allergens list, exact quantities in grams or ml.\n\`;
      
      if (isSingle) {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"status":"success", "traditional_menu": [{"jour":"Menu Unique", "entree":null, "plat":{"nom":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."}, "dessert":null } ]}\`;
      } else {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"status":"success", "traditional_menu": [{"jour":"lundi", "entree":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."}, "dessert": {"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}}]}\`;
      }

      const response = await ollama.generate({
        model: targetModel,
        prompt: prompt,
        images: base64Image ? [base64Image] : void 0,
        format: "json",
        options: { temperature: 0.8, top_p: 0.95 },
      });
      let cleanResponse = response.response;
      const jsonMatch = cleanResponse.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) cleanResponse = jsonMatch[0];
      res.json(JSON.parse(cleanResponse));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed" });
    }
});

app.post("/api/generate-gastronomic-menu", upload.single("file"), async (req, res) => {
    console.log("[OLLAMA] Reçu requête generate-gastronomic-menu...");
    try {
      const file = req.file;
      const mode = req.body.mode || 'weekly';
      const targetModel = getModel(settings);
      let base64Image;
      if (file && file.mimetype.startsWith("image/")) {
        base64Image = file.buffer.toString("base64");
      }
      
      const isSingle = mode === 'single';
      
      let prompt = \`LANGUAGE MANDATE: RESPONSE IN \${settings.language.toUpperCase()}.\nAct as a 3-Michelin Star Executive Chef. Generate a \${isSingle ? 'SINGLE gastronomic dish' : '7-DAY gastronomic menu'}.\n\`;
      prompt += \`Operational Mandates:\n1. FINE DINING: Noble ingredients, high-end techniques, poetic dish names.\n2. DATA INTEGRITY: Provide detailed preparation_steps (min 15 sentences), allergens list, exact quantities in grams or ml.\n\`;
      
      if (isSingle) {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"gastronomic_menu": [{"jour":"Plat Unique", "entree":null, "plat":{"nom":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."}, "dessert":null } ]}\`;
      } else {
         prompt += \`RESPOND STRICTLY IN JSON FORMAT:\n{"gastronomic_menu": [{"jour":"lundi", "entree":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[{"name":"Name", "quantite":"number", "unite":"g/ml"}], "allergens":[], "preparation_steps":"..."}, "dessert": {"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}}]}\`;
      }

      const response = await ollama.generate({
        model: targetModel,
        prompt: prompt,
        images: base64Image ? [base64Image] : void 0,
        format: "json",
        options: { temperature: 0.8, top_p: 0.95 },
      });
      let cleanResponse = response.response;
      const jsonMatch = cleanResponse.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) cleanResponse = jsonMatch[0];
      res.json(JSON.parse(cleanResponse));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed" });
    }
});

`;

let newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex);

fs.writeFileSync('server.ts', newCode);
console.log('Replaced successfully.');
