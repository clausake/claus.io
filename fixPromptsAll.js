import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// HACCP Prompt
code = code.replace(
  /const dlcPrompt = isEnForDlc\s*\?\s*`Extract/g,
  `const dlcPrompt = isEsForDlc
        ? \`Extrae información de esta ETIQUETA DE TRAZABILIDAD DE PRODUCTO (HACCP) en formato JSON: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
        ADVERTENCIA: El JSON de salida DEBE usar la clave 'dlc' estrictamente para la Fecha de Caducidad. NO uses 'dgc' o cualquier otra clave.
        ADVERTENCIA: Si es una FACTURA compelta o ALBARÁN, procesa solo un artículo principal o indica que es un documento logístico. 
        REQUISITO CRÍTICO: Encuentra específicamente la información de trazabilidad sanitaria (Fecha de Caducidad/DLC, Lote). 
        El formato de la fecha debe extraerse y estandarizarse a YYYY-MM-DD. 
        Encuentra el PESO o GRAMAJE (ej: 'Peso Neto: 250g' o '500 ml'). 
        - Si ves '500g', entones quantity=500, unit='g'.
        - Si ves '1 kg', entoces quantity=1, unit='kg'.
        NUNCA dejes quantity en 0 si un peso es visible.\`
        : isEnForDlc
        ? \`Extract`
);

// Creative Menu Prompt
code = code.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\\.\\n\\nActúa como un Chef de Avant-Garde\\. Genera un menú creativo de 7 días\\.\\n\$\{STANDARD_QUANTITIES_PROMPT\}\\nResponde EN JSON` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL. NO SE PERMITE FRANCÉS.

      Actúa como un Chef Ejecutivo de Avant-Garde de clase mundial. Genera un menú semanal (7 días) ultra moderno y conceptual.

      Mandatos Operativos:
      1. CREATIVIDAD RADICAL: Prioriza emparejamientos de sabores experimentales y ingredientes inusuales. Propón experimentos audaces (ej: infusiones botánicas inesperadas, contrastes texturales radicales) que redefinan el arte culinario moderno.
      2. REQUISITO DE PRESTIGIO: Céntrate en la artesanía fina artesanal y técnicas revolucionarias (ej: gastronomía molecular, hidrocoloides avanzados, fermentación, criogenia, extracciones de precisión). Crea una revolución sensorial.
      3. CERO REPETICIÓN: ESTRICTAMENTE PROHIBIDO reutilizar cualquier ingrediente o técnica central a lo largo de los 7 días. Asegura una diversidad total y radical.
      4. INTEGRIDAD DE DATOS:
         - Alérgenos: Enumera todos los aplicables.
         - Cantidades: Gramo/ml exacto por persona.
      5. PASOS DE PREPARACIÓN (MISIÓN CRÍTICA): Los 'preparation_steps' deben ser una narrativa técnica de grado profesional (8-12 oraciones). Incluye parámetros técnicos (temperaturas/presiones), herramientas innovadoras específicas, y una estética de emplatado intrincada. Describe la lógica detrás de la combinación de sabores de vanguardia.
      6. \${STANDARD_QUANTITIES_PROMPT}

      IMPORTANTE: TODA TU RESPUESTA DEBE ESTAR EN ESPAÑOL.
      Responde SOLO en JSON con este formato:
      {
        "status": "success",
        "creative_menu": [
          {
            "jour": "lunes",
            "dejeuner": {
              "plat_creatif": "Nombre de plato vanguardista",
              "ingredients": [{"name": "Ingrediente", "quantite": 0, "unite": "g"}],
              "allergens": ["Alérgeno 1"],
              "preparation_steps": "Instrucciones detalladas de emplatado arquitectónico y preparación..."
            },
            "diner": {
              "plat_creatif": "Nombre de plato vanguardista",
              "ingredients": [{"name": "Ingrediente", "quantite": 0, "unite": "g"}],
              "allergens": ["Alérgeno 1"],
              "preparation_steps": "Instrucciones detalladas de emplatado arquitectónico y preparación..."
            }
          }
        ]
      }\` : settings.language`
);

