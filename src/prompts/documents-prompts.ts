// T3.2 : extrait de src/routes/documents.ts (extraction pure, byte-exact).
// Les littéraux de prompts OCR multilingues (upload + extract) sont des chaînes
// statiques (mesuré : aucune interpolation « ${ » dans leur corps). Déplacés ici
// en constantes par langue, sur le modèle de src/prompts/menuPrompts.ts. Le
// sélecteur de langue (isEs/isEn/ollamaSettingsRef.current.language) RESTE dans
// la route : mêmes variables, même ordre -> comportement strictement identique.
// Aucun octet de texte de prompt modifié (chaque littéral copié tel quel).

// --- POST /api/documents/upload ---
export const DOCUMENT_UPLOAD_ES = `Analiza este documento (Factura, Albar\xE1n o Abono) y extrae la siguiente informaci\xF3n en formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nombre del proveedor",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nombre del art\xEDculo",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. DETECCI\xD3N DE TIPO: 
- Si ves una lista de art\xEDculos con precios y un TOTAL, es una FACTURA ("FACTURE").
- Si es una FACTURA, extrae la totalidad de los art\xEDculos presentes, sin omitir ninguno.
- Si es un Albar\xE1n sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ART\xCDCULOS: Para cada art\xEDculo, s\xE9 extremadamente preciso con la CANTIDAD y la UNIDAD. 
- Si ves "5 KG", quantity=5, unit="kg".
- Si ves "Peso neto: 2.5kg", quantity=2.5, unit="kg".
- Si ves "Paquete de 10", quantity=10, unit="unit".
- Si ves un precio por kilo, extrae la cantidad total facturada.
3. VERIFICACI\xD3N: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albar\xE1n ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`

export const DOCUMENT_UPLOAD_DE = `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
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

export const DOCUMENT_UPLOAD_IT = `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nome del fornitore",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nome dell'articolo",
  "quantity": 0,
  "unit": "kg, g, L, u, ecc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. RILEVAMENTO DEL TIPO: 
- Con prezzi e totale = FACTURE (Fattura).
- Senza prezzi = BL (DDT/Documento di Trasporto).
- Nota di Credito = AVOIR.
2. ARTICOLI: Estrai ogni quantità con molta precisione.
3. VERIFICA: DEVE rispondere come JSON.`

export const DOCUMENT_UPLOAD_EN = `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Supplier name",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Item name",
  "quantity": 0,
  "unit": "kg, g, L, unit, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT:
1. TYPE DETECTION: 
- If you see a list of items with prices and a TOTAL, it is an INVOICE ("FACTURE").
- If it is an INVOICE, extract ALL the items present.
- If it's a Delivery Note without prices, type is "BL".
- If it's a Credit Note, type is "AVOIR".
2. ITEMS: For each item, be extremely precise about QUANTITY and UNIT. 
- If you see "5 KG", quantity=5, unit="kg".
- If you see "Net weight: 2.5kg", quantity=2.5, unit="kg".
- If you see "Pack of 10", quantity=10, unit="unit".
- If you see a price per kilo, extract the total invoiced quantity.
3. VERIFICATION: A document with a supplier header and a VAT summary is obligatorily an INVOICE ("FACTURE") or Delivery Note ("BL"). MUST return JSON matching the schema precisely.`

export const DOCUMENT_UPLOAD_FR = `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nom du fournisseur",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nom de l'article",
  "quantity": 0,
  "unit": "kg, g, L, unit\xE9, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT :
1. D\xC9TECTION DU TYPE : 
- Si tu vois une liste d'articles avec des prix et un TOTAL, c'est une FACTURE.
- Si c'est une FACTURE, extrais TOUS les articles pr\xE9sents.
2. ARTICLES : Pour chaque article, sois extr\xEAmement pr\xE9cis sur la QUANTIT\xC9 et l'UNIT\xC9. 
- Si tu vois "5 KG", quantity=5, unit="kg".
- Si tu vois "Poids net: 2.5kg", quantity=2.5, unit="kg".
- Si tu vois "Colis de 10", quantity=10, unit="unit\xE9".
- Si tu vois un prix au kilo, extrais la quantit\xE9 totale factur\xE9e.
3. V\xC9RIFICATION : Un document avec un en-t\xEAte de fournisseur et un r\xE9capitulatif de TVA est obligatoirement une FACTURE ou un Bon de Livraison.
YOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN \`\`\`json. DO NOT EXPLAIN.`;

// --- POST /api/documents/:id/extract ---
export const DOCUMENT_EXTRACT_ES = `Analiza este documento (Factura, Albarán o Abono) y extrae la siguiente información en formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nombre del proveedor",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nombre del artículo",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. DETECCIÓN DE TIPO: 
- Si ves una lista de artículos con precios y un TOTAL, es una FACTURA ("FACTURE").
- Si es una FACTURA, extrae la totalidad de los artículos presentes, sin omitir ninguno.
- Si es un Albarán sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ARTÍCULOS: Para cada artículo, sé extremadamente preciso con la CANTIDAD y la UNIDAD. 
3. VERIFICACIÓN: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albarán ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`

export const DOCUMENT_EXTRACT_DE = `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
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

export const DOCUMENT_EXTRACT_IT = `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nome del fornitore",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nome dell'articolo",
  "quantity": 0,
  "unit": "kg, g, L, u, ecc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. RILEVAMENTO DEL TIPO: 
- Con prezzi e totale = FACTURE (Fattura).
- Senza prezzi = BL (DDT/Documento di Trasporto).
- Nota di Credito = AVOIR.
2. ARTICOLI: Estrai ogni quantità con molta precisione.
3. VERIFICA: DEVE rispondere come JSON.`

export const DOCUMENT_EXTRACT_EN = `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Supplier name",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Item name",
  "quantity": 0,
  "unit": "kg, g, L, unit, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT: 
- If you see a list of items with prices and a TOTAL, it is an INVOICE ("FACTURE"). MUST return JSON.`

export const DOCUMENT_EXTRACT_FR = `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nom du fournisseur",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nom de l'article",
  "quantity": 0,
  "unit": "kg, g, L, unité, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT :
1. DÉTECTION DU TYPE : 
- Si tu vois une liste d'articles avec des prix et un TOTAL, c'est une FACTURE.
- Si c'est une FACTURE, extrais TOUS les articles présents.
2. ARTICLES : Pour chaque article, sois extrêmement précis sur la QUANTITÉ et l'UNITÉ.
3. VÉRIFICATION : Un document avec un en-tête de fournisseur et un récapitulatif de TVA est obligatoirement une FACTURE ou un Bon de Livraison.
YOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE.`;
