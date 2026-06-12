import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

// REVERT INITIAL_CART modifications
appText = appText.replace(/item: t\.language === 'en' \? 'Beef Tenderloin' : t\.language === 'es' \? 'Filete de Ternera' : 'Filet de Boeuf'/g, "item: 'Filet de Boeuf'");
appText = appText.replace(/item: t\.language === 'en' \? 'Seasonal Vegetables' : t\.language === 'es' \? 'Verduras de Temporada' : 'Légumes de saison'/g, "item: 'Légumes de saison'");
appText = appText.replace(/recipeName: t\.language === 'en' \? 'Beef Wellington' : t\.language === 'es' \? 'Solomillo Wellington' : 'Boeuf Wellington'/g, "recipeName: 'Boeuf Wellington'");

fs.writeFileSync('src/App.tsx', appText);

// Now translate these on the fly in the render loop! 
let appText2 = fs.readFileSync('src/App.tsx', 'utf8');

// Let's find where the Production plan displays ingredient names
const targetItemName = '<div className="font-bold flex items-center gap-2 text-slate-100">';
const replaceItemName = '<div className="font-bold flex items-center gap-2 text-slate-100">{item.item === "Filet de Boeuf" && t.language === "es" ? "Filete de ternera" : item.item === "Filet de Boeuf" && t.language === "en" ? "Beef Tenderloin" : item.item === "Légumes de saison" && t.language === "es" ? "Verduras de temporada" : item.item === "Légumes de saison" && t.language === "en" ? "Seasonal vegetables" : translateIngredientHelper(item.item, t.language)}';

// Wait, the line above is tricky because I don't know the exact string. Let's use string replace on standard components.
// For recipe name:
appText2 = appText2.replace(/<span className="font-bold">\{recipe\.name\}<\/span>/g, '<span className="font-bold">{recipe.name === "Boeuf Wellington" && t.language === "es" ? "Solomillo Wellington" : recipe.name === "Boeuf Wellington" && t.language === "en" ? "Beef Wellington" : recipe.name}</span>');

// For item rendering in ProdPlan items map ... wait, maybe I just translate it before returning:
appText2 = appText2.replace(/\{item\.item\}/g, '{item.item === "Filet de Boeuf" && t.language === "es" ? "Filete de ternera" : item.item === "Filet de Boeuf" && t.language === "en" ? "Beef Tenderloin" : item.item === "Légumes de saison" && t.language === "es" ? "Verduras de temporada" : item.item === "Légumes de saison" && t.language === "en" ? "Seasonal vegetables" : translateIngredientHelper(item.item, t.language)}');

fs.writeFileSync('src/App.tsx', appText2);

// Fix HaccpModules.tsx translateIngredient
if (fs.existsSync('src/components/HaccpModules.tsx')) {
  let haccpText = fs.readFileSync('src/components/HaccpModules.tsx', 'utf8');
  haccpText = haccpText.replace(/translateIngredient \? translateIngredient\(i\.name, t\.language\) : i\.name/g, 'i.name');
  fs.writeFileSync('src/components/HaccpModules.tsx', haccpText);
}
