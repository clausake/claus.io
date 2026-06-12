const fs = require('fs');

const code = fs.readFileSync('src/App.tsx', 'utf8');
const tMatches = [...code.matchAll(/t\.([a-zA-Z0-9_]+)/g)];
const usedKeys = new Set(tMatches.map(m => m[1]));

const frText = fs.readFileSync('fr.txt', 'utf8');
const dictMatches = [...frText.matchAll(/^\s+(?:([a-zA-Z0-9_\-]+)|"([a-zA-Z0-9_\-]+)")\s*:/gm)];
const definedKeys = new Set(dictMatches.map(m => m[1] || m[2]));

console.log("Keys used by t.xxx but NOT in fr dict:");
const missingKeys = [...usedKeys].filter(k => !definedKeys.has(k));
console.log(missingKeys);
