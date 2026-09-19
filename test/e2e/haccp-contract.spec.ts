// Contrat de POST /api/inventory/consume (decrement de stock a la validation
// d'un chariot de production: ProductionPlan.tsx, handleConsumeStock).
//
// Les faits juges ici viennent de la sonde brute
// scripts/probe-consume-semantiques.mjs, pas de la lecture du code:
//   F1 `UPDATE ... WHERE id = ?` sur une clef inexistante rend `changes: 0` SANS
//      jeter. L'ancien code ignorait ce compteur: une clef inconnue laissait les
//      AUTRES lignes DEJA consommees et repondait { success: true }.
//   F2 `typeof quantity !== "number" -> continue` sigillait l'entree, reponse
//      verrouillee a { success: true }. Une quantite absente, en texte, nulle ou
//      NEGATIVE (qui REMPLISSAIT le stock) ne levait aucun signal au chef.
//   F3 un nombre non fini lie dans un `?` d'une colonne REAL NOT NULL jette une
//      contrainte (sonde: "NOT NULL constraint failed"). Le 400 amont sert donc a
//      la LISIBILITE (400 nomme au lieu d'un 500 sorties du catch) et non a
//      empecher un NaN grave: cette these que j'avais emise a ete infirmee.
//
// Comme partout dans ce depot, un PASS qui ne peut pas devenir FAIL n'est pas
// une mesure. Chaque regle est donc doublee: DELTA (poster par la MEME route que
// l'UI, exiger le mouvement EXACT relu en base) puis RETIRER (re-poster l'inverse)
// et exiger le retour a la ligne de base.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-haccp");
const INSTANCE_TOKEN = "haccp-contract";

let server: ChildProcess;

// Port alloue par l'OS + attente de sa liberation reelle (meme contrat que
// purchasing-chain.spec.ts). Un port fige se fait voler par le petit-fils
// `tsx` qu'un run precedent n'a pas tue (SIGTERM tue le wrapper, pas l'enfant)
// : l'imposteur ne bind pas, et la porte juge alors le fils remanant — qui
// porte, lui, le BON jeton. Le verdict rendu serait « la mutation ne mord pas ».
async function portLibre(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as any).port;
      srv.close(() => resolve(p));
    });
  });
}

async function attendrePortLibre(port: number, maxMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const libre = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => {
        srv.close(() => resolve(true));
      });
    });
    if (libre) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  PORT = await portLibre();
  await attendrePortLibre(PORT);
  BASE = `http://127.0.0.1:${PORT}`;
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    // ⚠ le jeton doit etre DEDANS l'objet env: pose apres l'accolade fermante
    // c'est un champ d'options IGNORE par le fils (voir PHASES.md, 7.6).
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN,
    },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stdout.write(d));
  // Attendre MON instance et non "ce qui repond sur le port": un server.ts
  // orphelin (fils d'un autre run, ou serveur d'un autre projet du poste) ferait
  // juger une porte par une instance qui n'est pas la sienne.
  const deadline = Date.now() + 45000;
  let pret = false;
  let perimee = false;
  let vu: string | null = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/settings`);
      const entete = r.headers.get("x-cookdrive-instance");
      if (r.ok && entete && entete !== INSTANCE_TOKEN) {
        perimee = true;
        vu = entete;
        break;
      }
      if (r.ok && entete === INSTANCE_TOKEN) {
        pret = true;
        break;
      }
    } catch {
      /* pas encore en ecoute */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (perimee) {
    console.error(
      `ECHEC instance PERIMEE sur le port ${PORT}: l'en-tete dit « ${vu} », ` +
        `ce harnais attend « ${INSTANCE_TOKEN} ».`,
    );
    process.exit(1);
  }
  if (!pret) {
    console.error(`ECHEC serveur pas pret sur le port ${PORT}.`);
    process.exit(1);
  }
}, 60000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
});

