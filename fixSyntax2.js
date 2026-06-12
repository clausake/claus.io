import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

text = text.replace(/settings\.language === 'en' \? \\n        `CRITICAL DIRECTIVE:/g, "settings.language === 'en' ? \n        `CRITICAL DIRECTIVE:");

fs.writeFileSync('server.ts', text);
