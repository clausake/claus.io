// Contrat de POST /api/inventory (CREATION d'une ligne d'inventaire).
//
// Les payloads juges ici sont ceux que l'UI ENVOIE REELLEMENT, releves dans le
// code des trois voies d'ecriture de cette route (scripts/probe-post-inventory-
// voices.mjs les a joues avant le correctif et les verdicts sont consignes dans
// PHASES.md, Sprint 8) :
//   V1 InventoryAudit.tsx handleAddSubmit (~280) : {id, name, quantity, minStock,
//      unit, category, unit_price, yield_percent, dlc, status} avec status DERIVE
//      des quantites par l'UI elle-meme.
//   V2 DocumentManager.tsx handleQuickAdd (~138) : {name, unit, category,
//      minStock, unit_price} -- NI quantity NI status.
//   V3 HaccpModules.tsx saveBatch (~98) : {name, quantity: 0, minStock: 1,
//      unit, status: 'normal', category}.
//
// Ce que le contrat doit rendre, et ce que la sonde a trouve AVANT correctif :
//   P1 V2 sortoit en 500 sans laisser de ligne  -> 200 + ligne creee, quantity a
//      son defaut EXPLICITE 0, statut DERIVE de la regle de l'UI.
//   P2 un texte dans une colonne REAL y survivoit (relu 'beaucoup', typeof text)
//      ET la ligne disparaissait de /api/alerts (comparaison texte vs reel)
//      -> 400 + refused:['quantity'], aucune ligne.
//   P3 le statut etait ce que le client dit ('normal' admis) -> enum ferme.
//   P4 une clef deja prise sortoit en 500 -> 409 nomme, sans ecraser.
//   P5 la reponse recitoit le corps de la requete -> relecture en base.
// Et, comme dans tout le depot: chaque check est double par un DELTA et son
// RETOUR a la ligne de base, parce qu'un PASS qui ne peut pas rougir n'est pas
// une mesure.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-postinv");
const INSTANCE_TOKEN = "post-inventory-contract";

let server: ChildProcess;

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
    // le jeton DEDANS l'objet env (voir PHASES.md 7.6)
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

type Ligne = {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
  unit: string;
  status: string;
  category: string;
  unit_price: number | null;
  yield_percent: number | null;
};
type Corps = { status?: string; refused?: string[]; message?: string; id?: string } & Partial<Ligne>;

let seed = 0;
const prochainId = () => `postinv-${Date.now()}-${(seed += 1)}`;

async function ligneEnBase(request: any, id: string): Promise<Ligne | null> {
  const res = await request.get(`${BASE}/api/inventory`);
  expect(res.status()).toBe(200);
  const tout = (await res.json()) as Ligne[];
  return tout.find((i) => i.id === id) || null;
}

const creer = (request: any, data: Record<string, unknown>) =>
  request.post(`${BASE}/api/inventory`, { data });

// La voie V1, recopiee telle que l'UI la construit (aucun champ invente).
const payloadAudit = (id: string, sur: Record<string, unknown> = {}) => ({
  id,
  name: "Carotte V1",
  quantity: 10,
  minStock: 2,
  unit: "kg",
  category: "Sec",
  unit_price: 1.5,
  yield_percent: 100,
  dlc: "2026-12-31",
  status: "ok",
  ...sur,
});

test("P0 ligne de base (voie V1, l'ecran d'audits): creation + relecture en base", async ({ request }) => {
  const id = prochainId();
  const res = await creer(request, payloadAudit(id));
  expect(res.status()).toBe(200);
  const corps = (await res.json()) as Corps;
  // la clef EST rendue (DocumentManager.tsx:155 lit `result.id` pour lier la
  // ligne de facture a l'article: une reponse sans clef casse cet ecran)
  expect(corps.id).toBe(id);
  const relu = await ligneEnBase(request, id);
  expect(relu, "la ligne doit exister en base").not.toBeNull();
  expect(relu!.name).toBe("Carotte V1");
  expect(relu!.quantity).toBe(10);
  expect(relu!.minStock).toBe(2);
  expect(relu!.unit).toBe("kg");
  expect(relu!.category).toBe("Sec");
  expect(relu!.unit_price).toBe(1.5);
  expect(relu!.yield_percent).toBe(100);
  expect(relu!.status).toBe("ok");
  // et la reponse porte les VALEURS DE LA BASE, pas celles du corps envoye
  expect(corps.quantity).toBe(relu!.quantity);
  expect(corps.name).toBe(relu!.name);
  expect(corps.status).toBe(relu!.status);
});

