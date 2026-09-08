// Verification terrain du flux SSE des capteurs (chemin HTTP reel).
// Prouve les proprietes qui font la valeur du passage en push :
//   1. le flux s'ouvre avec le bon Content-Type ;
//   2. un webhook poste est POUSSE au client (latence, vs les 4 s du polling) ;
//   3. une re-emission de la MEME valeur est quand meme diffusee : un capteur
//      qui reste a 3.4 degres doit rafraichir son horodatage, une releve HACCP
//      ne doit jamais etre avalee silencieusement (absence de dedup = design) ;
//   4. le canal 'stale' est publie a chaque battement (tableau vide = "aucun
//      capteur muet", etat qui doit pouvoir defanionner le precedent) ;
//   5. un capteur ajoute est pousse dans une nouvelle liste sans rafraichissement.
//
// Le cas "capteur reellement muet" (silence > seuil de 120 s) ne peut etre
// declenche ici sans tricher l'horloge serveur : on verifie le contrat du canal
// + qu'un capteur qui vient de poster n'est PAS declare muet (pas de fausse
// alerte) + qu'une liste vide est publiee (regression du capteur qui reparait).
//
// Le webhook exige le token reel emis a l'enregistrement : le serveur rejette un
// token invalide en 403, donc un token invente ne posterait rien et ne prouverait
// rien. On capure le token retourne par POST /api/haccp/iot-sensors.
// Usage: node scripts/verify-sse.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import process from "node:process";

const PORT = 4127;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(process.cwd(), "test", "tmp-sse");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: { ...process.env, PORT: String(PORT), USER_DATA_PATH: DATA },
  stdio: "pipe",
});
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${BASE}/api/settings`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

// Enregistreur d'evenements SSE : lit le flux chunk par chunk et recoit les
// frames "event:/data:" en les horodatant a l'arrivee (pour la latence).
function openStream(path) {
  const events = [];
  let contentType = "";
  const ac = new AbortController();
  const p = fetch(`${BASE}${path}`, { signal: ac.signal, headers: { Accept: "text/event-stream" } })
    .then(async (r) => {
      contentType = r.headers.get("content-type") || "";
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const name = /event: *(.+)/.exec(frame)?.[1]?.trim();
          const raw = /data: *(.+)/.exec(frame)?.[1];
          if (name && raw) events.push({ event: name, data: JSON.parse(raw), at: Date.now() });
        }
      }
    })
    .catch(() => {});
  return {
    events,
    get contentType() { return contentType; },
    count: (name) => events.filter((e) => e.event === name).length,
    waitFor: async (name, timeoutMs = 6000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = events.filter((e) => e.event === name);
        if (hit.length) return hit;
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    },
    // Attend que le nombre d'evenements depasse strictement un niveau de
    // reference. Utile quand un evenement est DEJA au buffer : waitFor
    // court-circuiterait dessus et on ne saurait pas si le nouveau est arrive.
    waitCount: async (name, above, timeoutMs = 6000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (events.filter((e) => e.event === name).length > above) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    },
    close: () => ac.abort(),
  };
}

const post = (p, body) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// --- preparatifs : deux capteurs enregistres (on capure leurs tokens) ---
const regLive = await (await post("/api/haccp/iot-sensors", { id: "sse-live", name: "Chambre Froide Nord", type: "ambient", equipment_type: "Froid" })).json();
const regOther = await (await post("/api/haccp/iot-sensors", { id: "stale-c", name: "Vitrine Est", type: "ambient", equipment_type: "Froid" })).json();
const tokenLive = regLive.token;
const tokenOther = regOther.token;
check("token reel retourne a l'enregistrement", typeof tokenLive === "string" && tokenLive.length > 3, String(tokenLive));

const stream = openStream("/api/sensors/stream");
await new Promise((r) => setTimeout(r, 400));

// 1. ouverture correcte
check("flux SSE ouvert en text/event-stream", /text\/event-stream/.test(stream.contentType), stream.contentType || "vide");

// 2. latence du push
const t0 = Date.now();
const ing = await post("/api/haccp/webhook/iot-report", { id: "sse-live", token: tokenLive, temperature: 3.4, battery: 88 });
check("l'ingestion du webhook reussit (200, pas 403)", ing.status === 200, "HTTP " + ing.status);
const got = await stream.waitFor("sensor", 6000);
const latency = got ? got[got.length - 1].at - t0 : -1;
const payload = got ? got[got.length - 1].data : null;
check("webhook poste => evenement 'sensor' recu cote client", !!got, got ? "" : "aucun");
check("payload porte la valeur postee (3.4)", !!payload && payload.temperature === 3.4, JSON.stringify(payload));
check("latence capteur->client < 1000 ms (le polling etait 4000)", latency >= 0 && latency < 1000, latency + "ms");

// 3. pas d'avalemen : une re-emission identique doit quand meme arriver.
// Le 1er 'sensor' est DEJA au buffer (check 2), donc waitFor court-circuiterait:
// on attend le PASSAGE strict au-dessus du niveau de reference. Discriminant
// reel: si la de-dup etait vivante, le 2e n'arriverait jamais => waitCount faux.
const before = stream.count("sensor");
await post("/api/haccp/webhook/iot-report", { id: "sse-live", token: tokenLive, temperature: 3.4, battery: 88 });
const dupArrived = await stream.waitCount("sensor", before, 4000);
check("re-emission identique quand meme diffusee (jamais avalee)", dupArrived, `attendu >${before}, recu=${stream.count("sensor")}`);

// 4. le canal stale est publie (liste vide = aucun muet) et ne fausse pas un
//    capteur fraichement actif.
await post("/api/haccp/webhook/iot-report", { id: "stale-c", token: tokenOther, temperature: 5.1 });
const stale = await stream.waitFor("stale", 60_000);
check("canal 'stale' emis et de forme tableau", !!stale && Array.isArray(stale[stale.length - 1].data), stale ? JSON.stringify(stale[stale.length - 1].data) : "aucun");
const flatStale = stale ? stale.flatMap((s) => s.data) : [];
check("un capteur qui vient de poster n'est PAS declare muet", !flatStale.some((s) => s && (s.id === "stale-c" || s.id === "sse-live")), JSON.stringify(flatStale));

// 5. ajout de capteur => nouvelle liste poussee contenant le nouveau.
await post("/api/haccp/iot-sensors", { id: "newcomer", name: "Congelateur Sud", type: "ambient", equipment_type: "Froid" });
const listGot = await stream.waitFor("sensors", 4000);
const sawNew = listGot ? listGot[listGot.length - 1].data.some((s) => s.id === "newcomer") : false;
check("ajout de capteur pousse une liste contenant le nouveau", !!sawNew, listGot ? "" : "aucun");

stream.close();
child.kill("SIGTERM");
console.log(fail === 0 ? "\nVERIF SSE: TOUT PASS" : "\nVERIF SSE: " + fail + " ECHEC(S)");
setTimeout(() => process.exit(fail === 0 ? 0 : 1), 400);
