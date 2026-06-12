const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'window.open("/api/admin/db-download", "_blank");',
  `const a = document.createElement("a");
    a.href = "/api/admin/db-download";
    a.download = "agent_culinaire.sqlite";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);`
);

fs.writeFileSync('src/App.tsx', code);
