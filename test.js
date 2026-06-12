import { jsonrepair } from 'jsonrepair';
const text = '{"test": "hello \\L\\u00e9gumine", "plat": {"nom": "plat name"}}';
try {
  console.log("parse:");
  console.log(JSON.parse(text));
} catch(e) {
  console.log("Parse error:", e);
  console.log("repaired:");
  console.log(jsonrepair(text));
}
