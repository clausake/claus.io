import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const prompt = `Tu es CLAUS\.IO, l'IA experte en gestion de cuisine\\.[\\s\\S]*?Format de réponse souhaité \(texte brut, environ 100-150 mots\)\\.`;/g,
  `const prompt = settings.language === 'es' ? \`Eres CLAUS.IO, la IA experta en gestión de cocina.
Analiza este inventario y proporciona 3 consejos estratégicos concretos (gestión de existencias, pedidos a realizar, optimización de costes, o ideas de recetas para agotar existencias).
Inventario: \${inventoryContext}
Elementos críticos: \${critical.map(i => i.name).join(', ')}
Elementos bajos: \${lowStock.map(i => i.name).join(', ')}

Responde en \${langName}. Sé conciso, profesional e impactante. Sin palabrería inútil.
Formato de respuesta deseado (texto plano, aproximadamente 100-150 palabras).\` : settings.language === 'en' ? \`You are CLAUS.IO, the expert AI in kitchen management.
Analyze this inventory and give 3 concrete strategic tips (stock management, orders to place, cost optimization, or recipe ideas to use up stock).
Inventory: \${inventoryContext}
Critical items: \${critical.map(i => i.name).join(', ')}
Low items: \${lowStock.map(i => i.name).join(', ')}

Respond in \${langName}. Be concise, professional, and impactful. No unnecessary chatter.
Desired response format (plain text, about 100-150 words).\` : \`Tu es CLAUS.IO, l'IA experte en gestion de cuisine.
Analyse cet inventaire et donne 3 conseils stratégiques concrets (gestion des stocks, commandes à passer, optimisation des coûts, ou idées de recettes pour écouler le stock).
Inventaire : \${inventoryContext}
Éléments critiques : \${critical.map(i => i.name).join(', ')}
Éléments bas : \${lowStock.map(i => i.name).join(', ')}

Réponds en \${langName}. Sois concis, professionnel et percutant. Pas de bla-bla inutile.
Format de réponse souhaité (texte brut, environ 100-150 mots).\`;`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed inventory analyze prompt');
