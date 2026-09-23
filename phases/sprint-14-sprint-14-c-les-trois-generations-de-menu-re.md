## Sprint 14.c - les trois generations de menu retirees, l'analyse conservee (24 sept.)
La decision du maitre d'ouvrage du 22 septembre est appliquee : la generation
automatique de menu (les trois prompt engineering) est annulee au profit de
l'echange avec l'assistant en salle + la sauvegarde des fiches techniques.
L'analyse (l'empreinte optique du menu papier, OCR) est CONSERVEE.

TROIS PIECES, RETIREES DANS LE MEME COMMIT (regle 6 du depot) :

1. src/routes/menu.ts : les trois declarations retirees
   (router.post /api/generate-creative-menu, /api/generate-traditional-menu,
   /api/generate-gastronomic-menu). 489 -> 178 lignes (-311). Ne reste
   qu'UNE route : router.post /api/analyze-menu (l.16), l'empreinte optique.
   L'entete du fichier est reecrite en consequence (elle ne promet plus de
   generation). Les 17 imports sont verifies : chacun garde au moins deux
   usages apres la coupe (aucun orphelin).

2. src/components/MenuAnalysis.tsx : 1738 -> 1277 lignes (-461). Retires
   d'un bloc : les trois handlers (handleGenerateCreative,
   handleGenerateGastronomic, handleGenerateTraditional), les trois branches
   qui font le fetch sur les routes mortes dans processFile, et les trois
   cartes de selection du mode (setAnalysisMode creative/gastronomic/
   traditional). CONSERVES : processFile (l'empreinte optique), la carte
   "decompose", handleDrop, handleFileSelect, handleSaveFicheToBook,
   saveGeneratedRecipes, MENU_ROTATION. Une seule carte de mode subsiste.
   Le compilateur est le juge : npx tsc -p tsconfig.json --noEmit rendu RC 0.
   ! Le compteur de profondeur naive ne juge PAS le JSX : les balises sont
   equilibrees independamment des parentheses ; un compteur de ( { [ rend
   0 alors que le JSX est brise (mesure ce tour). Seul tsc detecte les
   balises desserre equilibrees ; le capteur de confiance etait mort.

3. test/e2e/routes.spec.ts : les trois blocs de test des routes retirees
   partent AVEC elles (1079 -> 1078 lignes, 49 -> 46 tests). Jamais l'un
   apres l'autre : les trois assertent [200, 500].toContain(statut), donc
   une route retirees rend 404 et fait ROUGIR son test. Une spec qui
   survit a sa route est un faux rouge, la famille du defaut C3. La bande
   de liste (l.845-848) est ramenee aux quatre routes vivantes de la
   famille upload : /api/analyze-menu, /api/recipes/scan,
   /api/documents/upload, /api/haccp/documents/upload.

PREUVES JOUEES (non heritees) :
- npx tsc -p tsconfig.json --noEmit : RC 0, aucune erreur.
- npm run verify:routes : 45 passed, 1 failed. Le rouge est
  POST /api/robots/assign (l.375) : PRE-EXISTANT, prouve par isolement sur
  l'arbre PUR (git stash des trois pieces, rejeu sur e306d99 : meme echec,
  "le robot est PRESENT avant assign", expect(received).toBeTruthy() recu
  undefined). Les deux hunks de la spec sont a 846 et 1030, le rouge a 375.
  Constate a son compte, hors du perimetre de C5, et non resolu par ce lot.
- Citations mortes restantes dans le depot (hors consignation docs/phases) :
  AUCUNE (grep -rn sur src test scripts package.json).
