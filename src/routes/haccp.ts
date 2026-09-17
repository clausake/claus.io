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
import { sensorHub } from "../services/sensor-hub.js";
import {
  TEMPERATURE_MIN, TEMPERATURE_MAX, RECEPTION_TEMP_MIN, RECEPTION_TEMP_MAX,
  QUANTITE_LOT_MAX, TYPES_CAPTEUR, TYPES_EQUIPEMENT, TYPES_ENTREE, MODES_CAPTEUR,
  ID_CAPTEUR_MAX, ID_CAPTEUR_MIN,
  estRejete, nombreDeReleve, clefEtrangere, dateISO, clefEnum,
  newToken, nouvelId, maintenantISO,
  lireNombre, lireTexte, estNombreExploitable, COLONNE_TEXTE_MAX,
} from "../shared/haccp-fields.js";

// Le timer de maintenance du flux SSE est module-level : createRouter() est
// appele une fois par demarrage, mais les tests le reinstancient; une variable
// locale ne empecherait pas l'accumulation de timers.
let sensorStreamTimer: NodeJS.Timeout | undefined;

export default function createRouter(db: Database) {
  const router = Router();

  // Maintenance du flux SSE : heartbeat (traverse les proxies sans devenir un
  // evenement) + recherche des capteurs qui n'emettent plus. C'est L'ALERTE
  // HACCP : un capteur a pile morte doit etre visible comme "muet", sinon son
  // absence de mesure est indiscernable d'une chambre froide conforme le jour
  // d'un controle. Garde idempotente (createRouter peut etre rappele par les
  // tests) et unref() pour qu'aucun timer ne retient le process en vie.
  if (!sensorStreamTimer) {
    const STALE_AFTER_S = 120;
    sensorStreamTimer = setInterval(async () => {
      if (sensorHub.size() === 0) return; // personne a ecouter : pas de scan base
      sensorHub.heartbeat();
      try {
        const rows = await db.all(
          "SELECT id, name, last_reading_at FROM iot_sensors WHERE last_reading_at IS NOT NULL",
        );
        const nowMs = Date.now();
        const stale = rows
          .map((s: any) => {
            const t = Date.parse(s.last_reading_at);
            if (Number.isNaN(t)) return null;
            const silence_seconds = Math.round((nowMs - t) / 1000);
            return silence_seconds > STALE_AFTER_S
              ? { id: s.id, name: s.name, last_reading_at: s.last_reading_at, silence_seconds }
              : null;
          })
          .filter((x: any): x is any => x !== null);
        sensorHub.publishStale(stale);
      } catch (err) {
        console.error("[SSE] scan capteurs muets:", err);
      }
    }, 25_000);
    sensorStreamTimer.unref?.();
  }

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

// Flux SSE des capteurs : le client s'enregistre une fois et recoit chaque
// releve poussee par le webhook. Le budget "read" du rate-limit est deja
// consacre, et une connexion longue compte comme une seule requete.
router.get("/api/sensors/stream", (req, res) => {
  try {
    sensorHub.attach(req, res);
  } catch (err) {
    console.error("SSE attach error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Stream unavailable" });
    else res.end();
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

// SPRINT-11 h1 — enregistrement d'un capteur IoT.
// L'ancien corps acceptait un id ' ', un nom vide, n'importe quel type/equipement
// (la liste deroulante de l'UI etait la seule regle), et generait le jeton de
// webhook avec Math.random().toString(36).substring(2, 8) : 32 bits d'entropie,
// PRNG previsible. Le jeton protege l'ingestion : une releve de 4 degres ecrite
// depuis un autre poste du reseau est une piece d'audit fausse.
router.post("/api/haccp/iot-sensors", async (req, res) => {
  try {
    const { id, name, type, equipment_type } = req.body;
    const refus: string[] = [];
    const capteurId = clefEtrangere(id, ID_CAPTEUR_MAX);
    if (capteurId === undefined || capteurId.length < ID_CAPTEUR_MIN) refus.push("id");
    const nom = lireTexte(name, 200);
    if (nom === undefined) refus.push("name");
    const typ = clefEnum(type, TYPES_CAPTEUR, "ambient");
    if (typ === undefined) refus.push("type");
    const eqt = clefEnum(equipment_type, TYPES_EQUIPEMENT, "Froid");
    if (eqt === undefined) refus.push("equipment_type");
    if (refus.length) return res.status(400).json(estRejete(refus));
    const dejaLa = await db.get("SELECT id FROM iot_sensors WHERE id = ?", [capteurId]);
    if (dejaLa) {
      return res.status(409).json({ error: `Capteur « ${capteurId} » deja enregistre.` });
    }
    const token = newToken();
    await db.run(
      "INSERT INTO iot_sensors (id, name, type, equipment_type, battery, last_reading, last_reading_at, webhook_token) VALUES (?, ?, ?, ?, 100, 20.0, ?, ?)",
      [capteurId, nom, typ, eqt, maintenantISO(), token]
    );
    res.json({ status: "success", token });
    // Un onglet HACCP deja ouvert doit voir le capteur sans rafraichissement.
    try {
      const list = await db.all("SELECT * FROM iot_sensors");
      sensorHub.publishList(list.map((s: any) => ({
        id: s.id, name: s.name, type: s.type, equipment_type: s.equipment_type,
        temperature: s.last_reading ?? 20.0, battery: s.battery ?? 100,
        last_reading_at: s.last_reading_at,
      })));
    } catch (pushErr) {
      console.error("[SSE] diffusion liste ignoree:", pushErr);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to register sensor." });
  }
});

router.delete("/api/haccp/iot-sensors/:id", async (req, res) => {
try {
  await db.run("DELETE FROM iot_sensors WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
  // Le tableau de bord doit retirer la ligne sans attendre un rafraichissement.
  try {
    sensorHub.publishList(
      (await db.all("SELECT * FROM iot_sensors")).map((s: any) => ({
        id: s.id, name: s.name, type: s.type, equipment_type: s.equipment_type,
        temperature: s.last_reading ?? 20.0, battery: s.battery ?? 100,
        last_reading_at: s.last_reading_at,
      })),
    );
  } catch (pushErr) {
    console.error("[SSE] diffusion liste ignoree:", pushErr);
  }
} catch (err) {
  res.status(500).json({ error: "Failed to delete sensor" });
}
});

// SPRINT-11 h2 — ingestion des releves de capteur.
// L'ancien corps faisait `if (token && sensor.webhook_token && ...)` : un poste
// du reseau qui omettait le jeton postait DONC en silence (le predicat court
// n'entrait jamais). Et le nombre passe par parseFloat nu : 'abc' etait refuse
// (bien) mais le NaN serialise par l'UI arrivait deja converti, et une valeur
// hors plage physique (-400 degres) entrait dans le registre.
router.post("/api/haccp/webhook/iot-report", async (req, res) => {
  const { id, token, temperature, battery } = req.body;
  try {
    if (typeof token !== "string" || token.trim() === "") {
      return res.status(403).json({ error: "Jeton de webhook requis." });
    }
    const capteurId = clefEtrangere(id);
    if (capteurId === undefined) return res.status(400).json(estRejete(["id"]));
    const sensor = await db.get("SELECT * FROM iot_sensors WHERE id = ?", [capteurId]);
    if (!sensor) {
      return res.status(404).json({ error: "Sensor not found in registry." });
    }
    if (!sensor.webhook_token || sensor.webhook_token !== token.trim()) {
      return res.status(403).json({ error: "Invalid token" });
    }
    const tempVal = nombreDeReleve(temperature, TEMPERATURE_MIN, TEMPERATURE_MAX);
    if (tempVal === undefined) return res.status(400).json(estRejete(["temperature"]));
    let batVal: number = sensor.battery ?? 100;
    if (battery !== undefined && battery !== null) {
      const b = lireNombre(battery);
      if (!estNombreExploitable(b, 0, 100)) return res.status(400).json(estRejete(["battery"]));
      batVal = Math.round(b);
    }
    const now = maintenantISO();
    await db.run(
      "UPDATE iot_sensors SET last_reading = ?, last_reading_at = ?, battery = ? WHERE id = ?",
      [tempVal, now, batVal, capteurId]
    );
    const logId = nouvelId();
    await db.run(
      "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode, sensor_id) VALUES (?, ?, ?, ?, ?, 'iot', 'online', ?)",
      [logId, `[IoT] ${sensor.name}`, tempVal, "CAPTEUR IoT Webhook", now, capteurId]
    );
    // L'echec de diffusion ne doit jamais faire echouer l'ingestion : la releve
    // HACCP est deja en base, conforme.
    try {
      sensorHub.publishReading({
        id: capteurId,
        name: sensor.name,
        type: sensor.type,
        equipment_type: sensor.equipment_type,
        temperature: tempVal,
        battery: batVal,
        last_reading_at: now,
      });
    } catch (pushErr) {
      console.error("[SSE] diffusion capteur ignoree:", pushErr);
    }
    res.json({ status: "success", message: `Data compiled for ${sensor.name}.`, temperature: tempVal });
  } catch (err) {
    console.error("Webhook ingestion error:", err);
    res.status(500).json({ error: "Server database error" });
  }
});

// SPRINT-11 h3 — releve de temperature SAISIE PAR LE CHEF. Piece d'audit
// reglementaire (regl. (CE) n°852/2004 art. 5). L'ancien corps n'avait AUCUN
// controle: 'temperature: "vingt degres"' passait dans la colonne REAL
// (affinite SQLite), le champ blanc que l'UI serialise NaN arrivait deja en
// `null` (JSON.stringify(NaN) rend null) et s'inscrivait comme releve absente.
// entry_type/sensor_mode etaient controlables par le client: une saisie manuelle
// signee 'iot' aurait fait passer une frappe de clavier pour une trace machine.
router.post("/api/haccp/temperature", async (req, res) => {
  try {
    const { equipment_name, temperature, user, recorded_at,
      entry_type, sensor_mode } = req.body;
    const refus: string[] = [];
    const equipement = lireTexte(equipment_name, 200);
    if (equipement === undefined) refus.push("equipment_name");
    const releve = nombreDeReleve(temperature, TEMPERATURE_MIN, TEMPERATURE_MAX);
    if (releve === undefined) refus.push("temperature");
    let instant = maintenantISO();
    if (recorded_at !== undefined && recorded_at !== null) {
      const iso = dateISO(recorded_at);
      if (iso === undefined) refus.push("recorded_at"); else instant = iso;
    }
    // PROVENANCE DECLAREE PAR LE SERVEUR, jamais par l'appelant: cette
    // route est la voie de SAISIE HUMAINE, l'ingestion machine a la sienne
    // (POST /api/haccp/webhook/iot-report, qui signe 'iot'). Et un appelant
    // qui PORTENT ces champs est REFUSE, pas corrigé en silence: un 400 nomme
    // est le seul signal qu'une tentative d'usurpation (ou un bug client) est
    // arrivee. L'unique emetteur de la route (Haccp.tsx, releve par octets)
    // n'envoie que equipment_name/temperature/user/recorded_at: ce 400 ne peut
    // pas rejeter une saisie legitime du chef.
    if (entry_type !== undefined) refus.push("entry_type");
    if (sensor_mode !== undefined) refus.push("sensor_mode");
    const entree: string = "manuel";
    const mode: string = "online";
    if (refus.length) return res.status(400).json(estRejete(refus));
    const operateur = lireTexte(user, 100) ?? "SYSTÈME";
    const id = nouvelId();
    await db.run(
      "INSERT INTO temperature_logs (id, equipment_name, temperature, user, recorded_at, entry_type, sensor_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, equipement, releve, operateur, instant, entree, mode],
    );
    res.json({ status: "success", id });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to log temperature" });
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
// SPRINT-11 h4 — registre de nettoyage. zone_name est NOT NULL en schema mais
// l'ancien corps l'insérait tel quel: un POST {zone_name: '   '} produisait une
// ligne de registre vide, indiscernable d'une zone absente a l'audit.
router.post("/api/haccp/cleaning", async (req, res) => {
  try {
    const { zone_name, completed_by } = req.body;
    const zone = lireTexte(zone_name, 200);
    if (zone === undefined) return res.status(400).json(estRejete(["zone_name"]));
    const id = nouvelId();
    await db.run(
      "INSERT INTO cleaning_records (id, zone_name, completed_by) VALUES (?, ?, ?)",
      [id, zone, lireTexte(completed_by, 100) ?? "SYSTÈME"],
    );
    res.json({ status: "success", id });
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
// SPRINT-11 h5 — enregistrement de production. Deux defauts de la version
// precedente, chacun d'une classe consignee ailleurs dans ce depot:
//  1. `for (const batchId of batch_ids)` sans Array.isArray: un objet ou une
//     chaine au lieu du tableau levait une exception AVALEE en 500 (le chef ne
//     savait pas quoi corriger).
//  2. PAS de transaction et PAS de controle d'existence: la voie de LECTURE de
//     l'historique est `production_records JOIN recipes` (JOIN INTERNE, relue a
//     l'octet). Une production avec recipe_id invalide est donc ECRITE et
//     DISPARAIT de l'historique — le registre de production du jour ne montre
//     pas la production. Le PRAGMA foreign_keys n'est jamais declenche par
//     init.ts (prouve par sonde: un orphelin est ACCEPTE), la clef du schema ne
//     protege rien.
router.post("/api/haccp/production", async (req, res) => {
  try {
    const { recipe_id, batch_ids } = req.body;
    const refus: string[] = [];
    const recette = clefEtrangere(recipe_id);
    if (recette === undefined) refus.push("recipe_id");
    let lots: string[] = [];
    if (!Array.isArray(batch_ids) || batch_ids.length === 0) {
      refus.push("batch_ids");
    } else {
      lots = batch_ids.map((b: unknown) => (typeof b === "string" ? b.trim() : ""));
      if (lots.some((b: string) => b === "") || new Set(lots).size !== lots.length) {
        refus.push("batch_ids");
      }
    }
    if (refus.length) return res.status(400).json(estRejete(refus));
    const recetteOk = await db.get("SELECT id FROM recipes WHERE id = ?", [recette]);
    if (!recetteOk) {
      return res.status(400).json(estRejete(["recipe_id"],
        "recette inexistante: une production sans recette jointe disparait de l'historique (JOIN interne)"));
    }
    const inconnus: string[] = [];
    for (const l of lots) {
      const b = await db.get("SELECT id FROM batches WHERE id = ?", [l]);
      if (!b) inconnus.push(l);
    }
    if (inconnus.length) {
      return res.status(400).json({
        refused: ["batch_ids"],
        inconnus,
        error: `Lots inexistants: ${inconnus.join(", ")}`,
      });
    }
    const productionId = nouvelId();
    await db.run("BEGIN");
    try {
      await db.run("INSERT INTO production_records (id, recipe_id) VALUES (?, ?)", [productionId, recette]);
      for (const l of lots) {
        await db.run("INSERT INTO production_batches (production_id, batch_id) VALUES (?, ?)", [productionId, l]);
      }
      await db.run("COMMIT");
    } catch (e) {
      await db.run("ROLLBACK");
      throw e;
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
// SPRINT-11 h6 — lot de traçabilite (l'enregistrement que l'auditeur peut
// exiger: dlc, lot, temperature a reception). L'ancien corps: quantity via
// `quantity || 0` (un texte devenait 0 SANS erreur, un lot trace a 0 kg);
// inventory_id non verifie alors que GET /api/haccp/batches est un
// `JOIN inventory` INTERNE: un lot dont l'article ne joint rien est ecrit puis
// INFICHABLE a l'ecran du chef. reception_temp et expiration_date n'avaient
// aucune forme attendue (le tri/filtrage lexicographique des TEXT les rendait
// muets sans erreur).
router.post("/api/haccp/batches", async (req, res) => {
  try {
    const {
      inventory_id, lot_number, expiration_date, source_image_url,
      quantity, unit, reception_temp, packaging_ok,
    } = req.body;
    const refus: string[] = [];
    const article = clefEtrangere(inventory_id);
    if (article === undefined) refus.push("inventory_id");
    const lot = lireTexte(lot_number, 200);
    if (lot === undefined) refus.push("lot_number");
    // Pas de repli texte: la colonne est comparee lexicographiquement et
    // `dlc` arrive aussi de l'OCR (`if (data.dlc) setDlc(data.dlc)`), donc
    // un format libre entrait sans bruit et rendait le tri muet.
    const echeance = dateISO(expiration_date);
    if (echeance === undefined) refus.push("expiration_date");
    const poids = nombreDeReleve(quantity ?? 0, 0, QUANTITE_LOT_MAX);
    if (poids === undefined) refus.push("quantity");
    const mesure = unit === undefined || unit === null ? "" : lireTexte(unit, 30);
    if (mesure === undefined) refus.push("unit");
    let reception: number | null = null;
    if (reception_temp !== undefined && reception_temp !== null && reception_temp !== "") {
      const r = nombreDeReleve(reception_temp, RECEPTION_TEMP_MIN, RECEPTION_TEMP_MAX);
      if (r === undefined) refus.push("reception_temp"); else reception = r;
    }
    if (refus.length) return res.status(400).json(estRejete(refus));
    const art = await db.get("SELECT id FROM inventory WHERE id = ?", [article]);
    if (!art) {
      return res.status(400).json(estRejete(["inventory_id"],
        "article inconnu: un lot qui ne joint aucun article disparait de la liste des lots (JOIN interne)"));
    }
    const id = nouvelId();
    await db.run(
      "INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url, quantity, unit, reception_temp, packaging_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, article, lot, echeance, lireTexte(source_image_url, COLONNE_TEXTE_MAX) ?? null,
       poids, mesure, reception, packaging_ok ? 1 : 0],
    );
    res.json({ status: "success", id });
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
// SPRINT-11 h7 — actions correctives HACCP. La table etait un REGISTRE SANS
// LECTURE: aucun SELECT sur corrective_actions n'existait dans src/ (cartographie
// par octets, 0 voie) — on ecrivait la preuve exigee par l'art. 5 du regl. 852/2004
// et AUCUNE route ne la rendait. La relever suppose la releve d'origine: un
// log_id inexistante produisait une action corrective orpheline, non rattachee a
// la non-conformite, donc sans valeur de preuve.
router.post("/api/haccp/corrective-action", async (req, res) => {
  try {
    const { log_id, action_taken } = req.body;
    const refus: string[] = [];
    const reliquat = clefEtrangere(log_id);
    if (reliquat === undefined) refus.push("log_id");
    const action = lireTexte(action_taken, 1000);
    if (action === undefined) refus.push("action_taken");
    if (refus.length) return res.status(400).json(estRejete(refus));
    const log = await db.get("SELECT id FROM temperature_logs WHERE id = ?", [reliquat]);
    if (!log) {
      return res.status(400).json(estRejete(["log_id"],
        "aucune releve correspondante: une action corrective sans releve reliee ne prouve rien a l'auditeur"));
    }
    const id = nouvelId();
    await db.run(
      "INSERT INTO corrective_actions (id, log_id, action_taken) VALUES (?, ?, ?)",
      [id, reliquat, action],
    );
    res.json({ status: "success", id });
  } catch (error) {
    res.status(500).json({ error: "Failed to save corrective action" });
  }
});

// LA LECTURE QUI MANQUAIT. Sans elle, le POST ci-dessus etait un PASS creux a
// l'ecriture: on ne verifiait jamais que la preuve ecrite ressort un jour.
router.get("/api/haccp/corrective-actions", async (req, res) => {
  try {
    const lignes = await db.all(
      "SELECT ca.id, ca.log_id, ca.action_taken, ca.created_at, tl.equipment_name, tl.temperature " +
      "FROM corrective_actions ca LEFT JOIN temperature_logs tl ON ca.log_id = tl.id " +
      "ORDER BY ca.created_at DESC LIMIT 200",
    );
    res.json(lignes);
  } catch (error) {
    res.status(500).json({ error: "Failed to load corrective actions" });
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
