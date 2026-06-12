import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

// Add specific styles to language options so they don't appear white-on-white
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

// We need to find the translation objects and ensure foodCost and laborCost are present and translated.
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
