import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// The English Traditional
content = content.replace(/"entree": \{ "nom": "\.\.\.", "ingredients": \[\.\.\.\], "allergens": \[\.\.\.\], "preparation_steps": "\.\.\." \},/g, '"entree": { "nom": "...", "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}], "allergens": ["..."], "preparation_steps": "..." },');
content = content.replace(/"plat": \{ "nom": "\.\.\.", "ingredients": \[\.\.\.\], "allergens": \[\.\.\.\], "preparation_steps": "\.\.\." \},/g, '"plat": { "nom": "...", "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}], "allergens": ["..."], "preparation_steps": "..." },');
content = content.replace(/"dessert": \{ "nom": "\.\.\.", "ingredients": \[\.\.\.\], "allergens": \[\.\.\.\], "preparation_steps": "\.\.\." \}/g, '"dessert": { "nom": "...", "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}], "allergens": ["..."], "preparation_steps": "..." }');

// French Traditional
content = content.replace(/"entree": \{ "nom": "\.\.\.", "ingredients": \[\.\.\.\], "allergens": \[\.\.\.\], "preparation_steps": "\.\.\." \},/g, '"entree": { "nom": "...", "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}], "allergens": ["..."], "preparation_steps": "..." },');
content = content.replace(/"plat": \{ "nom": "\.\.\.", "ingredients": \[\.\.\.\], "allergens": \[\.\.\.\], "preparation_steps": "\.\.\." \},/g, '"plat": { "nom": "...", "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}], "allergens": ["..."], "preparation_steps": "..." },');
// Note: Some French traditional lines use the exact same strings (except maybe spacing). Let's do a generic replace instead.

// Anti-Waste Menu English
content = content.replace(/"ingredients": \["\.\.\.", "\.\.\."\],/g, '"ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],');
// Anti-Waste Menu French
content = content.replace(/"ingredients": \["\.\.\.", "\.\.\."\],/g, '"ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],');

fs.writeFileSync('server.ts', content);
console.log('Fixed JSON formatting templates');
