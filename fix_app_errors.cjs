const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/alert\("Erreur lors de la création : " \+ data\.message\);/g, 'alert("Erreur lors de la création : " + (data.error || data.message || "Erreur serveur ou IA"));');
code = code.replace(/alert\("Erreur lors de l'analyse : " \+ data\.message\);/g, 'alert("Erreur lors de l\'analyse : " + (data.error || data.message || "Erreur serveur ou IA"));');
fs.writeFileSync('src/App.tsx', code);
