// Preuve de la chaine d'approvisionnement : PLANNING -> BESOIN -> BON -> STOCK.
//
// Pourquoi ce spec existe. Pendant des mois la colonne « Besoin Recettes » a
// rendu 0 pour toutes les lignes : la route recopiait `besoin_recettes: 0` sans
// jamais lire menu_planning. La suggestion de commande (`minStock - quantity +
// besoin_recettes`) etait donc toujours egale a `minStock - quantity` : le
// cuisinier qui prepare le service du lendemain commandait a l'oeil pendant que
// l'ecran affichait un chiffre. Aucun test ne le voyait parce qu'AUCUN test
// n'exercait la prevision. C'est la meme classe de faute que le KPI `dailyLaborCost`
// a 0 (Sprint 4.11) : un champ fige a sa valeur par defaut, lu comme une mesure.
//
// Ce spec juge donc des DELTA et non des formes :
//   A. un service planifie (couverts × gramature, au rendement pres) DOIT bouger
//      le besoin de la ligne, au centieme pres, contre un calcul attendu ecrit
//      ici a la main (oracle independant, pas un re-call de la route)
//   B. contre-controle negatif : le planning retire, le besoin revient a la ligne
//      de base (un delta qui ne revient pas ne prouvait rien)
//   C. un service HORS fenetre (au-dela de l'horizon) ne doit rien ajouter
//   D. le rendement d'epeluchage est un diviseur : 80 % => besoin x1.25
//   E. un bon de commande doit enregistrer le VRAI inventory_id (et non le nom) :
//      c'est la cle qui permet la reception, sinon l'UPDATE de stock ne touche
//      0 ligne en silence
//   F. reception : le stock bouge reellement, le statut du document aussi
//   G. un article inconnu du bon ne part pas en silence (400 + nom rapporte)
//   H. un ?ids= (ajout « manuel ») n'est plus ignore par le serveur
//
// ⚠ Le `recipe_json` porte les couverts : il n'y a PAS de colonne `couverts`
// dans menu_planning. Semer l'une et juger l'autre produit un PASS creux (la
// faute du harnais d'index du 09/09, voir PHASES.md).
//
// Fixture `request` seule : aucun navigateur lance, donc pas de --with-deps pour
// ce spec (scripts/verify-ci.mjs decide sur les fixtures reellement destructures).
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-purchasing");

// Le jeton que CE test impose au serveur (COOKDRIVE_INSTANCE_TOKEN). Le serveur
// le rend dans l'en-tete X-Cookdrive-Instance de CHAQUE reponse. La confrontation
// des deux est la seule preuve disponible que la reponse vient bien de L'INSTANCE
// QUE CE TEST A LANCEE -- et non d'un serveur herite qui aurait repris le port.
// Un port demande a l'OS puis referme est par nature un port que n'importe qui
// peut reprendre entre le listen() et le notre.
const INSTANCE_TOKEN = `purchasing-${process.pid}-${Date.now()}`;

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

// Meme convention que la route (getYear/getMonth/getDay LOCAUX) : un toISOString()
// serait en UTC et, entre 00:00 et 02:00 en CEST, donnerait la veille — la fenetre
// [aujourdhui, aujourdhui+horizon] jugerait alors un jour de trop ou de moins.
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = isoLocal(new Date());
const dayOffset = (n: number) =>
  isoLocal(new Date(Date.now() + n * 24 * 60 * 60 * 1000));

// Les 2 ingredients de la sonde, gramatures connues. LA cle de la recette n'est
// PAS une constante : elle est generee par POST /api/recipes (Math.random().
// toString(36)). Semer un menu_planning avec une cle inventee fit passer le JOIN
// a 0 ligne et le besoin a 0 — un PASS creux de plus, puisque le 0 ressemble a la
// reponse attendue quand RIEN n'est planifie. On relit donc la cle reelle.
const GPP_TOMATE = 120; // g par convive
const INV_TOMATE = "sonde-tomate";
const INV_HUILLE = "sonde-huile";
const COUVERTS = 20;
const GPP_HUILLE = 10;

const post = (request: any, url: string, data: any) =>
  request.post(`${BASE}${url}`, { data });

let REAL_RECIPE_ID = "";
const recipeId = () => REAL_RECIPE_ID;

