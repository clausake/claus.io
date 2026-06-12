import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Analyze Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `Analiza este menú y extrae las/g,
  "const prompt = settings.language === 'it' ? `Analizza questo menu o documento ed estrai le schede tecniche.\\n\\nREGOLE IMPORTANTI:\\n1. Identifica ogni ricetta.\\n2. Menziona sempre gli allergeni.\\n3. Elenco degli ingredienti in questo formato ESATTO: \\\"ingredients\\\": [{\\\"name\\\": \\\"[NOME_DEL_VERO_INGREDIENTE_es_Pomodoro_o_Manzo_Wagyu]\\\", \\\"quantite\\\": \\\"[NUMERO_ESATTO]\\\", \\\"unite\\\": \\\"[g_o_ml]\\\"}]\\n4. Passaggi della preparazione: devono essere ESTREMAMENTE DETTAGLIATI.\\n${STANDARD_QUANTITIES_IT_PROMPT}\\nRISPONDI ESCLUSIVAMENTE IN JSON:` : settings.language === 'es' ? `Analiza este menú y extrae las"
);

// 2. Creative Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\\./g,
  "const prompt = settings.language === 'it' ? `MANDATO DI LINGUA: RISPOSTA IN ITALIANO.\\n\\nAgisci come uno Chef Avant-Garde. Genera un menu creativo di 7 giorni.\\n1. CREATIVITÀ RADICALE: Priorità ad associazioni sperimentali. Nomi lunghi e poetici.\\n2. NESSUNA DUPLICAZIONE.\\n3. FUSIONI GLOBALI. \\n4. JSON STRINGENTE.\\n5. FASI DI PREPARAZIONE (MISSIONE CRITICA): Il campo 'preparation_steps' deve essere un racconto tecnico PROFONDAMENTE DETTAGLIATO (MINIMO 20 FRASI). Usa \\n\\n per la leggibilità.\\n6. ${STANDARD_QUANTITIES_IT_PROMPT}\\n\\nRISPONDI ESCLUSIVAMENTE IN JSON CON FORMATO:\\n{\\\"creative_menu\\\": [{\\\"jour\\\":\\\"lunedì\\\", \\\"dejeuner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NOME_DEL_VERO_INGREDIENTE]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"diner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"...\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n` : settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL."
);

// 3. Traditional Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL\\.\\n\\nActúa como Chef de un bistró elegante/g,
  "const prompt = settings.language === 'it' ? `MANDATO DI LINGUA: RISPOSTA IN ITALIANO.\\n\\nAgisci come Chef di un Bistrot Chic. Genera un menu settimanale.\\n1. DIVERSITÀ QUOTIDIANA.\\n2. NESSUNA DUPLICAZIONE.\\n3. FILOSOFIA BISTROT CHIC: Piatti raffinati. NOMI POETICI E DETTAGLIATI.\\n4. JSON STRINGENTE.\\n5. FASI DI PREPARAZIONE (CRITICO): 'preparation_steps' DEVE ESSERE di ALTISSIMO LIVELLO (MINIMO 15 frasi). Descrivi le tecniche (sous-vide, confit). Usa \\n\\n per dividere in paragrafi.\\n6. ${STANDARD_QUANTITIES_IT_PROMPT}\\n\\nRISPONDI ESCLUSIVAMENTE IN JSON CON FORMATO:\\n{\\\"traditional_menu\\\": [{\\\"jour\\\":\\\"lunedì\\\", \\\"entree\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NOME]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"plat\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"dessert\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n`: settings.language === 'es' ? `MANDATO DE IDIOMA: RESPUESTA EN ESPAÑOL.\\n\\nActúa como Chef de un bistró elegante"
);

// 4. Gastronomic Menu
content = content.replace(
  /const prompt = settings\.language === 'es' \? `\\n      Actúa como un Chef Ejecutivo con 3 estrellas Michelin/g,
  "const prompt = settings.language === 'it' ? `\\nAgisci come Chef Esecutivo 3 Stelle Michelin specializzato in Alta Gastronomia. Genera 3 proposte di Menu.\\n1. ECCELLENZA ASSOLUTA: Nomi poetici e dettagliati.\\n2. PRODOTTI NOBILI ESCLUSIVAMENTE.\\n3. ZERO DUPLICAZIONE.\\n4. EQUILIBRIO SENSORIALE.\\n5. FASI DI PREPARAZIONE: (MISSIONE CRITICA): 'preparation_steps' DEVE essere TECNICAMENTE ECCELSO (MINIMO 20 FRASI). Temperature esatte, idrocolloidi, azoto. Usa \\n\\n.\\n6. ${STANDARD_QUANTITIES_IT_PROMPT}\\n\\nRISPONDI ESCLUSIVAMENTE IN JSON:\\n{\\\"gastronomic_menu\\\":[{\\\"nom_menu\\\":\\\"...\\\", \\\"entree\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NOME]\\\", \\\"quantite\\\":\\\"0\\\", \\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"plat\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"dessert\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n` : settings.language === 'es' ? `\\n      Actúa como un Chef Ejecutivo con 3 estrellas Michelin"
);

// 5. Anti-Waste
content = content.replace(
  /const prompt = settings\.language === 'es' \? `Genera una propuesta creativa y profesional de recetas anti-residuos/g,
  "const prompt = settings.language === 'it' ? `Genera una proposta creativa di ricette anti-spreco.\\nUsa i seguenti ingredienti: \\${ingredientList}\\nCrea 3 ricette. JSON richiesto:\\n {\\\"dishes\\\": [{\\\"name\\\": \\\"...\\\", \\\"ingredients\\\": [\\\"...\\\"], \\\"allergens\\\": [\\\"...\\\"], \\\"preparation_steps\\\": \\\"Estremamente dettagliato (MINIMO 15 frasi). Usa \\n\\n per dividere i paragrafi.\\\"}]}` : settings.language === 'es' ? `Genera una propuesta creativa y profesional de recetas anti-residuos"
);

// 6. Generate Steps
content = content.replace(
  /const prompt = settings\.language === 'es' \? `DIRECTIVA CRÍTICA: Debes responder en ESPAÑOL/g,
  "const prompt = settings.language === 'it' ? `DIRETTIVA CRITICA: Devi rispondere in ITALIANO.\\nGenera le fasi di preparazione ESTREMAMENTE dettagliate di livello Gastronomico per la ricetta: \\${recipe.name}.\\nIngredienti: \\${ingredients.map(i => \\\`\\${i.name} (\\${i.quantity_per_person}\\${i.unit})\\\`).join(', ')}.\\nIl testo DEVE essere di almeno 15 frasi. Usa una terminologia professionale da chef stellato. Dividi ogni passaggio con \\n\\n.\\nRispondi in italiano con SOLO il testo delle fasi di preparazione.` : settings.language === 'es' ? `DIRECTIVA CRÍTICA: Debes responder en ESPAÑOL"
);

fs.writeFileSync('server.ts', content);
console.log('Added IT inside prompts');
