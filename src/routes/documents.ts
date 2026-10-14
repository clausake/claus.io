// Routes : Documents (factures/BL/avoirs, upload, extraction, validation)
import { Router } from "express";
import { uploadsDir } from "../services/paths.js";
import { settingsPath } from "../services/settings.js";
import type { Database } from "sqlite";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { safeJsonParse, calculatePricePerRef, prixOuNul, ExtractedDocumentData } from "../shared/util.js";
import { findMatchingInventoryItem } from "../shared/fuzzy.js";
import { upload } from "../shared/upload.js";
import { generer } from "../shared/llm.js";
import { ollamaSettingsRef } from "../shared/ollama.js";
import {
  jugerLignesDeDocument,
  lireTexteDeLigne,
  totalOuNul,
} from "../shared/document-items.js";
import type { AuditLogger } from "../services/audit.js";

export default function createRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/documents", async (req, res) => {
try {
  const documents = await db.all(
    "SELECT * FROM documents ORDER BY date DESC",
  );
  for (const doc of documents) {
    doc.items = await db.all(
      `
      SELECT di.*, COALESCE(i.name, di.original_name) as inventory_name, i.unit 
      FROM document_items di
      LEFT JOIN inventory i ON di.inventory_id = i.id
      WHERE di.document_id = ?
    `,
      [doc.id],
    );
  }
  res.json(documents);
} catch (error) {
  console.error(error);
  res
    .status(500)
    .json({ status: "error", message: "Failed to fetch documents" });
}
});
router.post("/api/documents", async (req, res) => {
try {
  // ======================================================================
  // CONTRAT LIGNES DE DOCUMENT (Sprint 9) — la porte D'ECRITURE des lignes
  // de facture. Jugee par test/e2e/document-items-contract.spec.ts et par sa
  // preuve de morsure verify:document-items-mord.
  //
  // VERDICTS MESURES AVANT CE CORRECTIF (scripts/probe-document-items-voices
  // .mjs, instance isolee + relecture EN BASE par l'API du depot,
  // src/db/init.ts:80):
  //   A/B/C  quantity:"" ou "beaucoup" -> 200 et la ligne est en base en
  //          typeof='text' dans une colonne REAL NOT NULL (l'affinite
  //          dynamique de SQLite ne verifie RIEN) : 3 lignes sur les 7 semees.
  //          Un total additione sur ces lignes est un chiffre invente.
  //   D/E/F  quantity absente / items absent / items non-tableau -> 500 muet
  //          « Failed to save document ». Le 500 est le pire des silences : le
  //          chef ne sait pas quoi corriger, et handleSubMIT de
  //          DocumentManager (un `if (res.ok)` sans branche d'echec) ne lui
  //          rend RIEN a l'ecran.
  //   G      inventory_id inexistant -> 200 et ligne ORPHELINEE en base. La
  //          validation qui suit fait `UPDATE inventory ... WHERE id = <cle>`
  //          de 0 ligne SANS ERREUR : la facture « reussit » et le stock ne
  //          bouge jamais.
  //   H/H2   total_amount:"42,50" survit en typeof='text' dans une REAL,
  //          pendant que "42.50" y est un REAL : une saisie, deux issues.
  //
  // LES QUATRE REGLES, dans cet ordre (le LOT d'abord, la LIGNE ensuite) :
  //   1) faute de structure (items absent ou non-tableau, type blanc, total
  //      indefendable) -> 400 qui NOMME les champs : un 400 muet fait perdre
  //      la saisie du cuisinier sans qu'il sache quoi corriger ;
  //   2) clef d'article PRESENTE mais inexistante -> la ligne est refusee et
  //      NOMMEE (index + raison + clef), jamais ecrite orpheline ;
  //   3) clef d'article ABSENTE -> la ligne est ECRITE (proposition libre : le
  //      chef saisiit un PDF a la main et n'a pas encore apparie chaque ligne ;
  //      le GET la rend via COALESCE(i.name, di.original_name)). La rejeter
  //      rendrait la voie manuelle du produit inutilisable — la lecon de
  //      l'ENUM du Sprint 6, qui omettoit 'active' pose par l'init ;
  //   4) zero ligne ecrite n'est JAMAIS un 200 (famille S5 / J9) : un 200 sur
  //      une facture sans lignes est le PASS creux le plus cher du produit,
  //      le chef range un papier qu'il croit compte.
  //
  // CE QUE CE CONTRAT NE FAIT PAS, ET NE DOIT PAS FAIRE (verdicts consignes
  // par V2 et V3 de documents-validate-contract.spec.ts, qui jugent ces DEUX
  // voies depuis CETTE porte) : une ligne au montant indefendable SURVIT,
  // avec son brut conserve, et la VALIDATION du document reussit quand meme.
  // Le mouvement de stock est le travail principal de la route-soeur ;
  // amputer la facture de sa ligne priverait le chef de sa marchandise pour
  // un defaut de frappe sur un prix. Ce qui est neutralise, c'est le TARIF
  // (unit_price NULL, donc jamais elu, jamais badge « releve sur facture »),
  // pas la ligne.
  // ======================================================================
  const { id, type, supplier, date, total_amount, source_image_url } =
    req.body;
  const aRefuse: string[] = [];

  // 1) LE LOT. Un champ de structure indefendable est une faute de REQUETE
  // (400), pas une ressource absente (404) ni un accident serveur (500).
  const typeDoc = lireTexteDeLigne(type, "");
  if (typeDoc === undefined || typeDoc === "") aRefuse.push("type");
  const fournisseur = lireTexteDeLigne(supplier, "");
  if (fournisseur === undefined) aRefuse.push("supplier");
  const dateDoc = lireTexteDeLigne(date, "");
  if (dateDoc === undefined) aRefuse.push("date");
  const image = lireTexteDeLigne(source_image_url, "");
  if (image === undefined) aRefuse.push("source_image_url");
  // Le total a DEUX ecritures legitimes (42.50 et "42,50") et une seule
  // exploitable : totalOuNul les reunifie, et refuse ce qui melange les
  // separateurs au lieu de le deviner (un « 1.234,56 » lu comme 1.234 est
  // faux de trois ordres de grandeur).
  const total = totalOuNul(total_amount);
  if (total === undefined) aRefuse.push("total_amount");
  if (!Array.isArray(req.body?.items)) aRefuse.push("items");
  if (aRefuse.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Champs refuses : " + aRefuse.join(", "),
      refused: Array.from(new Set(aRefuse)),
    });
  }

  const docId = id || Date.now().toString();

  // -- Deux defauts de cette branche, tous deux muets --------------------
  //  1. Le tri se faisait sur `if (id)` et non sur « la ligne EXISTE ». Or la
  //     voie de creation manuelle (DocumentManager) envoie son propre `id`
  //     pour un document qui n'est pas encore en base : l'UPDATE ne touchait
  //     AUCUNE ligne, le document n'etait jamais cree — et la reponse rendait
  //     `id: <celui demande>`. Un PASS creux de bout en bout : 200, un id,
  //     rien en base.
  //  2. Les lignes etaient inserees avec `document_id = id` (donc NULL en
  //     creation, ou l'id demande) au lieu de `docId` : le detail se
  //     retrouvait orphelin, invisible au GET. Une facture sans lignes ne
  //     majore rien.
  // La presence reelle de la ligne decide donc, et les lignes partent docId.
  const existing: { id: string } | undefined = await db.get(
    "SELECT id FROM documents WHERE id = ?",
    [docId],
  );

  // 2) + 3) LES LIGNES, JUGEEs AVANT TOUTE ECRIRE : la transaction n'a pas
  // encore commence, donc RIEN n'est ecrit sur un refus. La predicat est
  // PARTAGEE avec POST /api/purchasing/order (src/shared/document-items.ts)
  // parce que les DEUX portes ecrivent les MEMES colonnes de document_items
  // et que « une porte ne prouve que la voie qu'elle arpente ».
  const { ecrites, rejetees } = await jugerLignesDeDocument(
    db,
    req.body.items,
    {
      exigerClef: false,
      prixIndefendable: "neutraliser",
    },
  );

  // 4) ZERO LIGNE N'EST PAS UNE REUSSITE. Un 200 ici ferait disparaitre la
  // saisie du chef sans qu'aucun ecran ne le voie. Le 400 NOMME chaque ligne
  // et sa raison : le chef ne corrige pas la meme chose selon que le champ
  // est vide, texte ou negatif.
  if (ecrites.length === 0) {
    return res.status(400).json({
      status: "error",
      message:
        "Aucune ligne de document exploitable : rien n'a ete enregistre.",
      refused: ["items"],
      rejetees,
    });
  }

  await db.run("BEGIN TRANSACTION");
  try {
    if (existing) {
      await db.run(
        "UPDATE documents SET type = ?, supplier = ?, date = ?, total_amount = ?, source_image_url = ?, status = 'PENDING' WHERE id = ?",
        [typeDoc, fournisseur, dateDoc, total, image, docId]
      );
      await db.run(
        "DELETE FROM document_items WHERE document_id = ?",
        [docId]
      );
    } else {
      await db.run(
        "INSERT INTO documents (id, type, supplier, date, total_amount, source_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [docId, typeDoc, fournisseur, dateDoc, total, image, "PENDING"],
      );
      await db.run(
        "DELETE FROM document_items WHERE document_id = ?",
        [docId]
      );
    }

    let posees = 0;
    for (const ligne of ecrites) {
      const resultat = await db.run(
        "INSERT INTO document_items (id, document_id, inventory_id, original_name, quantity, unit_price, unit_price_brut, lot_number, dlc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          Math.random().toString(36).substr(2, 9),
          docId,
          ligne.inventory_id,
          ligne.original_name,
          ligne.quantity,
          ligne.unit_price,
          ligne.unit_price_brut,
          ligne.lot_number,
          ligne.dlc,
        ],
      );
      // Temoin INDEPENDANT du corps de reponse : une ligne qui ne touche
      // RIEN n'est enregistree, meme dans une transaction qui « reussit »
      // (un UPDATE de 0 ligne rendait 200 au Sprint 6 — la lecon S5).
      if (resultat?.changes !== 1) throw new Error("ligne_non_ecrite");
      posees += 1;
    }
    await db.run("COMMIT");

    // La reponse ne RECITE pas le client : l'ancien `res.json({ id })`
    // rendait la cle DEMANDEE, donc `undefined` pour la voie de creation
    // manuelle qui n'en envoie pas une (mesure D1_VALIDE_CODE=404 : le
    // client obtenait un 200, un id faux, et son appel SUIVANT
    // /api/documents/<id>/validate meurait en 404 sur un document qui
    // venait bel et bien d'etre cree). La cle rendue est la cle ECITE et la
    // ligne est RELLE en base : temoin independant du corps de requete.
    const relu = await db.get(
      "SELECT id, type, supplier, date, total_amount, typeof(total_amount) AS total_type, status FROM documents WHERE id = ?",
      [docId],
    );
    const lignes = await db.all(
      "SELECT id, inventory_id, original_name, quantity, typeof(quantity) AS quantity_type, unit_price, unit_price_brut FROM document_items WHERE document_id = ?",
      [docId],
    );
    if (!relu) {
      // Un 200 sur une ligne absente de la base est le PASS creux consigne
      // pour documents.ts : la reponse ne peut pas pretendre une creation
      // que la relecture dement.
      throw new Error("document_non_relie");
    }
    await logAudit(req, res, { route: "/api/documents", action: "create", entite: relu.id, payload: { type: typeDoc, total_amount: total, lignes: posees, ignorees: rejetees.length } });
    res.json({
      status: "success",
      id: relu.id,
      document: relu,
      items: lignes,
      ecrites: posees,
      ignorees: rejetees.length,
      rejetees,
    });
  } catch (erreurTransaction) {
    // Une ecriture partielle n'est pas un demi-succes : sans ROLLBACK, une
    // facture moitie ecrite reste a l'ecran comme une facture valable.
    await db.run("ROLLBACK");
    console.error("Error saving document:", erreurTransaction);
    return res.status(500).json({
      status: "error",
      message:
        "Document annule (transaction) : aucune ligne n'a ete enregistree.",
      raison: String((erreurTransaction as Error)?.message ?? erreurTransaction),
    });
  }
} catch (error) {
  // Filet: tout ce qui tombe ICI arrive AVANT la transaction (une lookup qui
  // jette, un binding surprise). Ce n'est pas un 500 « Failed to save document »
  // muet — le 500 d'origine ne disait pas QUOI corriger et DocumentManager ne
  // l'affichait meme pas. La raison technique est rendue, et le document n'est
  // PAS enregistre partiellement (rien n'a commence).
  console.error("Error saving document:", error);
  res.status(500).json({
    status: "error",
    message: "Le document n'a pas pu etre prepare : aucune ligne n'a ete ecrite.",
    raison: String((error as Error)?.message ?? error),
  });
}
});
router.post("/api/documents/:id/validate", async (req, res) => {
try {
  const { id } = req.params;
  const doc = await db.get("SELECT * FROM documents WHERE id = ?", [id]);
  if (!doc)
    return res
      .status(404)
      .json({ status: "error", message: "Document not found" });

  // -- Deux gardes d'integrite du stock ------------------------------------
  // La validation est un MOUVEMENT DE STOCK (quantity = quantity + ...). Elle
  // doit donc etre idempotente et exclusive, sinon le stock part a la derive
  // sans qu'aucun ecran ne le montre :
  //
  //  1. UN SEUL PASSEAGE. Le garde d'avant etait absent : un double-clic sur
  //     « Valider » (ou un retry du reseau) additionnait la marchandise DEUX
  //     fois. Le statut passait a VALIDATED des le premier coup, donc le second
  //     ne rougissait nulle part — et le stock du client etait faux de 100 %.
  //  2. LES BONS DE COMMANDE NE SE VALIDENT PAS ICI. Un bon porte des quantites
  //     PREVUES et non recues : c'est la reception qui les met en stock. Sans
  //     cette exclusion, la voie Saisies (PDF) et la voie Documents se battaient
  //     le meme mouvement, et un bon valide par megarde puis receptionne
  //     additionnait deux fois. Le type est verifie contre la liste blanche au
  //     lieu d'une negation : un type inconnu (donnee heritee d'une vieille
  //     version) ne merite pas d'entrer en stock.
  const TYPES_VALISIBLES = ["FACTURE", "BL", "BON_LIVRAISON", "AVOIR"];
  const typeDoc = (doc.type || "").toUpperCase();
  if (!TYPES_VALISIBLES.includes(typeDoc)) {
    return res.status(409).json({
      status: "error",
      message:
        typeDoc === "COMMANDE"
          ? "Un bon de commande ne se valide pas : receptionnez-le (les quantites entrent en stock a la livraison)."
          : "Type de document non validationable : " + (doc.type || "(vide)"),
    });
  }
  if ((doc.status || "").toUpperCase() === "VALIDATED") {
    return res.status(409).json({
      status: "error",
      message: "Ce document est deja valide : le stock a deja ete majouré.",
      already_validated: true,
    });
  }

  let supplierId: string | null = null;
  if (doc.supplier && doc.supplier.trim()) {
    const normName = doc.supplier.trim();
    const existingSupp = await db.get("SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)", [normName]);
    if (existingSupp) {
      supplierId = existingSupp.id;
    } else {
      supplierId = Date.now().toString() + Math.random().toString().substring(2, 5);
      await db.run("INSERT INTO suppliers (id, name, email, phone, status) VALUES (?, ?, ?, ?, 'ACTIVE')", [
        supplierId,
        normName,
        "",
        ""
      ]);
    }
  }

  const items = await db.all(
    "SELECT * FROM document_items WHERE document_id = ?",
    [id],
  );
  // Les lignes dont le montant n'est pas un prix defendable: elles ne bloquent
  // pas la validation (le mouvement de stock est le travail principal de cette
  // route) mais elles ne peuvent pas certifier un tarif, et elles sont NOMMEES
  // au lieu d'etre tués — un prix ignore muet est un prix que le chef croit
  // importe. Le type est declare ici et non infere du push: une mutation qui
  // vide le `push` laisserait une chaine `any` passer sans que tsc ne bronche.
  const prixNonExploitables: Array<{ original_name: string; valeur: string; raison: string }> = [];
  for (const item of items) {
    if (!item.inventory_id) continue;
    const qtyChange =
      doc.type === "AVOIR"
        ? -Math.abs(item.quantity)
        : Math.abs(item.quantity);
    // -- Le SET se construit sur les colonnes REELLEMENT PRESENTES ------------
    // Depuis le contrat de la CREATION, une ligne au montant indefendable a
    // `unit_price = NULL`. Le passer au binding n'est PAS neutre: `unit_price`
    // de la colonne `inventory` est NULLABLE, donc node-sqlite3 ECrit NULL EN
    // SILENCE (sonde scripts/probe-binding-undefined.mjs: update_undefined_
    // nullable -> ok, colonne NULL). Valider une facture dont un prix est
    // illisible effacerait donc le PRIX DE REFERENCE de l'article — le nombre
    // sur lequel la comparaison retombe quand aucun fournisseur n'est elu
    // (checks V5/V6). Une absence n'est pas un ordre d'effacement: la colonne
    // sort du SET, comme pour le PUT partiel du Sprint 6. Idem lot_number/dlc,
    // ou une ligne sans lot ne doit pas vider le lot de l'article.
    const colonnes: string[] = ["quantity = quantity + ?"];
    const valeurs: unknown[] = [qtyChange];
    if (item.unit_price !== null && item.unit_price !== undefined) {
      colonnes.push("unit_price = ?");
      valeurs.push(item.unit_price);
    }
    if (item.lot_number !== null && item.lot_number !== undefined && item.lot_number !== "") {
      colonnes.push("lot_number = ?");
      valeurs.push(item.lot_number);
    }
    if (item.dlc !== null && item.dlc !== undefined && item.dlc !== "") {
      colonnes.push("dlc = ?");
      valeurs.push(item.dlc);
    }
    valeurs.push(item.inventory_id);
    await db.run(
      `UPDATE inventory SET ${colonnes.join(", ")} WHERE id = ?`,
      valeurs,
    );
    const invItem = await db.get(
      "SELECT quantity, minStock, unit FROM inventory WHERE id = ?",
      [item.inventory_id],
    );
    if (invItem) {
      let status = "ok";
      if (invItem.quantity <= 0) status = "critical";
      else if (invItem.quantity <= invItem.minStock) status = "low";
      await db.run("UPDATE inventory SET status = ? WHERE id = ?", [
        status,
        item.inventory_id,
      ]);

      // -- LA TROISIEME PORTE D'ECRITURE DES PRIX FOURNISSEURS ---------------
      // Validationner une facture n'est pas seulement un mouvement de stock:
      // c'est aussi une ECOUTURE de prix fournisseur, et la seule qui force
      // `is_verified_from_invoice = 1`. A ce titre c'est la voie la plus chere
      // du produit: le badge « releve sur facture » est exactement ce sur quoi
      // le chef DECIDE de croire un tarif (et la comparaison designe le
      // gagnant sur le nombre qui l'accompagne).
      //
      // Deux defauts MESURES par scripts/probe-documents-validate-contract.mjs:
      //   D1_PRIX_STOCK=-12 D1_BADGE_VERIFIE=1  un MONTANT NEGATIF (une remise,
      //     un retour, une ligne d'avoir mal saisie) partait en base CERTIFIE
      //     VERIFIE. Un credit n'est pas un prix: de plus il remporte la
      //     comparaison au meilleur prix a chaque fois.
      //   D3_VALIDE_CODE=500 un montant NON NUMERIQUE faisait MEURIR toute la
      //     validation en 500 « Validation failed » (node-sqlite3 jette sur un
      //     binding NaN): le document restait PENDING, le stock non majouré, et
      //     l'operateur ne savais pas quelle ligne corriger.
      //
      // Le reglage: la MEME predicat que les deux autres portes (prixOuNul du
      // module partagé — une borne recopiée se perime en silence, la lecon des
      // BUDGETS de l'auditeur). Une ligne au montant indefendable ne bloque pas
      // la validation du document (le stock est le travail principal de cette
      // route) mais elle n'entre PAS en tarif et elle est NOMMEe dans le
      // compte-rendu: un prix ignore muet est un prix que le chef croit importe.
      const prixValide = prixOuNul(item.unit_price);
      if (supplierId && prixValide !== null) {
        const purchaseUnit = invItem.unit || "kg";
        const calculated_price_per_ref = calculatePricePerRef(prixValide, purchaseUnit, purchaseUnit);

        const existingPrice = await db.get("SELECT id FROM supplier_prices WHERE supplier_id = ? AND inventory_id = ?", [
          supplierId,
          item.inventory_id
        ]);

        if (existingPrice) {
          await db.run(
            "UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 1, valid_until = NULL WHERE id = ?",
            [prixValide, purchaseUnit, calculated_price_per_ref, existingPrice.id]
          );
        } else {
          const priceId = Date.now().toString() + Math.random().toString().substring(2, 7);
          await db.run(
            "INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, 1)",
            [priceId, supplierId, item.inventory_id, prixValide, purchaseUnit, calculated_price_per_ref]
          );
        }
      } else if (
        supplierId &&
        (item.unit_price !== null || item.unit_price_brut != null) &&
        (item.unit_price !== undefined || item.unit_price_brut !== undefined)
      ) {
        // Depuis le contrat de la CREATION (Sprint 9), une ligne au montant
        // indefendable arrive ici avec `unit_price = NULL` et son BRUT dans
        // `unit_price_brut`: la porte d'entree refuse desorais d'ecrire un
        // texte dans une colonne REAL, mais ne JETTE pas la ligne (le contrat
        // V2/V3 — le mouvement de stock reste le travail principal de cette
        // route). Sans lire la colonne de trace, la ligne serait DEVENUE
        // MUETTE: le 400 de la creation ne la nomme plus (elle n'empeche pas
        // la facture) et la validation ne la nommerait plus non plus, parce
        // qu'elle ne verrait qu'un NULL ordinaire — un prix ignore muet est
        // un prix que le chef croit importe.
        prixNonExploitables.push({
          original_name: item.original_name || item.inventory_id,
          valeur: String(item.unit_price ?? item.unit_price_brut),
          raison: "montant_non_exploitable",
        });
      }
    }
  }
  await db.run("UPDATE documents SET status = 'VALIDATED' WHERE id = ?", [
    id,
  ]);
  // Le compte-rendu NOMME les lignes de tarif écartées. Une variable collectée
  // et jamais rendue est un PASS creux: le harnais croit juger un refus notifié
  // alors que la route le tait (verifie par
  // test/e2e/documents-validate-contract.spec.ts, check V2_LA_LIGNE_REJETEE_EST_NOMMEE_ET_NON_TUEE).
  // La validation est un MOUVEMENT DE STOCK + une ecriture de prix : tracee.
  await logAudit(req, res, { route: "/api/documents/:id/validate", action: "validate", entite: id, payload: { apres: { status: "VALIDATED" }, prix_non_exploitables: prixNonExploitables.length } });
  res.json({ status: "success", prix_non_exploitables: prixNonExploitables });
} catch (error) {
  console.error(error);
  res.status(500).json({ status: "error", message: "Validation failed" });
}
});
router.post("/api/documents/upload", upload.single("file"), async (req, res) => {
try {
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, "utf8");
      ollamaSettingsRef.current = { ...ollamaSettingsRef.current, ...JSON.parse(data) };
    } catch (e) {}
  }
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file" });
  const docId = Math.random().toString(36).substr(2, 9);
  const ext = file.originalname.split(".").pop()?.toLowerCase();
  const filename = `${docId}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  const imageUrl = `/uploads/${filename}`;
  fs.writeFileSync(filepath, file.buffer);
  let imageBuffer: string | null = null;
  if (["jpg", "png", "jpeg", "webp"].includes(ext || "")) {
    imageBuffer = file.buffer.toString("base64");
  } else if (ext === "pdf") {
    console.log("[PDF-PARSE] Extraction du texte depuis PDF (upload)...");
    try {
      const pdfData = await pdfParse(file.buffer);
      // We attach the extracted text to req for later use in prompt
      // @ts-ignore
      req.pdfText = pdfData.text || " ";
      imageBuffer = null; // No image for Ollama
    } catch (e) {
      console.error("[ERROR] Impossible de parser le PDF.", e);
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      return res.status(400).json({ error: "La lecture du PDF a échoué: " + msg });
    }
  } else {
    return res
      .status(400)
      .json({ error: "Only images or PDFs are supported." });
  }
  
  const isDraft = req.query.draft === 'true';
  if (isDraft) {
    const id = Date.now().toString();
    await db.run(
      "INSERT INTO documents (id, type, supplier, date, total_amount, source_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, "A DEFINIR", "", "", 0, `/uploads/${filename}`, "DRAFT"]
    );
    await logAudit(req, res, { route: "/api/documents/upload", action: "create", entite: id, payload: { type: "DRAFT" } });
    return res.json({ status: "success", type: "draft", id, source_image_url: `/uploads/${filename}` });
  }

  const isEn = ollamaSettingsRef.current.language === "en";
  const isEs = ollamaSettingsRef.current.language === "es";
  const isDe = ollamaSettingsRef.current.language === "de";
  let promptText = isEs
    ? `Analiza este documento (Factura, Albar\xE1n o Abono) y extrae la siguiente informaci\xF3n en formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nombre del proveedor",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nombre del art\xEDculo",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. DETECCI\xD3N DE TIPO: 
