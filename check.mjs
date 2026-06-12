import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

const extractKeys = (startMarker, endMarker) => {
    let inBlock = false;
    const keys = [];
    for (const line of lines) {
        if (line.includes(startMarker)) {
            inBlock = true;
            continue;
        }
        if (inBlock && line.includes(endMarker)) {
            inBlock = false;
            break;
        }
        if (inBlock) {
            const match = line.match(/^\s+([a-zA-Z0-9_]+)\s*:/);
            if (match) keys.push(match[1]);
        }
    }
    return keys;
};

const frKeys = extractKeys('fr: {', 'en: {');
const enKeys = extractKeys('en: {', 'de: {');

console.log("FR:", frKeys.length, "EN:", enKeys.length);
console.log("Missing in EN:");
console.log(frKeys.filter(k => !enKeys.includes(k)).join(', '));
