"""Fabrique une FAITURE SYNTETIQUE (PNG) pour le banc d'essai OCR.

Aucune image du depot n'est valide (mesure: les 5 .png de test/tmp-data sont des
artefacts de 72 octets a CRC fautif, public/screenshot.png est « cannot identify
image file »). Cette image ne quitte jamais le banc d'essai (scratch) et n'entre
dans AUCUNE base: elle juge la VOIE de lecture d'un moteur OCR, rien d'autre.

Les fonts sont DECOUVERTES par glob, jamais recopiees d'apres l'ecran: le rendu
de ce poste a rendu « DejaVuSerif-Book.ttf » pour un fichier qui s'appelle
DejaVuSerif.ttf, et l'OCR n'a pas d'autre juge que l'image qu'on lui tend.
"""
import glob
import json

from PIL import Image, ImageDraw, ImageFont

Dossier_fonts = "/usr/share/fonts"


def trouve(match, defaut):
    c = sorted(glob.glob(f"{Dossier_fonts}/**/*{match}*.ttf", recursive=True))
    if not c:
        raise SystemExit(f"AUCUNE fonte ne correspond a *{match}* sous {Dossier_fonts}")
    print(f"  fonte {match!r:26} -> {c[defaut] if len(c) > defaut else c[0]}")
    return c[defaut] if len(c) > defaut else c[0]


print("Decouverte des fonts:")
SERIF = trouve("Serif", 1)          # celle SANS le suffixe d'attribut
SERIF_GRAS = trouve("Serif-Bold", 0)
MONO = trouve("SansMono", 0)

L, H = 1000, 1240
MARGE = 56
img = Image.new("RGB", (L, H), "white")
d = ImageDraw.Draw(img)


def police(gras=False, mono=False, taille=22):
    if mono:
        return ImageFont.truetype(MONO, size=taille)
    return ImageFont.truetype(SERIF_GRAS if gras else SERIF, size=taille)


def ligne(y, x=MARGE, txt="", **kw):
    d.text((x, y), txt, fill="black", font=police(**kw), anchor="la")


y = 44
ligne(y, txt="FOURNITURES GASTRONOMIQUES DU SUD-EST", gras=True, taille=30); y += 46
ligne(y, txt="14 cours des Halles - 69002 Lyon"); y += 32
ligne(y, txt="SIRET 412 857 339 00066 - TVA FR 78 412857339"); y += 32
ligne(y, txt="Telephone : 04 78 92 41 06", taille=20); y += 52

ligne(y, txt="FACTURE N  F-2026-000847", gras=True, taille=26); y += 44
ligne(y, txt="Date d'emission : 12/09/2026", taille=20); y += 30
ligne(y, txt="Date d'echeance : 12/10/2026", taille=20); y += 30
ligne(y, txt="Reglement : virement 30 jours", taille=20); y += 56

colonnes = [MARGE, MARGE + 430, MARGE + 530, MARGE + 660, MARGE + 820]
for x, e in zip(colonnes, ["Designation", "Qte", "U", "P.U. HT", "Montant HT"]):
    d.text((x, y), e, fill="black", font=police(gras=True, taille=21))
y += 34
d.line([(MARGE, y), (L - MARGE, y)], fill="black", width=2)
y += 16

articles = [
    ("Pommes de terre Agria 25 kg",   "2",   "sa",  "34,90", "69,80"),
    ("Beurre doux de laite AOP 5 kg", "3",   "col", "21,50", "64,50"),
    ("Vin rouge AOC Cotes-du-Rhone",  "6",   "cs",  "18,75", "112,50"),
    ("Sel deguer gris de Guerande", "100", "g", " 0,08", " 8,00"),
    ("Eau de vie de la Mer 75 cl",    "12",  "bt",  " 2,40", "28,80"),
    ("Houblon vert d'Ornon 500 g",    "4",   "sac", " 9,95", "39,80"),
    ("Edelweiss du Chasseur 1 kg",    "5",   "po",  "14,20", "71,00"),
    ("Rue des Martyrs - Epices 250 g", "8",  "bt",  " 3,15", "25,20"),
]
for a, q, u, p, m in articles:
    ligne(y, x=colonnes[0], txt=a, taille=20)
    ligne(y, x=colonnes[1], txt=q, mono=True, taille=21)
    ligne(y, x=colonnes[2], txt=u, taille=20)
    ligne(y, x=colonnes[3], txt=p, mono=True, taille=21)
    ligne(y, x=colonnes[4], txt=m, mono=True, taille=21)
    y += 32

y += 10
d.line([(MARGE, y), (L - MARGE, y)], fill="black", width=2); y += 26
for lbl, val in (("Total HT", "419,60"), ("TVA 10,0 %", "41,96"), ("TOTAL TTC", "461,56")):
    ligne(y, x=colonnes[0], txt=lbl, gras=True, taille=23)
    ligne(y, x=colonnes[4], txt=val, gras=True, mono=True, taille=24)
    y += 42
ligne(y, txt="Compte 30002 12345 67890 100 - Banque de France", taille=19); y += 34
ligne(y, txt="Arrete la presente facture a la somme de quatre cent", taille=19)
ligne(y + 30, txt="soixante-un euros et cinquante-six centimes.", taille=19)

# Le banc ecrit CHEZ LUI (a cote de son propre fichier), jamais dans un dossier
# de traval: le scratch est purge a 24 heures et un banc scelle qui y pointe
# n'a plus de piece a mordre le lendemain. (Lecon du 25/09: l'audit d'integrite
# a trouve le contrat du plan en train de renvoyer son banc la.)
ICI = __file__.rsplit("/", 1)[0] if "/" in __file__ else "."
OUT = ICI + "/facture-synthetique.png"
img.save(OUT)
print("FABRIQUEE:", OUT)

# Verite-terrain: ce que l'OCR doit retrouver. Consigne a cote de l'image,
# c'est le contrat que jugera la porte de mesure (aucun chiffre invente:
# chacun est ecrit par le code ci-dessus).
attendus = {
    "raison_sociale": "FOURNITURES GASTRONOMIQUES DU SUD-EST",
    "date_emission": "12/09/2026",
    "facture_numero": "F-2026-000847",
    "siret": "412 857 339 00066",
    "total_ht": "419,60",
    "tva": "41,96",
    "total_ttc": "461,56",
}
chemin = OUT.replace(".png", ".attendus.json")
open(chemin, "w", encoding="utf-8").write(json.dumps(attendus, ensure_ascii=False, indent=1))
print("ATTENDUS:", chemin)

# Contre-epreuve du capteur: l'image doit ETRE lisible par un lecteur PNG
# independant, sinon le banc jugerait le vide (regle 2 d'AGENTS.md).
verif = Image.open(OUT)
verif.load()
print("CONTRE_EPREUVE: PNG", verif.format, verif.size, verif.mode, "OK")