- Si ves una lista de art\xEDculos con precios y un TOTAL, es una FACTURA ("FACTURE").
- Si es una FACTURA, extrae TODOS los art\xEDculos presentes.
- Si es un Albar\xE1n sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ART\xCDCULOS: Para cada art\xEDculo, s\xE9 extremadamente preciso con la CANTIDAD y la UNIDAD. 
- Si ves "5 KG", quantity=5, unit="kg".
- Si ves "Peso neto: 2.5kg", quantity=2.5, unit="kg".
- Si ves "Paquete de 10", quantity=10, unit="unit".
- Si ves un precio por kilo, extrae la cantidad total facturada.
3. VERIFICACI\xD3N: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albar\xE1n ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`
    : ollamaSettingsRef.current.language === "de"
      ? `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Name des Lieferanten",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Name des Artikels",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
WICHTIG:
1. TYP-ERKENNUNG: 
- Mit Preisen = FACTURE.
- Ohne Preise = BL.
- Gutschrift = AVOIR.
2. ARTIKEL: Jede Menge sehr präzise extrahieren.
3. ÜBERPRÜFUNG: Muss als JSON geantwortet werden.`
      : ollamaSettingsRef.current.language === "it"
        ? `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nome del fornitore",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nome dell'articolo",
  "quantity": 0,
  "unit": "kg, g, L, u, ecc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. RILEVAMENTO DEL TIPO: 
