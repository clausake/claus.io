// Preuve du contrat ECRIT/LUE de POST /api/supplier-prices.
//
// Pourquoi CE spec et pas un de plus: c'est la seule voie d'ecriture du projet
// dont le produit est lu par une DECISION. GET /api/supplier-prices/comparison
// designe le fournisseur au meilleur `calculated_price_per_ref`; un prix a 0,
// negatif, ou converti sur une fausse Echelle ne rend donc pas un champ laid: il
// DESIGNE UN FAUX MEILLEUR FOURNISSEUR et l'ecran affiche une economie inventee.
//
// Les six verdicts ci-dessous ne sont pas des suppositions: chacun correspond a
// une mesure rendue AVANT le correctif par scripts/probe-supplier-price-contract.mjs
// (S1_CODE=200 S1_PRIX_STOCK=0 / S2_CODE=200 S2_PRIX_STOCK=-12 /
//  S3_CALC_INCONNU=1000 / S4_VISIBLE_DANS_LA_LISTE=0 / S5_CODE=200
//  S5_LIGNE_CREEE=0 / S6_ELUE={"p":-12} S6_ECONOMIE_PCT=580).
//
// Regles jugees, et leur ORACLE (jamais un re-call de la route):
//   S1 le prix absent (le NaN que parseFloat rend du champ "3,5" vide) et la
//      chaine "2,50" sont REFUSES. Le defaut mesure: Number(null) vaut 0, donc
//      un prix oublie devenait un prix GRATUIT.
//   S2 le prix negatif est refuse, et — la partie qui compte — il ne peut plus
//      etre ELU par la comparaison.
//   S3 une unite hors famille rend un `null` ASSUME (prix_par_reference_
//      defendable=false), pas le facteur 1 herite du convertisseur: 1000 "kaz"
//      ne vaut plus 1000 "kg".
//   S4 une cle etrangere fantome est refusee AVANT l'ecriture: la ligne creee
//      ne survit pas au JOIN du GET, donc un 200 sur cette voie etoit un PASS
//      creux (un id rendu, une donnee perdue sans erreur).
//   S5 un UPDATE de 0 ligne sort en 404 et non en 200.
//   S6 la comparaison n'elit jamais une ligne non comparable; l'elue porte un
//      prix >= 0 et l'economie affichee est 0 quand rien ne bat la reference.
//   B  le booleen ne se DEVINE pas par truthiness: la chaine "false" rend 0
//      (l'ancien `x ? 1 : 0` la lisait comme VRAIE, donc un prix non verifie
//      passoit pour verifie).
//   R LA RELITURE: la reponse porte la ligne relue depuis la base, pas le corps
//      de la requete. Le contre-controle qui rend cette preuve non creuse est le
//      champ que le CLIENT N'ENVOIE PAS (`is_verified_from_invoice`): si la
//      reponse recitoit `req.body`, il seroit `undefined` pendant que la base
//      porte 0. (Lecon de Sprint 6: comparer une valeur que le client a lui-même
//      envoyee rend les deux mondes identiques et ne peut rien discriminer.)
//
// Fixture `request` seule: aucun navigateur lance, donc pas de --with-deps pour
// ce spec (scripts/verify-ci.mjs decide sur les fixtures reellement destructures).
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-supplier-price");

// Le jeton que CE test impose au serveur. La confrontation de l'en-tete
// X-Cookdrive-Instance est la seule preuve que la reponse vient de L'INSTANCE
// QUE CE TEST A LANCEE (un port demande a l'OS puis referme est un port que
// quelqu'un d'autre peut reprendre entre les deux).
const INSTANCE_TOKEN = `spri-${process.pid}-${Date.now()}`;

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

const FOURNISSEUR = { name: "Sonde Fourn P" };
const ARTICLE = {
  name: "Sonde Pomme de Terre", quantity: 10, minStock: 1, unit: "kg",
  status: "ok", category: "Legume", unit_price: 2.5,
};

