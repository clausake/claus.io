## Sprint 13 - Dashboard: la route du creneau rendait une SEMAINE FACTICE sur zero ligne (20 sept.)

**Ouvreur:** le tableau de bord avait DEUX routes de LECTURE jamais jugées par un
gate (`GET /api/dashboard/cost-data` et `GET /api/dashboard/stock-data`), et l'une
d'elles rendait sur une base SANS donnee une SEMAINE FACTICE (Lun 4200, Mar 3800,
Mer 5100, Jeu 4600, Ven 5900, Sam 6200, Dim 3100) qui ne venait d'AUCUNE donnee —
la famille exacte de Sprint 10 (« un mode qui ment sur ses donnees »), et le
`monthlyTrend: "+5.2%"` de stats etait un nombre INVENTE sans consommateur. La
sonde brute a juge les DEUX routes; le code a pose le CONTRAT sur chacune; le lot
des portes (GATES=35) ne le solde que depuis son recollement de la liste LUE dans
package.json.

### 13.1 GET /api/dashboard/cost-data : la SEMAINE FACTICE sur zero ligne

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| D1 | sans parametres sur une base sans facture ni planning, la route rendait la SEMAINE FACTICE (Lun 4200 ... Dim 3100) — des chiffres qui ne viennent d'AUCUNE ligne | la FENETRE REELLE (8 jours inclusifs, aujourdhui-7 .. aujourdhui), zeros sur zero donnee |

### 13.2 GET /api/dashboard/cost-data avec une facture : le chiffre des donnees reles

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| D2 | la facture poste par la voie UI (POST /api/documents, `items` sans inventory_id -> proposition libre) au jour rend cout=123.45; la facture poste HORS du creneau (date aujourdhui-6, creneau start=aujourdhui-2) est EXCLUE du corps | cout EXACT du jour, hors creneau EXCLU; la borne de fin INCLUSIVE (`date <= ?`) |

### 13.3 GET /api/dashboard/cost-data avec planning ISO : le labor des donnees relues

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| D3 | le planning poste par la voie UI (POST /api/staff, schedule keyed par ISO date + datesObj, hourlyRate 20) rendait labor=0 sur un 200 muet | labor EXACT (2h * 20 = 40); un planning keyed par nom de jour ne joue pas dans cette fenetre (la route filtre `date === dateStr`) |

### 13.4 GET /api/dashboard/stock-data sans article

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| D4 | une couleur sur des valeurs nulles (un PASS creux) si la base porte des groupes a 0 | [] sur une base sans article (l'UI de DashboardOverview gere `isEmpty`) |

### 13.5 GET /api/dashboard/stock-data avec articles : la somme par categorie

| # | Ce qui etat rendu | Ce qui a ete exige |
|---|---|---|
| D5 | la somme par categorie + la couleur, mais la couleur etait ABSENTE si la boucle colors tombait | SOMME EXACTE (7.5 = 3*2.5 pour Legumes, 20 = 2*10 pour Viandes) + la couleur presente |

### 13.6 Le `monthlyTrend` invente

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| — | `monthlyTrend: "+5.2%"` rendait un nombre qui ne venait d'AUCUNE donnee, et AUCUN consommateur ne le lisait (DashboardOverview initialise `monthlyTrend: "0%"` et ne le met jamais depuis la reponse) | le champ est RETIRE: une route ne rend pas un chiffre qu'elle ne joue pas |

### 13.7 Preuves LIÉES (et non inferrees)

```
npm run verify:dashboard      5 passed (D1..D5, port alloue par l'OS + jeton d'instance)
npm run verify:dashboard-mord TEMONIN vert + 6/6 MORDENT
npm run verify:all           GATES=35 ROUGES=0 (lot complet, liste LUE dans package.json)
```

Les deux portes sont dans `DEFAUT` de `scripts/run-all-gates.py` (donc dans
`npm run verify:all`) et dans `package.json`; la liste des portes du lot est
LUE dans `package.json`, jamais recopiee. Les ancres de la morsure vivent dans
`scripts/registre-mutations-dashboard.py` (fichier de DONNEES: le poste rogne les
emissions longues et une ancre mal transcrite se presente comme un « ne mord
pas », la faute du 09/09) et chaque ancre est COMPTE sur les octets relus avant
d'etre jugee.

### 13.8 Ouvert, consigne (et non oublie)

- **`GET /api/dashboard/stats` reste NOMINAL**: il est jugé par le test `D1`
  de `routes.spec.ts` (`typeof body.totalStockValue === "number"`) depuis le
  gate `verify:routes` (Sprint 12.1), mais son corps n'est pas jugé par une
  porte de DELTA (activeAlerts/criticalItems/dailyLaborCost sur une base REELLE).
  La sonde brute ne le juge PAS non plus; son contrat reste consigne.
- La sonde brute `scripts/probe-dashboard-voices.mjs` ne juge PAS les verdicts
  (elle print les corps; le spec de contrat juge). Son contrat reste consigne.
- Les routes de LECTURE du dashboard sont les SEULES jugées par un gate; les
  autres routes du tableau de bord (dashboard/stats) sont couvertes par le
  gate `verify:routes` et restent nominal au corps.
- Reproduction CI: le runner GitLab est x86_64, `binfmt/qemu` non enregistre
  sur ce poste → le delta d'architecture reste **non testable ici** (piege
  deja consigne).

