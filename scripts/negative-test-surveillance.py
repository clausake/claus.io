#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du moteur de surveillance (chantier 4) : elle prouve que
verify: surveillance peut ROUGIR.

La mutation : on retire le FILTRE de deduplication (le scan reposte les
memes cles a chaque fois) -> S7a doit rougir (deposees > 0 au deuxieme
scan). Puis RESTAURATION par git checkout (garde ARBRE_SALE).

Lancement : python3 scripts/negative-test-surveillance.py
"""
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SURV = os.path.join(BASE, "src", "routes", "surveillance.ts")

# La deduplication vit DEUX fois : le filtre de la ROUTE (cles deja deposees
# aujourd'hui, lues en base) et le filtre du SERVICE (doublons intra-scan).
# La morsure neutralise CELLE DE LA ROUTE : c'est elle qui fait passer
# deposees a 0 au second scan (S7a). Une mutation sur le service seul est
# masquee par la couche route (mesure du premier run).
ANCRE = 'if (clesExistantes.has(p.cle)) { ignorees.push(p.cle); continue; }'


def main():
    src = open(SURV, encoding="utf-8").read()
    if src.count(ANCRE) != 1:
        print("ANCRE_AMBIGUE: le filtre de dedup est vu", src.count(ANCRE), "fois.")
        return 1
    statut = subprocess.run(["git", "status", "--porcelain", "src/routes/surveillance.ts"],
                            capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/routes/surveillance.ts a des changements non committes:", statut)
        return 1

    # Mutation : le filtre de la route est NEUTRALISE — le scan reposte les
    # memes cles a chaque fois. S7a doit rougir (deposees > 0 au deuxieme
    # scan). Syntaxiquement valide : on remplace le corps du if par un
    # commentaire (le if devient vide mais reste correct).
    lignes = src.splitlines(True)
    idx = None
    for n, l in enumerate(lignes):
        if l.strip() == ANCRE.strip():
            idx = n
            break
    if idx is None:
        print("ANCRE_ABSENTE: le filtre de dedup de la route n'est plus la.")
        return 1
    mute = "".join(lignes[:idx]) + "        if (false) { ignorees.push(p.cle); continue; } // morsure: dedup route morte\n" + "".join(lignes[idx + 1:])
    if mute == src:
        print("MUTATION_INOPERANTE")
        return 1

    with open(SURV, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", "verify-surveillance.mjs")],
                           capture_output=True, text=True, cwd=BASE, timeout=240)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "S7a rejouer le scan" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur la dedup morte")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if "S7" in l or "ECHEC" in l or "Error" in l:
                    print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand la deduplication est morte")
        for l in sortie.splitlines():
            if "S7" in l:
                print("   " + l)
        return 0
    finally:
        # RESTAURATION + PREUVE : un checkout silencieux sur un fichier non
        # suivi ne restaure RIEN (le fichier restait mute dans l'arbre et le
        # lot verify:surveillance rougissait APRES la morsure — mesure du
        # 08/10). La restauration est VERIFIEE : si le fichier differe encore
        # de HEAD, on restaure depuis le blob et on EXIGE l'egalite.
        subprocess.run(["git", "checkout", "--", "src/routes/surveillance.ts"], cwd=BASE)
        reste = subprocess.run(["git", "status", "--porcelain", "src/routes/surveillance.ts"],
                               capture_output=True, text=True, cwd=BASE).stdout.strip()
        if reste:
            # Fichier non suivi ou differe encore : re-ecrire depuis HEAD.
            blob = subprocess.run(["git", "show", "HEAD:src/routes/surveillance.ts"],
                                  capture_output=True, text=True, cwd=BASE).stdout
            with open(SURV, "w", encoding="utf-8") as f:
                f.write(blob)
            reste2 = subprocess.run(["git", "status", "--porcelain", "src/routes/surveillance.ts"],
                                    capture_output=True, text=True, cwd=BASE).stdout.strip()
            if reste2:
                print("RESTAURATION_IMPOSSIBLE: le fichier differe encore de HEAD — corriger a la main.")
                sys.exit(9)


if __name__ == "__main__":
    sys.exit(main())
