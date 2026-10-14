# NOTICE — claus.io

Ce depot distribue du code original sous **EUPL-1.2** (voir `LICENSE`) ET des
composants tiers redistribues sous leurs propres licences. La section suivante
est la mention d'attribution EXIGEE par ces licences — la retirer rend la
redistribution non conforme.

## Epicure — embeddings d'ingredients (CC BY 4.0)

Les fichiers suivants proviennent du projet
[Epicure](https://huggingface.co/Kaikaku/epicure-chem) de Jakub Radzikowski et
Josef Chen :

- `embeddings.chem.safetensors`, `embeddings.cooc.safetensors`,
  `embeddings.core.safetensors` (poids, 300 dimensions)
- `epicure_chem.csv`, `epicure_cooc.csv`, `epicure_core.csv` (vecteurs CSV)
- `vocab.json` (vocabulaire canonique de 1 790 ingredients)

**Licence : [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**
(texte complet dans `LICENSES/CC-BY-4.0-Epicure.txt`).

Attribution requise :

> Epicure: Navigating the Emergent Geometry of Food Ingredient Embeddings,
> Jakub Radzikowski & Josef Chen, arXiv:2605.22391 (2026).
> Modeles `Kaikaku/epicure-chem`, `Kaikaku/epicure-cooc`, `Kaikaku/epicure-core`
> — Licence CC BY 4.0.

Toute redistribution de claus.io (complete, modifiee, integree a un autre
produit) doit conserver ce paragraphe.

## Tesseract tessdata — donnees de langue francaise (Apache 2.0)

`fra.traineddata` (hors depot, telecharge a l'installation) provient de
[tessdata_best](https://github.com/tesseract-ocr/tessdata_best) du projet
Tesseract OCR — **Licence [Apache 2.0](./LICENSES/Apache-2.0-tessdata.txt)**.
Le fichier n'est pas redistribue dans ce depot (telechargement au premier
lancement du moteur tesseract, choix de l'utilisateur) : la licence s'applique
au telechargement, pas a ce depot.

## Portee des licences

| Composant | Licence | Revente commerciale possible ? |
|---|---|---|
| Code claus.io (src/, server.ts, electron/, scripts/) | **EUPL-1.2** | NON — tout derivé doit rester EUPL-1.2 et open source |
| Donnees Epicure (embeddings, CSV, vocab) | **CC BY 4.0** | OUI (avec attribution) — licence tierce, non modifiable |
| fra.traineddata (telecharge, pas dans le depot) | Apache 2.0 | OUI — licence tierce |

La decision du maitre d'ouvrage (14/10) : le LOGICIEL claus.io ne peut pas etre
vendu — c'est la portee de l'EUPL-1.2 sur le code. Les donnees Epicure restent
sous leur licence d'origine : un tiers qui redistribe claus.io doit citer
Epicure (CC BY 4.0) mais la revente de CES donnees n'est pas interdite par le
depot — c'est la licence du projet Epicure qui regit ses propres fichiers.
