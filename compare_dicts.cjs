const fs = require('fs');

const frText = fs.readFileSync('fr.txt', 'utf8');
const enText = fs.readFileSync('en.txt', 'utf8');

const getKeys = (text) => {
  const match = text.match(/^\s+(?:[a-zA-Z0-9_\-]+|"[a-zA-Z0-9_\-]+")\s*:/gm);
  return match ? match.map(m => m.split(':')[0].trim().replace(/"/g, '')) : [];
}

const frKeys = new Set(getKeys(frText));
const enKeys = new Set(getKeys(enText));

console.log("Keys in EN missing in FR:");
const missingInFr = [...enKeys].filter(k => !frKeys.has(k) && k !== 'en');
console.log(missingInFr);

console.log("\nKeys in FR missing in EN:");
const missingInEn = [...frKeys].filter(k => !enKeys.has(k) && k !== 'fr');
console.log(missingInEn);
