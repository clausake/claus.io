// Chantier 42 + 43 + 44 + 45 — LES EXPORTS SONT FIABLES ET RESERVES AU MAITRE.
//
// Ce spec ne juge PAS un code HTTP : il OUVRE le fichier livre et le lit.
// Un « 200 application/zip » ne prouve rien (l'ancien test routes.spec.ts
// acceptait 200 + le MIME, et passait sur une archive VIDE de 219 o dont la
// base ne contenait AUCUNE table).
//
// Ce qui est juge, et comment :
//  A. MATRICE DES ROLES sur les DEUX exports (chantier 43)
////    anonyme -> 401, agent -> 403, staff -> 403, maitre -> 200.
//     Le staff qui obtenait le ZIP (contenant la base entiere : hachages
//     argon2, sessions vivantes, journal d'audit) est le defaut mesure.
//  B. LE MARQUEUR ECRIT JUSTE AVANT L'EXPORT est present DANS le ZIP
//     ET dans le telechargement direct (chantier 42) : on ecrit une ligne
//     « audit-wal-marker », on exporte, on OUVRE le ZIP, on ouvre la base
//     qu'il contient et on interroge le marqueur en SQL.
//  C. Les tables attendues sont la : users, audit_log, documents, recipes,
//     demo_kit (le snapshot n'est pas « une base qui existe » : c'est LA base).
//  D. Le snapshot est AUTONOME : le fichier extrait s'ouvre SANS aucun
//     fichier -wal/-shm a cote, et `integrity_check` repond « ok ».
//  E. LISTE BLANCHE (chantier 44) : Cache/junk.bin, Network/Cookies et
//     backups/old.db NE doivent PAS figurer dans le ZIP ; un document
//     uploadé, lui, DOIT y figurer.
//  F. Le PREMIER BACKUP AUTOMATIQUE existe dès le démarrage (chantier 45) :
//     le dossier `backups/` n'est plus absent comme il l'etait.
//
// Le harness est celui de demo-kit.spec.ts : port libre, NODE_ENV=production,
// USER_DATA_PATH dédié, instance confrontée par son jeton.

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import { execFileSync } from "child_process";
import { lireZip } from "../banc/zip-lire";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-export-sqlite");
let server: ChildProcess;
let serverLog = "";

const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

/** Lancer un serveur avec la session d'un role donne. */
async function demarrerAvec(extraEnv: Record<string, string>, dataDir: string) {
  const port = await portLibre();
  const instance = `export-sqlite-${port}`;
  const proc = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      USER_DATA_PATH: dataDir,
      COOKDRIVE_INSTANCE_TOKEN: instance,
      // La porte d'identite est ACTIVE : ce spec juge les roles.
      COOKDRIVE_AUTH_OFF: "0",
      // Le budget auth (20/15 min) serait sature par les runs repetes.
      COOKDRIVE_RATELIMIT_OFF: "1",
      ...extraEnv,
    },
    stdio: "pipe",
  });
  proc.stdout?.on("data", (d) => (serverLog += String(d)));
  proc.stderr?.on("data", (d) => (serverLog += String(d)));
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/settings`);
      if (res.ok && res.headers.get("x-cookdrive-instance") === instance) break;
    } catch {
      /* pas encore pret */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { proc, port, base: `http://127.0.0.1:${port}` };
}

const arreter = (c: ChildProcess) => {
  try {
    if (c.pid) process.kill(-c.pid, "SIGKILL");
  } catch {
    try {
      c.kill("SIGKILL");
    } catch {
      /* deja mort */
    }
  }
};

/** Creer un compte et ouvrir une session (rend le cookie).
 *  Le PREMIER compte n'existe pas : il se cree par /api/auth/setup (le
 *  maitre). Les suivants (staff, agent) se creent par le maitre, sur
 *  /api/users — d'ou le cookie du maitre passe en parametre. */