async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  serveurFini = new Promise<void>((resolve) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        USER_DATA_PATH: DATA_DIR,
        COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.on("exit", () => resolve());
  });

  // L'ATTENTE VIENT AVANT LA SEMENCE. L'inverse produit un `TypeError: fetch
  // failed` sur un serveur pas encore a l'ecoute, qui se lit comme un defaut du
  // produit alors que c'est un defaut du harnais.
  let pret = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      const recu = res.headers.get("x-cookdrive-instance");
      if (res.ok && recu === INSTANCE_TOKEN) { pret = true; break; }
      if (res.ok && recu !== null) {
        throw new Error(
          `instance PERIMEE sur le port ${PORT}: l'en-tete dit « ${recu} », ce test ` +
            `attend « ${INSTANCE_TOKEN} ». Ce n'est pas le serveur de ce test.`,
        );
      }
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("instance PERIMEE")) throw new Error(msg);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!pret) throw new Error(`serveur pas pret en 60 s sur le port ${PORT}`);

  // La semence vit dans ce hook et NON dans un `test`: les variables de module
  // remplies par un test laissent les autres dependants de l'ORDRE d'execution,
  // donc incapables de tourner seuls. Or la regle du projet exige qu'une
  // mutation qui ne nie qu'UNE moitie du contrat soit detectable, ce qui
  // suppose que chaque test se juge seul (cf. verify:supplier-price).
  const f = await fetch(`${BASE}/api/suppliers`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(FOURNISSEUR),
  });
  if (!f.ok) throw new Error(`semence: fournisseur non cree (${f.status})`);
  SID = (await f.json())?.id;
  const a = await fetch(`${BASE}/api/inventory`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ARTICLE),
  });
  if (!a.ok) throw new Error(`semence: article non cree (${a.status})`);
  IID = (await a.json())?.id;
  if (typeof SID !== "string" || typeof IID !== "string") {
    throw new Error("semence: les routes de creation n'ont pas rendu leurs cles");
  }
}, 90_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const prix = async (request: any) => {
  const r = await request.get(`${BASE}/api/supplier-prices`);
  expect(r.status()).toBe(200);
  const brut = await r.json();
  return Array.isArray(brut) ? brut : [];
};

const comparaison = async (request: any, inventoryId: string) => {
  const r = await request.get(`${BASE}/api/supplier-prices/comparison`);
  expect(r.status()).toBe(200);
  const brut = await r.json();
  return (Array.isArray(brut) ? brut : []).find((g: any) => g.inventory_id === inventoryId) ?? null;
};

const poster = (request: any, data: any) =>
  request.post(`${BASE}/api/supplier-prices`, { data });

let SID = "";
let IID = "";

test("semence: la garde d'instance et les cles de semence sont en place", async ({ request }) => {
  // Ce test ne cree plus: il VERIFIE la semence d'beforeAll. Un 400
  // generalise (par exemple une route d'ecriture qui refuserait tout) doit etre
  // visible ici et non se cacher derriere des 400 attendus dans les tests
  // suivants, ou il ressemblerait a un contrat tenu.
  const r = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: 1, unit: "kg",
  });
  const corps = await r.json();
  expect(r.status(), "SEMENCE_UN_POST_LEGITIME_NE_DOIT_PAS_ETRE_REFUSE: "
    + JSON.stringify(corps?.refused ?? null)).toBe(200);
});

test("S1 le prix oublie devient un prix GRATUIT: refuse, et rien n'est ecrit",
     async ({ request }) => {
  // C'est le payload REEL d'une saisie rate: la UI fait parseFloat(champ) ->
  // NaN, et JSON.stringify(NaN) rend `null` dans le corps envoye. Cote serveur
  // Number(null) vaut 0: le prix absent etait donc un prix A ZERO (S1_PRIX_STOCK=0).
  const avant = await prix(request);
  const r = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: null, unit: "kg",
  });
  expect(r.status(), "S1_PRIX_ABSENT_REFUSE").toBe(400);
  const corps = await r.json();
  expect(corps?.refused, "S1_LE_REFUS_NOMME_LE_CHAMP").toContain("raw_unit_price");
  // un refus ne laisse AUCUNE trace: un 400 qui a quand même ecrit est pire
  // qu'un 200 honnete.
  expect(await prix(request), "S1_AUCUNE_TRACE_DERRIERE_LE_REFUS").toEqual(avant);

  // Une chaine "2,50" que parseFloat casse en 2 est refusee et non ARRONDIE:
  // un tarif fournisseur arrondi est un tarif faux qui a l'air saisi.
  const b = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: "2,50", unit: "kg",
  });
  expect(b.status(), "S1b_PRIX_TEXTE_REFUSE_ET_NON_ARRONDI").toBe(400);
  expect((await b.json())?.refused).toContain("raw_unit_price");
});

