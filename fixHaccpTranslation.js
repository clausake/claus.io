import fs from 'fs';

let haccpText = fs.readFileSync('src/components/HaccpModules.tsx', 'utf8');

// Change the signature of AdmissionModule to accept translateIngredient
haccpText = haccpText.replace(
  /export const AdmissionModule = \(\{ t \}: \{ t: any \}\) => \{/,
  'export const AdmissionModule = ({ t, translateIngredient }: { t: any, translateIngredient?: (name: string, lang: string) => string }) => {'
);
// Make sure we use it properly
haccpText = haccpText.replace(
  /<option key=\{i\.id\} value=\{i\.id\}>i\.name<\/option>/g, // this is if the replace reverted it
  '<option key={i.id} value={i.id}>{translateIngredient ? translateIngredient(i.name, t.language) : i.name}</option>'
);
haccpText = haccpText.replace(
  /<option key=\{i\.id\} value=\{i\.id\}>\{i\.name\}<\/option>/g,
  '<option key={i.id} value={i.id}>{translateIngredient ? translateIngredient(i.name, t.language) : i.name}</option>'
);

fs.writeFileSync('src/components/HaccpModules.tsx', haccpText);

let haccpMain = fs.readFileSync('src/components/Haccp.tsx', 'utf8');

// Pass translateIngredient to AdmissionModule
haccpMain = haccpMain.replace(
  /<AdmissionModule t=\{t\} \/>/,
  '<AdmissionModule t={t} translateIngredient={translateIngredient} />'
);

// Add translateIngredient to Haccp component props if not there:
haccpMain = haccpMain.replace(
  /export function HaccpTab\(\{ t \}: \{ t: any \}\) \{/,
  'export function HaccpTab({ t, translateIngredient }: { t: any, translateIngredient?: (name: string, lang: string) => string }) {'
);

fs.writeFileSync('src/components/Haccp.tsx', haccpMain);

// Also pass translateIngredient down from App.tsx
let appText = fs.readFileSync('src/App.tsx', 'utf8');
appText = appText.replace(/<HaccpTab t=\{t\} \/>/, '<HaccpTab t={t} translateIngredient={translateIngredientHelper} />');
fs.writeFileSync('src/App.tsx', appText);

console.log('Passed translateIngredient down the tree');
