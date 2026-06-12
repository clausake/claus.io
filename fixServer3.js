import fs from 'fs';

let text = fs.readFileSync('server.ts', 'utf8');

// The /api/voice route
const voiceMatch = /prompt: settings\.language === 'en' \? \n        `CRITICAL DIRECTIVE/g;
text = text.replace(voiceMatch, "prompt: settings.language === 'es' ? `DIRECTIVA: Eres CLAUS.IO, asistente culinario. Operas EN ESPAÑOL.\\nUsuario: \\\"\${message}\\\"\\nSi agrega al carrito, responde JSON:\\n{\\\"intent\\\":\\\"add_to_cart\\\",\\\"item\\\":\\\"nombre\\\",\\\"quantity\\\":1,\\\"unit\\\":\\\"kg\\\",\\\"response\\\":\\\"Mensaje\\\"}\\nOtra cosa:\\n{\\\"intent\\\":\\\"general_advice\\\",\\\"response\\\":\\\"Respuesta\\\"}\\nSÓLO JSON.` : settings.language === 'en' ? \\n        `CRITICAL DIRECTIVE");

// The /api/chat route
const chatMatch = /prompt: settings\.language === 'en' \? \n          `You are an interactive/g;
text = text.replace(chatMatch, "prompt: settings.language === 'es' ? `Eres un asistente interactivo culinario.` : settings.language === 'en' ? \\n          `You are an interactive");

// The /api/agent/command route (already done?) Wait, no, voice was 2127. Let's see:
text = text.replace(/const prompt = settings\.language === 'en' \? \n        `Analyze the following kitchen command/g, "const prompt = settings.language === 'es' ? `Analiza el comando de voz de la cocina de acuerdo a la base de datos:\\n\${message}\\nDevuelve JSON con actions.` : settings.language === 'en' ? \\n        `Analyze the following kitchen command");

fs.writeFileSync('server.ts', text);
