#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lot des portes de qualite, avec les verdicts LUS et non inferez.

Pourquoi ce script existe: les portes sont dix-sept commandes npm, et les lancer
dans une chaine shell produit un verdict qui ment de deux facons:
  - le `rc` d'une chaine est celui du DERNIER element: neuf portes rouges puis
    une verte rendent "tout vert";
  - les sorties se melangent, et un "passed" qui vient du lot precedent se lit
    comme le verdict du lot courant.
Ici chaque porte a son rc propre, sa queue de sortie est consignee dans un
fichier, et le resume final est rendu en TOKENS (gates=14 rc_sse=0 ...), pas
dans un tableau de noms: le rendu de ce poste altere les identifiants (piege
consigned dans PHASES.md), un nombre survit, un nom de check non.

Lancement: python3 scripts/run-all-gates.py [port1 port2 ...]
"""
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "test", "gates.out")
COURSE_ID = os.path.basename(sys.argv[0]) + "-" + str(os.getpid())
OUT = os.path.join(BASE, "test", "gates-" + COURSE_ID + ".out")
SYMLINK = os.path.join(BASE, "test", "gates.out")

DEFAUT = ["verify:split",
          # Le journal chaud est la seule entree shared par tous les agents; s'il
          # est recolle mal (une ligne perdue dans une archive), chaque agent lit
          # desormais un faux sans le savoir. La porte verifie par sha256 que
          # chaud+archives se recollent a l'original consigne. Sans elle dans
          # DEFAUT, elle n'est jouee que si un agent y pense: une porte que
          # personne n'appelle n'est pas une porte.
          "verify:sse", "verify:perf", "verify:http", "verify:bundle",
          "verify:ratelimit", "verify:ci", "verify:indices",
          "verify:instance-guard", "verify:instance-mord",
          "verify:purchasing", "verify:forecast", "verify:forecast-mord",
          "verify:ready", "verify:ready-mord",
          "verify:inventory-put",
          # les trois portes du contrat des prix fournisseurs: une par VOIE
          # D'ECRITURE de la colonne jugeable (saisie unitaire, import CSV,
          # validation de facture). Les retirer rend le contrat jugeable
          # partiellement sans que personne ne le voie.
          "verify:supplier-price", "verify:supplier-import",
          "verify:documents-validate",
          # Les deux portes d'ECRITURE d'inventaire du Sprint 8, chacune avec sa
          # preuve de morsure: consume (decrement de stock du chariot de
          # production) et post-inventory (la CREATION, qui avait TROIS voies dans
          # l'UI dont une morte en 500). Sans elles, une de ces routes peut
          # redevenir un 500 generalise sans qu'aucun lot ne le voie.
          "verify:consume", "verify:consume-mord",
          "verify:post-inventory", "verify:post-inventory-mord",
          # Les trois portes du contrat des LIGNES DE DOCUMENT (Sprint 9):
          # le spec de contrat, sa preuve de morsure, et la sonde des voies
          # REELLES (celle qui force le payload vide de l'UI a ARRIVER vide).
          # Les retirer rend la porte d'entree de document_items jugeable
          # partiellement sans qu'aucun lot ne le voie.
          "verify:document-items", "verify:document-items-mord",
          "verify:document-items-voices",
          # Le contrat HACCP (Sprint 11): les routes d'ecriture du seul domaine
          # qui porte une OBLIGATION REGLEMENTAIRE (regl. (CE) n°852/2004 art. 5).
          # Les 5 tests HACCP de routes.spec.ts etaient des GET nominaux (un PASS
          # creux); les 8 CHEMINS C1..C8 jugent desormais l'ECRITURE et la
          # RELECTURE, et la morsure prouve que les 12 regles peuvent rougir.
          # Sans la porte `-mord`, l'une de ces routes peut redevenir un 200 muet
          # (releve en texte, lot a 0 kg, action corrective orphelinee) sans
          # qu'aucun lot ne le voie.
          "verify:haccp", "verify:haccp-mord",
          # Le contrat RECETTES (Sprint 12): les routes d'ecriture du domain
          # des recettes (POST/PUT/DELETE/save/generate-steps), chacune avec sa
          # preuve de morsure et les sondes des voies REELLES. Sans elles,
          # une de ces routes peut redevenir un 500 ou un 200 muet sans qu'aucun
          # lot ne le voie.
          "verify:recipes", "verify:recipes-mord",
          "verify:recipes-voices", "verify:recipes-put",
          # La spec de routes generales (47 tests, port fige 3999): la spec
          # reste NOMINALE (jouee manuellement) faute de gate.
          "verify:routes"]

# Le contrat de ce lot: les portes sont LUEES dans package.json, jamais recopiees
# ici. Une liste recopiee se perime silencieusement des qu'une porte change de
# nom (la meme faute que les budgets de BUDGETS recopies dans audit-perf.mjs, qui
# a fait annoncer un 429 inexistant pendant des jours).
def portes_declarees():
    with open(os.path.join(BASE, "package.json"), encoding="utf-8") as f:
        return set(json.load(f).get("scripts", {}))


def main(cible):
    declarees = portes_declarees()
    inconnues = [g for g in cible if g not in declarees]
    if inconnues:
        # Une porte qui n'existe plus dans package.json n'est pas une porte verte:
        # c'est une porte qui a cesse d'etre jugee. Elle doit etre nommee.
        print("PORTES_INCONNUES " + "|".join(inconnues))
        return 2

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.remove(OUT) if os.path.lexists(OUT) else None
    with open(OUT, "w", encoding="utf-8") as log:
        verdicts = []
        for g in cible:
            p = subprocess.run(["npm", "run", g, "--silent"], cwd=BASE,
                               capture_output=True, text=True, timeout=1800)
            txt = (p.stdout or "") + (p.stderr or "")
            verdicts.append((g, p.returncode))
            log.write("\n===== %s rc=%s =====\n%s\n" % (g, p.returncode, txt[-2500:]))
            log.flush()

    rouges = [g for g, rc in verdicts if rc != 0]
    with open(OUT, "a", encoding="utf-8") as log:
        log.write("\nGATES=%d\nROUGES=%d\n" % (len(verdicts), len(rouges)))
        if rouges:
            log.write("LISTE " + "|".join(rouges) + "\n")
        log.write("LOG " + OUT + "\n")
        log.flush()
    print("GATES=%d" % len(verdicts))
    for g, rc in verdicts:
        print("RC %s %d" % (g.replace(":", "_"), rc))
    print("ROUGES=%d" % len(rouges))
    if rouges:
        print("LISTE " + "|".join(rouges))
    # le OUT nominal du lecteur (test/gates.out) est un SYMLINK vers la course courante.
    # DEUX courses qui finissent ensemble meurent FileExistsError sur os.symlink sans
    # remplacement atomique: le lien est creé sous un NOM TEMPORAIRE (unique par course)
    # puis os.replace l'installe en UN geste atomique (POSIX rename(2) sur un symlink).
    TMP_LINK = SYMLINK + "-" + COURSE_ID + ".tmp"
    if os.path.lexists(TMP_LINK):
        os.remove(TMP_LINK)
    os.symlink(os.path.basename(OUT), TMP_LINK)
    os.replace(TMP_LINK, SYMLINK)
    print("LOG " + OUT)
    return 1 if rouges else 0


if __name__ == "__main__":
    cible = sys.argv[1:] or DEFAUT
    sys.exit(main(cible))
