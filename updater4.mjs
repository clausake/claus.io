import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Replace STANDARD_QUANTITIES_PROMPT with STANDARD_QUANTITIES_ES_PROMPT inside settings.language === 'es' ? ... blocks
content = content.replace(/(settings\.language === 'es' \? `[\s\S]*?)(\$\{STANDARD_QUANTITIES_PROMPT\})/g, "$1${STANDARD_QUANTITIES_ES_PROMPT}");

fs.writeFileSync('server.ts', content);
console.log('Fixed Spanish prompts referencing French STANDARD quantities');
