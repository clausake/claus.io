// claus.io — Serveur Express (Phase 2 : découpage en routeurs).
// server.ts ne fait que :
//   1. créer l'app express + middlewares globaux (helmet, json, rate-limit),
//   2. initialiser la base SQLite (src/db/init.ts) et l'état de licence,
//   3. monter les routeurs métier (src/routes/*),
//   4. servir le frontend (vite en dev / dist en prod) et écouter le port.

import express from "express";
import helmet from "helmet";
import compression from "compression";
import "dotenv/config";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";

import { initDatabase, LicenseState } from "./src/db/init.js";
import { licenseMiddleware } from "./src/middleware/license.js";
import { sessionMiddleware, sessionGate } from "./src/middleware/auth.js";
import { createAuditLogger, setAuditDb } from "./src/services/audit.js";
import cookieParser from "cookie-parser";
import authRouter from "./src/routes/auth.js";
import apiRateLimiter from "./src/middleware/api-rate-limiter.js";
import httpLogger from "./src/middleware/http-logger.js";
import { ollamaSettingsRef, OllamaSettings } from "./src/shared/ollama.js";
import { settingsStore } from "./src/services/settings.js";
import { uploadsDir } from "./src/services/paths.js";
import { startDbBackup } from "./src/services/db-backup.js";
import { announceReady } from "./src/services/ready.js";

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
import suggestionsRouter from "./src/routes/suggestions.js";
import surveillanceRouter from "./src/routes/surveillance.js";
import hermesRouter from "./src/routes/hermes.js";
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

  // --- Identite de CETTE instance ------------------------------------------
  // Gravee dans chaque reponse. Elle existe pour une seule raison: permettre a
  // qui lance le serveur de VERIFIER que la reponse qu'il recoit vient bien de
  // L'INSTANCE QU'IL A LANCEE, et non d'un serveur herite qui tient le port.
  //
  // Pourquoi c'est necessaire ici et non « en amont » dans le harnais: un test
  // qui demande un port libre a l'OS, le referme, puis lance son serveur dessus
  // ne peut PAS savoir qui va repondre. Si une autre instance (un autre harnais
  // en parallele, un serveur de dev oublie) a repris le port entre-temps, le
  // test juge des donnees et un code qu'il n'a pas installes -- et son verdict,
  // VERT ou ROUGE, est sans valeur. C'est exactement la faute qui a fait
  // annoncer « la mutation M5 ne mord pas » alors qu'elle mord (verifiee seul,
  // hors lot: Expected 840 / Received 120 sur le check K).
  //
  // L'appelant fournit le jeton (COOKDRIVE_INSTANCE_TOKEN) : ainsi le test sait
  // d'avance ce qu'il doit attendre, sans avoir a le lire dans une route. Sans
  // jeton fourni (lancement normal de l'app), on en genere un: l'en-tete reste
  // utile pour le diagnostic (deux instances qui rendent des diagnostics
  // distincts sur un même port).
  const INSTANCE_TOKEN = process.env.COOKDRIVE_INSTANCE_TOKEN || crypto.randomUUID();
  app.use((_req, res, next) => {
    res.setHeader("X-Cookdrive-Instance", INSTANCE_TOKEN);
    next();
  });

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

  // Identite (chantier 1) : charge la session depuis le cookie, PUIS la gate
  // juge. Ordre : session AVANT license — savoir QUI parle avant de decider de
  // bloquer. La license couvre toujours 100 % des /api/* (elle reste posee
  // avant tous les routeurs) ; /auth/* lui est exemptee (s'authentifier n'est
  // pas un acte metier) et les GET restent ouverts des deux cotes.
  app.use("/api", cookieParser(), sessionMiddleware(db), sessionGate());

  // Middleware de licence — posé AVANT toutes les routes pour couvrir 100 % des
  // routes /api/* (in-contournable). Bloque les mutations si trial expiré +
  // non unlocké ; les GET restent autorisés.
  app.use("/api", licenseMiddleware(db, licenseState));

  // Audit trail (chantier 2) : un SEUL logger, fabrique une fois, passe aux
  // routeurs. Toute mutation appelle logAudit(req, res, ...) — la tracabilite
  // HACCP (regl. (CE) n°852/2004 art. 5) vit dans cette table.
  const logAudit = createAuditLogger(db);
  // Les deux routeurs racine (settings/backup, non factorises) partagent la db.
  setAuditDb(db);

  // Comptes (maitre only) + login/logout/setup/me (exemptes de session).
  app.use(authRouter(db, logAudit));

  // --- Routeurs ---
  // /api racine : settings, backup, network-info, ollama/status
  app.use(settingsRouter);
  app.use(backupRouter);
  // Routeurs montés à la racine (leurs chemins commencent par /api/...)
  app.use(inventoryRouter(db, logAudit));
  app.use(suppliersRouter(db, logAudit));
  app.use(documentsRouter(db, logAudit));
  app.use(menuRouter(db, logAudit));
  app.use(licensingRouterFactory(db, licenseState, logAudit));
  app.use(haccpRouter(db, logAudit));
  app.use(staffRouter(db, logAudit));
  app.use(searchRouter(db, logAudit));
  app.use(dashboardRouter(db));
  app.use(recipesRouter(db, logAudit));
  app.use(menuplanningRouter(db, logAudit));
  app.use(adminRouter(storageDir, logAudit));
  app.use(epicureRouter(logAudit));
  app.use(robotsRouter(db, logAudit));
  app.use(supplierpricesRouter(db, logAudit));
  app.use(antiwasteRouter(db, logAudit));
  app.use(aiRouter(db, logAudit));
  // Boite de suggestions (chantier 3) : la SEULE ecriture de l'agent (§8).
  app.use(suggestionsRouter(db, logAudit));
  // Moteur de surveillance (chantier 4) : regles -> suggestions. N'ecrit
  // JAMAIS le metier (§8), depose dans la boite du chantier 3.
  app.use(surveillanceRouter(db, logAudit));
  // Cerveau Hermes (chantier 5) : contexte -> consigne -> LLM injecte ->
  // propositions validees -> suggestions. LLM JAMAIS juge par une porte.
  app.use(hermesRouter(db, logAudit));
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
  // Le port SORT d'un environnement absent, mais il a un maitre : quand l'appelant
  // l'a demande Explicitement (PORT dans l'environnement), c'est un CONTRAT et non
  // une suggestion. L'ancien comportement faisait PORT++ en silence sur EADDRINUSE,
  // ce qui produisait le pire des defauts: un harnais de mutations qui impose un
  // port pour juger une source MUTEE se retrouvait a juger une AUTRE instance, celle
  // qui tenait deja le port (le serveur mute, lui, ecoutait un cran plus loin). Le
  // test passait VERT sur une source qu'il n'avait jamais chargee et le harnais
  // annoncait, a tort, « la mutation ne mord pas ».
  //
  // Regle: pas de translacion silencieuse. On ne cede le port demande que si personne
  // ne l'a demande (le defaut 3000, lui, peut glisser d'un cran sans consequence).
  const PORT_IMPOSE = process.env.PORT !== undefined && process.env.PORT !== "";
  // Le port qui avoit ete demande, fige AVANT toute recursion. Le piege, mesure
  // par scripts/probe-ready-parity.mjs (check S-b) : capture a l'interieur de
  // `startListening`, cette constante prenait la valeur de PORT a CHAQUE rappel
  // recursif — donc apres un `PORT++`. Le serveur avait bien glisse de 3000 a
  // 3002 et l'annonce rendait `glisse:false`, c'est-a-dire le contraire exact de
  // l'information que le client Electron attend de ce champ (il s'en sert pour
  // prevenir que le port demande etait pris). Fige ici, elle ne bouge plus.
  const PORT_DEMANDE = PORT;
  const startListening = () => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
      // L'annonce du port REELlement obtenu (voir src/services/ready.ts). Elle
      // est faite ici et pas plus haut: `server.address()` n'a de sens qu'apres
      // le succes du bind, et c'est le seul endroit qui connaisse a la fois
      // l'identite d'instance et le port que l'OS a laisse.
      try {
        announceReady(server, { host: HOST, demandedPort: PORT_DEMANDE, instance: INSTANCE_TOKEN });
      } catch (e) {
        // Une annonce qui jette ne doit pas faire tomber un serveur qui tient
        // deja son port et sert tres bien.
        console.error("[ready] annonce rate:", e);
      }
    });
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE" && !PORT_IMPOSE) {
        console.error(`Port ${PORT} is in use, trying next port...`);
        PORT++;
        startListening();
        return;
      }
      if (err.code === "EADDRINUSE") {
        // Mort dans l'oeuf: on meurt sur le port demande au lieu de vivre ailleurs.
        console.error(
          `Port ${PORT} is in use and was EXPLICITLY requested (PORT=${process.env.PORT}); ` +
            `refusing to listen on another port.`,
        );
        process.exit(1);
      }
      console.error("Server error:", err);
    });
  };
  startListening();
}

startServer();
