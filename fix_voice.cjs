const fs = require('fs');
let text = fs.readFileSync('server.ts', 'utf8');
text = text.replace(
  '        prompt:\n          settings.language === "es"',
  '        prompt:\n          settings.language === "it" ? `DIRETTIVA: Sei CLAUS.IO, assistente culinario. Operi IN ITALIANO.\\nUtente: "${message}"\\nSe aggiunge al carrello, rispondi JSON:\\n{"intent":"add_to_cart","item":"nome","quantity":1,"unit":"kg","response":"Messaggio"}\\nAltrimenti:\\n{"intent":"general_advice","response":"Risposta"}\\nSOLO JSON.` : settings.language === "es"'
);
fs.writeFileSync('server.ts', text);
