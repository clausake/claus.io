const fs = require('fs');
let code = fs.readFileSync('build_pro_guide_exact.cjs', 'utf8');

code = code.replace('\\"Operating System\\"', "'Operating System'");
code = code.replace(/\\"/g, "'");

fs.writeFileSync('build_pro_guide_exact.cjs', code);
