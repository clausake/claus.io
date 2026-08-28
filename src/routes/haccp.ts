// Routes : HACCP (scan DLC, capteurs IoT, températures, documents, nettoyage, production, lots)
import { Router } from "express";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse, ExtractedDocumentData } from "../shared/util.js";
import { findMatchingInventoryItem } from "../shared/fuzzy.js";
import { upload } from "../shared/upload.js";
import { generateWithOllama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import { uploadsDir } from "../services/paths.js";
import { settingsPath } from "../services/settings.js";
import { requireString, optionalString } from "../middleware/validate.js";

export default function createRouter(db: Database) {
  const router = Router();

router.post("/api/haccp/scan", upload.single("image"), async (req, res) => {
console.log("[OLLAMA] Re\xE7u une demande de scan HACCP...");
try {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No image" });
  }
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, "utf8");
      ollamaSettingsRef.current = { ...ollamaSettingsRef.current, ...JSON.parse(data) };
    } catch (e) {}
  }
  
  let base64Image: string | null = null;
  let pdfText: string | null = null;
  let isImage = file.mimetype.startsWith("image/");
  const ext = file.originalname.split(".").pop()?.toLowerCase() || '';

  if (isImage) {
     base64Image = file.buffer.toString("base64");
  } else if (ext === 'pdf') {
     console.log("[PDF-PARSE] Extraction texte HACCP PDF...");
     try {
       const pdfData = await pdfParse(file.buffer);
       pdfText = pdfData.text || " ";
     } catch (e) {
       console.error("[ERROR] HACCP PDF parse failed:", e);
       return res.status(400).json({ error: "Echec de lecture du fichier HACCP PDF." });
     }
     isImage = false; // explicitly handle
  } else {
     base64Image = file.buffer.toString("base64"); // fallback
  }

  let imageUrl: string | null = null;
  if (isImage) {
    const ext = file.originalname.split(".").pop() || "jpg";
    const filename = "dlc_" + Date.now() + "." + ext;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, file.buffer);
    imageUrl = "/uploads/" + filename;
  }
  const targetModel = getModel(ollamaSettingsRef.current);
  const isEnForDlc = ollamaSettingsRef.current.language === "en";
  const isEsForDlc = ollamaSettingsRef.current.language === "es";
  const isDeForDlc = ollamaSettingsRef.current.language === "de";
  let dlcPrompt = isEsForDlc
    ? `Extrae informaci\xF3n de esta ETIQUETA DE TRAZABILIDAD DE PRODUCTO (HACCP) en formato JSON: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
    ADVERTENCIA: El JSON de salida DEBE usar la clave 'dlc' estrictamente para la Fecha de Caducidad. NO uses 'dgc' o cualquier otra clave.
    REQUISITO CR\xCDTICO: Encuentra espec\xEDficamente la informaci\xF3n de trazabilidad sanitaria (Fecha de Caducidad/DLC, Lote). 
    El formato de la fecha debe extraerse y estandarizarse a YYYY-MM-DD. 
    Encuentra el PESO o GRAMAJE (por ejemplo: 'Peso Neto: 250g' o '500 ml'). 
    - Si ves '500g', entones quantity=500, unit='g'.
    - Si ves '1 kg', entoces quantity=1, unit='kg'.
    NUNCA dejes quantity en 0 si un peso es visible.`
    : ollamaSettingsRef.current.language === "de"
      ? `Extrahieren Sie Informationen von diesem PRODUKTVERFOLGBARKEITSETIKETT (HACCP) im JSON-Format: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}.
WARNUNG: Der Ausgabe-JSON MUSS den Schlüssel 'dlc' für das Verfallsdatum verwenden. Keine anderen Schlüssel wie 'mhd' verwenden, nutze immer 'dlc' als Key im JSON.
KRITISCHE ANFORDERUNG: Extrahieren Sie spezifisch Gesundheitsrückverfolgbarkeit (Verfallsdatum / MHD, Charge / Los-Nr).
Das Datumsformat muss auf YYYY-MM-DD standardisiert werden.
Finden Sie das GEWICHT oder GRAMMATUR (zum Beispiel: 'Nettogewicht: 250g' oder '500 ml').
- Wenn Sie '500g' sehen, dann quantity=500, unit='g'.
- Wenn Sie '1 kg' sehen, dann quantity=1, unit='kg'.
Verlassen Sie die Menge NIEMALS bei 0, wenn das Gewicht sichtbar ist.`
      : ollamaSettingsRef.current.language === "it"
        ? `Estrai le informazioni da questa ETICHETTA DI TRACCIABILITÀ DEL PRODOTTO (HACCP) in formato JSON: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
    ATTENZIONE: Il JSON di output DEVE usare la chiave 'dlc' strettamente per la Data di Scadenza. NON usare altre chiavi.
    REQUISITO CRITICO: Trova specificamente le informazioni di tracciabilità sanitaria (Data di Scadenza/DLC, Lotto). 
    Il formato della data deve essere estratto e standardizzato come YYYY-MM-DD. 
    Trova il PESO o la GRAMMATURA (ad esempio: 'Peso Netto: 250g' o '500 ml'). 
    - Se vedi '500g', allora quantity=500, unit='g'.
    - Se vedi '1 kg', allora quantity=1, unit='kg'.
    NON lasciare MAI quantity a 0 se un peso è visibile.`
      : isEnForDlc
        ? `Extract information from this PRODUCT TRACEABILITY LABEL (HACCP) in JSON format: {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
    WARNING: The output JSON MUST use the key 'dlc' strictly for the Expiry Date. DO NOT use 'dgc' or any other key.
    CRITICAL REQUIREMENT: Specifically find the health traceability information (Expiry Date/DLC, Lot). 
    The date format should be extracted and standardized to YYYY-MM-DD. 
    Find the WEIGHT or GRAMMAGE (for example: 'Net Weight: 250g' or '500 ml'). 
    - If you see '500g', then quantity=500, unit='g'.
    - If you see '1 kg', then quantity=1, unit='kg'.
    NEVER leave quantity at 0 if a weight is visible.`
        : `Extraire les informations de cette \xC9TIQUETTE DE TRA\xC7ABILIT\xC9 PRODUIT (HACCP) en JSON : {"product":"string","lot":"string","dlc":"YYYY-MM-DD","allergens":["string"],"quantity":0,"unit":"string"}. 
    ATTENTION : La cl\xE9 JSON de sortie pour la date de p\xE9remption DOIT \xEAtre 'dlc'. N'utilise PAS 'dgc' ou toute autre cl\xE9.
    EXIGENCE CRITIQUE : Trouve sp\xE9cifiquement les informations de tra\xE7abilit\xE9 sanitaire (DLC, Lot). 
    Format de la date : Convertis la date vue sur l'\xE9tiquette (souvent DD-MM-YYYY) au format YYYY-MM-DD.
    Trouve le POIDS ou le GRAMMAGE (par exemple : 'Poids Net: 250g' ou '500 ml'). 
    - Si tu vois '500g', alors quantity=500, unit='g'.
    - Si tu vois '1 kg', alors quantity=1, unit='kg'.
    Ne laisse JAMAIS quantity \xE0 0 si un poids est visible.`;
  
  dlcPrompt += "\nYOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN ```json. DO NOT EXPLAIN.";
  
  if (pdfText) {
    dlcPrompt += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + pdfText;
  }
  const responseTextRaw = await generateWithOllama(dlcPrompt, base64Image, "json", 0.1);
  let responseText = responseTextRaw || "{}";
  let cleanResponse = responseText;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    const data = safeJsonParse(cleanResponse) as ExtractedDocumentData;
    if (imageUrl) {
      data.source_image_url = imageUrl;
    }
    const batchId = Math.random().toString(36).substr(2, 9);
    let inventoryId = "UNKNOWN";
    const productName = data.product ? String(data.product) : "Inconnu";
    const lotNumber = data.lot ? String(data.lot) : "Inconnu";
    const dlcStr = data.dlc ? String(data.dlc) : "Inconnu";
    
    const invItem = await findMatchingInventoryItem(db, productName);
    if (invItem) inventoryId = invItem.id;
    await db.run(
      "INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url) VALUES (?, ?, ?, ?, ?)",
      [batchId, inventoryId, lotNumber, dlcStr, imageUrl],
    );
    await db.run(
      "INSERT INTO traceability_labels (id, product_name, fabrication_date, dlc, allergens) VALUES (?, ?, ?, ?, ?)",
      [
        batchId,
        productName,
        new Date().toISOString().split("T")[0],
        dlcStr,
        JSON.stringify(data.allergens || []),
      ],
    );
    res.json(data);
  } catch (parseError) {
    console.error("[OLLAMA] Parsing failed. Raw response:", responseText, parseError);
    res.status(500).json({
      status: "error",
      message: `Format JSON invalide retourn\xE9 par l'IA [${getModel(ollamaSettingsRef.current)}] - ou Erreur Interne: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    });
  }
} catch (error) {
  const errMsg = error instanceof Error ? error.message : "Erreur system";
  res.status(500).json({ status: "error", message: `Erreur d'Ollama [${getModel(ollamaSettingsRef.current)}]: ${errMsg}` });
}
});