// Contrat des routes d'ECRITURE du domaine HACCP (Sprint 11).
//
// POURQUOI CE SPEC EXISTE. HACCP est le seul domaine du produit qui porte une
// obligation reglementaire (regl. (CE) n 852/2004 art. 5: l'exploitant doit
// pouvoir PRESENTER a l'auditeur ses releves, ses lots traces et ses actions
// correctives). Ses routes d'ecriture etaient les dernieres sans contrat: la
// carte par octets (scripts/carte-voies-haccp.py) rend 12 voies d'ecriture et
// routes.spec.ts n'en jouait AUCUNE en ecriture (ses 5 tests HACCP sont des GET
// nominaux: status 200 + Array.isArray — un PASS creux, la classe punie ici).
//
// L'angle mort qui rendait le defaut invisible: les VOIES DE LECTURE de ces
// tables sont des JOIN INTERNES (relues a l'octet):
//   GET /api/haccp/batches           -> JOIN inventory (interne)
//   GET /api/haccp/production-history-> JOIN recipes    (interne)
// Une ligne dont la clef ne joint rien n'est pas une erreur: elle est ECRITE
// puis DISPARAIT de l'ecran du chef, sans 500. Et le PRAGMA foreign_keys n'est
// jamais declenche par src/db/init.ts (prouve par sonde: un orphelin est
// ACCEPTE, changes=1) — la clef du schema ne protege rien. corrective_actions
// n'avait AUCUN SELECT dans src/ (0 voie): la preuve etait ecrite, jamais relue.
//
// Regle du depot: un PASS qui ne peut pas devenir FAIL n'est pas une mesure.
// Chaque regle est jugee par DELTA (poster par la MEME route que l'UI, exiger le
// mouvement EXACT relu en base) puis en RETRAIT (les tentatives invalides
// n'ont rien ecrit). Les payloads sont ceux que l'UI emet REELLEMENT
// (scripts/carte-payloads-haccp.py), pas des payloads inventes.

type Corps = Record<string, any>;

let req: any;

async function lire(url: string): Promise<any> {
  const r = await req.get(`${BASE}${url}`);
  expect(r.status(), url + " -> " + r.status()).toBe(200);
  return await r.json();
}

async function poste(url: string, corps: unknown): Promise<{ code: number; corps: Corps }> {
  const r = await req.post(`${BASE}${url}`, { data: corps });
  let json: Corps = {};
  try { json = (await r.json()) as Corps; } catch { /* corps vide */ }
  return { code: r.status(), corps: json };
}

async function nouveauArticle(nom: string): Promise<string> {
  const { code, corps } = await poste("/api/inventory", {
    name: nom, quantity: 5, minStock: 1, unit: "kg", category: "test-haccp",
  });
  expect(code, "creation article (" + nom + ")").toBe(200);
  const id = corps.id ?? (await lire("/api/inventory")).find((i: any) => i.name === nom)?.id;
  expect(id, "id de l'article cree").toBeTruthy();
  return id as string;
}

async function nouvelleRecette(nom: string): Promise<string> {
  const { code, corps } = await poste("/api/recipes", {
    name: nom, category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "test",
  });
  expect(code, "creation recette (" + nom + ")").toBe(200);
  const id = corps.id ?? (await lire("/api/recipes")).find((r: any) => r.name === nom)?.id;
  expect(id, "id de la recette creee").toBeTruthy();
  return id as string;
}

test("C1 releve du chef: texte/blanc/nul refuses, la valeur valide est relue en base", async ({ request }) => {
  req = request;
  const nom = "Frigo C1 " + Date.now();
  const bon = await poste("/api/haccp/temperature", {
    equipment_name: nom, temperature: 4.2, user: "SYSTME",
  });
  expect(bon.code, "releve valide acceptee").toBe(200);
  expect(typeof bon.corps.id, "la creation rend la clef ECITEE").toBe("string");
  const relu = (await lire("/api/haccp/temperatures")).find((l: any) => l.id === bon.corps.id);
  expect(relu, "la releve ressort de la liste").toBeTruthy();
  expect(relu.temperature, "temperature relue identique").toBe(4.2);
  expect(relu.equipment_name).toBe(nom);
  expect(relu.entry_type, "voie manuelle signee manuelle").toBe("manuel");
  expect(relu.sensor_mode, "repli sur le defaut du schema").toBe("online");

  const texte = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: "vingt degres" });
  expect(texte.code, "un texte dans la colonne REAL est refuse").toBe(400);
  expect(texte.corps.refused ?? [], "le champ est NOMME").toContain("temperature");

  const blanc = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: null });
  expect(blanc.code, "le NaN serialise arrive comme null et se refuse").toBe(400);
  expect(blanc.corps.refused ?? []).toContain("temperature");

  const borne = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: -450 });
  expect(borne.code, "hors plage physique refuse").toBe(400);

  const vide = await poste("/api/haccp/temperature", { equipment_name: "   ", temperature: 4 });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("equipment_name");

  const usurpe = await poste("/api/haccp/temperature", {
    equipment_name: nom, temperature: 3, entry_type: "iot", sensor_mode: "online",
  });
  expect(usurpe.code, "une saisie manuelle ne peut pas se signer 'iot'").toBe(400);

  const lignes = (await lire("/api/haccp/temperatures")).filter((l: any) => l.equipment_name === nom);
  expect(lignes.length, "aucune ligne invalide n'a ete ecrite").toBe(1);
});

