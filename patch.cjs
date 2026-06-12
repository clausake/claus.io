const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add German and Italian quantity prompt constants
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
        - PESCE: Filetti (145g), Calamari e simili (200g), Frutti di mare (100g).
        - CARNE: Punta di petto di manzo (180g), Entrecôte (180g), Carne macinata (145g), Manzo, vitello, maiale, tacchino, pollo saltati (220g), Anatra saltata (280g), Arrosto di manzo, tacchino, vitello, maiale, agnello (180g).
        - CONTORNI: Verdure FRESCHE di mercato (250g), Lenticchie (125g), Patatine fritte e altre patate (250g), Polenta (60g), Quinoa (250g), Ebly/Grano (125g).
        - ALTRO: Pesto (80g).
  \`;
`;

code = code.replace(
  'const STANDARD_QUANTITIES_ENG_PROMPT = `',
  IT_QUANTITY + DE_QUANTITY + 'const STANDARD_QUANTITIES_ENG_PROMPT = `'
);

// Helper for langName checks
function insertLangName(code) {
  return code.replace(
    /settings\.language === "es"\s*\?\s*"Spanish"\s*:\s*"English"/g,
    'settings.language === "es"\n              ? "Spanish"\n              : settings.language === "de" ? "German" : "English"'
  ).replace(
    /settings\.language === "es"\s*\?\s*"Espa\\xF1ol"\s*:\s*"English"/g,
    'settings.language === "es"\n              ? "Espa\\xF1ol"\n              : settings.language === "de" ? "Deutsch" : "English"'
  ).replace(
    /settings\.language === "es"\s*\?\s*"SPANISH"\s*:\s*"ENGLISH"/g,
    'settings.language === "es"\n              ? "SPANISH"\n              : settings.language === "de" ? "GERMAN" : "ENGLISH"'
  );
}
code = insertLangName(code);

