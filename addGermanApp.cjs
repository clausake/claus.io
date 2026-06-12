const fs = require('fs');

let appData = fs.readFileSync('src/App.tsx', 'utf-8');

const enMatch = appData.match(/en: \{\n\s*language: "en"[\s\S]*?\n\s*\},\n\s*es: \{/);
if (enMatch) {
  let deTrans = enMatch[0].replace(/^en: \{/, 'de: {').replace(/language: "en"/, 'language: "de"').replace(/,\n\s*es: \{$/, ',');
  appData = appData.replace(/es: \{/, deTrans + '\n  es: {');
  console.log("Added German translation block based on English.");
} else {
  console.log("Could not find en block");
}

appData = appData.replace(/<option value="it" className="bg-black text-white">Italiano<\/option>/, '<option value="it" className="bg-black text-white">Italiano</option>\n                  <option value="de" className="bg-black text-white">Deutsch</option>');

appData = appData.replace(/settings\.language === 'es' \? 'es-ES' : 'en-US'/g, "settings.language === 'es' ? 'es-ES' : settings.language === 'de' ? 'de-DE' : 'en-US'");
appData = appData.replace(/t\.language === 'es' \? 'es-ES' : 'en-US'/g, "t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : 'en-US'");

fs.writeFileSync('src/App.tsx', appData);
console.log('App.tsx updated for German');