async function session(
  base: string,
  username: string,
  password: string,
  role: string,
  cookieMaitre?: string,
) {
  if (role === "maitre") {
    const setup = await fetch(`${base}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    expect([201, 409], `setup maitre : ${await setup.text()}`).toContain(setup.status);
  } else {
    const create = await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieMaitre ?? "" },
      body: JSON.stringify({ username, password, role }),
    });
    expect([201, 409], `creation ${role} : ${await create.text()}`).toContain(create.status);
  }
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(login.status, `login ${username} : ${await login.text()}`).toBe(200);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");
  return cookie;
}

/** Interroger une base SQLite depuis un fichier.
 *  Le script est ecrit DANS le depot (et non dans /tmp) : il importe
 *  « sqlite3 », qui n'est resolvable que depuis les node_modules du depot. */
function interroger(cheminBase: string, sql: string): unknown[] {
  const script = `
import sqlite3 from "sqlite3";
const db = new sqlite3.Database(${JSON.stringify(cheminBase)}, sqlite3.OPEN_READONLY);
db.all(${JSON.stringify(sql)}, (err, rows) => {
  if (err) { console.log(JSON.stringify({ erreur: String(err.message) })); db.close(); return; }
  console.log(JSON.stringify(rows));
  db.close();
});
`;
  const fichier = path.join(process.cwd(), "test", `tmp-q-${Date.now().toString(36)}.mjs`);
  fs.writeFileSync(fichier, script);
  try {
    const sortie = execFileSync("node", [fichier], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    return JSON.parse(sortie.trim()) as unknown[];
  } finally {
    fs.unlinkSync(fichier);
  }
}

test.describe.configure({ mode: "serial" });

test("exports : roles, contenu reel du ZIP, autonomie du snapshot, premier backup", async () => {
  test.setTimeout(180_000);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const { proc, base } = await demarrerAvec({}, DATA_DIR);
  server = proc;
  BASE = base;

  try {
    // --- Le maitre, la staff et l'agent -------------------------------
    const cookieMaitre = await session(base, "maitre-export", "passe-export-2026", "maitre");

    // --- B. Le marqueur ecrit JUSTE AVANT l'export -------------------
    const marqueur = `audit-wal-marker-${Date.now()}`;
    const avant = await fetch(`${base}/api/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieMaitre },
      body: JSON.stringify({
        name: marqueur,
        quantity: 7,
        minStock: 1,
        unit: "kg",
        category: "Test",
      }),
    });
    expect([200, 201], `creation du marqueur : ${await avant.text()}`).toContain(avant.status);

    // --- A. Matrice des roles sur POST /api/backup -------------------
    const anonyme = await fetch(`${base}/api/backup`, { method: "POST" });
    const anonymeCorps = await anonyme.text();
    expect(anonyme.status, `anonyme sur POST /api/backup : ${anonymeCorps}`).toBe(401);

    const cookieStaff = await session(base, "staff-export", "passe-export-2026", "staff", cookieMaitre);
    const staff = await fetch(`${base}/api/backup`, {
      method: "POST",
      headers: { Cookie: cookieStaff },
    });
    const staffCorps = await staff.text();
    expect(staff.status, `STAFF sur POST /api/backup : ${staffCorps}`).toBe(403);
    const staffJson = JSON.parse(staffCorps) as { error?: string };
    expect(staffJson.error).toBe("MAITRE_REQUIS");

    const cookieAgent = await session(base, "agent-export", "passe-export-2026", "agent", cookieMaitre);
    const agent = await fetch(`${base}/api/backup`, {
      method: "POST",
      headers: { Cookie: cookieAgent },
    });
    expect(
      agent.status,
      `AGENT sur POST /api/backup : ${await agent.text()}`,
    ).toBe(403);

    // --- La meme matrice sur GET /api/admin/db-download --------------
    const dlAnonyme = await fetch(`${base}/api/admin/db-download`);
    expect(dlAnonyme.status, "anonyme sur db-download").toBe(401);
    const dlStaff = await fetch(`${base}/api/admin/db-download`, {
      headers: { Cookie: cookieStaff },
    });
    expect(dlStaff.status, "STAFF sur db-download").toBe(403);
    const dlAgent = await fetch(`${base}/api/admin/db-download`, {
      headers: { Cookie: cookieAgent },
    });
    expect(dlAgent.status, "AGENT sur db-download").toBe(403);

    // --- E. Semis des fichiers interdits et du document utile ---------
    // Cache/junk.bin, Network/Cookies, backups/old.db : les trois que
    // l'audit a mesures DANS le ZIP de l'ancien code.
    fs.mkdirSync(path.join(DATA_DIR, "Cache"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "Cache", "junk.bin"), "bruit");
    fs.mkdirSync(path.join(DATA_DIR, "Network"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "Network", "Cookies"), "cookies");
    fs.mkdirSync(path.join(DATA_DIR, "backups"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "backups", "old.db"), "vieille base");
    // Un document utile : il DOIT figurer dans l'archive.
    fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "uploads", "facture-utile.png"), "PNG");

    // --- Le ZIP du maitre ---------------------------------------------
    const zipRes = await fetch(`${base}/api/backup`, {
      method: "POST",
      headers: { Cookie: cookieMaitre },
    });
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    expect(zipRes.status, `maitre sur POST /api/backup : ${zipBuf.subarray(0, 200).toString("utf8")}`).toBe(200);
    expect(zipRes.headers.get("content-type")).toContain("application/zip");
    const zip = lireZip(zipBuf);
    console.log("ENTREES DU ZIP :", JSON.stringify(zip.noms));

    // --- E. La liste blanche -------------------------------------------
    expect(zip.noms, "Cache/junk.bin ne doit pas etre dans le ZIP").not.toContain("Cache/junk.bin");
    expect(zip.noms, "Network/Cookies ne doit pas etre dans le ZIP").not.toContain("Network/Cookies");
    expect(zip.noms, "backups/old.db ne doit pas etre dans le ZIP").not.toContain("backups/old.db");
    expect(
      zip.noms.some((n) => n.startsWith("uploads/")),
      `un document utile doit figurer dans le ZIP : ${JSON.stringify(zip.noms)}`,
    ).toBe(true);

    // --- B + C + D. Le snapshot du ZIP, OUVERT et INTERROGE ----------
    const baseDansZip = path.join(DATA_DIR, "base-extrait.db");
    fs.writeFileSync(baseDansZip, zip.contenu("agent_culinaire.db"));
    const tables = interroger(baseDansZip, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => (r as { name: string }).name);
    console.log("TABLES DU SNAPSHOT :", JSON.stringify(tables));
    for (const attendue of ["users", "audit_log", "documents", "recipes", "demo_kit"]) {
      expect(tables, `la table ${attendue} doit etre dans le snapshot`).toContain(attendue);
    }
    const lignes = interroger(baseDansZip, "SELECT name FROM inventory WHERE name = ?".replace("?", `'${marqueur}'`));
    expect(
      lignes.length,
      `le marqueur « ${marqueur} » doit etre dans le snapshot du ZIP`,
    ).toBeGreaterThan(0);
    const integrite = interroger(baseDansZip, "PRAGMA integrity_check");
    expect(String((integrite[0] as { integrity_check?: string })?.integrity_check)).toBe("ok");
    // Autonomie : aucun sidecar a cote du snapshot extrait.
    expect(fs.existsSync(`${baseDansZip}-wal`), "le snapshot ne doit pas needing de -wal").toBe(false);
    expect(fs.existsSync(`${baseDansZip}-shm`), "le snapshot ne doit pas needing de -shm").toBe(false);

    // --- Le telechargement direct : le MEME marqueur ------------------
    const dl = await fetch(`${base}/api/admin/db-download`, {
      headers: { Cookie: cookieMaitre },
    });
    const dlBuf = Buffer.from(await dl.arrayBuffer());
    expect(
      dl.status,
      `maitre sur db-download : ${dlBuf.subarray(0, 300).toString("utf8")}`,
    ).toBe(200);
    const baseDirecte = path.join(DATA_DIR, "base-directe.db");
    fs.writeFileSync(baseDirecte, dlBuf);
    const lignesDirectes = interroger(
      baseDirecte,
      `SELECT name FROM inventory WHERE name = '${marqueur}'`,
    );
    expect(
      lignesDirectes.length,
      `le marqueur « ${marqueur} » doit etre dans le telechargement direct`,
    ).toBeGreaterThan(0);
    const tablesDirectes = interroger(
      baseDirecte,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).map((r) => (r as { name: string }).name);
    for (const attendue of ["users", "audit_log", "documents", "recipes", "demo_kit"]) {
      expect(tablesDirectes, `la table ${attendue} doit etre dans le telechargement`).toContain(attendue);
    }

    // --- F. Le premier backup automatique existe DEJA ------------------
    const dossierBackups = path.join(DATA_DIR, "backups");
    expect(
      fs.existsSync(dossierBackups),
      "le dossier backups/ doit exister des le demarrage (chantier 45)",
    ).toBe(true);
    const backups = fs.existsSync(dossierBackups) ? fs.readdirSync(dossierBackups) : [];
    console.log("BACKUPS AU DEMARRAGE :", JSON.stringify(backups));
    expect(
      backups.filter((f) => f.endsWith(".db")).length,
      "au moins un backup automatique doit exister au demarrage",
    ).toBeGreaterThan(0);
  } finally {
    arreter(server);
    if (process.env["DEBUG_EXPORT_SQLITE"]) console.log(serverLog);
  }
});
