const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const DE_QUANTITY = `
const STANDARD_QUANTITIES_DE_PROMPT = \`
        WICHTIG: BEFOLGEN SIE UNBEDINGT DIESE MENGENSTANDARDS PRO PERSON:
        - ABSOLUTES VERBOT: Verwenden Sie NIEMALS "tiefgefrorenes Gemüse" in Ihren Rezepten. Verwenden Sie nur FRISCHE und SAISONALE Produkte.
        - VORSPEISEN: Verschiedene Aufschnitte (60g), Schinken (70g), Terrine oder Pastete (60g), Pizza/Quiche/herzhafte Kuchen (100g), Frische Rohkost (150g), Stärkehaltige Salate - Reis, Nudeln, Taboulé (80g).
        - NUDELN / REIS: Hartweizennudeln (150g Hauptgericht, 125g Beilage), Tagliatelle (150g Hauptgericht, 125g Beilage), Gnocchi (350g Hauptgericht, 300g Beilage), Ravioli und andere gefüllte Nudeln (380g), Reis (125g).
        - FISCH: Filets (145g), Tintenfisch und Ähnliches (200g), Meeresfrüchte (100g).
        - FLEISCH: Rinderbrust (180g), Entrecôte (180g), Hackfleisch (145g), Rind-, Kalb-, Schweine-, Puten-, Hühnerpfanne (220g), Entenpfanne (280g), Rinder-, Puten-, Kalbs-, Schweine-, Lammbraten (180g).
        - BEILAGEN: FRISCHES Marktgemüse (250g), Linsen (125g), Pommes frites und andere Kartoffeln (250g), Polenta (60g), Quinoa (250g), Ebly (125g).
        - ANDERE: Pesto (80g).
\`;
`;

const IT_QUANTITY = `
const STANDARD_QUANTITIES_IT_PROMPT = \`
        IMPORTANTE: RISPETTATE TASSATIVAMENTE QUESTI STANDARD QUANTITATIVI A PERSONA:
        - DIVIETO ASSOLUTO: Non utilizzate MAI "verdure surgelate" nelle vostre ricette. Usate solo prodotti FRESCHI e DI STAGIONE.
        - ANTIPASTI: Salumi misti (60g), Prosciutto (70g), Terrina o paté (60g), Pizza/quiche/torte salate (100g), Verdure crude fresche (150g), Insalate di amidi - riso, pasta, tabbouleh (80g).
        - PASTA - RISO: Pasta di grano duro (150g come piatto principale, 125g come contorno), Tagliatelle (150g principale, 125g contorno), Gnocchi (350g principale, 300g contorno), Ravioli e altre paste ripiene (380g), Riso (125g).
        - PESCE: Fileti (145g), Calamari e simili (200g), Frutti di mare (100g).
        - CARNE: Punta di petto di manzo (180g), Entrecôte (180g), Carne macinata (145g), Manzo, vitello, maiale, tacchino, pollo saltati (220g), Anatra saltata (280g), Arrosto di manzo, tacchino, vitello, maiale, agnello (180g).
        - CONTORNI: Verdure FRESCHE di mercato (250g), Lenticchie (125g), Patatine fritte e altre patate (250g), Polenta (60g), Quinoa (250g), Ebly/Grano (125g).
        - ALTRO: Pesto (80g).
\`;
`;

code = code.replace(
  'const STANDARD_QUANTITIES_ENG_PROMPT = `',
  IT_QUANTITY + DE_QUANTITY + 'const STANDARD_QUANTITIES_ENG_PROMPT = `'
);

// 1. Language Names Map Update
code = code.replace(
  /settings\.language === "es"\s*\?\s*"Spanish"\s*:\s*"English"/g,
  'settings.language === "es" ? "Spanish" : settings.language === "de" ? "German" : "English"'
);
code = code.replace(
  /settings\.language === "es"\s*\?\s*"Espa\\xF1ol"\s*:\s*"English"/g,
  'settings.language === "es" ? "Español" : settings.language === "de" ? "Deutsch" : "English"'
);
code = code.replace(
  /settings\.language === "es"\s*\?\s*"SPANISH"\s*:\s*"ENGLISH"/g,
  'settings.language === "es" ? "SPANISH" : settings.language === "de" ? "GERMAN" : "ENGLISH"'
);

