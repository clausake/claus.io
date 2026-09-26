"""Relance le juge des gardes, la troisime section corriger.

La version precedente levait ValueError sur l'emballage de ses mutations
(« not enough values to unpack »): chaque entree ne portait que DEUX champs
pour TROIS variables. Leçon du Sprint 14.f: ne pas presumer de la forme d'un
harnais, la lire. Ici l'entree est declaree en dict, pas en tuple de taille
fragile, et chaque mutation porte la VALEUR LUE qui doit rougir la garde.
"""
import datetime as dt
import json
import re

PIECE = "test/banc/facture-synthetique.attendus.json"

# Les lignes de la piece, telles que le generateur les imprime
LIGNES = [
    ("Pommes de terre Agria 25 kg", 2, 34.90, 69.80),
    ("Beurre doux de laite AOP 5 kg", 3, 21.50, 64.50),
    ("Vin rouge AOC Cotes-du-Rhone", 6, 18.75, 112.50),
    ("Sel gris de Guerande 100 g", 100, 0.08, 8.00),
    ("Eau de vie de la Mer 75 cl", 12, 2.40, 28.80),
    ("Houblon vert d'Ornon 500 g", 4, 9.95, 39.80),
    ("Edelweiss du Chasseur 1 kg", 5, 14.20, 71.00),
    ("Rue des Martyrs - Epices 250 g", 8, 3.15, 25.20),
]
HUI = dt.date(2026, 9, 25)


def garde_ligne(quantite, prix, montant):
    return round(quantite * prix, 2) == round(montant, 2)


def garde_totale(lignes, total_ht):
    return round(sum(m for _, _, _, m in lignes), 2) == round(total_ht, 2)


def garde_dlc(chaine, libelle):
    """DLC et DDM (date de durac minimum) sont DEUX regles distinctes."""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", chaine)
    if not m:
        return "REFUSE (forme non lisible)"
    j, mo, a = (int(x) for x in m.groups())
    try:
        jour = dt.date(a, mo, j)
    except ValueError:
        return "REFUSE (date inexistante)"
    if "consommer jusqu'au" in libelle:
        return ("REFUSE (DLC passee)" if jour < HUI else "ACCEPTE (DLC future)")
    if "de preference" in libelle:
        return "ACCEPTE (DDM: une date passee est licite)"
    return "ACCEPTE (sans libelle)"


print("=" * 70)
print("(3) LES MUETANCES: la garde doit ROUGIR sur chaque faute de lecture")
print("=" * 70)
MUTATIONS = [
    {"nom": "confusion 0->O", "ligne": "Eau de vie de la Mer 75 cl",
     "q": 12, "pu": 2.40, "lu": 28.80, "lu_alt": 28.00},
    {"nom": "confusion 5->S", "ligne": "Houblon vert d'Ornon 500 g",
     "q": 4, "pu": 9.95, "lu": 39.80, "lu_alt": 39.60},
    {"nom": "transposition", "ligne": "Edelweiss du Chasseur 1 kg",
     "q": 5, "pu": 14.20, "lu": 71.00, "lu_alt": 17.00},
    {"nom": "glissement decimal", "ligne": "Vin rouge AOC Cotes-du-Rhone",
     "q": 6, "pu": 18.75, "lu": 112.50, "lu_alt": 11.25},
]
rouges = 0
for mut in MUTATIONS:
    nommee = [l for l in LIGNES if l[0] == mut["ligne"]]
    assert len(nommee) == 1, ("ligne du banc introuvable", mut["ligne"])
    base = nommee[0]
    assert garde_ligne(base[1], base[2], base[3]), "le sain doit passer"
    mutile = [(d, q, p, (mut["lu_alt"] if d == mut["ligne"] else m))
              for (d, q, p, m) in LIGNES]
    passe = garde_totale(mutile, sum(x[3] for x in LIGNES))
    etat = ("<<< FAUX NEGATIF (la garde n'a rien vu)" if passe
            else "ROUGE (la garde a vu)")
    rouges += 0 if passe else 1
    print(f"  {mut['nom']:<20} {base[0][:31]:<31} "
          f"{base[3]:>8} -> {mut['lu_alt']:<8} {etat}")

TOTAL = sum(x[3] for x in LIGNES)
print(f"\n  mutations rougies par la garde: {rouges}/{len(MUTATIONS)}"
      f"  (attendu: {len(MUTATIONS)})")
print(f"  temoin SAIN (aucune mutation) -> "
      f"{'VERT (attendu)' if garde_totale(LIGNES, TOTAL) else '<<< ROUGE SUR DU SAIN: garde morte'}")

print()
print("=" * 70)
print("(4) DLC / DDM: les deux regles ne sont pas la meme regle")
print("=" * 70)
for chaine, libelle, attendu in (
    ("05/10/2026", "a consommer jusqu'au", "ACCEPTE (DLC future)"),
    ("20/09/2026", "a consommer jusqu'au", "REFUSE (DLC passee)"),
    ("20/09/2026", "a consommer de preference jusqu'au", "ACCEPTE (DDM: une date passee est licite)"),
    ("31/02/2026", "a consommer jusqu'au", "REFUSE (date inexistante)"),
    ("05/l0/2026", "a consommer jusqu'au", "REFUSE (forme non lisible)"),
    ("13/13/2026", "a consommer jusqu'au", "REFUSE (date inexistante)"),
):
    rendu = garde_dlc(chaine, libelle)
    ok = "OK" if rendu == attendu else f"<<< attendu {attendu}"
    print(f"  {chaine:<11} [{libelle[:24]:<24}] {rendu:<32} {ok}")

print()
print("=" * 70)
print("(5) LE CONTRAT ANTI-HALLUCINATION: rien de rendu sans preuve dans l'OCR")
print("=" * 70)
attendus = json.load(open(PIECE, encoding="utf-8"))
OCR = ["FOURNITURES GASTRONOMIQUES DU SUD-EST",
       "SIRET 412 857 339 00066 - TVA FR 78 412857339",
       "FACTURE N F-2026-000847", "Date d'emission : 12/09/2026",
       "Total HT 419,60", "TVA 10,0 % 41,96", "TOTAL TTC 461,56"]
bloque = 0
for champ, valeur in attendus.items():
    trouve = any(valeur in l for l in OCR)
    if not trouve:
        bloque += 1
    print(f"  {champ:<16} {valeur!r:<36} "
          f"{'justifie par l-OCR' if trouve else 'ABSENT de l-OCR -> REFUSE, JAMAIS INVENTE'}")
print(f"\n  refus opposes faute de preuve: {bloque}"
      f"  (0 attendu sur une piece propre; au-dessus de 0, c'est le moteur OCR")
print( "   qui n'a pas lu, et SURTOUT pas le droit pour le cerveau de completer)")
