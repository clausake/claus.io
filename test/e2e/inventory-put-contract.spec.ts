// Preuve du contrat ECRIT/LUE de PUT /api/inventory/:id.
//
// Pourquoi ce spec existe, et pourquoi il est COMPORTEMENTAL et non « le JSON a
// la bonne forme ». Pendant des mois la route a passe les dix champs de req.body
// DIRECTEMENT au UPDATE. Trois defauts, mesures par
// scripts/probe-inventory-put-partial.mjs sur un serveur reel :
//
//   S1  un payload partiel (ne changer QUE le nom) sortait en 500 : le binding de
//       node-sqlite3 jette sur `undefined`. Et si le binding eut ete relache,
//       `undefined` devient NULL en base — renommer un article evoidait sa
//       quantite, son unite et son prix. Les deux issues sont fausses, et une
//       assertion « la reponse contient un champ status » ne voit ni l'une ni
//       l'autre.
//   S2  quantity = "abc" sortait en 200 et partait en base COMME TEXTE
//       (affinite dynamique de SQLite : rien ne verifie une colonne REAL). Des
//       lors `quantity <= minStock` compare texte vs reel, et le badge
//       « ok / bas / critique » de l'auditeur devient une etiquette inventee.
//       C'est la famille exacte du KPI `dailyLaborCost` fige a 0 pendant des
//       mois (PHASES.md, 10/09) : un PASS creux, juge sur la FORME du champ.
//   S3  status = "defile" sortait en 200 et ete relu en base. Le badge est une
//       chaine que le CLIENT choisissait, plus un statut.
//
// Les regles jugees ici, et LEUR ORACLE (jamais un re-call de la route):
//   A. DELTA, non forme : un PUT partiel doit bouger la seule colonne demandee
//      et laisser les neuf autres a leurs valeurs EXACTES d'avant.
//   B. contre-controle negatif : la valeur d'une colonne NON envoyee est comparee
//      a ce que POST y avoit depose (ligne de base relue depuis la BASE).
//   C. le refus doit rougir AVANT d'ecrire : on relit la base apres chaque 400.
//      Un 400 qui a quand même ecrit est le pire des deux mondes.
//   D. une reponse ne prouve rien : la valeur ecrite est relue dans une
//      SECONDE requete, et c'est elle qui porte le verdict (S4_RELECTURE).
//   E. le 404 : un PUT sur un id inexistant n'est pas une reussite. Sans ce
//      garde, la route repondoit 200 a un UPDATE de zero ligne.
//   F. l'enum du statut est ferme, mais IL INCLUT ce que l'ECRITURE de l'app y
//      depose: 'active' vient de l'init (src/db/init.ts). Rejeter cette valeur
//      aurait casse des lignes que le produit a lui-même creees — une
//      validation trop stricte est un defaut, pas un succes.
//
// ⚠ Le 500 de S1 est un defaut de LA ROUTE et non du client: le payload est
// legitime (c'est ce que ferait n'importe quel client qui n'envoie pas les
// colonnes qu'il ne touche pas). Le juger par « une reponse JSON est rendue »
// laisserait le 500 passer comme une reponse comme une autre.
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
const DATA_DIR = path.join(process.cwd(), "test", "tmp-inventory-put");

// Le jeton que CE test impose au serveur (COOKDRIVE_INSTANCE_TOKEN). La
// confrontation de l'en-tete X-Cookdrive-Instance avec lui est la seule preuve
// que la reponse vient de L'INSTANCE QUE CE TEST A LANCEE, et non d'un serveur
// herite qui aurait repris le port (piege consigne: un PASS rendu par une
// instance qui n'est pas la tienne n'est pas une mesure).
const INSTANCE_TOKEN = `invput-${process.pid}-${Date.now()}`;

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

const LIGNE = {
  name: "Farine Sonde T",
  quantity: 12.5,
  minStock: 2,
  unit: "kg",
  status: "ok",
  category: "Epicerie",
  unit_price: 3.4,
  lot_number: "LOT-S",
  dlc: "2027-01-01",
};
const RELIRE = [
  "name", "quantity", "minStock", "unit", "status", "category",
  "unit_price", "lot_number", "dlc",
] as const;

