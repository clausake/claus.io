// CookDrive — Serveur Express (Phase 2 : découpage en routeurs).
// server.ts ne fait que :
//   1. créer l'app express + middlewares globaux (helmet, json, rate-limit),
//   2. initialiser la base SQLite (src/db/init.ts) et l'état de licence,
//   3. monter les routeurs métier (src/routes/*),
//   4. servir le frontend (vite en dev / dist en prod) et écouter le port.

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import os from "os";
import path from "path";
import fs from "fs";

import { initDatabase, LicenseState } from "./src/db/init.js";
import { licenseMiddleware } from "./src/middleware/license.js";
import httpLogger from "./src/middleware/http-logger.js";
import { ollamaSettingsRef, OllamaSettings } from "./src/shared/ollama.js";
import { settingsStore } from "./src/services/settings.js";
import { uploadsDir } from "./src/services/paths.js";
import { startDbBackup } from "./src/services/db-backup.js";

// --- Routeurs métier ---
import settingsRouter from "./src/routes/settings.js";
import backupRouter from "./src/routes/backup.js";
import inventoryRouter from "./src/routes/inventory.js";
import suppliersRouter from "./src/routes/suppliers.js";
import documentsRouter from "./src/routes/documents.js";
import menuRouter from "./src/routes/menu.js";
import licensingRouterFactory from "./src/routes/licensing.js";
import haccpRouter from "./src/routes/haccp.js";
import staffRouter from "./src/routes/staff.js";
import searchRouter from "./src/routes/search.js";
import dashboardRouter from "./src/routes/dashboard.js";
import recipesRouter from "./src/routes/recipes.js";
import menuplanningRouter from "./src/routes/menuplanning.js";
import adminRouter from "./src/routes/admin.js";
import epicureRouter from "./src/routes/epicure.js";
import robotsRouter from "./src/routes/robots.js";
import supplierpricesRouter from "./src/routes/supplierprices.js";
import antiwasteRouter from "./src/routes/antiwaste.js";
import aiRouter from "./src/routes/ai.js";
import healthRouter from "./src/routes/health.js";

fs.mkdirSync(uploadsDir, { recursive: true });

async function startServer() {
  const app = express();
  let PORT = Number(process.env.PORT) || 3000;

  // Middlewares globaux
  app.use(helmet());
  app.use(express.json({ limit: "10mb" }));
  app.use(httpLogger);

  // Rate-limit global sur /api (anti bruteforce / abuse)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessaie dans quelques minutes." },
  });
  app.use("/api", apiLimiter);

  // --- Initialisation de la base + état licence ---
  const { db, storageDir, license } = await initDatabase();
  const licenseState: LicenseState = license;

  // Backup automatique horaire de la base SQLite (rotation 5 backups).
  startDbBackup(storageDir, path.join(storageDir, "agent_culinaire.db"));

  // Synchronise la référence partagée des settings (utilisée par le client Ollama
  // et les routes qui ont besoin de model_name/language sans dépendre de la base).
  ollamaSettingsRef.current = settingsStore.value as OllamaSettings;
  const onSettingsUpdate = () => { ollamaSettingsRef.current = settingsStore.value as OllamaSettings; };

  // Middleware de licence — posé AVANT toutes les routes pour couvrir 100 % des
  // routes /api/* (in-contournable). Bloque les mutations si trial expiré +
  // non unlocké ; les GET restent autorisés.
  app.use("/api", licenseMiddleware(db, licenseState));

  // --- Routeurs ---
  // /api racine : settings, backup, network-info, ollama/status
  app.use("/api", settingsRouter);
  app.use("/api", backupRouter);
  // Routeurs montés à la racine (leurs chemins commencent par /api/...)
  app.use(inventoryRouter(db));
  app.use(suppliersRouter(db));
  app.use(documentsRouter(db));
  app.use(menuRouter(db));
  app.use(licensingRouterFactory(db, licenseState));
  app.use(haccpRouter(db));
  app.use(staffRouter(db));
  app.use(searchRouter(db));
  app.use(dashboardRouter(db));
  app.use(recipesRouter(db));
  app.use(menuplanningRouter(db));
  app.use(adminRouter(storageDir));
  app.use(epicureRouter());
  app.use(robotsRouter(db));
  app.use(supplierpricesRouter(db));
  app.use(antiwasteRouter(db));
  app.use(aiRouter(db));
  // /health est à la racine (pas sous /api)
  app.use(healthRouter);

  // --- Frontend ---
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite").then(
      (s) => {
        const e = "default";
        return s[e] && typeof s[e] == "object" && "__esModule" in s[e] ? s[e] : s;
      },
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const startListening = () => {
    const server = app.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is in use, trying next port...`);
        PORT++;
        startListening();
      } else {
        console.error("Server error:", err);
      }
    });
  };
  startListening();
}

startServer();
