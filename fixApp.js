import fs from 'fs';

let text = fs.readFileSync('src/App.tsx', 'utf8');

text = text.replace(/{settings\.language === 'fr' \? 'La génération créative ne suit plus de cycle fixe pour garantir une exclusivité totale à chaque service\.' : 'Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service\.'}/g, "{settings.language === 'fr' ? 'La génération créative ne suit plus de cycle fixe pour garantir une exclusivité totale à chaque service.' : settings.language === 'es' ? 'La generación creativa ya no sigue un ciclo fijo para garantizar la exclusividad total de cada servicio.' : 'Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service.'}");

text = text.replace(/const month = date\.toLocaleString\(t\.language === 'fr' \? 'fr-FR' : 'en-US', \{ month: 'long', year: 'numeric' \}\);/g, "const month = date.toLocaleString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : 'en-US', { month: 'long', year: 'numeric' });");

text = text.replace(/const day = date\.toLocaleDateString\(t\.language === 'fr' \? 'fr-FR' : 'en-US', \{ day: 'numeric', month: 'long' \}\);/g, "const day = date.toLocaleDateString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long' });");

fs.writeFileSync('src/App.tsx', text);
