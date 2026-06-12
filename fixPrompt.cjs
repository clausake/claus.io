const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf-8');
c = c.replace(/Generate a \$\{isSingle \? 'SINGLE gastronomic dish' : '7-DAY gastronomic menu'\}/, "Generate a ${isSingle ? 'SINGLE gastronomic full-course meal (entree, plat, dessert)' : '7-DAY gastronomic menu'}");
fs.writeFileSync('server.ts', c);
