const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const DE_QUANTITY = 'const STANDARD_QUANTITIES_DE_PROMPT = `\\n        WICHTIG: BEFOLGEN SIE UNBEDINGT DIESE MENGENSTANDARDS PRO PERSON:\\n        - ABSOLUTES VERBOT: Verwenden Sie NIEMALS "tiefgefrorenes Gemüse" in Ihren Rezepten. Verwenden Sie nur FRISCHE und SAISONALE Produkte.\\n        - VORSPEISEN: Verschiedene Aufschnitte (60g), Schinken (70g), Terrine oder Pastete (60g), Pizza/Quiche/herzhafte Kuchen (100g), Frische Rohkost (150g), Stärkehaltige Salate - Reis, Nudeln, Taboulé (80g).\\n        - NUDELN / REIS: Hartweizennudeln (150g Hauptgericht, 125g Beilage), Tagliatelle (150g Hauptgericht, 125g Beilage), Gnocchi (350g Hauptgericht, 300g Beilage), Ravioli und andere gefüllte Nudeln (380g), Reis (125g).\\n        - FISCH: Filets (145g), Tintenfisch und Ähnliches (200g), Meeresfrüchte (100g).\\n        - FLEISCH: Rinderbrust (180g), Entrecôte (180g), Hackfleisch (145g), Rind-, Kalb-, Schweine-, Puten-, Hühnerpfanne (220g), Entenpfanne (280g), Rinder-, Puten-, Kalbs-, Schweine-, Lammbraten (180g).\\n        - BEILAGEN: FRISCHES Marktgemüse (250g), Linsen (125g), Pommes frites und andere Kartoffeln (250g), Polenta (60g), Quinoa (250g), Ebly (125g).\\n        - ANDERE: Pesto (80g).\\n  `;\\n';

const IT_QUANTITY = 'const STANDARD_QUANTITIES_IT_PROMPT = `\\n        IMPORTANTE: RISPETTATE TASSATIVAMENTE QUESTI STANDARD QUANTITATIVI A PERSONA:\\n        - DIVIETO ASSOLUTO: Non utilizzate MAI "verdure surgelate" nelle vostre ricette. Usate solo prodotti FRESCHI e DI STAGIONE.\\n        - ANTIPASTI: Salumi misti (60g), Prosciutto (70g), Terrina o paté (60g), Pizza/quiche/torte salate (100g), Verdure crude fresche (150g), Insalate di amidi - riso, pasta, tabbouleh (80g).\\n        - PASTA - RISO: Pasta di grano duro (150g come piatto principale, 125g come contorno), Tagliatelle (150g principale, 125g contorno), Gnocchi (350g principale, 300g contorno), Ravioli e altre paste ripiene (380g), Riso (125g).\\n        - PESCE: Filets (145g), Calamari e simili (200g), Frutti di mare (100g).\\n        - CARNE: Punta di petto di manzo (180g), Entrecôte (180g), Carne macinata (145g), Manzo, vitello, maiale, tacchino, pollo saltati (220g), Anatra saltata (280g), Arrosto di manzo, tacchino, vitello, maiale, agnello (180g).\\n        - CONTORNI: Verdure FRESCHE di mercato (250g), Lenticchie (125g), Patatine fritte e altre patate (250g), Polenta (60g), Quinoa (250g), Ebly/Grano (125g).\\n        - ALTRO: Pesto (80g).\\n  `;\\n';

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
  /settings\.language === "es"\s*\?\s*"Espa\\\\xF1ol"\s*:\s*"English"/g,
  'settings.language === "es" ? "Espa\\\\xF1ol" : settings.language === "de" ? "Deutsch" : "English"'
);
code = code.replace(
  /settings\.language === "es"\s*\?\s*"SPANISH"\s*:\s*"ENGLISH"/g,
  'settings.language === "es" ? "SPANISH" : settings.language === "de" ? "GERMAN" : "ENGLISH"'
);

