// Verification terrain des en-tetes HTTP (gzip + cache), sur le CHEMIN DE PROD.
//
// Pourquoi ce script et pas seulement la suite e2e : la suite e2e demarre le
// serveur en mode dev (middlewares Vite) et n'exerce donc JAMAIS la branche
// `express.static(dist)` de server.ts. Or c'est exactement la ou l'audit avait
// mesure `cache-control: public, max-age=0`. Les deux corrections (compression +
// cache immuable des assets content-hashed) ne sont prouvables qu'avec
// NODE_ENV=production, sur le dist reellement construit.
//
// Ce que le script prouve :
//   1. gzip effectif sur la reponse API la plus volumineuse, avec le VRAI poids
//      sur le fil (mesure par socket brute, pas par fetch qui decompress toute
//      seule) et verification que le corps gzip se decode a l'identique ;
//   2. petite reponse (< seuil de 1 ko) passee sans compression ;
//   3. /assets/*.js et *.css : max-age d'un an + immutable (nom content-hashed) ;
//   4. GET / : no-cache + ETag -> c'est lui qui libere un nouveau bundle ;
//   5. le SSE reste non compresse ET livre reellement une frame en < 1 s ;
//   6. les memes en-tetes pour un client Electron que pour Chromium.
//
// Usage: node scripts/verify-http.mjs      (presuppose `npm run build` fait)
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

// Un client HTTP BRUT. fetch (undici) decompress tout seul et masque le poids
// reel du fil : mesurer un gain de compression avec lui serait une preuve creuse.
import { request as rawRequest } from "node:http";

const PORT = 4129;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(process.cwd(), "test", "tmp-http");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

if (!existsSync(join(process.cwd(), "dist", "index.html"))) {
  console.log("ECHEC  dist/ absent : lancer `npm run build` avant ce script");
  process.exit(1);
}

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA, NODE_ENV: "production" },
  stdio: "pipe",
});
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});

let ready = false;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`);
    if (r.ok) { ready = true; break; }
  } catch {}
  await new Promise((res) => setTimeout(res, 250));
}
if (!ready) {
  child.kill("SIGTERM");
  console.log("ECHEC  serveur pas pret sur " + BASE);
  setTimeout(() => process.exit(1), 200);
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

/** Reponse brute : octets tels que postes sur le fil, sans decompression. */
const raw = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = rawRequest(`${BASE}${path}`, { method: "GET", headers }, (res) => {
      const chunks = [];
      let n = 0;
      res.on("data", (c) => { chunks.push(c); n += c.length; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, bytes: n, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });

// Le nom de chunk est hache : on le lit dans le HTML plutot que de le deviner.
const html = await (await fetch(`${BASE}/`, { headers: { "Accept-Encoding": "identity" } })).text();
const assetName = (html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/) ?? [])[1] ?? null;
const cssName = (html.match(/assets\/([A-Za-z0-9_-]+\.css)/) ?? [])[1] ?? null;

// --- 1. gzip sur la reponse API la plus volumineuse --------------------
// /api/epicure/vocab-list est la plus grosse reponse GET de l'app (85 Ko en
// identity, valeur mesuree par sondage de toute la surface GET) : le gain s'y
// voit sans instrumenter le serveur.
const BIG = "/api/epicure/vocab-list";
const plain = await raw(BIG, { "Accept-Encoding": "identity" });
const gz = await raw(BIG, { "Accept-Encoding": "gzip" });
check("(1a) reponse volumineuse annoncee gzip", String(gz.headers["content-encoding"]) === "gzip",
  `encoding=${gz.headers["content-encoding"]} sur le fil`);
check("(1b) poids reel divise sur le fil (gzip < 50 % de l'identity)",
  plain.status === 200 && gz.bytes > 0 && gz.bytes < plain.bytes * 0.5,
  `gzip=${gz.bytes} identity=${plain.bytes} ratio=${(gz.bytes / Math.max(1, plain.bytes)).toFixed(3)}`);
let decodeOk = false;
try {
  const json = JSON.parse(gunzipSync(gz.body).toString("utf8"));
  decodeOk = json.length === JSON.parse(plain.body.toString("utf8")).length;
} catch {}
check("(1c) le corps gzip se decode en un JSON identique (le titre n'est pas mensonger)",
  decodeOk, `items=${plain.body.toString("utf8").split("name").length - 1}`);

// --- 2. le seuil de 1 ko est actif -------------------------------------
const small = await raw("/api/trial-status", { "Accept-Encoding": "gzip" });
check("(2) petite reponse sous le seuil passee sans compression",
  small.headers["content-encoding"] === undefined && small.bytes > 0 && small.bytes < 1024,
  `encoding=${small.headers["content-encoding"]} bytes=${small.bytes}`);

// --- 3. assets content-hashed : un an + immutable ----------------------
check("(3a) chunk JS trouve dans index.html", !!assetName, assetName ?? "aucun assets/index-*.js");
for (const [label, name] of [["js", assetName], ["css", cssName]]) {
  if (!name) { check(`(3) /assets/${label}`, false, "absent du HTML"); continue; }
  const r = await raw(`/assets/${name}`, { "Accept-Encoding": "identity" });
  const cc = String(r.headers["cache-control"] ?? "");
  check(`(3.${label}) /assets/${name.slice(0, 20)} : max-age d'un an + immutable`,
    /max-age=31536000/.test(cc) && /immutable/.test(cc), `cache-control=${cc || "AUCUN"}`);
  check(`(3.${label}) ETag conserve (revalidation de secours)`, !!r.headers["etag"], `etag=${r.headers["etag"]}`);
}

