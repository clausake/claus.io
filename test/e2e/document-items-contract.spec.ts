// Preuve du contrat des LIGNES A LA CREATION des deux portes d'ecriture de
// `document_items`:
//   POST /api/documents            (DocumentManager: facture saisie + import)
//   POST /api/purchasing/order     (Purchasking: bon de commande)
//
// POURQUOI CE SPEC EXISTE, ET POURQUOI LES HUIT AUTRES NE LE REMPLACENT PAS.
// Les specs `documents-validate-contract` et `supplier-*` jugent la COLONNE DE
// PRIX a la VALIDATION, c'est-a-dire EN AVAL de la creation. La porte d'entree,
// elle, n'avoit AUCUN test: aucune des 84 suites ne postait une ligne invalide.
// C'est exactement l'angle mort consigne au vert (« une porte ne prouve que la
// voie qu'elle arpente »): la carte des routes sans contrat (PHASES.md 8.6)
// designait cette porte-la depuis trois sprints.
//
// Verdicts MESURES par scripts/probe-document-items-voices.mjs AVANT le
// correctif (huit payloads, instance isolee, relecture EN BASE) :
//   A/B/C  quantity:"" ou "beaucoup"  -> 200, et la ligne est en base en
//          typeof='text' dans une colonne `REAL NOT NULL`. 3 lignes sur 7.
//          Un total additione sur ces lignes est un chiffre INVENTE.
//   D/E/F  quantity absente / items absent / non-tableau -> 500 muet.
//   G      inventory_id "pas-un-article-42" -> 200 + ligne ORPHELINEE.
//   H/H2   total_amount:"42,50" -> typeof='text'; "42.50" -> REAL.
// Apres le correctif, la MEMME sonde rend: 0 quantite en texte, 0 ligne
// orpheline, un total unique en REAL (verifie ci-dessous par K1, qui rejoue
// les payloads DE LA SONDE et non des payloads inventes).
//
// CE QUI EST REELLEMENT TROUVE EN ECRIWANT CE SPEC (et qui etait inconnu de la
// sonde): l'UI ecrasoit le vide AVANT que le serveur ne le voie.
// `DocumentManager` handleSubmit faisait
//   quantity: parseFloat((item.quantity || "").toString().replace(",", ".")) || 0
// Un bouton « Ajouter une ligne » sans rien saisir (handleAddItem initialise a
// `""`) partait donc en 0 — un 0 que la VALIDATION transformait en mouvement de
// stock. Le contrat de la porte SERVEUR etait satisfait par un client qui
// n'envoyait jamais la donnee fautive: juger la route sans juger SA VOIE D'UI
// aurais rendu un vert creux. K2/K2b jugent les DEUX formes, et le test
// d'obligation de la voie REELLE est `verify:document-items-voices` (il force
// le payload vide a ARRIVER vide).
//
// Fixture `request` seule: aucun navigateur lance.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-doc-items");
const INSTANCE_TOKEN = `docitems-${process.pid}-${Date.now()}`;

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

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
      // ⚠ Le jeton est DEDANS de l'objet `env`. Pose apres l'accolade
      // fermante c'est un champ d'options IGNORE par le fils: le serveur
      // retombe sur son propre randomUUID et toute la porte ROUGIT SUR SON
      // PROPRE FILS (piege consigne, verifie par octets et non au rendu).
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

  // L'attente VIENT AVANT TOUTE SEMENCE, et elle juge l'IDENTITE et non « le
  // port repond »: un petit-fils du run precedent porte le BON jeton et ferait
  // juger une instance perimee comme la sienne.
  let pret = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      const recu = res.headers.get("x-cookdrive-instance");
      if (res.ok && recu === INSTANCE_TOKEN) { pret = true; break; }
      if (res.ok && recu !== null) {
        throw new Error(`instance PERIMEE sur le port ${PORT}: l'en-tete dit ` +
          `« ${recu} », ce test attend « ${INSTANCE_TOKEN} ». Ce n'est pas le serveur de ce test.`);
      }
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("instance PERIMEE")) throw new Error(msg);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!pret) throw new Error(`serveur pas pret en 60 s sur le port ${PORT}`);
}, 90_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const poster = (request: any, chemin: string, data?: any) =>
  request.post(`${BASE}${chemin}`, { data });

// La relecture passe par la BASE DE L'INSTANCE DU TEST (l'API du depot,
// src/db/init.ts:80) et non par GET /api/documents/:id: cette route rend du
// HTML (le SPA), donc `res.json()` leve sur « <!doctype » et le verdict
// croit « relecture impossible » sans rien prouver (la 1re version de la
// sonde est tombee la — un PASS creux de plus).
async function lignesEnBase(id: string) {
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"),
    driver: sqlite3.Database,
  });
  try {
    return await db.all(
      `SELECT id, document_id, inventory_id, original_name,
              quantity, typeof(quantity) AS t_q,
              unit_price, typeof(unit_price) AS t_p,
              unit_price_brut, typeof(unit_price_brut) AS t_b,
              lot_number, dlc
         FROM document_items WHERE document_id = ? ORDER BY rowid`,
      [id],
    );
  } finally {
    await db.close();
  }
}

