const fs = require('fs');

const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const frMatch = code.match(/fr:\s*\{(\{.*?\}|[\s\S])*?\n  \},\n  es:/);
let frStr = frMatch[0];
const deMatch = code.match(/de:\s*\{(\{.*?\}|[\s\S])*?\n  \},\n  it:/);
let deStr = deMatch[0];

const frKeys = [...frStr.matchAll(/([a-zA-Z0-9_]+):\s*(["'`])/g)].map(m => m[1]);
const deKeys = [...deStr.matchAll(/([a-zA-Z0-9_]+):\s*(["'`])/g)].map(m => m[1]);

const missingInDe = frKeys.filter(k => !deKeys.includes(k));

console.log("Missing in DE:", missingInDe.join(', '));