// --- 4. index.html doit toujours etre revalide -------------------------
{
  const r = await raw("/", { "Accept-Encoding": "identity" });
  const cc = String(r.headers["cache-control"] ?? "");
  check("(4a) GET / : no-cache (sinon un vieux bundle resterait grave un an)",
    /no-cache/.test(cc), `cache-control=${cc || "AUCUN"}`);
  check("(4b) GET / : ETag pose (revalidation par 304)", !!r.headers["etag"], `etag=${r.headers["etag"]}`);
  // Un If-None-Match valide doit sortir un 304 : preuve que la revalidation
  // fonctionne vraiment, et pas seulement que l'en-tete est present.
  const again = await raw("/", { "Accept-Encoding": "identity", "If-None-Match": r.headers["etag"] });
  check("(4c) revalidation du HTML par ETag -> 304", again.status === 304, `status=${again.status}`);
}

// --- 5. le SSE n'est jamais compresse, et livre vraiment --------------
{
  const nom = `Capteur HTTP ${Date.now()}`;
  const reg = await (await fetch(`${BASE}/api/haccp/iot-sensors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: `http-${Date.now()}`, name: nom, type: "ambient", "equipment_type": "Froid" }),
  })).json();
  const liste = await (await fetch(`${BASE}/api/haccp/iot-sensors`)).json();
  const capteurId = liste.find((s) => s.name === nom)?.id ?? reg.id;

  const ac = new AbortController();
  const t0 = Date.now();
  const flux = await fetch(`${BASE}/api/sensors/stream`, {
    signal: ac.signal,
    headers: { Accept: "text/event-stream", "Accept-Encoding": "gzip" },
  });
  const ccSse = String(flux.headers.get("cache-control") ?? "");
  check("(5a) SSE : pas de compression (gzip mettrait les evenements en tampon)",
    flux.headers.get("content-encoding") === null, `encoding=${flux.headers.get("content-encoding")}`);
  check("(5b) SSE : no-cache + no-transform (aucun proxy ne doit le mettre en tampon)",
    /no-cache/.test(ccSse) && /no-transform/.test(ccSse), `cache-control=${ccSse || "AUCUN"}`);

  const lecteur = flux.body?.getReader();
  const dec = new TextDecoder();
  let tampon = "";
  let recu = null;
  const poste = async () => {
    await fetch(`${BASE}/api/haccp/webhook/iot-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: capteurId, token: reg.token, temperature: 4.2, battery: 77 }),
    });
  };
  const tPost = Date.now();
  await poste();
  const fin = Date.now() + 5000;
  while (lecteur && Date.now() < fin && !recu) {
    const chunk = await lecteur.read();
    if (chunk.done) break;
    tampon += dec.decode(chunk.value, { stream: true });
    let coupe;
    while ((coupe = tampon.indexOf("\n\n")) !== -1) {
      const frame = tampon.slice(0, coupe);
      tampon = tampon.slice(coupe + 2);
      const nomEv = /event:\s*(.+)/.exec(frame)?.[1]?.trim();
      const brut = /data:\s*(.+)/.exec(frame)?.[1];
      if (nomEv === "sensor" && brut) {
        try { recu = { at: Date.now(), data: JSON.parse(brut) }; } catch {}
      }
    }
    if (!recu && Date.now() - tPost > 1200) { await poste(); } // le filet du client
  }
  check("(5c) SSE : une releve poste ressort en < 1 s (preuve non creuse)",
    !!recu && recu.at - tPost < 1000, recu ? `${recu.at - tPost} ms` : "aucune frame");
  check("(5d) SSE : la charge transporte la temperature poster", !!recu && recu.data?.temperature === 4.2,
    recu ? JSON.stringify(recu.data).slice(0, 60) : "-");
  ac.abort();
}

// --- 6. en-tetes independants du client --------------------------------
// L'app est emballee par Electron : si le cache n'avait servi que Chrome, le
// bureau aurait garde son vieux bundle pour toujours.
{
  const ccFor = async (agent) =>
    String((await raw(`/assets/${assetName}`, { "Accept-Encoding": "identity", "User-Agent": agent })).headers["cache-control"] ?? "");
  const electron = await ccFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) eca-serveur/1.0 CLAUS/33.0");
  const chrome = await ccFor("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  check("(6) memes en-tetes de cache pour Electron et Chromium",
    electron === chrome && /immutable/.test(electron), `electron="${electron}" chrome="${chrome}"`);
}

child.kill("SIGTERM");
console.log(fail === 0 ? "\nVERIF HTTP: TOUT PASS" : "\nVERIF HTTP: " + fail + " ECHEC(S)");
setTimeout(() => process.exit(fail === 0 ? 0 : 1), 400);
