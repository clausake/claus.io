import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 2. Creative Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\.\\n\\nActúa como un Chef de Avant-Garde\. Genera un menú creativo/g,
  "const prompt = settings.language === 'it' ? `MANDATO DI LINGUA: RISPOSTA IN ITALIANO.\\n\\nAgisci come uno Chef Avant-Garde. Genera un menu creativo di 7 giorni.\\n1. CREATIVITÀ RADICALE: Priorità ad associazioni sperimentali. Nomi lunghi e poetici.\\n2. NESSUNA DUPLICAZIONE.\\n3. FUSIONI GLOBALI. \\n4. JSON STRINGENTE.\\n5. FASI DI PREPARAZIONE (MISSIONE CRITICA): Il campo 'preparation_steps' deve essere un racconto tecnico PROFONDAMENTE DETTAGLIATO (MINIMO 20 FRASI). Usa \\n\\n per la leggibilità.\\n6. ${STANDARD_QUANTITIES_IT_PROMPT}\\n\\nRISPONDI ESCLUSIVAMENTE IN JSON CON FORMATO:\\n{\\\"creative_menu\\\": [{\\\"jour\\\":\\\"lunedì\\\", \\\"dejeuner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NOME_DEL_VERO_INGREDIENTE]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"diner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"...\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n` : settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL.\\n\\nActúa como un Chef de Avant-Garde. Genera un menú creativo"
);

// 3. Traditional Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\.\\n\\nActúa como Chef de un bistró elegante\. Genera un menú semanal\./g,
  "const prompt = settings.language === 'it' ? `MANDATO DI LINGUA: RISPOSTA IN ITALIANO.\\n\\nAgisci come Chef di un Bistrot Chic. Genera un menu settimanale.\\n1. DIVERSITÀ QUOTIDIANA.\\n2. NESSUNA DUPLICAZIONE.\\n3. FILOSOFIA BISTROT CHIC: Piatti raffinati. NOMI POETICI E DETTAGLIATI.\\n4. JSON STRINGENTE.\\n5. FASI DI PREPARAZIONE (CRITICO): 'preparation_steps' DEVE ESSERE di ALTISSIMO LIVELLO (MINIMO 15 frasi). Descrivi le tecniche (sous-vide, confit). Usa \\n\\n per dividere in paragrafi.\\n6. ${STANDARD_QUANTITIES_IT_PROMPT}\\n\\nRISPONDI ESCLUSIVAMENTE IN JSON CON FORMATO:\\n{\\\"traditional_menu\\\": [{\\\"jour\\\":\\\"lunedì\\\", \\\"entree\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NOME]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"plat\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"dessert\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n`: settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL.\\n\\nActúa como Chef de un bistró elegante. Genera un menú semanal."
);

fs.writeFileSync('server.ts', content);
console.log('Fixed IT Creative and Traditional');
