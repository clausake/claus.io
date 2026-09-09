import os from "os";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import crypto from "crypto";

// Init + migrations SQLite.
// - Ouvre (ou crée) agent_culinaire.db dans storageDir,
// - exécute la création des tables (CREATE TABLE IF NOT EXISTS),
// - ajoute les colonnes manquantes (ensureColumn),
// - seede l'inventaire initial (vocab_translations.json ou fallback),
// - initialise machineId + install_date dans app_license,
// - backup quotidien (rotation 5 jours).

export interface LicenseState {
  machineId: string;
  finalInstallTime: string;
  TRIAL_MS: number;
}

export interface DbInitResult {
  db: Database;
  storageDir: string;
  dbPath: string;
  license: LicenseState;
}

export function resolveStorageDir(): string {
  let storageDir = process.env.USER_DATA_PATH;
  if (!storageDir) {
    const home = os.homedir();
    if (process.platform === "win32") {
      storageDir = path.join(home, "AppData", "Roaming", "ClausIO");
    } else {
      storageDir = path.join(home, ".clausio");
    }
  }
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  console.log(`[INFO] Application Data initialized at: ${storageDir}`);
  return storageDir;
}

// (Le backup quotidien a été remplacé par le backup horaire de
//  src/services/db-backup.ts — rotation 5, plus granulaire.)

// Clé publique RSA de licence (Phase 0). La clé privée reste chez l'éditeur.
const LICENSE_PUBLIC_KEY_PEM =
  process.env.COOKDRIVE_LICENSE_PUBLIC_KEY ||
  `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyLBV7Q1BWIDuObTtEMTc
lAzPzzM+jJjFugnjbOZIb3fNWbPVbe/IX867u1eRjVyPrzKegL7aGQi2RSp49LH1
n4d9ZpmXSXnOw0rYgYL6+QV1vE1ZNabgC1RawRwBi3iFWKplwdx8+AgMQ6erROrs
m8hyb4T+F9VC3iGju8KxEzr5E4rv2VzsAeAj/foGsxBHO+Ezm6Eqgib6dNLsXLvf
eYiVnxihbheM2EEEOjYikjD5xcCLzK/mev+pLweIWwdvxrtrmLhn9p7qRStFMQg1
vusD+/E1vjvKS4UaCvUDOdOz4lUNx63ZygcPZR8BU2XMt35vGWoXo9Z48gkgS9fW
uwIDAQAB
-----END PUBLIC KEY-----`;

// Vérifie une clé d'unlock signée (base64 du RSA signature de machineId).
export function verifyLicenseKey(machineId: string, keyCandidate: string): boolean {
  try {
    const cryptoMod: any = crypto as any;
    const normalized = keyCandidate.replace(/[^A-Za-z0-9+/=]/g, "");
    const signature = Buffer.from(normalized, "base64");
    if (signature.length === 0) return false;
    const verifier = cryptoMod.createVerify("RSA-SHA256");
    verifier.update(machineId);
    return verifier.verify(LICENSE_PUBLIC_KEY_PEM, signature);
  } catch (e) {
    return false;
  }
}

