# Installateurs — décision sur le job `build-linux` (T5.1, 31/10/2026)

## Question posée

Le 30/10 le commit `77b219e` ajoute un job `build-linux` à
`.github/workflows/build-windows.yml` (runner ARM natif,
`ONNXRUNTIME_NODE_INSTALL=skip`, attache `release/*.AppImage` + `release/*.deb` à
la release). Un diff **non commité** trouvé le 31/10 (fait 16 du planning)
**supprimait** ce job. T5.1 = trancher garder / jeter, et vérifier que README,
workflow et release disent la même chose.

## Décision : GARDER `build-linux`

La suppression aurait réintroduit le défaut que le job a été écrit pour empêcher
(mesuré le 30/10, commentaire `build-windows.yml:131`) :

> le README annoncait des installeurs Linux attaches, mais la release ne portait
> que le .exe et le .dmg — les AppImage/.deb avaient été construits à la main sur
> le poste arm64 et jamais poussés.

Supprimer `build-linux` = un utilisateur Linux qui suit le README retombe sur
v0.1.0, celle qui ouvre « Not Found » (chantier 20). La décision est confirmée par
T0.2 (le triage a gardé le job) et par la doctrine de travail (« ne rien écraser
en bloc, décider fichier par fichier »).

## Preuve de la cohérence README ↔ workflow ↔ release (commandes exécutées)

**Le workflow `installateurs` construit les 4 installeurs** (un job par OS natif) :

```
build        → runs-on windows-latest → electron-builder -w → release/*.exe
build-mac    → runs-on macos-latest   → electron-builder -m → release/*.dmg
build-linux  → runs-on ubuntu-24.04-arm → electron-builder -l → release/*.AppImage, release/*.deb
```

**Le README les annonce** (`README.md:90`) : « AppImage ARM64 et .deb ARM64 pour
Linux, installeur NSIS Windows x64, et .dmg Apple Silicon pour macOS », plus
`npm run build:linux` (README:124). `build:linux` est bien dans `package.json:24`.

**La release réelle les porte** — `gh api repos/clausake/claus.io/releases/tags/v0.1.1
-q '.assets[].name'` (mesuré ce jour) rend exactement :

```
claus.io-0.1.1-arm64.AppImage
claus.io-0.1.1-arm64.dmg
claus.io.Setup.0.1.1.exe
clausio_0.1.1_arm64.deb
```

Parité **exacte** entre les trois sources : les 4 installeurs annoncés par le
README sont produits par les 3 jobs du workflow et présents sur la release v0.1.1.
Le critère « Fini quand » de T5.1 (« README, workflow et release disent la même
chose ») est donc vérifié.

## Pourquoi aucun changement de code n'est nécessaire

- Le job `build-linux` est déjà présent et cohérent (aucun diff à committer) ; le
  diff non commité qui le supprimait a été écarté par le triage T0.2 (`git
  checkout --`, voir commit `0c12dbf`).
- Le `name:` du workflow est `installateurs` (`build-windows.yml:19`) — correct.
  (L'étiquette « windows-x64 » vue dans `actions/workflows` est un `display_title`
  d'un run **historique** antérieur à l'ajout des jobs mac/linux, pas le nom
  courant.)
- Les déclencheurs sont sains : `workflow_dispatch` (release en cours, version lue
  depuis `package.json`) + `push tags v*` (releases futures). `--publish never` +
  `softprops/action-gh-release` = attachement explicite, jamais de publication
  automatique d'une version figée.

Ceci consigne donc la **décision humaine** et sa preuve ; aucun fichier de build
n'est modifié parce qu'ils sont déjà corrects et vérifiés.
