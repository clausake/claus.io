// Preuve de la VUE Reception des achats : le panneau doit EXISTER et etre
// utilisable, pas seulement la route.
//
// Pourquoi ce spec existe (regle du proprietaire du projet) : « Fais pareil au
// projet de reference » se juge sur CHAQUE panneau visible, pas seulement sur le
// rendu des donnees. Un panneau entier absent est un ECHEC meme si tous les gates
// numeriques passent. La chaine d'achat a ete referree cote serveur (le bon se
// receptionne et entre en stock) : sans ce spec, rien ne prouvait que l'operateur
// avait un endroit ou cliquer. Une route sans ecran n'est pas une fonctionnalite.
//
// Le defaut SILENCIEUX chasse ici est celui du harnais Motion : un onglet
// branche sur un `activeTab` qui ne correspond a aucun rendu laisse un bouton
// absent, et le build reste VERT. Seul un navigateur reel voit l'onglet.
//
// Ce qui est juge, dans l'ordre du parcours de l'operateur :
//   A. l'onglet « Reception » existe (present dans le DOM) et se clique
//   B. le bon seede par l'API apparait : fournisseur, designation, quantite
//   C. une ligne dont l'inventaire_id ne jointe rien est SIGNALEE (le badge
//      « hors inventaire ») — c'etait la faute d'origine (inventory_id = le NOM)
//   D. « Receptionner » existe et, presse, fait monter le stock (verifie cote
//      API, la route etant la source de verite du mouvement)
//   E. un bon deja receptionne ne presente plus le bouton (idemopotence a l'ecran)
//
// ⚠ Les SELECTEURS sont DOM et non des « roles/names » : le libelle de l'onglet
// porte l'accent circonflexie (« Reception ») et le badge de compte colle un
// chiffre a son nom accessible (« Reception1 »). Un `getByRole({ name: /Reception/ })`
// sans accent ne matche rien (le regex est sensible a l'accent) ; avec accent et
// en recherche partielle, il matche AUSSI le bouton d'action « Receptionner ».
// Les deux defauts laissent un test rouge pour une raison de selection, et non
// pour un panneau absent : c'est le pire genre d'echec a debugger. On juge donc
// par `document.querySelectorAll` + textContent, au centime pres.
//
// Fixture `page` : ce spec lance donc un vrai Chromium, ce qui oblige le job e2e
// du pipeline a installer les bibliotheques systeme. Le garde scripts/verify-ci.mjs
// la decide sur les fixtures reellement destructures (et non sur le nom du
// fichier) : il doit continuer de reclamer `--with-deps`.
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-reception");

let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

const post = (request: any, url: string, data: any) =>
  request.post(`${BASE}${url}`, { data });

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
  // L'assistant de premier demarrage (Tache 10) tient l'ecran tant que le
  // demarrage n'est pas consigne : un test d'UI qui n'a pas consigne reste
  // sur l'assistant et rougit en accusant SON panneau d'etre absent — le
  // piege de la landing, bis. On consigne le demarrage par le MME chemin que
  // le produit ecrit (settings.json), la ou le serveur le lit.
  fs.writeFileSync(path.join(DATA_DIR, "settings.json"),
    JSON.stringify({ install_termine_le: new Date().toISOString(),
                    fournisseur_choisi: "ollama" }));
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error(
      "dist/ absent : lancer `npm run build` avant cette suite (meme contrat que motion-animation.spec.ts)",
    );
  }
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  // PAS d'await ici : la promesse se resout a la MORT du serveur.
  // L'attendre ici ferait attendre a beforeAll que le serveur meure avant de
  // continuer — un timeout de hook a 90 s garanti.
  serveurFini = new Promise<void>((resolve) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        USER_DATA_PATH: DATA_DIR,
      // ⚠ NODE_ENV=production est OBLIGATOIRE pour un test qui juge le RENDU.
      // En dev, server.ts monte les middlewares Vite et la page ne se monte
      // PAS sous Chromium : la CSP (`script-src 'self'`) bloque le script INLINE
      // du react-refresh, React n'entre pas, `#root` reste a 0 enfant et la page
      // est blanche. Mesure par scripts/diag-page.mjs : dev => boutons=0,
      // production => boutons=1 (« Accéder à la Cuisine »). Le harnais Motion a
      // deja ce reglage pour la meme raison : seule la branche express.static
      // sert le vrai bundle.
      NODE_ENV: "production",
    },
    stdio: "pipe",
    });
    server.on("exit", () => resolve());
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
  throw new Error("le serveur de test n'a pas demarre");
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  if (PORT) await attendrePortLibre(PORT);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

