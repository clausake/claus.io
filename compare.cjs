const fs = require('fs');

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const getKeys = (langCode) => {
    const startIndex = content.indexOf(`const ${langCode} = {`);
    if (startIndex === -1) return [];
    
    let nesting = 0;
    let endIndex = -1;
    for (let i = startIndex + `const ${langCode} = {`.length - 1; i < content.length; i++) {
        if (content[i] === '{') nesting++;
        if (content[i] === '}') {
            nesting--;
            if (nesting === 0) {
                endIndex = i;
                break;
            }
        }
    }
    
    if (endIndex === -1) return [];
    
    const objContent = content.substring(startIndex, endIndex + 1);
    const ObjectKeys = [];
    const lines = objContent.split('\\n');
    for (const line of lines) {
        const match = line.match(/^\\s+([a-zA-Z0-9_]+)\\s*:/);
        if (match) {
            ObjectKeys.push(match[1]);
        }
    }
    return ObjectKeys;
};

const frKeys = getKeys('fr');
const enKeys = getKeys('en');

console.log("fr keys:", frKeys.length);
console.log("en keys:", enKeys.length);

const missingInEn = frKeys.filter(k => !enKeys.includes(k));
console.log("Missing in EN:", missingInEn.join(', '));
