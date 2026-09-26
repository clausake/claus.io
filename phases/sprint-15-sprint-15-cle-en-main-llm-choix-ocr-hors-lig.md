# Sprint 15 - Cle en main LLM, choix OCR hors ligne (25-26 sept.)

> Le contrat complet est sous git : `docs/plan-2026-09-25-sprint15-cle-en-main-llm-choix-ocr-hors-ligne.md`.
> Ce segment consigne l'etat, les mesures et les pieges. Deux cerveaux y ont
> travaille : GLM (taches 1-5, puis tache 6 jusqu'a la coupure) et Qwen
> (fin de tache 6, tache 7).

## Etat des taches (au 26 sept.)

- **Taches 1-5 FINIES** (GLM, commits `500e0fe`..`fc53569`) : couche fournisseur
  `src/shared/fournisseur/` (OpenAI-compatible + Ollama natif pour la vision),
  liste blanche des cinq fournisseurs, routage, et la sonde qui juge chaque
  choix par une GENERATION REELLE (jamais un `200`) avec sa porte
  `verify:fournisseur-sonde` (9/9, morsure incluse, deterministe sur neuf
  serveurs fictifs).
- **Tache 6 FINIE** (Qwen, commit `f1a297f`) : le moteur OCR local PaddleOCR
  PP-OCRv5, hors ligne par construction. 7/7 par lignes separees sur la piece
  du banc. `npm test` 82/82 ; `tsc --noEmit` propre.
- **Tache 7 FINIE** (Qwen, ce commit) : les poids embarques et juges — voir ci-dessous.
- **Reste** : taches 8-14 du contrat (serveur LLM detecte, Reglages visibles,
  assistant de premier demarrage, banque de factures, clef du prestataire via
  le trousseau — c'est LA qu'est la fuite `settings.ts` qui rend les Reglages
  entiers a la console —, installeur trois systemes) + portes 15/16 (les
  gardes anti-hallucination sont ecrites et mesurees au contrat, reste a les
  transformer en portes du collecteur).

## La mesure qui a tranche la tache 6 (a ne pas perdre)

La PLaine PAGE ne rend pas le fragment `419,60` (le Total HT) : le `det` de
PaddleOCR le perd, mesure `sonde-tous-groupes.mjs` — 4 lignes sur les 7
attendues, le juge rend 6/7. LA MEME piece coupee en bandes de luminance et
jouee bande par bande rend 7/7 (mesure `sonde-18-bandes.mjs`, la bande
y=713..734 porte `Total HT` + `419,60`). Le moteur (`src/shared/ocr-moteurs/paddle.ts`)
segmente donc la piece LUI-MEME (projection de luminance, seuils consignes dans
le code : encre <160 gris, 2 px min par rangee, trou <=4 px fusionne, plancher
6 px) puis joue chaque bande sur une vraie toile (`@napi-rs/canvas`, la voie C
du spike) et assemble par ordre y. Ne pas « ameliorer » les seuils sans
re-mesurer.

Pieges mesures au spike (consignes dans les en-tetes de `paddle.ts`) : la voie
A (tampon nu) casse (`loadImage` rend un `Image` sans `getContext`) ; la voie
B (chemin) marche ; la voie C (toile vraise via `createCanvas`) marche — c'est
elle qui porte le decoupage par bandes. `flatten:true` rend un texte fondu :
interdit (retractation 1 du contrat — le juge compare par LIGNES, le SIRET
passe sur deux lignes dans le fondu).

## La mesure qui a tranche la tache 7

Les poids (`det.onnx` 4 748 769 o, `rec.onnx` 8 066 518 o, `dict.txt` 2 617 o,
total 12 817 904 o) sont **hors git** (`.gitignore` — la lourdeur de 12,8 Mo
que le contrat refuse, tache 7 point 3). L'ancre est EXTERIEURE aux poids :
`scripts/modeles-ocr.manifest.json` (sha256 + tailles mesurees au contrat et
re-mesurees au deplolement sur le disque). La porte `verify:ocr-modeles`
joue `scripts/verif-modeles-ocr.py` : `MODELES: 3/3 CONFORMES`.

**Verifiee par morsure** (`test/banc/juge-modeles-ocr.py`, 5 cas dont les
verdicts sont ecrits d'avance) : nominal vert ; poids absent rougit ; taille
alteree rougit ; **empreinte alteree A TAILLE EGALE** rougit (le cas que la
taille seule ne voit pas) ; manifeste muet rend rc=2 (le capteur mort est une
faute nommee, jamais un 0 silencieux). Le total est COMPTE a chaque jeu
(regle des totaux du harnais), jamais ecrit.

La porte est VOLONTAIREMENT HORS DU `DEFAUT` de `run-all-gates.py` (consigne a
l'endroit de la liste) : dans un clone neuf sans les poids, elle rougirait
pour une absence qui n'est pas un defaut du produit. Elle est jouee a la main
et le sera par l'installeur (tache 14). Le telechargement des poids est une
etape d'installation (une fois, hors depot), pas une etape du lot.

## Pieges et consignes du sprint

- `package.json` : `@napi-rs/canvas`, `ppu-paddle-ocr`, `onnxruntime-node`
  sont entrez dans `dependencies` (pas devDeps — le livrable en a besoin).
- Les routes du produit ne parlent qu'a `lireTexte()` (`src/shared/ocr.ts`) —
  la porte d'entree unique (regle de la source unique, Sprint 7). Tesseract
  reste reglable mais declare `horsLigne:false` : c'est une donnee du produit
  affichee aux Reglages, pas un commentaire (mesure : tesseract.js tire ses
  langues depuis un CDN au premier usage, HOME neuf).
- Les gardes anti-hallucination (`src/shared/extraction/preuve-ancree.ts` +
  `test/banc/juge-gardes-extraction-b.py`) jouent sur la sortie DU moteur :
  piece propre -> 0 refus ; un champ sans preuve dans l'OCR doit etre REFUSE,
  jamais complete par le cerveau. A transformer en portes (taches 15/16).
- Quatre portes preexistantes sont instables EN SEQUENCE (`supplier-price`,
  `supplier-import`, `documents-validate`, `consume-mord`) : vertes seules,
  vertes en groupe, rouges dans certains ordres de lot. Mesure trois fois,
  constate avant ce sprint, non touche par lui. Un partage d'etat entre portes,
  pas un produit casse.

## Prochain lecteur : ou reprendre

Le contrat dans `docs/` + ce segment. Ordre : tache 8 (detecter les serveurs
LLM locaux par `GET /v1/models`, jamais embarquer un binaire de 100 Mo), puis
9 (panneau Intelligence dans les Reglages — attention : `settings.ts` rend les
Reglages entiers a la console, la fuite se ferme a la tache 12 avec
safeStorage), puis 10 (assistant), 11 (banque), 12 (clef), 13 (portes),
14 (installeur).
