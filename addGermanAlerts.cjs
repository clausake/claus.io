const fs = require('fs');
let appData = fs.readFileSync('src/App.tsx', 'utf-8');

appData = appData.replace(
  /if \(t\.language === 'es'\) return <p className="text-slate-500 mt-2">Stock Crítico : \{itemTranslated\} \(\{match\[2\]\} \{match\[3\]\} restante de \{match\[4\]\} \{match\[5\]\} mínimo configurado\)<\/p>;/g,
  "if (t.language === 'es') return <p className=\"text-slate-500 mt-2\">Stock Crítico : {itemTranslated} ({match[2]} {match[3]} restante de {match[4]} {match[5]} mínimo configurado)</p>;\n                   if (t.language === 'de') return <p className=\"text-slate-500 mt-2\">Kritischer Bestand : {itemTranslated} ({match[2]} {match[3]} verbleibend von {match[4]} {match[5]} konfiguriertem Minimum)</p>;"
);

// also let's check recipe formatting for Filet de Boeuf and "Légumes de saison"
appData = appData.replace(
  /item\.item === "Filet de Boeuf" && t\.language === "en" \? "Beef Tenderloin"/g,
  "item.item === \"Filet de Boeuf\" && t.language === \"de\" ? \"Rinderfilet\" : item.item === \"Filet de Boeuf\" && t.language === \"en\" ? \"Beef Tenderloin\""
);

appData = appData.replace(
  /item\.item === "Légumes de saison" && t\.language === "en" \? "Seasonal vegetables"/g,
  "item.item === \"Légumes de saison\" && t.language === \"de\" ? \"Saisonales Gemüse\" : item.item === \"Légumes de saison\" && t.language === \"en\" ? \"Seasonal vegetables\""
);

appData = appData.replace(
  /recipe\.name === "Boeuf Wellington" && t\.language === "en" \? "Beef Wellington"/g,
  "recipe.name === \"Boeuf Wellington\" && t.language === \"de\" ? \"Rind Wellington\" : recipe.name === \"Boeuf Wellington\" && t.language === \"en\" ? \"Beef Wellington\""
);

fs.writeFileSync('src/App.tsx', appData);
console.log('App.tsx German inline strings appended');
