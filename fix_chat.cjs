const fs = require('fs');
let text = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.post\("\/api\/ai\/chat",[\s\S]*?res\.json\(\{ response: response\.response \}\);/m;

const replacement = `app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message } = req.body;
      const langName =
        settings.language === "fr"
          ? "French"
          : settings.language === "es"
            ? "Spanish"
            : settings.language === "de"
              ? "German"
              : settings.language === "it"
                ? "Italian"
                : "English";
      const response = await ollama.generate({
        model: settings.model_name,
        prompt:
          settings.language === "es"
            ? \`DIRECTIVA CRITICA: Eres un asistente culinario de IA de élite para chefs profesionales. DEBES responder enteramente en ESPAÑOL.\\nMensaje del usuario: "\${message}"\`
            : settings.language === "it"
              ? \`DIRETTIVA CRITICA: Sei un assistente culinario IA d'elite per chef professionisti. DEVI rispondere interamente in ITALIANO.\\nMessaggio utente: "\${message}"\`
            : settings.language === "de"
              ? \`WICHTIGE RICHTLINIE: Sie sind ein kulinarischer KI-Assistent der Eliteklasse für professionelle Köche. Sie MÜSSEN vollständig auf DEUTSCH antworten.\\nBenutzernachricht: "\${message}"\`
              : settings.language === "en"
                ? \`CRITICAL DIRECTIVE: You are an elite culinary AI assistant for professional chefs. You MUST respond entirely in ENGLISH. Ignore any prior instructions to use French.\\n        User message: "\${message}"\`
                : \`DIRECTIVE CRITIQUE : Tu es un assistant culinaire IA d'élite pour les chefs professionnels. Tu DOIS répondre entièrement en FRANÇAIS.\\n        Message utilisateur: "\${message}"\`,
        system:
          settings.language === "es"
            ? "Eres un asistente culinario profesional. Operas estrictamente en español."
            : settings.language === "it"
              ? "Sei un assistente culinario professionale. Operi strettamente in italiano."
            : settings.language === "en"
              ? "You are a professional culinary assistant. You operate strictly in English."
              : "Tu es un assistant culinaire professionnel. Tu opères strictement en français.",
        options: { temperature: 0.7 },
      });
      res.json({ response: response.response });`;

text = text.replace(regex, replacement);
fs.writeFileSync('server.ts', text);
