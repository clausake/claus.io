// Routes : Documents (factures/BL/avoirs, upload, extraction, validation)
import { Router } from "express";
import { uploadsDir } from "../services/paths.js";
import { settingsPath } from "../services/settings.js";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse, calculatePricePerRef, ExtractedDocumentData } from "../shared/util.js";
import { findMatchingInventoryItem } from "../shared/fuzzy.js";
import { upload } from "../shared/upload.js";
import { generateWithOllama, getModel, ollamaSettingsRef } from "../shared/ollama.js";

export default function createRouter(db: Database) {
  const router = Router();

router.get("/api/documents", async (req, res) => {
try {
  const documents = await db.all(
    "SELECT * FROM documents ORDER BY date DESC",
  );
  for (const doc of documents) {
    doc.items = await db.all(
      `
      SELECT di.*, COALESCE(i.name, di.original_name) as inventory_name, i.unit 
      FROM document_items di
      LEFT JOIN inventory i ON di.inventory_id = i.id
      WHERE di.document_id = ?
    `,
      [doc.id],
    );
  }
  res.json(documents);
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch documents" });
}
});
router.post("/api/documents", async (req, res) => {
try {
  const { id, type, supplier, date, total_amount, source_image_url, items } =
    req.body;
  
  const docId = id || Date.now().toString();

  // -- Deux defauts de cette branche, tous deux muets -------------------------
  //  1. Le tri se faisait sur `if (id)` et non sur « la ligne EXISTE ». Or la
  //     voie de creation manuelle (DocumentManager) envoie son propre `id` pour
  //     un document qui n'est pas encore en base : l'UPDATE ne toucait AUCUNE
  //     ligne, le document n'etait jamais cree — et la reponse rendait
  //     `id: <celui demande>`, donc le client croyait avoir cree quelque chose.
  //     Un PASS creux de bout en bout : 200, un id, rien en base.
  //  2. Les lignes etaient inserees avec `document_id = id` (donc NULL en
  //     creation, ou l'id demande) au lieu de `docId` : le detail se retrouvaient
  //     orphelins, invisibles au GET. Une factture sans lignes ne majore rien.
  // La presence reelle de la ligne decide donc, et les lignes partent sur docId.
  const existing: { id: string } | undefined = await db.get(
    "SELECT id FROM documents WHERE id = ?",
    [docId],
  );

  if (existing) {
    await db.run(
      "UPDATE documents SET type = ?, supplier = ?, date = ?, total_amount = ?, source_image_url = ?, status = 'PENDING' WHERE id = ?",
      [type, supplier, date, total_amount, source_image_url, docId]
    );
    // Delete all old items if any
    await db.run("DELETE FROM document_items WHERE document_id = ?", [docId]);
  } else {
    await db.run(
      "INSERT INTO documents (id, type, supplier, date, total_amount, source_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [docId, type, supplier, date, total_amount, source_image_url, "PENDING"],
    );
    await db.run("DELETE FROM document_items WHERE document_id = ?", [docId]);
  }
  
  for (const item of items) {
    await db.run(
      "INSERT INTO document_items (id, document_id, inventory_id, original_name, quantity, unit_price, lot_number, dlc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        Math.random().toString(36).substr(2, 9),
        docId,
        item.inventory_id || null,
        item.original_name || "",
        item.quantity,
        item.unit_price,
        item.lot_number,
        item.dlc,
      ],
    );
  }
  res.json({ status: "success", id });
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to save document" });
}
});
router.post("/api/documents/:id/validate", async (req, res) => {
try {
  const { id } = req.params;
  const doc = await db.get("SELECT * FROM documents WHERE id = ?", [id]);
  if (!doc)
    return res
      .status(404)
      .json({ status: "error", message: "Document not found" });

  // -- Deux gardes d'integrite du stock ------------------------------------
  // La validation est un MOUVEMENT DE STOCK (quantity = quantity + ...). Elle
  // doit donc etre idempotente et exclusive, sinon le stock part a la derive
  // sans qu'aucun ecran ne le montre :
  //
  //  1. UN SEUL PASSEAGE. Le garde d'avant etait absent : un double-clic sur
  //     « Valider » (ou un retry du reseau) additionnait la marchandise DEUX
  //     fois. Le statut passait a VALIDATED des le premier coup, donc le second
  //     ne rougissait nulle part — et le stock du client etait faux de 100 %.
  //  2. LES BONS DE COMMANDE NE SE VALIDENT PAS ICI. Un bon porte des quantites
  //     PREVUES et non recues : c'est la reception qui les met en stock. Sans
  //     cette exclusion, la voie Saisies (PDF) et la voie Documents se battaient
  //     le meme mouvement, et un bon valide par megarde puis receptionne
  //     additionnait deux fois. Le type est verifie contre la liste blanche au
  //     lieu d'une negation : un type inconnu (donnee heritee d'une vieille
  //     version) ne merite pas d'entrer en stock.
  const TYPES_VALISIBLES = ["FACTURE", "BL", "BON_LIVRAISON", "AVOIR"];
  const typeDoc = (doc.type || "").toUpperCase();
  if (!TYPES_VALISIBLES.includes(typeDoc)) {
    return res.status(409).json({
      status: "error",
      message:
        typeDoc === "COMMANDE"
          ? "Un bon de commande ne se valide pas : receptionnez-le (les quantites entrent en stock a la livraison)."
          : "Type de document non validationable : " + (doc.type || "(vide)"),
    });
  }
  if ((doc.status || "").toUpperCase() === "VALIDATED") {
    return res.status(409).json({
      status: "error",
      message: "Ce document est deja valide : le stock a deja ete majouré.",
      already_validated: true,
    });
  }

  let supplierId: string | null = null;
  if (doc.supplier && doc.supplier.trim()) {
    const normName = doc.supplier.trim();
    const existingSupp = await db.get("SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)", [normName]);
    if (existingSupp) {
      supplierId = existingSupp.id;
    } else {
      supplierId = Date.now().toString() + Math.random().toString().substring(2, 5);
      await db.run("INSERT INTO suppliers (id, name, email, phone, status) VALUES (?, ?, ?, ?, 'ACTIVE')", [
        supplierId,
        normName,
        "",
        ""
      ]);
    }
  }

  const items = await db.all(
    "SELECT * FROM document_items WHERE document_id = ?",
    [id],
  );
  for (const item of items) {
    if (!item.inventory_id) continue;
    const qtyChange =
      doc.type === "AVOIR"
        ? -Math.abs(item.quantity)
        : Math.abs(item.quantity);
    await db.run(
      "UPDATE inventory SET quantity = quantity + ?, unit_price = ?, lot_number = ?, dlc = ? WHERE id = ?",
      [
        qtyChange,
        item.unit_price,
        item.lot_number,
        item.dlc,
        item.inventory_id,
      ],
    );
    const invItem = await db.get(
      "SELECT quantity, minStock, unit FROM inventory WHERE id = ?",
      [item.inventory_id],
    );
    if (invItem) {
      let status = "ok";
      if (invItem.quantity <= 0) status = "critical";
      else if (invItem.quantity <= invItem.minStock) status = "low";
      await db.run("UPDATE inventory SET status = ? WHERE id = ?", [
        status,
        item.inventory_id,
      ]);

      // Save to supplier_prices if we have a valid supplier
      if (supplierId && item.unit_price !== null && item.unit_price !== undefined) {
        const purchaseUnit = invItem.unit || "kg";
        const calculated_price_per_ref = calculatePricePerRef(Number(item.unit_price), purchaseUnit, purchaseUnit);
        
        const existingPrice = await db.get("SELECT id FROM supplier_prices WHERE supplier_id = ? AND inventory_id = ?", [
          supplierId,
          item.inventory_id
        ]);
        
        if (existingPrice) {
          await db.run(
            "UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 1, valid_until = NULL WHERE id = ?",
            [Number(item.unit_price), purchaseUnit, calculated_price_per_ref, existingPrice.id]
          );
        } else {
          const priceId = Date.now().toString() + Math.random().toString().substring(2, 7);
          await db.run(
            "INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, 1)",
            [priceId, supplierId, item.inventory_id, Number(item.unit_price), purchaseUnit, calculated_price_per_ref]
          );
        }
      }
    }
  }
  await db.run("UPDATE documents SET status = 'VALIDATED' WHERE id = ?", [
    id,
  ]);
  res.json({ status: "success" });
} catch (error) {
  console.error(error);
  res.status(500).json({ status: "error", message: "Validation failed" });
}
});
router.post("/api/documents/upload", upload.single("file"), async (req, res) => {
try {
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, "utf8");
      ollamaSettingsRef.current = { ...ollamaSettingsRef.current, ...JSON.parse(data) };
    } catch (e) {}
  }
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file" });
  const docId = Math.random().toString(36).substr(2, 9);
  const ext = file.originalname.split(".").pop()?.toLowerCase();
  const filename = `${docId}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  const imageUrl = `/uploads/${filename}`;
  fs.writeFileSync(filepath, file.buffer);
  let imageBuffer: string | null = null;
  if (["jpg", "png", "jpeg", "webp"].includes(ext || "")) {
    imageBuffer = file.buffer.toString("base64");
  } else if (ext === "pdf") {
    console.log("[PDF-PARSE] Extraction du texte depuis PDF (upload)...");
    try {
      const pdfData = await pdfParse(file.buffer);
      // We attach the extracted text to req for later use in prompt
      // @ts-ignore
      req.pdfText = pdfData.text || " ";
      imageBuffer = null; // No image for Ollama
    } catch (e) {
      console.error("[ERROR] Impossible de parser le PDF.", e);
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      return res.status(400).json({ error: "La lecture du PDF a échoué: " + msg });
    }
  } else {
    return res
      .status(400)
      .json({ error: "Only images or PDFs are supported." });
  }
  
  const isDraft = req.query.draft === 'true';
  if (isDraft) {
    const id = Date.now().toString();
    await db.run(
      "INSERT INTO documents (id, type, supplier, date, total_amount, source_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, "A DEFINIR", "", "", 0, `/uploads/${filename}`, "DRAFT"]
    );
    return res.json({ status: "success", type: "draft", id, source_image_url: `/uploads/${filename}` });
  }

  const isEn = ollamaSettingsRef.current.language === "en";
  const isEs = ollamaSettingsRef.current.language === "es";
  const isDe = ollamaSettingsRef.current.language === "de";
  let promptText = isEs
    ? `Analiza este documento (Factura, Albar\xE1n o Abono) y extrae la siguiente informaci\xF3n en formato JSON:
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
- Si es una FACTURA, extrae TODOS los art\xEDculos presentes.
- Si es un Albar\xE1n sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ART\xCDCULOS: Para cada art\xEDculo, s\xE9 extremadamente preciso con la CANTIDAD y la UNIDAD. 
- Si ves "5 KG", quantity=5, unit="kg".
- Si ves "Peso neto: 2.5kg", quantity=2.5, unit="kg".
- Si ves "Paquete de 10", quantity=10, unit="unit".
- Si ves un precio por kilo, extrae la cantidad total facturada.
3. VERIFICACI\xD3N: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albar\xE1n ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`
    : ollamaSettingsRef.current.language === "de"
      ? `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
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
      : ollamaSettingsRef.current.language === "it"
        ? `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
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
      : isEn
        ? `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
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
        : `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
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
  const targetModel = getModel(ollamaSettingsRef.current);
  promptText += "\nYOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN ```json. DO NOT EXPLAIN.";
  
  // @ts-ignore
  if (req.pdfText) {
    // @ts-ignore
    promptText += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + req.pdfText;
  }
  
  const cleanResponseRaw = await generateWithOllama(promptText, imageBuffer, "json", 0.1);
  let cleanResponse = cleanResponseRaw || "{}";
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  
  try {
    const data = safeJsonParse(cleanResponse) as ExtractedDocumentData;
    if (imageUrl) {
      data.source_image_url = imageUrl;
    }
    const batchId = Math.random().toString(36).substr(2, 9);
    let inventoryId = 'UNKNOWN';
    const productName = data.product ? String(data.product) : 'Inconnu';
    const lotNumber = data.lot ? String(data.lot) : 'Inconnu';
    const dlcStr = data.dlc ? String(data.dlc) : 'Inconnu';

    const invItem = await findMatchingInventoryItem(db, productName);
    if (invItem) inventoryId = invItem.id;
    
    await db.run(
      'INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url) VALUES (?, ?, ?, ?, ?)',
      [batchId, inventoryId, lotNumber, dlcStr, imageUrl],
    );
    await db.run(
      'INSERT INTO traceability_labels (id, product_name, fabrication_date, dlc, allergens) VALUES (?, ?, ?, ?, ?)',
      [
        batchId,
        productName,
        new Date().toISOString().split('T')[0],
        dlcStr,
        JSON.stringify(data.allergens || []),
      ],
    );
    res.json(data);
  } catch (parseError) {
    console.error('[OLLAMA/DB/JSON] Processing failed. Error:', parseError, '\nRaw response:', cleanResponse);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors du traitement des données [${getModel(ollamaSettingsRef.current)}].`,
      errorDetails: parseError instanceof Error ? parseError.message : String(parseError)
    });
  }
} catch (error) {
  console.error("[OLLAMA] Erreur critique :", error);
  const errMsg = error instanceof Error ? error.message : "Erreur de connexion à l'IA.";
  res
    .status(500)
    .json({ status: "error", message: `Erreur d'extraction IA [${getModel(ollamaSettingsRef.current)}] : ${errMsg}` });
}
});