/** Demande un port a l'OS, le referme, et le RE-IMPOSE au fils. */
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
  server = spawn(process.execPath, [tsxBin, "server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
          COOKDRIVE_AUTH_OFF: "1",
      PORT: String(PORT),
      USER_DATA_PATH: DATA_DIR,
      COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serveurFini = new Promise((r) => server.on("exit", () => r()));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      const recu = res.headers.get("x-cookdrive-instance");
      if (res.ok && recu === INSTANCE_TOKEN) return; // la VOTRE, pas un voisin du port
      if (res.ok && recu !== null) {
        throw new Error(
          `instance PERIMEE sur le port ${PORT}: l'en-tete dit « ${recu} », ` +
            `ce test attend « ${INSTANCE_TOKEN} ». Ce n'est pas le serveur de ce test.`,
        );
      }
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("instance PERIMEE")) throw new Error(msg);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `serveur pas pret en 60 s sur le port ${PORT} (l'attente n'a jamais vu ` +
      `l'en-tete d'instance de ce test)`,
  );
}, 90_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/** Le GET de relecture: la BASE porte le verdict, jamais le corps de la requete. */
const relire = async (request: any, id: string) => {
  const tous = await request.get(`${BASE}/api/inventory`);
  expect(tous.status()).toBe(200);
  const brut = await tous.json();
  const liste = Array.isArray(brut) ? brut : brut?.items ?? [];
  return liste.find((x: any) => x.id === id) ?? null;
};

const creer = async (request: any, supplement: Record<string, unknown> = {}) => {
  const res = await request.post(`${BASE}/api/inventory`, { data: { ...LIGNE, ...supplement } });
  expect(res.status()).toBe(200);
  const corps = await res.json();
  const id = corps?.id;
  expect(typeof id).toBe("string");
  return id as string;
};

const put = (request: any, id: string, data: Record<string, unknown>) =>
  request.put(`${BASE}/api/inventory/${id}`, { data });

test("PUT inventaire: partiel = une colonne bouge, les neuf autres sont INTACTES",
     async ({ request }) => {
  const id = await creer(request);
  const avant = await relire(request, id);
  expect(avant, "la ligne doit exister avant le PUT").not.toBeNull();
  for (const c of RELIRE) expect(avant[c], `ligne de base ${c}`).toBeDefined();

  const res = await put(request, id, { name: "Farine Sonde Renommee" });
  expect(res.status()).toBe(200); // l'ancien 500 du payload partiel (S1)

  const apres = await relire(request, id);
  expect(apres.name).toBe("Farine Sonde Renommee");
  // Le DELTA est la seule mesure qui vaille: comparer a la base d'AVANT, pas a
  // « un nombre », sans quoi une colonne vidée a NULL passerait pour un succes
  // (typeof null === 'object', et null n'est « pas un nombre »: un garde de
  // forme l'aurait vu, mais un garde de forme ne voit pas quantity: 12.5 -> 0).
  for (const c of RELIRE) {
    if (c === "name") continue;
    expect(apres[c], `la colonne non envoyee ${c} a bouge`).toBe(avant[c]);
  }
});

test("PUT inventaire: un refus ne laisse AUCUNE trace ecrite", async ({ request }) => {
  const id = await creer(request);
  const avant = await relire(request, id);

  // S2: du texte dans une colonne REAL. SQLite l'accepte (affinite dynamique):
  // c'est donc a la route de le refuser, et le refuse doit etre ANTERIEUR a
  // l'ecriture — un 400 qui a quand même ecrit est pire qu'un 200 honnete.
  const mauvais = await put(request, id, { quantity: "abc" });
  expect(mauvais.status(), "REFUS_TEXTE_QUANTITE").toBe(400);
  const apresRefus = await relire(request, id);
  for (const c of RELIRE) expect(apresRefus[c], `refus a quand même ecrit ${c}`).toBe(avant[c]);

  // S3: le statut est un ENUM ferme, plus une chaine que le client choisit.
  const statut = await put(request, id, { status: "defile" });
  expect(statut.status(), "REFUS_STATUT_INVENTE").toBe(400);
  expect(apresRefus.status, "le statut a ete ecrase par un refus").toBe("ok");
  const apresStatut = await relire(request, id);
  expect(apresStatut.status).toBe("ok");
});

