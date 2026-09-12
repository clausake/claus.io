// Routes : Prix fournisseurs (import, comparaison)
import { Router } from "express";
import type { Database } from "sqlite";
import {
  calculatePricePerRef,
  estConvertible,
  lireBooleen,
  REJETE_BOOLEAN,
} from "../shared/util.js";

interface InvItem {
  id: string;
  name: string;
  unit: string;
}

interface SupplierPriceRow {
  id: string;
  supplier_id: string;
  inventory_id: string;
  raw_unit_price: number;
  unit: string;
  calculated_price_per_ref: number | null;
  is_verified_from_invoice: number;
  valid_until: string | null;
  supplier_name: string;
  inventory_name: string;
  inventory_unit: string;
  inventory_unit_price?: number | null;
}

export default function createRouter(db: Database) {
  const router = Router();

// Supplier Prices API
router.get("/api/supplier-prices", async (req, res) => {
try {
  const prices = await db.all(`
    SELECT sp.*, s.name as supplier_name, i.name as inventory_name, i.unit as inventory_unit
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    JOIN inventory i ON sp.inventory_id = i.id
    ORDER BY i.name ASC, sp.calculated_price_per_ref ASC
  `);
  res.json(prices);
} catch (error) {
  console.error("Error fetching supplier prices:", error);
  res.status(500).json({ status: "error", message: "Failed to fetch supplier prices" });
}
});

router.post("/api/supplier-prices", async (req, res) => {
try {
  // Contrat ECRIT/LUE de la voie d'ecriture des prix fournisseurs.
  //
  // Six defauts, tous MESURES sur un serveur REEL par
  // scripts/probe-supplier-price-contract.mjs AVANT ce correctif:
  //   S1_CODE=200 S1_PRIX_STOCK=0            le prix absent devenait GRATUIT
  //   S2_CODE=200 S2_PRIX_STOCK=-12          un prix negatif etait accepte
  //   S3_CALC_KG=1000 S3_CALC_INCONNU=1000   une unite inconnue valait "kg"
  //   S4_CODE=200 S4_VISIBLE_DANS_LA_LISTE=0 cle etrangere non verifiee
  //   S5_CODE=200 S5_LIGNE_CREEE=0           UPDATE de 0 ligne = un succes rendu
  //   S6_ELUE={"p":-12} S6_MEILLEUR_PRIX=-12 S6_ECONOMIE_PCT=580
  //
  // S6 est ce qui rend cette route plus chere que les autres ecritures du
  // projet: GET /api/supplier-prices/comparison DESIGNNE le fournisseur au
  // meilleur calculated_price_per_ref. Un prix a 0 ou negatif n'est donc pas
  // un champ laid: il DEVIENT LE MEILLEUR FOURNISSEUR et l'ecran affiche une
  // economie inventee (580 % mesure pour un article dont la reference est
  // 2,5). Le cuisinier achete en consequence.
  const { id, supplier_id, inventory_id, raw_unit_price, unit, valid_until, is_verified_from_invoice } = req.body;
  const refused: string[] = [];

  // 1) CLE ETRANGERE VERIFIEE. Sans ce garde la ligne part en base mais ne
  //    survit pas au JOIN du GET: le client croit avoir enregistre, la
  //    valeur est perdue SANS ERREUR (S4: un id rendu, une ligne introuvable).
  const fournisseur = await db.get("SELECT id FROM suppliers WHERE id = ?", [supplier_id]);
  if (!fournisseur) refused.push("supplier_id");
  const inv: { unit: string | null } | undefined = await db.get(
    "SELECT unit FROM inventory WHERE id = ?", [inventory_id]);
  if (!inv) refused.push("inventory_id");

  // 2) LE PRIX EST UN NOMBRE, BORNE, FINI. Le trou par lequel 0 entrait:
  //    la UI fait parseFloat(champ) -> NaN, JSON.stringify(NaN) rend `null`
  //    dans le corps envoye, et cote serveur Number(null) vaut 0 (alors que
  //    Number(undefined) vaut NaN). Un prix OUBLIE devenait un prix GRATUIT,
  //    et non une erreur. Une chaine ("2,50", que parseFloat casse en 2) est
  //    REFUSEE au lieu d'etre arrondie en silence: un tarif fournisseur
  //    arrondi est un tarif faux qui a l'air saisi.
  let prix: number;
  if (typeof raw_unit_price === "number") prix = raw_unit_price;
  else if (typeof raw_unit_price === "string" && raw_unit_price.trim() !== "") prix = Number(raw_unit_price);
  else { prix = Number.NaN; refused.push("raw_unit_price"); }
  // Le plancher a 0 est LA regle qui rend S6 impossible: un credit n'est pas
  // un prix, et un credit remporte la comparaison au meilleur prix a chaque fois.
  if (Number.isNaN(prix) || prix < 0 || prix > 1_000_000) refused.push("raw_unit_price");

  // 3) L'UNITE EST UNE UNITE, PAS UNE CHAINE LIBRE. Le convertisseur renvoie
  //    1 pour TOUT inconnu, donc "kaz" se comportait comme "kg". On ne ferme
  //    PAS un enum: la saisie reelle vient d'une facture ("bouteille",
  //    "pce", "casier") et une liste autorisee rejetterait le cuisinier avec
  //    un 400 impeccable. On refuse seulement ce qui n'est pas nomme, et on
  //    cesse de PRONDRE un prix par reference quand la conversion n'est pas
  //    defendable: le null rendu ici est un aveu, pas un bug.
  const uniteFournisseur = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  if (uniteFournisseur === "") refused.push("unit");
  const uniteInventaire = String(inv?.unit ?? "");
  const defendable = estConvertible(uniteFournisseur, uniteInventaire);
  const calculated_price_per_ref = defendable
    ? calculatePricePerRef(prix, uniteFournisseur, uniteInventaire)
    : null;

  // valid_until: du texte libre dans une colonne de date est un tri de
  // validite qui devient faux en silence. Seule la forme ISO du
  // <input type="date"> de la UI est acceptee, ou rien.
  const finValidite = typeof valid_until === "string" && valid_until.trim() !== ""
    ? valid_until.trim() : null;
  if (finValidite !== null && !/^\d{4}-\d{2}-\d{2}$/.test(finValidite)) refused.push("valid_until");

  // is_verified_from_invoice etoit `x ? 1 : 0`. Or la chaine "false" est
  // VRAIE en JavaScript: une forme HTML ou un hidden transformait un prix
  // NON verifie en prix VERIFIE. Ce badge est justement ce sur quoi le chef
  // decide de faire confiance au tarif releve sur facture.
  const verife = lireBooleen(is_verified_from_invoice);
  if (verife === REJETE_BOOLEAN) refused.push("is_verified_from_invoice");

  if (refused.length > 0) {
    // Un refus NOMME: un 400 muet fait perdre la saisie du cuisinier sans
    // qu'il sache quoi corriger.
    return res.status(400).json({
      status: "error",
      message: "Champs refuses",
      refused: Array.from(new Set(refused)),
    });
  }

  const prixDemande = typeof id === "string" && id !== "" ? id : null;
  let resultat;
  let priceId = prixDemande;
  if (prixDemande !== null) {
    resultat = await db.run(
      "UPDATE supplier_prices SET supplier_id = ?, inventory_id = ?, raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, valid_until = ?, is_verified_from_invoice = ? WHERE id = ?",
      [supplier_id, inventory_id, prix, uniteFournisseur, calculated_price_per_ref, finValidite, verife, prixDemande]);
    // Temoin INDEPENDANT du corps de reponse: un UPDATE de 0 ligne n'est pas
    // une reussite, meme si tout le reste du payload etoit parfait (S5).
    if (resultat?.changes !== 1) {
      return res.status(404).json({ status: "error", message: "Prix fournisseur introuvable" });
    }
  } else {
    const genere = Date.now().toString() + Math.random().toString().substring(2, 7);
    resultat = await db.run(
      "INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, valid_until, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [genere, supplier_id, inventory_id, prix, uniteFournisseur, calculated_price_per_ref, finValidite, verife]);
    if (resultat?.changes !== 1) {
      return res.status(500).json({ status: "error", message: "Le prix n'a pas ete enregistre" });
    }
    priceId = genere;
  }

  // La reponse ne RECITE pas le client: elle RELIT la ligne en base. Une
  // reponse qui pretend avoir mis ce qui avoit ete envoye cache toute
  // ecraserie entre le payload et la colonne.
  const relu = await db.get(
    "SELECT id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, valid_until, is_verified_from_invoice FROM supplier_prices WHERE id = ?",
    [priceId]);
  res.json({
    status: "success",
    id: priceId,
    item: relu,
    // L'ecran peut marquer la ligne « non comparable » au lieu de l'aligner
    // contre les autres dans la comparaison des fournisseurs.
    prix_par_reference_defendable: defendable,
  });
} catch (error) {
  console.error("Error saving supplier price:", error);
  res.status(500).json({ status: "error", message: "Failed to save supplier price" });
}
});

router.delete("/api/supplier-prices/:id", async (req, res) => {
try {
  await db.run("DELETE FROM supplier_prices WHERE id = ?", [req.params.id]);
  res.json({ status: "success" });
} catch (error) {
  console.error("Error deleting supplier price:", error);
  res.status(500).json({ status: "error", message: "Failed to delete supplier price" });
}
});

router.post("/api/supplier-prices/import-analyze", async (req, res) => {
try {
  const { supplier_id, items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ status: "error", message: "items must be an array" });
  }
  const inventory = await db.all("SELECT id, name, unit FROM inventory");
  
  const fuzzyMatch = (importedName: string, inventoryItems: InvItem[]) => {
    const normImported = importedName.toLowerCase().trim();
    const cleanTokens = (str: string) =>
      str.toLowerCase().replace(/[^\w\s\u00C0-\u00FF]/g, " ").split(/\s+/).filter(Boolean);

    const importedTokens = cleanTokens(normImported);
    if (importedTokens.length === 0) return null;

    let bestMatch: InvItem | null = null;
    let highestScore = -1;
    
    for (const item of inventoryItems) {
      const itemTokens = cleanTokens(item.name);
      if (itemTokens.length === 0) continue;
      
      const matchCount = itemTokens.filter(tok => importedTokens.includes(tok)).length;
      const score = matchCount / itemTokens.length;
      const isSubstring = normImported.includes(item.name.toLowerCase());
      const finalScore = score + (isSubstring ? 0.5 : 0);
      
      if (matchCount > 0 && finalScore > highestScore) {
        highestScore = finalScore;
        bestMatch = item;
      }
    }
    return bestMatch ? { item: bestMatch, confidence: highestScore } : null;
  };

  const results = items.map((itm) => {
    const match = fuzzyMatch(itm.raw_name || "", inventory);
    // LE TROU EN AMONT DE L'IMPORT (mesure I3A/I3B par
    // scripts/probe-supplier-import-contract.mjs): l'ancien code faisait
    // `Number(itm.raw_price) || 0`. Un prix de CSV illisible ("trois virgule
    // cinq", une ligne de pied de page, une unite collee au montant) devenait
    // donc UN PRIX DE 0, presente au chef comme une ligne VALIDE a cocher; le
    // chef le validait a l'ecran et import-confirm l'ECRIVAIT. Le produit est
    // lu par une DECISION: la comparaison ELIT ce 0 (mesure:
    // I3B_ELUE={"p":0,"c":0,"u":"kg"} I3B_MEILLEUR_PRIX=0 I3B_ECONOMIE_PCT=100)
    // et FichesTechniques compte alors UN INGREDIENT GRATUIT au devis.
    //
    // Donc l'analyse ne FABRIQUE PLUS de nombre quand il n'y en a pas: elle
    // rend `null` + un drapeau, et c'est import-confirm qui refuse la ligne et
    // la NOMME. Le 0 legitime ("ce produit est offert") reste un nombre saisi,
    // pas le residu d'un parseFloat rate: il est accepte par la voie d'ecriture
    // unitaire et par celle-ci, sans etre invente ici.
    const brutPrix = itm.raw_price;
    let prix: number | null;
    if (typeof brutPrix === "number") prix = Number.isFinite(brutPrix) ? brutPrix : null;
    else if (typeof brutPrix === "string" && brutPrix.trim() !== "") {
      // La virgule decimale est LEGITIME ici et non toleree en silence: c'est
      // ce que la PROPRE voie d'import de l'UI applique avant de parser
      // (src/components/Purchasing.tsx ~408: `line[priceIdx]?.replace(',', '.')`).
      // Refuser "3,50" ici jetterait le poste de travail du cuisinier; le
      // convertir est une PARITE avec l'UI, pas un arrondis.
      const normalise = brutPrix.trim().replace(/\s+/g, "").replace(",", ".");
      const n = Number(normalise);
      prix = normalise !== "" && Number.isFinite(n) ? n : null;
    } else prix = null;
    return {
      raw_name: itm.raw_name,
      raw_price: prix,
      // Un aveu lisible pour l'ecran: la ligne reste visible (le chef doit voir
      // qu'elle etait dans le fichier) mais elle n'est PAS cochable comme un prix.
      prix_exploitable: prix !== null,
      motif_rejet: prix === null ? "prix_non_numerique" : null,
      raw_unit: itm.raw_unit || "kg",
      matched_inventory_id: match ? match.item.id : null,
      matched_inventory_name: match ? match.item.name : null,
      confidence: match ? match.confidence : 0
    };
  });
  res.json({ status: "success", matches: results });
} catch (error) {
  console.error("Error analyzing import:", error);
  res.status(500).json({ status: "error", message: "Failed to analyze import items" });
}
});