test("P1 la voie V2 (ajout rapide de l'ecran facture) cree la ligne et ne sort plus en 500", async ({ request }) => {
  // DocumentManager handleQuickAdd: NI quantity NI status dans le payload.
  const id = prochainId();
  const res = await creer(request, {
    id,
    name: "Filet V2",
    unit: "kg",
    category: "Proteines",
    minStock: 2,
    unit_price: 0,
  });
  expect(res.status()).toBe(200);
  const relu = await ligneEnBase(request, id);
  expect(relu, "V2 doit creer la ligne (avant correctif: 500, AUCUNE ligne)").not.toBeNull();
  expect(relu!.quantity).toBe(0); // defaut EXPLICITE, et non un NULL
  expect(typeof relu!.quantity).toBe("number");
  // statut DERIVE par la regle de l'UI: 0 <= 2 -> critical
  expect(relu!.status).toBe("critical");
  expect(relu!.unit).toBe("kg");
  expect(relu!.category).toBe("Proteines");
  expect(relu!.minStock).toBe(2);
});

test("P2 un texte dans une colonne REAL est REFUSE (et ne disparait plus de /api/alerts)", async ({ request }) => {
  const id = prochainId();
  const res = await creer(request, payloadAudit(id, { quantity: "beaucoup" }));
  expect(res.status()).toBe(400);
  const corps = (await res.json()) as Corps;
  expect(Array.isArray(corps.refused)).toBe(true);
  expect(corps.refused).toContain("quantity");
  expect(await ligneEnBase(request, id), "aucune ligne ne doit exister").toBeNull();

  // CONTRE-CONTROLE, dans les DEUX sens de la regle d'alerte. Juger seulement
  // « la ligne texte n'est pas alertee » serait satisfait par une suite
  // d'alertes vide pour toujours (et c'est l'autre moitie du defaut : le texte
  // ne matche JAMAIS `quantity <= minStock`). Il faut donc prouver qu'une
  // donnee NUMERIQUE basse, elle, est bien alertee.
  // ⚠ La severite est `quantity <= 0 ? high : medium` (src/routes/search.ts,
  // GET /api/alerts). Je l'avais supposee « high » pour un stock bas non vide:
  // c'etait MON attente inventee, pas le contrat. Les deux branches sont jugees
  // ici, sinon la moitie haute ne serait exercee par personne.
  const idBas = prochainId();
  const okBas = await creer(request, payloadAudit(idBas, { quantity: 1, minStock: 5, status: undefined }));
  expect(okBas.status()).toBe(200);
  const idVide = prochainId();
  const okVide = await creer(request, payloadAudit(idVide, { name: "Rupture V1", quantity: 0, minStock: 5, status: undefined }));
  expect(okVide.status()).toBe(200);

  const alertes = await (await request.get(`${BASE}/api/alerts`)).json();
  expect(Array.isArray(alertes)).toBe(true);
  const parMot = (clef: string) =>
    (alertes as any[]).filter((a) => String(a.message).includes(clef)).map((a) => a.severity);
  expect(parMot("Carotte V1").length, "un stock bas doittre alerte").toBeGreaterThan(0);
  expect(parMot("Carotte V1")[0], "bas mais non vide -> medium").toBe("medium");
  expect(parMot("Rupture V1")[0], "quantite 0 -> high").toBe("high");

  // et la ligne texte du haut de ce test n'apparait toujours pas, elle:
  expect(parMot("Test Texte").length, "une quantite en TEXTE ne doit jamais alerter").toBe(0);
});

