// Preuve du contrat ECRIT/LUE de la SECONDE voie d'ecriture des prix
// fournisseurs: POST /api/supplier-prices/import-confirm (+ son amont,
// import-analyze).
//
// POURQUOI CE SPEC ET PAS SEULEMENT LA SONDE: la sonde
// scripts/probe-supplier-import-contract.mjs a MESURE six defauts, mais une
// sonde ponctuelle n'est pas une porte: rien dans CI n'interdit desormais a un
// refactor de rouvrir le trou. Ce spec est la porte; sa preuve negative
// (scripts/negative-test-supplier-import.py, `npm run verify:supplier-import`)
// prouve qu'elle MORD.
//
// POURQUOI CETTE VOIE EST AUSSI CHERE QUE L'AUTRE: elle ecrit les TROIS MEMES
// COLONNES (raw_unit_price, unit, calculated_price_per_ref) et debouche sur le
// MEME liseur de decision — GET .../comparison designe le fournisseur au
// meilleur calculated_price_per_ref et FichesTechniques.tsx (~1791) chiffre un
// devis « optimise » avec ce prix elu. Un contrat tenu sur une seule des deux
// portes est un PASS A VELO (PHASES.md: « une porte ne prouve que la voie
// qu'elle arpente; une assertion absente = angle mort consigne au vert »).
//
// Les verdicts jugees ci-dessous ne sont pas des suppositions: chacun correspond
// a une mesure rendue AVANT le correctif (verbatim dans PHASES.md):
//   I1_CODE=200 I1_LIGNES_EN_BASE=0     200 sur cle etrangere fantome
//   I6_CODE=200 I6_LIGNES_EN_BASE=0     idem pour matched_inventory_id
//   I2_CODE=200 I2_PRIX_STOCK=-12       prix negatif ecrit par l'import
//   I3A_RAW_PRICE_RENDU=0               l'analyse fabriquait un 0 sur texte
//   I3B_ELUE={"p":0,"c":0,"u":"kg"} I3B_MEILLEUR_PRIX=0 I3B_ECONOMIE_PCT=100
//   I4_UNITE_STOCK="g" I4_PRIX_STOCK=1 I4_CALC=1000 I4_FACTEUR_X1000=1
//
// REGLES JUGES, ET LEUR ORACLE (jamais un re-call de la route jugee):
//   J1 un lot invalide (fournisseur absent) sort en 400 qui NOMME le champ, et
//      ne laisse AUCUNE trace en base.
//   J2 une cle etrangere fournisseur fantome est refusee AVANT l'ecriture: un
//      200 sur cette voie etoit un PASS creux (la ligne est avalee par le JOIN
//      du GET, le chef croit avoir importe).
//   J3 un matched_inventory_id fantome: idem, et une ligne FANTOME ne part pas
//      en base.
//   J4 un prix negatif est refuse par l'import comme par la saisie unitaire
//      (PARITE des deux portes — c'est le fond du defaut: la regle ne peut pas
//      dependre de la porte par laquelle la donnee entre).
//   J5 le VRAI flux de l'UI: analyse PUIS confirm, avec le match RENVOYE par la
//      route d'analyse recopie tel quel (Purchasing.tsx poste `matches:
//      importMatches` sans le retoucher). Un prix de CSV illisible ne devient
//      plus un 0: la sonde verifiait l'inverse (`I3A_RAW_PRICE_RENDU=0`). Et le
//      contre-controle qui rend cette preuve non creuse est que la ligne est
//      RELLEE absente de la liste + la comparaison n'elut RIEN (avant: elue, et
//      economie de 100 %).
//   J6 un prix legitime A VIRGULE ("3,50") est ACCEPTE et non rejete: c'est ce
//      que la PROPRE voie d'import de l'UI applique avant de parser
//      (Purchasing.tsx ~408, `replace(',', '.')`). Une regle trop stricte se
//      presente comme un 400 impeccable et casse le client — la mesurer dans les
//      DEUX directions est obligatoire, sinon J5 est satisfait par un refus
//      general (le piege deja rencontre pour S3/S3b).
//   J7 une conversion non defendable (unite crochee, article a l'unite vide)
//      rend un `null` ASSUME et la ligne ne peut PAS etre elue. L'ancien
//      `inv ? inv.unit : "kg"` + facteur 1 herite multipliait le prix par MILLE
//      et le faisit GAGNER (I4_FACTEUR_X1000=1, I4_ELUE non nul).
//   J8 le badge is_verified_from_invoice ne se FABRIQUE pas par l'import: un
//      payload qui le porte reste a 0 en base (le chef ne peut pas authentifier
//      par le chemin le moins cher une donnee qu'il n'a pas verifiee sur facture).
//   J9 zero ligne exploitable n'est PAS une reussite: 400 + les lignes ignorees
//      NOMMEES (index + raison). Un 200 muet sur un import vide etait la forme
//      la plus tranquille du PASS creux pour le bouton du chef.
//
// Fixture `request` seule: aucun navigateur lance, donc pas de --with-deps pour
// ce spec (scripts/verify-ci.mjs decide sur les fixtures reellement destructures).
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-supplier-import");