router.post("/api/supplier-prices/import-confirm", async (req, res) => {
try {
  // Contrat ECRIT/LUE de la SECONDE voie d'ecriture des prix fournisseurs.
  //
  // CONTRAT_IMPORT_POUSE : le contrat de POST /api/supplier-prices avait ete
  // contracte SANS cette porte, alors qu'elle ecrit les TROIS MEMES
  // COLONNES (raw_unit_price, unit, calculated_price_per_ref) et debouche
  // sur le MEME liseur de decision: GET .../comparison designe le
  // fournisseur au meilleur calculated_price_per_ref et
  // src/components/FichesTechniques.tsx chiffre un devis « optimise »
  // dessus. Une porte ne prouve que la voie qu'elle arpente (PHASES.md).
  //
  // Six defauts MESURES par scripts/probe-supplier-import-contract.mjs
  // AVANT ce correctif (verdicts reproduits dans PHASES.md):
  //   I1/I6  un 200 sur cle etrangere fantome, avec 0 ligne en base:
  //          le client croit avoir importe, la donnee est perdue SANS
  //          ERREUR (le JOIN du GET avale la ligne).
  //   I2   un prix NEGATIF ecrit par l'import (la saisie unitaire, elle,
  //          le refusait).
  //   I3   import-analyze fait `Number(x) || 0`: un prix de CSV
  //          illisible devient 0, est VALIDE a l'ecran par le chef, puis
  //          ecrit -> UN INGREDIENT GRATUIT au devis.
  //   I4   `inv ? inv.unit : "kg"` ne couvre que l'ABSENCE DE LIGNE, pas
  //          l'unite VIDE: le convertisseur rend 1 pour tout inconnu et
  //          le prix part MULTIPLIE PAR MILLE en silence.
  //
  // Le reglage, en trois etats (jamais un booleen):
  //   - faute de LOT (fournisseur absent/inexistant, matches non liste):
  //     400 qui NOMME les champs;
  //   - ligne non exploitable (prix absent/negatif/hors plage/texte,
  //     unite vide, article inexistant, ligne non appariee): elle est
  //     IGNOREE ET NOMMEE (index + raison) dans la reponse, jamais muette;
  //   - zero ligne ecrite n'est JAMAIS un succes (400, pas un 200).
  const { supplier_id, matches } = req.body;

  // 1) FAUTE DE LOT -> 400 NOMME. Un 400 muet fait perdre la saisie du
  //    cuisinier sans qu'il sache quoi corriger.
  const refused: string[] = [];
  if (!Array.isArray(matches)) refused.push("matches");
  const fournisseurCle = typeof supplier_id === "string" ? supplier_id.trim() : "";
  if (fournisseurCle === "") refused.push("supplier_id");
  if (refused.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Champs refuses",
      refused: Array.from(new Set(refused)),
    });
  }

  // 2) LA CLE ETRANGERE EST VERIFIEE AVANT TOUTE ECRITURE (I1). Sans ce
  //    garde la transaction « reussit » et rien ne survit au JOIN de GET.
  const fournisseur = await db.get("SELECT id FROM suppliers WHERE id = ?", [fournisseurCle]);
  if (!fournisseur) {
    return res.status(400).json({
      status: "error",
      message: "Fournisseur inconnu : l'import n'a rien ecrit.",
      refused: ["supplier_id"],
    });
  }

  // 3) CHAQUE LIGNE EST JUGEE CONTRE CE QUE LA ROUTE D'ANALYSE Y DEPOSE
  //    REELLEMENT (raw_price peut deja valoir 0: I3) et contre l'unite
  //    REELLEMENT en base (I4). Une ligne invalide est NOMMEE, pas tue.
  const aEcrire: Array<{ iid: string; prix: number; unit: string; calc: number | null }> = [];
  const rejetees: Array<{ index: number; raison: string }> = [];
  for (const [index, brut] of (matches as Array<any>).entries()) {
    const m = (brut ?? {}) as Record<string, unknown>;
    const iid = typeof m.matched_inventory_id === "string"
      ? (m.matched_inventory_id as string).trim() : "";
    if (iid === "") { rejetees.push({ index, raison: "article_non_apparie" }); continue; }
    // I6: un matched_inventory_id qui n'existe plus (le chef a valide
    //    l'appariement vingt minutes plus tot) n'est pas une donnee.
    const inv = await db.get("SELECT unit FROM inventory WHERE id = ?", [iid]);
    if (!inv) { rejetees.push({ index, raison: "article_inexistant" }); continue; }

    // I3 + I2: le prix est un NOMBRE, BORNE, FINI. Une chaine non numerique
    // n'est PAS convertie en 0: `Number(x) || 0` etait exactement le trou par
    // lequel le gratuit entrait. Les DEUX raisons sont distinguees car le chef
    // ne corrige pas la meme chose: « votre cellule n'est pas un montant »
    // n'est pas « votre montant est hors plage ».
    let prix: number;
    if (typeof m.raw_price === "number") prix = m.raw_price;
    else if (typeof m.raw_price === "string" && (m.raw_price as string).trim() !== "")
      prix = Number(m.raw_price);
    else { rejetees.push({ index, raison: "prix_absent" }); continue; }
    if (Number.isNaN(prix)) {
      rejetees.push({ index, raison: "prix_non_numerique" });
      continue;
    }
    if (!Number.isFinite(prix) || prix < 0 || prix > 1_000_000) {
      rejetees.push({ index, raison: "prix_invalide" });
      continue;
    }

    // I4: l'unite est une UNITE. Le defaut "kg" de l'ancien code masquait
    //    l'absence; on ne PROND plus un prix par reference quand la
    //    conversion n'est pas defendable: null est un aveu lisible.
    const unitFournisseur = typeof m.raw_unit === "string"
      ? (m.raw_unit as string).trim().toLowerCase() : "";
    if (unitFournisseur === "") { rejetees.push({ index, raison: "unite_absente" }); continue; }
    const unitInventaire = String(inv?.unit ?? "");
    const defendable = estConvertible(unitFournisseur, unitInventaire);
    const calc = defendable
      ? calculatePricePerRef(prix, unitFournisseur, unitInventaire)
      : null;
    aEcrire.push({ iid, prix, unit: unitFournisseur, calc });
  }

  // 4) ZERO LIGNE N'EST PAS UNE REUSSITE (famille S5 de la voie unitaire).
  //    Le 200 sur un import vide etait un PASS creux pour le bouton
  //    « Importer la mercuriale ».
  if (aEcrire.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Aucune ligne de tarif exploitable : rien n'a ete importe.",
      refused: ["matches"],
      rejetees,
    });
  }

  await db.run("BEGIN TRANSACTION");
  try {
    let ecrites = 0;
    for (const ligne of aEcrire) {
      const existing = await db.get(
        "SELECT id FROM supplier_prices WHERE supplier_id = ? AND inventory_id = ?",
        [fournisseurCle, ligne.iid],
      );
      let resultat;
      if (existing) {
        // is_verified_from_invoice repart a 0: une mercuriale n'est pas
        // une verification sur facture. Le sens est CONSERVATEUR (elle
        // RETIRE la confiance, elle ne la FABRIQUE pas) — c'est ce que la
        // sonde I5B verifie: un badge porte dans le payload ne peut pas
        // remonter la ligne par cette voie.
        resultat = await db.run(
          "UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 0 WHERE id = ?",
          [ligne.prix, ligne.unit, ligne.calc, existing.id],
        );
      } else {
        const priceId = Date.now().toString() + Math.random().toString().substring(2, 7);
        resultat = await db.run(
          "INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, 0)",
          [priceId, fournisseurCle, ligne.iid, ligne.prix, ligne.unit, ligne.calc],
        );
      }
      // Temoin INDEPENDANT du corps de reponse: une ligne qui ne touche
      // RIEN n'est pas importee, meme dans une transaction qui reussit.
      if (resultat?.changes !== 1) throw new Error("ligne_non_ecrite");
      ecrites += 1;
    }
    await db.run("COMMIT");
    // Le compte-rendu NE RECITE pas le client: `ecrites` vient du SQL
    // (changes) et les lignes ignorees sont NOMMEES. Un import partiel
    // muet etait le defaut juge I1/I6.
    res.json({
      status: "success",
      importees: ecrites,
      ignorees: rejetees.length,
      rejetees,
    });
  } catch (err) {
    await db.run("ROLLBACK");
    return res.status(500).json({
      status: "error",
      message: "Import annule (transaction) : aucune ligne n'a ete ecrite.",
      raison: String((err as Error)?.message ?? err),
    });
  }
} catch (error) {
  console.error("Error confirming import:", error);
  res.status(500).json({ status: "error", message: "Failed to confirm import" });
}
});

