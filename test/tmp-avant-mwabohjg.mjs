
import { open } from "sqlite";
import sqlite3 from "sqlite3";
const db = await open({ filename: process.argv[2], driver: sqlite3.Database });
await db.exec("CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT NOT NULL, quantity REAL NOT NULL, minStock REAL NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL, category TEXT NOT NULL, unit_price REAL DEFAULT 0, yield_percent REAL DEFAULT 100, lot_number TEXT, dlc TEXT, dluo TEXT)");
await db.run("INSERT OR REPLACE INTO inventory (id, name, quantity, minStock, unit, status, category) VALUES (?,?,?,?,?,?,?)", "avant-install", "Article de l'ancienne installation", 12, 3, "kg", "ok", "Ancienne");
await db.close();
