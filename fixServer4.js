import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

const regex = /const prompt = settings\.language === 'en' \? \n        `CRITICAL DIRECTIVE:/g;

text = text.replace(regex, "const prompt = settings.language === 'es' ? `DIRECTIVA CRÍTICA: Debes responder en ESPAÑOL.\\nGenera pasos de preparación detallados para la receta: \\${recipe.name}.\\nIngredientes: \\${ingredients.map(i => \\\"\\\" + i.name + \\\" (\\\" + i.quantity_per_person + i.unit + \\\")\\\").join(', ')}.\\nResponde con SÓLO el texto de los pasos.` : settings.language === 'en' ? \\n        `CRITICAL DIRECTIVE:");

fs.writeFileSync('server.ts', text);