- Con prezzi e totale = FACTURE (Fattura).
- Senza prezzi = BL (DDT/Documento di Trasporto).
- Nota di Credito = AVOIR.
2. ARTICOLI: Estrai ogni quantità con molta precisione.
3. VERIFICA: DEVE rispondere come JSON.`
      : isEn
        ? `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Supplier name",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Item name",
  "quantity": 0,
  "unit": "kg, g, L, unit, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT:
1. TYPE DETECTION: 
- If you see a list of items with prices and a TOTAL, it is an INVOICE ("FACTURE").
- If it is an INVOICE, extract ALL the items present.
- If it's a Delivery Note without prices, type is "BL".
- If it's a Credit Note, type is "AVOIR".
2. ITEMS: For each item, be extremely precise about QUANTITY and UNIT. 
- If you see "5 KG", quantity=5, unit="kg".
- If you see "Net weight: 2.5kg", quantity=2.5, unit="kg".
- If you see "Pack of 10", quantity=10, unit="unit".
- If you see a price per kilo, extract the total invoiced quantity.
3. VERIFICATION: A document with a supplier header and a VAT summary is obligatorily an INVOICE ("FACTURE") or Delivery Note ("BL"). MUST return JSON matching the schema precisely.`
        : `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nom du fournisseur",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nom de l'article",
  "quantity": 0,
  "unit": "kg, g, L, unit\xE9, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT :
