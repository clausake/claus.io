#!/usr/bin/env python3
"""La MORSURE de verify:garde-fantomes.

Une porte qui ne peut pas rougir n'est pas une mesure. Ce script réintroduit
les DEUX défauts réellement mesurés dans les sept juges, un par un, et exige que
la porte ROUGISSE sur chacun :

  A. `cookdrive-project` — l'ancien nom du dépôt (défaut du 29/10 : le garde ne
     tuait rien, un fils de 47 min gardait le port et `verify:auth` rendait
     409 SETUP_DEJA_FAIT sur la vieille base) ;
  B. `.clausio/claus.io` — le chemin de la machine de développement (défaut du
     30/10 : vert sur ce poste, mais sur la CI GitHub le dépôt vit dans
     /home/runner/work/claus.io/claus.io — `fils_vus=0` et la porte elle-même
     rougissait « decorative » au milieu d'un lot 88/90 vert).

Le remède n'est pas « le bon littéral » (il n'en existe aucun) mais la
DÉRIVATION : la racine vient de `fileURLToPath(import.meta.url)`. Un motif écrit
à la main est vrai sur une machine et faux ailleurs.

Lancement : python3 scripts/negative-test-garde-fantomes.py
"""
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTE = os.path.join(BASE, "scripts", "verify-garde-fantomes.py")
NOMS = ("verify-auth", "verify-audit", "verify-hermes", "verify-mode-agent",
        "verify-mode-manuel", "verify-suggestions", "verify-surveillance")
DERIVE = "cmdline.includes(RACINE)"
DEFUNTS = ("cookdrive-project", ".clausio/claus.io")


def rejouer():
    r = subprocess.run([sys.executable, PORTE], cwd=BASE, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    cibles = [os.path.join(BASE, "scripts", n + ".mjs") for n in NOMS]
    originaux = {}
    try:
        for p in cibles:
            originaux[p] = open(p, encoding="utf-8").read()

        rc, out = rejouer()
        if rc != 0:
            print("MORSURE_INJUSTE : la porte est rouge avant toute mutation")
            print(out)
            return 1

        for defunt in DEFUNTS:
            mutants = 0
            for p in cibles:
                # les sept n'ont pas la meme forme de ligne : on remplace l'APPEL
                # derive par l'appel au litteral, quelle que soit la variable lue.
                mute = re.sub(r"(m\[1\]|cmdline)\.includes\(RACINE\)",
                              lambda m: '%s.includes("%s")' % (m.group(1), defunt),
                              originaux[p])
                if mute == originaux[p]:
                    print("MORSURE_INJUSTE : %s n'applique pas le motif derive, rien a muter" % p)
                    return 1
                open(p, "w", encoding="utf-8").write(mute)
                mutants += 1
            rc, out = rejouer()
            etat = "ROUGE (attendu)" if rc != 0 else "VERTE (porte decorative)"
            print("  mutation -> `%s` sur %d juges : %s" % (defunt, mutants, etat))
            if rc == 0:
                print(out)
                return 1
            rouges = len(re.findall(r"ROUGE ", out))
            if rouges < mutants:
                print("  la porte ne nomme que %d juges sur %d : elle voit le defaut "
                      "a moitie" % (rouges, mutants))
                return 1
            # remise en propre avant la mutation suivante
            for p in cibles:
                open(p, "w", encoding="utf-8").write(originaux[p])

        print("NEGATIF-GARDE-FANTOMES juges=%d defauts=%d rouges=%d"
              % (len(cibles), len(DEFUNTS), len(cibles) * len(DEFUNTS)))
        print("VERDICT : la porte voit les deux gardes qui ne tuent rien")
        return 0
    finally:
        for p, s in originaux.items():
            open(p, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    sys.exit(main())
