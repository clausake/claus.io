import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// Anti-Waste Prompt
code = code.replace(
  /const prompt = settings\.language === 'es' \? `Genera una propuesta creativa de receta anti-residuos\.\.\.` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`Genera una propuesta creativa y profesional de recetas anti-residuos.
  
  Instrucciones:
  1. Utiliza prioritariamente estos ingredientes con fecha de caducidad corta para crear la base: \${expiringBatches.map(b => \`\${b.name} (\${b.quantity} \${b.unit}, expira el \${b.expiration_date})\`).join(', ')}.
  2. Complementa estos ingredientes con insumos culinarios básicos (especias, aceites, cereales, lácteos) para crear una receta equilibrada.
  3. MENCIÓN OBLIGATORIA: Para cada plato, enumera los posibles alérgenos.
  
  Responde ÚNICAMENTE en JSON con este formato en ESPAÑOL:
  {
    "menu_name": "Propuesta Anti-Residuos",
    "dishes": [
      {
        "name": "...",
        "ingredients": ["...", "..."],
        "allergens": ["...", "..."],
        "preparation_steps": "..."
      }
    ]
  }\` : settings.language`
);

// Voice/Chat Prompt
code = code.replace(
  /const prompt = settings\.language === 'es' \? `DIRECTIVA: Eres CLAUS\.IO, asistente culinario\. Operas EN ESPAÑOL\\nUsuario: \\"\$\{message\}\\"\\nSi agrega al carrito, responde JSON:\\n\{\\"intent\\":\\"add_to_cart\\",\\"item\\":\\"nombre\\",\\"quantity\\":1,\\"unit\\":\\"kg\\",\\"response\\":\\"Mensaje\\"\\}\\nOtra cosa:\\n\{\\"intent\\":\\"general_advice\\",\\"response\\":\\"Respuesta\\"\\}\\nSÓLO JSON\\.` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`DIRECTIVA CRÍTICA: Eres CLAUS.IO, asistente culinario experto. Operas ESTRICTAMENTE EN ESPAÑOL.
        El usuario dice: "\${message}"
        Analiza la intención. 
        Si el usuario quiere agregar algo al carrito, responde ÚNICAMENTE en formato JSON:
        {
          "intent": "add_to_cart",
          "item": "nombre del ingrediente",
          "quantity": 1,
          "unit": "kg o u",
          "response": "Mensaje de confirmación en español"
        }
        Si es una pregunta general o consejo:
        {
          "intent": "general_advice",
          "response": "Tu experta respuesta culinaria en español"
        }
        Responde SOLO en JSON.\` : settings.language`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed Anti-Waste and Voice');
