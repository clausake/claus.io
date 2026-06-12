const fs = require('fs');

let c = fs.readFileSync('server.ts', 'utf-8');

const regex = /const targetModel = getModel\(settings\);\s*const promptText = `System: You are an expert AI for food safety[\s\S]*?console.error\("\[OLLAMA\] Erreur critique lors du scan HACCP :", error\);\s*res.status\(500\)\.json\(\{ status: 'error', message: "Erreur de connexion a l'IA locale Ollama. Verifiez qu'Ollama est bien lance sur ce PC." \}\);\s*\}\s*\n\s*\}\);/m;

const replacement = `const targetModel = getModel(settings);
      
      console.log(\`\\n======================================================\`);
      console.log(\`[CERVEAU IA CONNECTÉ] L'extraction de la facture utilise : \${targetModel}\`);
      console.log(\`======================================================\\n\`);
      
      const payload: any = {
        model: targetModel,
        prompt: \`You are an OCR and data extraction AI. Extract the exact text from this invoice or delivery note image and map it to the requested JSON format.

CRITICAL RULES:
1. ONLY use data visible in the image. Do NOT invent data.
2. If a value is not found, use an empty string "" or 0.
3. You MUST return ONLY valid JSON.

JSON FORMAT EXPECTED (Do not copy this, fill it with real data):
{
  "type": "FACTURE",
  "supplier": "",
  "date": "",
  "total_amount": 0.0,
  "items": [
    {
      "item": "",
      "quantity": 0,
      "unit": "",
      "unit_price": 0.0,
      "total_price": 0.0
    }
  ]
}\`,
        images: [imageBuffer],
        format: 'json'
      };

      const response = await ollama.generate({
        ...payload,
        options: { temperature: 0.1 }
      });

      let cleanResponse = (response as any).response;
      const jsonMatch = cleanResponse.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) cleanResponse = jsonMatch[0];

      const parsedData = JSON.parse(cleanResponse);

      res.json({ 
        status: 'SUCCESS', 
        data: parsedData,
        source_image_url: \`/uploads/\${filename}\`
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  app.post("/api/haccp/scan", upload.single('image'), async (req, res) => {
    console.log("[OLLAMA] Reçu une demande de scan HACCP...");
    try {
      const file = req.file;
      if (!file) {
        console.error("[OLLAMA] Erreur : Pas d'image reçue");
        return res.status(400).json({ error: "No image" });
      }

      if (fs.existsSync(settingsPath)) {
        try {
          const data = fs.readFileSync(settingsPath, 'utf8');
          settings = { ...settings, ...JSON.parse(data) };
        } catch(e) {}
      }

      console.log(\`[OLLAMA] Conversion de l'image (taille: \${file.buffer.length} bytes)...\`);
      const base64Image = file.buffer.toString('base64');
      
      const isImage = file.mimetype.startsWith('image/');
      let imageUrl = null;
      if (isImage) {
        const ext = file.originalname.split('.').pop() || 'jpg';
        const filename = \`dlc_\${Date.now()}.\${ext}\`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, file.buffer);
        imageUrl = \`/uploads/\${filename}\`;
      }
      
      const targetModel = getModel(settings);
      console.log(\`[OLLAMA] Appel du modèle \${targetModel} pour HACCP...\`);
      const response = await ollama.generate({
        model: targetModel,
        prompt: \`System: You are an expert AI for food safety (HACCP) in a restaurant. Analyze this food label image carefully.
        Interface language: \${settings.language === 'fr' ? 'Français' : 'English'}.
        
        Extract the details. Identify any major allergens present (Gluten, Lactose, Eggs, Soy, etc.).
        Return ONLY a pure JSON object without markdown.
        Format requested (CRUCIAL): 
        {"product": "Nom du produit", "lot": "Numéro de lot", "dlc": "YYYY-MM-DD", "allergens": ["Allergène 1", "Allergène 2"]}\`,
        images: [base64Image],
        options: { temperature: 0.1 }
      });
      
      console.log("[OLLAMA] Réponse reçue :", response.response);
      
      let cleanResponse = (response as any).response;
      const jsonMatch = cleanResponse.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) cleanResponse = jsonMatch[0];
      
      try {
        const data = JSON.parse(cleanResponse);
        if (imageUrl) {
          data.source_image_url = imageUrl;
        }
        console.log("[OLLAMA] Données extraites avec succès :", data);
        res.json(data);
      } catch (parseError) {
        console.error("[OLLAMA] Erreur de parsing JSON de la réponse de l'IA :", cleanResponse);
        res.status(500).json({ status: 'error', message: "L'IA a retourné un format invalide. Essayez avec une photo plus nette." });
      }
    } catch (error) {
      console.error("[OLLAMA] Erreur critique lors du scan HACCP :", error);
      res.status(500).json({ status: 'error', message: "Erreur de connexion a l'IA locale Ollama. Verifiez qu'Ollama est bien lance sur ce PC." });
    }
  });`;

if (c.match(regex)) {
   c = c.replace(regex, replacement);
   fs.writeFileSync('server.ts', c);
   console.log('Fixed endpoints!');
} else {
   console.log('Regex did not match');
   console.log(c.substring(c.indexOf('const targetModel = getModel(settings);'), c.indexOf('const targetModel = getModel(settings);') + 2000));
}
