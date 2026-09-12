// Preuve du contrat de la TROISIEME voie d'ecriture des prix fournisseurs: la
// VALIDATION D'UNE FACTURE (POST /api/documents puis /api/documents/:id/validate).
//
// POURQUOI CE SPEC EXISTE, ET POURQUOI LES DEUX AUTRES NE LE REMPLACENT PAS.
// src/routes/supplierprices.ts:199-215 (avant correctif) ecrivoit supplier_prices
// avec `Number(item.unit_price)` SANS AUCUN CONTROLE et forcait
// `is_verified_from_invoice = 1`. La preuve negative du spec unitaire l'a
// demontre en creux: la mutation M7 (retirer `v >= 0` du predicat d'election) ne
// faisit ROUGIR AUCUN test, parce que les deux portes connues rejettent le
// negatif avant la base. Ce n'etait pas un garde tort: c'etait une VOIE DE
// COMMANDE ABSENTE DE LA MESURE — un angle mort consigne au vert (PHASES.md:
// « une porte ne prouve que la voie qu'elle arpente »; « exiger TOUTES les voies
// de commande verifiees »). Les TROIS portes sont desor mais jugees:
//   POST /api/supplier-prices                -> supplier-price-contract.spec.ts
//   POST /api/supplier-prices/import-confirm -> supplier-import-contract.spec.ts
//   POST /api/documents/:id/validate         -> CE SPEC
//
// Verdicts MESURES par scripts/probe-documents-validate-contract.mjs AVANT le
// correctif (aucun n'est suppose ici):
//   D1_VALIDE_CODE=200 D1_PRIX_STOCK=-12 D1_BADGE_VERIFIE=1
//     -> un MONTANT NEGATIF partait en base CERTIFIE « releve sur facture ». La
//        forme la plus chere du defaut: ce badge est exactement ce sur quoi le
//        chef DECIDE de croire un tarif, et la comparaison designe le gagnant sur
//        le nombre qui l'accompagne (D1_MEILLEUR_PRIX=-12 mesure).
//   D3_VALIDE_CODE=500
//     -> un montant NON NUMERIQUE faisit MEURIR toute la validation (node-sqlite3
//        JETTE sur un binding NaN): le document restait PENDING, le stock non
//        majouré, et l'operateur voyait « Validation failed » sans savoir quelle
//        ligne corriger. Un 500 muet sur une donnee invalide est une faute de
//        contrat, pas un accident.
//   D1_DOC_CODE=200 avec `id: undefined` (l'ancien `res.json({ id })` recitoit la
//        requete) -> l'appelant qui se fiait a la reponse obtenoit un 404 sur le
//        /validate SUIVANT, sur un document qui venait d'etre cree.
//
// Les regles jugees, et leur ORACLE (jamais un re-call de la route jugee):
//   V1 la reponse de creation rend la cle REELLEMENT ECITE et la ligne relue, pas
//      le corps de la requete; le /validate qui suit fonctionne avec cette cle.
//   V2 un montant negatif de facture N'ENTRE PAS en tarif fournisseur et ne
//      reçoit PAS le badge de verification; la validation du document, elle,
//      reussit (le mouvement de stock est le travail principal de cette route).
//   V3 un montant non numerique ne fait plus meuurir la validation: 200, la
//      ligne est NOMMEE dans le compte-rendu, et le document est VALIDATED.
//   V4 un montant LEGITIME entre bien en tarif, avec le badge a 1 (contre-
//      controle de V2/V3: sans lui, « ne jamais ecrire » satisferait les deux).
//   V5 aucune ligne de tarif indefendable ne sort elue par la comparaison, et
//      aucun nombre de devis NEGATIF n'en sort (le garde de repli, qui est une
//      moitie de contrat distincte de l'election).
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
const DATA_DIR = path.join(process.cwd(), "test", "tmp-docs-validate");
const INSTANCE_TOKEN = `dval-${process.pid}-${Date.now()}`;

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

  // L'ATTENTE VIENT AVANT TOUTE SEMENCE (piege consigne: un fetch trop tot rend
  // un TypeError avale, puis un faux « serveur pas pret »).
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

