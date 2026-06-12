import fs from 'fs';

let haccpMain = fs.readFileSync('src/components/Haccp.tsx', 'utf8');

haccpMain = haccpMain.replace(
  /export function Haccp\(\{ t \}: \{ t: any \}\) \{/,
  'export function Haccp({ t, translateIngredient }: { t: any, translateIngredient?: (name: string, lang: string) => string }) {'
);

fs.writeFileSync('src/components/Haccp.tsx', haccpMain);

let appText = fs.readFileSync('src/App.tsx', 'utf8');
appText = appText.replace(/<Haccp t=\{t\} \/>/, '<Haccp t={t} translateIngredient={translateIngredientHelper} />');
fs.writeFileSync('src/App.tsx', appText);
