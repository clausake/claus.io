// Routes : Paramètres + statut Ollama + infos réseau
import { Router } from "express";
import os from "os";
import { getOllamaHost } from "../shared/util.js";
import { ollama, ollamaSettingsRef } from "../shared/ollama.js";
import { settingsStore, updateSettings } from "../services/settings.js";

const router = Router();

router.get("/api/settings", (_req, res) => {
  res.json(settingsStore.value);
});
router.post("/api/settings", (req, res) => {
  const settings = updateSettings(req.body);
  res.json({ status: "success", settings });
});
router.get("/api/network-info", (_req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = "localhost";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  const port = Number(process.env.PORT) || 3000;
  res.json({ ip: localIp, port, url: `http://${localIp}:${port}` });
});
router.get("/api/ollama/status", async (_req, res) => {
  const host = getOllamaHost(settingsStore.value);
  try {
    console.log(`[DEBUG] Tentative de connexion à Ollama sur ${host}`);
    const list = await ollama.list();
    console.log("[DEBUG] Ollama connecté, modèles trouvés:", list.models.length);
    res.json({ status: "connected", models: list.models });
  } catch (error) {
    console.error(`[OLLAMA ERROR] Impossible de joindre ${host}`, error);
    res.status(500).json({
      status: "disconnected",
      error: `Ollama injoignable sur ${host}. Vérifiez qu'il est en cours d'exécution.`,
    });
  }
});

export default router;
