const fs = require('fs');
let code = fs.readFileSync('gen-install-docs.cjs', 'utf-8');

// Replace the ends of the german parts which got stripped of the \`;
code = code.replace(/backup\.zip\\\`\.\n\nconst LINUX_TXT/g, 'backup.zip\\`.\n`;\n\nconst LINUX_TXT');

code = code.replace(/\\\/release\\\`\.\n\nconst MACOS_TXT/g, '/release\\`.\n`;\n\nconst MACOS_TXT');

code = code.replace(/uploads\\\` !\n\nfs\.writeFileSync/g, 'uploads\\` !\n`;\n\nfs.writeFileSync');

fs.writeFileSync('gen-install-docs.cjs', code);
console.log('Fixed file');
