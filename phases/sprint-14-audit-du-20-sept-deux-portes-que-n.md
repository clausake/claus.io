## Sprint 14 - Audit du 20 sept. : deux portes que nul n'appelait, cinquante-sept routes sans garde, une ecriture muette (23 sept.)

Lot consigne le 2026-09-23, au titre de la revue des portes.

1. **Deux portes declarees et jamais appelees** : `verify:kpi` et
   `verify:reception` etaient dans `package.json` sans entree dans `DEFAUT`
   de `scripts/run-all-gates.py` ; `npm run verify:all` les ignorait.
   Branchees aux DEUX endroits. Course du collecteur dans ce lot :
   `GATES=2`, `RC verify_kpi 0`, `RC verify_reception 0`, `ROUGES=0`.
   Les deux specs sont joueuses : `1 passed` chacune. Le compte de
   `grep -c 'test('` annoncait 5 tests dans `reception-view.spec.ts` ;
   c'etaient cinq appels a `RegExp.test`. Le collecteur dit 1, et le
   verdict est rendu par le navigateur lance.
2. **Cinquante-sept routes mutables, zero garde d'identite** : 57
   routes `post|put|patch|delete` dans `src/routes/*.ts` ; 0
   occurrence pour neuf motifs d'authentification (`requireAuth`,
   `authMiddleware`, `jwt`, `bearer`, `express-session`, `passport`,
   `bcrypt`, `api_key`, `autorisation`). Le seul refus est celui de la
   licence (`server.ts:134`, `license.ts:15-37`) : 403 a l'expiration du
   trial, jamais une identite demandee. Constat signe, non defaut du
   produit : modele mono-poste, une salle, un restaurant. Risque consigne
   pour la premiere mise en reseau. Proprietaire : le maitre d'ouvrage.
3. **Une ecriture muette** : `InventoryAudit.tsx:156` poste `items` a
   `/api/inventory/bulk` ; `src/routes/inventory.ts` ne declare que trois
   POST (lignes 35,351,439,) ; la sonde rend `POST /api/inventory/bulk -> 404`
   et `corps: null`. La porte n'est pas branchee ici : la sonde rend un
   code de sortie a zero dans les deux cas, la route presente ou absente.
   Une porte verte qui ne juge rien est pire qu'une porte absente (Sprint 10,
   `verify:forecast`). A brancher, avec sa morsure, au commit de l'edition.
4. **Huit sondes sans porte** : probe-binding-undefined.mjs probe-consume-semantiques.mjs probe-dashboard-voices.mjs probe-documents-validate-contract.mjs probe-inventory-bulk.mjs probe-inventory-put-partial.mjs probe-number-statics.mjs probe-post-inventory-voices.mjs probe-ancres-haccp.py probe-blocs-sprint11.py probe-emuns-haccp.py probe-forme-filtre.py probe-haccp-prerequis.py probe-index-forecast-installe.py probe-index-forecast.py probe-index-installe.py probe-index-reel.py probe-index-staffday.py probe-join-stats.py probe-labor-cost-zero.py probe-nplus1.py probe-put-yield.py probe-stats.py probe-verif-module.py
   capteurs non comptes, non branches ; a publier ou a retirer du depot.
5. **Trois routes de generation** de menu (`menu.ts:177/296/392`) et une
   d'analyse (`:16`) : decision du maitre d'ouvrage consignee le 22 sept.,
   le retrait reste a traiter au Sprint 16.

Voir `docs/audit-2026-09-20.md` pour la methode, les commandes et leurs
sorties, les six constats et la liste des articles ouverts.

Caveat d'integration continue : le-runner est `x86_64`, le poste est
`aarch64` sans `binfmt_misc`. La mention exacte est `CI non rejouable ici`,
jamais `CI verte prouvee`.