async function seedBase(request: any) {
  await post(request, "/api/inventory", {
    id: INV_TOMATE,
    name: "Tomate Grappe Sonde",
    quantity: 5,
    minStock: 30,
    unit: "g",
    status: "low",
    category: "Legume",
    unit_price: 0.02,
    yield_percent: 100,
  });
  await post(request, "/api/inventory", {
    id: INV_HUILLE,
    name: "Huile Olives Sonde",
    quantity: 900,
    minStock: 100,
    unit: "ml",
    status: "ok",
    category: "Epicerie",
    unit_price: 0.01,
    yield_percent: 100,
  });

  // Le plat est cree via la VOIE DE L'APP (POST /api/recipes) et non par un INSERT
  // direct : c'est elle qui definit la forme de recipe_ingredients.quantite_par_personne.
  const cree = await post(request, "/api/recipes", {
    name: "Salade Sonde",
    category: "entree",
    ingredients: [
      { inventory_name: "Tomate Grappe Sonde", quantity_per_person: GPP_TOMATE, unit: "g" },
      { inventory_name: "Huile Olives Sonde", quantity_per_person: GPP_HUILLE, unit: "ml" },
    ],
  });
  expect(cree.status()).toBe(200);
  REAL_RECIPE_ID = (await cree.json()).id;
  expect(typeof REAL_RECIPE_ID).toBe("string");

  // Le nom reellement enregistre n'est pas forcement celui demande (le flou de
  // findMatchingInventoryItem peut mapper) : on relit la recette pour juger sur
  // la cle qui EST en base, sinon le delta attendu porterait sur un id invente.
  const recettes = await (await request.get(`${BASE}/api/recipes`)).json();
  const maRecette = recettes.find((r: any) => r.id === REAL_RECIPE_ID);
  expect(maRecette, "la recette de sonde n'est pas relisible").toBeTruthy();
  const parNom: Record<string, any> = {};
  for (const ing of maRecette.ingredients) parNom[ing.inventory_name] = ing;
  expect(parNom["Tomate Grappe Sonde"], "ingredient tomate non lie").toBeTruthy();
  return maRecette.ingredients.map((i: any) => i.inventory_id);
}

const lineOf = async (request: any, inventoryId: string, horizon = 14) => {
  const res = await request.get(
    `${BASE}/api/purchasing/forecast?horizon=${horizon}`,
  );
  expect(res.status()).toBe(200); // un 500 = la route tombee dans son catch
  const payload = await res.json();
  expect(Array.isArray(payload.items), "forecast: items doit etre un tableau").toBe(
    true,
  );
  expect(payload.window, "forecast: window absent (le chiffre n'a plus d'origine)").toBeTruthy();
  const ligne = payload.items.find((f: any) => f.inventory_id === inventoryId);
  return { ligne, window: payload.window, all: payload.items };
};

const planifier = (request: any, date: string, couverts: number) =>
  post(request, "/api/menu-planning", {
    date,
    meal_type: "LUNCH",
    recipe_id: recipeId(),
    title: "Salade Sonde",
    recipe_json: JSON.stringify({ couverts }),
  });

// Le port est EPHEMERE et non figure. Deux runs successifs (le harnais de
// mutations relance le meme spec huit fois) partagent un port figure : apres un
// kill(SIGTERM), l'ancien serveur peut encore drainer et repondre sur le port,
// le nouveau bind echoue en EADDRINUSE, et le test juge alors une instance
// PERIMEE qui n'a pas la source mutee. Resultat : la mutation ne rougit pas
// (rc=0) et le harnais annonce a tort « ne mord pas ». Un port demande a l'OS
// plus une attente de liberation rendent chaque run reellement isole.
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

