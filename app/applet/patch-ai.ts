import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

if (!content.includes('import { GoogleGenAI }')) {
  content = content.replace("import { Ollama } from 'ollama';", "import { Ollama } from 'ollama';\nimport { GoogleGenAI } from '@google/genai';");
}

if (!content.includes('async function generateWithGeminiOrOllama')) {
  const helper = `
async function generateWithGeminiOrOllama(promptText: string, base64Image?: string, format: string = 'json', temperature: number = 0.1) {
  try {
    if (process.env.GEMINI_API_KEY) {
      console.log("[GEMINI] Using Gemini API for image extraction");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const contents = [];
      
      if (base64Image) {
        contents.push({
          inlineData: {
            data: base64Image,
            mimeType: "image/jpeg"
          }
        });
      }
      contents.push(promptText);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          responseMimeType: format === 'json' ? 'application/json' : 'text/plain',
          temperature: temperature,
        }
      });
      return response.text;
    }
  } catch (err) {
    console.warn("[GEMINI] Gemini failed, falling back to Ollama", err);
  }
  
  // Ollama fallback
  console.log("[OLLAMA] Using local Ollama for image extraction");
  const payload: any = {
    model: 'llava', // Default model for vision in ollama
    prompt: promptText,
    format: format,
    options: { temperature: temperature }
  };
  if (base64Image) {
    payload.images = [base64Image];
  }
  const ollamaRes = await ollama.generate(payload);
  return (ollamaRes as any).response;
}
`;

  content = content.replace("const ollama = new Ollama({ host: 'http://localhost:11434' });", "const ollama = new Ollama({ host: 'http://localhost:11434' });\n" + helper);
}

// 1. Patch /api/documents/upload
if (content.includes('const response = await ollama.generate({') && content.includes('/api/documents/upload')) {
   content = content.replace(/const response = await ollama.generate\(\{[\s\S]*?\}\);[\s\S]*?let cleanResponse = \(response as any\).response;/g, `const genText = await generateWithGeminiOrOllama(payload.prompt, imageBuffer, 'json', 0.1); let cleanResponse = genText || "{}"; `);
}

// 2. Patch /api/haccp/scan
if (content.includes('/api/haccp/scan')) {
   content = content.replace(/const targetModel = getModel\(settings\);[\s\S]*?const response = await ollama\.generate\(\{[\s\S]*?\}\);[\s\S]*?console\.log\("\[OLLAMA\] Réponse reçue :", response\.response\);[\s\S]*?let cleanResponse = response\.response;/g, 
   `const promptText = \`System: You are an expert AI for food safety (HACCP) in a restaurant. Analyze this food label image carefully. Extract the details. Identify any major allergens present. Return ONLY a pure JSON object without markdown. Format requested: {"product": "Nom du produit", "lot": "Numéro de lot", "dlc": "YYYY-MM-DD", "allergens": ["Allergène 1"]}\`;
    const genText = await generateWithGeminiOrOllama(promptText, base64Image, 'json', 0.1);
    let cleanResponse = genText || "{}";`);
}

// 3. Patch /api/documents/extract
if (content.includes('/api/documents/extract')) {
   content = content.replace(/const response = await ollama\.generate\(\{[\s\S]*?\}\);[\s\S]*?console\.log\("\[OLLAMA\] Réponse extraction reçue\."\);[\s\S]*?let cleanResponse = response\.response;/g, 
   `const genText = await generateWithGeminiOrOllama(isImage ? promptText : promptText + '\\n\\nText: ' + file.buffer.toString('utf-8').substring(0,3000), isImage ? file.buffer.toString('base64') : undefined, 'json');
    let cleanResponse = genText || "{}";`);
}

fs.writeFileSync('server.ts', content);
console.log('Patched server.ts successfully');
