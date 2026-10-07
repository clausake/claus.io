// Routes : Épicure (analyse de saveurs, recommandations, vocabulaire)
import { Router } from "express";
import { EpicureModel } from "../../epicure.js";
import { ollamaSettingsRef } from "../shared/ollama.js";
import type { AuditLogger } from "../services/audit.js";

const epicureModel = new EpicureModel();

export default function createRouter(logAudit: AuditLogger) {
  const router = Router();

  router.post("/api/epicure/analyze", async (req, res) => {
    try {
      const { ingredients, language } = req.body;
      if (!Array.isArray(ingredients)) {
        return res.status(400).json({ error: "ingredients must be an array" });
      }
      const lang = language || ollamaSettingsRef.current.language || "fr";
      const result = epicureModel.analyzeRecipe(ingredients, lang);
      await logAudit(req, res, { route: "/api/epicure/analyze", action: "analyze" });
      res.json(result);
    } catch (error) {
      console.error("[Epicure Analysis Error]:", error);
      res.status(500).json({ error: "Failed to analyze ingredients." });
    }
  });

  router.get("/api/epicure/recommendations", async (req, res) => {
    try {
      const { ingredient, limit, language } = req.query;
      if (!ingredient || typeof ingredient !== "string") {
        return res.status(400).json({ error: "Missing ingredient query parameter" });
      }
      const lang = (language as string) || ollamaSettingsRef.current.language || "fr";
      const limitVal = limit ? parseInt(limit as string, 10) : 10;
      const recs = epicureModel.getRecommendations(ingredient, limitVal, lang);
      res.json({
        ingredient,
        mappedKey: epicureModel.mapToVocab(ingredient, lang),
        recommendations: recs
      });
    } catch (error) {
      console.error("[Epicure Recommendations Error]:", error);
      res.status(500).json({ error: "Failed to get flavor recommendations." });
    }
  });

  router.get("/api/epicure/vocab-list", async (req, res) => {
    try {
      const lang = (req.query.language as string) || ollamaSettingsRef.current.language || "fr";
      const list = epicureModel.vocabList.map(key => ({
        key,
        localized: epicureModel.getLocalizedName(key, lang)
      })).sort((a, b) => a.localized.localeCompare(b.localized));
      res.json(list);
    } catch (error) {
      console.error("[Epicure Vocab List Error]:", error);
      res.status(500).json({ error: "Failed to load vocabulary list." });
    }
  });

  return router;
}
