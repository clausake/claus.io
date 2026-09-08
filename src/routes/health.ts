// Routes : Sante (statut du modele Ollama + modele installe) + perf par route.
import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { getOllamaHost } from "../shared/util.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import { perf } from "../services/perf.js";

const router = Router();

// GET /health/perf -- instantane des latences par route (percentiles mesures
// dans l'app par le middleware http-logger). La lecture de cette route n'est
// pas elle-meme mesuree (exclue du logger) : sinon le poll auto-mesurerait sa
// propre lecture et fausserait les stats qu'il est cense eclairer.
router.get("/health/perf", (_req, res) => {
  const snap = perf.snapshot(20);
  res.json({ ok: true, ...snap });
});

router.get("/health", async (_req, res) => {
const lang = ollamaSettingsRef.current.language || "fr";
const model = getModel(ollamaSettingsRef.current);
const host = getOllamaHost(ollamaSettingsRef.current);

const messages = {
  ok: {
    fr: `Pr\xEAt. Mod\xE8le "${model}" disponible sur ${host}.`,
    es: `Listo. Modelo "${model}" disponible en ${host}.`,
    de: `Bereit. Modell "${model}" verf\xFCgbar auf ${host}.`,
    it: `Pronto. Modello "${model}" disponibile su ${host}.`,
    en: `Ready. Model "${model}" available on ${host}.`,
  },
  unreachable: {
    fr: `Ollama est injoignable sur ${host}. V\xE9rifiez qu'il est bien lanc\xE9 (commande: ollama serve).`,
    es: `Ollama no responde en ${host}. Verifique que est\xE9 en ejecuci\xF3n (ollama serve).`,
    de: `Ollama ist unter ${host} nicht erreichbar. Stellen Sie sicher, dass es l\xE4uft (ollama serve).`,
    it: `Ollama non \xE8 raggiungibile su ${host}. Verificate che sia avviato (ollama serve).`,
    en: `Ollama is unreachable on ${host}. Make sure it is running (ollama serve).`,
  },
  missing: {
    fr: `Le mod\xE8le "${model}" n'est pas install\xE9. Lancez: ollama pull ${model}`,
    es: `El modelo "${model}" no est\xE1 instalado. Ejecute: ollama pull ${model}`,
    de: `Das Modell "${model}" ist nicht installiert. F\xFChren Sie aus: ollama pull ${model}`,
    it: `Il modello "${model}" non \xE8 installato. Eseguite: ollama pull ${model}`,
    en: `Model "${model}" is not installed. Run: ollama pull ${model}`,
  },
};
const pick = (key: "ok" | "unreachable" | "missing") =>
  messages[key][lang as keyof (typeof messages)["ok"]] || messages[key].en;

// Champs additionnels : taille DB, disque libre, memoire processus
const resolveDataDir = (): string => {
  let storageDir = process.env.USER_DATA_PATH;
  if (!storageDir) {
    const home = os.homedir();
    if (process.platform === "win32") {
      storageDir = path.join(home, "AppData", "Roaming", "ClausIO");
    } else {
      storageDir = path.join(home, ".clausio");
    }
  }
  return storageDir;
};
const dataDir = resolveDataDir();
const dbPath = path.join(dataDir, "agent_culinaire.db");
let dbSize = 0;
try {
  if (fs.existsSync(dbPath)) {
    dbSize = Math.round(fs.statSync(dbPath).size / 1024);
  }
} catch {
  dbSize = 0;
}
let diskFree = -1;
try {
  const statfsFn = (fs as any).statfs;
  if (typeof statfsFn === "function") {
    const stats = statfsFn.sync(dataDir);
    diskFree = Math.round((stats.bavail * stats.bsize) / 1e9);
  }
} catch {
  diskFree = -1;
}
const memUsed = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;

try {
  const list = await ollama.list();
  const installed = (list.models || []).map((m: any) => m.name || m.model || "");
  const modelInstalled = installed.some(
    (n: string) => n === model || n.split(":")[0] === String(model).split(":")[0],
  );
  res.json({
    ok: modelInstalled,
    ollamaReachable: true,
    modelInstalled,
    model,
    host,
    installedModels: installed,
    dbSize,
    diskFree,
    memUsed,
    message: pick(modelInstalled ? "ok" : "missing"),
  });
} catch (error) {
  res.json({
    ok: false,
    ollamaReachable: false,
    modelInstalled: false,
    model,
    host,
    installedModels: [],
    dbSize,
    diskFree,
    memUsed,
    message: pick("unreachable"),
  });
}
});
export default router;
