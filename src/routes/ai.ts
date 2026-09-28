// Routes : IA (voice assistant + chat)
import { Router } from "express";
import type { Database } from "sqlite";
import { safeJsonParse } from "../shared/util.js";
import { ollama, getModel, ollamaSettingsRef } from "../shared/ollama.js";
import { blocHistorique, CONSIGNE_GABARIT } from "../shared/recette-chat.js";

export default function createRouter(db: Database) {
  const router = Router();

router.post("/api/voice", async (req, res) => {
try {
  const { message } = req.body;
  const langName =
    ollamaSettingsRef.current.language === "fr"
      ? "French"
      : ollamaSettingsRef.current.language === "es"
        ? "Spanish"
        : ollamaSettingsRef.current.language === "de"
          ? "German"
          : ollamaSettingsRef.current.language === "it"
            ? "Italian"
            : "English";
  const response = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt:
      ollamaSettingsRef.current.language === "it" ? `DIRETTIVA: Sei un assistente culinario esperto. Operi IN ITALIANO.\nUtente: "${message}"\nSe aggiunge al carrello, rispondi JSON:\n{"intent":"add_to_cart","item":"nome","quantity":1,"unit":"kg","response":"Messaggio"}\nAltrimenti:\n{"intent":"general_advice","response":"Risposta"}\nSOLO JSON.` : ollamaSettingsRef.current.language === "es"
        ? `DIRECTIVA: Eres un asistente culinario experto. Operas EN ESPA\xD1OL.
Usuario: "${message}"
Si agrega al carrito, responde JSON:
{"intent":"add_to_cart","item":"nombre","quantity":1,"unit":"kg","response":"Mensaje"}
Otra cosa:
{"intent":"general_advice","response":"Respuesta"}
S\xD3LO JSON.`
        : ollamaSettingsRef.current.language === "de"
          ? `RICHTLINIE: Du bist ein kompetenter kulinarischer Assistent. Du arbeitest AUF DEUTSCH.
Benutzer: "${message}"
Wenn etwas zum Warenkorb hinzugefügt wird, JSON antworten:
{"intent":"add_to_cart","item":"name","quantity":1,"unit":"kg","response":"Nachricht"}
Andernfalls:
{"intent":"general_advice","response":"Antwort"}
NUR JSON.`
          : ollamaSettingsRef.current.language === "en"
            ? `CRITICAL DIRECTIVE: You are an expert culinary assistant. You operate STRICTLY IN ENGLISH.
    The user says: "${message}"
    Analyze the intent. 
    If the user wants to add something to the cart, respond in JSON format ONLY:
    {
      "intent": "add_to_cart",
      "item": "ingredient name",
      "quantity": number,
      "unit": "unit",
      "response": "Confirmation message in English"
    }
    If it is a general question or advice:
    {
      "intent": "general_advice",
      "response": "Your expert culinary answer in English"
    }
    Respond ONLY in JSON.`
            : `DIRECTIVE CRITIQUE : Tu es un assistant culinaire expert. Tu op\xE8res STRICTEMENT EN FRAN\xC7AIS.
    L'utilisateur dit : "${message}"
    Analyse l'intention.
    Si l'utilisateur veut ajouter quelque chose au panier, r\xE9ponds UNIQUEMENT en format JSON :
    {
      "intent": "add_to_cart",
      "item": "nom de l'ingredient",
      "quantity": nombre,
      "unit": "unite",
      "response": "Message de confirmation en fran\xE7ais"
    }
    S'il s'agit d'une question ou d'un conseil g\xE9n\xE9ral :
    {
      "intent": "general_advice",
      "response": "Ta r\xE9ponse d'expert culinaire en fran\xE7ais"
    }
    R\xE9ponds UNIQUEMENT en JSON.`,
    format: "json",
  });
  const result = safeJsonParse(response.response);
  res.json(result);
} catch (error) {
  console.error("Voice API Error:", error);
  res.status(500).json({
    intent: "error",
    response: "D\xE9sol\xE9 Chef, j'ai eu un petit bug technique.",
  });
}
});