const REPLACEMENTS = [
  { // 0: Analyze Menu
    startStr: 'Analyze this menu and extract the decomposed technical sheets.',
    deSub: 'Analysiere dieses Menü und extrahiere die Datenblätter in Einzelteilen.\\nMANDAT DE SPRACHE: ANTWORT AUF DEUTSCH.\\nAnweisungen:\\n1. Identifiziere jedes Rezept.\\n2. Pflichterkennung: Liste der Allergene.\\n3. Zutaten extrahieren.\\n4. Ausführliche Anweisungen.\\n${STANDARD_QUANTITIES_DE_PROMPT}\\nANTSWORTE AUSSCHLIESSLICH IN JSON:'
  },
  { // 1: Creative Menu
    startStr: 'LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH. NO FRENCH ALLOWED.\\n      \\n      Act as a world-class Avant-Garde Executive Chef',
    deSub: 'SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandle als Avantgarde-Chefkoch. Erstelle ein kreatives 7-Tage-Menü.\\n${STANDARD_QUANTITIES_DE_PROMPT}\\nAntworte AUSSCHLIESSLICH IN JSON:'
  },
  { // 2: Traditional Menu
    startStr: 'LANGUAGE MANDATE: RESPONSE MUST BE 100% IN ENGLISH. NO FRENCH ALLOWED.\\n      \\n      Act as an Executive Chef of a cutting-edge Chic Bistro',
    deSub: 'SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandle als Chefkoch eines schicken Bistros. Erstelle ein Wochenmenü.\\n1. ANGEBOTSANFORDERUNG: Erstelle ein KOMPLETTES Menü für 7 Tage (Montag bis Sonntag).\\n2. MENÜSTRUKTUR: Jeder Tag MUSS eine Vorspeise, ein Hauptgericht und ein Dessert enthalten. Insgesamt 21 Gerichte.\\n3. BISTRO CHIC PHILOSOPHIE: Biete raffinierte, moderne Gerichte an. Die Gerichternamen MÜSSEN POETISCH, DETAILLIERT UND LANG SEIN.\\n4. ABSOLUTE VIELFALT (KRITISCH): Das Menü muss 100% vielfältig sein. Es ist VERBOTEN, dasselbe Gericht oder dieselbe Zutat an mehreren Tagen vorzuschlagen.\\n5. SENSORISCHES GLEICHGEWICHT: Jedes Gericht MUSS eine Balance aus verschiedenen Texturen und Aromen bieten.\\n6. PFLICHTERKENNUNG: Führe alle Allergene für jedes Gericht auf.\\n7. ZUTATEN: Gib genaue Mengen (in g oder ml) an.\\n8. ZUBEREITUNGSSCHRITTE (KRITISH): MUSS extrem detailliert sein (MINIMUM 15 Sätze!).\\n9. ${STANDARD_QUANTITIES_DE_PROMPT}\\n\\nWICHTIG: DIE GANZE ANTWORT MUSS AUF DEUTSCH SEIN.\\nAntwort EXKLUSIV IN JSON mit dieser Struktur:\\n{"status": "success", "traditional_menu": [{"jour":"montag", "entree":{"nom":"...", "ingredients":[{"name":"[NAME]","quantite":"0","unite":"g"}], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "dessert":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."} }]}\\n'
  },
  { // 3: Gastronomic Menu
    startStr: '\\n      Act as a 3-Michelin-Starred Executive Chef specialized in Ultra-Fine Dining',
    deSub: '\\n      Handle als 3-Sterne-Michelin-Chefkoch, der auf Haute Cuisine spezialisiert ist. Erstelle 3 Weltklasse-Gastronomiemenüs.\\n      1. EXZELLENZ und 2. EDLE PRODUKTE.\\n      ${STANDARD_QUANTITIES_DE_PROMPT}\\n      Responde en JSON'
  },
  { // 4: HACCP Scan
    isDlc: true,
    startStr: 'Extract information from this PRODUCT TRACEABILITY LABEL',
    deSub: 'Extrahieren Sie Informationen von diesem PRODUKTVERFOLGBARKEITSETIKETT (HACCP) im JSON-Format: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. \\n        WARNUNG: Der Ausgabe-JSON MUSS den Schlüssel DLC für das Verfallsdatum verwenden.\\n        KRITISCHE ANFORDERUNG: Extrahieren Sie spezifisch Gesundheitsrückverfolgbarkeit (Verfallsdatum/DLC, Charge).\\n        Finden Sie das GEWICHT oder GRAMMATUR.\\n        Verlassen Sie die Menge NIEMALS bei 0, wenn das Gewicht sichtbar ist.'
  },
  { // 5: Anti-waste Generate
    startStr: 'Generate a creative and professional anti-waste recipe proposal.',
    deSub: 'Erstelle einen kreativen und professionellen Vorschlag für ein Anti-Waste-Rezept.\\n  Anweisungen:\\n  1. Verwenden Sie vorrangig Zutaten mit kurzem Haltbarkeitsdatum: ${expiringBatches.map(b=>`${b.name} (${b.quantity} ${b.unit}, läuft ab am ${b.expiration_date})`).join(", ")}.\\n  2. Kombinieren Sie sie mit Standardzutaten, um ein ausgewogenes Rezept zu kreieren.\\n  3. PFLICHTANGABE: Listen Sie mögliche Allergene auf.\\n\\n  Antworten Sie AUSSCHLIESSLICH als JSON auf DEUTSCH mit folgendem Format:\\n  {\\n    "menu_name": "Anti-Waste Proposal",\\n    "dishes": [\\n      {\\n        "name": "...",\\n        "ingredients": [{"name": "...", "quantite": 0, "unite": "g"}],\\n        "allergens": ["...", "..."],\\n        "preparation_steps": "..."\\n      }\\n    ]\\n  }'
  },
  { // 6: Voice Add to Cart / Intent
    startStr: 'CRITICAL DIRECTIVE: You are CLAUS.IO, an expert culinary assistant',
    deSub: 'RICHTLINIE: Du bist CLAUS.IO, ein kulinarischer Assistent. Du arbeitest AUF DEUTSCH.\\nBenutzer: "${message}"\\nWenn etwas zum Warenkorb hinzugefügt wird, JSON antworten:\\n{"intent":"add_to_cart","item":"name","quantity":1,"unit":"kg","response":"Nachricht"}\\nAndernfalls:\\n{"intent":"general_advice","response":"Antwort"}\\nNUR JSON.'
  },
  { // 7: Generate Prep Steps
    startStr: 'CRITICAL DIRECTIVE: You MUST respond entirely in ENGLISH',
    deSub: 'WICHTIGE RICHTLINIE: Sie müssen auf DEUTSCH antworten.\\n        Generieren Sie äußerst detaillierte Zubereitungsschritte für folgendes Rezept: ${recipe.name}.\\n        Zutaten: ${ingredients.map(i=>`${i.name} (${i.quantity_per_person}${i.unit})`).join(", ")}.\\n        Antworten Sie auf Deutsch NUR mit dem reinen Text der Zubereitungsschritte.'
  },
  { // 8: Documents Upload Extract
    startStr: 'Analyze this document (Invoice, Delivery Note, or Credit Note)',
    deSub: 'Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:\\n{\\n  "type": "FACTURE" | "BL" | "AVOIR",\\n  "supplier": "Name des Lieferanten",\\n  "date": "YYYY-MM-DD",\\n  "items": [\\n    {\\n      "item": "Name des Artikels",\\n      "quantity": 0,\\n      "unit": "kg, g, L, u, etc.",\\n      "unit_price": 0\\n    }\\n  ],\\n  "total_amount": 0\\n}\\nWICHTIG:\\n1. TYP-ERKENNUNG: \\n- Mit Preisen = FACTURE.\\n- Ohne Preise = BL.\\n- Gutschrift = AVOIR.\\n2. ARTIKEL: Jede Menge sehr präzise extrahieren.\\n3. ÜBERPRÜFUNG: Muss als JSON geantwortet werden.'
  },
  { // 9: Chat API Strict Prompt
    startStr: 'CRITICAL DIRECTIVE: You are an elite culinary AI assistant for professional chefs',
    deSub: 'WICHTIGE RICHTLINIE: Sie sind ein kulinarischer KI-Assistent der Eliteklasse für professionelle Köche. Sie MÜSSEN vollständig auf DEUTSCH antworten.\\n        Benutzernachricht: "${message}"'
  }
];

