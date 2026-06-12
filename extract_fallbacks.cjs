const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf8');

// Match `t.keyName || "Some Fallback"`
const regex = /t\.([a-zA-Z0-9_]+)\s*\|\|\s*"([^"]+)"/g;
const missing = {};

let match;
while ((match = regex.exec(code)) !== null) {
  missing[match[1]] = match[2];
}

console.log(JSON.stringify(missing, null, 2));