// Attend que le port soit reellement rendu par l'OS (fin du drain) au lieu de
// supposer que SIGTERM a deja tout termine.
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
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  // PAS d'await ici : la promesse se resout a la MORT du serveur.
  // L'attendre ici ferait attendre a beforeAll que le serveur meure avant de
  // continuer — un timeout de hook a 90 s garanti.
  serveurFini = new Promise<void>((resolve) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, COOKDRIVE_AUTH_OFF: "1", PORT: String(PORT), USER_DATA_PATH: DATA_DIR, COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN },
      stdio: "pipe",
    });
    server.on("exit", () => resolve());
  });
  server.stdout?.on("data", (d) => process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stderr.write(d));
  const deadline = Date.now() + 30_000;
  // Deux causes d'attente, un seul message d'echec : sans les separer, un
  // "serveur pas pret" masque une collision de port, qui est un defaut d'HARNAIS
  // et non du produit. Le compteur est affiche parce que "le test n'a pas demarre"
  // ne se debogague pas sans savoir combien d'essais ont eu lieu ni ce qu'ils ont
  // vu repondre.
  const tentatives: string[] = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (!res.ok) {
        // ⚠ `status` est une PROPRIETE sur une reponse fetch (undici), non une
        // methode comme sur l'APIResponse de Playwright. Appelée, elle jette un
        // TypeError que le catch du dessous avale -- et l'attente tournerait
        // jusqu'au deadline en rapportant un faux « serveur pas pret ».
        tentatives.push(`!ok ${res.status}`);
      } else {
        // ⚠ Le point entier de ce bloc. `res.ok` prouve qu'UN serveur repond sur
        // ce port ; il ne prouve PAS que c'est le notre. On confronte donc
        // l'en-tete d'identite, et une divergence est un ECHEC DU HARNAIS
        // immediat (et non une attente de plus long : patienter ne rendra jamais
        // l'intrus plus conforme). Juger une instance perimee est pire que ne
        // rien juger du tout, puisque le verdict, VERT comme ROUGE, est faux.
        const vu = res.headers.get("x-cookdrive-instance");
        if (vu !== INSTANCE_TOKEN) {
          throw new Error(
            `PORT HAUTE SUR UN AUTRE SERVEUR (instance perimee). ` +
              `Le port ${PORT} est tenu par une instance qui ne rend pas le jeton attendu ` +
              `(attendu="${INSTANCE_TOKEN}", recu=${vu === null ? "<AUCUN>" : `"${vu}"`}). ` +
              `Un serveur herite a repris ce port entre le test de port libre et le notre ; ` +
              `le test refuserait de juger une source qu'il n'a pas installee. ` +
              `tentatives=${tentatives.length}`,
          );
        }
        return;
      }
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      if (msg.includes("instance perimee")) throw e as Error;
      tentatives.push(msg.slice(0, 80));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `le serveur de test n'a pas demarre (tentatives=${tentatives.length}, ` +
      `dernieres=[${tentatives.slice(-4).join(" | ")}])`,
  );
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  if (PORT) await attendrePortLibre(PORT);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test(
  "chaines appro : le besoin vient du planning, le bon du besoin, le stock du bon",
  async ({ request }) => {
    const ids = await seedBase(request);
    expect(ids.length).toBe(2);
    const tomate = ids.find((i: string) => i.startsWith("sonde-")) as string;
    expect(tomate).toBeTruthy();

    // --- ligne de base, lue AVANT toute injection ---------------------------
    // Lue apres, le delta attendu serait 0 : c'est exactement le defaut qui a
    // laisse `besoin_recettes: 0` passer pour une mesure.
    const baseTomate = (await lineOf(request, INV_TOMATE)).ligne;
    expect(baseTomate, "la ligne de sonde doit etre dans la prevision").toBeTruthy();
    const base = baseTomate.besoin_recettes;
    expect(typeof base).toBe("number");
    expect(base).toBe(0); // rien de planifie : 0 est ICI une valeur juste

    // --- A. un service planifie doit bouger le besoin -----------------------
    const p = await planifier(request, TODAY, COUVERTS);
    expect(p.status()).toBe(200);
    const apres = (await lineOf(request, INV_TOMATE)).ligne;
    // Oracle ecrit a la main : 20 couverts x 120 g / (100/100) = 2400.
    expect(apres.besoin_recettes).toBeCloseTo(COUVERTS * GPP_TOMATE, 1e-6);

    // la gramature relle en base peut differer de celle demandee (le flou
    // d'appariement) : on la relit et on re-juge contre elle.
    const recettes = await (await request.get(`${BASE}/api/recipes`)).json();
    const maRecette = recettes.find((r: any) => r.id === recipeId());
    const gppRel = maRecette.ingredients.find(
      (i: any) => i.inventory_id === INV_TOMATE,
    ).quantity_per_person;
    expect(apres.besoin_recettes).toBeCloseTo(COUVERTS * gppRel, 1e-6);

    // --- B. contre-controle negatif : retire, retour a la ligne de base ----
    const liste = await (await request.get(`${BASE}/api/menu-planning`)).json();
    for (const l of liste) {
      await request.delete(`${BASE}/api/menu-planning/${l.id}`);
    }
    const retire = (await lineOf(request, INV_TOMATE)).ligne;
    expect(retire.besoin_recettes).toBeCloseTo(base, 1e-6);

    // --- C. hors fenetre : au-dela de l'horizon, rien n'entre --------------
    await planifier(request, dayOffset(40), COUVERTS);
    const horsFen = (await lineOf(request, INV_TOMATE)).ligne;
    expect(horsFen.besoin_recettes).toBeCloseTo(base, 1e-6);
    // et la meme date, si on borne a 45 jours, ELLE entre : prouve que c'est
    // bien le FILTRE qui exclut et non un calcul qui tomberait a 0 par defaut.
    const elargi = (await lineOf(request, INV_TOMATE, 45)).ligne;
    expect(elargi.besoin_recettes).toBeCloseTo(COUVERTS * gppRel, 1e-6);

    // --- D. le rendement d'epeluchage est un diviseur ----------------------
    // On remplit le service du jour : les etapes precedentes ont vide le planning
    // et ne laisse que le +40 jours (hors fenetre), sans quoi le besoin du jour
    // serait 0 et le test du rendement jugerait un scan vide.
    await planifier(request, TODAY, COUVERTS);
    await request.put(`${BASE}/api/inventory/${INV_TOMATE}`, { data: {
      id: INV_TOMATE,
      name: "Tomate Grappe Sonde",
      quantity: 5,
      minStock: 30,
      unit: "g",
      status: "low",
      category: "Legume",
      unit_price: 0.02,
      yield_percent: 80,
    } });
    const avecRdt = (await lineOf(request, INV_TOMATE)).ligne;
    expect(avecRdt.besoin_recettes).toBeCloseTo((COUVERTS * gppRel) / 0.8, 1e-3);
    // un rendement a 0 (saisi par megarde) ne doit PAS faire exploser ni annuler
    // le besoin : il se lit comme un absent (100 %).
    await request.put(`${BASE}/api/inventory/${INV_TOMATE}`, { data: {
      id: INV_TOMATE,
      name: "Tomate Grappe Sonde",
      quantity: 5,
      minStock: 30,
      unit: "g",
      status: "low",
      category: "Legume",
      unit_price: 0.02,
      yield_percent: 0,
    } });
    const rdtNul = (await lineOf(request, INV_TOMATE)).ligne;
    expect(rdtNul.besoin_recettes).toBeCloseTo(COUVERTS * gppRel, 1e-6);
    await request.put(`${BASE}/api/inventory/${INV_TOMATE}`, { data: {
      id: INV_TOMATE,
      name: "Tomate Grappe Sonde",
      quantity: 5,
      minStock: 30,
      unit: "g",
      status: "low",
      category: "Legume",
      unit_price: 0.02,
      yield_percent: 100,
    } });

    // --- E. le bon doit porter le VRAI inventory_id ------------------------
    const stockAvant = await (await request.get(`${BASE}/api/inventory`)).json();
    const tomateAvant = stockAvant.find((i: any) => i.id === INV_TOMATE);
    const qteAvant = Number(tomateAvant.quantity);

    const bon = await post(request, "/api/purchasing/order", {
      supplier: "Terre Azur Sonde",
      items: [
        { inventory_id: INV_TOMATE, quantity: 1000, unit_price: 0.02 },
        { inventory_id: INV_HUILLE, quantity: 500, unit_price: 0.01 },
      ],
    });
    expect(bon.status()).toBe(200);
    const bonBody = await bon.json();
    expect(bonBody.lines).toBe(2);
    expect(bonBody.total_amount).toBeCloseTo(1000 * 0.02 + 500 * 0.01, 1e-9);

    const bons = await (await request.get(`${BASE}/api/purchasing/orders`)).json();
    const notreBon = bons.find((d: any) => d.id === bonBody.documentId);
    expect(notreBon, "le bon n'est pas relisible").toBeTruthy();
    expect(notreBon.status).toBe("PENDING");
    for (const it of notreBon.items) {
      // Le noeud de toute la chaine : une ligne dont l'inventaire_id serait le
      // NOM ne jointur rien, et la reception le laisserait passer sans erreur.
      expect(
        [INV_TOMATE, INV_HUILLE],
        `ligne branche sur un nom et non un id : ${it.inventory_id}`,
      ).toContain(it.inventory_id);
      expect(it.inventory_name, "la jointure d'inventaire doit parler").toBeTruthy();
    }

    // --- F. la reception fait bouger le stock ------------------------------
    const recep = await post(
      request,
      `/api/purchasing/orders/${bonBody.documentId}/receive`,
      { received: [] },
    );
    expect(recep.status()).toBe(200);
    const recepBody = await recep.json();
    expect(recepBody.order_status).toBe("RECEIVED");
    expect(recepBody.received_lines).toBe(2);

    const stockApres = await (await request.get(`${BASE}/api/inventory`)).json();
    const tomateApres = stockApres.find((i: any) => i.id === INV_TOMATE);
    expect(Number(tomateApres.quantity)).toBeCloseTo(qteAvant + 1000, 1e-6);

    // le statut du stock suit le mouvement (regle identique a la validation de
    // factrure : un stock qui bouge sans que le badge bouge est un stock qui ment)
    expect(["ok", "low", "critical"]).toContain(tomateApres.status);

    // --- F2. idempotence de la reception ---------------------------------
    // Le statut seul ne prouve RIEN ici (il reste 'RECEIVED' meme si le stock
    // est double). Seule la QUANTITE juge : un double-clic sur « Receptionner »,
    // ou un retry du reseau, doit laisser le stock au meme solde. Sans le garde
    // d'idempotence de la route, ce check rougit — c'est ce qui le rend utile.
    const recep2 = await post(
      request,
      `/api/purchasing/orders/${bonBody.documentId}/receive`,
      { received: [] },
    );
    const r2 = await recep2.json();
    expect(r2.order_status).toBe("RECEIVED");
    expect(r2.received_lines).toBe(0);
    const stockRecheck = await (await request.get(`${BASE}/api/inventory`)).json();
    const tomateRecheck = stockRecheck.find((i: any) => i.id === INV_TOMATE);
    expect(Number(tomateRecheck.quantity)).toBeCloseTo(qteAvant + 1000, 1e-6);

    // --- G. un article inconnu ne part pas en silence ----------------------
    const bonPourri = await post(request, "/api/purchasing/order", {
      supplier: "Terre Azur Sonde",
      items: [{ inventory_id: "Tomate Grappe Sonde", quantity: 5, unit_price: 1 }],
    });
    expect(bonPourri.status()).toBe(400);
    const faux = await bonPourri.json();
    expect(Array.isArray(faux.unknown_items)).toBe(true);
    expect(faux.unknown_items.length).toBe(1);

    // --- I. la validation de factrure reste idempotente -------------------
    // La validation est un mouvement de stock (quantity = quantity + ...). Sans
    // garde de deja-valide, un double-clic sur « Valider » (ou un retry du
    // reseau) additionnait la marchandise DEUX fois et le statut, deja a
    // VALIDATED, ne rougissait nulle part : le stock du client partait a 200 %
    // de ce qui a ete livre. Le second appel doit donc etre REFUSE (409) et le
    // solde doit rester au premier coup.
    await post(request, "/api/documents", {
      id: "sonde-fact",
      type: "FACTURE",
      supplier: "Terre Azur Sonde",
      date: TODAY,
      total_amount: 12,
      items: [
        {
          inventory_id: INV_HUILLE,
          original_name: "Huile Olives Sonde",
          quantity: 700,
          unit_price: 0.01,
        },
      ],
    });
    const stockHuileAvant = await (await request.get(`${BASE}/api/inventory`)).json();
    const huileAvant = Number(
      stockHuileAvant.find((i: any) => i.id === INV_HUILLE).quantity,
    );
    const v1 = await request.post(`${BASE}/api/documents/sonde-fact/validate`);
    expect(v1.status()).toBe(200);
    const huileApres1 = await (await request.get(`${BASE}/api/inventory`)).json();
    const qteApres1 = Number(
      huileApres1.find((i: any) => i.id === INV_HUILLE).quantity,
    );
    expect(qteApres1).toBeCloseTo(huileAvant + 700, 1e-6);

    const v2 = await request.post(`${BASE}/api/documents/sonde-fact/validate`);
    expect(v2.status(), "une seconde validation doit etre refusee").toBe(409);
    expect((await v2.json()).already_validated).toBe(true);
    const huileApres2 = await (await request.get(`${BASE}/api/inventory`)).json();
    expect(
      Number(huileApres2.find((i: any) => i.id === INV_HUILLE).quantity),
    ).toBeCloseTo(qteApres1, 1e-6);

    // --- J. un bon de commande NE se valide pas ---------------------------
    // Il porte des quantites PREVUES. S'il passait par la validation des factures
    // ET par la reception, la marchandise entrerait deux fois en stock.
    const valBon = await request.post(
      `${BASE}/api/documents/${bonBody.documentId}/validate`,
    );
    expect(valBon.status(), "un bon de commande ne doit pas se valider").toBe(409);
    expect(((await valBon.json()).message || "").toLowerCase()).toContain(
      "receptionne",
    );

    // --- K. une ligne HISTORIQUEMENT double-encodee doit rester lisible ---
    // La voie d'ecriture est reparee (normalizeRecipeJson ne re-stringify plus),
    // mais la base deja livree chez le client porte des lignes ecrites sous
    // l'ancienne regle : recipe_json y est du JSON-DE-JSON. coversOf doit donc
    // rester capable de les lire, sinon le besoin de ces plats-la retombe a 1
    // couvert et la commande est divisee par le nombre de convives. Ce check est
    // ce qui donne a la mutation M5 (le re-parse retire) de quoi rougir : sans
    // lui, la mutation etait un no-op sur des donnes fraiches et le harnais
    // annoncait « ne mord pas » pour une faute qui etait ailleurs.
    {
      const restants = await (await request.get(`${BASE}/api/menu-planning`)).json();
      for (const l of restants) {
        await request.delete(`${BASE}/api/menu-planning/${l.id}`);
      }
      const COUVERTS_DUP = 7;
      const dup = await post(request, "/api/menu-planning", {
        date: TODAY,
        meal_type: "LUNCH",
        recipe_id: recipeId(),
        title: "Salade Sonde (legataire)",
        // Le payload que l'ancienne version de la route a laisse en base : une
        // chaine DEJA serialisee, recopiee telle quelle dans la colonne.
        recipe_json: JSON.stringify(JSON.stringify({ couverts: COUVERTS_DUP })),
      });
      expect(dup.status()).toBe(200);
      const ligneDup = (await lineOf(request, INV_TOMATE)).ligne;
      expect(
        ligneDup.besoin_recettes,
        "une ligne double-encodee doit rester lisible (sinon le besoin retombe a 1 couvert)",
      ).toBeCloseTo(COUVERTS_DUP * gppRel, 1e-6);
    }

    // --- H. le filtre ?ids= n'est plus ignore ------------------------------
    const manuel = await lineOf(request, INV_TOMATE);
    const unSeul = await request.get(
      `${BASE}/api/purchasing/forecast?ids=${INV_HUILLE}`,
    );
    const manuelBody = await unSeul.json();
    expect(manuelBody.items.length).toBe(1);
    expect(manuelBody.items[0].inventory_id).toBe(INV_HUILLE);
    expect(manuelBody.items[0].manual).toBe(true);
    // un ?ids= malformate (injection de SQL en texte) ne doit RIEN casser.
    // Decision consignee : quand le parametre ne survit pas a la whitelist, le
    // serveur IGNORE le filtre (liste complete) au lieu de le vider. Vider le
    // tableau ferait croire au cuisinier qu'il n'a rien a commander, ce qui est
    // plus grave que lui montrer trop.
    const inject = await request.get(
      `${BASE}/api/purchasing/forecast?ids=${encodeURIComponent("1 OR 1=1")}`,
    );
    expect(inject.status()).toBe(200);
    const injectItems = (await inject.json()).items;
    expect(injectItems.length).toBe(manuel.all.length);
    // un melange valide + dechet ne garde QUE le valide : le filtre s'applique
    // (et ne tombe pas dans la liste complete), prouve par le compte de 1.
    const mele = await request.get(
      `${BASE}/api/purchasing/forecast?ids=${encodeURIComponent(INV_HUILLE + ", 1 OR 1=1")}`,
    );
    const meleBody = await mele.json();
    expect(meleBody.items.length).toBe(1);
    expect(meleBody.items[0].inventory_id).toBe(INV_HUILLE);
    // un id valide mais ABSENT de l'inventaire : le tableau se vide honnetement
    // (le filtre est applique) au lieu de retomber sur la liste complete.
    const absent = await request.get(`${BASE}/api/purchasing/forecast?ids=inexistant-9`);
    expect(((await absent.json()).items ?? []).length).toBe(0);
    void manuel;
  },
);
