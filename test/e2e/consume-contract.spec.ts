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
const DATA_DIR = path.join(process.cwd(), "test", "tmp-consume");
const INSTANCE_TOKEN = "consume-contract";

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
          COOKDRIVE_AUTH_OFF: "1",
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

type Ligne = { id: string; name: string; quantity: number };
type Corps = {
  success?: boolean;
  consumed?: number;
  items?: Ligne[];
  refused?: number[];
  unknown?: number[];
  error?: string;
};

// La relécture passe par la VOIE DE LECTURE de l'app (GET /api/inventory) et
// non par un driver sqlite invente par le test: c'est ce que le chef voit a
// l'ecran qui est juge, pas un etat que le harnais se represente.
async function lignes(request: any, ids: string[]): Promise<number[]> {
  const res = await request.get(`${BASE}/api/inventory`);
  expect(res.status()).toBe(200);
  const tout = (await res.json()) as Ligne[];
  // L'ordre est celui des ids PASSES en argument (et non un tri lexicographique
  // des cles: `consume-...-9` > `consume-...-10`, ce qui aurait rendu le test
  // faux selon le numero de graine, donc selon l'ordre des tests precedents).
  const parId: Record<string, number> = {};
  for (const l of tout) parId[l.id] = l.quantity;
  for (const id of ids) {
    expect(parId[id] === undefined, `ligne ${id} absente de GET /api/inventory`).toBe(false);
  }
  return ids.map((id) => parId[id]);
}

let seed = 0;
async function creer(request: any, quantity: number): Promise<string> {
  seed += 1;
  const id = `consume-${Date.now()}-${seed}`;
  const res = await request.post(`${BASE}/api/inventory`, {
    data: {
      id,
      name: `Consume ${seed}`,
      quantity,
      minStock: 0,
      unit: "kg",
      status: "active",
      category: "Test",
      unit_price: 1,
    },
  });
  expect(res.status()).toBe(200);
  return id;
}

const consommer = (request: any, items: unknown) =>
  request.post(`${BASE}/api/inventory/consume`, { data: { items } });

test("C1 ligne de base: le mouvement est EXACT en base, et le retirer ramene la ligne de base", async ({ request }) => {
  const a = await creer(request, 10);
  const b = await creer(request, 4);
  expect(await lignes(request, [a, b])).toEqual([10, 4]);

  const res = await consommer(request, [
    { inventory_id: b, quantity: 1.5 },
    { inventory_id: a, quantity: 3 },
  ]);
  expect(res.status()).toBe(200);
  const corps = (await res.json()) as Corps;
  expect(corps.success).toBe(true);
  // le compte-rendu est RE-LLU en base, pas recite du corps de la requete
  expect(corps.consumed).toBe(2);
  // ⚠ Le compte-rendu est juge CONTRE LA BASE et non contre sa propre forme:
  // juger la seule longueur de `items` laisse passer une reponse qui RECITE les
  // quantites du corps de la requete (la mutation M4 rendoit 8/8 faux avant ce
  // durcissement: un PASS creux de plus, celui de l'harnais lui-meme). Les
  // valeurs rendues DOIVENT etre les quantites lues en base (7 et 2.5) et non
  // celles envoyees (3 et 1.5).
  const rendues = (corps.items || []).slice().sort((x, y) => (x.id < y.id ? -1 : 1));
  expect(rendues.length).toBe(2);
  expect(rendues.map((l) => l.quantity)).toEqual([7, 2.5]);
  // et l'identite de chaque clef relue: sans ce controle, des lignes
  // rendues dans le desordre satisfaisent le check de quantite du dessus.
  expect(rendues.map((l) => l.id)).toEqual([a, b]);
  expect(await lignes(request, [a, b])).toEqual([7, 2.5]);

  // RETIRER: une quantite nulle est refusee et ne doit RIEN deplacer (sans ce
  // second temps, verifier "quantite != 10" se satisferait de n'importe quoi).
  const r2 = await consommer(request, [{ inventory_id: a, quantity: 0 }]);
  expect(r2.status()).toBe(400);
  expect(await lignes(request, [a, b])).toEqual([7, 2.5]);
});

test("C2 clef inconnue: 400 NOTIFIE, index nomme, et AUCUNE ecriture partielle (F1)", async ({ request }) => {
  const a = await creer(request, 10);
  // premiere ligne valide, seconde clef inexistante. L'ancien code avait DEJA
  // retire 4 de A avant de s'apercevoir que la seconde n'existait pas, et
  // repondait { success: true }.
  const res = await consommer(request, [
    { inventory_id: a, quantity: 4 },
    { inventory_id: "n-existe-pas-91", quantity: 2 },
  ]);
  expect(res.status()).toBe(400);
  const corps = (await res.json()) as Corps;
  // le chef doit savoir QUEL index corriger (lecon de l'import de mercuriale)
  expect(Array.isArray(corps.unknown)).toBe(true);
  expect(corps.unknown).toEqual([1]);
  // ⚠ atomicite: la premiere ligne ne reste PAS consommee
  expect(await lignes(request, [a])).toEqual([10]);
});

