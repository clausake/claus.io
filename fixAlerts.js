import fs from 'fs';

let appText = fs.readFileSync('src/App.tsx', 'utf8');

// The alerts function:
const transAlrt = `
              {(() => {
                const match = alertItem.message.match(/Stock d'alerte : (.*?) \\((.*?) (.*?) restant pour un minimum de (.*?) (.*?) paramétré\\)/);
                if (match && t.language !== 'fr') {
                   const itemTranslated = translateIngredientHelper(match[1].trim(), t.language);
                   if (t.language === 'en') return <p className="text-slate-500 mt-2">Low Stock : {itemTranslated} ({match[2]} {match[3]} remaining, minimum set at {match[4]} {match[5]})</p>;
                   if (t.language === 'es') return <p className="text-slate-500 mt-2">Stock Crítico : {itemTranslated} ({match[2]} {match[3]} restante de {match[4]} {match[5]} mínimo configurado)</p>;
                }
                return <p className="text-slate-500 mt-2">{alertItem.message}</p>;
              })()}
`.trim();

appText = appText.replace(/<p className="text-slate-500 mt-2">\{alertItem\.message\}<\/p>/g, transAlrt);

fs.writeFileSync('src/App.tsx', appText);

console.log('Fixed alerts display in App.tsx');
