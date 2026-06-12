import fs from 'fs';
let appText = fs.readFileSync('src/App.tsx', 'utf8');

// Add French
appText = appText.replace(/t: \{\n\s*language: "fr",/, 't: {\n    language: "fr",\n    purchasingSubtitle2: "Claus.io — Logistique & Approvisionnement",\n    phone: "Téléphone",\n    attentionOf: "À l\'attention de :",\n    email: "Email",\n    noBatchInStock: "Aucun lot en stock.",\n    packagingIntact: "Emballage Intact",\n    history: "Historique",\n    configTrialDesc: "Il vous reste {days} jours d\'essai pour tester CLAUS.IO.",\n    activate: "Activer",\n    documentDetails: "Détails du Document",');

// Add English
appText = appText.replace(/en: \{\n\s*language: "en",/, 'en: {\n    language: "en",\n    purchasingSubtitle2: "Claus.io — Supply & Logistics",\n    phone: "Phone",\n    attentionOf: "Attention to:",\n    email: "Email",\n    noBatchInStock: "No batches in stock.",\n    packagingIntact: "Intact Packaging",\n    history: "History",\n    configTrialDesc: "You have {days} days of trial left to test CLAUS.IO.",\n    activate: "Activate",\n    documentDetails: "Document Details",');

// Add Spanish
appText = appText.replace(/es: \{\n\s*language: "es",/, 'es: {\n    language: "es",\n    purchasingSubtitle2: "Claus.io — Logística y Aprovisionamiento",\n    phone: "Teléfono",\n    attentionOf: "A la atención de:",\n    email: "Correo",\n    noBatchInStock: "Ningún lote en stock.",\n    packagingIntact: "Embalaje Intacto",\n    history: "Historial",\n    configTrialDesc: "Le quedan {days} días de prueba para probar CLAUS.IO.",\n    activate: "Activar",\n    documentDetails: "Detalles del Documento",');

fs.writeFileSync('src/App.tsx', appText);
console.log('Added missing keys.');
