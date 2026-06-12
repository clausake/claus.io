const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf8');
const parseDictBlock = (lang) => {
  const start = code.indexOf(`${lang}: {`);
  const end = code.indexOf(`  },`, start);
  const text = code.slice(start, end);
  const dict = {};
  const regex = /^\s+(?:([a-zA-Z0-9_\-]+)|"([a-zA-Z0-9_\-]+)")\s*:\s*"(.*?)"/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1] || match[2];
    dict[key] = match[3];
  }
  return dict;
};

const enDict = parseDictBlock('en');
const deDict = parseDictBlock('de');

console.log(`\nUntranslated in de:`);
for (const key in enDict) {
  if (deDict[key] === enDict[key] && !['language', 'CLAUS.IO'].includes(key) && enDict[key] !== '') {
    console.log(`- ${key}: ${enDict[key]}`);
  }
}
