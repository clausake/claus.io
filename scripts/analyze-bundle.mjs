// Somme les octets du chunk principal par module racine (node_modules) / fichier src.
// Usage: node scripts/analyze-bundle.mjs [chunkBasename]  (defaut: le plus gros index-*.js)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist/assets";
const files = readdirSync(dir);
const maps = files.filter((f) => f.endsWith(".js.map"));
if (!maps.length) {
  console.error("aucun .js.map — relance : npx vite build --sourcemap");
  process.exit(1);
}
const target = process.argv[2];
// On cible le chunk emis le plus lourd (hors vendor-*) puis son .map associe.
const pick = (() => {
  if (target) {
    const hit = files.find((f) => f.endsWith(".js") && f.startsWith(target));
    return hit ? hit + ".map" : undefined;
  }
  const js = files
    .filter((f) => f.endsWith(".js") && !f.startsWith("vendor-"))
    .map((f) => ({ f, size: readFileSync(join(dir, f)).size }))
    .sort((a, b) => b.size - a.size);
  return js.length ? js[0].f + ".map" : undefined;
})();
if (!pick) {
  console.error("chunk introuvable");
  process.exit(1);
}

const map = JSON.parse(readFileSync(join(dir, pick), "utf8"));
const acc = new Map();
let total = 0;
for (const [i, src] of map.sources.entries()) {
  const bytes = map.sourcesContent[i]?.length ?? 0;
  if (!bytes) continue;
  total += bytes;
  const key = src.includes("node_modules/")
    ? "npm:" + src.split("node_modules/").pop().split("/").slice(0, src.split("node_modules/").pop().startsWith("@") ? 2 : 1).join("/")
    : src.replace(/^\.\.\/\.\.\//, "").split("?")[0];
  acc.set(key, (acc.get(key) ?? 0) + bytes);
}
const rows = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log("chunk:", pick, "| sources source-map:", map.sources.length);
for (const [k, v] of rows) console.log(String(Math.round(v / 1024)).padStart(6) + " kB  " + k);
console.log("total sources:", Math.round(total / 1024) + " kB");
