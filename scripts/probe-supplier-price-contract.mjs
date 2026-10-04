// Sonde du contrat ECRIT/LUE de POST /api/supplier-prices.
//
// Pourquoi cette route et pas une autre: c'est la seule voie d'ecriture dont le
// produit est lu par une DECISION. GET /api/supplier-prices/comparison designe
// le fournisseur au meilleur `calculated_price_per_ref` (ligne ~226: `< best ??
// Infinity`). Un prix devenu 0 ne rend donc pas un champ laid: il REND LE PRIX
// GRATUIT ET ELU MEILLEUR FOURNISSEUR. Le cuisinier achete en consequence.
//
// Ce que la sonde mesure, dans l'ordre, sur un serveur REEL (spawn tsx, port
// impose, garde d'identite confronte) -- aucune valeur n'est inventee par la
// sonde: les lignes sont creees puis RELUES par les routes de l'app.
//
//   S1  le prix ABSENT ou non numerique. La UI fait `parseFloat(champ)` -> NaN,
//       et JSON.stringify(NaN) rend `null` dans le JSON. Cote serveur:
//       `Number(null)` vaut 0 et `Number(undefined)` vaut NaN. Les deux
//       aboutissent a une ligne ecrite et un 200. Verdict cherche: le prix
//       stocke, et s'il vaut 0.
//   S2  un prix NEGATIF (le chef "rembourse"): accepte ou refuse, et ce que la
//       comparaison en fait.
//   S3  une UNITE hors table: backendGetCostModifier renvoie 1 pour tout
//       inconnu, donc "casier" est traite comme "kg" -> un facteur 1000 d'ecart
//       sur calculated_price_per_ref, sans bruit.
//   S4  un supplier_id qui n'existe pas: la cle etrangere n'est pas verifiee,
//       et GET /api/supplier-prices fait un JOIN suppliers -> la ligne
//       disparait SILENCIEUSEMENT de toute la liste (le client croit l'avoir
//       enregistree, elle est introuvable).
//   S5  la branche `if (id)`: UPDATE sur un id absent -> 0 ligne touchee, 200
//       rendu avec cet id. Le PASS creux consigne pour documents.ts, a la
//       meme adresse logique.
//   S6  la relecture: le corps de reponse porte-t-il la valeur REELLEMENT en
//       base (via GET), ou seulement ce que le client a envoye ?
//
// Rendu: des TOKENS et des CHIFFRES. Le rendu de ce poste altere les
// identifiants (piege consigne), donc le verdict ne se lit pas dans un tableau
// de noms.
import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-probe-spri");
const PORT = Number(process.env.PROBE_PORT || 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "probe-spri-" + Date.now().toString(36);

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
      // Identite desactivee : sonde de METIER (l'identite a sa porte verify:auth).
      COOKDRIVE_AUTH_OFF: "1",
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

  // .status est une PROPRIETE sur un fetch (undici): une methode, c'est un
  // TypeError avale par le catch, et la sonde rend "PLANTE" au lieu du verdict.
  const api = async (methode, chemin, corps) => {
    const r = await fetch(BASE + chemin, {
      method: methode,
      headers: { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { code: r.status, json };
  };

  const prixRelus = async () => {
    const r = await api("GET", "/api/supplier-prices");
    return Array.isArray(r.json) ? r.json : [];
  };

  try {
    let pret = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      try {
        const r = await fetch(`${BASE}/api/settings`,
          { headers: { "X-Cookdrive-Instance": TOKEN } });
        if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!pret) { console.log("RESULTATS SERVEUR_ABSENT=1"); process.exitCode = 2; return; }

    const T = [];
    const J = (v) => JSON.stringify(v);

    // --- semence: un fournisseur et un article qui EXISTENT -----------------
    const fournisseur = await api("POST", "/api/suppliers", { name: "Sonde Fourn A" });
    const sid = fournisseur.json?.id;
    const article = await api("POST", "/api/inventory", {
      name: "Sonde Pomme de Terre", quantity: 10, minStock: 1, unit: "kg",
      status: "ok", category: "Legume", unit_price: 2.5,
    });
    const iid = article.json?.id;
    T.push("SEM_FOURN=" + (typeof sid === "string" ? 1 : 0) + " SEM_ART=" + (typeof iid === "string" ? 1 : 0));
    if (typeof sid !== "string" || typeof iid !== "string") {
      console.log("RESULTATS " + T.join(" ")); return;
    }

    // --- S1: le prix absent, tel que la UI l'envoie (NaN -> null) ------------
    // JSON.stringify({x: Number.NaN}) produit `{"x":null}`: c'est le payload
    // REEL d'une saisie "3,5" refusée par parseFloat, pas un cas d'ecole.
    T.push("S1_JSON_NAN=" + (JSON.stringify({ p: Number.NaN }) === '{"p":null}' ? 1 : 0));
    const s1 = await api("POST", "/api/supplier-prices", {
      supplier_id: sid, inventory_id: iid, raw_unit_price: null, unit: "kg",
    });
    const lu1 = (await prixRelus()).find((p) => p.id === s1.json?.id);
    T.push("S1_CODE=" + s1.code + " S1_PRIX_STOCK=" + J(lu1?.raw_unit_price)
         + " S1_CALC=" + J(lu1?.calculated_price_per_ref));

    // --- S2: prix negatif ---------------------------------------------------
    const s2 = await api("POST", "/api/supplier-prices", {
      supplier_id: sid, inventory_id: iid, raw_unit_price: -12, unit: "kg",
    });
    const lu2 = (await prixRelus()).find((p) => p.id === s2.json?.id);
    T.push("S2_CODE=" + s2.code + " S2_PRIX_STOCK=" + J(lu2?.raw_unit_price));

    // --- S3: unite hors table -> facteur silencieusement faux ---------------
    // 1000 "g" valent 1 "kg": une unite inconnue traitee comme le defaut (1)
    // declare 1000 fois le prix de trop ou de moins.
    const aG = await api("POST", "/api/supplier-prices", {
      supplier_id: sid, inventory_id: iid, raw_unit_price: 1000, unit: "kg",
    });
    const aX = await api("POST", "/api/supplier-prices", {
      supplier_id: sid, inventory_id: iid, raw_unit_price: 1000, unit: "kaz",
    });
    const tous = await prixRelus();
    const kg = tous.find((p) => p.id === aG.json?.id);
    const kazz = tous.find((p) => p.id === aX.json?.id);
    T.push("S3_CODE=" + aX.code
         + " S3_CALC_KG=" + J(kg?.calculated_price_per_ref)
         + " S3_CALC_INCONNU=" + J(kazz?.calculated_price_per_ref));

    // --- S4: fournisseur fantome -> ligne invisile par JOIN -----------------
    const s4 = await api("POST", "/api/supplier-prices", {
      supplier_id: "fourn-qui-n-existe-pas", inventory_id: iid,
      raw_unit_price: 7, unit: "kg",
    });
    const apresS4 = await prixRelus();
    const visible = apresS4.some((p) => p.id === s4.json?.id);
    T.push("S4_CODE=" + s4.code + " S4_ID_RENDU=" + J(s4.json?.id)
         + " S4_VISIBLE_DANS_LA_LISTE=" + (visible ? 1 : 0));

    // --- S5: UPDATE sur un id absent ----------------------------------------
    const s5 = await api("POST", "/api/supplier-prices", {
      id: "prix-qui-n-existe-pas", supplier_id: sid, inventory_id: iid,
      raw_unit_price: 3, unit: "kg",
    });
    const compte = (await prixRelus()).filter((p) => p.id === "prix-qui-n-existe-pas").length;
    T.push("S5_CODE=" + s5.code + " S5_LIGNE_CREEE=" + compte);

    // --- S6: la comparaison elirait-elle un prix nul ? ----------------------
    // ⚠ Angle mort leve: la route rend `best_supplier_price` (la LIGNE elue) et
    // `best_price` (le nombre). La premiere version de cette sonde lisait
    // `best_supplier` — un champ qui n'existe pas — et rendait "?" en croyant
    // avoir juge l'election. Une sonde qui lit une cle inventee ne prouve rien,
    // elle rend seulement un vide qui ressemble a un verdict.
    const comp = await api("GET", "/api/supplier-prices/comparison");
    const groupe = (Array.isArray(comp.json) ? comp.json : [])
      .find((g) => g.inventory_id === iid);
    const elu = groupe?.best_supplier_price;
    T.push("S6_CODE=" + comp.code
         + " S6_CHAMPS=" + J(Object.keys(groupe || {}))
         + " S6_ELUE=" + J(elu ? { p: elu.raw_unit_price, c: elu.calculated_price_per_ref, u: elu.unit } : null)
         + " S6_MEILLEUR_PRIX=" + J(groupe?.best_price)
         + " S6_ECONOMIE_PCT=" + J(groupe?.savings_percent));

    console.log("RESULTATS " + T.join(" "));
  } finally {
    // Le fils est DETACHE : il est chef de son propre groupe. `child.kill` ne
    // vise que son pid, et le `tsx` qu'il a lui-même engendre lui survit (c'est
    // precisement le fils remanant qui a tenu 4321 pendant 20 minutes et fait
    // TIMEOUT la course suivante). `process.kill(-pid)` SIGKILL tout le groupe.
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    await new Promise((r) => child.on("exit", r));
    rmSync(OUT, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.log("RESULTATS PLANTE=1 DETAIL=" + String(e).replace(/\s+/g, " ").slice(0, 120));
  process.exitCode = 3;
});