async function documentEnBase(id: string) {
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"),
    driver: sqlite3.Database,
  });
  try {
    return await db.get(
      `SELECT id, type, supplier, date, total_amount,
              typeof(total_amount) AS t_total, status
         FROM documents WHERE id = ?`,
      [id],
    );
  } finally {
    await db.close();
  }
}

// Les compteurs GLOBAUX, juges EN BASE: une ligne orpheline n'appartient a
// AUCUN document, donc aucune relecture par clef ne la verrait jamais — c'est
// precisement ce qui rend le defaut G invisible aux tests herites.
//
// ⚠ DEUX orphelins sont DISTINCTS et ne sont pas la meme faute:
//   - `document_id` qui ne pointe aucun document  -> FAUTE REELLE. Une ligne
//     que personne ne relit, jamais validee, jamais receptionnee (c'etait le
//     defaut « les lignes partent sur `id` au lieu de `docId` »).
//   - `inventory_id` qui ne pointe aucun article  -> deux lectures: soit une
//     creation qui a laissé passer une clef fantome (le defaut G, ce que ce
//     spec chasse), soit un article QUI A QUITTE l'inventaire APRES la
//     creation — un etat LEGITIME que le produit assume deja (`solde` de
//     suppliers.ts:349 compte `i.id IS NOT NULL`, et Purchasking affiche un
//     badge « hors inventaire »). Le juger sans le distinguer ferait rougir un
//     test pour une donnee heritee normale.
// Les DEUX sont juges; le second contre une liste EXPLICITE de clefs
// légitimement supprimees par ce spec. Une clef inconnue qui s'ajoute a la
// liste fait rougir le test: le garde ne devient pas creux sous le poids.
const clefsSupprimeesLegitimement = new Set<string>();

async function orphelines() {
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"),
    driver: sqlite3.Database,
  });
  try {
    const lignes = await db.all(
      `SELECT di.id, di.document_id, di.inventory_id, di.original_name,
              di.quantity, typeof(di.quantity) AS t_q, di.unit_price,
              (SELECT COUNT(*) FROM documents d WHERE d.id = di.document_id) AS a_doc,
              (SELECT COUNT(*) FROM inventory i WHERE i.id = di.inventory_id) AS a_art
         FROM document_items di`,
    );
    return lignes.filter((l: any) =>
      l.a_doc === 0 ||
      // article absent de l'inventaire ET cette suppression n'a pas ete
      // declaree par ce spec comme legitime -> c'est le defaut G.
      (l.a_art === 0 && l.inventory_id !== null
        && !clefsSupprimeesLegitimement.has(l.inventory_id)),
    );
  } finally {
    await db.close();
  }
}

async function quantitesEnTexte() {
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"),
    driver: sqlite3.Database,
  });
  try {
    return await db.all(
      `SELECT original_name, quantity, typeof(quantity) AS t
         FROM document_items
        WHERE typeof(quantity) NOT IN ('real','integer')`,
    );
  } finally {
    await db.close();
  }
}

// Un article FERT par test: les lignes s'accumulent dans la base de L'INSTANCE
// et un test qui depend du compte de lignes d'un autre devient dependant de
// l'ordre d'execution (piege consigne aux specs jumeaux).
const nouveauArticle = async (request: any, nom: string, prix = 10) => {
  const r = await poster(request, "/api/inventory", {
    name: nom, quantity: 5, minStock: 1, unit: "kg",
    status: "ok", category: "Epicerie", unit_price: prix,
  });
  expect(r.status(), `l'article ${nom} doit etre cree`).toBe(200);
  const iid = (await r.json())?.id;
  expect(typeof iid, "cle d'article non rendue").toBe("string");
  return iid as string;
};

const unFournisseur = async (request: any, nom: string) => {
  const r = await poster(request, "/api/suppliers", { name: nom });
  expect(r.status(), `le fournisseur ${nom} doit etre cree`).toBe(200);
  const sid = (await r.json())?.id;
  expect(typeof sid, "cle de fournisseur non rendue").toBe("string");
  return sid as string;
};

// `items` est `unknown` VOLONTAIREMENT: ce spec doit pouvoir poster un non-
// tableau (le payload F de la sonde), ce qui serait une faute de typage
// d'empecher de le construire.
const facture = (items: unknown, extra: any = {}) => ({
  type: "FACTURE", supplier: "Sonde Metro DocItems",
  date: "2026-09-12", total_amount: 10, items, ...extra,
});

const uneLigne = (iid: string, nom: string, qte: unknown, prix: unknown) => ({
  inventory_id: iid, original_name: nom, quantity: qte, unit_price: prix,
  lot_number: "LOT-1", dlc: "2026-12-01",
});

