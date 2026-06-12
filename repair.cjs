const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The replacement logic:
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
// Because we have `RISPONDI ESCLUSIVAMENTE IN JSON:` alone
code = code.replace(
  /}\`;\s+RISPONDI ESCLUSIVAMENTE IN JSON:\s+{"gastronomic_menu"/g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \\\`RISPONDI ESCLUSIVAMENTE IN JSON:\n{"gastronomic_menu"`
);

// Second syntax issue: around line 1500 etc. Wait, we ONLY missed the `const singlePrompt = settings.language === "it" ? \``! 
// If we add this logic, that template string starts correctly.
// Does it close correctly?
// We need to look at what `singlePrompt` logic ends with.
// Wait! `singlePrompt` isn't declared... And `finalPrompt` doesn't exist either!

fs.writeFileSync('server.ts.repaired', code);
console.log('Saved to server.ts.repaired');