// Presse le premier bouton dont le textContent matche `motif`, et dit si elle
// l'a trouve. Renvoie false quand le panneau est absent : c'est la preuve que
// l'ecran n'existe pas (et non un simple probleme de sélection).
const cliquer = async (page: any, motif: RegExp): Promise<boolean> =>
  page.evaluate(
    ([source, flags]: [string, string]) => {
      const rx = new RegExp(source, flags);
      const btns = Array.from(document.querySelectorAll("button"));
      const cible = btns.find((b) =>
        rx.test((b.textContent || "").trim().replace(/\s+/g, " ")),
      );
      if (!cible) return false;
      (cible as HTMLButtonElement).click();
      return true;
    },
    [motif.source, motif.flags],
  );

// L'onglet de la sous-vue : « Reception » (avec son badge de compte) mais PAS
// « Receptionner », le bouton d'action — d'ou le `(?!ner)` en lookahead.
const ONGLET = /^R[eé]ception(?!ner)/i;
const ACTION = /^R[eé]ceptionner/i;

const solde = async (request: any, id: string): Promise<number> => {
  const res = await request.get(`${BASE}/api/inventory`);
  const lignes = await res.json();
  const item = lignes.find((i: any) => i.id === id);
  return item ? Number(item.quantity) : NaN;
};

// Le bon est seede par l'API et non en cliquant sur « Genérer » : le bouton
// telecharge un PDF (jsPDF.doc.save) et Playwright ne doit pas se battre avec un
// telechargement pour juger un panneau. La donnee est posee par la voie
// d'ecriture, l'ecran est juge par le navigateur.
const seed = async (request: any) => {
  await post(request, "/api/inventory", {
    name: "Pomme de Terre Reception",
    quantity: 3,
    minStock: 40,
    unit: "kg",
    status: "low",
    category: "Legume",
    unit_price: 1.4,
    yield_percent: 100,
  });
  await post(request, "/api/suppliers", {
    name: "Terre Azur Reception",
    email: "contact@terre-azur.example",
    phone: "0102030405",
  });
  const articles = await (await request.get(`${BASE}/api/inventory`)).json();
  const article = articles.find((i: any) => i.name === "Pomme de Terre Reception");
  expect(article, "l'article de sonde doit exister").toBeTruthy();

  // La seconde ligne de le bon porte un article REEL au moment de la commande,
  // puis RETIRE de l'inventaire. C'est le seul chemin vers une ligne qui ne
  // jointe plus : la route refuse desormais un `inventory_id` inconnu a la
  // creation (le defaut d'origine — `inventory_id: <nom>` — est une faute
  // d'ecriture, pas un etat de base). On exerce donc le cas metier reel : on
  // commande, puis l'article sort de l'inventaire (renomme, purge), et la
  // ligne de le bon devient non jointurable. C'est la qu'un badge
  // « hors inventaire » merite d'exister, sans quoi l'operateur ne voit pas que
  // cette ligne-la ne rentrera jamais en stock.
  await post(request, "/api/inventory", {
    name: "Sel Gris de Bretagne Reception",
    quantity: 2,
    minStock: 5,
    unit: "kg",
    status: "low",
    category: "Epicerie",
    unit_price: 3.2,
    yield_percent: 100,
  });
  const avant = await (await request.get(`${BASE}/api/inventory`)).json();
  const retire = avant.find((i: any) => i.name === "Sel Gris de Bretagne Reception");
  expect(retire, "le second article de sonde doit exister").toBeTruthy();

  const bon = await post(request, "/api/purchasing/order", {
    supplier: "Terre Azur Reception",
    items: [
      { inventory_id: article.id, quantity: 25, unit_price: 1.4 },
      { inventory_id: retire.id, quantity: 4, unit_price: 3.2 },
    ],
  });
  expect(bon.status()).toBe(200);
  const corps = await bon.json();
  expect(corps.lines).toBe(2);

  // L'article sort de l'inventaire APRES la commande : la ligne survit (c'est
  // la trace de ce qui a ete commande) mais ne jointe plus rien.
  const del = await request.delete(`${BASE}/api/inventory/${retire.id}`);
  expect(del.status()).toBe(200);

  // contre-controle du contrat de la route : un id inconnu ne doit PAS entrer
  // dans un bon (sinon le badge « hors inventaire » serait l'avatar d'un bug).
  const pourri = await post(request, "/api/purchasing/order", {
    supplier: "Terre Azur Reception",
    items: [{ inventory_id: "Article Qui N'existe Pas", quantity: 4, unit_price: 2 }],
  });
  expect(pourri.status()).toBe(400);
  expect((await pourri.json()).unknown_items.length).toBe(1);

  return { article, documentId: corps.documentId };
};