test("S2 un prix negatif est refuse, et ne peut plus etre ELU par la comparaison",
     async ({ request }) => {
  const avant = await prix(request);
  const r = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: -12, unit: "kg",
  });
  expect(r.status(), "S2_PRIX_NEGATIF_REFUSE").toBe(400);
  expect((await r.json())?.refused).toContain("raw_unit_price");
  expect(await prix(request), "S2_AUCUNE_TRACE").toEqual(avant);

  // La portee reelle du defaut: la comparaison designe un gagnant. Si un prix
  // negatif entrait, il gagnait a chaque fois (S6_ELUE={"p":-12}).
  const g = await comparaison(request, IID);
  for (const e of (g?.supplier_prices ?? [])) {
    expect(e.calculated_price_per_ref, "S2_UN_PRIX_NEGATIF_EST_EN_LISTE").not.toBeNull();
    expect(e.calculated_price_per_ref, "S2_PRIX_NEGATIF_EN_LISTE").toBeGreaterThanOrEqual(0);
  }
});

test("S3 une unite inconvertible rend un aveu (null) et non le facteur 1",
     async ({ request }) => {
  const VALEUR = 1000; // la meme valeur saisie, seule l'unite change
  const a = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price:VALEUR, unit: "kg",
  });
  expect(a.status(), "S3_UNITE_CONNUE_ACCEPTEE").toBe(200);
  const corpsA = await a.json();
  const ia = await prix(request);
  const ligneKg = ia.find((p: any) => p.id === corpsA.id);
  // Oracle ecrit a la main: 1000 par kg face a un article au kg = 1000 par kg.
  expect(ligneKg?.calculated_price_per_ref, "S3_ORACLE_KG").toBe(1000);

  const b = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price:VALEUR, unit: "kaz",
  });
  expect(b.status(), "S3_UNITE_INCONNUE_ACCEPTEE_COMME_NON_CONVERTIBLE").toBe(200);
  const corpsB = await b.json();
  const ib = await prix(request);
  const ligneKaz = ib.find((p: any) => p.id === corpsB.id);
  // Le defaut mesure: S3_CALC_INCONNU=1000, exactement comme "kg" (le
  // convertisseur renvoie 1 pour tout inconnu). Un null est un aveu; un 1000
  // etoit un mensonge qui se confrontait aux autres fournisseurs.
  expect(ligneKaz?.calculated_price_per_ref, "S3_INCONVERTIBLE_REND_NULL").toBeNull();

  const c = await poster(request, { supplier_id: SID, inventory_id: IID, raw_unit_price: 2, unit: "   " });
  expect(c.status(), "S3b_UNITE_BLANCHE_REFUSEE").toBe(400);
  expect((await c.json())?.refused).toContain("unit");
});

test("S3b une conversion DEFENDABLE est calculee (contre-controle de S3)",
     async ({ request }) => {
  // Sans ce test, S3 est satisfait par un correctif qui met TOUT au null (un
  // refus general n'est pas une conversion). L'oracle est ecrit a la main:
  // 2 par kg, article en g => 2 * (0.001 / 1) = 0.002 par g.
  const art = await request.post(`${BASE}/api/inventory`, {
    data: { ...ARTICLE, name: "Sonde Sucre En G", unit: "g" },
  });
  const iidG = (await art.json())?.id;
  expect(typeof iidG, "article en g non cree").toBe("string");
  const r = await poster(request, {
    supplier_id: SID, inventory_id: iidG, raw_unit_price: 2, unit: "kg",
  });
  expect(r.status(), "S3b_CONVERSION_FAMILLE_ACCEPTEE").toBe(200);
  const corps = await r.json();
  expect(corps?.prix_par_reference_defendable, "S3b_LE_DRAPEAU_DISE_LA_CONVERSION").toBe(true);
  expect(corps?.item?.calculated_price_per_ref, "S3b_ORACLE_CONVERSION").toBeCloseTo(0.002, 1e-12);
});

