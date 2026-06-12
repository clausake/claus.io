const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/productUpper: "PRODUIT",/g, 'productUpper: "PRODUIT",\n    productionDate: "DATE DE FAB.",');
code = code.replace(/productUpper: "PRODUCT",/g, 'productUpper: "PRODUCT",\n    productionDate: "PRODUCTION DATE",');
code = code.replace(/productUpper: "PRODUKT",/g, 'productUpper: "PRODUKT",\n    productionDate: "PRODUKTIONSDATUM",');
code = code.replace(/productUpper: "PRODUCTO",/g, 'productUpper: "PRODUCTO",\n    productionDate: "FECHA DE PROD.",');
code = code.replace(/productUpper: "PRODOTTO",/g, 'productUpper: "PRODOTTO",\n    productionDate: "DATA DI PROD.",');

fs.writeFileSync('src/App.tsx', code);