const ouvrirAchats = async (page: any) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  // ⚠ Il y a une LANDING : « Accéder à la Cuisine » occupe l'ecran tant qu'on
  // n'est pas entre, et la barre laterale n'est PAS rendue avant (piege deja
  // consignee par le harnais Motion). Un test qui saute cette porte reste sur
  // une page sans boutons et rougit en accusant l'onglet d'etre absent — un
  // faux negatif qui ferait croire a un panneau manquant. On entre donc comme
  // un utilisateur, en ciblant le premier bouton d'action au lieu d'un libelle
  // dur (qui casserait a la prochaine traduction).
  const entrer = page.locator("button").first();
  if (await entrer.count()) {
    await entrer.click({ timeout: 8_000 }).catch(() => {});
  }
  // Le panneau se monte apres l'entree (et les vues sont paressees a la demande).
  await page.waitForTimeout(1_200);
  // Alt+6 = l'onglet « Achats » de la barre laterale (voir App.tsx, la table des
  // raccourcis clavier) : moins de dependance a l'ordre des elements de la sidebar.
  await page.keyboard.press("Alt+6");
};

test("vue Reception : le panneau existe, le bon se receptionne, le stock monte",
     async ({ page, request }) => {
  const { article, documentId } = await seed(request);
  const avant = await solde(request, article.id);
  expect(Number.isNaN(avant)).toBe(false);

  await ouvrirAchats(page);

  // --- A. l'onglet « Reception » est dans le DOM --------------------------
  let vuOnglet = false;
  for (let i = 0; i < 60 && !vuOnglet; i++) {
    vuOnglet = await cliquer(page, ONGLET);
    if (!vuOnglet) await page.waitForTimeout(250);
  }
  if (!vuOnglet) {
    // Le message d'echec porte l'etat REEL de la page : sans lui, ce test
    // rougit en accusant le panneau d'etre absent alors que la cause peut etre
    // amont (landing non passee, licence, vue paresseee qui n'a jamais monte).
    const etat = await page.evaluate(() => ({
      url: location.href,
      boutons: Array.from(document.querySelectorAll("button")).slice(0, 40)
        .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean),
      titre: document.title,
      corps: (document.body?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 260),
    }));
    expect(false, "onglet Reception absent — etat de la page: " +
            JSON.stringify(etat)).toBe(true);
  }
  expect(vuOnglet, "l'onglet Reception est absent du panneau Achats").toBe(true);

  // --- B. le tableau du bon : fournisseur, designation, quantite commandee --
  await expect(page.getByText("Terre Azur Reception").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Pomme de Terre Reception").first()).toBeVisible();
  await expect(page.getByText(/25\s*kg/).first()).toBeVisible();

  // --- C. la ligne qui ne jointe plus rien est SIGNALEEE ------------------
  // Sans ce badge, l'operateur lit un bon de deux lignes et ne voit pas que
  // l'une ne rentrera jamais en stock : la faute d'origine etait invisible.
  const badgeHors = page.getByText(/hors inventaire/i).first();
  if (!(await badgeHors.count())) {
    // Le message porte le DOM reel de la ligne fautive : sans lui on accuserait
    // le badge d'etre absent alors que la cause peut etre la jointure elle-meme.
    const lignes = await page.evaluate(() =>
      Array.from(document.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").trim().replace(/\s+/g, " "))),
    );
    expect(false, "badge « hors inventaire » absent — lignes du bon: " +
            JSON.stringify(lignes)).toBe(true);
  }
  await expect(badgeHors).toBeVisible();

  // --- D. l'action « Receptionner » (puis sa confirmation) -----------------
  expect(await cliquer(page, ACTION),
         "le bouton Receptionner est absent du bon en attente").toBe(true);

  // ⚠ Le bouton de CONFIRMATION ne se choisit pas au libelle nu. Les deux
  // s'appellent « Réceptionner » (l'action de la ligne et confirmLabel du
  // ConfirmDialog) : un `find all buttons, first match` retombait sur celui de
  // la LIGNE, toujours present sous le dialogue. Le clic etait un no-op, le
  // stock restait fige a 3 au lieu de 28 — et l'echec se lisait comme un bug de
  // la reception, pas comme une faute de sélection. On juge donc la presence du
  // TITRE du dialogue dans l'ancetre du bouton (le dialogue a un titre unique,
  // le bouton de la ligne n'en a pas).
  const TITRE_DIALOGUE = /R[eé]ceptionner ce bon/i;
  const confirmer = async (): Promise<"ok" | "sans-dialogue" | "sans-bouton"> =>
    page.evaluate(
      ([titreSrc, boutonSrc]: [string, string]) => {
        const titre = new RegExp(titreSrc, "i");
        const rx = new RegExp(boutonSrc, "i");
        const btns = Array.from(document.querySelectorAll("button"));
        // 1. on ne prend un bouton que si SON ANCESTRE immediat de dialogue
        //    porte le titre : c'est ce qui distingue le bouton de l'action de
        //    celui de la confirmation.
        const cible = btns.find((b) => {
          if (!rx.test((b.textContent || "").trim().replace(/\s+/g, " "))) return false;
          const boite = b.closest("[role='dialog'], [class*='fixed']");
          const hote = boite || b.parentElement?.parentElement;
          return titre.test(hote?.textContent || "");
        });
        if (!cible) {
          const unDialogue = Array.from(document.querySelectorAll("body div")).some((d) =>
            titre.test((d.textContent || "").trim()),
          );
          return unDialogue ? ("sans-bouton" as const) : ("sans-dialogue" as const);
        }
        (cible as HTMLButtonElement).click();
        return "ok" as const;
      },
      [TITRE_DIALOGUE.source, ACTION.source],
    );

  let etatConf = "sans-dialogue" as "ok" | "sans-dialogue" | "sans-bouton";
  for (let i = 0; i < 40 && etatConf !== "ok"; i++) {
    etatConf = await confirmer();
    if (etatConf !== "ok") await page.waitForTimeout(250);
  }
  expect(etatConf, "le dialogue de confirmation (titre « Receptionner ce bon ? ») "
                 + "n'a pas presente son bouton d'action").toBe("ok");

  // Le mouvement de stock est la verification de la fonction, jugee cote API.
  let apres = NaN;
  for (let i = 0; i < 40 && Number.isNaN(apres); i++) {
    await page.waitForTimeout(250);
    const s = await solde(request, article.id);
    if (s !== avant) apres = s;
  }
  expect(apres).toBeCloseTo(avant + 25, 1e-6);

  // --- E. un bon receptionne ne se representationne pas -------------------
  await page.reload({ waitUntil: "domcontentloaded" });
  await ouvrirAchats(page);
  // Meme boucle qu'en A : la vue est paressee a la demande, son chunk peut
  // arriver apres l'entree. Une tentative unique jugerait un montage en cours.
  let revu = false;
  for (let i = 0; i < 60 && !revu; i++) {
    revu = await cliquer(page, ONGLET);
    if (!revu) await page.waitForTimeout(250);
  }
  expect(revu, "l'onglet Reception a disparu au rechargement").toBe(true);
  await expect(page.locator("text=/RECEIVED/i").first()).toBeVisible({ timeout: 15_000 });

  const plusDeBouton = await cliquer(page, ACTION);
  expect(plusDeBouton, "un bon deja receptionne offre encore un bouton d'action").toBe(false);

  // et le solde reste le meme malgre un second passage (idempotence complete)
  expect(await solde(request, article.id)).toBeCloseTo(avant + 25, 1e-6);
  void documentId;
});
