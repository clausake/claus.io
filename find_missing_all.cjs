const fs = require('fs');

const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const langs = ['en', 'fr', 'es', 'de', 'it'];
const dicts = {};

for (const lang of langs) {
  const start = code.indexOf(`  ${lang}: {`);
  const endMarker = `},`;
  let end = code.indexOf(endMarker, start);
  // because of nested objects or just string list, let's find the next language or end of block
  
  if (lang === 'it') {
     end = code.indexOf(`};`, start);
  }
  
  const text = code.slice(start, end);
  const dict = {};
  const regex = /^\s+(?:([a-zA-Z0-9_\-]+)|"([a-zA-Z0-9_\-]+)")\s*:\s*"(.*?)"/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1] || match[2];
    dict[key] = match[3];
  }
  dicts[lang] = dict;
}

// Ensure all keys from fr exist in others. Wait, fr is the base? EN is usually base? Let's use all gathered keys as base.
const allKeysSet = new Set();
for (const lang of langs) {
  for (const key of Object.keys(dicts[lang])) {
    allKeysSet.add(key);
  }
}

const allKeys = Array.from(allKeysSet);
console.log('Total unique keys:', allKeys.length);

const missing = {};
for (const lang of langs) {
  missing[lang] = [];
  for (const key of allKeys) {
    if (dicts[lang][key] === undefined) {
      missing[lang].push(key);
    }
  }
}

console.log(JSON.stringify(missing, null, 2));
