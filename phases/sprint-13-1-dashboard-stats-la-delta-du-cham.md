## Sprint 13.1 - Dashboard/stats: la DELTA du champ critigue au lieu d un nombre fige (20 sept.)

**Ouvreur:** le Sprint 13 avait consigne le champ `GET /api/dashboard/stats`
comme NOMINAL: le gate `verify:routes` ne lui demandait que `typeof
totalStockValue === "number"`, et une porte de DELTA (activeAlerts /
criticalItems / totalStockValue sur une base REELLE) restait consigne. La sonde
brute `probe-dashboard-voices.mjs` ne le jugeait pas non plus. Ce sprint
referme cette consigne: le spec `dashboard-contract.spec.ts` porte DEUX tests
DELTA (S1, S2) qui postent par la MEME voie que l'UI (InventoryAudit derive le
statut des quantites: quantity <= minStock => critical), puis DELETE et jugent
le RETOUR a la ligne de base. Le registre des mutations passe de 6 a 9 ancres
(M7 purge de stock, M8 COUNT critique, M9 somme des quantites au lieu des
prix) et chacune mord sur les octets relus.

### 13.1.1 GET /api/dashboard/stats: la DELTA du champ activeAlerts + totalStockValue

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| S1 | le gate `verify:routes` ne lui demandait que `typeof body.totalStockValue === "number"` (un nominal), et le champ activeAlerts n etait jamais jugé par une DELTA | POST /api/inventory (quantity=1 <= minStock=2 => status=critical) => activeAlerts = base+1 ET totalStockValue = base+1.5 (1 kg * 1.5), puis DELETE => RETOUR EXACT aux DEUX lignes de base |

### 13.1.2 GET /api/dashboard/stats: la DELTA du champ criticalItems

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| S2 | le champ criticalItems n etait jamais jugé par une DELTA (le COUNT critique restait un chiffre non solde) | POST /api/inventory (quantity=1 <= minStock=2 => critical) => criticalItems = base+1, puis DELETE => RETOUR EXACT a la ligne de base |

### 13.1.3 Le chemin du champ critigue (S1/S2)

```
POST /api/inventory   (voie UI: InventoryAudit derive status=critical des quantites)
GET /api/dashboard/stats (S1: activeAlerts=base+1, totalStockValue=base+1.5; S2: criticalItems=base+1)
DELETE /api/inventory/<id> (la purge des alertes de stock par le stats route)
GET /api/dashboard/stats (RETOUR EXACT aux lignes de base)
```

### 13.1.4 Preuves LIÉES (et non inferrees)

```
npm run verify:dashboard      7 passed (D1..D5, S1, S2)
npm run verify:dashboard-mord TEMONIN vert + 9/9 MORDENT (M1..M9)
npm run verify:all           GATES=35 ROUGES=0 (lot complet, liste LUE dans package.json)
```

Les ancres de la morsure vivent dans `scripts/registre-mutations-dashboard.py`
(fichier de DONNEES: le poste rogne les emissions longues et une ancre mal
transcrite se presentait comme un « ne mord pas », la faute consignee du 09/09)
et chaque ancre est COMPTE sur les octets relus avant d'etre jugee. Les trois
mutations nouvelles:
- **M7 (S1)**: la purge des alertes de stock ne s execute jamais — la DELETE du
  stats route est REMPLACEE par un UPDATE sur un id qui n existe pas, l alerte
  persiste apres la DELETE et le retour a la ligne de base echoue.
- **M8 (S2)**: le COUNT des articles critiques redevient le COUNT des articles
  ok — le statut REELLEMENT en base (critical) est remplacé par `ok`, le champ
  criticalItems reste a la ligne de base et la DELTA echoue.
- **M9 (S1)**: la valeur du stock redevient la SOMME DES QUANTITES (sans
  unit_price) — `SUM(quantity * unit_price)` est remplacé par `SUM(quantity)`,
  totalStockValue ne suit plus le prix et la DELTA echoue.

### 13.1.5 Ouvert, consigne (et non oublie)

- **La sonde brute `scripts/probe-dashboard-voices.mjs` ne juge PAS les
  verdicts** (elle print les corps; le spec de contrat juge). Son contrat reste
  consigne.
- **La fenêtre du champ dailyLaborCost** reste jugée par le gate
  `verify:routes` (nominal) et pas par une DELTA (S3 reste consigne — elle
  demande un planning poste par la voie UI, ce que S1/S2 ne solde pas).
- Reproduction CI: le runner GitLab est x86_64, `binfmt/qemu` non enregistre
  sur ce poste → le delta d'architecture reste **non testable ici** (piege
  deja consigne).