1. D\xC9TECTION DU TYPE : 
- Si tu vois une liste d'articles avec des prix et un TOTAL, c'est une FACTURE.
- Si c'est une FACTURE, extrais TOUS les articles pr\xE9sents.
2. ARTICLES : Pour chaque article, sois extr\xEAmement pr\xE9cis sur la QUANTIT\xC9 et l'UNIT\xC9. 
- Si tu vois "5 KG", quantity=5, unit="kg".
- Si tu vois "Poids net: 2.5kg", quantity=2.5, unit="kg".
- Si tu vois "Colis de 10", quantity=10, unit="unit\xE9".
- Si tu vois un prix au kilo, extrais la quantit\xE9 totale factur\xE9e.
3. V\xC9RIFICATION : Un document avec un en-t\xEAte de fournisseur et un r\xE9capitulatif de TVA est obligatoirement une FACTURE ou un Bon de Livraison.
YOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN \`\`\`json. DO NOT EXPLAIN.`;
  promptText += "\nYOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN ```json. DO NOT EXPLAIN.";
  
  // @ts-ignore
  if (req.pdfText) {
    // @ts-ignore
    promptText += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + req.pdfText;
  }
  
  // Chantier 11 : porte unique (vision + repli Tesseract conservés).
  const repLlm = await generer({ prompt: promptText, image: imageBuffer, format: "json", temperature: 0.1 });
  let cleanResponse = repLlm.texte || "{}";
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  
  try {
    const data = safeJsonParse(cleanResponse) as ExtractedDocumentData;
    if (imageUrl) {
      data.source_image_url = imageUrl;
    }
    const batchId = Math.random().toString(36).substr(2, 9);
    let inventoryId = 'UNKNOWN';
    const productName = data.product ? String(data.product) : 'Inconnu';
    const lotNumber = data.lot ? String(data.lot) : 'Inconnu';
    const dlcStr = data.dlc ? String(data.dlc) : 'Inconnu';

    const invItem = await findMatchingInventoryItem(db, productName);
    if (invItem) inventoryId = invItem.id;
    
    await db.run(
      'INSERT INTO batches (id, inventory_id, lot_number, expiration_date, source_image_url) VALUES (?, ?, ?, ?, ?)',
      [batchId, inventoryId, lotNumber, dlcStr, imageUrl],
    );
    await db.run(
      'INSERT INTO traceability_labels (id, product_name, fabrication_date, dlc, allergens) VALUES (?, ?, ?, ?, ?)',
      [
        batchId,
        productName,
        new Date().toISOString().split('T')[0],
        dlcStr,
        JSON.stringify(data.allergens || []),
      ],
    );
    // HACCP obligatoirement trace : l'upload extrait un lot + une etiquette.
    await logAudit(req, res, { route: "/api/documents/upload", action: "create", entite: batchId, payload: { product: productName, lot: lotNumber, dlc: dlcStr } });
    res.json(data);
  } catch (parseError) {
    console.error('[OLLAMA/DB/JSON] Processing failed. Error:', parseError, '\nRaw response:', cleanResponse);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors du traitement des données.`,
      errorDetails: parseError instanceof Error ? parseError.message : String(parseError)
    });
  }
} catch (error) {
  console.error("[OLLAMA] Erreur critique :", error);
  const errMsg = error instanceof Error ? error.message : "Erreur de connexion à l'IA.";
  res
    .status(500)
    .json({ status: "error", message: `Erreur d'extraction IA : ${errMsg}` });
}
});

