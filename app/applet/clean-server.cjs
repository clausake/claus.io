const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf-8');

// There's a huge block of duplicate code. Let's find "CREATE TABLE IF NOT EXISTS inventory"
const instances = [];
let idx = c.indexOf("CREATE TABLE IF NOT EXISTS inventory");
while (idx !== -1) {
    instances.push(idx);
    idx = c.indexOf("CREATE TABLE IF NOT EXISTS inventory", idx + 1);
}
console.log("Instances at:", instances);

// Let's write the whole file to a list of lines so we can inspect
const lines = c.split('\n');
const startDuplicate = lines.findIndex(l => l.includes('Cannot redeclare block-scoped variable') || l.includes('// Initialize SQLite Database') && lines.indexOf(l) !== lines.lastIndexOf(l));

