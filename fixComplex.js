import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

const targetTrial = '<p className="text-sm text-slate-400">Il vous reste {trialStatus.daysLeft} jours d\'essai pour tester CLAUS.IO.</p>';
const replacementTrial = '<p className="text-sm text-slate-400">{t.configTrialDesc ? t.configTrialDesc.replace("{days}", trialStatus.daysLeft.toString()) : "Il vous reste " + trialStatus.daysLeft + " jours d\'essai pour tester CLAUS.IO."}</p>';

appText = appText.replace(targetTrial, replacementTrial);

const chatRegex = /const \[messages, setMessages\] = useState<\{ role: 'user' \| 'assistant', content: string \}\[\]>\(\[\s*\{\s*role: 'assistant', content: t\.chatWelcome\s*\}\s*\]\);/;
const chatRepl = "const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);\\n  useEffect(() => {\\n    if (messages.length === 0) setMessages([{ role: 'assistant', content: t.chatWelcome }]);\\n  }, [t.language]);";

appText = appText.replace(chatRegex, chatRepl);

fs.writeFileSync('src/App.tsx', appText);
console.log("Fixed complex texts.");
