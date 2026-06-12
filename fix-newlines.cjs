const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/\\nconst isDe = settings\.language === "de";/g, '\nconst isDe = settings.language === "de";');
code = code.replace(/\\nconst isDeForDlc = settings\.language === "de";/g, '\nconst isDeForDlc = settings.language === "de";');
fs.writeFileSync('server.ts', code, 'utf8');
