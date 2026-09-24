// Sonde de la TROISIEME voie d'ecriture des prix fournisseurs: la validation de
// facture (POST /api/documents puis /api/documents/:id/validate).
//
// POURQUOI ELLE EXISTE, EN TANT QUE SONDE: le lot a d'abord contracte la voie
// unitaire (POST /api/supplier-prices), puis la voie d'import (import-confirm).
// La preuve negative de la voie unitaire a rendu `M7 ... rc=0`: le predicat
// d'election `v >= 0` ne pouvait pas rougir, car AUCUNE des deux portes connues
// n'left passer de prix negatif jusqu'a la comparaison. Un garde que nul ne
// peut atteindre n'est pas un garde tort: c'est une voie de commande QUI MANQUE
// a la mesure (PHASES.md: « une porte ne prouve que la voie qu'elle arpente »).
// En cherchant cette voie, src/routes/documents.ts:199-215 est apparu: la
// validation d'une FACTURE ecrit dans supplier_prices avec `Number(item.unit_price)`
// SANS AUCUN GARDE et force `is_verified_from_invoice = 1`.
//
// Ce qu'elle MESURE (elle ne le suppose pas), sur un serveur REEL:
//   D1 un document dont une ligne porte unit_price = -12: est-elle ecrite dans
//      supplier_prices, et avec quel badge de verification? (Le badge 1 est
//      justement ce sur quoi le chef CROIT le tarif: « releve sur facture ».)
//   D2 ce prix negatif est-il ELU par GET .../comparison (le credit gagne) et
//      quelle economie l'ecran affiche-t-il?
//   D3 un unit_price NON NUMERIQUE ("trois virgule cinq"): Number() rend NaN;
//      que stocke SQLite, et la ligne entre-t-elle quand même?
//   D4 le nom du fournisseur cre un fournisseur PAR NOM si inconnu (la voie le
//      fait elle-même): un nom mal saisi cree-t-il un fournisseur fantome?
//
// Rendu en TOKENS (le rendu de ce poste altere les identifiants).
import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-probe-docs-validate");
const PORT = Number(process.env.PROBE_PORT || 4351);
const BASE = "http://127.0.0.1:" + PORT;
const TOKEN = "probe-docs-validate-" + Date.now().toString(36);

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

