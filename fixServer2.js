import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

text = text.replace(/const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL\.\\n\\nActúa como un Chef Ejecutivo especializado en cocina de vanguardia\. Genera un Menú Creativo y una hoja técnica única\.\\n\\n\$\{STANDARD_QUANTITIES_PROMPT\}\\n\\nResponde ÚNICAMENTE en JSON` : settings\.language === 'en' \? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH\. NO FRENCH ALLOWED\./g,
function(match, offset, string) {
  if (string.substring(Math.max(0, offset - 1000), offset).includes('/api/generate-creative-menu')) {
     return "const prompt = settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL.\\n\\nActúa como un Chef de Avant-Garde. Genera un menú creativo de 7 días.\\n\${STANDARD_QUANTITIES_PROMPT}\\nResponde EN JSON` : settings.language === 'en' ? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH. NO FRENCH ALLOWED.";
  }
  return match;
});

fs.writeFileSync('server.ts', text);