const prixFournisseur = async (request: any, iid: string) => {
  const r = await request.get(`${BASE}/api/supplier-prices`);
  expect(r.status()).toBe(200);
  const liste = await r.json();
  return (Array.isArray(liste) ? liste : []).filter((p: any) => p.inventory_id === iid);
};

const groupe = async (request: any, iid: string) => {
  const r = await request.get(`${BASE}/api/supplier-prices/comparison`);
  expect(r.status()).toBe(200);
  const liste = await r.json();
  return (Array.isArray(liste) ? liste : []).find((g: any) => g.inventory_id === iid) ?? null;
};

// Un article FERT par test: les lignes de tarif s'accumulent dans la base de
// L'INSTANCE et un test qui depend du compte de lignes d'un autre devient
// dependant de l'ordre d'execution (piege consigne dans le spec jumeau).
const nouveauArticle = async (request: any, nom: string, prix: number) => {
  const r = await poster(request, "/api/inventory", {
    name: nom, quantity: 5, minStock: 1, unit: "kg",
    status: "ok", category: "Epicerie", unit_price: prix,
  });
  expect(r.status(), `l'article ${nom} doit etre cree`).toBe(200);
  const iid = (await r.json())?.id;
  expect(typeof iid, "cle d'article non rendue").toBe("string");
  return iid as string;
};

// Ce spec n'a PAS de cle de fournisseur commune: la route documents en cree un
// PAR NOM. Les checks qui postent directement un tarif fournisseur (V5, V6) en
// creent donc un, juge par sa cle rendue (la voie d'ecriture unitaire exige une
// cle qui EXISTE, cf. S4 du spec jumeau).
const unFournisseur = async (request: any, nom: string) => {
  const r = await poster(request, "/api/suppliers", { name: nom });
  expect(r.status(), `le fournisseur ${nom} doit etre cree`).toBe(200);
  const sid = (await r.json())?.id;
  expect(typeof sid, "cle de fournisseur non rendue").toBe("string");
  return sid as string;
};

// La facture la plus simple qui passe les gardes de type de la route.
const facture = (iid: string, montant: unknown, nom = "Farine Sonde") => ({
  type: "FACTURE", supplier: "Sonde Fourn Facture", date: "2026-01-09",
  total_amount: 10,
  items: [{ inventory_id: iid, original_name: nom, quantity: 4, unit_price: montant }],
});

test("V1 la creation rend la cle ECITE et relit la ligne (pas le corps de la requete)",
     async ({ request }) => {
  // L'ancien `res.json({ id })` recitoit la requete: pour la voie de creation
  // manuelle, qui n'envoie pas de cle, la reponse portait `id: undefined` et
  // l'appelant qui s'y fiait obtenoit un 404 sur le /validate SUIVANT — sur un
  // document qui venait bel et bien d'etre cree (mesure: D1_VALIDE_CODE=404).
  const iid = await nouveauArticle(request, "Sonde V1 Farine", 10);
  const cree = await poster(request, "/api/documents", facture(iid, 12));
  expect(cree.status(), "V1_LA_CREATION_DOIT_REUSSIR").toBe(200);
  const corps = await cree.json();
  expect(typeof corps?.id, "V1_LA_CLE_RENDE_EST_UNE_CLE_ECITE").toBe("string");
  expect(corps?.document?.id, "V1_LA_LIGNE_EST_RELUE_DES_LA_REPONSE").toBe(corps?.id);
  expect(Array.isArray(corps?.items) && corps.items.length,
    "V1_LES_LIGNES_SONT_RELLEES (une facture sans lignes ne majore rien)").toBe(1);

  // Le contre-controle qui rend ce check non creux: la cle rendue sert reellement.
  const val = await poster(request, `/api/documents/${corps.id}/validate`);
  expect(val.status(), "V1_LA_CLE_RENDUE_SERT_A_VALIDER").toBe(200);
});

