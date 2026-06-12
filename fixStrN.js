import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

appText = appText.replace(/\\n/g, '\n');

fs.writeFileSync('src/App.tsx', appText);