// Now manual prompt replacements
const replacements = [
  // 1. Analyze Menu (IT -> ES -> DE -> EN -> FR)
  {
    find: /settings\.language === "es"\s*\?\s*`Analiza este men\\xFA y extrae las fichas[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`Analysiere dieses Menü und extrahiere die Datenblätter in Einzelteilen.
MANDAT DE SPRACHE: ANTWORT AUF DEUTSCH.
Anweisungen:
1. Identifiziere jedes Rezept.
2. Pflichterkennung: Liste der Allergene.
3. Zutaten extrahieren.
4. Ausführliche Anweisungen.
\${STANDARD_QUANTITIES_DE_PROMPT}
ANTSWORTE AUSSCHLIESSLICH IN JSON:\`
      : settings.language === "en"`
    )
  },
  // 2. Creative Menu
  {
    find: /settings\.language === "es"\s*\?\s*`MANDATO DE IDIOMA: RESPUESTA EN ESPA\\xD1OL[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`SPRACHMANDAT: ANTWORT AUF DEUTSCH.

Handle als Avantgarde-Chefkoch. Erstelle ein kreatives 7-Tage-Menü.
\${STANDARD_QUANTITIES_DE_PROMPT}
Antworte AUSSCHLIESSLICH IN JSON:\`
                : settings.language === "en"`
    )
  },
  // 3. Traditional Menu
  {
    find: /settings\.language === "es"\s*\?\s*`MANDATO DE IDIOMA: RESPUESTA EN ESPA\\xD1OL\.[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`SPRACHMANDAT: ANTWORT AUF DEUTSCH.

Handle als Chefkoch eines schicken Bistros. Erstelle ein Wochenmenü.
1. ANGEBOTSANFORDERUNG: Erstelle ein KOMPLETTES Menü für 7 Tage (Montag bis Sonntag).
2. MENÜSTRUKTUR: Jeder Tag MUSS eine Vorspeise, ein Hauptgericht und ein Dessert enthalten. Insgesamt 21 Gerichte.
3. BISTRO CHIC PHILOSOPHIE: Biete raffinierte, moderne Gerichte an. Die Gerichternamen ('nom') MÜSSEN POETISCH, DETAILLIERT UND LANG SEIN.
4. ABSOLUTE VIELFALT (KRITISCH): Das Menü muss 100% vielfältig sein. Es ist VERBOTEN, dasselbe Gericht oder dieselbe Zutat an mehreren Tagen vorzuschlagen.
5. SENSORISCHES GLEICHGEWICHT: Jedes Gericht MUSS eine Balance aus verschiedenen Texturen und Aromen bieten.
6. PFLICHTERKENNUNG: Führe alle Allergene für jedes Gericht auf.
7. ZUTATEN: Gib genaue Mengen (in g oder ml) an.
8. ZUBEREITUNGSSCHRITTE (KRITISH): MUSS extrem detailliert sein (MINIMUM 15 Sätze!).
9. \${STANDARD_QUANTITIES_DE_PROMPT}

WICHTIG: DIE GANZE ANTWORT MUSS AUF DEUTSCH SEIN.
Antwort EXKLUSIV IN JSON mit dieser Struktur:
{"status": "success", "traditional_menu": [{"jour":"montag", "entree":{"nom":"...", "ingredients":[{"name":"[NAME]","quantite":"0","unite":"g"}], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "dessert":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."} }]}
\`
              : settings.language === "en"`
    )
  },
  // 4. Gastronomic Menu
  {
    find: /settings\.language === "es"\s*\?\s*`[\s\S]*?Responde en JSON`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`
      Handle als 3-Sterne-Michelin-Chefkoch, der auf Haute Cuisine spezialisiert ist. Erstelle 3 Weltklasse-Gastronomiemenüs.
      1. EXZELLENZ und 2. EDLE PRODUKTE.
      \${STANDARD_QUANTITIES_DE_PROMPT}
      Antwort in JSON\`
              : settings.language === "en"`
    )
  },
  // 5. HACCP Scan Logic
  {
    find: /const isEsForDlc = settings\.language === "es";/g,
    replace: () => `const isEsForDlc = settings.language === "es";
      const isDeForDlc = settings.language === "de";`
  },
  {
    find: /const dlcPrompt = isEsForDlc\s*\?\s*`Extrae informaci\\xF3n[^`]*`\s*:\s*isEnForDlc/g,
    replace: (match) => match.replace(
      ': isEnForDlc',
      `: isDeForDlc ? \`Extrahieren Sie Informationen von diesem PRODUKTVERFOLGBARKEITSETIKETT (HACCP) im JSON-Format: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
        WARNUNG: Der Ausgabe-JSON MUSS den Schlüssel 'dlc' für das Verfallsdatum verwenden.
        KRITISCHE ANFORDERUNG: Extrahieren Sie spezifisch Gesundheitsrückverfolgbarkeit (Verfallsdatum/DLC, Charge).
        Finden Sie das GEWICHT oder GRAMMATUR.
        Verlassen Sie die Menge NIEMALS bei 0, wenn das Gewicht sichtbar ist.\`
        : isEnForDlc`
    )
  },
  // 6. Anti Waste Generate
  {
    find: /settings\.language === "es"\s*\?\s*`Genera una propuesta creativa[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`Erstelle einen kreativen und professionellen Vorschlag für ein Anti-Waste-Rezept.
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
  }\`
  : settings.language === "en"`
    )
  },
  // 7. Voice / Chat Cart
  {
    find: /settings\.language === "es"\s*\?\s*`DIRECTIVA: Eres CLAUS\.IO[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`RICHTLINIE: Du bist CLAUS.IO, ein kulinarischer Assistent. Du arbeitest AUF DEUTSCH.
Benutzer: "\${message}"
Wenn etwas zum Warenkorb hinzugefügt wird, JSON antworten:
{"intent":"add_to_cart","item":"name","quantity":1,"unit":"kg","response":"Nachricht"}
Andernfalls:
{"intent":"general_advice","response":"Antwort"}
NUR JSON.\`
              : settings.language === "en"`
    )
  },
  // 8. Chat System prompt
  {
    find: /system:\s*settings\.language === "es"\s*\?\s*"Eres un asistente culinario profesional[^"]*"\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? "Sie sind ein professioneller kulinarischer Assistent. Sie arbeiten streng auf Deutsch."
          : settings.language === "en"`
    )
  },
  // 9. Generate Steps
  {
    find: /settings\.language === "es"\s*\?\s*`DIRECTIVA CR\\xCDTICA: Debes responder en ESPA\\xD1OL\.[^`]*`\s*:\s*settings\.language === "en"/g,
    replace: (match) => match.replace(
      ': settings.language === "en"',
      `: settings.language === "de" ? \`WICHTIGE RICHTLINIE: Sie müssen auf DEUTSCH antworten.
        Generieren Sie äußerst detaillierte Zubereitungsschritte für folgendes Rezept: \${recipe.name}.
        Zutaten: \${ingredients.map(i=>\`\${i.name} (\${i.quantity_per_person}\${i.unit})\`).join(", ")}.
        Antworten Sie auf Deutsch NUR mit dem reinen Text der Zubereitungsschritte.\`
        : settings.language === "en"`
    )
  },
  // 10. Documents Upload
  {
    find: /const promptText = isEs\s*\?\s*`Analiza este documento[^`]*`\s*:\s*isEn/g,
    replace: (match) => match.replace(
      ': isEn',
      `: settings.language === "de" ? \`Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
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
3. ÜBERPRÜFUNG: Muss als JSON geantwortet werden.\`
: isEn`
    )
  },
  // 11. Error messages
  {
    find: /response:\s*settings\.language === "es"\s*\?\s*"Lo siento Chef, estoy experimentando una dificultad t\\xE9cnica\."\s*:\s*settings\.language === "fr"/g,
    replace: (match) => match.replace(
      ': settings.language === "fr"',
      `: settings.language === "de" ? "Entschuldigung Chef, ich habe ein technisches Problem."
                : settings.language === "fr"`
    )
  }
];

let dirty = false;
replacements.forEach(({find, replace}, i) => {
  if (find.test(code)) {
    code = code.replace(find, replace);
    console.log('Applied replacement ' + i);
    dirty = true;
  } else {
    console.log('FAILED replacement ' + i);
  }
});

fs.writeFileSync('server.ts', code, 'utf8');
