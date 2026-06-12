import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

appText = appText.replace(/\{t\.catViandes \|\| "Viandes"\}/g, '{t.catMeat || "Viandes"}');
appText = appText.replace(/\{t\.catDairy \|\| "Crémerie"\}/g, '{t.catDairy || "Crémerie"}');

appText = appText.replace(
  /sourceRecipeId: 'r1', recipeName: 'Boeuf Wellington' \}/g, 
  "sourceRecipeId: 'r1', recipeName: t.language === 'en' ? 'Beef Wellington' : t.language === 'es' ? 'Solomillo Wellington' : 'Boeuf Wellington' }"
);
appText = appText.replace(
  /item: 'Filet de Boeuf'/g, 
  "item: t.language === 'en' ? 'Beef Tenderloin' : t.language === 'es' ? 'Filete de Ternera' : 'Filet de Boeuf'"
);
appText = appText.replace(
  /item: 'Légumes de saison'/g, 
  "item: t.language === 'en' ? 'Seasonal Vegetables' : t.language === 'es' ? 'Verduras de Temporada' : 'Légumes de saison'"
);

// Activer button
appText = appText.replace(
  /                             Activer/g,
  '                             {t.activate || "Activer"}'
);

fs.writeFileSync('src/App.tsx', appText);

if (fs.existsSync('src/components/Purchasing.tsx')) {
  let purchText = fs.readFileSync('src/components/Purchasing.tsx', 'utf8');
  purchText = purchText.replace(/<p className="text-slate-500 text-sm font-medium">Claus.io — Logistique & Approvisionnement<\/p>/g, '<p className="text-slate-500 text-sm font-medium">{t.purchasingSubtitle2 || "Claus.io — Logistique & Approvisionnement"}</p>');
  purchText = purchText.replace(/placeholder="Téléphone"/g, 'placeholder={t.phone || "Téléphone"}');
  purchText = purchText.replace(/Email: \$\{supplierData\.email\}/g, '${t.email || "Email"}: ${supplierData.email}');
  purchText = purchText.replace(/Tél: \$\{supplierData\.phone\}/g, '${t.phone || "Téléphone"}: ${supplierData.phone}');
  purchText = purchText.replace(/À l\'attention de :/g, '${t.attentionOf || "À l\'attention de :"}');
  fs.writeFileSync('src/components/Purchasing.tsx', purchText);
}

if (fs.existsSync('src/components/HaccpModules.tsx')) {
  let haccpText = fs.readFileSync('src/components/HaccpModules.tsx', 'utf8');
  haccpText = haccpText.replace(/>Aucun lot en stock\.<\/p>/g, '>{t.noBatchInStock || "Aucun lot en stock."}</p>');
  haccpText = haccpText.replace(/Emballage Intact/g, '{t.packagingIntact || "Emballage Intact"}');
  haccpText = haccpText.replace(/>Historique</g, '>{t.history || "Historique"}<');
  haccpText = haccpText.replace(/<option key=\{i\.id\} value=\{i\.id\}>\{i\.name\}<\/option>/g, '<option key={i.id} value={i.id}>{translateIngredient ? translateIngredient(i.name, t.language) : i.name}</option>');
  fs.writeFileSync('src/components/HaccpModules.tsx', haccpText);
}

console.log("Fixed files easily.");