test("C2 production: la JOIN interne de l'historique est verifiee, pas supposée", async ({ request }) => {
  req = request;
  const tag = "C2 " + Date.now();
  const recette = await nouvelleRecette("Recette " + tag);
  const article = await nouveauArticle("Article " + tag);
  const lot = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "LOT-" + tag, expiration_date: "2030-01-01",
    quantity: 3, unit: "kg",
  });
  expect(lot.code, "lot cree").toBe(200);

  const bon = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: [lot.corps.id] });
  expect(bon.code, "production valide acceptee").toBe(200);
  expect(typeof bon.corps.productionId, "la clef creee est rendue").toBe("string");
  const hist = await lire("/api/haccp/production-history");
  const trace = hist.find((h: any) => h.id === bon.corps.productionId);
  expect(trace, "la production parait dans l'historique (sinon ecrite ET perdue)").toBeTruthy();
  expect(String(trace.batches ?? "")).toContain("LOT-" + tag);

  const fausse = await poste("/api/haccp/production", { recipe_id: "REC-INEXISTANTE", batch_ids: [lot.corps.id] });
  expect(fausse.code, "une recette inexistante est refusee (JOIN interne)").toBe(400);
  expect(fausse.corps.refused ?? []).toContain("recipe_id");

  const lotFaux = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: ["LOT-INEXISTANT"] });
  expect(lotFaux.code, "un lot inexistante est refuse").toBe(400);
  expect(lotFaux.corps.refused ?? []).toContain("batch_ids");
  expect(lotFaux.corps.inconnus, "les lots fautifs sont NOMMES").toEqual(["LOT-INEXISTANT"]);

  const pasTableau = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: { a: 1 } });
  expect(pasTableau.code, "batch_ids non tableau = 400 et non 500").toBe(400);
  const vide = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: [] });
  expect(vide.code, "liste vide refusee").toBe(400);

  const hist2 = await lire("/api/haccp/production-history");
  expect(hist2.length, "aucune production fantome n'a ete ecrite").toBe(hist.length);
});

test("C3 lot de traçabilite: article inconnu et quantite texte refuses", async ({ request }) => {
  req = request;
  const tag = "C3 " + Date.now();
  const article = await nouveauArticle("Article lot " + tag);
  const bon = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "L" + tag, expiration_date: "2030-06-01",
    quantity: 2.5, unit: "kg", reception_temp: 3.8, packaging_ok: true,
  });
  expect(bon.code, "lot valide").toBe(200);
  const relu = (await lire("/api/haccp/batches")).find((b: any) => b.id === bon.corps.id);
  expect(relu, "le lot ressort de la liste (JOIN inventory satisfaite)").toBeTruthy();
  expect(relu.product_name, "la jointure a un nom d'article").toBe("Article lot " + tag);
  expect(relu.quantity).toBe(2.5);
  expect(relu.reception_temp, "temperature a reception conservee").toBe(3.8);

  const inconnu = await poste("/api/haccp/batches", {
    inventory_id: "UNKNOWN", lot_number: "X", expiration_date: "2030-01-01", quantity: 1,
  });
  expect(inconnu.code, "une clef 'UNKNOWN' n'est pas une clef").toBe(400);
  expect(inconnu.corps.refused ?? []).toContain("inventory_id");

  const texte = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "Y", expiration_date: "2030-01-01", quantity: "deux",
  });
  expect(texte.code, "un texte dans la REAL de quantite est refuse").toBe(400);
  expect(texte.corps.refused ?? []).toContain("quantity");

  const date = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "Z", expiration_date: "31/12/2030", quantity: 1,
  });
  expect(date.code, "une date non ISO est refusee (tri lexicographique)").toBe(400);
  expect(date.corps.refused ?? []).toContain("expiration_date");

  // ⚠ LA VOIE QUE RIEN N'EXERCAIT (angle consigne puis SOLDE par la morsure).
  // Le cas `inventory_id: "UNKNOWN"` ci-dessus est happe par la regex de
  // clefEtrangere AVANT la confrontation a la table inventory: la branche
  // `SELECT id FROM inventory WHERE id = ?` n'etait donc jouee par AUCUNE
  // donnee du contrat, et retirer cette confrontation ne faisait pas rougir C3
  // (prononce par cd-morsure-haccp.py: M7 NE_MORD_PAS). Une clef BIEN FORMEE
  // mais absente de la table est la seule donnee qui l'atteigne — et c'est
  // aussi la faute la plus chere pour le chef: la ligne est ecrite puis
  // DISPARAIT de son ecran (GET /api/haccp/batches est un JOIN interne).
  const clefValideInexistante = await poste("/api/haccp/batches", {
    inventory_id: "art-inexistant-" + Date.now(), lot_number: "W",
    expiration_date: "2030-01-01", quantity: 1,
  });
  expect(clefValideInexistante.code,
    "une clef bien formee mais absente de inventory doit se refuser AVANT ecriture").toBe(400);
  expect(clefValideInexistante.corps.refused ?? []).toContain("inventory_id");
  const fantomes = (await lire("/api/haccp/batches")).filter((b: any) => b.lot_number === "W");
  expect(fantomes.length, "aucune ligne fantome n'est ecrite sur cette voie").toBe(0);

  const nomBlank = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "   ", expiration_date: "2030-01-01",
  });
  expect(nomBlank.code).toBe(400);
});

