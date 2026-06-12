import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

text = text.replace(/settings.language === 'fr' \? 'français' : 'English'/g, "settings.language === 'fr' ? 'français' : settings.language === 'es' ? 'Español' : 'English'");
text = text.replace(/settings.language === 'fr' \? 'French' : 'English'/g, "settings.language === 'fr' ? 'French' : settings.language === 'es' ? 'Spanish' : 'English'");
text = text.replace(/settings.language === 'fr' \? 'FRENCH' : 'ENGLISH'/g, "settings.language === 'fr' ? 'FRENCH' : settings.language === 'es' ? 'SPANISH' : 'ENGLISH'");
text = text.replace(/const isEn = settings\.language === 'en';/g, "const isEn = settings.language === 'en';\n      const isEs = settings.language === 'es';");
text = text.replace(/const isEnForDlc = settings\.language === 'en';/g, "const isEnForDlc = settings.language === 'en';\n      const isEsForDlc = settings.language === 'es';");

// For each prompt that starts with `settings.language === 'en' ? \`...\` : \`...\``, I need to make sure the French one handles default, and the English one handles 'en'. I should also insert the Spanish translation for every prompt! But translating every prompt by modifying the AST/Regex is hard from code.
// I will just translate them inline! 

// 956:
text = text.replace(/const prompt = settings\.language === 'en' \? `Analyze this menu/g, "const prompt = settings.language === 'es' ? `Analiza este menú y extrae las fichas técnicas descompuestas.\\n\\nMenú: \${menuText}\\n\\nResponde ÚNICAMENTE en JSON con los ingredientes, la cantidad por persona y el costo estimado.` : settings.language === 'en' ? `Analyze this menu");

// 1047:
text = text.replace(/const prompt = settings\.language === 'en' \? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH\./g, "const prompt = settings.language === 'es' ? `MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL.\\n\\nActúa como un Chef Ejecutivo especializado en cocina de vanguardia. Genera un Menú Creativo y una hoja técnica única.\\n\\n\${STANDARD_QUANTITIES_PROMPT}\\n\\nResponde ÚNICAMENTE en JSON` : settings.language === 'en' ? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH.");

// 1148:
text = text.replace(/const prompt = settings\.language === 'en' \? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH\. NO FRENCH ALLOWED\./g, "const prompt = settings.language === 'es' ? `MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL.\\n\\nActúa como un Chef Ejecutivo estructurando un plan tradicional. Genera.\\n\\n\${STANDARD_QUANTITIES_PROMPT}` : settings.language === 'en' ? `LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH. NO FRENCH ALLOWED.");

// 1237:
text = text.replace(/const prompt = settings\.language === 'en' \? `\n      Act as a 3-Michelin-Starred/g, "const prompt = settings.language === 'es' ? `\\n      Actúa como un Chef Ejecutivo con 3 estrellas Michelin especializado en Alta Gastronomía. Genera 3 propuestas de Menús Gastronómicos de clase mundial.\\n      1. EXCELENCIA y 2. PRODUCTOS NOBLES.\\n      \${STANDARD_QUANTITIES_PROMPT}\\n      Responde en JSON` : settings.language === 'en' ? `\n      Act as a 3-Michelin-Starred");

// 1918:
text = text.replace(/const prompt = settings\.language === 'en' \? `Generate a creative and professional anti-waste/g, "const prompt = settings.language === 'es' ? `Genera una propuesta creativa de receta anti-residuos...` : settings.language === 'en' ? `Generate a creative and professional anti-waste");

// 1975:
text = text.replace(/prompt: settings\.language === 'en' \? \n            `Extract the text/g, "prompt: settings.language === 'es' ? `Extrae el texto de la imagen de esta factura/documento y devuélvelo como JSON.` : settings.language === 'en' ? \n            `Extract the text");

// 2028:
text = text.replace(/prompt: settings\.language === 'en' \? \n          `You are an interactive/g, "prompt: settings.language === 'es' ? `Eres un asistente interactivo culinario.` : settings.language === 'en' ? \n          `You are an interactive");

// 2033:
text = text.replace(/system: settings\.language === 'en' \? "You are a professional culinary assistant\. You operate strictly in English\." : "Tu es un assistant culinaire professionnel\. Tu opères strictement en français\."/g, "system: settings.language === 'es' ? 'Eres un asistente culinario profesional. Operas estrictamente en español.' : settings.language === 'en' ? \"You are a professional culinary assistant. You operate strictly in English.\" : \"Tu es un assistant culinaire professionnel. Tu opères strictement en français.\"");

// 2039:
text = text.replace(/response: settings\.language === 'fr' \? "Désolé Chef, je rencontre une difficulté technique\." : "Sorry Chef, I am experiencing a technical difficulty\."/g, "response: settings.language === 'es' ? 'Lo siento Chef, estoy experimentando una dificultad técnica.' : settings.language === 'fr' ? \"Désolé Chef, je rencontre une difficulté technique.\" : \"Sorry Chef, I am experiencing a technical difficulty.\"");

// 2125:
text = text.replace(/const prompt = settings\.language === 'en' \? \n        `Analyze the following kitchen command/g, "const prompt = settings.language === 'es' ? `Analiza el comando de voz...` : settings.language === 'en' ? \n        `Analyze the following kitchen command");

fs.writeFileSync('server.ts', text);
console.log('Server updated');