// ============================================================================
// K1 — les payloads DE LA SONDE, rejoues tels quels.
// ============================================================================
test("K1 les huit payloads de la sonde ont l'attendu CONTRACTUEL (et non le 200 muet)",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K1 Tomate");
  const cas: Array<[string, any, number, string?]> = [
    // (label, corps, status_http attendu, raison attendue quand 400)
    ["A lignes telles que handleAddItem les cree", facture([
      { inventory_id: iid, original_name: "T1", quantity: "", unit_price: "", lot_number: "", dlc: "" },
    ]), 400, "quantite_vide"],
    ["C quantite 'beaucoup'", facture([
      { inventory_id: iid, original_name: "X", quantity: "beaucoup", unit_price: 2 },
    ]), 400, "quantite_non_numerique"],
    ["D quantite absente", facture([
      { inventory_id: iid, original_name: "Y", unit_price: 2 },
    ]), 400, "quantite_absente"],
    ["E sans items", facture(undefined), 400],
    ["F items non-tableau", facture("tout"), 400],
    ["G inventory_id inconnu", facture([
      { inventory_id: "pas-un-article-42", original_name: "Z", quantity: 2, unit_price: 1 },
    ]), 400, "article_inexistant"],
  ];
  for (const [label, corps, attendu, raison] of cas) {
    const r = await poster(request, "/api/documents", corps);
    expect(r.status(), `K1_${label} -> ${attendu}`).toBe(attendu);
    if (attendu === 400) {
      const c = await r.json();
      expect(Array.isArray(c?.refused) && c.refused.length,
        `K1_${label}: le 400 NOMME un champ refuse`).toBeGreaterThanOrEqual(1);
      if (raison) {
        const rej = Array.isArray(c?.rejetees) ? c.rejetees : [];
        expect(rej.some((x: any) => String(x?.raison) === raison),
          `K1_${label}: la raison ${raison} est rendue`).toBe(true);
      }
    }
  }

  // B: le MELANGE. La ligne saine survit, la fautive est NOMMEE. Un 400
  // generalise ici serait une regle trop stricte: le chef perdrait sa facture
  // pour une ligne mal frappee (la lecon de l'ENUM du Sprint 6).
  const b = await poster(request, "/api/documents", facture([
    uneLigne(iid, "OK", 5, 3),
    { inventory_id: iid, original_name: "VIDE", quantity: "", unit_price: 3 },
  ]));
  expect(b.status(), "K1_B le melange est ACCEPTe avec une ligne ecartee").toBe(200);
  const cb = await b.json();
  expect(cb?.ecrites, "K1_B une ligne ecrite").toBe(1);
  expect(cb?.ignorees, "K1_B la ligne fautive est COMPTee").toBe(1);
  expect(String(cb?.rejetees?.[0]?.raison ?? ""), "K1_B la raison est quantite_vide")
    .toBe("quantite_vide");
  expect(cb?.rejetees?.[0]?.index, "K1_B la ligne est INDEXEE").toBe(1);
  expect(cb?.rejetees?.[0]?.nom, "K1_B la ligne est NOMMEE par le nom SAISI")
    .toBe("VIDE");
  const lb = await lignesEnBase(cb.id);
  expect(lb.length, "K1_B une seule ligne en base (la saine)").toBe(1);
  expect(lb[0].original_name, "K1_B c'est bien la ligne saine").toBe("OK");
  expect(lb[0].t_q, "K1_B la quantite ecrite est un REAL").toBe("real");

  // H: la saisie francaise du total, dans ses DEUX ecritures.
  for (const total of ["42,50", "42.50", 42.5]) {
    const h = await poster(request, "/api/documents", facture(
      [uneLigne(iid, "TT", 2, 1)], { total_amount: total },
    ));
    expect(h.status(), `K1_H total ${JSON.stringify(total)} accepte`).toBe(200);
    const cid = (await h.json()).id;
    const relu = await documentEnBase(cid);
    expect(relu?.t_total, `K1_H_${JSON.stringify(total)}: le total est un REAL en base`)
      .toBe("real");
    expect(Number(relu?.total_amount), `K1_H_${JSON.stringify(total)}: la VALEUR est 42,5`)
      .toBe(42.5);
  }

  // Et un total qui MELANGE les separateurs n'est pas devine: il est refuse.
  const melange = await poster(request, "/api/documents", facture(
    [uneLigne(iid, "TTM", 2, 1)], { total_amount: "1.234,56" },
  ));
  expect(melange.status(), "K1_H un total ambigu est refuse, non rabote").toBe(400);
  const cm = await melange.json();
  expect(cm?.refused?.includes("total_amount"),
    "K1_H le champ refuse est NOMME: total_amount").toBe(true);
});

