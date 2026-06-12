const fs = require('fs');

let serverData = fs.readFileSync('server.ts', 'utf-8');

// 1. settings.language in formatting
serverData = serverData.replace(/settings\.language === 'es' \? 'es-ES' : 'en-US'/g, "settings.language === 'es' ? 'es-ES' : settings.language === 'de' ? 'de-DE' : 'en-US'");

// 2. Language names
serverData = serverData.replace(/settings\.language === 'es' \? 'Español' : 'English'/g, "settings.language === 'es' ? 'Español' : settings.language === 'de' ? 'Deutsch' : 'English'");
serverData = serverData.replace(/settings\.language === 'es' \? 'Spanish' : 'English'/g, "settings.language === 'es' ? 'Spanish' : settings.language === 'de' ? 'German' : 'English'");
serverData = serverData.replace(/settings\.language === 'es' \? 'SPANISH' : 'ENGLISH'/g, "settings.language === 'es' ? 'SPANISH' : settings.language === 'de' ? 'GERMAN' : 'ENGLISH'");
serverData = serverData.replace(/const isEs = settings\.language === 'es';/g, "const isEs = settings.language === 'es';\n      const isDe = settings.language === 'de';");
serverData = serverData.replace(/const isEsForDlc = settings\.language === 'es';/g, "const isEsForDlc = settings.language === 'es';\n      const isDeForDlc = settings.language === 'de';");

// 3. For prompt injections, let's just make the fallback English handle 'de' or we insert German explicitly. 
// The user asked "ajouter une dernière langue german, correctement étape par étape sans casser le code". We should add German to the prompts.

// Let's replace `settings.language === 'it' ? \`...\` : settings.language === 'es'`
// With `settings.language === 'de' ? \`German prompt\` : settings.language === 'it' ? \`...\` : settings.language === 'es'`

function injectDePrompt(text, regexPattern, generateDePromptFn) {
  let match = text.match(regexPattern);
  if (match) {
    let dePrompt = generateDePromptFn();
    text = text.replace(regexPattern, dePrompt + " : settings.language === 'it'");
  }
}

// 1. Analyze menu
const analyzeDe = "settings.language === 'de' ? `Analysieren Sie dieses Menü oder Dokument und extrahieren Sie die technischen Datenblätter.\\n\\nWICHTIGE REGELN:\\n1. Identifizieren Sie jedes Rezept.\\n2. Erwähnen Sie immer die Allergene.\\n3. Zutatenliste in diesem EXACTEN Format: \\\"ingredients\\\": [{\\\"name\\\": \\\"[NAME_DER_ZUTAT]\\\", \\\"quantite\\\": \\\"[ZAHL]\\\", \\\"unite\\\": \\\"[g_oder_ml]\\\"}]\\n4. Zubereitungsschritte müssen EXTREM DETAILLIERT sein.\\n${STANDARD_QUANTITIES_EN_PROMPT}\\nANTWORTEN SIE AUSSCHLIESSLICH IN JSON:`";
serverData = serverData.replace(/settings\.language === 'it'/g, analyzeDe + " : settings.language === 'it'");

// Wait, the above simple replace will replace all `settings.language === 'it'` which is dangerous if there are multiple. Indeed, there are multiple. 
// We should craft specific replacements for each endpoint or use a single replace function.
fs.writeFileSync('server.ts', serverData);
console.log('server.ts replaced language constants');
