const fs = require('fs');
let serverData = fs.readFileSync('server.ts', 'utf-8');

// The German prompts to inject:
const deAnalyze = "`Analysieren Sie dieses Menü oder Dokument und extrahieren Sie die technischen Datenblätter.\\n\\nWICHTIGE REGELN:\\n1. Identifizieren Sie jedes Rezept.\\n2. Erwähnen Sie immer die Allergene.\\n3. Zutatenliste in diesem EXACTEN Format: \\\"ingredients\\\": [{\\\"name\\\": \\\"[NAME_DER_ZUTAT]\\\", \\\"quantite\\\": \\\"[ZAHL]\\\", \\\"unite\\\": \\\"[g_oder_ml]\\\"}]\\n4. Zubereitungsschritte müssen EXTREM DETAILLIERT sein.\\n${STANDARD_QUANTITIES_EN_PROMPT}\\nANTWORTEN SIE AUSSCHLIESSLICH IN JSON:`";

const deCreative = "`SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandeln Sie als Avant-Garde Chefkoch. Erstellen Sie ein 7-Tage kreatives Menü.\\n1. RADIKALE KREATIVITÄT.\\n2. KEINE WIEDERHOLUNG.\\n3. GLOBALE FUSIONEN.\\n4. STRENGES JSON.\\n5. ZUBEREITUNGSSCHRITTE (WICHTIG): 'preparation_steps' MUSS EXTREM DETAILLIERT SEIN (MINDESTENS 20 SÄTZE).\\n6. ${STANDARD_QUANTITIES_EN_PROMPT}\\n\\nANTWORTEN SIE AUSSCHLIESSLICH IN JSON MIT FORMAT:\\n{\\\"creative_menu\\\": [{\\\"jour\\\":\\\"Montag\\\", \\\"dejeuner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NAME]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"diner\\\":{\\\"plat_creatif\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"...\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n`";

const deTraditional = "`SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandeln Sie als Chic Bistrot Chef. Erstellen Sie ein wöchentliches Menü.\\n1. TÄGLICHE VIELFALT.\\n2. KEINE WIEDERHOLUNG: ES IST VERBOTEN, das gleiche Gericht oder die gleiche Hauptzutat zu wiederholen.\\n3. CHIC BISTROT PHILOSOPHIE: Raffinierte Gerichte.\\n4. STRENGES JSON.\\n5. ZUBEREITUNGSSCHRITTE: 'preparation_steps' MUSS EXTREM DETAILLIERT SEIN (MIN. 15 Sätze).\\n6. ${STANDARD_QUANTITIES_EN_PROMPT}\\n\\nANTWORTEN SIE AUSSCHLIESSLICH IN JSON:\\n{\\\"status\\\": \\\"success\\\", \\\"traditional_menu\\\": [{\\\"jour\\\":\\\"Montag\\\", \\\"entree\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NAME]\\\",\\\"quantite\\\":\\\"0\\\",\\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"plat\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"dessert\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n`";

const deGastro = "`\\nHandeln Sie als 3-Michelin-Sterne Chefkoch. Erstellen Sie 3 Vorschläge für Gastronomische Menüs.\\n1. ABSOLUTE EXZELLENZ.\\n2. NUR EDELPRODUKTE.\\n3. KEINE WIEDERHOLUNG.\\n4. SENSORISCHES GLEICHGEWICHT.\\n5. ZUBEREITUNGSSCHRITTE: 'preparation_steps' TECHNISCH EXZELLENT (MIN. 20 SÄTZE).\\n6. ${STANDARD_QUANTITIES_EN_PROMPT}\\n\\nANTWORTEN SIE AUSSCHLIESSLICH IN JSON:\\n{\\\"gastronomic_menu\\\":[{\\\"nom_menu\\\":\\\"...\\\", \\\"entree\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[{\\\"name\\\":\\\"[NAME]\\\", \\\"quantite\\\":\\\"0\\\", \\\"unite\\\":\\\"g\\\"}], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"plat\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"}, \\\"dessert\\\":{\\\"nom\\\":\\\"...\\\", \\\"ingredients\\\":[], \\\"allergens\\\":[], \\\"preparation_steps\\\":\\\"...\\\"} }]}\\n\\n`";

const deAntiWaste = "`Erstellen Sie einen Vorschlag für Anti-Verschwendung Rezepte.\\nVerwenden Sie:\\n${ingredientList}\\nErstellen Sie 3 Rezepte. JSON:\\n {\\\"dishes\\\": [{\\\"name\\\": \\\"...\\\", \\\"ingredients\\\": [\\\"...\\\"], \\\"allergens\\\": [\\\"...\\\"], \\\"preparation_steps\\\": \\\"Extrem detailliert (MIN. 15 Sätze).\\\"}]}`";

const deChat = "`DIREKTIVE: Sie sind CLAUS.IO, kulinarischer Assistent. Sie sprechen DEUTSCH.\\nBenutzer: \\\"${message}\\\"\\nBei Warenkorb reagieren Sie mit JSON:\\n{\\\"intent\\\":\\\"add_to_cart\\\",\\\"item\\\":\\\"Name\\\",\\\"quantity\\\":1,\\\"unit\\\":\\\"kg\\\",\\\"response\\\":\\\"Antwort\\\"}\\nSonst:\\n{\\\"intent\\\":\\\"general_advice\\\",\\\"response\\\":\\\"Antwort\\\"}\\nNUR JSON.`";

const deSteps = "`WICHTIGE DIREKTIVE: Antwort auf DEUTSCH.\\nErstellen Sie SEHR DETAILLIERTE Vorbereitungsschritte für das Rezept: ${recipe.name}.\\nZutaten: ${ingredients.map(i => \`\${i.name} (\${i.quantity_per_person}\${i.unit})\`).join(', ')}.\\nAntworten Sie auf Deutsch mit NUR dem Text der Vorbereitungsschritte.`";

// Do targeted replacements using indexOf / substring for the specific prompts
function injectDe(itPromptRegex, dePromptStr) {
  const match = serverData.match(itPromptRegex);
  if (match) {
    serverData = serverData.replace(itPromptRegex, `settings.language === 'de' ? ${dePromptStr} : settings.language === 'it'`);
  } else {
    console.log("Could not find match for", itPromptRegex.toString().substring(0, 50));
  }
}

injectDe(/settings\.language === 'it'[\s\S]*?RISPONDI ESCLUSIVAMENTE IN JSON:` \: settings\.language === 'es'/, deAnalyze);
injectDe(/settings\.language === 'it'[\s\S]*?creative_menu[\s\S]*?` \: settings\.language === 'es'/, deCreative);
injectDe(/settings\.language === 'it'[\s\S]*?traditional_menu[\s\S]*?`: settings\.language === 'es'/, deTraditional);
injectDe(/settings\.language === 'it'[\s\S]*?gastronomic_menu[\s\S]*?` \: settings\.language === 'es'/, deGastro);
injectDe(/settings\.language === 'it' \? `Genera una proposta creativa di ricette anti-spreco[\s\S]*?` : settings\.language === 'es'/, deAntiWaste);
injectDe(/settings\.language === 'it' \? `DIRETTIVA CRITICA: Devi rispondere in ITALIANO[\s\S]*?` : settings\.language === 'es'/, deSteps);

// For the chat ones
const chatRegex = /settings\.language === 'es' \? `DIRECTIVA:/g;
serverData = serverData.replace(chatRegex, `settings.language === 'de' ? ${deChat} : settings.language === 'es' ? \`DIRECTIVA:`);