test("C3 entree malformee: 400 + refused nomme, zero ecriture (F2)", async ({ request }) => {
  const a = await creer(request, 8);
  const cas: [string, unknown][] = [
    ["quantite absente", { inventory_id: a }],
    ["quantite texte", { inventory_id: a, quantity: "beaucoup" }],
    ["quantite vide", { inventory_id: a, quantity: "" }],
    ["quantite nulle", { inventory_id: a, quantity: 0 }],
    ["quantite negative (remplissait le stock avant)", { inventory_id: a, quantity: -3 }],
    ["quantite infinie", { inventory_id: a, quantity: 1e999 }],
    ["clef absente", { quantity: 1 }],
    ["clef vide", { inventory_id: "   ", quantity: 1 }],
    ["clef numerique", { inventory_id: 12, quantity: 1 }],
    ["clef nulle", { inventory_id: null, quantity: 1 }],
  ];
  for (const [label, item] of cas) {
    const res = await consommer(request, [item]);
    expect(res.status(), `cas: ${label}`).toBe(400);
    const corps = (await res.json()) as Corps;
    expect(Array.isArray(corps.refused), `refused attendu pour: ${label}`).toBe(true);
    expect(corps.refused, `refused attendu pour: ${label}`).toEqual([0]);
  }
  // aucune tentative n'a du toucher le stock
  expect(await lignes(request, [a])).toEqual([8]);
});

test("C4 un lot melange (valide + malformé) ne consomme RIEN du tout", async ({ request }) => {
  const a = await creer(request, 30);
  const res = await consommer(request, [
    { inventory_id: a, quantity: 5 },
    { inventory_id: a, quantity: "six" },
  ]);
  expect(res.status()).toBe(400);
  expect(await lignes(request, [a])).toEqual([30]);
  // ⚠ CE test, seul, n'est PAS une preuve d'atomicite: la validation des entrees
  // part AVANT le premier UPDATE, donc aucun etat ne peut atteindre l'ecriture
  // partielle par cette voie. L'atomicite reelle (des ecritures DEJA faites puis
  // annulees) n'est jugee que par C2 et le second temps de ce test, qui empruntent la voie des clefs
  // inconnues — la seule qui ait un ROLLBACK a exercer. Garde ici parce qu'un
  // lot melange doit rester un refus notifie, pas parce qu'il prouverait l'annulation.
  //
  // Ce second temps est l'angle mort ferme: DEUX lignes valides ecrites, la troisieme
  // inconnue, et l'une des deux depasse son stock (donc clampe a 0). Si une
  // seule des annulations sautait, la quantite clampee ou retranchee survivrait.
  const b = await creer(request, 6);
  const res2 = await consommer(request, [
    { inventory_id: a, quantity: 9 },
    { inventory_id: b, quantity: 60 },
    { inventory_id: "fantome-42", quantity: 1 },
  ]);
  expect(res2.status()).toBe(400);
  expect((await res2.json()).unknown).toEqual([2]);
  expect(await lignes(request, [a, b])).toEqual([30, 6]);
});

test("C5 payload non valide: items absent, non-tableau, vide -> 400 et non 500", async ({ request }) => {
  for (const data of [{}, { items: "tout" }, { items: {} }, { items: [] }, { items: null }]) {
    const res = await request.post(`${BASE}/api/inventory/consume`, { data });
    expect(res.status(), `payload ${JSON.stringify(data)}`).toBe(400);
  }
});

test("C6 consommation au-dessus du stock: borne a 0, jamais negatif", async ({ request }) => {
  const a = await creer(request, 3);
  const res = await consommer(request, [{ inventory_id: a, quantity: 99 }]);
  expect(res.status()).toBe(200);
  const apres = await lignes(request, [a]);
  expect(apres).toEqual([0]);
});

test("C7 la voie de l'UI: un chariot de production bien forme deconsomme le stock", async ({ request }) => {
  // ProductionPlan.tsx poste `items: cartItems.map(i => ({inventory_id, quantity}))`
  // sans retoucher le payload. C'est CETTE forme que le contrat doit accepter.
  const a = await creer(request, 12);
  const b = await creer(request, 7);
  const res = await consommer(request, [
    { inventory_id: a, quantity: 2 },
    { inventory_id: b, quantity: 7 },
  ]);
  expect(res.status()).toBe(200);
  expect(await lignes(request, [a, b])).toEqual([10, 0]);
});