// ============================================================================
// K2 — une quantite NON EXPLOITABLE n'entre pas, et le refus est NOMME.
// ============================================================================
test("K2 une quantite invalide ne devient ni du texte en base ni un 0", async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K2 Farine");
  const formes: Array<[unknown, string]> = [
    ["", "quantite_vide"],
    ["   ", "quantite_vide"],
    ["beaucoup", "quantite_non_numerique"],
    [-3, "quantite_invalide"],
    [1e12, "quantite_invalide"],
    [null, "quantite_non_serialisee"],
    [{}, "quantite_non_numerique"],
    [true, "quantite_non_numerique"],
  ];
  for (const [qte, raison] of formes) {
    const r = await poster(request, "/api/documents", facture([
      uneLigne(iid, `K2-${JSON.stringify(qte)}`, qte, 4),
    ]));
    expect(r.status(), `K2 quantite=${JSON.stringify(qte)} refusee`).toBe(400);
    const c = await r.json();
    expect(c?.rejetees?.[0]?.raison, `K2_${JSON.stringify(qte)} -> ${raison}`)
      .toBe(raison);
    // La correction n'est pas la meme selon la forme: « votre champ est vide »
    // ne se corrige pas comme « votre montant est negatif ». Les motifs sont
    // DONC distincts, et ce check est ce qui empeche un 400 generaliste de
    // passer pour un contrat.
    expect(String(c?.rejetees?.[0]?.raison), "K2 le motif porte le nom du champ")
      .toContain("quantite");
  }
  // ZERO ligne ecrite = rien n'est enregistre: ni document, ni ligne.
  const avant = await orphelines();
  expect(avant.length, "K2 aucune ligne orpheline n'a ete laissee").toBe(0);

  // CONTRE-CONTROLE: une quantite de 0 EXPRES (ligne d'avoir, produit offert)
  // reste ACCEPTee. Sans ce test, « refuser les quantites douteuses » est
  // satisfait par un correctif qui interdit aussi le 0 legitime.
  const zero = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Offert", 0, 0),
  ]));
  expect(zero.status(), "K2b la quantite 0 legitime reste acceptee").toBe(200);
  const lz = await lignesEnBase((await zero.json()).id);
  expect(Number(lz[0]?.quantity), "K2b le 0 est en base comme REAL 0").toBe(0);
  expect(lz[0]?.t_q, "K2b typeof=real").toBe("real");
});

// ============================================================================
// K3 — la clef d'article: une presence qui ne resout pas est refusee, une
//      absence reste une PROPOSITION libre (semantique propre a cette porte).
// ============================================================================
test("K3 clef d'article: inexistante refusee et nommee, absente acceptee", async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K3 Riz");

  const fausse = await poster(request, "/api/documents", facture([
    { inventory_id: "cle-qui-n-existe-pas-99", original_name: "K3", quantity: 2, unit_price: 1 },
  ]));
  expect(fausse.status(), "K3 une clef inexistante est refusee").toBe(400);
  const cf = await fausse.json();
  expect(cf?.rejetees?.[0]?.raison, "K3 la raison est NOMMEE").toBe("article_inexistant");
  // ⚠ Le nom rendu est la CLEF refusee et non `original_name`: c'est la
  // chaine que le chef peut retrouver dans SON payload. Le contrat est juge
  // par une donnee que le client N'A PAS ENCORE verifiee.
  expect(cf?.rejetees?.[0]?.nom, "K3 la clef refusee est RENDUE")
    .toBe("cle-qui-n-existe-pas-99");

  // La voie libre: le chef saisiit un PDF a la main et n'a pas encore
  // apparie la ligne. Son `original_name` porte la valeur economique et le
  // GET la rend par COALESCE(i.name, di.original_name).
  const libre = await poster(request, "/api/documents", facture([
    { inventory_id: "", original_name: "Huile de la cooperative", quantity: 6, unit_price: 2.5 },
  ]));
  expect(libre.status(), "K3b une ligne NON APPARIEE est acceptee (voie manuelle)").toBe(200);
  const lb = await lignesEnBase((await libre.json()).id);
  expect(lb.length, "K3b la ligne libre est en base").toBe(1);
  expect(lb[0].inventory_id, "K3b sans clef").toBeNull();
  expect(lb[0].original_name, "K3b le nom saisi est CONSERVE (c'est la valeur du papier)")
    .toBe("Huile de la cooperative");
  expect(Number(lb[0].quantity), "K3b la quantite est bien ecrite").toBe(6);

  // Et le GET de l'app la rend toujours lisible (COALESCE), sinon la « ligne
  // libre » est une ligne perdue pour le chef.
  const docs = await (await request.get(`${BASE}/api/documents`)).json();
  const vue = (Array.isArray(docs) ? docs : [])
    .flatMap((d: any) => d.items ?? [])
    .find((x: any) => x.original_name === "Huile de la cooperative");
  expect(vue?.inventory_name, "K3b le GET rend le nom saisi via COALESCE")
    .toBe("Huile de la cooperative");

  // Ni clef ni nom: rien a afficher, rien a apparier -> refuse et nomme.
  const vide = await poster(request, "/api/documents", facture([
    { inventory_id: "", original_name: "   ", quantity: 1, unit_price: 1 },
  ]));
  expect(vide.status(), "K3c une ligne sans designation est refusee").toBe(400);
  expect((await vide.json())?.rejetees?.[0]?.raison, "K3c raison: ligne_sans_designation")
    .toBe("ligne_sans_designation");

  // Contre-controle du lot: un article qui QUITTE l'inventaire entre-temps
  // (lignes HISTORIQUES) est juge contre la base, et non contre le payload.
  const transient = await nouveauArticle(request, "Sonde K3 Volatil");
  const ok = await poster(request, "/api/documents", facture([
    uneLigne(transient, "K3V", 1, 1),
  ]));
  expect(ok.status(), "K3d l'article existant passe").toBe(200);
  // La suppression est LEGITIME (elle juge le « juge CONTRE LA BASE »), mais
  // elle laisse une ligne dont l'article n'existe plus: un etat que le produit
  // assume deja (badge « hors inventaire »). Elle est DECLAREE ici, et une
  // clef qui apparaitrait SANS etre declaree fait rougir l'oracle G.
  clefsSupprimeesLegitimement.add(transient);
  await request.delete(`${BASE}/api/inventory/${transient}`);
  const apres = await poster(request, "/api/documents", facture([
    uneLigne(transient, "K3V2", 1, 1),
  ]));
  expect(apres.status(), "K3d juge CONTRE LA BASE: plus en inventaire = refuse")
    .toBe(400);
});

