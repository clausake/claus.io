const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const parts = code.split('app.post("/api/documents/:id/extract"');
if (parts.length > 1) {
    let extractPart = parts[1];
    extractPart = extractPart.replace(/req\.pdfText/g, 'pdfText');
    code = parts[0] + 'app.post("/api/documents/:id/extract"' + extractPart;
    fs.writeFileSync('server.ts', code);
    console.log("Fixed req.pdfText in extract part");
}
