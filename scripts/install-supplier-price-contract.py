#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Installe le contrat d'ecriture de POST /api/supplier-prices (jetable, idempotent).

Pourquoi un installeur et non un patch a la main: sur ce poste un identifiant
camelCase de la lib peut sortir de l'emission avec une lettre change, et le
fichier recoit alors l'octet FAUX sans que le grep le voie (il normalise la
casse). Les fragments sensibles sont donc RECONSTRUITS par concatena tion, et
le juge reste `npx tsc --noEmit` (scripts/repair-camel.py fait la boucle).

 ⚠ Ce script ne se supprime PAS lui-même, et ne doit pas etre supprime avant
   que la sonde ait bouge: une premiere version a ete lancee avec un mauvais
   BASE, son `rm` final l'a efacee AVANT sa reussite, et le routeur est resté
   intact pendant que `tsc` rendoit rc=0 (il ne prouvait que l'absence de faute
   de syntaxe, pas la claim). La regle: on ne purge un installeur qu'APRES la
   re-mesure.

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
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(BASE, "src", "routes", "supplierprices.ts")
UTIL = os.path.join(BASE, "src", "shared", "util.ts")

LOWERCASE = "to" + "Lower" + "Case"
IS_NAN = "Number" + "." + "is" + "NaN"

DEBUT = 'router.post("/api/supplier-prices", async (req, res) => {'
FIN = 'router.delete("/api/supplier-prices/:id"'


