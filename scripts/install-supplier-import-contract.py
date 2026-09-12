#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Installe le contrat d'ECRITURE de POST /api/supplier-prices/import-confirm.

Pourquoi ce fichier existe (et pourquoi il n'est pas un patch a la main):

1. La voie d'import est la SECONDE porte d'ecriture des prix fournisseurs et le
   contrat de la premiere (POST /api/supplier-prices) avait ete contracte sans
   elle. La sonde scripts/probe-supplier-import-contract.mjs l'a MESURE sur un
   serveur REEL, avant ce correctif:
     I1_CODE=200 I1_LIGNES_EN_BASE=0      cle etrangere fantome -> 200, donnee
                                          perdue SANS ERREUR (le client croit
                                          avoir importe)
     I2_CODE=200 I2_PRIX_STOCK=-12        un prix NEGATIF ecrit par l'import
     I3A_RAW_PRICE_RENDU=0                 import-analyze rend 0 sur un prix
                                          non numerique, et ce 0 est VALIDE a
                                          l'ecran par le chef puis ECrit
     I4_UNITE_STOCK="g" I4_PRIX_STOCK=1 I4_CALC=1000 I4_FACTEUR_X1000=1
                                          article a l'unite VIDE: `inv ? inv.unit
                                          : "kg"` ne couvre que l'absence de
                                          LIGNE, pas l'unite vide; le
                                          convertisseur rend 1 pour tout inconnu
                                          -> prix MULTIPLIE PAR MILLE en silence
     I6_CODE=200 I6_LIGNES_EN_BASE=0       matched_inventory_id fantome idem I1
   Et le produit de ces colonnes est lu par une DECISION (GET .../comparison
   designe le meilleur fournisseur; FichesTechniques chiffre un devis dessus).

2. Sur ce poste, un identifiant camelCase de la lib peut sortir de l'emission
   avec UNE LETTRE CHANGEE et le fichier recoit alors l'octet faux sans que le
   grep le voie (il normalise la casse). Les fragments sensibles sont donc
   RECONSTRUITS par concatena tion et le juge reste `npx tsc --noEmit`.

 ⚠ Ce script ne se supprime PAS lui-même: une premiere version d'installeur a
   eete efacee par son propre `rm` final AVANT sa reussite, et la route est
   restee intacte pendant que tsc rendoit rc=0. On ne purge un installeur
   qu'APRES la re-mesure.

Lancement: python3 scripts/install-supplier-import-contract.py
Rendu en TOKENS (le rendu de ce poste altere les identifiants; un nombre survit).

 ⚠ NE PAS RE-LANCER sur un arbre DEJA contracte: ce fragment est la PHOTOGRAPHIE
   de l'etat pose le 12/09, et la source verite est desorais la ROUTE + ses specs
   (les trois preuves negatives). Notamment la borne de prix y est ecrite en dur
   (`1_000_000`) au lieu de `PRIX_MAX` de src/shared/util.ts: la valeur est la
   même, mais la propriete « une seule predicat partagee par les trois portes
   d'ecriture » se perdrait sans qu'aucun test ne rougisse (les specs jugent des
   comportments, pas l'identite des constantes). C'est la lecon des BUDGETS
   recopies par audit-perf.mjs, tournee contre ce fichier.
"""
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(BASE, "src", "routes", "supplierprices.ts")

# --- identifiants sensibles: ASSEMBLES, jamais ecrits en dur -----------------
LOWERCASE = "to" + "Low" + "er" + "Case"
ISNAN = "Number" + "." + "is" + "NaN"
ISFIN = "Number" + "." + "is" + "Finite"
NOW = "Date" + "." + "now"
RANDOM = "Math" + "." + "random"
SUBSTRING = "sub" + "string"
GETCOMPUTE = ("await db." + "get")  # le nom est snake-safe, mais la forme est figee

ANCRE_DEBUT = 'router.post("/api/supplier-prices/import-confirm", async (req, res) => {'
ANCRE_FIN = 'router.get("/api/supplier-prices/comparison"'

MARQUEUR = "CONTRAT_IMPORT_" + "POUSE"  # marqueur du bloc installe


def bloc():
    L = []
    a = L.append
    a(ANCRE_DEBUT)
    a("try {")
    a("  // Contrat ECRIT/LUE de la SECONDE voie d'ecriture des prix fournisseurs.")
    a("  //")
    a("  // " + MARQUEUR + " : le contrat de POST /api/supplier-prices avait ete")
    a("  // contracte SANS cette porte, alors qu'elle ecrit les TROIS MEMES")
    a("  // COLONNES (raw_unit_price, unit, calculated_price_per_ref) et debouche")
    a("  // sur le MEME liseur de decision: GET .../comparison designe le")
    a("  // fournisseur au meilleur calculated_price_per_ref et")
    a("  // src/components/FichesTechniques.tsx chiffre un devis « optimise »")
    a("  // dessus. Une porte ne prouve que la voie qu'elle arpente (PHASES.md).")
    a("  //")
    a("  // Six defauts MESURES par scripts/probe-supplier-import-contract.mjs")
    a("  // AVANT ce correctif (verdicts reproduits dans PHASES.md):")
    a("  //   I1/I6  un 200 sur cle etrangere fantome, avec 0 ligne en base:")
    a("  //          le client croit avoir importe, la donnee est perdue SANS")
    a("  //          ERREUR (le JOIN du GET avale la ligne).")
    a("  //   I2   un prix NEGATIF ecrit par l'import (la saisie unitaire, elle,")
    a("  //          le refusait).")
    a("  //   I3   import-analyze fait `Number(x) || 0`: un prix de CSV")
    a("  //          illisible devient 0, est VALIDE a l'ecran par le chef, puis")
    a("  //          ecrit -> UN INGREDIENT GRATUIT au devis.")
    a("  //   I4   `inv ? inv.unit : \"kg\"` ne couvre que l'ABSENCE DE LIGNE, pas")
    a("  //          l'unite VIDE: le convertisseur rend 1 pour tout inconnu et")
    a("  //          le prix part MULTIPLIE PAR MILLE en silence.")
    a("  //")
    a("  // Le reglage, en trois etats (jamais un booleen):")
    a("  //   - faute de LOT (fournisseur absent/inexistant, matches non liste):")
    a("  //     400 qui NOMME les champs;")
    a("  //   - ligne non exploitable (prix absent/negatif/hors plage/texte,")
    a("  //     unite vide, article inexistant, ligne non appariee): elle est")
    a("  //     IGNOREE ET NOMMEE (index + raison) dans la reponse, jamais muette;")
    a("  //   - zero ligne ecrite n'est JAMAIS un succes (400, pas un 200).")
    a("  const { supplier_id, matches } = req.body;")
    a("")
    a("  // 1) FAUTE DE LOT -> 400 NOMME. Un 400 muet fait perdre la saisie du")
    a("  //    cuisinier sans qu'il sache quoi corriger.")
    a("  const refused: string[] = [];")
    a("  if (!Array.isArray(matches)) refused.push(\"matches\");")
    a("  const fournisseurCle = typeof supplier_id === \"string\" ? supplier_id.trim() : \"\";")
    a("  if (fournisseurCle === \"\") refused.push(\"supplier_id\");")
    a("  if (refused.length > 0) {")
    a("    return res.status(400).json({")
    a("      status: \"error\",")
    a("      message: \"Champs refuses\",")
    a("      refused: Array.from(new Set(refused)),")
    a("    });")
    a("  }")
    a("")
    a("  // 2) LA CLE ETRANGERE EST VERIFIEE AVANT TOUTE ECRITURE (I1). Sans ce")
    a("  //    garde la transaction « reussit » et rien ne survit au JOIN de GET.")
    a("  const fournisseur = await db.get(\"SELECT id FROM suppliers WHERE id = ?\", [fournisseurCle]);")
    a("  if (!fournisseur) {")
    a("    return res.status(400).json({")
    a("      status: \"error\",")
    a("      message: \"Fournisseur inconnu : l'import n'a rien ecrit.\",")
    a("      refused: [\"supplier_id\"],")
    a("    });")
    a("  }")
    a("")
    a("  // 3) CHAQUE LIGNE EST JUGEE CONTRE CE QUE LA ROUTE D'ANALYSE Y DEPOSE")
    a("  //    REELLEMENT (raw_price peut deja valoir 0: I3) et contre l'unite")
    a("  //    REELLEMENT en base (I4). Une ligne invalide est NOMMEE, pas tue.")
    a("  const aEcrire: Array<{ iid: string; prix: number; unit: string; calc: number | null }> = [];")
    a("  const rejetees: Array<{ index: number; raison: string }> = [];")
    a("  for (const [index, brut] of (matches as Array<any>).entries()) {")
    a("    const m = (brut ?? {}) as Record<string, unknown>;")
    a("    const iid = typeof m.matched_inventory_id === \"string\"")
    a("      ? (m.matched_inventory_id as string).trim() : \"\";")
    a("    if (iid === \"\") { rejetees.push({ index, raison: \"article_non_apparie\" }); continue; }")
    a("    // I6: un matched_inventory_id qui n'existe plus (le chef a valide")
    a("    //    l'appariement vingt minutes plus tot) n'est pas une donnee.")
    a("    const inv = await db.get(\"SELECT unit FROM inventory WHERE id = ?\", [iid]);")
    a("    if (!inv) { rejetees.push({ index, raison: \"article_inexistant\" }); continue; }")
    a("")
    a("    // I3 + I2: le prix est un NOMBRE, BORNE, FINI. Une chaine est")
    a("    //    REFUSEE et non convertie en 0: `Number(\"3,50\")` est NaN et")
    a("    //    `NaN || 0` etait exactement le trou par lequel le gratuit entrait.")
    a("    let prix: number;")
    a("    if (typeof m.raw_price === \"number\") prix = m.raw_price;")
    a("    else if (typeof m.raw_price === \"string\" && (m.raw_price as string).trim() !== \"\")")
    a("      prix = Number(m.raw_price);")
    a("    else { rejetees.push({ index, raison: \"prix_absent\" }); continue; }")
    a("    if (" + ISNAN + "(prix) || !" + ISFIN + "(prix) || prix < 0 || prix > 1_000_000) {")
    a("      rejetees.push({ index, raison: \"prix_invalide\" });")
    a("      continue;")
    a("    }")
    a("")
    a("    // I4: l'unite est une UNITE. Le defaut \"kg\" de l'ancien code masquait")
    a("    //    l'absence; on ne PROND plus un prix par reference quand la")
    a("    //    conversion n'est pas defendable: null est un aveu lisible.")
    a("    const unitFournisseur = typeof m.raw_unit === \"string\"")
    a("      ? (m.raw_unit as string).trim()." + LOWERCASE + "() : \"\";")
    a("    if (unitFournisseur === \"\") { rejetees.push({ index, raison: \"unite_absente\" }); continue; }")
    a("    const unitInventaire = String(inv?.unit ?? \"\");")
    a("    const defendable = estConvertible(unitFournisseur, unitInventaire);")
    a("    const calc = defendable")
    a("      ? calculatePricePerRef(prix, unitFournisseur, unitInventaire)")
    a("      : null;")
    a("    aEcrire.push({ iid, prix, unit: unitFournisseur, calc });")
    a("  }")
    a("")
    a("  // 4) ZERO LIGNE N'EST PAS UNE REUSSITE (famille S5 de la voie unitaire).")
    a("  //    Le 200 sur un import vide etait un PASS creux pour le bouton")
    a("  //    « Importer la mercuriale ».")
    a("  if (aEcrire.length === 0) {")
    a("    return res.status(400).json({")
    a("      status: \"error\",")
    a("      message: \"Aucune ligne de tarif exploitable : rien n'a ete importe.\",")
    a("      refused: [\"matches\"],")
    a("      rejetees,")
    a("    });")
    a("  }")
    a("")
    a("  await db.run(\"BEGIN TRANSACTION\");")
    a("  try {")
    a("    let ecrites = 0;")
    a("    for (const ligne of aEcrire) {")
    a("      const existing = await db.get(")
    a("        \"SELECT id FROM supplier_prices WHERE supplier_id = ? AND inventory_id = ?\",")
    a("        [fournisseurCle, ligne.iid],")
    a("      );")
    a("      let resultat;")
    a("      if (existing) {")
    a("        // is_verified_from_invoice repart a 0: une mercuriale n'est pas")
    a("        // une verification sur facture. Le sens est CONSERVATEUR (elle")
    a("        // RETIRE la confiance, elle ne la FABRIQUE pas) — c'est ce que la")
    a("        // sonde I5B verifie: un badge porte dans le payload ne peut pas")
    a("        // remonter la ligne par cette voie.")
    a("        resultat = await db.run(")
    a("          \"UPDATE supplier_prices SET raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, is_verified_from_invoice = 0 WHERE id = ?\",")
    a("          [ligne.prix, ligne.unit, ligne.calc, existing.id],")
    a("        );")
    a("      } else {")
    a("        const priceId = " + NOW + "().toString() + " + RANDOM + "().toString()." + SUBSTRING + "(2, 7);")
    a("        resultat = await db.run(")
    a("          \"INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, 0)\",")
    a("          [priceId, fournisseurCle, ligne.iid, ligne.prix, ligne.unit, ligne.calc],")
    a("        );")
    a("      }")
    a("      // Temoin INDEPENDANT du corps de reponse: une ligne qui ne touche")
    a("      // RIEN n'est pas importee, meme dans une transaction qui reussit.")
    a("      if (resultat?.changes !== 1) throw new Error(\"ligne_non_ecrite\");")
    a("      ecrites += 1;")
    a("    }")
    a("    await db.run(\"COMMIT\");")
    a("    // Le compte-rendu NE RECITE pas le client: `ecrites` vient du SQL")
    a("    // (changes) et les lignes ignorees sont NOMMEES. Un import partiel")
    a("    // muet etait le defaut juge I1/I6.")
    a("    res.json({")
    a("      status: \"success\",")
    a("      importees: ecrites,")
    a("      ignorees: rejetees.length,")
    a("      rejetees,")
    a("    });")
    a("  } catch (err) {")
    a("    await db.run(\"ROLLBACK\");")
    a("    return res.status(500).json({")
    a("      status: \"error\",")
    a("      message: \"Import annule (transaction) : aucune ligne n'a ete ecrite.\",")
    a("      raison: String((err as Error)?.message ?? err),")
    a("    });")
    a("  }")
    a("} catch (error) {")
    a("  console.error(\"Error confirming import:\", error);")
    a("  res.status(500).json({ status: \"error\", message: \"Failed to confirm import\" });")
    a("}")
    a("});")
    a("")
    return "\n".join(L)


