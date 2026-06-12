const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');
const counts = {
  fr: (code.match(/settings\.language === 'fr'|settings\.language === "fr"/g) || []).length,
  es: (code.match(/settings\.language === 'es'|settings\.language === "es"/g) || []).length,
  it: (code.match(/settings\.language === 'it'|settings\.language === "it"/g) || []).length,
  en: (code.match(/settings\.language === 'en'|settings\.language === "en"/g) || []).length
};
console.log(counts);