export async function initDatabase(): Promise<DbInitResult> {
  const storageDir = resolveStorageDir();
  const dbPath = path.join(storageDir, "agent_culinaire.db");
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA synchronous = NORMAL;");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      minStock REAL NOT NULL,
      unit TEXT NOT NULL,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      yield_percent REAL DEFAULT 100,
      lot_number TEXT,
      dlc TEXT,
      dluo TEXT
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      is_saved BOOLEAN DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      inventory_id TEXT NOT NULL,
      quantity_per_person REAL NOT NULL,
      FOREIGN KEY(recipe_id) REFERENCES recipes(id),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      supplier TEXT,
      date TEXT,
      total_amount REAL,
      source_image_url TEXT,
      status TEXT DEFAULT 'PENDING',
      rawDataJson TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS document_items (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      inventory_id TEXT,
      original_name TEXT,
      quantity REAL NOT NULL,
      unit_price REAL,
      lot_number TEXT,
      dlc TEXT,
      FOREIGN KEY(document_id) REFERENCES documents(id),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS inventory_prices (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL,
      price REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    );
    CREATE TABLE IF NOT EXISTS supplier_prices (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      inventory_id TEXT NOT NULL,
      raw_unit_price REAL NOT NULL,
      unit TEXT NOT NULL,
      calculated_price_per_ref REAL,
      is_verified_from_invoice INTEGER DEFAULT 0,
      valid_until TEXT,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    );
    CREATE TABLE IF NOT EXISTS temperature_logs (
      id TEXT PRIMARY KEY,
      equipment_name TEXT NOT NULL,
      temperature REAL NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user TEXT
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      status TEXT DEFAULT 'ACTIVE'
    );
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL,
      lot_number TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit TEXT,
      source_image_url TEXT,
      reception_temp REAL,
      packaging_ok INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    );
    CREATE TABLE IF NOT EXISTS corrective_actions (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(log_id) REFERENCES temperature_logs(id)
    );
    CREATE TABLE IF NOT EXISTS haccp_documents (id TEXT PRIMARY KEY, type TEXT, name TEXT, file_url TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS cleaning_records (
      id TEXT PRIMARY KEY,
      zone_name TEXT NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_by TEXT
    );
    CREATE TABLE IF NOT EXISTS production_records (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(recipe_id) REFERENCES recipes(id)
    );
    CREATE TABLE IF NOT EXISTS production_batches (
      production_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      FOREIGN KEY(production_id) REFERENCES production_records(id),
      FOREIGN KEY(batch_id) REFERENCES batches(id)
    );
    CREATE TABLE IF NOT EXISTS traceability_labels (
      id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      fabrication_date TEXT NOT NULL,
      dlc TEXT NOT NULL,
      allergens TEXT
    );
    CREATE TABLE IF NOT EXISTS robots (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      task TEXT,
      progress INTEGER,
      battery INTEGER,
      location TEXT
    );
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      hourly_rate REAL DEFAULT 15,
      active BOOLEAN DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS staff_schedule (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      day TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY(staff_id) REFERENCES staff(id)
    );
    CREATE TABLE IF NOT EXISTS menu_planning (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL, -- 'LUNCH', 'DINNER'
      recipe_id TEXT,
      title TEXT,
      recipe_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS iot_sensors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'ambient',
      equipment_type TEXT DEFAULT 'Froid',
      battery INTEGER DEFAULT 100,
      last_reading REAL,
      last_reading_at TEXT,
      webhook_token TEXT
    );
  `);
  const ensureColumn = async (table: string, column: string, definition: string) => {
    try {
      const columns = await db.all(`PRAGMA table_info(${table});`);
      if (!columns.some((c) => c.name === column)) {
        await db.exec(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
        );
        console.log(`[SCHEMA] Added column ${column} to ${table}`);
      }
    } catch (e) {
      console.error(`[SCHEMA] Failed to add column ${column} to ${table}:`, e);
    }
  };
  await ensureColumn("inventory", "yield_percent", "REAL DEFAULT 100");
  await ensureColumn("inventory", "minStock", "REAL DEFAULT 0");
  await ensureColumn("inventory", "status", "TEXT DEFAULT 'active'");
  await ensureColumn("inventory", "category", "TEXT DEFAULT 'Uncategorized'");
  await ensureColumn("inventory", "unit", "TEXT DEFAULT 'kg'");
  await ensureColumn("inventory", "dlc", "TEXT");
  await ensureColumn("inventory", "allergens", "TEXT");
  await ensureColumn("inventory", "unit_price", "REAL DEFAULT 0");
  await ensureColumn("inventory", "lot_number", "TEXT");
  await ensureColumn("inventory", "dluo", "TEXT");
  await ensureColumn("alerts", "status", "TEXT DEFAULT 'active'");
  await ensureColumn("staff_schedule", "date", "TEXT");
  await ensureColumn("recipes", "category", "TEXT DEFAULT 'general'");
  await ensureColumn("recipes", "dish_type", "TEXT DEFAULT 'plat'");
  await ensureColumn("recipes", "is_saved", "BOOLEAN DEFAULT 0");
  await ensureColumn("recipes", "croquis_svg", "TEXT");
  await ensureColumn("recipes", "preparation_steps", "TEXT");
  await ensureColumn("recipes", "source_image_url", "TEXT");
  await ensureColumn("recipes", "allergens", "TEXT");
  await ensureColumn("recipes", "language", "TEXT DEFAULT 'fr'");
  await ensureColumn("menu_planning", "language", "TEXT DEFAULT 'fr'");
  await ensureColumn("documents", "source_image_url", "TEXT");
  await ensureColumn("document_items", "original_name", "TEXT");
  await ensureColumn("document_items", "lot_number", "TEXT");
  await ensureColumn("document_items", "dlc", "TEXT");
  await ensureColumn("batches", "source_image_url", "TEXT");
  await ensureColumn("temperature_logs", "entry_type", "TEXT DEFAULT 'manuel'");
  await ensureColumn("temperature_logs", "sensor_mode", "TEXT DEFAULT 'online'");
  await ensureColumn("temperature_logs", "sensor_id", "TEXT");
  // Index de temperature_logs(recorded_at).
  //
  // Le SEUL index ajoute dans ce fichier, et il est ajoute parce qu'il a ete
  // MESURE, pas parce que la table lui a paru devoir en avoir un. Le harnais
  // `scripts/ab-indices.py` compare, sur une base seedee a volume de resto
  // (3000 relevements), la requete de /api/haccp/production-history :
  //   p95 SQL 0,171 ms SANS index  ->  0,031 ms AVEC  (gain 82 %)
  // et montre que les 5 autres candidats (supplier_prices x2, staff.active,
  // documents.date, staff_schedule.day) restent sous le bruit : le plan SQLite
  // les garde en 'SCAN' et le gain mesure est <= 1 %. Ils ont donc ete REFUSES.
  //
  // Pourquoi c'est celui-la qui gagne la: `SELECT * FROM temperature_logs
  // ORDER BY recorded_at DESC LIMIT 50` est un scan complet + tri temporaire
  // (USE TEMP B-TREE) ; l'index donne un parcours deja trie et le LIMIT 50
  // arrete la lecture apres 50 clefs au lieu de lire toute la table.
  //
  // ⚠ CREATE INDEX IF NOT EXISTS est ici une obligation, pas une comfort : la
  // base des clients deja installees contient cette table sans index, et cette
  // migration tourne a chaque demarrage (initDatabase). IF NOT EXISTS la rend
  // idempotente et donc relancable sans effet de bord sur les donnees.
  try {
    await db.exec(
      "CREATE INDEX IF NOT EXISTS ix_temperature_logs_recorded ON temperature_logs(recorded_at DESC)",
    );
  } catch (e) {
    // Un index DESC n'est pas supporte par les tres vieux moteur SQLite. Si la
    // création echoue, l'application doit quand meme demarrer : la requete reste
    // correcte (SQLite trie alors lui-meme), elle est seulement plus lente.
    // Le tag [SCHEMA] reprend la convention des autres migrations de ce fichier.
    console.error(`[SCHEMA] Failed to create index on temperature_logs(recorded_at):`, e);
  }

  // NOTE Phase 0 : l'ancienne logique "shadow files" a été supprimée.
  // La date d'installation vit désormais uniquement dans SQLite (app_license).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_license (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  try {
    await db.exec("ALTER TABLE suppliers ADD COLUMN email TEXT;");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE suppliers ADD COLUMN phone TEXT;");
  } catch (e) {}

  let machineIdRow = await db.get(
    "SELECT value FROM app_license WHERE key = 'machine_id'",
  ) as { value: string } | undefined;
  if (!machineIdRow) {
    const cryptoMod: any = crypto as any;
    const interfaces = os.networkInterfaces();
    let macAddresses = "";
    for (const key in interfaces) {
      for (const iface of interfaces[key] || []) {
        if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
          macAddresses += iface.mac;
        }
      }
    }
    let newId: string;
    if (macAddresses.length > 0) {
      newId = cryptoMod.createHash("sha256").update(macAddresses).digest("hex").substring(0, 8).toUpperCase();
    } else {
      newId = cryptoMod.randomBytes(4).toString("hex").toUpperCase();
    }
    await db.run(
      "INSERT INTO app_license (key, value) VALUES ('machine_id', ?)",
      [newId],
    );
    machineIdRow = { value: newId };
  }
  const machineId = machineIdRow.value;

  let dbLicense = await db.get(
    "SELECT value FROM app_license WHERE key = 'install_date'",
  ) as { value: string } | undefined;
  let finalInstallTime: string;
  if (dbLicense && !isNaN(parseInt(dbLicense.value))) {
    finalInstallTime = dbLicense.value;
  } else {
    finalInstallTime = Date.now().toString();
  }
  if (!dbLicense || dbLicense.value !== finalInstallTime) {
    await db.run(
      "INSERT OR REPLACE INTO app_license (key, value) VALUES ('install_date', ?)",
      [finalInstallTime],
    );
  }
  const TRIAL_MS = 30 * 24 * 60 * 60 * 1e3; // 30 jours

  return { db, storageDir, dbPath, license: { machineId, finalInstallTime, TRIAL_MS } };
}
