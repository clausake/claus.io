import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const ES_STD_QTY = `
  const STANDARD_QUANTITIES_ES_PROMPT = \`
        IMPORTANTE: RESPETA IMPERATIVAMENTE ESTOS ESTÁNDARES DE CANTIDADES POR PERSONA:
        - PROHIBICIÓN ABSOLUTA: NUNCA utilices "verduras congeladas" en tus recetas. Utiliza únicamente productos FRESCOS y de TEMPORADA.
        - ENTRANTES: Embutidos varios (60g), Jamón (70g), Terrina o paté (60g), Pizza/quiche/tartas saladas (100g), Verduras crudas frescas (150g), Ensaladas de almidón (arroz, pasta, tabulé) (80g).
        - PASTA - ARROZ: Pasta de trigo duro (150g como plato principal, 125g como guarnición), Tallarines (150g principal, 125g guarnición), Gnocchi (350g principal, 300g guarnición), Raviolis y otras pastas rellenas (380g), Arroz (125g).
        - PESCADOS: En filetes (145g), Calamares y otros (200g), Mariscos (100g).
        - CARNES: Pecho de ternera (180g), Entrecot (180g), Carne picada (145g), Salteados de ternera, cerdo, pavo, pollo (220g), Salteado de pato (280g), Asado de ternera, pavo, cerdo, cordero (180g).
        - GUARNICIONES: Verduras FRESCAS de mercado (250g), Lentejas (125g), Patatas fritas y otras patatas (250g), Polenta (60g), Quinoa (250g), Trigo (125g).
        - OTROS: Pesto (80g).
  \`;
`;

code = code.replace(
  /const STANDARD_QUANTITIES_ENG_PROMPT = `[\s\S]*?`;/,
  match => match + '\n' + ES_STD_QTY
);

// Replace \$\{STANDARD_QUANTITIES_PROMPT\} with \$\{STANDARD_QUANTITIES_ES_PROMPT\} in the ES prompt overrides in fixPromptsAll.js previously.
// Actually, earlier I made it use STANDARD_QUANTITIES_PROMPT for ES, let's fix that.
code = code.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL[\s\S]*?` : settings\.language/g,
  match => match.replace(/\$\{STANDARD_QUANTITIES_PROMPT\}/g, '${STANDARD_QUANTITIES_ES_PROMPT}')
);

// Now for `analyze-menu`
code = code.replace(
  /const prompt = settings\.language === 'es' \? `Analiza este menú y extrae las fichas técnicas descompuestas\\.\\n\\nInstrucciones:\\n1\\. Identifica cada receta\\.\\n2\\. Mención Obligatoria: lista de alérgenos\\.\\n3\\. Extraer ingredientes\\.\\n4\\. Instrucciones detalladas\\.\\n\$\{STANDARD_QUANTITIES_PROMPT\}\\nRESPONDER ÚNICAMENTE EN JSON:` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`Analiza este menú y extrae las fichas técnicas descompuestas.
      
      Instrucciones:
      1. Identifica cada receta presente en el documento.
      2. MENCIÓN OBLIGATORIA: Para cada plato, enumera los posibles alérgenos.
      3. Extraer cada ingrediente con la cantidad recomendada por persona.
      4. Indica los pasos de preparación detallados para cada receta.
      5. \${STANDARD_QUANTITIES_ES_PROMPT}

      IMPORTANTE: TODA TU RESPUESTA DEBE ESTAR EN ESPAÑOL.
      Responde ÚNICAMENTE en JSON con este formato:
      {
        "status": "success",
        "fiches_techniques": [
          {
            "recette": "Nombre de la receta",
            "categorie": "Entrante, Plato Principal, o Postre",
            "ingredients": [
              {"name": "Nombre del ingrediente", "quantite": 0, "unite": "g"}
            ],
            "allergens": ["Alérgeno 1", "Alérgeno 2"],
            "preparation_steps": "Pasos detallados de preparación paso a paso..."
          }
        ]
      }\` : settings.language`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed analyze menu');