const REPLACEMENTS = [
  { // 0: Analyze Menu
    startStr: 'Analyze this menu and extract the decomposed technical sheets.',
    deSub: `Analysiere dieses Menü und extrahiere die Datenblätter in Einzelteilen.
MANDAT DE SPRACHE: ANTWORT AUF DEUTSCH.
Anweisungen:
1. Identifiziere jedes Rezept.
2. Pflichterkennung: Liste der Allergene.
3. Zutaten extrahieren.
4. Ausführliche Anweisungen.
\${STANDARD_QUANTITIES_DE_PROMPT}
ANTSWORTE AUSSCHLIESSLICH IN JSON:`
  },
  { // 1: Creative Menu
    startStr: 'Act as a world-class Avant-Garde Executive Chef',
    deSub: `SPRACHMANDAT: ANTWORT AUF DEUTSCH.

Handle als Avantgarde-Chefkoch. Erstelle ein kreatives 7-Tage-Menü.
\${STANDARD_QUANTITIES_DE_PROMPT}
Antworte AUSSCHLIESSLICH IN JSON:`
  },
  { // 2: Traditional Menu
    startStr: 'Act as an Executive Chef of a cutting-edge Chic Bistro',
    deSub: `SPRACHMANDAT: ANTWORT AUF DEUTSCH.

Handle als Chefkoch eines schicken Bistros. Erstelle ein Wochenmenü.
1. ANGEBOTSANFORDERUNG: Erstelle ein KOMPLETTES Menü für 7 Tage (Montag bis Sonntag).
2. MENÜSTRUKTUR: Jeder Tag MUSS eine Vorspeise, ein Hauptgericht und ein Dessert enthalten. Insgesamt 21 Gerichte.
3. BISTRO CHIC PHILOSOPHIE: Biete raffinierte, moderne Gerichte an. Die Gerichternamen (nom) MÜSSEN POETISCH, DETAILLIERT UND LANG SEIN.
4. ABSOLUTE VIELFALT (KRITISCH): Das Menü muss 100% vielfältig sein. Es ist VERBOTEN, dasselbe Gericht oder dieselbe Zutat an mehreren Tagen vorzuschlagen.
5. SENSORISCHES GLEICHGEWICHT: Jedes Gericht MUSS eine Balance aus verschiedenen Texturen und Aromen bieten.
6. PFLICHTERKENNUNG: Führe alle Allergene für jedes Gericht auf.
7. ZUTATEN: Gib genaue Mengen (in g oder ml) an.
8. ZUBEREITUNGSSCHRITTE (KRITISH): MUSS extrem detailliert sein (MINIMUM 15 Sätze!).
9. \${STANDARD_QUANTITIES_DE_PROMPT}

WICHTIG: DIE GANZE ANTWORT MUSS AUF DEUTSCH SEIN.
Antwort EXKLUSIV IN JSON mit dieser Struktur:
{"status": "success", "traditional_menu": [{"jour":"montag", "entree":{"nom":"...", "ingredients":[{"name":"[NAME]","quantite":"0","unite":"g"}], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "dessert":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."} }]}`
  },
  { // 3: Gastronomic Menu
    startStr: 'Act as a 3-Michelin-Starred Executive Chef specialized in Ultra-Fine Dining',
    deSub: `Handle als 3-Sterne-Michelin-Chefkoch, der auf Haute Cuisine spezialisiert ist. Erstelle 3 Weltklasse-Gastronomiemenüs.
1. EXZELLENZ und 2. EDLE PRODUKTE.
\${STANDARD_QUANTITIES_DE_PROMPT}
Responde en JSON`
  },
  { // 4: HACCP Scan
    isDlc: true,
    startStr: 'Extract information from this PRODUCT TRACEABILITY LABEL',
    deSub: `Extrahieren Sie Informationen von diesem PRODUKTVERFOLGBARKEITSETIKETT (HACCP) im JSON-Format: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}.
WARNUNG: Der Ausgabe-JSON MUSS den Schlüssel DLC für das Verfallsdatum verwenden.
KRITISCHE ANFORDERUNG: Extrahieren Sie spezifisch Gesundheitsrückverfolgbarkeit (Verfallsdatum/DLC, Charge).
Finden Sie das GEWICHT oder GRAMMATUR.
Verlassen Sie die Menge NIEMALS bei 0, wenn das Gewicht sichtbar ist.`
  },
  { // 5: Anti-waste Generate
    startStr: 'Generate a creative and professional anti-waste recipe proposal.',
    deSub: `Erstelle einen kreativen und professionellen Vorschlag für ein Anti-Waste-Rezept.
Anweisungen:
1. Verwenden Sie vorrangig Zutaten mit kurzem Haltbarkeitsdatum: \${expiringBatches.map(b=>\`\${b.name} (\${b.quantity} \${b.unit}, läuft ab am \${b.expiration_date})\`).join(", ")}.
2. Kombinieren Sie sie mit Standardzutaten, um ein ausgewogenes Rezept zu kreieren.
3. PFLICHTANGABE: Listen Sie mögliche Allergene auf.

Antworten Sie AUSSCHLIESSLICH als JSON auf DEUTSCH mit folgendem Format:
{
  "menu_name": "Anti-Waste Proposal",
  "dishes": [
    {
      "name": "...",
      "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],
      "allergens": ["...", "..."],
      "preparation_steps": "..."
    }
  ]
}`
  },
  { // 6: Voice Add to Cart / Intent
    startStr: 'CRITICAL DIRECTIVE: You are CLAUS.IO, an expert culinary assistant',
    deSub: `RICHTLINIE: Du bist CLAUS.IO, ein kulinarischer Assistent. Du arbeitest AUF DEUTSCH.
Benutzer: "\${message}"
Wenn etwas zum Warenkorb hinzugefügt wird, JSON antworten:
{"intent":"add_to_cart","item":"name","quantity":1,"unit":"kg","response":"Nachricht"}
Andernfalls:
{"intent":"general_advice","response":"Antwort"}
NUR JSON.`
  },
  { // 7: Generate Prep Steps
    startStr: 'CRITICAL DIRECTIVE: You MUST respond entirely in ENGLISH',
    deSub: `WICHTIGE RICHTLINIE: Sie müssen auf DEUTSCH antworten.
Generieren Sie äußerst detaillierte Zubereitungsschritte für folgendes Rezept: \${recipe.name}.
Zutaten: \${ingredients.map(i=>\`\${i.name} (\${i.quantity_per_person}\${i.unit})\`).join(", ")}.
Antworten Sie auf Deutsch NUR mit dem reinen Text der Zubereitungsschritte.`
  },
  { // 8: Documents Upload Extract
    startStr: 'Analyze this document (Invoice, Delivery Note, or Credit Note)',
    deSub: `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
{
  "type": "FACTURE" | "BL" | "AVOIR",
  "supplier": "Name des Lieferanten",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "item": "Name des Artikels",
      "quantity": 0,
      "unit": "kg, g, L, u, etc.",
      "unit_price": 0
    }
  ],
  "total_amount": 0
}
WICHTIG:
1. TYP-ERKENNUNG: 
- Mit Preisen = FACTURE.
- Ohne Preise = BL.
- Gutschrift = AVOIR.
2. ARTIKEL: Jede Menge sehr präzise extrahieren.
3. ÜBERPRÜFUNG: Muss als JSON geantwortet werden.`
  },
  { // 9: Chat API Strict Prompt
    startStr: 'CRITICAL DIRECTIVE: You are an elite culinary AI assistant for professional chefs',
    deSub: `WICHTIGE RICHTLINIE: Sie sind ein kulinarischer KI-Assistent der Eliteklasse für professionelle Köche. Sie MÜSSEN vollständig auf DEUTSCH antworten.
Benutzernachricht: "\${message}"`
  }
];