// Le jeton que CE test impose au serveur: seule preuve que la reponse vient de
// L'INSTANCE QUE CE TEST A LANCEE (piege consigne: un port demande a l'OS puis
// referme est un port qu'un voisin peut reprendre).
const INSTANCE_TOKEN = `spri-${process.pid}-${Date.now()}`;

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

// L'echelle est figee a 1000 pour le KILLOGRAMME: c'est ce qui rend J7 lisible
// (1 pour "g" face a un article sans unite doit rendre null, et non 1000).
const ARTICLE_KG = {
  name: "Sonde Sel Fin Import", quantity: 10, minStock: 1, unit: "kg",
  status: "ok", category: "Epicerie", unit_price: 1000,
};
const ARTICLE_SANS_UNITE = {
  name: "Sonde Sel Sans Unite", quantity: 10, minStock: 1, unit: "",
  status: "ok", category: "Epicerie", unit_price: 1000,
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

let SID = "";
let IID = "";
let IIDV = "";

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

  // L'ATTENTE VIENT AVANT LA SEMENCE: l'inverse produit un `TypeError: fetch
  // failed` sur un serveur pas encore a l'ecoute, lu comme un defaut du produit.
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
            `attend « ${INSTANCE_TOKEN } ». Ce n'est pas le serveur de ce test.`,
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
  // remplies par un test laissent les autres dependants de l'ordre d'execution,
  // donc incapables de tourner seuls.
  const f = await fetch(`${BASE}/api/suppliers`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sonde Import P" }),
  });
  if (!f.ok) throw new Error(`semence: fournisseur non cree (${f.status})`);
  SID = (await f.json())?.id;
  const a = await fetch(`${BASE}/api/inventory`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ARTICLE_KG),
  });
  if (!a.ok) throw new Error(`semence: article kg non cree (${a.status})`);
  IID = (await a.json())?.id;
  // ⚠ « UN ARTICLE DONT L'UNITE EST VIDE EN BASE » est une DONNEE HERITEE, et
  // non une saisie de l'ecran: le contrat de POST /api/inventory (Sprint 8.2)
  // REFUSE `unit: ""` (un texte blanc est refuse, et l'UI n'envoie jamais
  // celte-la). La voie legitime pour mettre cette forme en base est donc le
  // SEMIS DIRECT, comme pour S6c dans supplier-price-contract.spec.ts: la
  // route cree l'article proprement, puis une ecriture de bas-niveau lui met
  // l'unite vide. La semence est PROUVEE par relecture (le contrat de la porte
  // du dessous la juge), sinon le verdict porterait sur du vide — le piege des
  // index « refuses par mesure » sur des scans vides.
  // L'API est CELLE DU DEPOT (src/db/init.ts:80): `open({ filename, driver:
  // sqlite3.Database })`, pas un `sqlite3.open()` invente.
  const v = await fetch(`${BASE}/api/inventory`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...ARTICLE_SANS_UNITE, unit: "kg" }),
  });
  if (!v.ok) throw new Error(`semence: article (futures sans unite) non cree (${v.status})`);
  IIDV = (await v.json())?.id;
  {
    const dbFichier = path.join(DATA_DIR, "agent_culinaire.db");
    const dbLocal = await open({ filename: dbFichier, driver: sqlite3.Database });
    await dbLocal.run("PRAGMA busy_timeout = 8000");
    const pose = await dbLocal.run("UPDATE inventory SET unit = '' WHERE id = ?", [IIDV]);
    await dbLocal.close();
    if (pose.changes !== 1) {
      throw new Error(`semence: l'unite vide n'a pas pu etre posee en base (changes=${pose.changes})`);
    }
  }
  if ([SID, IID, IIDV].some((x) => typeof x !== "string")) {
    throw new Error("semence: les routes de creation n'ont pas rendu leurs cles");
  }
  // L'unite REELLEMENT en base est jugeable ici et non supposee: NOT NULL laisse
  // passer la chaine VIDE, et c'est exactement ce que l'ancien defaut masquait.
  const relue = await (await fetch(`${BASE}/api/inventory`)).json();
  const ligneV = (relue as any[]).find((x) => x.id === IIDV);
  if (!ligneV || ligneV.unit !== "") {
    throw new Error(`semence: l'article sans unite n'a pas d'unite VIDE en base (${JSON.stringify(ligneV?.unit)})`);
  }
  // et la quantite de ce meme article est bien un NOMBRE (et non un texte herite
  // d'un avant-contrat qui n'en decidait pas): sinon J7 jugerait une autre faute.
  if (typeof ligneV?.quantity !== "number") {
    throw new Error(`semence: la quantite de l'article herite n'est pas un nombre (${JSON.stringify(ligneV?.quantity)})`);
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

const analyser = (request: any, items: any[]) =>
  request.post(`${BASE}/api/supplier-prices/import-analyze`, {
    data: { supplier_id: SID, items },
  });

// Le match tel que l'UI le renvoie: Purchasing.tsx poste `matches: importMatches`
// sans le retoucher. Construire un payload « propre » a la main jugerait un
// chemin que le produit n'emprunte jamais.
const posterImport = (request: any, matches: any[], supplierId: string = SID) =>
  request.post(`${BASE}/api/supplier-prices/import-confirm`, {
    data: { supplier_id: supplierId, matches },
  });

const brutMatch = (rawName: string, rawPrice: unknown, rawUnit: string, iid: string | null) => ({
  raw_name: rawName, raw_price: rawPrice, raw_unit: rawUnit,
  matched_inventory_id: iid, matched_inventory_name: rawName, confidence: 0.9,
});

test("semence: la garde d'instance est en place et un import legitime passe",
     async ({ request }) => {
  // Un 400 generalise (une route qui refuserait TOUT) doit etre visible ici et
  // non se cacher derriere les 400 attendus des tests suivants, ou il
  // ressemblerait a un contrat tenu.
  const r = await posterImport(request, [brutMatch(ARTICLE_KG.name, 4, "kg", IID)]);
  const corps = await r.json();
  expect(r.status(), "SEMENCE_UN_IMPORT_LEGITIME_NE_DOIT_PAS_ETRE_REFUSE: "
    + JSON.stringify(corps?.message ?? null)).toBe(200);
  expect(corps?.importees, "SEMENCE_LE_COMPTE_RENDU_COMPTE LES LIGNES ECITES").toBe(1);
});

test("J1/J2 un fournisseur absent ou fantome est refuse AVANT l'ecriture, sans trace",
     async ({ request }) => {
  const avant = await prix(request);

  const vide = await posterImport(request, [brutMatch("x", 5, "kg", IID)], "");
  expect(vide.status(), "J1_FOURNISSEUR_ABSENT_REFUSE").toBe(400);
  expect((await vide.json())?.refused, "J1_LE_REFUS_NOMME_LE_CHAMP").toContain("supplier_id");

  const fantome = await posterImport(request, [brutMatch(ARTICLE_KG.name, 5, "kg", IID)],
                                      "fournisseur-qui-n-existe-pas");
  expect(fantome.status(), "J2_CLE_ETRANGERE_FANTOME_REFUSEE").toBe(400);
  expect((await fantome.json())?.refused, "J2_LE_REFUS_NOMME_LA_CLE").toContain("supplier_id");

  // Un refus qui ecrit quand même est pire qu'un 200 honnete.
  expect(await prix(request), "J_AUCUNE_TRACE_DERRIERE_UN_REFUS").toEqual(avant);
});

test("J3 un matched_inventory_id fantome ne part pas en base", async ({ request }) => {
  const avant = await prix(request);
  const r = await posterImport(request, [brutMatch("Sonde Fantome", 9, "kg", "article-qui-n-existe-pas")]);
  // La ligne est la seule du lot: zero ligne exploitable => 400 (J9), et surtout
  // AUCUNE ligne fantome en base.
  expect(r.status(), "J3_LIGNE_FANTOME_NON_ECRITE").toBe(400);
  const apres = await prix(request);
  expect(apres.length, "J3_AUCUNE_LIGNE_FANTOME_EN_BASE").toBe(avant.length);
  expect(apres.some((p: any) => Number(p.raw_unit_price) === 9),
    "J3_PRIX_DE_LA_LIGNE_FANTOME_ABSENT").toBe(false);
});

test("J4 un prix negatif est refuse par l'import (parite avec la voie unitaire)",
     async ({ request }) => {
  const avant = await prix(request);
  const r = await posterImport(request, [brutMatch(ARTICLE_KG.name, -12, "kg", IID)]);
  expect(r.status(), "J4_PRIX_NEGATIF_REFUSE_PAR_IMPORT").toBe(400);
  expect(await prix(request), "J4_AUCUNE_TRACE").toEqual(avant);

  // Et la voie unitaire juge la MEME regle: la parite est la moitie jugeable de
  // l'assertion (une regle qui depend de la porte d'entree n'est pas une regle).
  const u = await request.post(`${BASE}/api/supplier-prices`, {
    data: { supplier_id: SID, inventory_id: IID, raw_unit_price: -12, unit: "kg" },
  });
  expect(u.status(), "J4_PARITE_LA_MEME_REGLE_SUR_LA_VOIE_UNITAIRE").toBe(400);
});

test("J5 le vrai flux UI (analyse puis confirm) ne fabrique plus de prix a 0",
     async ({ request }) => {
  const avant = await prix(request);
  // `Number(itm.raw_price) || 0` rendoit 0 sur un texte: la sonde avait mesure
  // I3A_RAW_PRICE_RENDU=0 et, l'UI recopiant le match sans le retoucher,
  // I3B_ELUE={"p":0,"c":0,"u":"kg"} I3B_MEILLEUR_PRIX=0 I3B_ECONOMIE_PCT=100.
  const an = await analyser(request, [
    { raw_name: ARTICLE_KG.name, raw_price: "trois virgule cinq", raw_unit: "kg" },
  ]);
  expect(an.status(), "J5_ANALYSE_DOIT_REPONDER").toBe(200);
  const corpsA = await an.json();
  const m = corpsA?.matches?.[0];
  expect(m, "J5_LA_LIGNE_RESTE_VISIBLE_POUR_LE_CHEF").toBeTruthy();
  expect(m?.raw_price, "J5_UN_TEXTE_NE_DEVIENT_PLUS_UN_PRIX_A_ZERO").toBeNull();
  expect(m?.prix_exploitable, "J5_LE_DRAPEAU_DIT_QUE_LA_LIGNE_N_EST_PAS_COCHABLE").toBe(false);

  // l'UI poste CE match (pas un payload invente par le test)
  const c = await posterImport(request, [m]);
  expect(c.status(), "J5_CONFIRM_REFUSE_LA_LIGNE_SANS_PRIX").toBe(400);
  expect(await prix(request), "J5_AUCUNE_TRACE_DU_PRIX_FABRIQUE").toEqual(avant);
  const g = await comparaison(request, IID);
  const elue = g?.best_supplier_price;
  expect(elue && Number(elue.raw_unit_price) === 0,
    "J5_UN_PRIX_FABRIQUE_NE_PEUT_PLUS_ETRE_ELUE_MEILLEUR_FOURNISSEUR").toBe(false);
});

test("J6 une virgule decimale est ACCEPTee (contre-controle de J5)", async ({ request }) => {
  // Sans ce test, J5 est satisfait par un correctif qui refuse TOUT ce qui est
  // texte. Or "3,50" est ce que la PROPRE voie d'import de l'UI normalise avant
  // de parser (Purchasing.tsx ~408): le refuser jetterait le poste de travail du
  // cuisinier avec un 400 impeccable. Une regle se mesure dans ses DEUX voies.
  const an = await analyser(request, [
    { raw_name: ARTICLE_KG.name, raw_price: "3,50", raw_unit: "kg" },
  ]);
  const m = (await an.json())?.matches?.[0];
  expect(m?.raw_price, "J6_LA_VIRGULE_DECIMALE_EST_ACCEPTEE").toBe(3.5);
  expect(m?.prix_exploitable, "J6_LA_LIGNE_EST_COCHABLE").toBe(true);
  const c = await posterImport(request, [m]);
  expect(c.status(), "J6_IMPORT_D_UN_PRIX_A_VIRGULE_REUSSI").toBe(200);
  const relu = (await prix(request)).find((p: any) => Number(p.raw_unit_price) === 3.5);
  expect(relu, "J6_LA_LIGNE_EST_EN_BASE").toBeTruthy();
  expect(relu?.calculated_price_per_ref, "J6_ORACLE_PRIX_PAR_REFERENCE").toBe(3.5);
});

test("J7 une conversion non defendable rend un aveu (null) et ne peut etre elue",
     async ({ request }) => {
  const avant = await prix(request);
  // L'article a l'unite VIDE: `inv ? inv.unit : "kg"` ne couvrait que l'absence
  // de LIGNE. Le convertisseur, qui rend 1 pour tout inconnu, multipliait le
  // prix par MILLE (I4_CALC=1000 pour un vrai prix au gramme de 0,001) et la
  // comparaison le DESIGNAIT gagnant (I4_ELUE non nul).
  const r = await posterImport(request, [brutMatch(ARTICLE_SANS_UNITE.name, 1, "g", IIDV)]);
  expect(r.status(), "J7_LE_IMPORT_REUSSI_NE_PRETEND_PLUS_UN_CONVERTISSEMENT").toBe(200);
  const apres = await prix(request);
  expect(apres.length, "J7_LA_LIGNE_EST_ECITE").toBe(avant.length + 1);
  const ligne = apres[apres.length - 1];
  expect(ligne?.raw_unit_price, "J7_LE_PRIX_BRUT_EST_CONSERVE").toBe(1);
  // Le null est un AVEU lisible par l'ecran (« non comparable »), pas un 1000
  // invente qui se confronte aux autres fournisseurs.
  expect(ligne?.calculated_price_per_ref, "J7_INCONVERTIBLE_REND_NULL_ET_NON_UN_FACTEUR_1").toBeNull();
  const g = await comparaison(request, IIDV);
  expect(g?.best_supplier_price, "J7_UNE_LIGNE_NON_COMPARABLE_NE_PEUT_ETRE_ELUE").toBeNull();
  // Et le devis du chef reste sur la reference de l'article, sans economie inventee.
  expect(g?.best_price, "J7_SANS_ELUE_LA_REFERENCE_FAIT_FOI").toBe(ARTICLE_SANS_UNITE.unit_price);
  expect(g?.savings_percent, "J7_PAS_D_ECONOMIE_INVENTEE").toBe(0);
});

test("J8 le badge de verification sur facture ne se fabrique pas par l'import",
     async ({ request }) => {
  // L'import force 0; le payload du client peut porter `true` (une UI tierce,
  // un import ratique): ce badge est ce sur quoi le chef decide de croire un
  // tarif releve sur facture, il ne peut pas s'acheter par le chemin le moins
  // cher. Le sens est CONSERVATEUR (retirer la confiance), pas fabricateur.
  const r = await posterImport(request, [
    Object.assign(brutMatch(ARTICLE_KG.name, 812.5, "kg", IID),
                  { is_verified_from_invoice: true, valid_until: "2099-01-01" }),
  ]);
  expect(r.status(), "J8_IMPORT_AVEC_BADGE_PORTE").toBe(200);
  const relu = (await prix(request)).find((p: any) => Number(p.raw_unit_price) === 812.5);
  expect(relu, "J8_LA_LIGNE_EST_EN_BASE").toBeTruthy();
  expect(relu?.is_verified_from_invoice, "J8_UN_IMPORT_NE_VERIFIE_PAS_UNE_FACTURE").toBe(0);
});

test("J9 zero ligne exploitable n'est pas une reussite et le refus est NOMME",
     async ({ request }) => {
  const avant = await prix(request);
  // Melange: une ligne bonne et trois mauvaises, jugees ENSEMBLE — le defaut
  // I1/I6 etait un 200 « reussi » qui n'ecrivait RIEN.
  const r = await posterImport(request, [
    brutMatch("Sonde A", -1, "kg", IID),                 // prix negatif
    brutMatch("Sonde B", "gratuit", "kg", IID),           // texte
    brutMatch("Sonde C", 5, "   ", IID),                 // unite blanche
    brutMatch("Sonde D", 7, "kg", null),                  // non appariee
  ]);
  expect(r.status(), "J9_ZERO_LIGNE_EXPLOITABLE_N_EST_PAS_UN_SUCCES").toBe(400);
  const corps = await r.json();
  expect(corps?.refused, "J9_LE_REFUS_NOMME_LE_LOT").toContain("matches");
  // Les lignes ignorees sont NOMMEES avec leur raison: un 400 muet fait perdre
  // la saisie du cuisinier sans qu'il sache quoi corriger.
  const rejetees = corps?.rejetees ?? [];
  expect(rejetees.length, "J9_CHAQUE_LIGNE_IGNOREE_EST_COMPTEE").toBe(4);
  const raisons = rejetees.map((x: any) => x.raison).sort();
  expect(raisons, "J9_LES_RAISONS_SONT_NOMMEES_ET_INDEXEES").toEqual(
    ["article_non_apparie", "prix_invalide", "prix_non_numerique", "unite_absente"].sort());
  expect(rejetees.every((x: any) => typeof x.index === "number"),
    "J9_L_INDEX_DE_LA_LIGNE_EST_RENDU").toBe(true);
  expect(await prix(request), "J9_AUCUNE_TRACE_DERRIERE_LE_REFUS").toEqual(avant);

  // et l'import PARTIEL est compte honnetement (le 200 d'avant ne disait rien)
  const p = await posterImport(request, [
    brutMatch(ARTICLE_KG.name, 250, "kg", IID),
    brutMatch(ARTICLE_KG.name, -3, "kg", IID),
  ]);
  expect(p.status(), "J9_UN_IMPORT_PARTIEL_REUSSI").toBe(200);
  const corpsP = await p.json();
  expect(corpsP?.importees, "J9_LES_LIGNES_ECITES_SONT_COMPTEES_PAR_LE_SQL").toBe(1);
  expect(corpsP?.ignorees, "J9 LES_LIGNES_IGNOREES_SONT_COMPTEES").toBe(1);
});
