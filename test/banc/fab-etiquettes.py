"""Fabrique les ETIQUETTES ALIMENTAIRES multilingues (pieces DLC/DDM) pour le banc.

La piece de facture ne juge PAS la DLC : une facture ne porte pas de date de
peremption, et les libelles sont propres a chaque langue (mesure 25/09 : fr
« a consommer jusqu'au / de preference », de « Mindestens haltbar bis /
Verbrauchen bis », es, it « Da consumarsi entro », nl « Te gebruiken tot »).
Ces pieces sont la contre-epreuve de la tache 16 : la MEME voie OCR (le
couloir du produit) est jouee sur chaque langue, et le juge Python exige le
VERDIT DLC attendu — une garde qui ne connait qu'un libelle refuse en bloc
ce qu'elle lit mal (le contrat, tache 15/16).

Les dates sont FIGEES (2026-09-25, la mesure du 25/09) : une piece dont le
verdict depend de l'horloge rougit seule le lendemain.
"""
import glob
import json
import os

from PIL import Image, ImageDraw, ImageFont

DOSSIER_FONTS = "/usr/share/fonts"
SORTIE = os.path.dirname(os.path.abspath(__file__))


def trouve(match, defaut):
    c = sorted(glob.glob(f"{DOSSIER_FONTS}/**/*{match}*.ttf", recursive=True))
    if not c:
        raise SystemExit(f"AUCUNE fonte ne correspond a *{match}* sous {DOSSIER_FONTS}")
    return c[defaut] if len(c) > defaut else c[0]


SERIF = trouve("Serif", 1)
SERIF_GRAS = trouve("Serif-Bold", 0)

# (code_piece, langue OCR attendue, produit, lignes DLC/DDM, verdict attendu
#  de la garde — DATE est lue par le juge, AUJOURD'HUI = 2026-09-25)
PIECES = [
    ("etiquette-fr-dlc", "fr", "Yaourt brassage aux fruits",
     [("A CONSOMMER JUSQU'AU", "25/10/2026"),
      ("LOT LF26097 A", None)], "ACCEPTE"),
    ("etiquette-fr-ddm", "fr", "Riz basmati 5 kg",
     [("À CONSOMMER DE PRÉFÉRENCE AVANT LE", "20/09/2026"),
      ("LOT RB25412 B", None)], "ACCEPTE"),
    ("etiquette-de-dlc", "de", "Frischkäse Kräuter",
     [("VERBRAUCHEN BIS", "05/10/2026"),
      ("CHARGE KA26-095", None)], "ACCEPTE"),
    ("etiquette-de-ddm", "de", "Haferflocken 500 g",
     [("MINDESTENS HALTBAR BIS", "15/09/2026"),
      ("CHARGE HF25-318", None)], "ACCEPTE"),
    ("etiquette-it-dlc", "it", "Mozzarella di bufala",
     [("DA CONSUMARSI ENTRO", "02/10/2026"),
      ("LOTE MB26-092", None)], "ACCEPTE"),
    ("etiquette-nl-ddm", "nl", "Olijfolie extra vergine 1 L",
     [("TE GEBRUIKEN TOT", "11/11/2026"),
      ("PARTIJ OV26-401", None)], "ACCEPTE"),
    ("etiquette-fr-dlc-passee", "fr", "Filet de bar sous vide",
     [("A CONSOMMER JUSQU'AU", "20/09/2026"),
      ("LOT LB26-081", None)], "PASSEE"),
    ("etiquette-fr-dlc-invalide", "fr", "Crème dessert vanille",
     [("A CONSOMMER JUSQU'AU", "31/02/2026"),
      ("LOT CV26-077", None)], "DATE_INVALIDE"),
]


def fab(nom, produit, lignes_etat, fond="white"):
    L, H = 760, 420
    img = Image.new("RGB", (L, H), fond)
    d = ImageDraw.Draw(img)
    d.rectangle([16, 16, L - 16, H - 16], outline="black", width=3)
    d.text((40, 34), produit.upper(), fill="black",
           font=ImageFont.truetype(SERIF_GRAS, size=26))
    d.line([(40, 78), (L - 40, 78)], fill="black", width=2)
    y = 96
    for txt, val in lignes_etat:
        d.text((40, y), txt, fill="black", font=ImageFont.truetype(SERIF, size=20))
        if val:
            d.text((520, y), val, fill="black",
                   font=ImageFont.truetype(SERIF_GRAS, size=22))
        y += 34
    d.text((40, y + 8), "SCEA DES HALLES - 69002 LYON", fill="black",
           font=ImageFont.truetype(SERIF, size=20))
    img.save(os.path.join(SORTIE, nom + ".png"))
    with open(os.path.join(SORTIE, nom + ".png.etat.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"produit": produit, "lignes": [[t, v] for t, v in lignes_etat],
                   "verdict_attendu": None}, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    for nom, langue, produit, lignes, verdict in PIECES:
        fab(nom, produit, lignes)
        with open(os.path.join(SORTIE, nom + ".png.etat.json"), "w",
                  encoding="utf-8") as fh:
            json.dump({"produit": produit, "langue": langue,
                       "lignes": [[t, v] for t, v in lignes],
                       "verdict_attendu": verdict,
                       "aujourdhui": "2026-09-25"},
                      fh, ensure_ascii=False, indent=1)
        print("fabriquee", nom, "verdict attendu:", verdict)
