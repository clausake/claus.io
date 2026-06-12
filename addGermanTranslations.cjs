const fs = require('fs');

let appData = fs.readFileSync('src/App.tsx', 'utf-8');

const deTranslations = `const INGREDIENT_TRANSLATIONS_DE: Record<string, string> = {
  'Farine T55': 'Mehl T55',
  'Boeuf Wellington': 'Rind Wellington',
  'Filet de Boeuf': 'Rinderfilet',
  'Légumes de saison': 'Saisonales Gemüse',
  'Sucre Blanc': 'Weißer Zucker',
  'Riz Basmati': 'Basmatireis',
  "Huile d'Olive": "Olivenöl",
  'Sel Fin': 'Feines Salz',
  'Poivre Noir Grains': 'Schwarze Pfefferkörner',
  'Beurre Doux': 'Ungesalzene Butter',
  'Oeufs': 'Eier',
  'Lait Entier': 'Vollmilch',
  'Blanc de Poulet': 'Hähnchenbrust',
  'Boeuf Haché 15%': 'Rinderhackfleisch 15%',
  'Ciboulette': 'Schnittlauch',
  'Ail': 'Knoblauch',
  'Oignon': 'Zwiebel',
  'Échalote': 'Schalotte',
  'Crème Liquide': 'Flüssige Sahne',
  'Sel': 'Salz',
  'Poivre': 'Pfeffer',
  'Vin Blanc': 'Weißwein',
  'Champignons de Paris': 'Champignons',
  'Citron': 'Zitrone',
  'Persil': 'Petersilie',
  'Tomates': 'Tomaten',
  'Pommes de Terre': 'Kartoffeln',
  'Lardons': 'Speckwürfel',
  'Fromage': 'Käse',
  'Pains Burger': 'Burgerbrötchen',
  'Salade': 'Salat',
  'Cornichons': 'Gewürzgurken',
  'Ketchup': 'Ketchup',
  'Mayonnaise': 'Mayonnaise',
  'Moutarde': 'Senf',
  'Haricots Verts': 'Grüne Bohnen',
  'Carottes': 'Karotten',
  'Courgettes': 'Zucchini',
  'Aubergines': 'Auberginen',
  'Poivrons': 'Paprika'
};
`;

if (!appData.includes('INGREDIENT_TRANSLATIONS_DE')) {
  appData = appData.replace(
    /const translateIngredientHelper = \(name: string, language: string\) => \{/,
    deTranslations + '\nconst translateIngredientHelper = (name: string, language: string) => {'
  );
  appData = appData.replace(
    /if \(language === 'it'\) \{([^}]+)\}/,
    "if (language === 'it') {$1}\n  if (language === 'de') {\n    const found = Object.keys(INGREDIENT_TRANSLATIONS_DE).find(k => k.toLowerCase() === trimmed.toLowerCase());\n    return found ? INGREDIENT_TRANSLATIONS_DE[found] : name;\n  }"
  );
  fs.writeFileSync('src/App.tsx', appData);
  console.log("Added INGREDIENT_TRANSLATIONS_DE to App.tsx");
} else {
  console.log("INGREDIENT_TRANSLATIONS_DE already exists in App.tsx");
}
