const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add `import pdfParse from "pdf-parse";` at the top if it's not and we use express
if (!code.includes('import pdfParse from "pdf-parse";')) {
  code = code.replace(
    'import express from "express";',
    'import express from "express";\nimport pdfParse from "pdf-parse";'
  );
}

// 2. Modify `/api/documents/upload`
// Locate the PDF handling part inside /api/documents/upload
// The old code uses `fromBuffer(file.buffer...`
// Our target replacement: extract text and append it to the prompt.
// And set `imageBuffer = null` but we might pass text.
// Actually, let's just make a helper function in server.ts to handle both PDF and images robustly for LLM.

// Instead of regex replacing the whole thing, let's replace the `ext === "pdf"` block in /api/documents/upload

let uploadPdfPattern = /\} else if \(ext === "pdf"\) \{\s*console\.log\([\s\S]*?\} else \{/g;
let uploadPdfReplacement = `} else if (ext === "pdf") {
        console.log("[PDF-PARSE] Extraction du texte depuis PDF (upload)...");
        try {
          const pdfData = await pdfParse(file.buffer);
          // We attach the extracted text to req for later use in prompt
          req.pdfText = pdfData.text;
          imageBuffer = null; // No image for Ollama
        } catch (e) {
          console.error("[ERROR] Impossible de parser le PDF.", e);
          return res.status(400).json({ error: "La lecture du PDF a échoué." });
        }
      } else {`;
code = code.replace(uploadPdfPattern, uploadPdfReplacement);

// 3. Inject the pdfText into the prompt in `/api/documents/upload`
// It currently builds `promptText` and does `const response = await ollama.generate({ ... images: [imageBuffer] ... })`
// We need to inject `req.pdfText` into `promptText` if it exists.
let generateCallPatternUpload = /const response = await ollama\.generate\(\{\s*model: targetModel,\s*prompt: promptText,\s*images: \[imageBuffer\],/g;
let generateCallReplaceUpload = `
      if (req.pdfText) {
        promptText += "\\n\\n--- CONTENU EXTRAIT DU PDF ---\\n" + req.pdfText;
      }
      const response = await ollama.generate({
        model: targetModel,
        prompt: promptText,
        images: imageBuffer ? [imageBuffer] : undefined,
`;
code = code.replace(generateCallPatternUpload, generateCallReplaceUpload);

// 4. Modify `/api/documents/:id/extract`
// It currently has: let imageBuffer = fs.readFileSync(filepath).toString("base64");
// We need to check if filepath ends with .pdf
let extractPdfPattern = /let imageBuffer = fs\.readFileSync\(filepath\)\.toString\("base64"\);/g;
let extractPdfReplace = `
      let imageBuffer = null;
      let pdfText = null;
      if (filepath.toLowerCase().endsWith('.pdf')) {
        console.log("[PDF-PARSE] Extraction temporelle (extract)...");
        const pdfData = await pdfParse(fs.readFileSync(filepath));
        pdfText = pdfData.text;
      } else {
        imageBuffer = fs.readFileSync(filepath).toString("base64");
      }
`;
code = code.replace(extractPdfPattern, extractPdfReplace);

let extractGeneratePattern = /const response = await ollama\.generate\(\{\s*model: targetModel,\s*prompt: promptText,\s*images: \[imageBuffer\],/g;
let extractGenerateReplace = `
      if (pdfText) {
        promptText += "\\n\\n--- CONTENU EXTRAIT DU PDF ---\\n" + pdfText;
      }
      const response = await ollama.generate({
        model: targetModel,
        prompt: promptText,
        images: imageBuffer ? [imageBuffer] : undefined,
`;
code = code.replace(extractGeneratePattern, extractGenerateReplace);


// 5. Modify `/api/analyze-menu`
// Current code: 
//       const isImage = file.mimetype.startsWith("image/");
//       let imageUrl = null;
//       if (isImage) { ... }
//       const base64Image = file.buffer.toString("base64");

let analyzeMenuPattern = /const base64Image = file\.buffer\.toString\("base64"\);(\s*const targetModel = getModel\(settings\);)/g;
let analyzeMenuReplace = `
      const base64Image = file.buffer.toString("base64");
      let pdfText = null;
      if (file.originalname.toLowerCase().endsWith('.pdf')) {
        console.log("[PDF-PARSE] Extraction texte Menu PDF...");
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData.text;
      }
$1`;
code = code.replace(analyzeMenuPattern, analyzeMenuReplace);

let analyzeMenuGeneratePattern = /const response = await ollama\.generate\(\{\s*model: targetModel,\s*system:([\s\S]*?),\s*prompt,\s*images: isImage \? \[base64Image\] : void 0,/g;
let analyzeMenuGenerateReplace = `
      if (pdfText) {
        prompt += "\\n\\n--- CONTENU EXTRAIT DU PDF ---\\n" + pdfText;
      }
      const response = await ollama.generate({
        model: targetModel,
        system:$1,
        prompt,
        images: isImage ? [base64Image] : undefined,
`;
code = code.replace(analyzeMenuGeneratePattern, analyzeMenuGenerateReplace);


// 6. Modify `/api/haccp/scan`
// Current code:
//       const base64Image = file.buffer.toString("base64");
//       const isImage = file.mimetype.startsWith("image/");

let haccpScanPattern = /const base64Image = file\.buffer\.toString\("base64"\);\s*const isImage = file\.mimetype\.startsWith\("image\/"\);/g;
let haccpScanReplace = `
      let base64Image = null;
      let pdfText = null;
      let isImage = file.mimetype.startsWith("image/");
      const ext = file.originalname.split(".").pop()?.toLowerCase() || '';

      if (isImage) {
         base64Image = file.buffer.toString("base64");
      } else if (ext === 'pdf') {
         console.log("[PDF-PARSE] Extraction texte HACCP PDF...");
         const pdfData = await pdfParse(file.buffer);
         pdfText = pdfData.text;
         isImage = false; // explicitly handle
      } else {
         base64Image = file.buffer.toString("base64"); // fallback
      }
`;
code = code.replace(haccpScanPattern, haccpScanReplace);

let haccpScanGeneratePattern = /const response = await ollama\.generate\(\{\s*model: targetModel,\s*prompt: dlcPrompt,\s*images: \[base64Image\],/g;
let haccpScanGenerateReplace = `
      if (pdfText) {
        dlcPrompt += "\\n\\n--- CONTENU EXTRAIT DU PDF ---\\n" + pdfText;
      }
      const response = await ollama.generate({
        model: targetModel,
        prompt: dlcPrompt,
        images: base64Image ? [base64Image] : undefined,
`;
code = code.replace(haccpScanGeneratePattern, haccpScanGenerateReplace);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with pdf-parse functionality!");