// Traditional Menu Prompt
code = code.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\\.\\n\\nActúa como Chef de un bistró elegante\\. Genera un menú semanal\\.\\n\$\{STANDARD_QUANTITIES_PROMPT\}\\nResponde EN JSON` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL. NO SE PERMITE FRANCÉS.

      Actúa como Chef Ejecutivo de un Bistró Elegante de vanguardia. Genera un menú semanal (7 días) de cocina de Bistró Elegante (tradición sublimada y modernizada).

      Instrucciones:
      1. REQUISITO DE PROPUESTA: Genera un menú COMPLETO para 7 días (de lunes a domingo).
      2. ESTRUCTURA DEL MENÚ: Cada día DEBE contener una Entrante (entree), un Plato principal (plat) y un Postre (dessert). Total de 21 platos.
      3. FILOSOFÍA DE BISTRÓ ELEGANTE: Propuestas de platos sofisticados, modernos y con alma que redefinen la cocina clásica de bistró francés. Enfoque en productos artesanales locales y de temporada. El ambiente debe ser elegante pero reconfortante—NUNCA al "estilo cafetería".
      4. CERO REPETICIÓN: ESTRICTAMENTE PROHIBIDO reutilizar cualquier ingrediente principal a lo largo de los 7 días.
      5. EQUILIBRIO SENSORIAL: Cada plato DEBE equilibrar sabores y contrastar texturas.
      6. INTEGRIDAD DE DATOS:
         - Alérgenos: Enumera todos los aplicables.
         - Cantidades: Gramo/ml exacto por persona.
      7. PASOS DE PREPARACIÓN (MISIÓN CRÍTICA): Los 'preparation_steps' DEBEN ser una narrativa técnica de grado profesional con un MÍNIMO de 10 pasos detallados. Incluye técnicas específicas de cocción (ej: sous-vide, sellado controlado, reducción lenta).
      8. \${STANDARD_QUANTITIES_PROMPT}

      IMPORTANTE: TODA TU RESPUESTA DEBE ESTAR EN ESPAÑOL.
      Responde SOLO en JSON con esta estructura, asegurando que se incluyan 7 días (lunes-domingo):
      {
        "status": "success",
        "traditional_menu": [
          {
            "jour": "lunes",
            "entree": { "nom": "...", "ingredients": [...], "allergens": [...], "preparation_steps": "..." },
            "plat": { "nom": "...", "ingredients": [...], "allergens": [...], "preparation_steps": "..." },
            "dessert": { "nom": "...", "ingredients": [...], "allergens": [...], "preparation_steps": "..." }
          }
        ]
      }\` : settings.language`
);

// Gastronomic Menu Prompt
code = code.replace(
  /const prompt = settings\.language === 'es' \? `\\n      Actúa como un Chef Ejecutivo con 3 estrellas Michelin especializado en Alta Gastronomía\\. Genera 3 propuestas de Menús Gastronómicos de clase mundial\\.\\n      1\\. EXCELENCIA y 2\\. PRODUCTOS NOBLES\\.\\n      \$\{STANDARD_QUANTITIES_PROMPT\}\\n      Responde en JSON` : settings\.language/g,
  `const prompt = settings.language === 'es' ? \`MANDATO DE IDIOMA: LA RESPUESTA DEBE SER 100% EN ESPAÑOL. NO SE PERMITE FRANCÉS.
  
      Actúa como un Chef Ejecutivo con 3 Estrellas Michelin especializado en Alta Gastronomía. Genera 3 propuestas de Menús Gastronómicos de clase mundial.
      
      Mandatos Operativos:
      1. EXCELENCIA: Cada menú DEBE representar el pináculo de la gastronomía mundial (estándar de 3 estrellas Michelin), enfocándose en el arte visual, el equilibrio estructural y la complejidad profunda.
      2. SOLO PRODUCTOS NOBLES: ESTRICTAMENTE PROHIBIDO utilizar ingredientes comunes. Usa solo los productos más prestigiosos (ej. Wagyu A5, Caviar Osetra, Trufa de Alba, Atún Rojo Toro).
      3. CERO REPETICIÓN: Asegura una diversidad total de ingredientes en todos los menús. Ninguna proteína principal ni guarnición dominante puede aparecer en dos propuestas. Repasa esto para asegurar cero duplicación.
      4. EQUILIBRIO SENSORIAL: Cada plato DEBE equilibrar explícitamente los perfiles ácido, amargo, dulce, salado y umami.
      5. INTEGRIDAD DE DATOS:
         - Alérgenos: Enumera todos los aplicables.
         - Cantidades: Gramo/ml exacto por persona.
      6. PASOS DE PREPARACIÓN (MISIÓN CRÍTICA): Los 'preparation_steps' DEBEN ser una narrativa técnica de grado profesional con un MÍNIMO de 10 pasos detallados.
      7. \${STANDARD_QUANTITIES_PROMPT}

      IMPORTANTE: TODA TU RESPUESTA DEBE ESTAR EN ESPAÑOL.
      Responde SOLO en JSON con este formato:
      {
        "status": "success",
        "gastronomic_menu": [
          {
            "nom_menu": "Nombre Concepto Élite",
            "entree": {
              "nom": "Nombre del Entrante Estrella Michelin",
              "ingredients": [{"name": "Ingrediente", "quantite": 0, "unite": "g"}],
              "allergens": ["..."],
              "preparation_steps": "Emplatado técnico exhaustivo y preparación..."
            },
            "plat": {
              "nom": "Nombre del Plato Estrella Michelin",
              "ingredients": [{"name": "Ingrediente", "quantite": 0, "unite": "g"}],
              "allergens": ["..."],
              "preparation_steps": "Emplatado técnico exhaustivo y preparación..."
            },
            "dessert": {
              "nom": "Nombre del Postre Estrella Michelin",
              "ingredients": [{"name": "Ingrediente", "quantite": 0, "unite": "g"}],
              "allergens": ["..."],
              "preparation_steps": "Emplatado técnico exhaustivo y preparación..."
            }
          }
        ]
      }\` : settings.language`
);

fs.writeFileSync('server.ts', code);
console.log('Prompts fixed');