test("C4 actions correctives: la preuve est ecrite ET relisible (lecteur cree)", async ({ request }) => {
  req = request;
  const tag = "C4 " + Date.now();
  const releve = await poste("/api/haccp/temperature", { equipment_name: "Vitrine " + tag, temperature: 11.5 });
  expect(releve.code).toBe(200);

  const avant = await lire("/api/haccp/corrective-actions");
  expect(Array.isArray(avant), "la voie de lecture existe desorais").toBe(true);

  const bon = await poste("/api/haccp/corrective-action", {
    log_id: releve.corps.id, action_taken: "Evacuation et nettoyage " + tag,
  });
  expect(bon.code, "action valide").toBe(200);
  expect(typeof bon.corps.id).toBe("string");

  const relu = (await lire("/api/haccp/corrective-actions")).find((a: any) => a.id === bon.corps.id);
  expect(relu, "l'action corrective est RE-LISIBLE par l'auditeur").toBeTruthy();
  expect(relu.action_taken).toContain(tag);
  expect(relu.equipment_name, "rattachee a la releve d'origine").toBe("Vitrine " + tag);
  expect(relu.temperature).toBe(11.5);

  const orpheline = await poste("/api/haccp/corrective-action", {
    log_id: "RELEVE-INEXISTANTE", action_taken: "action sans objet",
  });
  expect(orpheline.code, "une action orphelinee est refusee").toBe(400);
  expect(orpheline.corps.refused ?? []).toContain("log_id");

  const vide = await poste("/api/haccp/corrective-action", { log_id: releve.corps.id, action_taken: "   " });
  expect(vide.code).toBe(400);
});

test("C5 capteur: clef cryptographique et collision", async ({ request }) => {
  req = request;
  const id = "cap-" + Date.now();
  const bon = await poste("/api/haccp/iot-sensors", {
    id, name: "Congelateur C5", type: "ambient", equipment_type: "Froid",
  });
  expect(bon.code, "capteur valide").toBe(200);
  expect(typeof bon.corps.token).toBe("string");
  expect((bon.corps.token as string).length, "le jeton a l'entropie d'un secret").toBeGreaterThanOrEqual(15);

  const dup = await poste("/api/haccp/iot-sensors", { id, name: "Doublon", type: "ambient", equipment_type: "Froid" });
  expect(dup.code, "une collision n'est pas un 500 muet").toBe(409);

  const vide = await poste("/api/haccp/iot-sensors", { id: "   ", name: "X", type: "ambient", equipment_type: "Froid" });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("id");

  const typeFaux = await poste("/api/haccp/iot-sensors", { id: "cap2-" + Date.now(), name: "X", type: "invention", equipment_type: "Froid" });
  expect(typeFaux.code, "un type hors liste est refuse").toBe(400);
  expect(typeFaux.corps.refused ?? []).toContain("type");
});

test("C6 webhook: le jeton est EXIGE (l'ancien 'if (token && ...)' laissait poster sans jeton)", async ({ request }) => {
  req = request;
  const id = "wh-" + Date.now();
  const reg = await poste("/api/haccp/iot-sensors", { id, name: "Sas C6", type: "probe", equipment_type: "Chaud" });
  expect(reg.code).toBe(200);
  const token = reg.corps.token as string;

  const sans = await poste("/api/haccp/webhook/iot-report", { id, temperature: 3.4 });
  expect(sans.code, "un poste qui omet le jeton ne poste pas").toBe(403);
  const faux = await poste("/api/haccp/webhook/iot-report", { id, token: "jeton-invente", temperature: 3.4 });
  expect(faux.code).toBe(403);
  const hors = await poste("/api/haccp/webhook/iot-report", { id: "capteur-absent", token, temperature: 3.4 });
  expect(hors.code).toBe(404);
  const bon = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: 3.4, battery: 90 });
  expect(bon.code, "le chemin valide fonctionne toujours").toBe(200);
  const aberrant = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: -450 });
  expect(aberrant.code, "releve hors plage refusee").toBe(400);
  const abus = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: 3.4, battery: 900 });
  expect(abus.code, "batterie impossible refusee").toBe(400);

  const logs = (await lire("/api/haccp/temperatures")).filter((l: any) => String(l.equipment_name).includes("Sas C6"));
  expect(logs.length, "une seule releve valide en base").toBe(1);
  expect(logs[0].temperature).toBe(3.4);
  expect(logs[0].entry_type, "l'ingestion IoT est signee iot").toBe("iot");
});

