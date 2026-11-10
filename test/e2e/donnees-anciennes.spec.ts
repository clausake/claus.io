// Chantier 49 — LA REPRISE DES DONNEES D'UNE ANCIENNE INSTALLATION.
//
// Les quatre scenarios d'acceptation du cahier des charges, joues sur des
// dossiers ISOLES (le dossier de donnees actif est un dossier neuf, l'ancienne
// installation est un dossier prepare par le test) :
//
//  A. ANCIENNE BASE + INSTALLATION NEUVE : l'import est PROPOSE, et apres
//     import les donnees sont VISIBLES par les routes metier.
//  B. INSTALLATION ACTIVE NON VIDES : aucun ecrasement n'est possible
//     (l'import est refuse, et les donnees actives restent intactes).
//  C. AUCUNE ANCIENNE BASE : aucune proposition, aucun message, et l'appel
//     ne fait pas de bruit (le produit doit rester muet).
//  D. LES SAUVEGARDES EXISTANTES sont conservees dans tous les scenarios.
//
// Le marquage « kit de demonstration » ne compte PAS comme donnee : le kit est
// pose au premier lancement, il ne doit pas empecher l'import (c'est le
// critere « vierge HORS kit » du cahier des charges).

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import { execFileSync } from "node:child_process";
import { demarrerServeur, arreterServeur } from "../../scripts/harnais-serveur.cjs";

let server: ChildProcess;

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

