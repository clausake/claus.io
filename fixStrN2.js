import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard literal string newlines back to \n
appText = appText.replace(/téléchargés\.\n\nVeuillez/g, 'téléchargés.\\n\\nVeuillez');
appText = appText.replace(/téléchargés\.\n\nPor favor/g, 'téléchargés.\\n\\nPor favor');
appText = appText.replace(/downloaded\.\n\nPlease/g, 'downloaded.\\n\\nPlease');

fs.writeFileSync('src/App.tsx', appText);
