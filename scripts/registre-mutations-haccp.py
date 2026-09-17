#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REGISTRE des mutations du contrat HACCP (source unique, lisible par le
harnais cd-morsure-haccp.py ET par un futur controleur d'ancres).

Pourquoi un fichier et non des litteraux dans le script: le poste rogne et
double les emissions longues, et une ancre mal transcrite ne mord JAMAIS — ce
qui se presente comme « la mutation ne mord pas » alors que c'est l'ancre qui
est morte (la faute consignee du 09/09). Les ancres vivent donc dans un fichier
de DONNEES, et chaque ancre est comptee sur les octets relus avant de juger.

Le caractere « _ » dans M9 est le separateur de la classe regex /[=_-]/; il est
ecrit ici tel quel et verifie par compte.
"""
import os

BASE = os.path.expanduser("~/cookdrive-project")
RT = os.path.join(BASE, "src", "routes", "haccp.ts")
SH = os.path.join(BASE, "src", "shared", "haccp-fields.ts")

MUTATIONS = [
    dict(id="M1", fichier=RT, attendu="C1",
         titre="une releve non numerique redevient un nombre",
         avant='    const releve = nombreDeReleve(temperature, TEMPERATURE_MIN, TEMPERATURE_MAX);\n'
               '    if (releve === undefined) refus.push("temperature");',
         apres='    const releve = temperature === undefined ? 0 : Number(temperature);'),
    dict(id="M2", fichier=RT, attendu="C6",
         titre="le jeton du webhook redevient optionnel (le predicat court du depart)",
         avant='    if (typeof token !== "string" || token.trim() === "") {\n'
               '      return res.status(403).json({ error: "Jeton de webhook requis." });\n'
               '    }',
         apres='    if (typeof token === "string" && token.length > 0 && false) {\n'
               '      return res.status(403).json({ error: "Jeton de webhook requis." });\n'
               '    }'),
    dict(id="M3", fichier=RT, attendu="C2",
         titre="batch_ids n'est plus confronte a ARRAY (le 500 du depart)",
         avant='    if (!Array.isArray(batch_ids) || batch_ids.length === 0) {',
         apres='    if (false) {'),
    dict(id="M4", fichier=RT, attendu="C2",
         titre="une recette inexistante redevient acceptable (JOIN interne)",
         avant='    const recetteOk = await db.get("SELECT id FROM recipes WHERE id = ?", [recette]);\n'
               '    if (!recetteOk) {',
         apres='    const recetteOk = { id: recette };\n'
               '    if (false) {'),
    dict(id="M5", fichier=RT, attendu="C3",
         titre="le repli TEXTE revient sur la date du lot (T2)",
         avant='    const echeance = dateISO(expiration_date);',
         apres='    const echeance = dateISO(expiration_date) ?? lireTexte(expiration_date, 40);'),
    dict(id="M6", fichier=RT, attendu="C1",
         titre="l'usurpation de provenance redevient silencieuse (T1)",
         avant='    if (entry_type !== undefined) refus.push("entry_type");\n'
               '    if (sensor_mode !== undefined) refus.push("sensor_mode");',
         apres='    // mute: la provenance redevient un champ d\'appelant ignore'),
    dict(id="M7", fichier=RT, attendu="C3",
         titre="la clef d'article du lot n'est plus confrontee a inventory",
         avant='    const art = await db.get("SELECT id FROM inventory WHERE id = ?", [article]);\n'
               '    if (!art) {',
         apres='    const art = { id: article };\n'
               '    if (false) {'),
    dict(id="M8", fichier=RT, attendu="C4",
         titre="l'action corrective orpheline redevient ecrite",
         avant='    const log = await db.get("SELECT id FROM temperature_logs WHERE id = ?", [reliquat]);\n'
               '    if (!log) {',
         apres='    const log = { id: reliquat };\n'
               '    if (false) {'),
    dict(id="M9", fichier=SH, attendu="C5",
         titre="le jeton de capteur redevient un PRNG previsible",
         avant='  return randomBytes(32).toString("base64url").replace(/[=_-]/g, "").slice(0, 43);',
         apres='  return Math.random().toString(36).substring(2, 8);'),
    dict(id="M10", fichier=RT, attendu="C7",
         titre="une zone de nettoyage blanche redevient une ligne de registre",
         avant='    const zone = lireTexte(zone_name, 200);\n'
               '    if (zone === undefined) return res.status(400).json(estRejete(["zone_name"]));',
         apres='    const zone = (zone_name === undefined || zone_name === null)\n'
               '      ? "inconnue" : String(zone_name).trim().slice(0, 200);'),
    dict(id="M11", fichier=RT, attendu="C6",
         titre="la releve IoT hors plage redevient inscriptible",
         avant='    const tempVal = nombreDeReleve(temperature, TEMPERATURE_MIN, TEMPERATURE_MAX);\n'
               '    if (tempVal === undefined) return res.status(400).json(estRejete(["temperature"]));',
         apres='    const tempVal = Number(temperature) || 0;'),
    dict(id="M12", fichier=RT, attendu="C5",
         titre="le 409 de collision de capteur redevient un 200 muet",
         avant='      return res.status(409).json(',
         apres='      return res.status(200).json('),
]


def controler():
    """Chaque ancre doit etre vue EXACTEMENT une fois sur les octets relus."""
    lacs = []
    for m in MUTATIONS:
        octets = open(m["fichier"], encoding="utf-8").read()
        n = octets.count(m["avant"])
        lignes = octets.splitlines()
        dans_commentaire = any(l.strip().startswith("//") and m["avant"].strip() in l
                              for l in lignes)
        if n != 1:
            lacs.append("%s: ancre vue %d fois%s" % (
                m["id"], n, " (et uniquement dans un COMMENTAIRE: la mutation ne "
                            "peut pas rougir le produit)" if dans_commentaire else ""))
    return lacs


if __name__ == "__main__":
    lacs = controler()
    for m in MUTATIONS:
        print("%-4s %-3s %s" % (m["id"], m["attendu"], m["titre"]))
    print("ANCRE_MORTE" if lacs else "ANCRE_ES_ALL_VERT", len(MUTATIONS), "mutations")
    for l in lacs:
        print("  " + l)
    raise SystemExit(1 if lacs else 0)
