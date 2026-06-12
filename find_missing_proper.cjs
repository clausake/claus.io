const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const tStart = code.indexOf('const TRANSLATIONS: any = {');
const tEnd = code.indexOf('};\n\n\nconst INGREDIENT_TRANSLATIONS_ES');
if (tStart === -1 || tEnd === -1) {
  console.log("Not found");
  process.exit(1);
}

const tCode = code.substring(tStart, tEnd + 2); // Include the };

function getKeys(lang) {
  const match = tCode.match(new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n  \\},?\\n  (en|fr|es|de|it|\\/\\/|})`));
  if (!match) {
    const m2 = tCode.match(new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n  \\}?(?:\\n|$|})`));
    if(!m2) return [];
    const str = m2[1];
    return [...str.matchAll(/([a-zA-Z0-9_]+):/g)].map(m => m[1]);
  }
  const str = match[1];
  return [...str.matchAll(/([a-zA-Z0-9_]+):/g)].map(m => m[1]);
}

const langs = ['fr', 'en', 'de', 'es', 'it'];
const keysByLang = {};
langs.forEach(l => {
  keysByLang[l] = getKeys(l);
});

const missing = {};
langs.forEach(lang => {
  if (lang === 'fr') return;
  missing[lang] = keysByLang['fr'].filter(k => !keysByLang[lang].includes(k));
});

fs.writeFileSync('missing.json', JSON.stringify(missing, null, 2));