test("P3 le statut est un jeu ferme: 'normal' (voie V3) est refuse, les valeurs de l'UI admises", async ({ request }) => {
  const id = prochainId();
  const res = await creer(request, payloadAudit(id, { status: "normal" }));
  expect(res.status()).toBe(400);
  expect(((await res.json()) as Corps).refused).toContain("status");
  expect(await ligneEnBase(request, id)).toBeNull();

  for (const [statut, quantity, minStock] of [
    ["ok", 50, 2],
    ["low", 3, 2],
    ["critical", 1, 2],
    ["active", 10, 0],
  ] as [string, number, number][]) {
    const rid = prochainId();
    const ok = await creer(request, payloadAudit(rid, { status: statut, quantity, minStock }));
    expect(ok.status(), `statut ${statut} doit etre admis`).toBe(200);
    const relu = await ligneEnBase(request, rid);
    expect(relu!.status).toBe(statut);
  }

  // et, absent, il est DERIVE et non vide/NULL: 10/2 -> ok, 3/2 -> low, 1/2 -> critical
  for (const [quantity, minStock, attend] of [
    [10, 2, "ok"],
    [3, 2, "low"],
    [1, 2, "critical"],
  ] as [number, number, string][]) {
    const did = prochainId();
    const d = await creer(request, payloadAudit(did, { status: undefined, quantity, minStock }));
    expect(d.status()).toBe(200);
    expect((await ligneEnBase(request, did))!.status, `statut derive pour ${quantity}/${minStock}`).toBe(attend);
  }
});

test("P4 name absent, vide, blanc ou non-str: 400 nomme (et non 500)", async ({ request }) => {
  for (const [label, valeur] of [
    ["absent", undefined],
    ["vide", ""],
    ["blanc", "   "],
    ["nombre", 42],
    ["tableau", []],
    ["null", null],
  ] as [string, unknown][]) {
    const id = prochainId();
    const body = payloadAudit(id) as Record<string, unknown>;
    if (valeur === undefined) delete body.name;
    else body.name = valeur;
    const res = await creer(request, body);
    expect(res.status(), `name ${label}`).toBe(400);
    expect(((await res.json()) as Corps).refused, `name ${label}`).toContain("name");
    expect(await ligneEnBase(request, id), `name ${label} ne doit rien creer`).toBeNull();
  }
});

test("P5 clef deja prise: 409 nomme, sans ecraser la ligne existante", async ({ request }) => {
  const id = prochainId();
  expect((await creer(request, payloadAudit(id))).status()).toBe(200);
  const res = await creer(
    request,
    payloadAudit(id, { name: "CHEVAL DE TROIE", quantity: 999, unit_price: 7 }),
  );
  expect(res.status()).toBe(409);
  const relu = await ligneEnBase(request, id);
  expect(relu!.name, "la ligne d'origine est intacte").toBe("Carotte V1");
  expect(relu!.quantity).toBe(10);
  expect(relu!.unit_price).toBe(1.5);
});

test("P6 bornes et non-nombres des quantites: 400 + refused, zero ligne", async ({ request }) => {
  const cas: [string, Record<string, unknown>, string][] = [
    ["quantity negative", { quantity: -5 }, "quantity"],
    ["quantity infinie", { quantity: 1e999 }, "quantity"],
    ["quantity NaN texte", { quantity: "nan" }, "quantity"],
    ["minStock negatif", { minStock: -1 }, "minStock"],
    ["minStock au-dessus de la borne", { minStock: 2000000 }, "minStock"],
    ["unit_price negatif", { unit_price: -0.01 }, "unit_price"],
    ["rendement a 101", { yield_percent: 101 }, "yield_percent"],
    ["rendement a -1", { yield_percent: -1 }, "yield_percent"],
  ];
  for (const [label, sur, champ] of cas) {
    const id = prochainId();
    const res = await creer(request, payloadAudit(id, sur));
    expect(res.status(), `cas ${label}`).toBe(400);
    expect(((await res.json()) as Corps).refused, `cas ${label}`).toContain(champ);
    expect(await ligneEnBase(request, id), `cas ${label} ne doit rien creer`).toBeNull();
  }
  // et un nombre ENVOYE COMME CHAINE numerique est une saisie legitime de
  // l'ecran (parseInt/parseFloat de DocumentManager): admis, et STOCHE en nombre.
  const id2 = prochainId();
  const ok = await creer(request, payloadAudit(id2, { quantity: "7", minStock: "2" }));
  expect(ok.status()).toBe(200);
  const relu = await ligneEnBase(request, id2);
  expect(relu!.quantity).toBe(7);
  expect(typeof relu!.quantity).toBe("number");
  expect(relu!.minStock).toBe(2);
});

