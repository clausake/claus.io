import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

// Fix the \n that became literal backslash n
text = text.replace(/settings.language === 'en' \? \\n/g, "settings.language === 'en' ? \n");

fs.writeFileSync('server.ts', text);
