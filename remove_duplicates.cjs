const fs = require('fs');
const ts = require('typescript');

const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

const duplicatesToRemove = [];

function visit(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const keys = new Set();
    const props = [...node.properties]; // Process in reverse
    props.reverse();
    
    for (const prop of props) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const name = prop.name.text;
        if (keys.has(name)) {
          // It's a duplicate (earlier in the file, since we reversed)
          // We will remove the earlier one
          duplicatesToRemove.push({
            start: prop.getStart(sourceFile),
            end: prop.getEnd()
          });
        }
        keys.add(name);
      } else if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.name)) {
        const name = prop.name.text;
        if (keys.has(name)) {
          duplicatesToRemove.push({
            start: prop.getStart(sourceFile),
            end: prop.getEnd()
          });
        }
        keys.add(name);
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

// Sort in descending order to not mess up indices during removal
duplicatesToRemove.sort((a, b) => b.start - a.start);

for (const {start, end} of duplicatesToRemove) {
  // Find the comma after or before
  let removeStart = start;
  let removeEnd = end;
  
  // Try to remove trailing comma
  while (code[removeEnd] === ' ' || code[removeEnd] === '\n' || code[removeEnd] === '\r') {
    removeEnd++;
  }
  if (code[removeEnd] === ',') {
    removeEnd++;
  } else {
    // try removing preceding comma
    let temp = removeStart - 1;
    while (temp > 0 && (code[temp] === ' ' || code[temp] === '\n' || code[temp] === '\r')) {
      temp--;
    }
    if (code[temp] === ',') {
      removeStart = temp;
    }
  }

  code = code.substring(0, removeStart) + code.substring(removeEnd);
}

fs.writeFileSync(file, code);
console.log('Removed ' + duplicatesToRemove.length + ' duplicated keys');
