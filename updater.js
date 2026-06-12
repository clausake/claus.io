const fs = require('fs');

let s = fs.readFileSync('server.ts', 'utf8');

const itQuantityPrompt = `
  const STANDARD_QUANTITIES_IT_PROMPT = \`
        IMPORTANTE: RISPETTA IMPERATIVAMENTE QUESTI STANDARD DI QUANTITÀ A PERSONA:
        - DIVIETO ASSOLUTO: NIENTE "verdure surgelate". Usa SOLO prodotti FRESCHI e di STAGIONE.
        - ANTIPASTI: Salumi (60g), Prosciutto (70g), Terrina (60g), Torte salate (100g), Cruditè (150g), Insalate farinacee (80g).
        - PASTA/RISO: Pasta secca (150g come piatto principale, 125g come contorno), Tagliatelle (150g/125g), Gnocchi (350g/300g), Ravioli (380g), Riso (125g).
        - PESCE: Filetti (145g), Calamari (200g), Frutti di mare (100g).
        - CARNI: Bistecca (180g), Macinato (145g), Spezzatino/Pollo/Maiale (220g), Anatra (280g), Arrosto (180g).
        - CONTORNI: Verdure FRESCHE (250g), Lenticchie (125g), Patatine/Patate (250g), Polenta (60g), Quinoa (250g).
        - ALTRO: Pesto (80g).
  \`;
`;

s = s.replace('const STANDARD_QUANTITIES_ES_PROMPT = `', itQuantityPrompt + '\n  const STANDARD_QUANTITIES_ES_PROMPT = `');

// Now we need to update all prompts that use `settings.language === 'es' ? ... : settings.language === 'en' ? ... : ...`
// We will simply replace `settings.language === 'es'` with `settings.language === 'it' ? \`...\` : settings.language === 'es'` for all 6 endpoints.

// 1. Analyze Menu (/api/analyze-menu)
const itAnalyze = `settings.language === 'it' ? \`Analizza questo menu o documento ed estrai le schede tecniche.

REGOLE IMPORTANTI:
1. Identifica ogni ricetta.
2. Menziona sempre gli allergeni.
3. Elenco degli ingredienti in questo formato ESATTO: [{"name": "[NOME_DEL_VERO_INGREDIENTE_es_Pomodoro_o_Manzo_Wagyu]", "quantite": "[NUMERO_ESATTO]", "unite": "[g_o_ml]"}]
4. Passaggi della preparazione: devono essere ESTREMAMENTE DETTAGLIATI.
\${STANDARD_QUANTITIES_IT_PROMPT}

RISPONDI ESCLUSIVAMENTE IN JSON, come strutturato qui sotto. LA TUA RISPOSTA DEVE CONTENERE SOLO IL JSON VALIDO.\` : settings.language === 'es'`;
s = s.replace("settings.language === 'es'", itAnalyze);
// wait, `.replace` only replaces the first occurrence, which is exactly /api/analyze-menu. Let's do it carefully.

fs.writeFileSync('server.ts', s);
console.log('Done 1 part');
