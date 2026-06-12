const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The replacement logic:
code = code.replace(
  /}\`;\n\s+const singlePrompt = settings\.language === "it" \? \\`RISPONDI ESCLUSIVAMENTE IN JSON \(un solo piatto\):/g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \`RISPONDI ESCLUSIVAMENTE IN JSON (un solo piatto):`
);

// Route 2: generate-traditional-menu
code = code.replace(
  /}\`;\n\s+const singlePrompt = settings\.language === "it" \? \\`IMPORTANTE : TUTTA LA TUA RISPOSTA DEVE ESSERE IN ITALIANO\./g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \`IMPORTANTE : TUTTA LA TUA RISPOSTA DEVE ESSERE IN ITALIANO.`
);

// Route 3: generate-gastronomic-menu
// Because we have `RISPONDI ESCLUSIVAMENTE IN JSON:` alone
code = code.replace(
  /}\`;\n\s+const singlePrompt = settings\.language === "it" \? \\`RISPONDI ESCLUSIVAMENTE IN JSON:\n{"gastronomic_menu"/g,
  `}\`;\n        const singlePrompt = settings.language === "it" ? \`RISPONDI ESCLUSIVAMENTE IN JSON:\n{"gastronomic_menu"`
);

// We also need to fix `finalPrompt` missing!
// The TS errors told us: `1557: error TS1434: Unexpected keyword or identifier`
// Let's check what is at the end of singlePrompt for route 1.

fs.writeFileSync('server.ts.repaired', code);
console.log('Saved to server.ts.repaired');
