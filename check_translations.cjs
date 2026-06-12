const fs = require('fs');

const frText = fs.readFileSync('fr.txt', 'utf8');
const enText = fs.readFileSync('en.txt', 'utf8');

const parseDict = (text) => {
  const dict = {};
  const regex = /^\s+(?:([a-zA-Z0-9_\-]+)|"([a-zA-Z0-9_\-]+)")\s*:\s*"(.*?)"/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1] || match[2];
    dict[key] = match[3];
  }
  return dict;
};

const frDict = parseDict(frText);
const enDict = parseDict(enText);

const untranslated = [];
for (const key in enDict) {
  if (frDict[key] === enDict[key] && frDict[key] !== '' && key !== 'language' && !['CLAUS.IO', 'Ollama Endpoint (Local)', 'CHEF\'S MENU', 'Ollama Status'].includes(enDict[key])) {
    untranslated.push({key, text: enDict[key]});
  }
}

console.log("Possibly untranslated keys in FR:");
console.log(untranslated);
