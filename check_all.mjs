import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const getKeys = (langCode) => {
    const startIndex = content.indexOf(`${langCode}: {`);
    if (startIndex === -1) return [];
    
    let nesting = 0;
    let endIndex = -1;
    for (let i = startIndex + `${langCode}: {`.length - 1; i < content.length; i++) {
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
    const keys = [];
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
const deKeys = getKeys('de');
const esKeys = getKeys('es');
const itKeys = getKeys('it');

console.log("fr:", frKeys.length);
console.log("en:", enKeys.length);
console.log("de:", deKeys.length);
console.log("es:", esKeys.length);
console.log("it:", itKeys.length);

console.log("en missing in fr:", enKeys.filter(k => !frKeys.includes(k)).length);
console.log("en missing in de:", enKeys.filter(k => !deKeys.includes(k)).length);
console.log("en missing in es:", enKeys.filter(k => !esKeys.includes(k)).length);
console.log("en missing in it:", enKeys.filter(k => !itKeys.includes(k)).length);

console.log("Keys missing in DE:", enKeys.filter(k => !deKeys.includes(k)).join(', '));
console.log("Keys missing in ES:", enKeys.filter(k => !esKeys.includes(k)).join(', '));