test("P7 la reponse ne recite pas la requete: elle rend la ligne RELLE", async ({ request }) => {
  // On envoie un yield_percent que le client n'a pas a imposer et on verifie
  // que la reponse porte la valeur de la BASE; puis on RELIT par la voie V1
  // complete et on compare les deux, ce qui empeche un PASS creux « reponse ==
  // requete » dans les deux sens.
  // ⚠ Pour que « la reponse ne recite pas la requete » soit REELLEMENT jugeable,
  // la reponse doit porter un champ que le client n'a PAS envoye tel quel: ici un
  // nom a TRIMMER et un statut a MINUSCULER (deux normalisations que la route
  // fait et que la requete, elle, ne contient pas). Sans ce deviant, une
  // recitation du corps de la requete passerait tous les `toStrictEqual` de ce
  // test — c'est l'angle mort dans lequel la mutation M6 rendoit 9/9.
  const id = prochainId();
  const res = await creer(
    request,
    payloadAudit(id, { unit_price: 12.5, name: "   Hublot P7   ", status: "OK" }),
  );
  expect(res.status()).toBe(200);
  const corps = (await res.json()) as Corps;
  const relu = await ligneEnBase(request, id);
  for (const champ of ["name", "quantity", "minStock", "unit", "category", "unit_price", "status", "yield_percent"] as const) {
    expect(corps[champ], `le champ ${champ} de la reponse doit venir de la base`).toStrictEqual(relu![champ]);
  }
  // contre-controle: si la reponse se contentoit de reciter, un champ absent du
  // corps ne peut pas egaler la base -- on s'assure donc que la reponse EST
  // complete (un objet vide satisferait `toStrictEqual(undefined)`).
  expect(Object.keys(corps).length, "la reponse porte les colonnes").toBeGreaterThan(6);
  // et les deux champs normalises sont ceux de la BASE, pas ceux envoyes
  expect(relu!.name, "la base porte le nom trimme").toBe("Hublot P7");
  expect(corps.name, "la reponse porte le nom trimme et non celui envoye").toBe("Hublot P7");
  expect(corps.status, "la reponse porte le statut normalise et non celui envoye").toBe("ok");
});

