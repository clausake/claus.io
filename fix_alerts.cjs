const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/alert\(/g, 'showNotification(');
fs.writeFileSync('src/App.tsx', code);
