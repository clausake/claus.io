# Sprint 15.e - l'assistant, le coffre, le juge OCR et le livrable juge sur piece (27 sept.)

## Ce qui est consigne

Fin du Sprint 15 : taches 10, 11, 12, 13 et 14 (le chef avait dit « Go le reste,
ne t'arrete pas jusqu'a 14 »). Quatre commits : `7918290` (10+12), `6f2e1f7`
(11), `d72bbe7` (13+14 premiere moitie), `da2dee8` (14 fin).

### Tache 10 — l'assistant de premier demarrage

`src/services/assistant.ts` (le noyau juge) + `src/components/Assistant.tsx`
(trois ecrans : le moteur, la clef, l'epreuve) + les routes
`/api/assistant/{etat,epreuve,consigner}`. La regle cardinale du sprint est le
design meme de l'epreuve : jugee par l'OCR SEUL sur la piece du banc (le LLM
ne complete rien). Sans epreuve reussie dans CE processus, `consigner` refuse
et NOMME (`EPREUVE_NON_ACQUISE`, 412) ; `install_termine_le` +
`fournisseur_choisi` (le contrat portoit la coquille « fourisseur_choisi »,
corrigee et consignee ici) ne s'ecrivent que par cette voie. App.tsx tient
l'ecran sur la reponse du SERVEUR (`/api/assistant/etat`), pas un drapeau
local.

La voie reelle est INJECTEE : la porte joue le lecteur fabrique
(`lecteur-fabrique-assistant.mjs`, consigne ecrite par le juge), jamais le
vrai Paddle — les poids sont hors git et une porte ne juge pas l'etat de
l'infrastructure d'autrui. `outil-epreuve-reelle.mjs` est l'outil a main qui
joue le moteur reel et nomme son etat.

### Tache 12 — le coffre (anticipee avec la 10, la clef etait son ecran 2)

`src/services/coffre.ts` : safeStorage d'Electron (le serveur tourne DANS le
processus principal en production — `require("electron")` est donc
atteignable) ; hors Electron, fichier `coffre.json` 0600 rendu `chiffre:false`
sans maquillage. GET `/api/clef` ne rend QUE `{presente, chiffre}`. La fuite
`settings.ts:74` est fermee : le log ne rend plus que les NOMS des champs.

### Tache 11 — le juge OCR par piece

`scripts/juge-ocr.py` : la LECTURE passe par le couloir tsx (le vrai moteur,
le contexte du produit), Python ne fait que JUGER — distance d'edition par
ligne (retractation 1), champs atteints, p50/p95. La banque du chef
(`test/fixtures/factures/`, hors git — prix et fournisseurs) est attendue :
10 a 20 factures reelles. Banque vide = `PRET: non juge` DIT, rc=0 (ce qui
manque est l'epreuve, pas le moteur). Sa morsure (consigne fabriquee par
`COOKDRIVE_OCR_MORSURE`) EST au lot : tva retire → rouge + le nom du
manquant ; muet → rouge. Mesure du jour : synthetique 7/7, cer moyen 0.3191
par ligne (le SIRET passe sur deux lignes), 3357 ms.

### Tache 13 — les portes

Branchées aux DEUX endroits : `verify:assistant`, `verify:ocr-moteur-mord`,
`verify:llm-fournisseur`, `verify:livrable`. La course NOMINALE
`verify:ocr-moteur` est hors defaut (elle exige les poids, la lecon de
`verify:ocr-modeles`). Le capteur d'orphelines a mordu comme prévu
(`probe-livrable-14.py` sans porte → ROUGE → porte posée → VERDIT_VERT) :
c'est le capteur qui a raison, pas la sonde a retirer.

### Tache 14 — l'installeur et le livrable juge sur piece

`npm run build:linux` produit l'AppImage (358 Mo) et le .deb (268 Mo) arm64 ;
`probe-livrable-14.py` les a juges SUR PIECE : les 3 poids OCR aux scelles du
manifest (4 748 769 + 8 066 518 + 2 617 octets), 11 `.node` onnxruntime, 3
`.node` @napi-rs/canvas. `asarUnpack` porte desormais onnxruntime-node/bin,
les `.node` du canvas et ppu-paddle-ocr (les .node ne traversent pas l'asar).
`author`/`maintainer`/`homepage` ajoutés : le .deb les exige (faute mesuree,
pas devinee). Windows et macOS NON jugeables ici (binfmt/qemu absent, contrat
etape 3, consigne) : a jouer par le chef ou la CI.

## Les fautes trouvees en jouant la PIECE (elles sont le travail de la 14)

Trois fautes que le banc tsx ne voyait PAS, mesurees sur
`dist-server/server.cjs` (le bundle CJS reel du livrable) :

1. `createRequire(import.meta.url)` dans coffre.ts : sous le bundle CJS,
   `import.meta.url` est UNDEFINED — le serveur du paquet CRASHAIT a la
   naissance (`ERR_INVALID_ARG_VALUE`). Figure du cwd.
2. La sonde n'etait pas LIVREE : `path.join(process.cwd(), "scripts/…")`
   n'existe pas dans le paquet → le « Tester » du livrable ne rendait rien.
   Ajoute : extraResources, resolution resourcesPath|cwd, et le verdict
   `SONDE_MUETTE` NOMME quand la sonde ne rend aucune ligne (jusqu'ici la
   branche rendait `cibles:[]` muet — un capteur mort en costume de verdict).
3. Les deux specs e2e qui rendent l'UI (reception, motion) rougissaient :
   l'assistant tient l'ecran tant que le demarrage n'est pas consigne (le
   piege de la landing, bis). Pre-consignation par le MEME fichier que le
   produit ecrit ; 3/3 verts.

## Les mesures du tour

- Lot complet : GATES=65, ROUGES=1 — l'unique rouge
  (`verify:installe-index-forecast`) est la famille connue des instables de
  sequence : vert seul (rc=0 rejoue dans la minute), vert dans la course
  precedente. Les quatre portes nouvelles du sprint sont toutes RC 0 dans la
  course (assistant, ocr-moteur-mord, llm-fournisseur, livrable).
- Lot : vitest 108/108 ; tsc 0 ; vite build vert ; porte assistant 16
  verdicts verts (morsures : muet, forget, clef vide, clef qui ne ressort
  d'AUCUN fichier de la sauvegarde — marqueur ecrit d'avance).
- Sonde livrable : tout vert sur les deux echantillons.
- Le premier brouillon de `jugerEpreuve` refusait le fournisseur vide APRES
  l'epreuve : rendre EPREUVE_NON_ACQUISE sur un champ vide cachait la vraie
  faute a l'operateur — l'entree d'abord, l'etat ensuite (correction dans le
  service, pas dans le test).
- Le premier `lecteur-fabrique-assistant.mjs` portoit une annotation TS dans
  un `.mjs` : node rend « Unexpected token ':' » et le juge accusait la voie
  injectee. La faute etait dans le banc, pas dans le produit — d'ou la sonde
  separée avant de toucher au service.
