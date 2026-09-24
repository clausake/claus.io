// Sonde de la SECONDE voie d'ecriture des prix fournisseurs: import de mercuriale.
//
// POST /api/supplier-prices               -> saisie unitaire (contracte, jugee
//                                          par test/e2e/supplier-price-contract.spec.ts)
// POST /api/supplier-prices/import-confirm -> import CSV (Purchasing.tsx ~443)
//
// Les DEUX portes ecrivent les TROIS MEMES COLONNES (raw_unit_price, unit,
// calculated_price_per_ref) et debouchent sur le MEME liseur de decision:
// GET /api/supplier-prices/comparison designe le fournisseur au meilleur
// calculated_price_per_ref, et FichesTechniques.tsx (~1791) chiffre un devis
// « optimise » avec ce prix elu. Un contrat tenu sur une seule des deux portes
// est un PASS A VELO: c'est la lecon consignee dans PHASES.md (« une porte ne
// prouve que la voie qu'elle arpente; une assertion absente = angle mort
// consigne au vert »). Cette sonde arpente l'autre.
//
// Ce qu'elle MESURE (elle ne le suppose pas), sur un serveur REEL (spawn tsx,
// port impose, garde d'identite confrontee) -- aucune valeur jugée n'est
// inventee: les lignes sont POSEES par la route d'import puis RELUES par les
// voies de lecture de l'app (GET /api/supplier-prices + /comparison).
//
//   I1 supplier_id fantome: la cle etrangere n'est pas verifiee -> la ligne
//      part en base mais disparait du JOIN de GET (le client croit avoir importe)
//      ou, pire, reste visible et fausse la comparaison.
//   I2 prix NEGATIF accepte par l'import alors que la saisie unitaire le refuse
//      -> il est ELU au meilleur prix (le credit gagne).
//   I3 prix non numerique -> 0 (ingredient GRATUIT au devis du chef).
//   I4 article dont l'unite est une chaine VIDE: `inv ? inv.unit : "kg"` ne
//      couvre que l'absence de LIGNE, pas l'unite vide, et le convertisseur
//      renvoie 1 pour tout inconnu -> facteur 1000 en silence.
//   I5 le badge is_verified_from_invoice est FIGE a 0 par l'import: un tarif
//      releve sur facture ne peut donc jamais etre authentifie par cette voie.
//   I6 l'import ne verifie pas non plus l'appartenance de matched_inventory_id.
//
// Rendu en TOKENS (le rendu de ce poste altere les identifiants: un nombre
// survit, un nom de variable non).
import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import process from "node:process";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-probe-spri-import");
const PORT = Number(process.env.PROBE_PORT || 4331);
const BASE = "http://127.0.0.1:" + PORT;
const TOKEN = "probe-spri-import-" + Date.now().toString(36);