// Small fix for chat system prompt
serverData = serverData.replace(/system: settings\.language === 'es'/g, "system: settings.language === 'de' ? 'Sie sind ein professioneller kulinarischer Assistent. Sie sprechen deutsch.' : settings.language === 'es'");
// small fix for error response
serverData = serverData.replace(/response: settings\.language === 'es' \? 'Lo siento Chef/g, "response: settings.language === 'de' ? 'Entschuldigung Chef, ein technisches Problem.' : settings.language === 'es' ? 'Lo siento Chef");

// Other variables in server.ts
serverData = serverData.replace(/settings\.language === 'es' \? 'es-ES' : 'en-US'/g, "settings.language === 'es' ? 'es-ES' : settings.language === 'de' ? 'de-DE' : 'en-US'");
serverData = serverData.replace(/settings\.language === 'es' \? 'Español' : 'English'/g, "settings.language === 'es' ? 'Español' : settings.language === 'de' ? 'Deutsch' : 'English'");
serverData = serverData.replace(/settings\.language === 'es' \? 'Spanish' : 'English'/g, "settings.language === 'es' ? 'Spanish' : settings.language === 'de' ? 'German' : 'English'");
serverData = serverData.replace(/settings\.language === 'es' \? 'SPANISH' : 'ENGLISH'/g, "settings.language === 'es' ? 'SPANISH' : settings.language === 'de' ? 'GERMAN' : 'ENGLISH'");
serverData = serverData.replace(/const isEs = settings\.language === 'es';/g, "const isEs = settings.language === 'es';\n      const isDe = settings.language === 'de';");
serverData = serverData.replace(/const isEsForDlc = settings\.language === 'es';/g, "const isEsForDlc = settings.language === 'es';\n      const isDeForDlc = settings.language === 'de';");


fs.writeFileSync('server.ts', serverData);
console.log('server.ts updated with specific German branches');