test("PUT inventaire: la reponse relit la BASE et ne recite pas le client",
     async ({ request }) => {
  const id = await creer(request);
  const res = await put(request, id, { quantity: 7 });
  expect(res.status()).toBe(200);
  const relu = await relire(request, id);
  expect(relu.quantity).toBe(7);
  // La reponse porte la relûre, pas le corps de la requete: si elle recitait
  // `req.body`, une ecrazerie en base resterait invisible a l'ecran.
  const corps = await res.json();
  const rendu = corps?.item?.quantity ?? corps?.quantity;
  expect(rendu, "RELECTURE_QUANTITE").toBe(relu.quantity);
  // ⚠ Le contre-controle qui rend cette preuve NON creuse. Comparer la seule
  // quantite ne peut rien discriminer : le PUT envoyait quantity: 7 et la base
  // porte 7, donc « la reponse recite le client » et « la reponse relit la base
  // » rendent le MEME 7. La preuve exige un champ que le CLIENT N'A PAS ENVOYE :
  // si la reponse est le corps de la requete, `name` y est `undefined` pendant
  // que la base porte le nom reel. (Le harnais
  // scripts/negative-test-inventory-put.py l'a prouve: sans cette assertion, la
  // mutation M6 — `item: req.body` au lieu de `item: relu` — restait VERTE.)
  const attendu = await relire(request, id);
  for (const c of RELIRE) {
    expect(corps?.item?.[c], `RELECTURE_COMPLETE_${c}`).toBe(attendu[c]);
  }
});

test("PUT inventaire: un id inexistant n'est pas une reussite", async ({ request }) => {
  const res = await put(request, "id-qui-n-existe-pas-42", { quantity: 1 });
  expect(res.status(), "REFUS_ID_INEXISTANT").toBe(404); // avant: 200 pour 0 ligne touchee
});

test("PUT inventaire: l'enum accepte ce que L'ECRITURE de l'app produit",
     async ({ request }) => {
  // F. src/db/init.ts met status='active' a l'init. Une validation qui ne
  // connaisse que les etiquettes de l'auditeur (ok/low/critical) rejetterait
  // des lignes creees par le produit lui-même: une regle trop stricte est un
  // defaut, et elle se presente comme un 400 parfaitement propre.
  const id = await creer(request, { status: "active" });
  expect((await relire(request, id)).status).toBe("active");
  const res = await put(request, id, { status: "active" });
  expect(res.status()).toBe(200);
  expect((await relire(request, id)).status).toBe("active");
});

test("PUT inventaire: le rendement suit sa chaine d'achat (bornes de l'ecriture)",
     async ({ request }) => {
  // POST fige yield_percent a 100 en l'absence; PUT ne doit pas le remettre a
  // 100 quand le client ne l'envoie pas (c'etait le 4e defaut: toute mise a
  // jour d'un autre champ effacoit un rendement saisi).
  const id = await creer(request);
  const ok = await put(request, id, { yield_percent: 80 });
  expect(ok.status()).toBe(200);
  expect((await relire(request, id)).yield_percent).toBe(80);

  const sansRendement = await put(request, id, { name: "Farine Sonde T2" });
  expect(sansRendement.status()).toBe(200);
  expect((await relire(request, id)).yield_percent,
    "le rendement a ete ecrase a sa valeur par defaut").toBe(80);

  // 101 % de rendement est une perte de temps: hors plage, donc refuse.
  expect((await put(request, id, { yield_percent: 101 })).status(),
    "REFUS_RENDEMENT_HORS_PLAGE").toBe(400);
});
