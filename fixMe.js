import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

appText = appText.replace(
  /documentDetails: "Détails du Document",/g,
  'documentDetails: "Détails du Document",\n    dailyLaborCost: "Coût Main d\'Œuvre",'
);

appText = appText.replace(
  /documentDetails: "Document Details",/g,
  'documentDetails: "Document Details",\n    dailyLaborCost: "Labor Cost",'
);

appText = appText.replace(
  /documentDetails: "Detalles del Documento",/g,
  'documentDetails: "Detalles del Documento",\n    dailyLaborCost: "Costo Mano de Obra",'
);

// We should also replace the hardcoded "Matière" if there are any that aren't using t.foodCost properly.
// The fallback was {t.foodCost || "Matière"}, which is now covered. Wait, let me also check if `t.foodCost` was actually added.
// It seems `fixTranslation.js` couldn't run earlier because it was created at `/app/applet/fixTranslation.js`! Oh my mistake, `/app/applet` is not the root.
// Let me re-apply the styling fixes for options and foodCost now...

appText = appText.replace(
  /<option value="fr">Français<\/option>/g,
  '<option value="fr" className="bg-[#121212] text-white">Français</option>'
);

appText = appText.replace(
  /<option value="en">English<\/option>/g,
  '<option value="en" className="bg-[#121212] text-white">English</option>'
);

appText = appText.replace(
  /<option value="es">Español<\/option>/g,
  '<option value="es" className="bg-[#121212] text-white">Español</option>'
);

appText = appText.replace(
  /documentDetails: "Détails du Document",/g,
  'documentDetails: "Détails du Document",\n    foodCost: "Coût Matière",\n    laborCost: "Coût Main d\'Œuvre",'
);

appText = appText.replace(
  /documentDetails: "Document Details",/g,
  'documentDetails: "Document Details",\n    foodCost: "Food Cost",\n    laborCost: "Labor Cost",'
);

appText = appText.replace(
  /documentDetails: "Detalles del Documento",/g,
  'documentDetails: "Detalles del Documento",\n    foodCost: "Costo de Materia Prima",\n    laborCost: "Costo de Mano de Obra",'
);


fs.writeFileSync('src/App.tsx', appText);
console.log("Translations and styling fixed");