test("S4 une cle etrangere fantome est refusee AVANT l'ecriture",
     async ({ request }) => {
  const avant = await prix(request);
  const r = await poster(request, {
    supplier_id: "fournisseur-qui-n-existe-pas", inventory_id: IID,
    raw_unit_price: 7, unit: "kg",
  });
  expect(r.status(), "S4_CLE_ETRANGERE_FANTOME_REFUSEE").toBe(400);
  expect((await r.json())?.refused, "S4_LE_REFUS_NOMME_LA_CLE").toContain("supplier_id");
  expect(await prix(request), "S4_AUCUNE_LIGNE_FANTOME").toEqual(avant);

  const b = await poster(request, {
    supplier_id: SID, inventory_id: "article-qui-n-existe-pas",
    raw_unit_price: 7, unit: "kg",
  });
  expect(b.status(), "S4b_ARTICLE_FANTOME_REFUSE").toBe(400);
  expect((await b.json())?.refused).toContain("inventory_id");
});

test("S5 un UPDATE de zero ligne n'est pas une reussite", async ({ request }) => {
  const r = await poster(request, {
    id: "prix-qui-n-existe-pas", supplier_id: SID, inventory_id: IID,
    raw_unit_price: 3, unit: "kg",
  });
  expect(r.status(), "S5_UPDATE_ZERO_LIGNE_EST_UN_404").toBe(404);
  const liste = await prix(request);
  expect(liste.some((p: any) => p.id === "prix-qui-n-existe-pas"),
    "S5_AUCUNE_CREATION_SUR_ID_INCONNU").toBe(false);
});

test("S6 la comparaison n'elit jamais une ligne non comparable", async ({ request }) => {
  const art = await request.post(`${BASE}/api/inventory`, {
    data: { ...ARTICLE, name: "Sonde Comparateur", unit_price: 4 },
  });
  const iid = (await art.json())?.id;
  // une seule ligne, INCONVERTIBLE: son calculated est null.
  const r = await poster(request, {
    supplier_id: SID, inventory_id: iid, raw_unit_price: 9, unit: "paquets",
  });
  const corps6 = await r.json();
  expect(r.status(), "S6_POST_REFUSE: " + JSON.stringify(corps6?.refused ?? null)).toBe(200);
  const g = await comparaison(request, iid);
  expect(g, "le groupe de comparaison est absent").not.toBeNull();
  // Un null au sommet de la comparaison seroit une economie affichee sur du vide.
  expect(g.best_supplier_price, "S6_UNE_LIGNE_NON_CONVERTIBLE_NE_PEUT_ETRE_ELUE").toBeNull();
  expect(g.best_price, "S6_SANS_ELUE_LA_REFERENCE_FAIT_FOI").toBe(4);
  expect(g.savings_percent, "S6_PAS_D_ECONOMIE_INVENTEE").toBe(0);
});

