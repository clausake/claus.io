const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const REPLACEMENTS = [
  { // 1: Creative Menu
    startStr: 'Act as a world-class Avant-Garde Executive Chef',
    deSub: 'SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandle als Avantgarde-Chefkoch. Erstelle ein kreatives 7-Tage-Menü.\\n${STANDARD_QUANTITIES_DE_PROMPT}\\nAntworte AUSSCHLIESSLICH IN JSON:'
  },
  { // 2: Traditional Menu
    startStr: 'Act as an Executive Chef of a cutting-edge Chic Bistro',
    deSub: 'SPRACHMANDAT: ANTWORT AUF DEUTSCH.\\n\\nHandle als Chefkoch eines schicken Bistros. Erstelle ein Wochenmenü.\\n1. ANGEBOTSANFORDERUNG: Erstelle ein KOMPLETTES Menü für 7 Tage (Montag bis Sonntag).\\n2. MENÜSTRUKTUR: Jeder Tag MUSS eine Vorspeise, ein Hauptgericht und ein Dessert enthalten. Insgesamt 21 Gerichte.\\n3. BISTRO CHIC PHILOSOPHIE: Biete raffinierte, moderne Gerichte an. Die Gerichternamen MÜSSEN POETISCH, DETAILLIERT UND LANG SEIN.\\n4. ABSOLUTE VIELFALT (KRITISCH): Das Menü muss 100% vielfältig sein. Es ist VERBOTEN, dasselbe Gericht oder dieselbe Zutat an mehreren Tagen vorzuschlagen.\\n5. SENSORISCHES GLEICHGEWICHT: Jedes Gericht MUSS eine Balance aus verschiedenen Texturen und Aromen bieten.\\n6. PFLICHTERKENNUNG: Führe alle Allergene für jedes Gericht auf.\\n7. ZUTATEN: Gib genaue Mengen (in g oder ml) an.\\n8. ZUBEREITUNGSSCHRITTE (KRITISH): MUSS extrem detailliert sein (MINIMUM 15 Sätze!).\\n9. ${STANDARD_QUANTITIES_DE_PROMPT}\\n\\nWICHTIG: DIE GANZE ANTWORT MUSS AUF DEUTSCH SEIN.\\nAntwort EXKLUSIV IN JSON mit dieser Struktur:\\n{"status": "success", "traditional_menu": [{"jour":"montag", "entree":{"nom":"...", "ingredients":[{"name":"[NAME]","quantite":"0","unite":"g"}], "allergens":[], "preparation_steps":"..."}, "plat":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."}, "dessert":{"nom":"...", "ingredients":[], "allergens":[], "preparation_steps":"..."} }]}\\n'
  },
  { // 3: Gastronomic Menu
    startStr: 'Act as a 3-Michelin-Starred Executive Chef specialized in Ultra-Fine Dining',
    deSub: '\\n      Handle als 3-Sterne-Michelin-Chefkoch, der auf Haute Cuisine spezialisiert ist. Erstelle 3 Weltklasse-Gastronomiemenüs.\\n      1. EXZELLENZ und 2. EDLE PRODUKTE.\\n      ${STANDARD_QUANTITIES_DE_PROMPT}\\n      Responde en JSON'
  }
];

let resCount = 0;

for (let r of REPLACEMENTS) {
  let idx = code.indexOf(r.startStr);
  if (idx !== -1) {
    let beforeText = code.slice(Math.max(0, idx - 200), idx);
    let langMatch = 'settings.language === "en"';
    
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

fs.writeFileSync('server.ts', code, 'utf8');
console.log('Total replacements logic: ' + resCount);

