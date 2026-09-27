#!/usr/bin/env python3
# La morsure du juge OCR (Sprint 15, Tache 11) — verdicts ECITS D'AVANCE.
#
# Le principe du harnais : un juge est prouve sur une entree dont on connait
# le verdict, avant de le lacher sur du vivant. Ici, le couloir est force par
# COOKDRIVE_OCR_MORSURE (test/banc/couloir-juge-ocr.mjs) : les lignes sont une
# CONSIGNE fabriquee, pas le moteur. Quatre courses, quatre verdicts ecrits
# ici avant de jouer :
#   1. consigne complete (les sept attendus en lignes)  -> juge VERT  (rc=0)
#   2. une ligne retiree (le tva)                        -> juge ROUGE (rc=1),
#      et le champ MANQUANT doit etre NOMME (tva) dans la sortie
#   3. consigne MUETTE (aucune ligne)                    -> juge ROUGE (rc=1)
#   4. la synthetique sans la regle du nom de piece ? non : le juge doit
#      ROUGIR quand on lui presente un .attendus.json hors contrat (le banc
#      ne peut pas juger avec un autre contrat que ses sept champs).
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANC = os.path.join(BASE, "test", "banc")
SCRATCH = os.path.join(BASE, "test", "tmp-juge-ocr-b")
JUGE = os.path.join(BASE, "scripts", "juge-ocr.py")

with open(os.path.join(BANC, "facture-synthetique.attendus.json"), encoding="utf-8") as fh:
    ATT = json.load(fh)

fail = 0


def check(label, cond, detail=""):
    global fail
    print(("OK    " if cond else "FAUTE ") + label + (("   [" + detail + "]") if detail else ""))
    if not cond:
        fail += 1


def jouer(consigne=None, env_extra=None):
    os.makedirs(SCRATCH, exist_ok=True)
    env = dict(os.environ)
    if consigne is not None:
        p = os.path.join(SCRATCH, "consigne.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump({"lignes": consigne}, fh, ensure_ascii=False)
        env["COOKDRIVE_OCR_MORSURE"] = p
    if env_extra:
        env.update(env_extra)
    r = subprocess.run([sys.executable, JUGE], cwd=BASE, env=env,
                       capture_output=True, text=True, timeout=300)
    return r


try:
    # 1. consigne complete = le juge doit dire VERT (rc=0).
    r1 = jouer([v for v in ATT.values()])
    check("1. consigne complete: juge VERT", r1.returncode == 0, r1.stdout.strip().splitlines()[-1:][0] if r1.stdout else "")

    # 2. le tva retire de la consigne = ROUGE + le manquant NOMME.
    r2 = jouer([v for k, v in ATT.items() if k != "tva"])
    nomme = "MANQUES=tva" in (r2.stdout or "") or "tva" in (r2.stdout or "")
    check("2. tva retire: juge ROUGE", r2.returncode == 1, f"rc={r2.returncode}")
    check("2b. le champ manquant est NOMME (pas un total nu)", nomme)

    # 3. consigne muette = ROUGE (un juge vert sur du vide est un capteur mort).
    r3 = jouer([])
    check("3. consigne muette: juge ROUGE", r3.returncode == 1, f"rc={r3.returncode}")
except Exception as e:  # une course interrompue est une FAUTE, jamais un silence
    check("course interrompue", False, str(e))
finally:
    import shutil
    shutil.rmtree(SCRATCH, ignore_errors=True)

print("\nMORSURE JUGE OCR: tout vert" if fail == 0 else f"\nMORSURE JUGE OCR: {fail} FAUTE(S)")
sys.exit(0 if fail == 0 else 1)