test("S6b l'election choisit bien le MINIMUM parmi les lignes comparables",
     async ({ request }) => {
  // Contre-controle de S6/M4: sans lui, un correctif qui EXURBIT toutes les
  // lignes (ne jamais elire) satisferait S6 sans que le produit designe le
  // vrai gagnant. C'est exactemement la forme du defaut juge par la lecon des
  // budgets recopies: un check unidirectionel ne prouve que la moitie qu'il
  // arpente. Trois fouinisseurs, trois prix, et l'oracle est ecrit a la main.
  const art = await request.post(`${BASE}/api/inventory`, {
    data: { ...ARTICLE, name: "Sonde Huile Olive", unit_price: 20 },
  });
  const iid = (await art.json())?.id;
  expect(typeof iid, "article de comparaison non cree").toBe("string");
  const fouins = await request.get(`${BASE}/api/suppliers`);
  const premier = (await fouins.json())[0]?.id ?? SID;

  for (const p of [12, 3.5, 9]) {
    const r = await poster(request, {
      supplier_id: premier, inventory_id: iid, raw_unit_price: p, unit: "kg",
    });
    expect(r.status(), `S6b_POST_${p}_REFUSE`).toBe(200);
  }
  const g = await comparaison(request, iid);
  expect(g, "le groupe de comparaison est absent").not.toBeNull();
  expect(g.supplier_prices.length, "les trois lignes sont comparables").toBeGreaterThanOrEqual(3);
  expect(g.best_supplier_price?.calculated_price_per_ref,
    "S6b_LELU_EST_LE_PRIX_LE_PLUS_BAS").toBe(3.5);
  expect(g.best_price, "S6b_LE_NOMBRE_RENDU_EST_LELU").toBe(3.5);
  // 20 -> 3,5: l'economie est veritable, elle doit donc ETRE affichee (un
  // savings_percent fige a 0 serait le miroir du defaut des 100 % inventes).
  expect(g.savings_percent, "S6b_UNE_ECONOMIE_REELLE_EST_RERENDE").toBe(83);
});

test("S6c une ligne HERITEE a prix negatif ne peut etre elue (voie du garde)",
     async ({ request }) => {
  // POURQUOI CE TEST ET N'IMPORTE LEQUEL AUTRE NE L'ECRIT. La preuve negative
  // du meme spec a rendu « M7 ... rc=0 »: retirer `v >= 0` du predicat
  // d'election ne faisit rougir AUCUN test, parce que les TROIS portes
  // d'ecriture (POST unitaire, import, validation de facture) rejettent le
  // negatif AVANT la base. Ce n'etait pas un garde tort: c'etait une VOIE DE
  // COMMANDE QUI MANQUAIT A LA MESURE, et le garde est justement la pour les
  // BASES DEJA LIVREES (les lignes ecrites par l'ancien convertisseur a
  // facteur 1 et par l'ancienne voie sans borne). Un prediat que rien
  // n'atteint est un angle mort consigne au vert — le rendre jugeable ici, par
  // la voie d'un fichier de base de client, est la seule mesure possible.
  //
  // La semence est faite par sqlite3 DIRECTEMENT dans la base de L'INSTANCE DE
  // CE TEST (USER_DATA_PATH, WAL): c'est ce que le harnais aurait du faire pour
  // les index refuses « par mesure » et jugeables sur des donnees vides
  // (PHASES.md). Elle est prouvee par RELECTURE du compte de lignes, sinon le
  // verdict porterait sur rien.
  // L'API est CELLE DU DEPOT (src/db/init.ts:80): `open({ filename, driver:
  // sqlite3.Database })` — pas un `sqlite3.open()` qui n'existe pas.
  const dbFile = path.join(DATA_DIR, "agent_culinaire.db");
  const art = await request.post(`${BASE}/api/inventory`, {
    data: { ...ARTICLE, name: "Sonde Sucre Herite", unit_price: 8 },
  });
  const iid = (await art.json())?.id;

  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  await db.run("PRAGMA busy_timeout = 8000");
  const idHerite = "herit-negatif-" + Date.now();
  const res = await db.run(
    "INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, 1)",
    [idHerite, SID, iid, -12, "kg", -12],
  );
  await db.close();
  expect(res.changes, "la semence heritee est entree en base (sinon le test jugerait le VIDE)").toBe(1);

  // La ligne doit rester VISIBLE (le chef doit voir que le tarif existe) ...
  const liste = await prix(request);
  const heritee = liste.find((p: any) => p.id === idHerite);
  expect(heritee, "la ligne heritee est lisible par le GET de l'app").toBeTruthy();
  expect(heritee.calculated_price_per_ref, "son prix herite est bien NEGATIF en base").toBe(-12);

  // ... et ne peut PAS gagner. C'est la moitie que M7 ne pouvait pas atteindre.
  const g = await comparaison(request, iid);
  expect(g?.best_supplier_price?.id,
    "S6c_UN_PRIX_HERITE_NEGATIF_NE_PEUT_ETRE_ELUS").not.toBe(idHerite);
  const elue = g?.best_supplier_price;
  if (elue) {
    expect(Number(elue.calculated_price_per_ref),
      "S6c_TOUTE_LIGNE_ELUE_A_UN_PRIX_DEFENDABLE").toBeGreaterThanOrEqual(0);
  }
  expect(g?.best_price === null || Number(g?.best_price) >= 0,
    "S6c_AUCUN_NOMBRE_DE_DEVIS_NEGATIF_NE_SORT_DE_LA_COMPARAISON").toBe(true);
  expect(g?.savings_percent === 0 || (g?.savings_percent ?? 0) < 100,
    "S6c_PAS_DECONOMIE_INVENTEE_PAR_UN_CREDIT").toBe(true);

  // Retrait: la ligne ne doit pas empoisonner les checks suivants du spec.
  const d = await request.delete(`${BASE}/api/supplier-prices/${idHerite}`);
  expect(d.status(), "le retrait de la semence a reussi").toBe(200);
});

