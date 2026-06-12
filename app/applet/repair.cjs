const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The replacement logic: we look for instances where it goes from `}` to `RISPONDI` or `IMPORTANTE : TUTTA` or `RISPONDI ESCLUSIVAMENTE IN JSON:` and replace them with the missing TS assignment logic.

// Route 1: generate-creative-menu
code = code.replace(
  /}\`;\s+RISPONDI ESCLUSIVAMENTE IN JSON \(un solo piatto\):/g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \\\`RISPONDI ESCLUSIVAMENTE IN JSON (un solo piatto):`
);

// Route 2: generate-traditional-menu
code = code.replace(
  /}\`;\s+IMPORTANTE : TUTTA LA TUA RISPOSTA DEVE ESSERE IN ITALIANO\./g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \\\`IMPORTANTE : TUTTA LA TUA RISPOSTA DEVE ESSERE IN ITALIANO.`
);

// Route 3: generate-gastronomic-menu
code = code.replace(
  /}\`;\s+RISPONDI ESCLUSIVAMENTE IN JSON:\s+{"gastronomic_menu"/g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \\\`RISPONDI ESCLUSIVAMENTE IN JSON:\n{"gastronomic_menu"`
);

// Also we need to check if there is an assignment before `ollama.generate` that is broken.
// Since `singlePrompt` is being defined, but missing `const finalPrompt = req.body.mode === 'single' ? singlePrompt : prompt;`?
// Let's check if `finalPrompt` is used in the codebase.

fs.writeFileSync('server.ts.repaired', code);
console.log('Saved to server.ts.repaired');