const resumee = (g) => (g && g.best_supplier_price
  ? { p: g.best_supplier_price.raw_unit_price, c: g.best_supplier_price.calculated_price_per_ref, v: g.best_supplier_price.is_verified_from_invoice }
  : null);

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
  const veilleur = setTimeout(() => { console.log("RESULTATS BUDGET_DEPASSE=1"); process.exit(4); }, 150000);

  try {
    let pret = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      try {
        const r = await fetch(BASE + "/api/settings", { headers: { "X-Cookdrive-Instance": TOKEN } });
        if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!pret) { console.log("RESULTATS SERVEUR_ABSENT=1"); process.exitCode = 2; return; }

    const T = [];
    const J = (v) => JSON.stringify(v);

    const art = await req("POST", "/api/inventory", {
      name: "Sonde Farine D300", quantity: 5, minStock: 1, unit: "kg",
      status: "ok", category: "Epicerie", unit_price: 3,
    });
    const iid = art.json && art.json.id;
    T.push("SEM_ART=" + (typeof iid === "string" ? 1 : 0) + " ART_CODE=" + art.code);
    if (typeof iid !== "string") { console.log("RESULTATS " + T.join(" ")); process.exitCode = 2; return; }

    // --- D1/D2: la ligne de facture a un MONTANT NEGATIF --------------------
    const n0 = (await prixRelus()).length;
    const d1 = await req("POST", "/api/documents", {
      type: "FACTURE", supplier: "Sonde Fourn Facture D", date: "2026-01-09",
      total_amount: -12,
      items: [{ inventory_id: iid, original_name: "Sonde Farine D300", quantity: 4, unit_price: -12 }],
    });
    const docId = d1.json && d1.json.id;
    const d1v = await req("POST", "/api/documents/" + encodeURIComponent(String(docId)) + "/validate", undefined);
    const apres1 = await prixRelus();
    const l1 = apres1[apres1.length - 1];
    const g1 = await groupeDe(iid);
    T.push("D1_DOC_CODE=" + d1.code
         + " D1_VALIDE_CODE=" + d1v.code
         + " D1_LIGNES_EN_BASE=" + (apres1.length - n0)
         + " D1_PRIX_STOCK=" + J(l1 && l1.raw_unit_price)
         + " D1_CALC=" + J(l1 && l1.calculated_price_per_ref)
         + " D1_BADGE_VERIFIE=" + J(l1 && l1.is_verified_from_invoice)
         + " D1_ELUE=" + J(resumee(g1))
         + " D1_MEILLEUR_PRIX=" + J(g1 && g1.best_price)
         + " D1_ECONOMIE_PCT=" + J(g1 && g1.savings_percent));

    // --- D3: un montant NON NUMERIQUE ---------------------------------------
    const n2 = (await prixRelus()).length;
    const d2 = await req("POST", "/api/documents", {
      type: "FACTURE", supplier: "Sonde Fourn Facture D", date: "2026-01-09",
      total_amount: 0,
      items: [{ inventory_id: iid, original_name: "Sonde Farine D300", quantity: 2, unit_price: "trois virgule cinq" }],
    });
    const docId2 = d2.json && d2.json.id;
    const d2v = await req("POST", "/api/documents/" + encodeURIComponent(String(docId2)) + "/validate", undefined);
    const apres2 = await prixRelus();
    const l2 = apres2[apres2.length - 1];
    T.push("D3_DOC_CODE=" + d2.code
         + " D3_VALIDE_CODE=" + d2v.code
         + " D3_LIGNES_EN_BASE=" + (apres2.length - n2)
         + " D3_PRIX_STOCK=" + J(l2 && l2.raw_unit_price)
         + " D3_CALC=" + J(l2 && l2.calculated_price_per_ref)
         + " D3_EST_NULL=" + (l2 && l2.raw_unit_price === null ? 1 : 0));

    // --- D4: le fournisseur cree PAR NOM --------------------------------------
    const avt = await req("GET", "/api/suppliers");
    const avant = Array.isArray(avt.json) ? avt.json : (avt.json && avt.json.items) || [];
    const d4 = await req("POST", "/api/documents", {
      type: "FACTURE", supplier: "   ", date: "2026-01-09", total_amount: 5,
      items: [{ inventory_id: iid, original_name: "Sonde Farine D300", quantity: 1, unit_price: 5 }],
    });
    const d4v = await req("POST", "/api/documents/" + encodeURIComponent(String(d4.json && d4.json.id)) + "/validate", undefined);
    const apt = await req("GET", "/api/suppliers");
    const apres = Array.isArray(apt.json) ? apt.json : (apt.json && apt.json.items) || [];
    T.push("D4_DOC_CODE=" + d4.code
         + " D4_VALIDE_CODE=" + d4v.code
         + " D4_FOURNISSEURS=" + avant.length + "/" + apres.length
         + " D4_BLANC_CREE_UN_FOURNISSEUR=" + (apres.length > avant.length ? 1 : 0));

    console.log("RESULTATS " + T.join(" "));
  } finally {
    clearTimeout(veilleur);
    // Le fils est DETACHE : il est chef de son propre groupe. `child.kill` ne
    // vise que son pid, et le `tsx` qu'il a lui-même engendre lui survit (c'est
    // precisement le fils remanant qui a tenu 4351 pendant 20 minutes et fait
    // TIMEOUT la course suivante). `process.kill(-pid)` SIGKILL tout le groupe.
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    await Promise.race([
      new Promise((r) => child.on("exit", r)),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    rmSync(OUT, { recursive: true, force: true });
  }
}

main().then(() => process.exit(process.exitCode || 0)).catch((e) => {
  console.log("RESULTATS PLANTE=1 DETAIL=" + String(e).replace(/\s+/g, " ").slice(0, 200));
  process.exit(3);
});
