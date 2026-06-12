const fs = require('fs');

let haccpModules = fs.readFileSync('src/components/HaccpModules.tsx', 'utf-8');

haccpModules = haccpModules.replace(
  /t\.language === 'fr' \? 'fr-FR' : 'en-US'/g,
  "t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US'"
);

fs.writeFileSync('src/components/HaccpModules.tsx', haccpModules);
console.log('Fixed HaccpModules.tsx dates');

let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');
appTsx = appTsx.replace(
  /const month = date\.toLocaleString\(t\.language === 'fr' \? 'fr-FR' : t\.language === 'es' \? 'es-ES' : 'en-US',/g,
  "const month = date.toLocaleString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US',"
);
// In App.tsx: t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : 'en-US'
appTsx = appTsx.replace(
  /t\.language === 'fr' \? 'fr-FR' : t\.language === 'es' \? 'es-ES' : t\.language === 'de' \? 'de-DE' : 'en-US'/g,
  "t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US'"
);

fs.writeFileSync('src/App.tsx', appTsx);
console.log('Fixed App.tsx dates');

if (fs.existsSync('src/components/Haccp.tsx')) {
    let haccp = fs.readFileSync('src/components/Haccp.tsx', 'utf-8');
    haccp = haccp.replace(
      /t\.language === 'fr' \? 'fr-FR' : 'en-US'/g,
      "t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US'"
    );
    fs.writeFileSync('src/components/Haccp.tsx', haccp);
    console.log('Fixed Haccp.tsx dates');
}