def main():
    if not os.path.isfile(TARGET):
        print("MANQUANT %s" % TARGET)
        return 2
    s = open(TARGET, encoding="utf-8").read()
    i, j = s.find(ANCRE_DEBUT), s.find(ANCRE_FIN)
    if not (0 < i < j):
        print("ANCRE i=%s j=%s" % (i, j))
        return 2
    if MARQUEUR in s[i:j]:
        print("DEJA_INSTALLE=1")
        return 0
    avant_lignes = s.count("\n")
    neuf = s[:i] + bloc() + "\n" + s[j:]

    # le bloc installe ne doit PAS avoir perdu la route DELETE/GET qui suit:
    # les trois ancres de lecture doivent toujours etre presents une fois.
    for garde in ('router.get("/api/supplier-prices"',
                  'router.post("/api/supplier-prices/import-analyze"',
                  'router.delete("/api/supplier-prices/:id"'):
        assert neuf.count(garde) == 1, (garde, neuf.count(garde))
    assert neuf.count(ANCRE_DEBUT) == 1, neuf.count(ANCRE_DEBUT)

    with open(TARGET, "w", encoding="utf-8") as o:
        o.write(neuf)

    b = open(TARGET, "rb").read()
    try:
        b.decode("utf-8")
    except UnicodeDecodeError as e:
        print("UTF8=casse %s" % e)
        return 1

    rendu = ["installe=1",
             "lignes_avant=%d" % (avant_lignes + 1),
             "lignes_apres=%d" % (neuf.count("\n") + 1),
             "non_ascii=%d" % sum(1 for x in b if x > 0x7F),
             "lone_e9=%d" % b.count(b"\xe9"),
             "sha=" + hashlib.sha256(b).hexdigest()[:12],
             "marqueur=%d" % neuf.count(MARQUEUR),
             "estConvertible=%d" % neuf.count("estConvertible"),
             "changes=%d" % neuf.count("changes !== 1"),
             "rejetees=%d" % neuf.count("rejetees.push"),
             "BEGIN=%d COMMIT=%d ROLLBACK=%d" % (neuf.count("BEGIN TRANSACTION"),
                                                neuf.count("COMMIT"),
                                                neuf.count("ROLLBACK"))]
    print("VERIFY " + " ".join(rendu))
    return 0


if __name__ == "__main__":
    sys.exit(main())
