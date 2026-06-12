import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const tRegex = /t\.([a-zA-Z0-9_]+)\s*\|\|\s*["']([^"']+)["']/g;

let match;
const foundKeys = new Set();
while ((match = tRegex.exec(content)) !== null) {
  foundKeys.add(match[1]);
}

// Check which of these are missing in EN
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
            const match2 = line.match(/^\s+([a-zA-Z0-9_]+)\s*:/);
            if (match2) keys.push(match2[1]);
        }
    }
    return keys;
};

const enKeys = extractKeys('en: {', 'de: {');

const missing = [...foundKeys].filter(k => !enKeys.includes(k));
console.log("Missing hardcoded keys in EN:", missing);
