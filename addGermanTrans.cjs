const fs = require('fs');

let appData = fs.readFileSync('src/App.tsx', 'utf-8');

// The `de:` block is exactly a copy of `en:` right now but with `language: "de"`.
// I will extract the `de: { ... }` block and replace its values.
const deMatch = appData.match(/de:\s*\{([\s\S]*?)\n\s*\},\n\s*es:/);

if (deMatch) {
  let deContent = deMatch[1];
  
  const translations = {
    searchIngredient: "Suchen Sie nach einem Produkt...",
    ingredientsInStock: "Zutaten auf Lager",
    generatedIngredient: "Generierte Zutat",
    dashboard: "Dashboard",
    inventory: "Inventar & Lager",
    menuEngineering: "Menü-Engineering",
    technicalSheets: "Technische Datenblätter",
    productionPlan: "Produktionsplan",
    purchasing: "Einkäufe",
    documents: "Dokumente",
    staffManagement: "Personalverwaltung",
    haccpTraceability: "HACCP & Rückverfolgbarkeit",
    antiWaste: "Anti-Verschwendung",
    culinaryChat: "Kulinarischer Chat",
    robotFleet: "Roboterflotte",
    settings: "Einstellungen",
    selectMenuType: "Menüart auswählen",
    creativeMenu: "Kreativmenü (7 Tage)",
    traditionalMenu: "Traditionelles Menü (7 Tage)",
    gastronomicMenu: "Gastronomisches Menü (3 Optionen)",
    generateMenu: "Menü generieren",
    generating: "Generiere...",
    noMenuGenerated: "Kein Menü generiert.",
    creativeConcept: "Kreatives Konzept",
    monday: "Montag",
    tuesday: "Dienstag",
    wednesday: "Mittwoch",
    thursday: "Donnerstag",
    friday: "Freitag",
    saturday: "Samstag",
    sunday: "Sonntag",
    lunch: "Mittagessen",
    dinner: "Abendessen",
    creativeDish: "Kreatives Gericht",
    entree: "Vorspeise",
    plat: "Hauptgericht",
    dessert: "Dessert",
    exportSelectedMenu: "Ausgewähltes Menü exportieren",
    exportAllFT: "Alle technischen Datenblätter exportieren (PDF)",
    exporting: "Exportiere...",
    exportComplete: "Export abgeschlossen!",
    generateFT: "Datenblätter generieren",
    ingredients: "Zutaten",
    allergens: "Allergene",
    prepStepsInfo: "Zubereitungsschritte (Nur Info)",
    analyzingMenu: "Analysiere Menü...",
    generatePrepSteps: "Zubereitungsschritte generieren (KI)",
    generateRecipeMenuBtn: "Rezepte generieren",
    ingredient: "Zutat",
    qty: "Menge",
    cost: "Kosten",
    saveMenu: "Menü und Rezepte speichern",
    autoExtraction: "Automatische Extraktion",
    systemLanguage: "Systemsprache",
    chatWelcome: "Hallo Chef, ich bin CLAUS.IO, Ihr intelligenter kulinarischer Assistent. Wie kann ich Ihnen helfen?",
    menuAnalysis: "Menüanalyse",
    docAnalysis: "Dokumentenanalyse",
    documentText: "Dokumententext",
    totalRecipes: "Rezepte Gesamt",
    uniqueIngredients: "Einzigartige Zutaten",
    totalDailyCost: "Tägliche Gesamtkosten",
    totalMenusCost: "Gesamtkosten Menüs",
    generateSteps: "Schritte generieren",
    prepStepsPlaceholder: "Geben Sie die Zubereitungsschritte hier ein...",
    guests: "Gäste",
    aiAssistantTitle: "CLAUS.IO - KI-Assistent",
    close: "Schließen",
    micOn: "Mikrofon ist EIN",
    micOff: "Mikrofon ist AUS",
    typeMessage: "Nachricht eingeben...",
    uploadDoc: "Ein Dokument oder Foto hochladen",
    camera: "Kamera",
    cart: "Ausgewählte Zutaten für den Einkauf",
    addToCart: "Dem Einkaufsplan hinzufügen",
    removeFromCart: "Auswahl aufheben",
    stockStatus: "Bestandsstatus wird geladen...",
    copilotModeDesc: "Aktiviert kontextbezogene kulinarische Empfehlungen.",
    modelSelection: "KI-Modell",
    antiWasteTitle: "Resteverwertung",
    antiWasteDesc: "Wählen Sie Zutaten aus, um Rezepte zur Vermeidung von Lebensmittelverschwendung zu generieren.",
    selectIngredients: "Wählen Sie verfügbare Zutaten",
    noIngredientsSelected: "Bitte wählen Sie mindestens eine Zutat aus.",
    availableIngredients: "Verfügbare Zutaten",
    selectedIngredients: "Ausgewählte Zutaten",
    generateRecipes: "Rezepte generieren",
    antiWasteResults: "Generierte Rezepte",
    noRecipesGenerated: "Noch keine Rezepte generiert. Wählen Sie Zutaten und klicken Sie auf 'Rezepte generieren'.",
    recipeName: "Rezeptname",
    usedIngredients: "Verwendete Zutaten",
    addToTechnicalSheets: "Zu Datenblättern hinzufügen",
    saveRecipe: "Rezept speichern",
    saveAll: "Alle Rezepte speichern",
    recipeSaved: "Rezept in Datenblättern gespeichert!",
    purchasingSubtitle2: "Claus.io — Logistik & Beschaffung",
    phone: "Telefon",
    attentionOf: "Zu Händen von:",
    email: "E-Mail",
    noBatchInStock: "Kein Bestand auf Lager.",
    packagingIntact: "Verpackung Intakt",
    history: "Verlauf",
    configTrialDesc: "Sie haben noch {days} Tage Testzeit für CLAUS.IO.",
    activate: "Aktivieren",
    documentDetails: "Dokumentdetails",
    chefMenu: "CHEFMENÜ",
    nom: "Name",
    syncFTError: "Fehler bei der Synchronisierung der technischen Datenblätter.",
    addRecipeManually: "Manuell hinzufügen"
  };

  // Replace each line in deContent
  for (const [key, value] of Object.entries(translations)) {
    const regex = new RegExp(`^(\\s*${key}:\\s*)".*?",?$`, 'm');
    const escapedValue = value.replace(/"/g, '\\"');
    if (regex.test(deContent)) {
      deContent = deContent.replace(regex, `$1"${escapedValue}",`);
    } else {
      // Key not found exactly, just append it
      deContent += `\n    ${key}: "${escapedValue}",`;
    }
  }

  appData = appData.replace(deMatch[1], deContent);
  fs.writeFileSync('src/App.tsx', appData);
  console.log("German translations written to App.tsx");
} else {
  console.log("de: block not found in App.tsx!");
}
