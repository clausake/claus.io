const fs = require('fs');
const newCode = fs.readFileSync('server.ts', 'utf8');
const recoveredData = { code: newCode };
fs.writeFileSync('recovered2.js', JSON.stringify(recoveredData, null, 2), 'utf8');
