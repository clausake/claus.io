// CookDrive — Serveur Express (Phase 2 : découpage en routeurs).
// server.ts ne fait que :
//   1. créer l'app express + middlewares globaux (helmet, json, rate-limit),
//   2. initialiser la base SQLite (src/db/init.ts) et l'état de licence,
//   3. monter les routeurs métier (src/routes/*),
//   4. servir le frontend (vite en dev / dist en prod) et écouter le port.

import express from "express";
import helmet from "helmet";
import compression from "compression";
import "dotenv/config";
import os from "os";
import path from "path";
import fs from "fs";

import { initDatabase, LicenseState } from "./src/db/init.js";
import { licenseMiddleware } from "./src/middleware/license.js";
import apiRateLimiter from "./src/middleware/api-rate-limiter.js";
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
  // helmet() : headers de sécurité. `host: false` (via cast) désactive le header
  // "Host" qui bloquerait les requêtes passant par un tunnel/proxy (trycloudflare,
  // Tailscale, reverse proxy) — le Host externe doit être accepté.
  app.use(helmet({ host: false } as Parameters<typeof helmet>[0]));
  app.use(express.json({ limit: "10mb" }));
  // Compression HTTP (gzip). L'audit relevait que `compression` etait absent de
  // package.json : le chunk index (676 kB, 218 kB gzip) partait en texte brut sur
  // le LAN. Seuil a 1 ko : sous ce plancher le CPU coute plus cher que les octets
  // economises (la plupart des reponses API font moins de 1 ko).
  //
  // Le point qui compte: on exclut text/event-stream. compression ne s'arme qu'au
  // premier write(), mais gzip met en tampon jusqu'a la fin de la reponse; sur un
  // flux SSE qui emet un evenement a la fois, cela reintroduirait la latence que la
  // phase SSE a supprimee (4000 ms -> 13 ms mesure). Le contrat de latence est
  // grave dans le test e2e, donc cette exclusion est protegee en CI.
  //
  // Le fallback delegue a compression.filter (le filtre par defaut de la lib):
  // on ne duplique pas la liste des Content-Type compressibles, et les formats
  // deja compresses (png, jpg, woff2, safetensors) restent exclus par la lib.
  const compressionFilter = compression.filter;
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        const ct = String(res.getHeader("Content-Type") ?? "");
        if (ct.includes("text/event-stream")) return false;
        return compressionFilter(req, res);
      },
    }),
  );
  app.use(httpLogger);

  // Rate-limit par categorie de surface (read / mutate / delete / auth / ai).
  // L'ancien budget unique de 300/15 min faisait un 429 global sur le simple
  // polling du tableau de bord HACCP (mesure : 429 a la 214e requete) tout en
  // laissant 300 tentatives a /api/unlock. Voir src/middleware/api-rate-limiter.ts.
  app.use("/api", apiRateLimiter());

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
  app.use(settingsRouter);
  app.use(backupRouter);
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
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Assets Vite: le nom de fichier porte le hash de contenu (index-CUpTgUSW.js),
    // donc l'URL change des que le contenu change: on peut declarer
    // max-age=1 an + immutable sans risquer de servir un vieux bundle.
    // L'audit mesurait cache-control: public, max-age=0 (express.static ne pose
    // que l'ETag par defaut): chaque rechargement re-telechargeait les assets.
    // index.html, lui, n'a pas de hash dans son nom: il garde la revalidation par
    // ETag (no-cache), et c'est elle qui libere le nouveau bundle.
    app.use(
      express.static(distPath, {
        etag: true,
        maxAge: "1y",
        immutable: true,
        setHeaders(res, filePath) {
          if (!filePath.includes("/assets/")) {
            // Tout ce qui n'est pas content-hashed doit etre revalide.
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const HOST = process.env.HOST || "127.0.0.1";
  const startListening = () => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
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