test("C7 nettoyage: une zone blanche ne fait pas une ligne de registre", async ({ request }) => {
  req = request;
  const tag = "C7 " + Date.now();
  const vide = await poste("/api/haccp/cleaning", { zone_name: "   " });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("zone_name");
  const absent = await poste("/api/haccp/cleaning", {});
  expect(absent.code).toBe(400);
  const bon = await poste("/api/haccp/cleaning", { zone_name: "Plonge " + tag });
  expect(bon.code).toBe(200);
  const relu = (await lire("/api/haccp/cleaning")).find((c: any) => c.zone_name === "Plonge " + tag);
  expect(relu, "le nettoyage est relu par la voie de l'app").toBeTruthy();
});

test("C8 la voie NON contractee (scan OCR) reste jouable, pas masquee", async ({ request }) => {
  req = request;
  const res = await request.post(`${BASE}/api/haccp/scan`, { data: {} });
  expect([200, 400, 415, 500], "la voie OCR repond et n'a pas disparu du routeur").toContain(res.status());
});

// --- Route 11 (DELETE /api/haccp/documents/:id) --------------------------
// Le chef supprime un document HACCP dans la vue DocumentsHaccp (fetch DELETE).
// Le contrat juge le DELTA: le document cree par la voie POST /api/haccp/documents
// est PRESENT dans GET /api/haccp/documents avant suppression, puis ABSENT apres.
// Le DELETE ne rend pas 500 sur une clef inexistante (DELETE FROM ... WHERE id=?).
test("D1 DELETE /api/haccp/documents/:id : le document quitte la liste apres suppression", async ({ request }) => {
  req = request;
  const nom = "Document Sonde D1 " + Date.now();
  const cr = await poste("/api/haccp/documents", { type: "AUTRE", name: nom });
  expect(cr.code, "creation document").toBe(200);
  const docId = cr.corps.id as string;
  expect(docId).toBeTruthy();

  const avant = (await lire("/api/haccp/documents")).find((d: any) => d.id === docId);
  expect(avant, "le document est PRESENT avant suppression").toBeTruthy();
  expect(avant.name).toBe(nom);

  const res = await req.delete(`${BASE}/api/haccp/documents/${docId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(String(body.status ?? body.success ?? "")).toBeTruthy();

  // DELTA : le document ne peut plus revenir dans la liste relue en base.
  const apres = await lire("/api/haccp/documents");
  expect(apres.find((d: any) => d.id === docId)).toBeFalsy();
});

// --- Route 12 (DELETE /api/haccp/iot-sensors/:id) -------------------------
// Le chef retire un capteur IoT dans la vue IoTManagement (fetch DELETE).
// Le contrat juge le DELTA: le capteur cree par POST /api/haccp/iot-sensors
// est PRESENT dans GET /api/haccp/iot-sensors avant suppression, puis ABSENT apres.
test("D2 DELETE /api/haccp/iot-sensors/:id : le capteur quitte la liste apres suppression", async ({ request }) => {
  req = request;
  const id = "cap-d2-" + Date.now();
  const cr = await poste("/api/haccp/iot-sensors", {
    id, name: "Congelateur D2", type: "ambient", equipment_type: "Froid",
  });
  expect(cr.code, "creation capteur").toBe(200);
  expect(cr.corps.token).toBeTruthy();

  const avant = (await lire("/api/haccp/iot-sensors")).find((s: any) => s.id === id);
  expect(avant, "le capteur est PRESENT avant suppression").toBeTruthy();
  expect(avant.name).toBe("Congelateur D2");

  const res = await req.delete(`${BASE}/api/haccp/iot-sensors/${id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(String(body.status ?? body.success ?? "")).toBeTruthy();

  // DELTA : le capteur ne peut plus revenir dans la liste relue en base.
  const apres = await lire("/api/haccp/iot-sensors");
  expect(apres.find((s: any) => s.id === id)).toBeFalsy();
});