router.post("/api/ai/chat", async (req, res) => {
try {
  const { message } = req.body;
  // L'historique de l'echange est PORTE par le client (Sprint 16 : « et en
  // version vegane ? » / « sauvegarde ca » ne designent rien sans les tours
  // precedents). Il est NETTOYE ici — roles, type, taille — et BORNE : le
  // shared/recette-chat.historiqueSur fixe la fenetre, la relecture serveur
  // ne fait pas confiance au client pour ça.
  const bloc = blocHistorique(req.body?.history);
  const langName =
    ollamaSettingsRef.current.language === "fr"
      ? "French"
      : ollamaSettingsRef.current.language === "es"
        ? "Spanish"
        : ollamaSettingsRef.current.language === "de"
          ? "German"
          : ollamaSettingsRef.current.language === "it"
            ? "Italian"
            : "English";
  const response = await ollama.generate({
    model: getModel(ollamaSettingsRef.current),
    prompt:
      bloc +
      (ollamaSettingsRef.current.language === "es"
        ? `DIRECTIVA CRITICA: Eres un asistente culinario de IA de élite para chefs profesionales. DEBES responder enteramente en ESPAÑOL.\nMensaje del usuario: "${message}"`
        : ollamaSettingsRef.current.language === "it"
          ? `DIRETTIVA CRITICA: Sei un assistente culinario IA d'elite per chef professionisti. DEVI rispondere interamente in ITALIANO.\nMessaggio utente: "${message}"`
          : ollamaSettingsRef.current.language === "de"
            ? `WICHTIGE RICHTLINIE: Sie sind ein kulinarischer KI-Assistent der Eliteklasse für professionelle Köche. Sie MÜSSEN vollständig auf DEUTSCH antworten.\nBenutzernachricht: "${message}"`
            : ollamaSettingsRef.current.language === "en"
              ? `CRITICAL DIRECTIVE: You are an elite culinary AI assistant for professional chefs. You MUST respond entirely in ENGLISH. Ignore any prior instructions to use French.\n        User message: "${message}"`
              : `DIRECTIVE CRITIQUE : Tu es un assistant culinaire IA d'élite pour les chefs professionnels. Tu DOIS répondre entièrement en FRANÇAIS.\n        Message utilisateur: "${message}"`),
    system:
      (ollamaSettingsRef.current.language === "es"
        ? "Eres un asistente culinario profesional. Operas estrictamente en español."
        : ollamaSettingsRef.current.language === "it"
          ? "Sei un assistente culinario professionale. Operi strettamente in italiano."
          : ollamaSettingsRef.current.language === "en"
            ? "You are a professional culinary assistant. You operate strictly in English."
            : "Tu es un assistant culinaire professionnel. Tu opères strictement en français.") +
      // Le gabarit que le parseur de fiches LIT (shared/recette-chat) : sans
      // consigne le modele repond en prose libre et le bouton « Sauvegarder
      // en fiche » n'aurait rien a pre-remplir. null = formule vide, jamais
      // de devinette cote UI.
      "\n" + CONSIGNE_GABARIT,
    options: { temperature: 0.7 },
  });
  res.json({ response: response.response });
} catch (error) {
  console.error("Chat API Error:", error);
  res.status(500).json({
    response:
      ollamaSettingsRef.current.language === "es"
        ? "Lo siento Chef, estoy experimentando una dificultad técnica."
        : ollamaSettingsRef.current.language === "it"
          ? "Scusa Chef, sto riscontrando una difficoltà tecnica."
        : ollamaSettingsRef.current.language === "fr"
          ? "Désolé Chef, je rencontre une difficulté technique."
          : "Sorry Chef, I am experiencing a technical difficulty.",
  });
}
});

  return router;
}