// La liberation prealable du port FIGE : sans elle, un fils remanant d'une
// course precedente tient le port, la boucle d'attente juge LE FILS REMANANT
// (qui porte le MEME jeton au regard du middleware) et la sonde SEM sur une
// instance qu'elle n'a pas installee (observe le 24/09 : la SEMENCE IDENTIQUE
// sur deux courses est le temoin du detache). L'echec franc sur un port pris
// (PORT_OCCUPE=1) est le verdict, jamais une attente qui tourne jusqu'au
// budget.
function portLibre(p) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(p, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

async function req(methode, chemin, corps) {
  const r = await fetch(BASE + chemin, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  // .status est une PROPRIETE sur un fetch (undici): appelee comme une methode
  // c'est un TypeError avale par le catch, et la sonde rend "PLANTE" au lieu du
  // verdict (piege consigne dans PHASES.md).
  return { code: r.status, json };
}

async function prixRelus() {
  const r = await req("GET", "/api/supplier-prices");
  return Array.isArray(r.json) ? r.json : [];
}

async function groupeDe(iid) {
  const r = await req("GET", "/api/supplier-prices/comparison");
  const liste = Array.isArray(r.json) ? r.json : [];
  return liste.find((g) => g.inventory_id === iid) ?? null;
}

// Le match tel que l'UI le renvoie: Purchasing.tsx poste `matches: importMatches`
// sans le retoucher (la route d'import ne relit que matched_inventory_id,
// raw_price et raw_unit).
function match(nom, prix, unit, iid) {
  return {
    raw_name: nom, raw_price: prix, raw_unit: unit,
    matched_inventory_id: iid, matched_inventory_name: nom, confidence: 0.9,
  };
}

function resumee(g) {
  const e = g && g.best_supplier_price;
  return e
    ? { p: e.raw_unit_price, c: e.calculated_price_per_ref, u: e.unit }
    : null;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  try {
    await portLibre(PORT);
  } catch {
    // LE FILS REMANANT TIENT LE PORT: la sonde JUGE QUI TIENT le port (le
    // GET /api/settings et son en-tete), puis rend NOMMEMENT (jeton rendu,
    // attendu). Un PORT_OCCUPE sans nom est un angle mort du capteur: le
    // verdict doit dire QUI, pas seulement QUE le port est pris. La voie est
    // celle de la spec routes.spec.ts (INSTANCE ETRANGERE sur divergence de
    // jeton, distinguée de « serveur pas pret » par le nom du jeton rendu).
    let jeton = null;
    try {
      const r = await fetch(BASE + "/api/settings", {
        headers: { "X-Cookdrive-Instance": TOKEN },
      });
      if (r.ok) jeton = r.headers.get("x-cookdrive-instance");
    } catch {}
    console.log("RESULTATS PORT_OCCUPE=1 PORT=" + PORT
      + " JETON_RENDU=" + JSON.stringify(jeton)
      + " JETON_ATTENDU=" + JSON.stringify(TOKEN));
    process.exitCode = 5;
    return;
  }
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: OUT,
      NODE_ENV: "production",
      COOKDRIVE_INSTANCE_TOKEN: TOKEN,
    },
    stdio: ["ignore", "ignore", "pipe"],
    // le fils part dans SA PROPRE session : un SIGKILL sur le leader emporte
    // tout l'arbre. Sans cela, un timeout du conducteur laissait ici un
    // `tsx server.ts` orphelin qui tenait le port et empoisonnait la course
    // suivante (observe le 23/09 : le LOT s'est arrete 20 min sur la sonde
    // suivante, bloque sur un serveur qui n'etait plus le sien).
    detached: true,
  });
  // EADDRINUSE sans handler laisse le process VIVANT sans servir : la boucle
  // d'attente tourne alors jusqu'au budget et le verdict est perdu.
  child.on("error", () => process.exit(6));
  const veilleur = setTimeout(() => {
    console.log("RESULTATS BUDGET_DEPASSE=1");
    process.exit(4);
  }, 150000);

  try {
    let pret = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      try {
        const r = await fetch(BASE + "/api/settings", {
          headers: { "X-Cookdrive-Instance": TOKEN },
        });
        if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!pret) { console.log("RESULTATS SERVEUR_ABSENT=1"); process.exitCode = 2; return; }

    const T = [];
    const J = (v) => JSON.stringify(v);

    // --- semence: un fournisseur, un article AU KG a 1000 (l'echelle qui rend
    //     I4 lisible), un article a l'unite VIDE (NOT NULL autorise "").
    const fourn = await req("POST", "/api/suppliers", { name: "Sonde Import A" });
    const sid = fourn.json && fourn.json.id;
    const art = await req("POST", "/api/inventory", {
      name: "Sonde Sel Fin Import", quantity: 10, minStock: 1, unit: "kg",
      status: "ok", category: "Epicerie", unit_price: 1000,
    });
    const iid = art.json && art.json.id;
    // ⚠ L'UNITÉ VIDE EST UNE DONNÉE HÉRITÉE, pas une saisie de l'écran: le
    //    contrat du POST /api/inventory REFUSE `unit: ""` (le garde du texte
    //    blanc), et l'UI n'envoie jamais cette forme. La voie LEGITIME est celle
    //    de la spec e2e supplier-import-contract.spec.ts (l.186-196): la route
    //    cree l'article proprement (unit: "kg"), puis le SEMIS DIRECT de
    //    bas-niveau lui met l'unité vide via open({filename, driver:
    //    sqlite3.Database}), et la semence est PROUVEE par pose.changes === 1.
    //    Poster `unit: ""` au POST (l'ancienne voie de cette sonde) rendait
    //    400 et la sonde rendait SEM_ART_SANS_UNITE=0 => rc=2 : INJOUABLE.
    const vide = await req("POST", "/api/inventory", {
      name: "Sonde Sel Sans Unite", quantity: 10, minStock: 1, unit: "kg",
      status: "ok", category: "Epicerie", unit_price: 1000,
    });
    const iidVide = vide.json && vide.json.id;
    // SEMIS DIRECT PROUVE (pose.changes === 1), jamais suppose: un UPDATE de
    // ZERO ligne rendrait SEM_ART_SANS_UNITE=0 (la semence sans objet).
    let poseUnitVide = -1;
    if (typeof iidVide === "string") {
      const dbLocal = await open({
        filename: join(OUT, "agent_culinaire.db"),
        driver: sqlite3.Database,
      });
      await dbLocal.run("PRAGMA busy_timeout = 8000");
      const pose = await dbLocal.run("UPDATE inventory SET unit = '' WHERE id = ?", [iidVide]);
      poseUnitVide = pose.changes ?? -1;
      await dbLocal.close();
    }
    const reluVide = (await req("GET", "/api/inventory")).json || [];
    const ligneVide = reluVide.find((x) => x.id === iidVide);
    T.push("SEM_FOURN=" + (typeof sid === "string" ? 1 : 0)
         + " SEM_ART=" + (typeof iid === "string" ? 1 : 0)
         + " SEM_ART_SANS_UNITE=" + (typeof iidVide === "string" ? 1 : 0)
         + " SEM_POSE_UNIT_VIDE=" + poseUnitVide
         + " CODES=" + [fourn.code, art.code, vide.code].join("/")
         + " UNITE_EN_BASE=" + J(ligneVide ? ligneVide.unit : "ABSENT"));
    if (typeof sid !== "string" || typeof iid !== "string" || typeof iidVide !== "string") {
      console.log("RESULTATS " + T.join(" "));
      process.exitCode = 2;
      return;
    }
    // La semence PROUVEE: pose.changes !== 1 est une semence sans objet — le
    // verdict porterait sur du vide (le piege des index « refuses par mesure »
    // sur des scans vides). La sortie est NOMMEE, jamais rendue comme absence.
    if (poseUnitVide !== 1 || !ligneVide || ligneVide.unit !== "") {
      console.log("RESULTATS " + T.join(" "));
      process.exitCode = 2;
      return;
    }

    // --- I1: cle etrangere fantome -----------------------------------------
    const n0 = (await prixRelus()).length;
    const i1 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: "fournisseur-qui-n-existe-pas",
      matches: [match("Sonde Sel Fin Import", 3, "kg", iid)],
    });
    const n1 = (await prixRelus()).length;
    T.push("I1_CODE=" + i1.code
         + " I1_PASS_A_VELO=" + (i1.code === 200 ? 1 : 0)
         + " I1_LIGNES_EN_BASE=" + (n1 - n0)
         + " I1_DANS_LA_LISTE=" + (n1 - n0));

    // --- I2: prix negatif, puis son ELECTION --------------------------------
    const n2 = (await prixRelus()).length;
    const i2 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      matches: [match("Sonde Sel Fin Import", -12, "kg", iid)],
    });
    const apres2 = await prixRelus();
    const l2 = apres2.find((p) => Number(p.raw_unit_price) === -12);
    const g2 = await groupeDe(iid);
    T.push("I2_CODE=" + i2.code
         + " I2_LIGNES_EN_BASE=" + (apres2.length - n2)
         + " I2_PRIX_STOCK=" + J(l2 && l2.raw_unit_price)
         + " I2_CALC=" + J(l2 && l2.calculated_price_per_ref)
         + " I2_ELUE=" + J(resumee(g2))
         + " I2_MEILLEUR_PRIX=" + J(g2 && g2.best_price)
         + " I2_ECONOMIE_PCT=" + J(g2 && g2.savings_percent));

    // --- I3: le VRAI flux de l'UI (analyse puis confirm), et non un payload
    //     invente par la sonde. Purchasing.tsx poste `matches: importMatches`
    //     sans le retoucher: or import-analyze fait `Number(raw_price) || 0`,
    //     donc un prix de CSV illisible lui rend 0 et c'est CE 0 que le chef
    //    valide a l'ecran puis que confirm ecrit. Poster le texte brut a confirm
    //     (autre cas, juge separement) ne prouverait pas ce chemin-la.
    const an = await req("POST", "/api/supplier-prices/import-analyze", {
      supplier_id: sid,
      items: [{ raw_name: "Sonde Sel Fin Import", raw_price: "trois virgule cinq", raw_unit: "kg" }],
    });
    const m0 = an.json && an.json.matches && an.json.matches[0];
    T.push("I3A_ANALYZE_CODE=" + an.code
         + " I3A_RAW_PRICE_RENDU=" + J(m0 && m0.raw_price)
         + " I3A_MATCH_OK=" + (m0 && m0.matched_inventory_id === iid ? 1 : 0));
    const n3 = (await prixRelus()).length;
    const i3 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      // le match RENVOYE par la route d'analyse, recopie tel quel (ce que fait
      // l'UI): raw_price y vaut deja 0 pour une saisie non numerique.
      matches: m0 ? [m0] : [],
    });
    const apres3 = await prixRelus();
    const l3 = apres3[apres3.length - 1];
    T.push("I3B_CODE=" + i3.code
         + " I3B_LIGNES_EN_BASE=" + (apres3.length - n3)
         + " I3B_ZERO_EC_RIT=" + (l3 && Number(l3.raw_unit_price) === 0 ? 1 : 0)
         + " I3B_PRIX_STOCK=" + J(l3 && l3.raw_unit_price)
         + " I3B_CALC=" + J(l3 && l3.calculated_price_per_ref));
    const g3 = await groupeDe(iid);
    T.push("I3B_ELUE=" + J(resumee(g3)) + " I3B_MEILLEUR_PRIX=" + J(g3 && g3.best_price)
         + " I3B_ECONOMIE_PCT=" + J(g3 && g3.savings_percent));
    // et le texte brut directement poste a confirm (le second sous-chemin)
    const i3c = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      matches: [match("Sonde Sel Fin Import", "trois virgule cinq", "kg", iid)],
    });
    T.push("I3C_TEXTE_BRUT_CODE=" + i3c.code);

    // --- I4: l'unite VIDE de l'article, jamais couverte par le defaut "kg" --
    const n4 = (await prixRelus()).length;
    const i4 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      // 1 pour "g" face a un article dont l'unite est "" : le vrai prix par
      // unite d'inventaire n'est PAS defensable (unite inconnue) et le
      // convertisseur, qui rend 1 pour tout inconnu, multiplie par 1000.
      matches: [match("Sonde Sel Sans Unite", 1, "g", iidVide)],
    });
    const apres4 = await prixRelus();
    const l4 = apres4[apres4.length - 1];
    const g4 = await groupeDe(iidVide);
    T.push("I4_CODE=" + i4.code
         + " I4_LIGNES_EN_BASE=" + (apres4.length - n4)
         + " I4_UNITE_STOCK=" + J(l4 && l4.unit)
         + " I4_PRIX_STOCK=" + J(l4 && l4.raw_unit_price)
         + " I4_CALC=" + J(l4 && l4.calculated_price_per_ref)
         + " I4_FACTEUR_X1000=" + (l4 && Number(l4.calculated_price_per_ref) === 1000 ? 1 : 0)
         + " I4_NULL_AVEU=" + (l4 && l4.calculated_price_per_ref === null ? 1 : 0)
         + " I4_ELUE=" + J(resumee(g4))
         + " I4_MEILLEUR_PRIX=" + J(g4 && g4.best_price)
         + " I4_ECONOMIE_PCT=" + J(g4 && g4.savings_percent));

    // --- I5: le badge de verification par facture, fige par l'import --------
    const n5 = (await prixRelus()).length;
    const i5 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      matches: [match("Sonde Sel Fin Import", 777, "kg", iid)],
    });
    const apres5 = await prixRelus();
    const l5 = apres5.find((p) => Number(p.raw_unit_price) === 777);
    T.push("I5B_CODE=" + i5.code
         + " I5B_LIGNES_EN_BASE=" + (apres5.length - n5)
         + " I5B_IMPORT_VERIFIE=" + J(l5 && l5.is_verified_from_invoice)
         + " I5B_PAYLOAD_BAGAGE=" + J((await req("POST", "/api/supplier-prices/import-confirm", {
             supplier_id: sid,
             matches: [Object.assign(match("Sonde Sel Fin Import", 778, "kg", iid),
                                      { is_verified_from_invoice: true, valid_until: "2099-01-01" })],
           })).code));

    // --- I6: matched_inventory_id fantome ----------------------------------
    const n6 = (await prixRelus()).length;
    const i6 = await req("POST", "/api/supplier-prices/import-confirm", {
      supplier_id: sid,
      matches: [match("Sonde Fantome", 9, "kg", "article-qui-n-existe-pas")],
    });
    const apres6 = await prixRelus();
    const l6 = apres6.find((p) => Number(p.raw_unit_price) === 9);
    T.push("I6_CODE=" + i6.code
         + " I6_LIGNES_EN_BASE=" + (apres6.length - n6)
         + " I6_LIGNE_FANTOME_EN_BASE=" + (l6 ? 1 : 0)
         + " I6_DANS_LA_LISTE=" + (apres6.length - n6));

    console.log("RESULTATS " + T.join(" "));
  } finally {
    clearTimeout(veilleur);
    // Le fils est DETACHE : il est chef de son propre groupe. `child.kill` ne
    // vise que son pid, et le `tsx` qu'il a lui-même engendre lui survit (c'est
    // precisement le fils remanant qui a tenu 4331 pendant 20 minutes et fait
    // TIMEOUT la course suivante). `process.kill(-pid)` SIGKILL tout le groupe.
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    await Promise.race([
      new Promise((r) => child.on("exit", r)),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    rmSync(OUT, { recursive: true, force: true });
  }
}

main().then(() => {
  // Une sortie implicite peut rester accroclee a un descripteur de tube non
  // draine (stderr du fils en "pipe"): le harnais rendrait un timeout, lu comme
  // une mutation qui mord, alors que rien n'a ete juge. Sortie explicite.
  process.exit(process.exitCode || 0);
}).catch((e) => {
  console.log("RESULTATS PLANTE=1 DETAIL=" + String(e).replace(/\s+/g, " ").slice(0, 200));
  process.exitCode = 3;
  process.exit(3);
});
