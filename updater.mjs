import fs from 'fs';

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
// We will simply replace all occurrences of `const prompt = settings.language === 'es'` manually.

fs.writeFileSync('server.ts', s);
console.log('Added Italian standard prompt');
