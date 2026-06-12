const fs = require('fs');
let c = fs.readFileSync('build_pro_guide_exact.cjs', 'utf8');
c = c.replace(/\\\\"/g, "'");
fs.writeFileSync('build_pro_guide_exact.cjs', c);