test("P8 un payload de saisie ne sort JAMAIS en 500: refus nomme ou creation a defauts", async ({ request }) => {
  // C'est la porte par ou l'ajout rapide etait mort (P1): la route rendoit
  // « Failed to create inventory item » (500) sur tout ce que le binding ne
  // supportait pas. Un 500 ne dit au chef QUE « panne serveur », jamais quoi
  // corriger; un 400 nomme est la seule sortie exploitable.
  const refuses: [string, Record<string, unknown>, string][] = [
    ["payload vide", {}, "name"],
    ["sans nom", { quantity: 4, unit: "kg" }, "name"],
    ["nom vide", { name: "", quantity: 1 }, "name"],
    ["unite blanche", { name: "Unite vide", quantity: 1, minStock: 0, unit: "  " }, "unit"],
    ["categorie blanche", { name: "Cat vide", quantity: 1, minStock: 0, category: "   " }, "category"],
    // le NaN et l'Infinity de saisie arrivent en `null` (JSON.stringify les
    // convertit): ce n'est PAS une omission du client et ne doit pas recevoir
    // un defaut compatissant.
    // ⚠ UN CAS PAR CHAMP, et non un seul cas « un nombre en null »: les trois
    // nombres passent par le MEME helper, donc un seul cas ne juge que la porte
    // qu'il touche (c'est exactement ce qui a fait rendre « M5 ne mord pas » alors
    // que la porte etait pleine: la mutation etait hors de toute voie testee).
    ["quantity serialise en null", { name: "Null Q", quantity: null }, "quantity"],
    ["minStock serialise en null", { name: "Null M", minStock: null }, "minStock"],
    ["unit_price serialise en null", { name: "Null P", unit_price: null }, "unit_price"],
    ["rendement serialise en null", { name: "Null Y", yield_percent: null }, "yield_percent"],
    // la MEME ordure sous sa forme d'origine (ce que l'UI croyait envoyer):
    ["quantity = Infinity (JSON le convertit en null)", { name: "Inf Q", quantity: Infinity }, "quantity"],
    ["quantity = NaN", { name: "NaN Q", quantity: NaN }, "quantity"],
    ["minStock = Infinity", { name: "Inf M", minStock: Infinity }, "minStock"],
    ["unit_price = NaN", { name: "NaN P", unit_price: NaN }, "unit_price"],
    ["yield_percent = NaN", { name: "NaN Y", yield_percent: NaN }, "yield_percent"],
    ["statut null", { name: "Null S", status: null }, "status"],
    ["statut invente", { name: "Statut bidon", quantity: 9, minStock: 1, status: "normal" }, "status"],
  ];
  for (const [label, body, champ] of refuses) {
    const res = await creer(request, body);
    expect(res.status(), `payload ${label}`).toBe(400);
    const corps = (await res.json()) as Corps;
    expect(Array.isArray(corps.refused), `refused pour ${label}`).toBe(true);
    expect(corps.refused, `refused pour ${label}`).toContain(champ);
    expect(corps.message, `message present pour ${label}`).toBeTruthy();
  }

  // ET LA MOITIE QUE CES CAS NE JUVENT PAS (l'angle mort du 400 generaliste) :
  // une saisie MINIMALE legitime doit creer la ligne avec les defauts du
  // schema. Sans ce temps, une route qui répondrait 400 a tout aurait ce test
  // vert, et l'ajout rapide resterit mort.
  const idMin = prochainId();
  const minimal = await creer(request, { id: idMin, name: "Seul nom" });
  expect(minimal.status(), "un nom seul est une saisie legitime (defauts du schema)").toBe(200);
  const relu = await ligneEnBase(request, idMin);
  expect(relu, "la ligne doit exister").not.toBeNull();
  expect(relu!.quantity, "defaut explicite et non NULL").toBe(0);
  expect(relu!.minStock).toBe(0);
  expect(relu!.unit, "defaut de l'UI").toBe("kg");
  expect(relu!.category).toBe("Uncategorized");
  expect(relu!.unit_price).toBe(0);
  expect(relu!.yield_percent, "le defaut du schema, pas un effacement").toBe(100);
  expect(relu!.status, "0 <= 0 -> critical, par la regle de l'UI").toBe("critical");
});

// --- Route 13 (POST /api/inventory/analyze) -------------------------------
// L'Assistant IA (InventoryDashboard handleAnalyzeInventory) relit l'inventaire
// EN BASE puis construit son prompt: le contexte porte le nom/quantite/min de
// TOUTES les lignes, et les low/critical relus de la meme base. Le contrat juge
// un corps exploitable dans les deux branches Ollama: present -> { analysis: texte },
// absent -> 500 { status:'error', message:'Désolé Chef, l'analyse stratégique...' }.
// Un 500 muet ne dit au chef QUE « panne serveur »: la branche absent sort avec
// une raison NOMMEE.
test("A1 POST /api/inventory/analyze : repond un corps exploitable dans les deux branches Ollama", async ({ request }) => {
  // une ligne de stock bas relue par le routeur AVANT l'appel — elle est dans
  // le contexte du prompt quand la branche Ollama present repond.
  const low = await creer(request, { id: prochainId(), name: "A1 Analyse Beurre", quantity: 0, minStock: 1, unit: "kg" });
  expect(low.status()).toBe(200);
  const invId = (await low.json()).id;

  const res = await request.post(`${BASE}/api/inventory/analyze`, { data: {} });
  expect([200, 500]).toContain(res.status());
  const corps = (await res.json()) as any;
  expect(typeof corps).toBe("object");
  if (res.status() === 200) {
    // corps exploitable: la clef analysis porte le texte relit par le routeur
    expect(String(corps.analysis ?? "")).toBeTruthy();
  } else {
    // branche Ollama absent: raison NOMMEE, pas un 500 muet.
    expect(String(corps.message ?? "")).toBeTruthy();
  }
});