def bloc():
    L = []
    a = L.append
    a(DEBUT)
    a("try {")
    a("  // Contrat ECRIT/LUE de la voie d'ecriture des prix fournisseurs.")
    a("  //")
    a("  // Six defauts, tous MESURES sur un serveur REEL par")
    a("  // scripts/probe-supplier-price-contract.mjs AVANT ce correctif:")
    a("  //   S1_CODE=200 S1_PRIX_STOCK=0            le prix absent devenait GRATUIT")
    a("  //   S2_CODE=200 S2_PRIX_STOCK=-12          un prix negatif etait accepte")
    a("  //   S3_CALC_KG=1000 S3_CALC_INCONNU=1000   une unite inconnue valait \"kg\"")
    a("  //   S4_CODE=200 S4_VISIBLE_DANS_LA_LISTE=0 cle etrangere non verifiee")
    a("  //   S5_CODE=200 S5_LIGNE_CREEE=0           UPDATE de 0 ligne = un succes rendu")
    a("  //   S6_ELUE={\"p\":-12} S6_MEILLEUR_PRIX=-12 S6_ECONOMIE_PCT=580")
    a("  //")
    a("  // S6 est ce qui rend cette route plus chere que les autres ecritures du")
    a("  // projet: GET /api/supplier-prices/comparison DESIGNNE le fournisseur au")
    a("  // meilleur calculated_price_per_ref. Un prix a 0 ou negatif n'est donc pas")
    a("  // un champ laid: il DEVIENT LE MEILLEUR FOURNISSEUR et l'ecran affiche une")
    a("  // economie inventee (580 % mesure pour un article dont la reference est")
    a("  // 2,5). Le cuisinier achete en consequence.")
    a("  const { id, supplier_id, inventory_id, raw_unit_price, unit, valid_until, is_verified_from_invoice } = req.body;")
    a("  const refused: string[] = [];")
    a("")
    a("  // 1) CLE ETRANGERE VERIFIEE. Sans ce garde la ligne part en base mais ne")
    a("  //    survit pas au JOIN du GET: le client croit avoir enregistre, la")
    a("  //    valeur est perdue SANS ERREUR (S4: un id rendu, une ligne introuvable).")
    a("  const fournisseur = await db.get(\"SELECT id FROM suppliers WHERE id = ?\", [supplier_id]);")
    a("  if (!fournisseur) refused.push(\"supplier_id\");")
    a("  const inv: { unit: string | null } | undefined = await db.get(")
    a("    \"SELECT unit FROM inventory WHERE id = ?\", [inventory_id]);")
    a("  if (!inv) refused.push(\"inventory_id\");")
    a("")
    a("  // 2) LE PRIX EST UN NOMBRE, BORNE, FINI. Le trou par lequel 0 entrait:")
    a("  //    la UI fait parseFloat(champ) -> NaN, JSON.stringify(NaN) rend `null`")
    a("  //    dans le corps envoye, et cote serveur Number(null) vaut 0 (alors que")
    a("  //    Number(undefined) vaut NaN). Un prix OUBLIE devenait un prix GRATUIT,")
    a("  //    et non une erreur. Une chaine (\"2,50\", que parseFloat casse en 2) est")
    a("  //    REFUSEE au lieu d'etre arrondie en silence: un tarif fournisseur")
    a("  //    arrondi est un tarif faux qui a l'air saisi.")
    a("  let prix: number;")
    a("  if (typeof raw_unit_price === \"number\") prix = raw_unit_price;")
    a("  else if (typeof raw_unit_price === \"string\" && raw_unit_price.trim() !== \"\") prix = Number(raw_unit_price);")
    a("  else { prix = Number.NaN; refused.push(\"raw_unit_price\"); }")
    a("  // Le plancher a 0 est LA regle qui rend S6 impossible: un credit n'est pas")
    a("  // un prix, et un credit remporte la comparaison au meilleur prix a chaque fois.")
    a("  if (" + IS_NAN + "(prix) || prix < 0 || prix > 1_000_000) refused.push(\"raw_unit_price\");")
    a("")
    a("  // 3) L'UNITE EST UNE UNITE, PAS UNE CHAINE LIBRE. Le convertisseur renvoie")
    a("  //    1 pour TOUT inconnu, donc \"kaz\" se comportait comme \"kg\". On ne ferme")
    a("  //    PAS un enum: la saisie reelle vient d'une facture (\"bouteille\",")
    a("  //    \"pce\", \"casier\") et une liste autorisee rejetterait le cuisinier avec")
    a("  //    un 400 impeccable. On refuse seulement ce qui n'est pas nomme, et on")
    a("  //    cesse de PRONDRE un prix par reference quand la conversion n'est pas")
    a("  //    defendable: le null rendu ici est un aveu, pas un bug.")
    a("  const uniteFournisseur = typeof unit === \"string\" ? unit.trim()." + LOWERCASE + "() : \"\";")
    a("  if (uniteFournisseur === \"\") refused.push(\"unit\");")
    a("  const uniteInventaire = String(inv?.unit ?? \"\");")
    a("  const defendable = estConvertible(uniteFournisseur, uniteInventaire);")
    a("  const calculated_price_per_ref = defendable")
    a("    ? calculatePricePerRef(prix, uniteFournisseur, uniteInventaire)")
    a("    : null;")
    a("")
    a("  // valid_until: du texte libre dans une colonne de date est un tri de")
    a("  // validite qui devient faux en silence. Seule la forme ISO du")
    a("  // <input type=\"date\"> de la UI est acceptee, ou rien.")
    a("  const finValidite = typeof valid_until === \"string\" && valid_until.trim() !== \"\"")
    a("    ? valid_until.trim() : null;")
    a("  if (finValidite !== null && !/^\\d{4}-\\d{2}-\\d{2}$/.test(finValidite)) refused.push(\"valid_until\");")
    a("")
    a("  // is_verified_from_invoice etoit `x ? 1 : 0`. Or la chaine \"false\" est")
    a("  // VRAIE en JavaScript: une forme HTML ou un hidden transformait un prix")
    a("  // NON verifie en prix VERIFIE. Ce badge est justement ce sur quoi le chef")
    a("  // decide de faire confiance au tarif releve sur facture.")
    a("  const verife = lireBooleen(is_verified_from_invoice);")
    a("  if (verife === REJETE_BOOLEAN) refused.push(\"is_verified_from_invoice\");")
    a("")
    a("  if (refused.length > 0) {")
    a("    // Un refus NOMME: un 400 muet fait perdre la saisie du cuisinier sans")
    a("    // qu'il sache quoi corriger.")
    a("    return res.status(400).json({")
    a("      status: \"error\",")
    a("      message: \"Champs refuses\",")
    a("      refused: Array.from(new Set(refused)),")
    a("    });")
    a("  }")
    a("")
    a("  const prixDemande = typeof id === \"string\" && id !== \"\" ? id : null;")
    a("  let resultat;")
    a("  let priceId = prixDemande;")
    a("  if (prixDemande !== null) {")
    a("    resultat = await db.run(")
    a("      \"UPDATE supplier_prices SET supplier_id = ?, inventory_id = ?, raw_unit_price = ?, unit = ?, calculated_price_per_ref = ?, valid_until = ?, is_verified_from_invoice = ? WHERE id = ?\",")
    a("      [supplier_id, inventory_id, prix, uniteFournisseur, calculated_price_per_ref, finValidite, verife, prixDemande]);")
    a("    // Temoin INDEPENDANT du corps de reponse: un UPDATE de 0 ligne n'est pas")
    a("    // une reussite, meme si tout le reste du payload etoit parfait (S5).")
    a("    if (resultat?.changes !== 1) {")
    a("      return res.status(404).json({ status: \"error\", message: \"Prix fournisseur introuvable\" });")
    a("    }")
    a("  } else {")
    a("    const genere = Date.now().toString() + Math.random().toString().substring(2, 7);")
    a("    resultat = await db.run(")
    a("      \"INSERT INTO supplier_prices (id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, valid_until, is_verified_from_invoice) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\",")
    a("      [genere, supplier_id, inventory_id, prix, uniteFournisseur, calculated_price_per_ref, finValidite, verife]);")
    a("    if (resultat?.changes !== 1) {")
    a("      return res.status(500).json({ status: \"error\", message: \"Le prix n'a pas ete enregistre\" });")
    a("    }")
    a("    priceId = genere;")
    a("  }")
    a("")
    a("  // La reponse ne RECITE pas le client: elle RELIT la ligne en base. Une")
    a("  // reponse qui pretend avoir mis ce qui avoit ete envoye cache toute")
    a("  // ecraserie entre le payload et la colonne.")
    a("  const relu = await db.get(")
    a("    \"SELECT id, supplier_id, inventory_id, raw_unit_price, unit, calculated_price_per_ref, valid_until, is_verified_from_invoice FROM supplier_prices WHERE id = ?\",")
    a("    [priceId]);")
    a("  res.json({")
    a("    status: \"success\",")
    a("    id: priceId,")
    a("    item: relu,")
    a("    // L'ecran peut marquer la ligne « non comparable » au lieu de l'aligner")
    a("    // contre les autres dans la comparaison des fournisseurs.")
    a("    prix_par_reference_defendable: defendable,")
    a("  });")
    a("} catch (error) {")
    a("  console.error(\"Error saving supplier price:\", error);")
    a("  res.status(500).json({ status: \"error\", message: \"Failed to save supplier price\" });")
    a("}")
    a("});")
    a("")
    a("")
    return "\n".join(L)


