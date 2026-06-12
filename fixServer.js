import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

// Fix 957: remove ${menuText} and use correct translation, also the json structure should match
text = text.replace(/const prompt = settings\.language === 'es' \? `Analiza este menú y extrae las fichas técnicas descompuestas\.\\n\\nMenú: \$\{menuText\}\\n\\nResponde ÚNICAMENTE en JSON con los ingredientes, la cantidad por persona y el costo estimado.` : settings\.language === 'en' \? `Analyze this menu/g, "const prompt = settings.language === 'es' ? `Analiza este menú y extrae las fichas técnicas descompuestas.\\n\\nInstrucciones:\\n1. Identifica cada receta.\\n2. Mención Obligatoria: lista de alérgenos.\\n3. Extraer ingredientes.\\n4. Instrucciones detalladas.\\n\${STANDARD_QUANTITIES_PROMPT}\\nRESPONDER ÚNICAMENTE EN JSON:` : settings.language === 'en' ? `Analyze this menu");

// Fix 1149 (Traditional menu)
text = text.replace(/const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL\.\\n\\nActúa como un Chef Ejecutivo especializado en cocina de vanguardia\. Genera un Menú Creativo y una hoja técnica única\.\\n\\n\$\{STANDARD_QUANTITIES_PROMPT\}\\n\\nResponde ÚNICAMENTE en JSON` : settings\.language === 'en' \? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH\. NO FRENCH ALLOWED\./g,
function(match, offset, string) {
  // Only replace if it's inside generate-traditional-menu (around offset ~ 51300 but let's just make it exact)
  if (string.substring(Math.max(0, offset - 1000), offset).includes('/api/generate-traditional-menu')) {
     return "const prompt = settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL.\\n\\nActúa como Chef de un bistró elegante. Genera un menú semanal.\\n\${STANDARD_QUANTITIES_PROMPT}\\nResponde EN JSON` : settings.language === 'en' ? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH. NO FRENCH ALLOWED.";
  }
  return match;
});

// Write it back
fs.writeFileSync('server.ts', text);
