# Probe: segmentation de l'image du banc en BANDES de lignes par luminance
# (la voie que le moteur doit generer lui-meme, pas des rows predécoupées à la main).
from PIL import Image

im = Image.open("test/banc/facture-synthetique.png").convert("L")
w, h = im.size
px = im.load()

def is_ink(y):
    # une ligne de pixels est "d'encre" si au moins 2 px sombres (seuil 160)
    n = 0
    for x in range(0, w, 2):
        if px[x, y] < 160:
            n += 1
            if n >= 2:
                return True
    return False

ink = [is_ink(y) for y in range(h)]
bandes = []
y = 0
while y < h:
    if ink[y]:
        debut = y
        gap = 0
        while y < h and gap <= 4:
            if ink[y]:
                y += 1; gap = 0
            else:
                y += 1; gap += 1
        fin = y - gap
        if fin - debut >= 6:
            bandes.append((debut, fin))
    else:
        y += 1

print("bandes:", len(bandes))
for b in bandes:
    print(b, "h=", b[1]-b[0])
