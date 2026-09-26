# Sprint 15.b - extraResources pose : le consigne de la tache 7 etait trop timide (26 sept.)

## Ce qui est consigne

L'archive Sprint 7 du journal consigne : « build.extraResources NON pose :
c'est la tache 14 ». C'etoit trop timide et desormais faux : sans ce bloc,
l'installeur de la tache 4… 14 produiroit un livrable MUET — le moteur leverait
`ModelesAbsents` chez le restaurateur, car `cheminModeles()` (paddle.ts) lit
`process.resourcesPath/ocr/modeles` et l'electron-builder n'auroit rien mis a
cette adresse.

Decision prise dans le tour (commit `2ef6f1d`) : `build.extraResources` pose
dans `package.json` — `resources/ocr/modeles` -> `<resourcesPath>/ocr/modeles`,
filter `*.onnx` + `*.txt`. Le chemin DEST est celui que le moteur lit (mesure
du code, pas le `modeles-ocr` du contrat : la convention du contrat est alignee
sur la voie mesuree, sinon le moteur chercherait a vide).

Controles du tour : `package.json` juge par `JSON.parse` (capteur vivant),
`verify:ocr-modeles` rend `MODELES: 3/3 CONFORMES`, `verify:split` VERT.

L'archive de la tache 7 reste IMMUABLE (loi du journal scelle) ; ce stub et
cette archive sont la correction consignee, pas une reecriture.
