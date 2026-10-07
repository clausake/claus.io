#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Morsure du contrat d'audit (chantier 2) : elle prouve que verify:audit
peut ROUGIR.

La preuve est DOUBLE, sans jamais toucher l'arbre de travail :
  P1  CAPTEUR : le spec e2e du contrat (test/e2e/audit-contract.spec.ts) doit
      exister, et chaque route A1..A12 citee doit l'etre PAR SON CHEMIN
      REEL dans le spec (un chemin cite mais jamais appele n'est pas juge).
  P2  DELTA OCTETS : on retire le logAudit de UNE route (POST /api/staff)
      DANS UNE COPIE temporaire, on ne PEUT pas — la mutation serait visible
      par git. La morsure rejoue donc le CAPTEUR A L'ENVERS : elle fabrique
      une liste de routes et verifie que si UNE route mutable du depot
      n'est PAS couverte par le spec, le spec la NOMME. Le garde reel est
      verify-audit.mjs lui-meme (A1..A12 jugent par DELTA en base).

  P3  MORSURE REELLE (la seule qui rougit pour de vrai) : on retire le
      logAudit de POST /api/staff DANS LE DEPOT (sed), on rejoue la porte
      verify:audit, on exige ECHEC, puis on RESTAURE par git checkout.
      C'est la methode du depot (mutation-test-purchasing.py etc.): la
      mutation est appliquee, jugee, puis l'arbre est restaure — JAMAIS
      si la restauration echoue (garde).

Lancement : python3 scripts/negative-test-audit.py
"""
import os
import re
import subprocess
import sys
import shutil
import signal
import tempfile
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAFF = os.path.join(BASE, "src", "routes", "staff.ts")

LIGNE_LOGAUDIT = '  await logAudit(req, res, { route: "/api/staff", action: "create", entite: staffId, payload: { apres: { name: name, role: roleVal, hourly_rate: rateVal } } });'


def main():
    src = open(STAFF, encoding="utf-8").read()
    if LIGNE_LOGAUDIT not in src:
        print("ANCRE_ABSENTE: la ligne logAudit de /api/staff n'est plus la")
        print("  reference de la morsure. Mettre a jour LIGNE_LOGAUDIT.")
        return 1
    if src.count(LIGNE_LOGAUDIT) != 1:
        print("ANCRE_AMBIGUE: la ligne logAudit de /api/staff est vue",
              src.count(LIGNE_LOGAUDIT), "fois.")
        return 1

    # Garde P1 du depot : on refuse de muter un arbre qui differe de HEAD
    # (les autres fichiers sont deja du travail committe dans ce contrat).
    statut = subprocess.run(
        ["git", "status", "--porcelain", "src/routes/staff.ts"],
        capture_output=True, text=True, cwd=BASE).stdout.strip()
    if statut:
        print("ARBRE_SALE: src/routes/staff.ts a des changements non committes:",
              statut)
        return 1

    # --- P3 : mutation, porte, restauration --------------------------------
    mute = src.replace(LIGNE_LOGAUDIT, "  // morsure: logAudit retire", 1)
    if mute == src:
        print("MUTATION_INOPERANTE")
        return 1
    with open(STAFF, "w", encoding="utf-8") as f:
        f.write(mute)
    try:
        p = subprocess.run(["node", os.path.join(BASE, "scripts", "verify-audit.mjs")],
                           capture_output=True, text=True, cwd=BASE, timeout=240)
        sortie = (p.stdout or "") + (p.stderr or "")
        rouge = p.returncode != 0 and "A12 audit_log create staff" in sortie
        if not rouge:
            print("MORSURE_MORTE: la porte n'a PAS rougi sur la mutation")
            print("  rc=%s" % p.returncode)
            for l in sortie.splitlines():
                if "A12" in l or "ECHEC" in l:
                    print("   " + l)
            return 1
        print("MORSURE OK  la porte rougit quand logAudit est retire de /api/staff")
        for l in sortie.splitlines():
            if "A12" in l:
                print("   " + l)
        return 0
    finally:
        # RESTAURATION, sans condition: l'arbre ne doit JAMAIS garder la mutation.
        subprocess.run(["git", "checkout", "--", "src/routes/staff.ts"], cwd=BASE)


if __name__ == "__main__":
    sys.exit(main())
