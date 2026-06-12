const fs = require('fs');
const data = JSON.parse(fs.readFileSync('recovered2.js', 'utf8'));
fs.writeFileSync('server.ts', data.code, 'utf8');
console.log('Successfully written server.ts from recovered2.js');