let resCount = 0;

for (let r of REPLACEMENTS) {
  let idx = code.indexOf(r.startStr);
  if (idx !== -1) {
    let beforeText = code.slice(Math.max(0, idx - 200), idx);
    let langMatch = r.isDlc ? "isEnForDlc" : (r.startStr.includes('Analyze this document') ? "isEn" : 'settings.language === "en"');
    
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
code = code.replace(/const isEsForDlc = settings\.language === "es";/g, 'const isEsForDlc = settings.language === "es";\\nconst isDeForDlc = settings.language === "de";');
code = code.replace(/const isEs = settings\.language === "es";/g, 'const isEs = settings.language === "es";\\nconst isDe = settings.language === "de";');

// Now system chat replacements
code = code.replace(
  'settings.language === "es"\\n              ? "Eres un asistente culinario profesional. Operas estrictamente en espa\\\\xF1ol."\\n              : settings.language === "en"',
  'settings.language === "es"\\n              ? "Eres un asistente culinario profesional. Operas estrictamente en espa\\\\xF1ol."\\n              : settings.language === "de" ? "Sie sind ein professioneller kulinarischer Assistent. Sie arbeiten streng auf Deutsch."\\n              : settings.language === "en"'
);

// Response error catch
code = code.replace(
  'settings.language === "es"\\n              ? "Lo siento Chef, estoy experimentando una dificultad t\\\\xE9cnica."\\n              : settings.language === "fr"',
  'settings.language === "es"\\n              ? "Lo siento Chef, estoy experimentando una dificultad t\\\\xE9cnica."\\n              : settings.language === "de" ? "Entschuldigung Chef, ich habe ein technisches Problem."\\n              : settings.language === "fr"'
);

fs.writeFileSync('server.ts', code, 'utf8');
console.log('Total replacements logic: ' + resCount);

