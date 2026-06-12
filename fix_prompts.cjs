const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/RISPONDI ESCLUSIVAMENTE IN JSON:`/g, 'RISPONDI ESCLUSIVAMENTE IN JSON:` + `\\n` + JSON.stringify({\n  status: "success",\n  fiches_techniques: [{\n    recette: "Recipe Name", categorie: "Categoria", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." \n  }]\n})');

code = code.replace(/RESPONDER \\xDANICAMENTE EN JSON:`/g, 'RESPONDER \\xDANICAMENTE EN JSON:` + `\\n` + JSON.stringify({\n  status: "success",\n  fiches_techniques: [{\n    recette: "Recipe Name", categorie: "Categoria", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." \n  }]\n})');

code = code.replace(/ANTSWORTE AUSSCHLIESSLICH IN JSON:`/g, 'ANTSWORTE AUSSCHLIESSLICH IN JSON:` + `\\n` + JSON.stringify({\n  status: "success",\n  fiches_techniques: [{\n    recette: "Recipe Name", categorie: "Kategorie", ingredients: [{name: "Name", quantite: 0, unite: "g"}], allergens: [], preparation_steps: "..." \n  }]\n})');

fs.writeFileSync('server.ts', code);