router.post("/api/documents/:id/extract", async (req, res) => {
try {
  const docId = req.params.id;
  const document = await db.get("SELECT * FROM documents WHERE id = ?", [docId]);
  if (!document) return res.status(404).json({ error: "Document non trouvé" });

  const filepath = path.join(uploadsDir, document.source_image_url.split('/uploads/')[1]);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "Fichier source introuvable" });
  }

  
  let imageBuffer: string | null = null;
  let pdfText = null;
  if (filepath.toLowerCase().endsWith('.pdf')) {
    console.log("[PDF-PARSE] Extraction temporelle (extract)...");
    try {
      const pdfData = await pdfParse(fs.readFileSync(filepath));
      pdfText = pdfData.text || " ";
    } catch (e) {
      console.error("[ERROR] extract pdf parse failed:", e);
      return res.status(400).json({ error: "Echec de lecture du fichier PDF existant." });
    }
  } else {
    imageBuffer = fs.readFileSync(filepath).toString("base64");
  }


  const isEn = ollamaSettingsRef.current.language === "en";
  const isEs = ollamaSettingsRef.current.language === "es";
  const isDe = ollamaSettingsRef.current.language === "de";
  let promptText = isEs
    ? `Analiza este documento (Factura, Albarán o Abono) y extrae la siguiente información en formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nombre del proveedor",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nombre del artículo",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. DETECCIÓN DE TIPO: 
- Si ves una lista de artículos con precios y un TOTAL, es una FACTURA ("FACTURE").
- Si es una FACTURA, extrae TODOS los artículos presentes.
- Si es un Albarán sin precios, tipo es "BL".
- Si es un Abono, tipo es "AVOIR".
2. ARTÍCULOS: Para cada artículo, sé extremadamente preciso con la CANTIDAD y la UNIDAD. 
3. VERIFICACIÓN: Un documento con un encabezado de proveedor y un resumen de IVA es obligatoriamente una FACTURA o un Albarán ("BL"). DEBE devolver JSON coincidiendo exactamente con el esquema.`
    : ollamaSettingsRef.current.language === "de"
      ? `Analysiere dieses Dokument (Rechnung, Lieferschein oder Gutschrift) und extrahiere die folgenden Informationen im JSON-Format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Name des Lieferanten",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Name des Artikels",
  "quantity": 0,
  "unit": "kg, g, L, u, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
WICHTIG:
1. TYP-ERKENNUNG: 
- Mit Preisen = FACTURE.
- Ohne Preise = BL.
- Gutschrift = AVOIR.
2. ARTIKEL: Jede Menge sehr präzise extrahieren.
3. ÜBERPRÜFUNG: Muss als JSON geantwortet werden.`
      : ollamaSettingsRef.current.language === "it"
        ? `Analizza questo documento (Fattura, Documento di Trasporto o Nota di Credito) ed estrai le seguenti informazioni in formato JSON:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nome del fornitore",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nome dell'articolo",
  "quantity": 0,
  "unit": "kg, g, L, u, ecc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANTE:
1. RILEVAMENTO DEL TIPO: 
- Con prezzi e totale = FACTURE (Fattura).
- Senza prezzi = BL (DDT/Documento di Trasporto).
- Nota di Credito = AVOIR.
2. ARTICOLI: Estrai ogni quantità con molta precisione.
3. VERIFICA: DEVE rispondere come JSON.`
      : isEn
          ? `Analyze this document (Invoice, Delivery Note, or Credit Note) and extract the following information in JSON format:
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Supplier name",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Item name",
  "quantity": 0,
  "unit": "kg, g, L, unit, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT: 
- If you see a list of items with prices and a TOTAL, it is an INVOICE ("FACTURE"). MUST return JSON.`
          : `Analyse ce document (Facture, Bon de Livraison ou Avoir) et extrais les informations suivantes en JSON :
{
"type": "FACTURE" | "BL" | "AVOIR",
"supplier": "Nom du fournisseur",
"date": "YYYY-MM-DD",
"items": [
{
  "item": "Nom de l'article",
  "quantity": 0,
  "unit": "kg, g, L, unité, etc.",
  "unit_price": 0
}
],
"total_amount": 0
}
IMPORTANT :
1. DÉTECTION DU TYPE : 
- Si tu vois une liste d'articles avec des prix et un TOTAL, c'est une FACTURE.
- Si c'est une FACTURE, extrais TOUS les articles présents.
2. ARTICLES : Pour chaque article, sois extrêmement précis sur la QUANTITÉ et l'UNITÉ.
3. VÉRIFICATION : Un document avec un en-tête de fournisseur et un récapitulatif de TVA est obligatoirement une FACTURE ou un Bon de Livraison.
YOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE.`;
  
  promptText += "\nYOU MUST RESPOND STRICTLY AND EXCLUSIVELY WITH RAW JSON ALONE. DO NOT ADD MARKDOWN ```json. DO NOT EXPLAIN.";
  
  if (pdfText) {
    promptText += "\n\n--- CONTENU EXTRAIT DU PDF ---\n" + pdfText;
  }
  // Chantier 11 : porte unique (vision + repli Tesseract conservés).
  const repLlm = await generer({ prompt: promptText, image: imageBuffer, format: "json", temperature: 0.1 });
  let cleanResponse = repLlm.texte || "{}";
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanResponse = jsonMatch[0];
  try {
    const data = safeJsonParse(cleanResponse) as ExtractedDocumentData;
    data.source_image_url = document.source_image_url;
    console.log("[OLLAMA] Données extraites depuis brouillon :", data);

    await db.run("UPDATE documents SET status = 'PENDING', type = ?, supplier = ?, date = ?, total_amount = ? WHERE id = ?", [
      data.type || "A DEFINIR",
      data.supplier || "",
      data.date || "",
      data.total_amount || 0,
      docId
    ]);
    await logAudit(req, res, { route: "/api/documents/:id/extract", action: "update", entite: docId, payload: { apres: { status: "PENDING", type: data.type || "A DEFINIR" } } });
    res.json({ data, source_image_url: data.source_image_url });
  } catch (parseError) {
    console.error("[OLLAMA] Erreur de parsing JSON :", cleanResponse);
    res
      .status(500)
      .json({ status: "error", message: `L'IA a retourné un format JSON invalide : ${cleanResponse.substring(0, 200)}...` });
  }
} catch (e) {
  console.error(e);
  const errMsg = e instanceof Error ? e.message : "Erreur de connexion avec l'IA Ollama.";
  res.status(500).json({ status: "error", message: `L'extraction du brouillon a échoué : ${errMsg}` });
}
});


  return router;
}
