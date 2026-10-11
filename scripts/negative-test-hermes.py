#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du cerveau Hermes (chantier 5) : elle prouve que verify:hermes
peut ROUGIR.

La mutation : on neutralise le check de la liste blanche dans
src/services/hermes.ts (parseSuggestions accepte une action_route inventee)
-> la proposition du cerveau factice vise /api/purchasing/order qui n'est
PAS dans la liste du contrat H3c... non : elle y est. La morsure jugee est
l'INVERSE : on remplace le cerveau factice par un cerveau MUET (il rend un
JSON illisible) -> la boucle ne depose RIEN -> H3a rougit.

Non. La morsure qui prouve le contrat est celle qui casse la DEPOSITION :
on neutralise l'INSERT dans la route -> H3b rougit (aucune ligne en base
alors que le scan rend 200). Puis RESTAURATION PROUVEE (lecon chantier 4).

Lancement : python3 scripts/negative-test-hermes.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERMES = os.path.join(BASE, "src", "routes", "hermes.ts")

ANCRE = '        await db.run(\n          `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)'


def main():
    src = open(HERMES, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_ABSENTE ou AMBIGUE: l'INSERT de la boite est vu", src.count(ANCRE), "fois.")
        return 1
    statut = subprocess.run(["git", "status", "--porcelain", "src/routes/hermes.ts"],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/routes/hermes.ts a des changements non committes:", statut)
        return 1

    # Mutation : l'INSERT est saute (la boucle "rend 200" mais ne depose plus
    # rien). H3a rougit (deposees=0) ET H3b rougit (0 ligne en base).
    lignes = src.splitlines(True)
    idx = None
    for n, l in enumerate(lignes):
        if l == ANCRE:
            idx = n
            break
    if idx is None:
        print("ANCRE_ABSENTE: l'INSERT n'est plus la (forme changee ?).")
        return 1
    mute = "".join(lignes[:idx]) + "        if (false) await db.run(\n          `INSERT INTO suggestions (id, type, priorite, titre, explication, action_route, action_payload)" + "".join(lignes[idx + 1:])

    with open(HERMES, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", "verify-hermes.mjs")],
                           capture_output=True, text=True, cwd=BASE, timeout=300)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "H3a propositions deposees" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur l'INSERT mort")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if "H3" in l or "ECHEC" in l or "Error" in l:
                    print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand la deposition est morte")
        for l in sortie.splitlines():
            if "H3" in l:
                print("   " + l)
        return 0
    finally:
        # RESTAURATION + PREUVE (lecon chantier 4 : un checkout silencieux sur
        # un fichier non suivi ne restaure RIEN).
        subprocess.run(["git", "checkout", "--", "src/routes/hermes.ts"], cwd=BASE)
        reste = subprocess.run(["git", "status", "--porcelain", "src/routes/hermes.ts"],
                               capture_output=True, text=True, cwd=BASE).stdout.strip()
        if reste:
            blob = subprocess.run(["git", "show", "HEAD:src/routes/hermes.ts"],
                                  capture_output=True, text=True, cwd=BASE).stdout
            with open(HERMES, "w", encoding="utf-8") as f:
                f.write(blob)
            reste2 = subprocess.run(["git", "status", "--porcelain", "src/routes/hermes.ts"],
                                    capture_output=True, text=True, cwd=BASE).stdout.strip()
            if reste2:
                print("RESTAURATION_IMPOSSIBLE: le fichier differe encore de HEAD.")
                sys.exit(9)


if __name__ == "__main__":
    sys.exit(main())