// ============================================================================
// K4 — un montant non defendable est NEUTRALISE, pas jete, pas mis a 0.
//      C'est le contrat consigne V2/V3, vu depuis la porte d'entree.
// ============================================================================
test("K4 un montant indefendable neutralise le TARIF et conserve la ligne", async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K4 Sucre", 30);
  const r = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Sucre K4", 5, "vingt virgule cinq"),
  ]));
  expect(r.status(), "K4 LA LIGNE N'EST PAS JETEE (le contrat V3)".replace("()", "()"))
    .toBe(200);
  const c = await r.json();
  expect(c?.ecrites, "K4 une ligne ecrite").toBe(1);
  expect(c?.ignorees, "K4 aucune ligne IGNOREE: elle est ecrite, sans tarif").toBe(0);

  const l = (await lignesEnBase(c.id))[0];
  // Le coeur du contrat: `unit_price` est NULL (jamais un texte dans une REAL,
  // jamais un 0 vole) et le BRUT survit dans la colonne de trace.
  expect(l.unit_price, "K4_LE_MONTANT_INDEFENDABLE_NE_DEVIENT_PAS_UN_ZERO").toBeNull();
  expect(l.t_p, "K4 pas de TEXT dans une colonne REAL").not.toBe("text");
  expect(l.unit_price_brut, "K4_LE_BRUT_RESTE_FIDELE_AU_PAPIER").toBe("vingt virgule cinq");
  expect(Number(l.quantity), "K4 la QUANTITE, elle, est conservee").toBe(5);
  expect(l.t_q, "K4 et elle est un REAL").toBe("real");

  // Et la validation qui suit NOMME toujours la ligne: sans la colonne de
  // trace, elle serait DEVENUE MUETTE (un NULL ordinaire ne dit rien).
  const val = await poster(request, `/api/documents/${c.id}/validate`);
  expect(val.status(), "K4 la validation reussit (le stock est le travail principal)")
    .toBe(200);
  const cv = await val.json();
  expect(Array.isArray(cv?.prix_non_exploitables) && cv.prix_non_exploitables.length,
    "K4_LA_LIGNE_SANS_TARIF_EST_NOMMEE_A_LA_VALIDATION").toBeGreaterThanOrEqual(1);
  expect(String(cv?.prix_non_exploitables?.[0]?.valeur ?? ""),
    "K4 la valeur RENDUE est le BRUT et non « null »")
    .toBe("vingt virgule cinq");

  // CONTRE-CONTROLES: un tarif LEGITIME entre (sinon « ne jamais ecrire »
  // satisferait tout), et un negatif n'est pas un tarif certifie.
  const propre = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Sucre propre", 5, 31.5),
  ]));
  expect(propre.status(), "K4b un montant legitime est accepte").toBe(200);
  const lp = (await lignesEnBase((await propre.json()).id))[0];
  expect(Number(lp.unit_price), "K4b le montant legitime est en base").toBe(31.5);
  expect(lp.unit_price_brut, "K4b rien a tracer pour une ligne saine").toBeNull();

  const virg = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Sucre virgule", 2, "2,5"),
  ]));
  expect(virg.status(), "K4c la virgule decimale est une ecriture legitime").toBe(200);
  const lv = (await lignesEnBase((await virg.json()).id))[0];
  expect(Number(lv.unit_price), "K4c 2,5 -> 2.5 ET non 0, et non du texte").toBe(2.5);
  expect(lv.t_p, "K4c typeof=real").toBe("real");

  const neg = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Sucre avoir", 5, -12),
  ]));
  expect(neg.status(), "K4d un montant negatif n'est pas un tarif").toBe(200);
  const ln = (await lignesEnBase((await neg.json()).id))[0];
  expect(ln.unit_price, "K4d PAS DE PRIX NEGATIF EN BASE (la mesure D1_PRIX_STOCK=-12)")
    .toBeNull();
  expect(String(ln.unit_price_brut), "K4d et le brut est trace").toBe("-12");
});

