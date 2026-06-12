const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace ${targetModel} in the error messages with ${getModel(settings)}
code = code.replace(/\[\$\{targetModel\}\]/g, "[${getModel(settings)}]");

fs.writeFileSync('server.ts', code);
console.log('Fixed targetModel reference strings in server.ts');