router.get("/api/supplier-prices/comparison", async (req, res) => {
try {
  const rawPrices = await db.all(`
    SELECT sp.*, s.name as supplier_name, i.name as inventory_name, i.unit as inventory_unit, i.unit_price as inventory_unit_price
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    JOIN inventory i ON sp.inventory_id = i.id
  `);
  const groups: Record<string, any> = {};
  for (const p of rawPrices) {
    if (!groups[p.inventory_id]) {
      groups[p.inventory_id] = {
        inventory_id: p.inventory_id,
        inventory_name: p.inventory_name,
        inventory_unit: p.inventory_unit,
        current_inventory_price: p.inventory_unit_price || 0,
        supplier_prices: []
      };
    }
    groups[p.inventory_id].supplier_prices.push({
      id: p.id,
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
      raw_unit_price: p.raw_unit_price,
      unit: p.unit,
      calculated_price_per_ref: p.calculated_price_per_ref,
      is_verified_from_invoice: p.is_verified_from_invoice,
      valid_until: p.valid_until
    });
  }
  const comparisonList = Object.values(groups).map((group: any) => {
    // L'ELECTION. Deux defauts, et les deux font le meme degat a l'ecran.
    //
    //  1. `if (!bestPriceEntry || ...)` SEME avec la premiere ligne, meme
    //     non comparable: une seule ligne et un calculated_price_per_ref a
    //     `null` suffisaient a la designer gagnante (verifie par
    //     test/e2e/supplier-price-contract.spec.ts, check
    //     S6_UNE_LIGNE_NON_CONVERTIBLE_NE_PEUT_ETRE_ELUE).
    //  2. le score etait compare a `null` sans le controler. Or en JS
    //     `null < 4` vaut VRAI (null se convertit en 0): une ligne
    //     inconvertible gagnait donc le "meilleur prix" et l'economie
    //     affichée montait a 100 % pour du VIDE.
    //
    // Ce n'est pas un detail d'affichage. src/components/FichesTechniques.tsx
    // (~1791) fait `const bestPrice = comparison.best_supplier_price
    // .calculated_price_per_ref` puis `bestPrice < standardPrice`: avec `null`
    // il obtient 0, donc le devis « optimise » du chef compte UN INGREDIENT
    // GRATUIT et l'alerte « economies actives » de Purchasing (~1069) se
    // declenche sur rien.
    //
    // La regle: une ligne n'est ELECTIONABLE que si son prix par reference est
    // un nombre FINI et NON NEGATIF. `null`/`undefined`/NaN restent VISIBLES
    // dans supplier_prices (le chef doit voir que le tarif existe) mais ne
    // peuvent pas gagner. Defensive ici et non seulement a l'ecriture: les
    // bases deja livrees contiennent des lignes ecrites par l'ancien
    // convertisseur (facteur 1 herite), donc le garde doit tenir sans
    // presupposer une donne propre.
    const election = (v: unknown): v is number =>
      typeof v === "number" && Number.isFinite(v) && v >= 0;
    let bestPriceEntry: SupplierPriceRow | null = null;
    for (const sp of group.supplier_prices as SupplierPriceRow[]) {
      if (!election(sp.calculated_price_per_ref)) continue;
      if (bestPriceEntry === null ||
          sp.calculated_price_per_ref < (bestPriceEntry.calculated_price_per_ref as number)) {
        bestPriceEntry = sp;
      }
    }
    const currentPrice = group.current_inventory_price;
    // LE REPLI EST AUSSI UN NOMBRE DE PRIX. Laisser `best_price` recoper le
    // prix de reference sans le controler laissait sortir un NEGATIF de la
    // comparaison (mesure: scripts/probe-documents-validate-contract.mjs,
    // D1_MEILLEUR_PRIX=-12) quand la seule ligne fournisseur etait non
    // electionable: l'ancien code rendoit `null` sur ce chemin (que le UI
    // convertssait en 0 — un ingredient GRATUIT, tout aussi faux); mon
    // correctif de Sprint 6, en le changeant pour `currentPrice`, a rendu le
    // nombre VRAI mais NON VERIFIE — donc un prix de devis a -12 €. Le garde
    // doit porter sur les DEUX branches, sinon une moitie du contrat est jugee
    // pendant que l'autre est consignee au vert.
    const bestPrice = (bestPriceEntry !== null
      ? (bestPriceEntry.calculated_price_per_ref as number)
      : currentPrice);
    const prix_defendable = election(bestPrice);
    // L'economie ne se calcule que si les DEUX termes sont des nombres de
    // prix: un `null` au numerateur rendait 100 % alors qu'il n'y avait rien
    // a economiser.
    const savingsPercent = election(bestPrice) && election(currentPrice) && currentPrice > 0 && bestPrice < currentPrice
      ? Math.round(((currentPrice - bestPrice) / currentPrice) * 100)
      : 0;
    return {
      ...group,
      best_supplier_price: bestPriceEntry,
      // `null` est la reponse honnete quand NI la ligne fournisseur elue NI la
      // reference de l'article ne sont des prix defendables: l'ecran marque «
      // pas de prix exploitable » au lieu d'aligner un nombre de devis faux (le
      // 0 herite de `null < 4` comptait un ingredient GRATUIT; le -12 herite du
      // prix de reference corrompu, lui, chiffrait un AVOIR).
      best_price: prix_defendable ? bestPrice : null,
      prix_exploitable: prix_defendable,
      savings_percent: savingsPercent
    };
  });
  res.json(comparisonList);
} catch (error) {
  console.error("Error fetching comparison:", error);
  res.status(500).json({ status: "error", message: "Failed to fetch price comparison" });
}
});

  return router;
}