// ============================================================================
// K5 — le prix de REFERENCE de l'article ne peut pas etre efface par une
//      facture au tarif illisible (le piege du NULL silencieux de node-sqlite3).
// ============================================================================
test("K5 valider une facture sans tarif lisible n'EFFACE pas le prix de reference",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K5 Huile", 40);
  const avant = (await (await request.get(`${BASE}/api/inventory`)).json())
    .find((x: any) => x.id === iid);
  expect(Number(avant?.unit_price), "K5 ligne de base: le prix est 40").toBe(40);

  const c = await (await poster(request, "/api/documents", facture([
    uneLigne(iid, "Huile K5", 3, "sans prix lisible"),
  ]))).json();
  const val = await poster(request, `/api/documents/${c.id}/validate`);
  expect(val.status(), "K5 la validation reussit").toBe(200);

  const apres = (await (await request.get(`${BASE}/api/inventory`)).json())
    .find((x: any) => x.id === iid);
  // C'est LE test le plus cher de ce spec. Avant le correctif, /validate
  // passait `item.unit_price` (NULL) au binding d'une colonne NULLABLE:
  // node-sqlite3 ecrit NULL EN SILENCE (sonde probe-binding-undefined.mjs)
  // et le prix de reference de l'article — le nombre sur lequel la
  // comparaison retombe quand aucun fournisseur n'est elu (V5/V6) —
  // disparaissait sans aucune erreur.
  expect(Number(apres?.unit_price), "K5_LE_PRIX_DE_REFERENCE_SURVIT_A_UNE_LIGNE_SANS_TARIF")
    .toBe(40);
  // Le mouvement de stock, lui, a bien eu lieu: on n'a pas fige la route.
  expect(Number(apres?.quantity), "K5 le stock a bouge de la quantite validee")
    .toBe(Number(avant?.quantity) + 3);

  // Et un tarif DEFENDABLE, lui, est bien ECIT (contre-controle: sans lui,
  // « ne jamais ecrire » satisferait le test ci-dessus).
  const d = await (await poster(request, "/api/documents", facture([
    uneLigne(iid, "Huile tarif", 1, 18.75),
  ]))).json();
  await poster(request, `/api/documents/${d.id}/validate`);
  const apres2 = (await (await request.get(`${BASE}/api/inventory`)).json())
    .find((x: any) => x.id === iid);
  expect(Number(apres2?.unit_price), "K5b un tarif lisible est bien ECRIT").toBe(18.75);

  // Un lot / une DLC vides ne vident PAS ceux de l'article. ⚠ Le test ne doit
  // PAS etre satisfait par « l'article n'avait rien a perdre »: on SEME un lot
  // REEL dans l'article (semis direct, l'API du depot) AVANT de valider une
  // facture sans lot, et on exige qu'il soit toujours la. Un check qui ne peut
  // pas rougir n'est pas une mesure (la porte du NULL silencieux est
  // exactement ce qui efface une colonne sans erreur).
  const db = await open({
    filename: path.join(DATA_DIR, "agent_culinaire.db"), driver: sqlite3.Database,
  });
  try {
    await db.run("PRAGMA busy_timeout = 8000");
    const pose = await db.run(
      "UPDATE inventory SET lot_number = ?, dlc = ? WHERE id = ?",
      ["LOT-PROTEGE-9X", "2027-01-01", iid],
    );
    expect(pose.changes, "K5c la semence du lot entre en base").toBe(1);
    const relu = await db.get(
      "SELECT lot_number, dlc FROM inventory WHERE id = ?", [iid],
    );
    expect(relu?.lot_number, "K5c ligne de base: le lot est seme").toBe("LOT-PROTEGE-9X");

    const e = await (await poster(request, "/api/documents", facture([
      { inventory_id: iid, original_name: "Sans lot", quantity: 1, unit_price: 20 },
    ]))).json();
    const ve = await poster(request, `/api/documents/${e.id}/validate`);
    expect(ve.status(), "K5c la validation de la ligne sans lot reussit").toBe(200);

    const apresLot = await db.get(
      "SELECT lot_number, dlc, unit_price FROM inventory WHERE id = ?", [iid],
    );
    expect(apresLot?.lot_number, "K5c un lot ABSENT du document n'EFFACE pas celui de l'article")
      .toBe("LOT-PROTEGE-9X");
    expect(apresLot?.dlc, "K5c meme garde pour la DLC").toBe("2027-01-01");
    expect(Number(apresLot?.unit_price), "K5c et le tarif lisible, lui, est bien ecrit")
      .toBe(20);
  } finally {
    await db.close();
  }
});

