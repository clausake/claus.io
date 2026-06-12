const translationsDe = {
  "laborPlanningBasis": "Datengrundlage auf Basis des wöchentlichen Produktionsplans berechnet.",
  "cartSuccess": "Dem Warenkorb hinzugefügt!",
  "deleteRecipe": "Rezept löschen",
  "regenerateSteps": "Schritte neu generieren",
  "staffPlanningSubtitle": "Verwalten Sie Ihre Schichten mit prädiktiver KI",
  "staffName": "Name",
  "staffRole": "Rolle",
  "addStaff": "Personal hinzufügen",
  "shiftMorning": "07:00 - 15:00",
  "shiftEvening": "15:00 - 23:00",
  "shiftSplit": "Geteilt",
  "shiftOff": "Frei",
  "savePlanning": "Planung speichern",
  "exportPlanning": "Exportieren",
  "confirmDelete": "Sind Sie sicher?",
  "noStaffRecords": "Kein Personal vorhanden",
  "noStaffDesc": "Fügen Sie Teammitglieder hinzu.",
  "collaborator": "Mitarbeiter",
  "roleChef": "Küchenchef",
  "roleSousChef": "Sous-Chef",
  "rolePlongeur": "Spüler",
  "roleServeur": "Kellner",
  "roleManager": "Manager",
  "roleCommis": "Commis",
  "hourlyRate": "Stundenlohn",
  "totalHours": "Gesamtstunden",
  "costEstimate": "Geschätzte Kosten / Tag",
  "inventoryAudit": "Inventar & Überprüfung",
  "realTimeData": "Echtzeit-Analyse",
  "importCsv": "CSV importieren",
  "add": "Hinzufügen",
  "clausAdvice": "CLAUS.IO Beratung",
  "updateInventory": "Bestand aktualisieren",
  "inventoryUpdateSuccess": "✅ Bestand aktualisiert!",
  "valuationChart": "Wertverteilung",
  "stockHealth": "Gesundheitszustand des Bestands",
  "normal": "Normal",
  "toOrder": "Nachbestellen",
  "critical": "Kritisch",
  "id": "ID",
  "stockLevel": "BESTAND / MINDESTMENGE",
  "name": "BEZEICHNUNG",
  "quantity": "Menge",
  "alertThreshold": "Warnschwelle",
  "unit": "EINHEIT",
  "nextDlc": "Nächstes MHD (Chargen)",
  "editIngredient": "Zutat bearbeiten",
  "update": "Aktualisieren",
  "clausStrategic": "Strategische Empfehlung",
  "expired": "Abgelaufen",
  "catViande": "Fleisch",
  "catViandes": "Fleischwaren",
  "catFish": "Fisch",
  "catPoisson": "Fisch",
  "catVeg": "Gemüse",
  "catFruit": "Obst",
  "robotFleetSubtitle": "Erweiterte Verwaltung des Küchenpersonals",
  "autoAssignAI": "CLAUS.IO KI Auto-Zuweisung",
  "simulationWarning": "SIMULATIONSAKTIVITÄT: Verbindung zum Roboter-Server getrennt.",
  "robotOnMission": "Im Einsatz",
  "robotCharging": "Wird aufgeladen",
  "batteryLabel": "Akku:",
  "taskLabel": "Aufgabe:",
  "zoneLabel": "Zone:",
  "progressLabel": "Fortschritt:",
  "details": "Details",
  "interrupt": "Unterbrechen",
  "assign": "Zuweisen",
  "robotWaiting": "In Wartestellung",
  "peelingCarrots": "Karotten schälen",
  "washingPots": "Töpfe spülen",
  "vegPrep": "Gemüsezubereitung",
  "dishWashArea": "Spülbereich",
  "chargingStationA": "Ladestation A",
  "whatTaskAssign": "Welche Aufgabe möchten Sie zuweisen?",
  "aiPerformance": "KI-Leistung",
  "optimization": "Wöchentliche Optimierung",
  "expenses": "Lebensmittelkosten",
  "error": "Fehler",
  "connectionError": "Verbindungsfehler. Offline-Modus aktiv.",
  "menuPlanning": "Menüplanung",
  "planningNouvelle": "Neue Menüplanung",
  "addToPlanning": "Zur Produktion hinzufügen",
  "fish": "Fisch",
  "iaAutomated": "VON CLAUS.IO KI GESTEUERT",
  "batches": "CHARGEN",
  "chronologicalHistory": "Chronologische Historie",
  "search": "Produkt suchen...",
  "guests": "Gast(Gäste)",
  "licenseActivation": "Lizenzaktivierung",
  "licenseMachineId": "Geräte-ID",
  "licenseActivate": "Aktivieren",
};

const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Parse German dict
const parseDictBlock = (lang) => {
  const start = code.indexOf(lang + ': {');
  let end = code.indexOf(`  },`, start);
  const text = code.slice(start, end);
  const dict = {};
  const regex = /^\s+(?:([a-zA-Z0-9_\-]+)|"([a-zA-Z0-9_\-]+)")\s*:\s*"(.*?)"/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1] || match[2];
    dict[key] = match[3];
  }
  return dict;
};

const deDict = parseDictBlock('de');
let missingLines = [];
for (const [key, val] of Object.entries(translationsDe)) {
  if (!deDict[key]) {
    missingLines.push(`    ${key}: "${val}",`);
  }
}

if (missingLines.length > 0) {
  const deBlockIndex = code.indexOf('documentDetails: "Dokumentdetails",');
  const insertIndex = deBlockIndex + 'documentDetails: "Dokumentdetails",'.length;
  code = code.slice(0, insertIndex) + '\\n' + missingLines.join('\\n') + code.slice(insertIndex);
  fs.writeFileSync('src/App.tsx', code);
  console.log(`Appended ${missingLines.length} missing keys to German dict!`);
} else {
  console.log('No missing keys to append for DE.');
}