/** Un dossier qui joue le role d'une installation precedente. */
function preparerAncienneInstallation(dossier: string): void {
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.mkdirSync(path.join(dossier, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(dossier, "uploads", "facture-ancienne.png"), "ANCIENNE");
  // La base ancienne est ecrite par le serveur de test lui-meme (meme moteur,
  // meme schema) : on la prepare avec un script node.
  const script = `
import { open } from "sqlite";
import sqlite3 from "sqlite3";
const db = await open({ filename: process.argv[2], driver: sqlite3.Database });
await db.exec("CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT NOT NULL, quantity REAL NOT NULL, minStock REAL NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL, category TEXT NOT NULL, unit_price REAL DEFAULT 0, yield_percent REAL DEFAULT 100, lot_number TEXT, dlc TEXT, dluo TEXT)");
await db.run("INSERT OR REPLACE INTO inventory (id, name, quantity, minStock, unit, status, category) VALUES (?,?,?,?,?,?,?)", "avant-install", "Article de l'ancienne installation", 12, 3, "kg", "ok", "Ancienne");
await db.close();
`;
  const fichier = path.join(process.cwd(), "test", `tmp-avant-${Date.now().toString(36)}.mjs`);
  fs.writeFileSync(fichier, script);
  try {
    execFileSync("node", [fichier, path.join(dossier, "agent_culinaire.db")], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } finally {
    fs.unlinkSync(fichier);
  }
}

/** Demarrer un serveur sur un dossier de donnees donne. */
async function demarrer(dossierDonnees: string): Promise<string> {
  const port = await portLibre();
  const instance = `donnees-${port}`;
  server = demarrerServeur({
    racine: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      USER_DATA_PATH: dossierDonnees,
      COOKDRIVE_INSTANCE_TOKEN: instance,
      COOKDRIVE_AUTH_OFF: "0",
      COOKDRIVE_RATELIMIT_OFF: "1",
    },
    stdio: "pipe",
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/settings`);
      if (res.ok && res.headers.get("x-cookdrive-instance") === instance) return base;
    } catch {
      /* pas encore pret */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("le serveur de test n'a pas demarre");
}

async function session(base: string, username: string, password: string): Promise<string> {
  const setup = await fetch(`${base}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect([201, 409]).toContain(setup.status);
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(login.status).toBe(200);
  return (login.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");
}

test.describe.configure({ mode: "serial" });

test("reprise des donnees : proposition, import, refus si la base est pleine, silence sinon", async () => {
  test.setTimeout(180_000);
  const racine = path.join(process.cwd(), "test", "tmp-donnees-anciennes");
  const dossierActif = path.join(racine, "ClausIO");
  const dossierAncien = path.join(racine, "agent-culinaire-os");
  fs.rmSync(racine, { recursive: true, force: true });
  fs.mkdirSync(dossierActif, { recursive: true });
  preparerAncienneInstallation(dossierAncien);
  // Une sauvegarde preexistante : elle doit SURVIVRE a l'import (regle D).
  fs.mkdirSync(path.join(dossierActif, "backups"), { recursive: true });
  fs.writeFileSync(path.join(dossierActif, "backups", "db-20200101_00-00-00.db"), "sauvegarde");

  const base = await demarrer(dossierActif);
  try {
    const cookie = await session(base, "maitre-reprise", "passe-reprise-2026");

    // --- A. la proposition d'import est faite (base neuve + kit pose) -----
    const etat = await fetch(`${base}/api/donnees/actif`).then((r) => r.json());
    console.log("ETAT DONNEES :", JSON.stringify(etat));
    expect(etat.chemin_actif, "le chemin actif est rendu").toContain("ClausIO");
    expect(etat.base_vierge, "l'installation neuve est vierge (hors kit)").toBe(true);
    expect(
      etat.proposition_import,
      "l'ancienne installation doit etre proposee",
    ).not.toBeNull();
    expect(String(etat.proposition_import.dossier)).toContain("agent-culinaire-os");

    // --- l'import, demande par le client (le maitre) --------------------
    const avant = await fetch(`${base}/api/inventory`).then((r) => r.json());
    // Le kit de demonstration est pose au premier lancement : il ne compte
    // PAS comme donnee (c'est le critere « vierge HORS kit »).
    expect(
      Array.isArray(avant) &&
        !avant.some((l: { name?: string }) => l.name === "Article de l'ancienne installation"),
      "l'article de l'ancienne installation n'est pas encore la",
    ).toBe(true);

    const importRes = await fetch(`${base}/api/donnees/importer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ dossier: etat.proposition_import.dossier }),
    });
    const importJson = await importRes.json();
    console.log("IMPORT :", JSON.stringify(importJson));
    expect(importRes.status, `import : ${JSON.stringify(importJson)}`).toBe(200);

    // --- A (suite) : les donnees sont VISIBLES par les routes metier -----
    const apres = await fetch(`${base}/api/inventory`).then((r) => r.json());
    expect(
      apres.some((l: { name?: string }) => l.name === "Article de l'ancienne installation"),
      "l'article de l'ancienne installation doit etre visible",
    ).toBe(true);

    // --- D : les sauvegardes preexistantes sont conservees ---------------
    expect(
      fs.existsSync(path.join(dossierActif, "backups", "db-20200101_00-00-00.db")),
      "la sauvegarde preexistante doit survivre a l'import",
    ).toBe(true);
    // ... et le snapshot de securite pose AVANT l'import est la.
    const backups = fs.readdirSync(path.join(dossierActif, "backups"));
    expect(
      backups.some((f) => f.startsWith("avant-import-")),
      `un snapshot de securite doit preceder l'import : ${JSON.stringify(backups)}`,
    ).toBe(true);

    // --- B : une base active NON vide n'est jamais ecrasee --------------
    const avant2 = await fetch(`${base}/api/donnees/actif`).then((r) => r.json());
    expect(avant2.base_vierge, "la base n'est plus vierge apres l'import").toBe(false);
    expect(
      avant2.proposition_import,
      "aucune proposition ne doit etre faite sur une base non vide",
    ).toBeNull();
    const refus = await fetch(`${base}/api/donnees/importer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ dossier: dossierAncien }),
    });
    const refusJson = await refus.json();
    console.log("REFUS :", JSON.stringify(refusJson));
    expect(refus.status, "l'import sur une base pleine doit etre refuse").toBe(409);
    expect(String(refusJson.error)).toContain("IMPORT_REFUSE_BASE_ACTIVE");
    const apresRefus = await fetch(`${base}/api/inventory`).then((r) => r.json());
    expect(
      apresRefus.some((l: { name?: string }) => l.name === "Article de l'ancienne installation"),
      "les donnees actives doivent etre INTACTES apres le refus",
    ).toBe(true);
  } finally {
    arreterServeur(server);
  }
});

test("sans ancienne base : aucune proposition, aucun bruit", async () => {
  test.setTimeout(120_000);
  const racine = path.join(process.cwd(), "test", "tmp-donnees-seules");
  const dossierActif = path.join(racine, "ClausIO");
  fs.rmSync(racine, { recursive: true, force: true });
  fs.mkdirSync(dossierActif, { recursive: true });

  const base = await demarrer(dossierActif);
  try {
    const debut = Date.now();
    const etat = await fetch(`${base}/api/donnees/actif`).then((r) => r.json());
    const duree = Date.now() - debut;
    console.log("ETAT SEUL :", JSON.stringify(etat), `duree=${duree}ms`);
    expect(etat.proposition_import, "aucune proposition sans ancienne base").toBeNull();
    expect(etat.chemin_actif).toContain("ClausIO");
    // « aucun ralentissement » : la detection reste une lecture de dossier.
    expect(duree, `la detection doit rester rapide (${duree} ms)`).toBeLessThan(5_000);
  } finally {
    arreterServeur(server);
  }
});