test("V2 un montant negatif de facture ne devient pas un tarif certifie",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde V2 Sucre", 30);
  const avant = await prixFournisseur(request, iid);
  const cree = await poster(request, "/api/documents", facture(iid, -12, "Sucre Sonde"));
  expect(cree.status(), "V2_LA_CREATION_REUSSI").toBe(200);
  const cle = (await cree.json()).id;
  const val = await poster(request, `/api/documents/${cle}/validate`);
  expect(val.status(),
    "V2_LA_VALIDATION_N_EST_PAS_BLOQUEE_PAR_UN_MONTANT_LAZY (le stock est le travail principal)").toBe(200);

  const apres = await prixFournisseur(request, iid);
  expect(apres.length, "V2_AUCUN_TARIF_NE_SORT_D_UN_MONTANT_NEGATIF").toBe(avant.length);
  const fautive = apres.find((p: any) => Number(p.raw_unit_price) < 0);
  expect(fautive, "V2_PAS_DE_PRIX_NEGATIF_EN_BASE").toBeFalsy();
  // Le badge compte: un tarif presente comme « verifie sur facture » ne peut pas
  // sortir d'un montant que la voie unitaire refuserait.
  const certifieTropBon = apres.filter((p: any) => p.is_verified_from_invoice === 1
    && Number(p.raw_unit_price) === -12);
  expect(certifieTropBon.length, "V2_PAS_DE_BADGE_CERTIFIE_SUR_UN_CREDIT").toBe(0);

  const corpsVal = await val.json();
  expect(Array.isArray(corpsVal?.prix_non_exploitables)
    && corpsVal.prix_non_exploitables.length,
    "V2_LA_LIGNE_REJETEE_EST_NOMMEE_ET_NON_TUEE").toBeGreaterThanOrEqual(1);
  expect(String(corpsVal?.prix_non_exploitables?.[0]?.raison ?? ""),
    "V2_LA_RAISON_EST_PRECISEE").toContain("montant");
});

test("V3 un montant non numerique ne fait plus meuurir la validation",
     async ({ request }) => {
  const iid = await nouveauArticle(request, "Sonde V3 Riz", 25);
  const cree = await poster(request, "/api/documents", facture(iid, "vingt virgule cinq", "Riz Sonde"));
  expect(cree.status(), "V3_LA_CREATION_REUSSI").toBe(200);
  const corpsCree = await cree.json();
  const cle = corpsCree.id;
  const val = await poster(request, `/api/documents/${cle}/validate`);
  // AVANT: 500 « Validation failed » (node-sqlite3 jette sur un binding NaN), le
  // document restait PENDING et le stock n'etait pas majore.
  expect(val.status(), "V3_UN_TEXTE_N_EST_UN_500_SERVEUR").toBe(200);
  const docs = await (await request.get(`${BASE}/api/documents`)).json();
  const doc = (Array.isArray(docs) ? docs : []).find((d: any) => d.id === cle);
  expect(doc?.status, "V3_LE_DOCUMENT_EST_REELLEMENT VALIDE (le stock suit)").toBe("VALIDATED");

  const lignesRelues = corpsCree?.items ?? [];
  expect(lignesRelues.length, "V3_LA_LIGNE_RESTE_FIDELLE AU FICHIER").toBe(1);
  // La valeur BRUTE reste en base telle quelle: c'est un travail de l'UI
  // d'extraction, pas de cette route. Ce qui compte ici, et qui etait le
  // defaut, c'est qu'elle ne devienne PAS un prix de 0 € chez un fournisseur.
  expect(String(lignesRelues[0]?.unit_price),
    "V3_LA_VALEUR_BRUTE_N'EST_PAS_REECRITE_EN_ZERO").not.toBe("0");

  const tarifs = await prixFournisseur(request, iid);
  expect(tarifs.filter((p: any) => Number(p.raw_unit_price) === 0).length,
    "V3_AUCUN_INGREDIENT_GRATUIT_NE_SORT_DUN_TEXTE_ILLISIBLE").toBe(0);
});

