#!/usr/bin/env python3
# Le juge OCR par piece (Sprint 15, Tache 11).
#
# Il rend, PAR MOTEUR et PAR PIECE : le taux d'erreur de caractere (distance
# d'edition entre l'attendu et la meilleure ligne rendue), le nombre de champs
# atteints (par LIGNES SEPAREES — la retractation 1 du contrat, le juge fondu
# comptoit faux), et le TEMPS (p50/p95 sur les pieces jouees).
#
# La LECTURE n'est pas jouee ici : elle passe par le couloir tsx
# (test/banc/couloir-juge-ocr.mjs) qui joue le VRAI moteur, dans le meme
# contexte que le produit. Python ne fait que juger — un juge qui lirait ne
# jugerait plus la voie de lecture.
#
# LA REGLE DU CONTRAT (etape 3) : aucun moteur ne peut etre declare « pret »
# sur la seule facture synthetique. Si la banque du chef
# (test/fixtures/factures/) est vide, le juge joue la synthetique, affiche le
# tableau, et rend explicitement PRET: non juge (rc=0 — rien n'echoue : ce qui
# manque est l'epreuve, pas le moteur ; le manque est DIT, pas cache).
#
# MORSURE du banc (jouee par juge-ocr-b.py, verdict ecrit d'avance) : une
# ligne retiree du couloir doit faire baisser le compte des champs ATTEINTS —
# un juge qui rend toujours 7/7 ne juge rien.
import json
import os
import statistics
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANC = os.path.join(BASE, "test", "banc")
BANQUE = os.path.join(BASE, "test", "fixtures", "factures")
COULOIR = os.path.join(BANC, "couloir-juge-ocr.mjs")
CHAMPS = ["raison_sociale", "date_emission", "facture_numero", "siret",
          "total_ht", "tva", "total_ttc"]


def dist_edition(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def norm(s: str) -> str:
    return " ".join(str(s).split())


def lire_piece(image: str, moteur: str):
    """La voie du produit : le couloir tsx rend les lignes + la duree.
    Un rc non nul est une faute NOMMEE (poids absents, piece absente) — le
    juge la rend, il ne la compte pas comme « 0 atteint »."""
    r = subprocess.run(
        [os.path.join(BASE, "node_modules", ".bin", "tsx"), COULOIR, image, moteur],
        cwd=BASE, capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip() or f"rc={r.returncode}")
    return json.loads(r.stdout)


def juger_piece(image: str, attendus: dict, moteur: str):
    lu = lire_piece(image, moteur)
    lignes = [norm(l) for l in lu["lignes"]]
    champs = {}
    for nom, texte in attendus.items():
        if texte == "ABSENT DE LA PIECE":
            # Champ NA : la piece publique ne porte pas ce champ (mesure
            # 27/09 : les factures du jeu public n'ont pas de SIRET). Le
            # compter MANQUE falsifierait le score — le juge le nomme NA.
            champs[nom] = {"atteint": True, "cer": 0.0, "na": True}
            continue
        cible = norm(texte)
        # Le juge par LIGNES (egaute ou inclusion) ; le taux d'erreur regarde
        # la MEILLEURE ligne (la distance d'edition la plus courte), pas la
        # premiere venue — une piece peut rendre le SIRET sur deux lignes.
        atteint = any(l == cible or cible in l for l in lignes)
        meilleur = min((dist_edition(l, cible) for l in lignes), default=len(cible))
        champs[nom] = {"atteint": atteint, "cer": round(meilleur / max(len(cible), 1), 4)}
    atteint_total = sum(1 for c in champs.values() if c["atteint"])
    return {"piece": os.path.basename(image), "moteur": lu["moteur"],
            "duree_ms": lu["duree_ms"], "champs": champs,
            "atteint": f"{atteint_total}/{len(attendus)}",
            "cer_moyen": round(statistics.fmean(c["cer"] for c in champs.values()), 4)}


def pieces_de_la_banque():
    """Les pieces reelles du chef (+ leur .attendus.json jumeau)."""
    sortie = []
    if not os.path.isdir(BANQUE):
        return sortie
    for f in sorted(os.listdir(BANQUE)):
        if f.lower().endswith((".png", ".jpg", ".jpeg")):
            att = os.path.join(BANQUE, f + ".attendus.json")
            if os.path.exists(att):
                with open(att, encoding="utf-8") as fh:
                    a = json.load(fh)
                if sorted(a) != sorted(CHAMPS):
                    raise RuntimeError(f"{f}: attendus differents des sept champs du contrat")
                sortie.append((os.path.join(BANQUE, f), a))
    return sortie


def main() -> int:
    with open(os.path.join(BANC, "facture-synthetique.attendus.json"), encoding="utf-8") as fh:
        attendus_syn = json.load(fh)
    if sorted(attendus_syn) != sorted(CHAMPS):
        print("FAUTE: les attendus du banc ne sont pas les sept champs du contrat")
        return 1

    pieces = [(os.path.join(BANC, "facture-synthetique.png"), attendus_syn, "synthetique")]
    pieces += [(p, a, "reelle") for (p, a) in pieces_de_la_banque()]

    moteur = sys.argv[1] if len(sys.argv) > 1 else "paddle"
    resultats, temps, rouges = [], [], 0
    for image, attendus, genre in pieces:
        try:
            r = juger_piece(image, attendus, moteur)
        except Exception as e:
            print(f"FAUTE {genre} {os.path.basename(image)}: {e}")
            rouges += 1
            continue
        r["genre"] = genre
        resultats.append(r)
        temps.append(r["duree_ms"])
        manquent = [n for n, c in r["champs"].items() if not c["atteint"]]
        print(f"{genre:10s} {r['piece']:34s} moteur={r['moteur']:8s} "
              f"champs={r['atteint']:4s} cer={r['cer_moyen']:.4f} "
              f"duree={r['duree_ms']}ms" + (f" MANQUES={','.join(manquent)}" if manquent else ""))

    if temps:
        print(f"TEMPS p50={int(statistics.median(temps))}ms "
              f"p95={int(sorted(temps)[max(0, int(len(temps)*0.95)-1)])}ms sur {len(temps)} piece(s)")

    # La regle du contrat : la synthetique seule ne declare personne pret.
    reels = [r for r in resultats if r["genre"] == "reelle"]
    if not reels:
        print("PRET: non juge — la banque du chef (test/fixtures/factures/) est vide ; "
              "aucun moteur ne peut etre declare « pret » sur la seule synthetique (contrat, etape 3).")
    syn = next((r for r in resultats if r["genre"] == "synthetique"), None)
    if syn is None:
        print("ROUGE: la piece du banc (la source de verite des gardes) n'a pas ete jouee")
        return 1
    if syn["atteint"] != "7/7":
        # La synthetique est LA piece d'essai scellee : 7/7 est son attendu.
        # En dessous, c'est le moteur qui ne lit pas — faute nommee, rouge.
        print("ROUGE: la synthetique du banc ne rend pas 7/7 — le moteur ne lit pas la piece d'essai")
        return 1
    if rouges:
        print(f"ROUGE: {rouges} piece(s) en faute")
        return 1
    print(f"JUGE OCR: vert ({len(resultats)} piece(s), champs de la synthetique 7/7)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
