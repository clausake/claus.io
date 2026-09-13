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
  // -- Chaine d'achat : le bon devient un document qui se receptionne ---------
  // Sans ces deux colonnes, la reception n'a nulle part ou ecrire son etat et
  // l'historique « combien recu vs combien commande » n'existe pas.
  // ensureColumn est idempotent (PRAGMA + ALTER) : la migration rejoue a chaque
  // demarrage sur les bases deja livrees chez le client.
  await ensureColumn("documents", "received_at", "TEXT");
  await ensureColumn("document_items", "received_quantity", "REAL");
  await ensureColumn("document_items", "original_name", "TEXT");
  await ensureColumn("document_items", "lot_number", "TEXT");
  await ensureColumn("document_items", "dlc", "TEXT");
  // CONTRAT LIGNES DE DOCUMENT (Sprint 9): le montant RECU quand il n'a pas pu
  // devenir un prix exploitable. `unit_price` porte desorais soit un nombre
  // defendable, soit NULL (jamais un texte): l'affinite dynamique de SQLite
  // laissit vivre `quantity='beaucoup'` et `unit_price='vingt virgule cinq'`
  // dans une colonne REAL (mesure de la sonde: 3 lignes en typeof=text sur 7).
  // La valeur brute n'est PAS pour autant jete: le papier du chef reste
  // fidele, /validate peut la NOMMER, et V3 de documents-validate-contract
  // exige cette fidelite. NULLABLE: une ligne saine n'a rien a tracer.
  await ensureColumn("document_items", "unit_price_brut", "TEXT");
  await ensureColumn("batches", "source_image_url", "TEXT");
  await ensureColumn("temperature_logs", "entry_type", "TEXT DEFAULT 'manuel'");
  await ensureColumn("temperature_logs", "sensor_mode", "TEXT DEFAULT 'online'");
  await ensureColumn("temperature_logs", "sensor_id", "TEXT");
  // Index de temperature_logs(recorded_at) et de staff_schedule(staff_id, day).
  //
  // Deux index dans ce fichier, et DEUX parce qu'ils ont ete MESURES chacun,
  // jamais parce que la table leur a paru devoir en porter un. Un index non
  // prouve est une dette payee a chaque ecriture (le webhook HACCP ecrit en
  // continu), donc la regle est : on ne l'installe que si le plan SQLite dit
  // SCAN et que la mesure descend le p50/p95 au-dessus du seuil de 15 %.
  //
  // 1) temperature_logs(recorded_at DESC) -- harnais scripts/ab-indices.py,
  //    base seedee a volume de resto (3000 releves), requete de
  //    /api/haccp/production-history : p95 SQL 0,171 ms SANS -> 0,031 ms AVEC
  //    (gain 82 %). `SELECT * ... ORDER BY recorded_at DESC LIMIT 50` etait un
  //    scan complet + tri temporaire (USE TEMP B-TREE) ; l'index donne un
  //    parcours deja trie et le LIMIT 50 arrete la lecture apres 50 clefs.
  //
  // 2) staff_schedule(staff_id, day) -- harnais scripts/probe-index-staffday.py,
  //    150 560 lignes de planning, 537 lignes par (membre, jour), ABBA echauffe,
  //    en rejouant le tour COMPLET de /api/dashboard/stats (une requete par
  //    membre actif, soit 40 requetes par tour) :
  //      sans index        p50 303,6 ms   plan: SCAN staff_schedule
  //      (staff_id) seul   p50 138,7 ms   gain +54,3 %  SEARCH USING INDEX
  //      (staff_id, day)   p50  38,5 ms   gain +87,3 %  SEARCH ... (staff_id=? AND day=?)
  //    Cout a l'ecriture mesure : +41,6 % sur une INSERT dans CETTE seule table
  //    (le webhook HACCP n'y ecrit pas), accepte pour 87 % de latence retiree a
  //    chaque rafraichissement du tableau de bord.
  //
  //    ⚠ Pourquoi ce candidat avait ete MAL JUGES, et la legon qui compte.
  //    scripts/ab-indices.py listait `staff_schedule(day)` comme « refuse par
  //    mesure (+0,4 %) ». C'etait un refus par ARTEFACT et non par mesure : son
  //    seed remplit la colonne `date` (dates ISO) alors que la route filtre
  //    `WHERE staff_id = ? AND day = ?` avec un NOM DE JOUR ("thursday"). La
  //    requete du bench ne rapportait DONC AUCUNE ligne : on chronometrait un
  //    scan au resultat vide, et le plan lisait « SCAN » sans que personne n'y
  //    voie une selection vide. Deux regles s'imposent desormais :
  //      (a) un A/B doit rejouer le FILTRE REEL de la route et en verifier le
  //          compte de lignes rapportees -- si zero, la mesure est vaine ;
  //      (b) juger sur le volume de la TABLE, pas sur celui du seed : un scan de
  //          quelques centaines de lignes ne se distingue pas d'un index, le
  //          bench ne mesurant alors que la resolution de l'horloge.
  //
  //    ⚠ Le COMPOSITE et non `day` seul : `day` seul laisse les 40 requetes
  //    scanner toute la tranchee du jour (~18 000 lignes), alors que la cle
  //    composee (staff_id, day) les borne a 537 lignes chacune. C'est la
  //    conjonction des DEUX predicats dans la cle qui fait le gain -- un index
  //    sur une seule des deux colonnes ne rattrape que la moitie du chemin.
  //
  // ⚠ CREATE INDEX IF NOT EXISTS est ici une obligation, pas une comfort : la
  // base des clients deja installees contient ces tables SANS index, et ces
  // migrations tournent a chaque demarrage (initDatabase). IF NOT EXISTS les
  // rend idempotentes et donc relancables sans aucun effet de bord sur les
  // donnees.
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

  // Meme tolerance, meme convention que ci-dessus : un echec de creation ne
  // doit JAMAIS empecher le demarrage. Sans ces index, /api/dashboard/stats
  // reste strictement correcte et seulement plus lente (chiffres ci-dessous).
  //
  // ⚠ DEUX index et non un seul, et c'est MESURE (scripts/probe-index-reel.py,
  // table de 150 001 rangees, 40 membres, tour COMPLET de la route, ABBA
  // echauffe, couche SQL pure hors HTTP). La requete du tableau de bord est un
  // UNION ALL a DEUX branches, chacune avec SON predicat (c'est le UNION ALL qui
  // les laisse exploitables: un (a OR b) faisait tomber le second predicat du
  // plan, voir src/routes/dashboard.ts) :
  //     branche 1 (chaude)  staff_id = ? AND date = ?
  //     branche 2 (heritee) staff_id = ? AND day = ? AND (date IS NULL OR '')
  // Un index composite n'est PLEINEMENT exploite que par la branche dont il
  // porte les DEUX predicats ; l'autre retombe a `staff_id = ?` seul et re-teste
  // rangee par rangee :
  //     aucun index              p50  548,6 ms   les deux branches en SCAN
  //     (staff_id, day) SEUL     p50   83,7 ms   branche 1 seulement `staff_id=?`
  //     (staff_id, date) SEUL    p50    6,9 ms   branche 2 seulement `staff_id=?`
  //     LES DEUX                 p50    0,159 ms  les deux branches PLEINES
  // Les QUATRE etats ont rendu le MEME compte de lignes (81), donc ce n'est pas
  // un arbitrage de justesse: pur choix de perf, a ce point 527 fois le tour.
  //
  // ⚠ LE CONSIGNE DU 09/09 (« staff_schedule(staff_id, day), +86,7 % ») etait
  // MOITIE FAUX, et c'est la legon qui compte. Sa sonde semait `day` avec des
  // NOMS DE JOUR, la ou l'app ecrit `day = date = "<ISO>"` (POST /api/staff, et
  // verifie dans la base reelle du client: 0 range sur un nom de jour). Elle a
  // donc installe un index sur la colonne de la branche RARE en laissant la
  // branche CHAUDE sans index — 84 % de gain annonces, 527 fois moins bien que
  // l'etat correct. La legon, generalisee: un A/B d'index doit rejouer la
  // requete que le CODE EMET (les deux branches d'un UNION ALL comprises), sur
  // des donnes dans la forme que l'ECRITURE de l'app produit, et verifier que
  // chaque branche obtient bien un plan PLEIN — un `SEARCH USING INDEX
  // (col=?)` sans le second predicat n'est pas « indexe », c'est un scan filtre.
  //
  // Cout a l'ecriture mesure (3 000 INSERT): 0,0009 ms sans index -> 0,0018 avec
  // les DEUX, soit +0,0009 ms/insertion. Le planning ne s'ecrit que quand un
  // humain sauvegarde une semaine: ignoreable devant 527x de latence retiree a
  // chaque rafraichissement du tableau de bord.
  for (const [ddl, label] of [
    [
      "CREATE INDEX IF NOT EXISTS ix_staff_schedule_staff_day ON staff_schedule(staff_id, day)",
      "staff_schedule(staff_id, day)",
    ],
    [
      "CREATE INDEX IF NOT EXISTS ix_staff_schedule_staff_date ON staff_schedule(staff_id, date)",
      "staff_schedule(staff_id, date)",
    ],
    [
      // La requete de la prevision d'achat (GET /api/purchasing/forecast) filtre
      // les dates planifiees. Mesure (scripts/probe-index-forecast.py) : la forme
      // DATE(col) est NON SARGABLE (gain -0,6 %, l'index ne peut pas s'appliquer
      // sous une fonction) ; la variante sargable donne un plan PLEIN
      // SEARCH mp USING INDEX idx_mp_date (date>? AND date<?). La route porte
      // DONC les DEUX predicats : l'un indexable pour la vitesse, l'autre en
      // DATE() pour la justesse sur une date heritee non zero-paddee.
      // A 1 040 lignes de plan : p50 0,136 -> 0,084 ms (le plan est un SCAN qui
      // croit avec le temps — un planning ne se supprime pas ; l'lookup, non).
      "CREATE INDEX IF NOT EXISTS ix_menu_planning_date ON menu_planning(date)",
      "menu_planning(date)",
    ],
  ]) {
    try {
      await db.exec(ddl);
    } catch (e) {
      console.error(`[SCHEMA] Failed to create index on ${label}:`, e);
    }
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