def main():
    for f, nom in ((TARGET, "route"), (UTIL, "util")):
        if not os.path.isfile(f):
            print("MANQUANT %s %s" % (nom, f))
            return 2
    s = open(TARGET, encoding="utf-8").read()
    i, j = s.find(DEBUT), s.find(FIN)
    if not (0 < i < j):
        print("ANCRE i=%s j=%s" % (i, j))
        return 2
    if "S6_MEILLEUR_PRIX" in s[i:j]:
        print("DEJA_INSTALLE=1")
        return 0
    neuf = s[:i] + bloc() + s[j:]
    entete = 'import { calculatePricePerRef } from "../shared/util.js";'
    assert neuf.count(entete) == 1, neuf.count(entete)
    neuf = neuf.replace(entete,
        "import {\n"
        "  calculatePricePerRef,\n"
        "  estConvertible,\n"
        "  lireBooleen,\n"
        "  REJETE_BOOLEAN,\n"
        "} from \"../shared/util.js\";", 1)
    with open(TARGET, "w", encoding="utf-8") as o:
        o.write(neuf)

    b = open(TARGET, "rb").read()
    try:
        b.decode("utf-8")
    except UnicodeDecodeError as e:
        print("UTF8=casse", e)
        return 1
    t = open(TARGET, encoding="utf-8").read()
    rendu = ["installe=1",
             "lignes=%d" % (t.count("\n") + 1),
             "non_ascii=%d" % sum(1 for x in b if x > 0x7F),
             "lone_e9=%d" % b.count(b"\xe9"),
             "sha=" + hashlib.sha256(b).hexdigest()[:12],
             "marqueur_S6=%d" % t.count("S6_MEILLEUR_PRIX"),
             "estConvertible=%d" % t.count("estConvertible"),
             "REJETE_BOOLEAN=%d" % t.count("REJETE_BOOLEAN"),
             "changes=%d" % t.count("changes !== 1")]
    print("VERIFY " + " ".join(rendu))
    return 0


if __name__ == "__main__":
    sys.exit(main())
