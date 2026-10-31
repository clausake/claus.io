// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Le split CSV, la détection d'en-têtes et la construction des `items` ne
// touchaient aucun state (mesuré). Le garde `lines.length < 2` (qui appelait
// toast/setIsAnalyzingImport, donc COUPLÉ) reste dans le composant : cette
// fonction retourne { lines, items } pour que le composant rejoue le même garde
// et le même « items.length === 0 » à l'identique.
export const parseCsvItems = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map(line =>
      line.split(/[;,]/).map(cell => cell.trim().replace(/^"(.*)"$/, '$1'))
    )
    .filter(l => l.some(cell => cell !== ''));

  const headerRow = lines[0] || [];
  let nameIdx = -1;
  let priceIdx = -1;
  let unitIdx = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const l = headerRow[i].toLowerCase();
    if (l.includes('design') || l.includes('prod') || l.includes('article') || l.includes('nom') || l.includes('item') || l.includes('name') || l.includes('libell')) {
      nameIdx = i;
    } else if (l.includes('prix') || l.includes('price') || l.includes('tarif') || l.includes('cost') || l.includes('u.p')) {
      priceIdx = i;
    } else if (l.includes('unit') || l.includes('cond') || l.includes('pack')) {
      unitIdx = i;
    }
  }

  if (nameIdx === -1) nameIdx = 0;
  if (priceIdx === -1) priceIdx = headerRow.length > 1 ? 1 : 0;
  if (unitIdx === -1 && headerRow.length > 2) unitIdx = 2;

  const items: { raw_name: string; raw_price: number; raw_unit: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length <= Math.max(nameIdx, priceIdx)) continue;
    const raw_name = line[nameIdx];
    const raw_price = parseFloat(line[priceIdx]?.replace(',', '.'));
    const raw_unit = unitIdx !== -1 ? line[unitIdx] : 'kg';
    if (raw_name && !isNaN(raw_price)) {
      items.push({ raw_name, raw_price, raw_unit });
    }
  }
  return { lines, items };
};