// ============================================================================
// K6 — la SECONDE porte d'ecriture: le bon de commande (Purchasking).
// ============================================================================
test("K6 le bon de commande refuse une ligne invalide au lieu de la facturer a 0",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K6 Tomate", 2);
  const sid = await unFournisseur(request, "Sonde K6 Fournisseur");

  const avant = await (await request.get(`${BASE}/api/purchasing/orders`)).json();
  const nAvant = Array.isArray(avant) ? avant.length : 0;

  // Le defaut I3 sous une autre ecriture: `qty > 0 ? qty : 0` transformait
  // un TEXTE, un NEGATIF ou un `null` en une ligne de 0 unite et 0 €. Le bon
  // s'IMPRIME et part chez le fournisseur (handleCreateOrder appelle
  // doc.save() sur le resultat), donc le 0 fabrique est un bon faux.
  for (const qte of ["beaucoup", -5, "", null, "abc"]) {
    const r = await poster(request, "/api/purchasing/order", {
      supplier: "Sonde K6 Fournisseur",
      items: [{ inventory_id: iid, quantity: qte, unit_price: 2 }],
    });
    expect(r.status(), `K6 quantite ${JSON.stringify(qte)} -> 400 et non 0`).toBe(400);
    const c = await r.json();
    expect(Array.isArray(c?.rejetees) && c.rejetees.length,
      `K6_${JSON.stringify(qte)}: la ligne est NOMMEE`).toBeGreaterThanOrEqual(1);
    expect(c?.rejetees?.[0]?.raison, `K6_${JSON.stringify(qte)}: un motif distinct`)
      .toContain("quantite");
    // et un 400 qui refuse n'a rien ecrit: pas de bon fantome dans l'onglet.
    const apres = await (await request.get(`${BASE}/api/purchasing/orders`)).json();
    expect(Array.isArray(apres) ? apres.length : 0,
      `K6_${JSON.stringify(qte)}: aucun bon partiellement ecrit`).toBe(nAvant);
  }

  // Un bon dont une clef est ABSENTE est une faute ICI (et non une ligne
  // libre comme cote facture): sans clef, la reception la saute et le solde
  // de cloture la compte pour toujours comme RESTANTE.
  const sansCle = await poster(request, "/api/purchasing/order", {
    supplier: "Sonde K6 Fournisseur",
    items: [{ inventory_id: "", quantity: 5, unit_price: 2 }],
  });
  expect(sansCle.status(), "K6b une clef absente est une FAUTE pour un bon").toBe(400);
  expect((await sansCle.json())?.rejetees?.[0]?.raison, "K6b raison: article_non_apparie")
    .toBe("article_non_apparie");

  // Un montant indefendable est refuse ICI (le total s'IMPRIME), alors qu'il
  // est neutralise cote facture: la difference de semantique est assumee.
  const prixPourri = await poster(request, "/api/purchasing/order", {
    supplier: "Sonde K6 Fournisseur",
    items: [{ inventory_id: iid, quantity: 4, unit_price: "mille" }],
  });
  expect(prixPourri.status(), "K6c un montant illisible n'imprime pas un bon").toBe(400);
  expect((await prixPourri.json())?.rejetees?.[0]?.raison, "K6c raison: montant_...")
    .toContain("montant");

  // CONTRE-CONTROLE: le bon bien forme passe, son total est la somme EXACTE,
  // et son nom est le nom REEL de l'article (celui que la reception compte).
  const bon = await poster(request, "/api/purchasing/order", {
    supplier: "Sonde K6 Fournisseur",
    items: [{ inventory_id: iid, quantity: "10,5", unit_price: 2 }],
  });
  expect(bon.status(), "K6d le bon legitime passe (et la virgule est lisible)").toBe(200);
  const cb = await bon.json();
  expect(cb?.total_amount, "K6d total = 10,5 x 2 = 21 (et non 0)").toBe(21);
  expect(cb?.lignes_sans_tarif, "K6d aucune ligne sans tarif").toBe(0);
  expect(cb?.unknown_items ?? [], "K6d rien de rejete").toEqual([]);
  const lignes = await lignesEnBase(cb?.documentId);
  expect(lignes.length, "K6d une ligne en base").toBe(1);
  expect(Number(lignes[0].quantity), "K6d 10,5 est une quantite et non un 0").toBe(10.5);
  expect(lignes[0].t_q, "K6d typeof=real").toBe("real");
  expect(lignes[0].original_name, "K6d le nom ECIT est le nom REEL de l'article")
    .toBe("Sonde K6 Tomate");

  // Et le bon se RECEPTIONNE: la boucle d'achat reste fermee (le contrat juge
  // par purchasing-chain.spec.ts, revifie ici pour la porte nouvelle).
  const rec = await poster(request, `/api/purchasing/orders/${cb.documentId}/receive`,
    { received: [] });
  expect(rec.status(), "K6e le bon cree est receptionnable").toBe(200);
  const apresRec = (await (await request.get(`${BASE}/api/inventory`)).json())
    .find((x: any) => x.id === iid);
  expect(Number(apresRec?.quantity), "K6e le stock a recu la quantite du bon").toBe(5 + 10.5);
  expect(sid, "K6 le fournisseur de semence est la").toBeTruthy();
});

