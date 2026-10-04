// Test e2e COMPORTEMENTAL du KPI « cout journalier de main d'oeuvre ».
//
// Pourquoi ce spec existe en plus de celui de routes.spec.ts. L'assertion
// existante sur /api/dashboard/stats (routes.spec.ts:102-107) verifie la FORME
// du JSON (`typeof body.totalStockValue === "number"`) et le `CRUD staff` assert
// sur staff.ts : la requete du KPI n'etait exercee par AUCUN test. Le bug du
// 10/09 y a vecu sans rougir : POST /api/staff ecrit `day = date = "<ISO>"`
// (StaffPlanning envoie des dates ISO) alors que la route filtrait
// `WHERE day = 'thursday'` → `dailyLaborCost` rendu a 0 chez le client malgre 6
// vacations saisees pour le jour. Assert « le champ est un nombre » laisse
// passer un champ qui est TOUJOURS le meme nombre : c'est un PASS creux, et
// exactemement ce que ce projet refuse.
//
// Ce spec juge le COMPORTEMENT par le DELTA, en passant par les MEMES routes
// que l'UI (le payload de StaffPlanning.saveToBackend, dates ISO incluses) :
//   A. une vacation du jour poste par l'UI doit bouger le KPI de tarif x heures
//   B. CONTRE-CONTROLE negatif : retiree, le KPI revient a sa ligne de base
//      (sans lui, la route pourrait empiler un montant invente -- elle rend deja
//      un `monthlyTrend: "+5.2%"` codé en dur, la preuve qu'un chiffre du corps
//      de reponse peut etre une fiction)
//   C. une vacation du LENDEMAIN ne doit RIEN ajouter au jour compte (c'est la
//      mutation la plus mechante du harnais scripts/mutation-test-labor.py : le
//      filtre du jour, simplement debranche, y survit)
//   D. un creneau a heures VIDES ne doit pas tourner le KPI en NaN/null
//      (''.split(':') → Number(undefined) → NaN, et JSON.stringify le convertit
//      en null : le KPI se vide sans qu'aucune erreur serveur ne sorte)
//
// Fixture `request` seule (aucun navigateur lance) : le job e2e du pipeline n'a
// donc pas besoin de `--with-deps` pour ce spec -- scripts/verify-ci.mjs decide
// sur les fixtures reellement destructures, pas sur les noms de fichiers.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(process.cwd(), "test", "tmp-kpi");

let server: ChildProcess;

// Meme convention que le routeur (getFullYear/getMonth/getDate LOCAUX) : un
// toISOString() serait en UTC et, entre 00:00 et 01:00 en CEST, donnerait la
// veille -- le test jugerait alors un autre jour que celui de la route.
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = isoLocal(new Date());
const TOMORROW = isoLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));

const TARIF = 30;
const DEBUT = "09:00";
const FIN = "17:00";
const HEURES = 8; // 09:00 -> 17:00
const ATTENDU = TARIF * HEURES; // 240

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR },
    stdio: "pipe",
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stderr.write(d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("le serveur de test n'a pas demarre (la migration d'init.ts a-t-elle tourne ?)");
}, 45_000);

test.afterAll(() => {
  server?.kill("SIGTERM");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const stats = async (request: any): Promise<any> => {
  const res = await request.get(`${BASE}/api/dashboard/stats`);
  expect(res.status()).toBe(200); // un 500 = la route est tombee dans son catch
  return res.json();
};

// Le payload EXACT de StaffPlanning.saveToBackend : schedule[cle] = creneaux,
// cle = date ISO, et datesObj qui lui redonne la meme valeur. Reproduire le
// payload de l'UI est le contrat de ce test : un payload invente jugerait une
// route que personne n'appelle.
const posterPlanning = async (request: any, id: string, date: string,
                              creneaux: { start: string; end: string }[]) => {
  const res = await request.post(`${BASE}/api/staff`, {
    data: { id, name: "Kpi Ouvrier", role: "Chef", hourlyRate: TARIF,
            schedule: { [date]: creneaux }, datesObj: { k: date } },
  });
  expect(res.status()).toBe(200);
};

test("KPI main d'oeuvre : le cout du jour est calcule, et non passee en fiction",
     async ({ request }) => {
  const cree = await request.post(`${BASE}/api/staff`, {
    data: { name: "Kpi Ouvrier", role: "Chef", hourlyRate: TARIF },
  });
  expect(cree.status()).toBe(200);
  const id = (await cree.json()).id;
  expect(typeof id).toBe("string");

  // --- ligne de base, lue AVANT toute injection (lue apres, le delta attendu
  // serait 0 : c'est le defaut qu'a eu la premiere version de cette preuve).
  const base = (await stats(request)).dailyLaborCost;
  expect(typeof base).toBe("number");

  // --- A. la vacation du jour doit etre compte, au centime pres -----------
  await posterPlanning(request, id, TODAY, [{ start: DEBUT, end: FIN }]);
  const avec = (await stats(request)).dailyLaborCost;
  expect(avec).toBeCloseTo(base + ATTENDU, 1e-6);

  // --- B. contre-controle negatif : retiree, retour exact a la ligne de base
  await posterPlanning(request, id, TODAY, []);
  const retire = (await stats(request)).dailyLaborCost;
  expect(retire).toBeCloseTo(base, 1e-6);

  // --- C. une vacation du LENDEMAIN ne doit rien ajouter au jour compte ---
  await posterPlanning(request, id, TOMORROW, [{ start: DEBUT, end: FIN }]);
  const voisin = (await stats(request)).dailyLaborCost;
  expect(voisin).toBeCloseTo(base, 1e-6);

  // --- D. un creneau a heures VIDES ne doit pas tourner le KPI en NaN ------
  // Le NOT NULL du schema n'empeche pas la chaine vide : ''.split(':') rend
  // [''], Number(undefined) rend NaN, et NaN se serialise en `null` dans le
  // JSON -- le KPI s'affiche vide sans AUCUNE erreur serveur visible.
  await posterPlanning(request, id, TODAY, [{ start: "", end: "" }]);
  const vide = await stats(request);
  expect(typeof vide.dailyLaborCost).toBe("number");
  expect(Number.isNaN(vide.dailyLaborCost)).toBe(false);
  expect(vide.dailyLaborCost).toBeCloseTo(base, 1e-6);
});