test("V5 aucun nombre de devis negatif ne sort du REPLI de la comparaison",
     async ({ request }) => {
  // LE CHEMIN REEL DE LA BRANCHE DE REFLI. Elle ne s'atteint pas par une
  // facture invalide (ses lignes sont refusees AVANT, donc aucun groupe
  // n'existe — une version precedente de ce test l'ignorait et jugoit le
  // vide). Elle s'atteint par un article dont le `unit_price` de REFERENCE est
  // corrompu: la voie de creation d'inventaire ne le borne pas (defaut consigne
  // pour PUT, S2: l'affinite dynamique de SQLite depose n'importe quoi dans une
  // colonne REAL), et la comparaison y retombe des qu'aucune ligne fournisseur
  // n'est electionable. C'est la mesure de D1_MEILLEUR_PRIX=-12.
  const art = await poster(request, "/api/inventory", {
    name: "Sonde V5 Sel Corrompu", quantity: 5, minStock: 1, unit: "kg",
    status: "ok", category: "Epicerie", unit_price: 12,
  });
  expect(art.status(), "l'article de reference doit passer la creation").toBe(200);
  const iid = (await art.json())?.id;
  // ⚠ LE PRIX DE REFERENCE CORROMPU est une DONNEE HERITEE et non une saisie:
  // le contrat de POST /api/inventory (Sprint 8.2) REFUSE un `unit_price`
  // negatif — un prix de -50 € ne sort plus d'une porte d'ecriture. C'est
  // justement ce que ce test doit traverser: le garde de repli, lui, vise les
  // BASES DEJA LIVREES (les lignes posees par l'ancienne route sans borne, la
  // lecon de M7/S6c). La voie legitime est donc le SEMIS DIRECT en base, comme
  // S6c dans supplier-price-contract.spec.ts, avec l'API du depot
  // (`open({filename, driver: sqlite3.Database})`, src/db/init.ts:80) et une
  // PREUVE de la semence: sans relecture du compte, le test jugerait le vide.
  {
    const dbFichier = path.join(DATA_DIR, "agent_culinaire.db");
    const dbLocal = await open({ filename: dbFichier, driver: sqlite3.Database });
    await dbLocal.run("PRAGMA busy_timeout = 8000");
    const pose = await dbLocal.run(
      "UPDATE inventory SET unit_price = ? WHERE id = ?",
      [-50, iid],
    );
    await dbLocal.close();
    expect(pose.changes, "V5_LA_SEMENCE_DU_PRIX_CORROMPU_ENTRE_EN_BASE").toBe(1);
  }
  // et il y est REELLEMENT, relu par la voie de lecture de l'app (et non par le
  // seul compteur de l'UPDATE): sinon les expects du dessous porteroient sur une
  // ligne saine et le verdict serait un faux vert.
  const relueV5 = ((await (await request.get(`${BASE}/api/inventory`)).json()) as any[])
    .find((x: any) => x.id === iid);
  expect(relueV5?.unit_price, "V5_LE_PRIX_DE_REFERENCE_EST_BIEN_CORROMPU_EN_BASE").toBe(-50);
  expect(relueV5?.quantity, "et la quantite reste un nombre exploitable").toBe(5);
  const sid = await unFournisseur(request, "Sonde Fourn V5");
  // Une ligne fournisseur NON COMPARABLE (unite hors famille): le groupe existe,
  // mais rien n'est electionable -> la comparaison tombe sur le repli.
  const imp = await poster(request, "/api/supplier-prices", {
    supplier_id: sid, inventory_id: iid, raw_unit_price: 7, unit: "paquets",
  });
  expect(imp.status(), "la ligne non comparable doit etre acceptee (elle reste visible)").toBe(200);

  const g = await groupe(request, iid);
  expect(g, "le groupe de comparaison existe (une ligne est en base)").not.toBeNull();
  expect(g?.best_supplier_price,
    "V5_LA_LIGNE_NON_COMPARABLE_NE_PEUT_ETRE_ELUE").toBeNull();
  // Le DRAPEAU est juge AVANT le nombre: les deux portent des regles distinctes
  // (l'un dit « ce prix est-il defendable », l'autre « quel nombre sort ») et
  // Playwright stoppe un test au premier expect fautif. Dans l'ordre inverse,
  // deux mutations differentes (retrait du garde de repli / retrait du predicat)
  // trébuchent le MEME premier expect et cessent de se discriminer — un harnais
  // de mutations qui ne distingue pas deux fautes n'en prouve qu'une.
  expect(typeof g?.prix_exploitable, "V5_LE_DRAPEAU_D_EXPLOITABILITE_EST_RENDU").toBe("boolean");
  expect(g?.prix_exploitable, "V5_SANS_PRIX_DEFENDABLE_LE_DRAPEAU_LE_DIT").toBe(false);
  // Le coeur de V5: le repli ne recite plus le prix de reference sans le juger.
  expect(g?.best_price === null || Number(g?.best_price) >= 0,
    "V5_AUCUN_NOMBRE_DE_DEVIS_NEGATIF_NE_SORT_DU_REPLI").toBe(true);
  expect(g?.best_price, "V5_LE_REFLI_D_UN_PRIX_DE_REFERENCE_CORROMPU_EST_UN_AVEU").toBeNull();
  expect(g?.savings_percent, "V5_PAS_D_ECONOMIE_INVENTEE").toBe(0);
});

