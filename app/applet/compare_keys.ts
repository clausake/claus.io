import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const getKeys = (langCode: string) => {
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
    const keys: string[] = [];
    const lines = objContent.split('\n');
    for (const line of lines) {
        const match = line.match(/^\s+([a-zA-Z0-9_]+)\s*:/);
        if (match) {
            keys.push(match[1]);
        }
    }
    return keys;
};

const frKeys = getKeys('fr');
const enKeys = getKeys('en');

console.log("fr keys:", frKeys.length);
console.log("en keys:", enKeys.length);

const missingInEn = frKeys.filter(k => !enKeys.includes(k));
console.log("Missing in EN:", missingInEn);