router.get("/api/haccp/iot-sensors", async (req, res) => {
try {
  const list = await db.all("SELECT * FROM iot_sensors");
  // Map properties for UI consistency
  const mapped = list.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    equipment_type: s.equipment_type,
    battery: s.battery || 100,
    temperature: s.last_reading !== null ? s.last_reading : 20.0,
    last_reading_at: s.last_reading_at,
    webhook_token: s.webhook_token
  }));
  res.json(mapped);
} catch (err) {
  res.status(500).json({ error: "Failed to load registered IoT sensors" });
}
});

router.post("/api/haccp/iot-sensors", async (req, res) => {
try {
  const { id, name, type, equipment_type } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: "ID and Name are required" });
  }
  const token = "token_" + Math.random().toString(36).substring(2, 8);
  await db.run(
    "INSERT INTO iot_sensors (id, name, type, equipment_type, battery, last_reading, last_reading_at, webhook_token) VALUES (?, ?, ?, ?, 100, 20.0, ?, ?)",
    [id, name, type || "ambient", equipment_type || "Froid", new Date().toISOString(), token]
  );
  res.json({ status: "success", token });
} catch (err) {
  res.status(500).json({ error: "Failed to register sensor. May already exist." });
}
});

router.delete("/api/haccp/iot-sensors/:id", async (req, res) => {
try {
  await db.run("DELETE FROM iot_sensors WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (err) {
  res.status(500).json({ error: "Failed to delete sensor" });
}
});

router.post("/api/haccp/webhook/iot-report", async (req, res) => {
const { id, token, temperature, battery } = req.body;
try {
  const sensor = await db.get("SELECT * FROM iot_sensors WHERE id = ?", [id]);
  if (!sensor) {
    return res.status(404).json({ error: "Sensor not found in registry." });
  }
  if (token && sensor.webhook_token && sensor.webhook_token !== token) {
    return res.status(403).json({ error: "Invalid token" });
  }
  const tempVal = parseFloat(temperature);
  if (isNaN(tempVal)) {
    return res.status(400).json({ error: "Invalid temperature format" });
  }
  const batVal = battery !== undefined ? parseInt(battery, 10) : (sensor.battery || 100);
  const now = new Date().toISOString();

  await db.run(
    "UPDATE iot_sensors SET last_reading = ?, last_reading_at = ?, battery = ? WHERE id = ?",
    [tempVal, now, batVal, id]
  );

  const logId = Math.random().toString(36).substring(2, 11);
  await db.run(
    "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode, sensor_id) VALUES (?, ?, ?, ?, ?, 'iot', 'online', ?)",
    [logId, `[IoT] ${sensor.name}`, tempVal, "CAPTEUR IoT Webhook", now, id]
  );

  res.json({ status: "success", message: `Data compiled for ${sensor.name}. Log logged to HACCP table.`, temperature: tempVal });
} catch (err) {
  console.error("Webhook ingestion error:", err);
  res.status(500).json({ error: "Server database error" });
}
});

router.post("/api/haccp/temperature", async (req, res) => {
try {
  const { equipment_name, temperature, user, recorded_at, entry_type, sensor_mode } = req.body;
  const id = Math.random().toString(36).substr(2, 9);
  const timestamp = recorded_at || new Date().toISOString();
  await db.run(
    "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, equipment_name, temperature, user || 'SYSTÈME', timestamp, entry_type || 'manuel', sensor_mode || 'online'],
  );
  res.json({ status: "success" });
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to log temperature" });
}
});

router.get("/api/haccp/documents", async (req, res) => {
try {
  const docs = await db.all(
    "SELECT * FROM haccp_documents ORDER BY date DESC",
  );
  res.json(docs);
} catch (e) {
  console.error(e);
  res.status(500).json({ error: "DB error" });
}
});
router.post("/api/haccp/documents/upload",
upload.single("file"),
async (req, res) => {
  try {
    const type = req.body.type || "AUTRE";
    const name = req.body.name || "Document Scann\xE9";
    let fileUrl: string | null = null;
    if (req.file) {
      const docId = Math.random().toString(36).substr(2, 9);
      const ext = req.file.originalname.split(".").pop()?.toLowerCase();
      const filename = `haccp_${docId}.${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, req.file.buffer);
      fileUrl = `/uploads/${filename}`;
    }
    const id =
      Date.now().toString() + Math.random().toString(36).substring(2);
    await db.run(
      "INSERT INTO haccp_documents (id, type, name, file_url) VALUES (?, ?, ?, ?)",
      [id, type, name, fileUrl],
    );
    res.json({ id, type, name, fileUrl, date: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload error" });
  }
},
);
router.post("/api/haccp/documents", async (req, res) => {
try {
  const type = optionalString(req, "type", 100) || "AUTRE";
  const name = optionalString(req, "name", 200) || "Document";
  const fileUrl = optionalString(req, "file_url", 500) || null;
  const id =
    Date.now().toString() + Math.random().toString(36).substring(2);
  await db.run(
    "INSERT INTO haccp_documents (id, type, name, file_url) VALUES (?, ?, ?, ?)",
    [id, type, name, fileUrl],
  );
  res.json({ status: "success", id });
} catch (error) {
  console.error(error);
  res.status(500).json({ error: "Insert error" });
}
});
router.delete("/api/haccp/documents/:id", async (req, res) => {
try {
  await db.run("DELETE FROM haccp_documents WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (e) {
  res.status(500).json({ error: "DB error" });
}
});
router.post("/api/haccp/cleaning", async (req, res) => {
try {
  const { zone_name } = req.body;
  await db.run(
    "INSERT INTO cleaning_records (id, zone_name, completed_by) VALUES (?, ?, ?)",
    [Date.now().toString(), zone_name, "SYSTÈME"],
  );
  res.json({ status: "success" });
} catch (error) {
  res.status(500).json({ error: "Failed to save record" });
}
});
router.get("/api/haccp/cleaning", async (req, res) => {
try {
  const records = await db.all(
    "SELECT * FROM cleaning_records ORDER BY completed_at DESC",
  );
  res.json(records);
} catch (error) {
  res.status(500).json({ error: "Failed to load records" });
}
});
router.post("/api/haccp/production", async (req, res) => {
try {
  const { recipe_id, batch_ids } = req.body;
  const productionId = Date.now().toString();
  await db.run(
    "INSERT INTO production_records (id, recipe_id) VALUES (?, ?)",
    [productionId, recipe_id],
  );
  for (const batchId of batch_ids) {
    await db.run(
      "INSERT INTO production_batches (production_id, batch_id) VALUES (?, ?)",
      [productionId, batchId],
    );
  }
  res.json({ status: "success", productionId });
} catch (error) {
  res.status(500).json({ error: "Failed to record production" });
}
});
router.get("/api/haccp/production-history", async (req, res) => {
try {
  const history = await db.all(`
    SELECT pr.id, r.name as recipe_name, pr.created_at, GROUP_CONCAT(b.lot_number) as batches
    FROM production_records pr
    JOIN recipes r ON pr.recipe_id = r.id
    LEFT JOIN production_batches pb ON pr.id = pb.production_id
    LEFT JOIN batches b ON pb.batch_id = b.id
    GROUP BY pr.id
    ORDER BY pr.created_at DESC
  `);
  res.json(history);
} catch (error) {
  res.status(500).json({ error: "Failed to load production history" });
}
});
router.post("/api/haccp/batches", async (req, res) => {
try {
  const {
    inventory_id,
    lot_number,
    expiration_date,
    source_image_url,
    quantity,
    unit,
    reception_temp,
    packaging_ok,
  } = req.body;
  await db.run(
    "INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url, quantity, unit, reception_temp, packaging_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      Date.now().toString(),
      inventory_id,
      lot_number,
      expiration_date,
      source_image_url || null,
      quantity || 0,
      unit || "",
      reception_temp || null,
      packaging_ok ? 1 : 0,
    ],
  );
  res.json({ status: "success" });
} catch (error) {
  console.error("Save batch error:", error);
  res.status(500).json({ error: "Failed to save batch" });
}
});
router.get("/api/haccp/batches", async (req, res) => {
try {
  const batches = await db.all(`
    SELECT b.*, i.name as product_name 
    FROM batches b 
    JOIN inventory i ON b.inventory_id = i.id
  `);
  res.json(batches);
} catch (error) {
  res.status(500).json({ error: "Failed to load batches" });
}
});
router.post("/api/haccp/corrective-action", async (req, res) => {
try {
  const { log_id, action_taken } = req.body;
  await db.run(
    "INSERT INTO corrective_actions (id, log_id, action_taken) VALUES (?, ?, ?)",
    [Date.now().toString(), log_id, action_taken],
  );
  res.json({ status: "success" });
} catch (error) {
  res.status(500).json({ error: "Failed to save corrective action" });
}
});
router.get("/api/haccp/temperatures", async (req, res) => {
try {
  const logs = await db.all(
    "SELECT * FROM temperature_logs ORDER BY recorded_at DESC LIMIT 50",
  );
  res.json(logs);
} catch (error) {
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch temperature logs" });
}
});

  return router;
}
