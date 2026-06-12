const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/\\n/g, '\n');
fs.writeFileSync('src/App.tsx', code);
console.log("Fixed linebreaks!");