router.post("/api/documents/:id/extract", async (req, res) => {
try {
  const docId = req.params.id;
  const document = await db.get("SELECT * FROM documents WHERE id = ?", [docId]);
  if (!document) return res.status(404).json({ error: "Document non trouvé" });

  const filepath = path.join(uploadsDir, document.source_image_url.split('/uploads/')[1]);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "Fichier source introuvable" });
  }

  
  let imageBuffer: string | null = null;
  let pdfText = null;
  if (filepath.toLowerCase().endsWith('.pdf')) {
    console.log("[PDF-PARSE] Extraction temporelle (extract)...");
    try {
      const pdfData = await pdfParse(fs.readFileSync(filepath));
      pdfText = pdfData.text || " ";
    } catch (e) {
      console.error("[ERROR] extract pdf parse failed:", e);
      return res.status(400).json({ error: "Echec de lecture du fichier PDF existant." });
    }
  } else {
    imageBuffer = fs.readFileSync(filepath).toString("base64");
  }


  const isEn = ollamaSettingsRef.current.language === "en";
  const isEs = ollamaSettingsRef.current.language === "es";
  const isDe = ollamaSettingsRef.current.language === "de";
  let promptText = isEs
    ? `Analiza este documento (Factura, Albarán o Abono) y extrae la siguiente información en formato JSON:
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
- Si es una FACTURA, extrae TODOS los artículos presentes.
- Si es un Albarán sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ARTÍCULOS: Para cada artículo, sé extremadamente preciso con la CANTIDAD y la UNIDAD. 
3. VERIFICACIÓN: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albarán ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`
    : ollamaSettingsRef.current.language === "de"
      ? `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
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
      : ollamaSettingsRef.current.language === "it"
        ? `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
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
      : isEn
          ? `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
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
          : `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
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
  
  const targetModel = getModel(ollamaSettingsRef.current);
  promptText += "\nYOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN ```json. DO NOT EXPLAIN.";
  
  if (pdfText) {
    promptText += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + pdfText;
  }
  const cleanResponseRaw = await generateWithOllama(promptText, imageBuffer, "json", 0.1);
  let cleanResponse = cleanResponseRaw || "{}";
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    const data = safeJsonParse(cleanResponse) as ExtractedDocumentData;
    data.source_image_url = document.source_image_url;
    console.log("[OLLAMA] Données extraites depuis brouillon :", data);

    await db.run("UPDATE documents SET status = 'PENDING', type = ?, supplier = ?, date = ?, total_amount = ? WHERE id = ?", [
      data.type || "A DEFINIR",
      data.supplier || "",
      data.date || "",
      data.total_amount || 0,
      docId
    ]);
    
    res.json({ data, source_image_url: data.source_image_url });
  } catch (parseError) {
    console.error("[OLLAMA] Erreur de parsing JSON :", cleanResponse);
    res
      .status(500)
      .json({ status: "error", message: `L'IA a retourné un format JSON invalide : ${cleanResponse.substring(0, 200)}...` });
  }
} catch (e) {
  console.error(e);
  const errMsg = e instanceof Error ? e.message : "Erreur de connexion avec l'IA Ollama.";
  res.status(500).json({ status: "error", message: `L'extraction du brouillon a échoué [${getModel(ollamaSettingsRef.current)}] : ${errMsg}` });
}
});


  return router;
}