test("B le booleen ne se devine pas par truthiness", async ({ request }) => {
  // L'ancien code faisait `x ? 1 : 0`: la chaine "false" est VRAIE en JS, donc
  // un prix NON verifie (ce que rend un hidden de forme HTML) passoit pour
  // VERIFIE — et ce badge est ce sur quoi le chef decide de croire le tarif.
  const faux = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: 5, unit: "kg",
    is_verified_from_invoice: "false",
  });
  const corpsFaux = await faux.json();
  expect(faux.status(), "B_POST_FALSE_REFUSE: " + JSON.stringify(corpsFaux?.refused ?? null)).toBe(200);
  expect(corpsFaux?.item?.is_verified_from_invoice,
    "B_LA_CHAINE_FALSE_NE_VAUT_PLUS_VRAI").toBe(0);

  const vrai = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: 6, unit: "kg",
    is_verified_from_invoice: "true",
  });
  expect((await vrai.json())?.item?.is_verified_from_invoice,
    "B_LA_CHAINE_TRUE_VAUT_BIEN_1").toBe(1);

  const ordure = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: 6, unit: "kg",
    is_verified_from_invoice: "peut-etre",
  });
  expect(ordure.status(), "B_UN_BOOLEEN_INDECIFRABLE_EST_REFUSE").toBe(400);
  expect((await ordure.json())?.refused).toContain("is_verified_from_invoice");
});

test("R la reponse relit la BASE et ne recite pas le client", async ({ request }) => {
  const r = await poster(request, {
    supplier_id: SID, inventory_id: IID, raw_unit_price: 11, unit: "kg",
  });
  const corpsR = await r.json();
  expect(r.status(), "R_POST_REFUSE: " + JSON.stringify(corpsR?.refused ?? null)).toBe(200);
  const corps = corpsR;
  const liste = await prix(request);
  const relu = liste.find((p: any) => p.id === corps?.id);
  expect(relu, "la ligne relue est absente de la liste").not.toBeNull();

  // ⚠ Le contre-controle qui rend cette preuve non creuse (lecon de Sprint 6):
  // juger une relecture sur une valeur que le client a lui-même envoyee rend
  // les deux mondes IDENTIQUES (reciter 11 et relire 11 donnent 11). Ce qui
  // discrimine, c'est un champ que le CLIENT N'A PAS ENVOYE: reciter req.body
  // donnerait `undefined`, la base porte 0.
  expect(corps?.item?.is_verified_from_invoice,
    "R_LA_REPONSE_NE_RECITE_PAS_LE_CORPS_DE_LA_REQUETE").toBe(0);
  for (const c of ["supplier_id", "inventory_id", "raw_unit_price", "unit",
                   "calculated_price_per_ref", "valid_until", "is_verified_from_invoice"]) {
    expect(corps?.item?.[c], `R_CHAMPS_DIVERGENTS_${c}`).toEqual(relu[c]);
  }

  // Et le DELTA: un PUT legitime change bien la colonne jugeable.
  expect(relu.raw_unit_price, "R_DELTA_PRIX").toBe(11);
  expect(relu.calculated_price_per_ref, "R_DELTA_CONVERSION").toBe(11);
});
