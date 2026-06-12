import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const prompt = settings\.language === 'es' \? `DIRECTIVA CRÍTICA: Debes responder en ESPAÑOL\\.\\nGenera pasos de preparación detallados para la receta: \\\$\\{recipe\.name\\}\\.\\nIngredientes: \\\$\\{ingredients\.map\(i => \\"\\" \+ i\.name \+ \\" \(\\" \+ i\.quantity_per_person \+ i\.unit \+ \\"\)\\"\\)\.join\(\(', '\)\}\\.\\nResponde con SÓLO el texto de los pasos\\.` : settings.language/g,
  `const prompt = settings.language === 'es' ? \`DIRECTIVA CRÍTICA: Debes responder en ESPAÑOL.
        Genera pasos de preparación detallados para la receta: \${recipe.name}.
        Ingredientes: \${ingredients.map(i => \`\${i.name} (\${i.quantity_per_person}\${i.unit})\`).join(', ')}.
        Responde en español con SÓLO el texto de los pasos de preparación. Sin introducciones.\` : settings.language`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed recipe steps');