// ============================================================================
// K7 — la reponse de creation ne RECITE pas le client (le PASS creux historique).
// ============================================================================
test("K7 la clef rendue sert, les lignes sont relues, et rien n'est moitie ecrit",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde K7 Sel");

  // La voie de creation manuelle N'ENVOIE PAS de clef: l'ancien
  // `res.json({ id })` rendait `undefined`, et le /validate SUIVANT meurait
  // en 404 sur un document bel et bien cree (mesure D1_VALIDE_CODE=404).
  const c = await poster(request, "/api/documents", facture([
    uneLigne(iid, "Sel K7", 4, 3),
  ]));
  expect(c.status(), "K7 la creation reussit").toBe(200);
  const corps = await c.json();
  expect(typeof corps?.id, "K7 la clef rendue est une chaine").toBe("string");
  expect(corps?.document?.id, "K7 la ligne est RELUE des la reponse").toBe(corps.id);
  expect(corps?.document?.total_amount, "K7 le total relu est un nombre").toBe(10);
  expect(corps?.document?.status, "K7 le statut relu est PENDING").toBe("PENDING");
  expect(Array.isArray(corps?.items) && corps.items.length, "K7 les lignes sont rellees").toBe(1);
  expect(corps?.items?.[0]?.quantity_type, "K7 le type de colonne est RENDU (proof de foi)")
    .toBe("real");
  expect(corps?.items?.[0]?.original_name, "K7 et n'est pas une recitation du payload")
    .toBe("Sel K7");

  // Le contre-controle qui rend le check non creux: la clef rendue SERT.
  const val = await poster(request, `/api/documents/${corps.id}/validate`);
  expect(val.status(), "K7_LA_CLE_RENDUE_SERT_A_VALIDER").toBe(200);
  const docs = await (await request.get(`${BASE}/api/documents`)).json();
  const vue = (Array.isArray(docs) ? docs : []).find((d: any) => d.id === corps.id);
  expect(vue?.status, "K7 le document est VALIDATED en base").toBe("VALIDATED");

  // Le tri `if (id)` vs « la ligne EXISTE »: un `id` fourni pour un document
  // qui n'est pas en base doit CREER et non faire un UPDATE de 0 ligne.
  const avecCle = await poster(request, "/api/documents", {
    id: "sonde-k7-cree-sous-cette-clef",
    ...facture([uneLigne(iid, "Sel K7b", 2, 1)]),
  });
  expect(avecCle.status(), "K7b un id neuf cree le document").toBe(200);
  const relu = await documentEnBase("sonde-k7-cree-sous-cette-clef");
  // ⚠ Une assertion qui compare une valeur a elle-meme ne peut pas rougir: ce
  // n'est pas une mesure (la regle du « PASS qui ne peut pas devenir FAIL »).
  // La clef attendue est ecite en dur, ce qui juge le tri `if (id)` contre le
  // fait que la ligne existe REELLEMENT sous cette clef.
  expect(relu?.id, "K7b la clef demandee porte une ligne RELLE en base")
    .toBe("sonde-k7-cree-sous-cette-clef");
  expect(relu?.status, "K7b et il est PENDING (pas un UPDATE fantome)").toBe("PENDING");
  const v2 = await poster(request, "/api/documents/sonde-k7-cree-sous-cette-clef/validate");
  expect(v2.status(), "K7b et le /validate qui suit fonctionne").toBe(200);

  // RIEN N'EST MOITIE ECRIT: les deux 400 de ce spec n'ont laisse aucune
  // orpheline, et la moitie d'une transaction ne survit pas.
  const orph = await orphelines();
  expect(orph, "K7 aucune ligne orpheline en base (le defaut G est ferme)").toEqual([]);
  const tex = await quantitesEnTexte();
  expect(tex, "K7 aucune quantite en TEXTE dans une colonne REAL (defaut A/B/C)").toEqual([]);

  // La reponse d'un refus dit QUOI corriger (le 500 muet est une faute de
  // contrat, pas un accident): message + champs refuses.
  const r403 = await poster(request, "/api/documents", {
    type: "FACTURE", supplier: "S", date: "2026-01-01",
    total_amount: 10, items: "pas-un-tableau",
  });
  expect(r403.status(), "K7c un items non-tableau est un 400 et non un 500").toBe(400);
  const rc = await r403.json();
  expect(typeof rc?.message === "string" && rc.message.length > 0,
    "K7c le refus est MESSAGE").toBe(true);
  expect(rc?.refused, "K7c et le champ est NOMME").toEqual(expect.arrayContaining(["items"]));
});