let resCount = 0;

for (let r of REPLACEMENTS) {
  let idx = code.indexOf(r.startStr);
  if (idx !== -1) {
    let beforeText = code.slice(Math.max(0, idx - 200), idx);
    let langMatch = r.isDlc ? "isEnForDlc" : (r.startStr.includes('Analyze this document') ? "isEn" : 'settings.language === "en"');
    
    // We construct the replacement literal properly evaluated here because it's replacing template literals
    let replacement = `settings.language === "de" ? \`${r.deSub}\` : ${langMatch}`;
    
    let targetIdx = code.lastIndexOf(`: ${langMatch}`, idx);
    if(targetIdx !== -1) {
      code = code.substring(0, targetIdx) + ': ' + replacement + code.substring(targetIdx + 2 + langMatch.length);
      resCount++;
      console.log('Replaced ' + r.startStr.substring(0, 30));
    } else {
      console.log('Failed to find hook for ' + r.startStr);
    }
  } else {
    console.log('Failed to find start string: ' + r.startStr.substring(0, 30));
  }
}

// 10. `isEsForDlc` extraction
code = code.replace(/const isEsForDlc = settings\.language === "es";/g, 'const isEsForDlc = settings.language === "es";\nconst isDeForDlc = settings.language === "de";');
code = code.replace(/const isEs = settings\.language === "es";/g, 'const isEs = settings.language === "es";\nconst isDe = settings.language === "de";');

// Now system chat replacements
code = code.replace(
  'settings.language === "es"\n              ? "Eres un asistente culinario profesional. Operas estrictamente en espa\\\\xF1ol."\n              : settings.language === "en"',
  'settings.language === "es"\n              ? "Eres un asistente culinario profesional. Operas estrictamente en espa\\\\xF1ol."\n              : settings.language === "de" ? "Sie sind ein professioneller kulinarischer Assistent. Sie arbeiten streng auf Deutsch."\n              : settings.language === "en"'
);

// Response error catch
code = code.replace(
  'settings.language === "es"\n              ? "Lo siento Chef, estoy experimentando una dificultad t\\\\xE9cnica."\n              : settings.language === "fr"',
  'settings.language === "es"\n              ? "Lo siento Chef, estoy experimentando una dificultad t\\\\xE9cnica."\n              : settings.language === "de" ? "Entschuldigung Chef, ich habe ein technisches Problem."\n              : settings.language === "fr"'
);

fs.writeFileSync('server.ts', code, 'utf8');
console.log('Total replacements logic: ' + resCount);
