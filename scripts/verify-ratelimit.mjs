// Verification terrain du rate-limit par categorie (chemin HTTP reel).
// Prouve les DEUX directions de l'invariant :
//   A. le polling legitime (lectures repetees) ne declenche PLUS de 429 global ;
//   B. le brute-force de la connexion (/api/auth/login) est rattrape vite.
// Usage: node scripts/verify-ratelimit.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import process from "node:process";

const PORT = 4126;
const BASE = `http://127.0.0.1:${PORT}`;
// Le jeton que CE harnais impose au serveur.
const TOKEN_INSTANCE = "verify-ratelimit";
const DATA = join(process.cwd(), "test", "tmp-rl");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const child = spawn(process.execPath, [tsx, "server.ts"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    USER_DATA_PATH: DATA,
    // Identite desactivee : sonde de METIER (l'identite a sa porte verify:auth).
    COOKDRIVE_AUTH_OFF: "1",
    // Le jeton est FOURNI par l'APPELANT et doit rester DEDANS de
    // l'objet env: place apres la accolade fermante, il seroit un champ
    // de l'objet d'options de spawn (ignore par le fils), le serveur
    // retomberait sur son propre crypto.randomUUID() et le garde
    // d'identite rougiroit sur PROPRE fils — ce qui s'est produit et
    // a ete rattrape par la branche « control » de
    // scripts/probe-garde-instance-harnais-mord.py.
    COOKDRIVE_INSTANCE_TOKEN: TOKEN_INSTANCE,
  },
  stdio: "pipe",
});
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});
// ⚠ L'attente CONFRONTE LE JETON D'INSTANCE, elle ne se contente pas de r.ok.
// Ces quatre harnais tiennent un PORT FIGE: sans confrontation, un server.ts
// orphelin (un fils qu'un harnais precedant a laisse vivre, ou un server d'un
// AUTRE projet du meme poste) repond sur le port et le harnais juge QUI REPOND
// au lieu de son instance — la classe exacte de faute que
// scripts/probe-instance-guard.mjs chasse ailleurs dans ce depot, mais pas
// ici. Port impose = contrat: server.ts meurt d'EADDRINUSE si un autre le
// tient, et l'en-tete rendu dit si c'est BIEN le serveur que CE harnais a lance.
// (Un PASS rendu par une instance qui n'est pas la tienne n'est pas une mesure.)
let pret = false;
let instanceEtrange = null;
for (let i = 0; i < 160; i++) {
  try {
    const r = await fetch(`${BASE}/api/settings`, {
      headers: { "X-Cookdrive-Instance": TOKEN_INSTANCE },
    });
    const recu = r.headers.get("x-cookdrive-instance");
    if (r.ok && recu === TOKEN_INSTANCE) { pret = true; break; }
    if (r.ok && recu) { instanceEtrange = recu; break; }
  } catch {}
  await new Promise((res) => setTimeout(res, 250));
}
if (instanceEtrange) {
  child.kill("SIGKILL");
  console.log("ECHEC  instance PERIMEE sur le port " + PORT + " : l'en-tete dit « "
    + instanceEtrange + " », ce harnais attend « " + TOKEN_INSTANCE
    + " ». Ce n'est pas le serveur de ce harnais.");
  process.exit(1);
}
if (!pret) {
  child.kill("SIGKILL");
  console.log("ECHEC  serveur pas pret (ou pas la bonne instance) sur " + BASE);
  process.exit(1);
}


let fail = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "ECHEC"}  ${label}${detail ? "   [" + detail + "]" : ""}`);
  if (!cond) fail++;
};

// --- A. 500 lectures repetees (simule une journee de polling) ---
let first429read = -1;
let readHeaders = null;
for (let i = 1; i <= 500; i++) {
  const r = await fetch(`${BASE}/api/dashboard/stats`);
  if (!readHeaders && i === 1) readHeaders = r.headers;
  if (r.status === 429) { first429read = i; break; }
}
check("500 lectures : aucun 429 (le polling survit)", first429read === -1,
  first429read > 0 ? "429 a la " + first429read : "ok");

// --- en-tetes draft-7 presents et nommes par la categorie read ---
// On agrege tous les en-tetes RateLimit* (le nom exact depend du format draft-7),
// puis on verifie qu'ils portent a la fois la categorie et sa taille de budget.
const rlHeaders = [];
readHeaders?.forEach((v, k) => { if (k.toLowerCase().startsWith("ratelimit")) rlHeaders.push(`${k}=${v}`); });
const rlAll = rlHeaders.join(" | ");
check("en-tete RateLimit present sur une lecture", rlHeaders.length > 0, rlAll || "aucun");
check("budget read announced = 600, taggue par categorie", /600/.test(rlAll) && /read/.test(rlAll), rlAll);

// --- B. brute-force de la connexion : le budget auth (20) doit rattraper vite ---
let first429auth = -1;
for (let i = 1; i <= 40; i++) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "faux-" + i, password: "faux-" + i }),
  });
  if (r.status === 429) { first429auth = i; break; }
}
check("brute-force login rattrape par le budget auth (<25 tentatives)",
  first429auth > 0 && first429auth < 25, first429auth > 0 ? "429 a la " + first429auth : "jamais");

// --- C. une mutations legitime (POST inventaire) n'est pas comptee comme read ---
let mutate429 = -1;
for (let i = 1; i <= 200; i++) {
  const r = await fetch(`${BASE}/api/suppliers`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "F" + i, contact: "-", email: "a@b.c", phone: "0", category: "G", delivery_time: "24h" }),
  });
  if (r.status === 429) { mutate429 = i; break; }
}
check("budget mutate separe : plafonne vers 150 ecritures (150/5min)",
  mutate429 > 0 && mutate429 <= 151, mutate429 > 0 ? "429 a la " + mutate429 : "jamais en 200");

child.kill("SIGTERM");
console.log(fail === 0 ? "\nVERIF RATELIMIT: TOUT PASS" : "\nVERIF RATELIMIT: " + fail + " ECHEC(S)");
process.exit(fail === 0 ? 0 : 1);
