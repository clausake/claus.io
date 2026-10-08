# MISSION — Chantier 2 : Audit trail

## Contexte
Le repo est à jour sur origin/main (5ca75eb — 69 portes vertes sur le verify:all).
Le chantier 1 (Auth & identité) est soldé : backend + UI React, voir PHASES.md §331.
Tu travailles DIRECTEMENT dans ce repo (pas de sandbox) — les fichiers sont sur le disque.

## Ce qu'il faut construire (feuille de route AGENTS.md §8, chantier 2)
- Table `audit_log` : actor_id, actor_kind (humain/agent), route, action, entite,
  timestamp, payload (avant/après si pertinent).
- Helper central `logAudit()` : UN SEUL point d'entrée, appelé par les 62 routes
  mutables (POST/PUT/PATCH/DELETE des 20 routeurs `src/routes/`).
- HACCP obligatoirement tracé (scan, lots, températures — le règlement sanitaire
  exige la traçabilité).
- Porte de vérification : `verify:audit` — juge que chaque route mutable écrit
  dans audit_log (compter les routes citées vs déclarées, comme la carte des
  routes de documents).

## Pièges connus (leçons PHASES.md / AGENTS.md — À LIRE AVANT)
- Le contrat "cité ≠ jugé" : une route qui écrit audit_log mais jamais JUGÉE par
  la porte n'est pas couverte. La porte doit vérifier le CONTENU des assertions.
- Les migrations SQLite : voir src/db/init.ts (le schema est créé là, pas de
  migrations formelles — ajouter la table dans init.ts + le flag de version si utile).
- Chaque mutation agent doit être REFUSÉE pour le role agent (§8 : l'agent propose,
  l'humain exécute) — sauf écriture dans suggestions/audit_log elles-mêmes.
- Toute consigne dans PHASES.md DANS LE MÊME COMMIT que le travail.
- Le lint (`npx tsc --noEmit`) doit passer clean avant tout commit.
- Ne jamais commiter sans avoir JOUÉ les portes concernées (verify:auth, verify:audit).

## Livrable
1. Migration table + helper + branchement sur les 62 routes (compte réel vérifié : 62).
2. HACCP tracé.
3. Porte `verify:audit` verte + branchée dans scripts/run-all-gates.py (DEFAUT).
4. PHASES.md consigné (chantier 2 : décision, écrit, portes, restes).
5. COMMIT (pas de push — le pilote gère).

## Effort estimé
1-2 j de travail humain — travaille en autonomie, itère, ne demande pas.
