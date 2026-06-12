import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

// We need to add dailyLaborCost to the default dictionaries since t.dailyLaborCost falls back to French
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

fs.writeFileSync('src/App.tsx', appText);
console.log("dailyLaborCost translated");
