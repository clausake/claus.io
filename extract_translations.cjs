const fs = require('fs');

const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const tsMatch = code.match(/const TRANSLATIONS[^]+?};\n\/\/ End TRANSLATIONS/);

fs.writeFileSync('translations.txt', tsMatch ? tsMatch[0] : 'no match');