test("V6 le repli reste UTILISABLE quand le prix de reference est sain",
     async ({ request }) => {
  // Contre-controle obligatoire de V5: sans lui, « best_price = null partout »
  // satisferait V5 et viderait le tableau comparateur du chef (le KPI
  // « economies actives » de Purchasking ~1069 et le devis de
  // FichesTechniques ~1791 ne rendraient plus rien). La regle doit fermer la
  // voie FAUSSE et laisser ouverte la voie VRAIE.
  const iid = await nouveauArticle(request, "Sonde V6 Poivre", 12);
  const sid = await unFournisseur(request, "Sonde Fourn V6");
  const imp = await poster(request, "/api/supplier-prices", {
    supplier_id: sid, inventory_id: iid, raw_unit_price: 9, unit: "sachets",
  });
  expect(imp.status(), "la ligne non comparable est acceptee").toBe(200);
  const g = await groupe(request, iid);
  expect(g, "le groupe existe").not.toBeNull();
  expect(g?.best_price,
    "V6_SANS_ELUE_LE_CHEF_GARDE_LE_PRIX_DE_REFERENCE_SAISIE").toBe(12);
  expect(g?.prix_exploitable, "V6_UN_PRIX_DE_REFERENCE_SAISIE_EST_DEFENDABLE").toBe(true);
  expect(g?.savings_percent, "V6_PAS_D_ECONOMIE_SANS_FOURNISSEUR_ELUS").toBe(0);
});

test("V4 un montant legitime entre bien en tarif, badge a 1 (contre-controle)",
     async ({ request }) => {
  // SANS ce test, V2 et V3 sont satisfaits par un correctif qui n'ecrit JAMAIS
  // rien depuis une facture: le chef perd alors la voie la plus utile du produit
  // (le tarif releve sur facture) et rien ne le voit. Une regle se juge dans ses
  // DEUX voies — la lecon des S3/S3b et des budgets recopies.
  const iid = await nouveauArticle(request, "Sonde V4 Huile", 40);
  const cree = await poster(request, "/api/documents", facture(iid, 31.5, "Huile Sonde"));
  const cle = (await cree.json()).id;
  const val = await poster(request, `/api/documents/${cle}/validate`);
  expect(val.status(), "V4_LA_VALIDATION_D_UNE_FACTURE_PROPRE_REUSSI").toBe(200);

  const tarifs = await prixFournisseur(request, iid);
  const ligne = tarifs.find((p: any) => Number(p.raw_unit_price) === 31.5);
  expect(ligne, "V4_LE_TARIF_RELEVE_SUR_FACTURE_ENTRE_EN_BASE").toBeTruthy();
  expect(ligne?.is_verified_from_invoice,
    "V4_LE_BADGE_DE_VERIFICATION_EST_LA_POUR_UNE_VRAIE_FACTURE").toBe(1);
  const g = await groupe(request, iid);
  expect(g?.best_supplier_price?.calculated_price_per_ref,
    "V4_LA_COMPARAISON_DESIGNIE_BIEN_LE_TARIF_DE_FACTURE").toBe(31.5);
});
