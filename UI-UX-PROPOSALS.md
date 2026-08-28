# CookDrive — Audit UI/UX & Propositions d'amélioration

> **Statut :** Document de propositions (aucun fichier modifié)
> **Base :** lecture du code réel — `src/index.css` (249 lignes), `src/App.tsx` (934 lignes), `src/components/DashboardOverview.tsx` (550), `src/components/InventoryAudit.tsx` (1231), `src/components/MenuAnalysis.tsx` (1753), `src/components/FichesTechniques.tsx` (2348), `src/components/NavItem.tsx` (46), `index.html`, `package.json`.
> **Stack :** React 19 + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite`, sans `tailwind.config`) + `motion/react` + recharts + lucide-react.

---

## 1. Audit actuel

### 1.1 Ce qui fonctionne bien (à conserver)

| Force | Preuve dans le code |
|---|---|
| Identité visuelle forte | Thème "obsidian" cohérent (`#050505`), accent émeraude, LED glows + filaments latéraux (`side-light-active`, `led-glow-container`). Distinctif et mémorable. |
| Architecture shell propre | `App.tsx` : sidebar `NavItem` (46 lignes, très lisible), header sticky avec recherche globale (debounce 300 ms), cloche de notifications avec polling 30 s, menu profil, drawer mobile < 1024 px avec overlay. |
| i18n appliqué partout | `TRANSLATIONS` + helper `t.*` + fallback systématiques ; `translateIngredientHelper` pour les données backend. |
| Gestion des états vides | Empty states soignés (`Aucun dossier sélectionné`, `Dossier vide`, notifications vides avec icône `opacity-20`). |
| Modale complexe maîtrisée | `FichesTechniques` : modale plein écran/resize, scroll interne, table d'ingrédients éditables inline, tfoot avec total, section "optimiseur prix fournisseurs". |
| Tableaux denses lisibles | Inventaire : en-têtes sticky par catégorie, jauge de stock colorée par statut, mono pour les valeurs numériques. |
| Écrans d'attente explicites | Spinners dédiés ("Analyse en cours…", "Initialisation en cours…"), écran trial-expired, loader settings. |
| Error catcher `index.html` | Multi-couches (error + unhandledrejection) avec bouton refresh — évite le black screen. |

### 1.2 Incohérences détectées (constatées dans le code)

**A. Tokens hors `@theme` / inexistants**
1. `text-slate-550` utilisé 5× dans `Haccp.tsx` (lignes 470, 484, 500, 535, 637) — **classe inexistante dans Tailwind**, texte rendu invisible (pas de fallback).
2. `shadow-glow-emerald` utilisé 2× dans `InventoryAudit.tsx` (lignes 1078, 1208) — **classe inexistante** (ni dans `index.css`, ni par défaut).
3. `text-glow-indigo` utilisé 1× (`InventoryAudit.tsx` ligne 626) — classe inexistante.
4. Classes `custom-scrollbar` et `hide-scrollbar` utilisées 25× mais **jamais définies** — le style global `::-webkit-scrollbar` s'applique quand même, mais `hide-scrollbar` n'a aucun effet réel.
5. `@theme` ne définit que `brand-50/100/500/600/900/950` : `brand-200` à `brand-400` utilisés (ex. `text-brand-400`, `border-brand-500/30` OK mais `hover:bg-brand-500` sur boutons) manquent ; `glass` et `glass-border` sont des `rgba` bruts, pas des tokens de palette complets.

**B. Palette : 4 couleurs d'accent en compétition + hex arbitraires**
- Émeraude (brand) / ambre / bleu / violet sont tous des "accents" (cartes dashboard, boutons FichesTechniques, badges, glows LED). La couleur porte la *catégorie*, pas l'*action* → incohérent : dans `FichesTechniques`, "Ajouter Manuellement" est **bleu**, "Scanner & Importer" est **violet**, "Livre des Recettes" est **ambre**, "Rafraîchir" est **émeraude** — 4 boutons primaires dans un seul en-tête.
- 47 occurrences de `bg-[#1A1A1A]`, 27 de `bg-[#0A0A0A]`, + `#121212`, `#111`, `#181818`, `#141414` : au moins **6 surfaces noires arbitraires** au lieu de 3–4 tokens.
- `emerald-*` est utilisé **en double** avec `brand-*` (`text-emerald-500` vs `text-brand-500`, `border-emerald-500/30` vs `border-brand-500/30`) — ils sont identiques (`#10b981`) mais le code oscille, rendant les diffs et la maintenance confus.
- `indigo` (12×) apparaît dans les focus des formulaires inventaire et les boutons, hors palette.

**C. Typographie**
- Pas de scale : tailles arbitraires partout — `text-[7px]`, `text-[7.5px]`, `text-[8px]`, `text-[9px]`, `text-[10px]` (≈ 100+ occurrences), `text-[11px]`, `text-[14px]`… jusqu'à `text-3xl`.
- **`text-[8px]`/`text-[9px]`/`text-[7px]` = illisibles** (Haccp 10× en 8 px, MenuAnalysis 11× en 9 px). Un SRO n'a pas le droit de lire du 8 px.
- `tracking-widest` + `uppercase` + `font-black` en permanence sur les labels : 44 occurrences de `animate-in`/slide-in et des centaines de `tracking-widest`. Le style "industrial uppercase" appliqué aux *labels de formulaire* (Haccp) dégrade la lisibilité.
- `font-display` (Space Grotesk) seulement sur h1–h6 via `@layer base` ; pas de hiérarchie de poids/interlignes documentée.

**D. Radius & ombres**
- Radius : `rounded-xl` (178×), `rounded-2xl` (113×), `rounded-lg` (96×), `rounded-3xl` (48×), `rounded-full` (77×) — **4 tailles de coins différentes sur les mêmes familles de composants** (boutons : `rounded-xl` et `rounded-2xl` mélangés ; cartes : `rounded-2xl` et `rounded-3xl`).
- Pas de scale d'ombres : `shadow-lg`/`shadow-2xl`/`shadow-xl`/`shadow-inner` + des dizaines de `shadow-[0_0_20px_rgba(...)]` et `shadow-emerald-500/20` inline, + 8 classes `led-glow-*`/`side-light-*` en CSS. Au moins **5 niveaux d'élévation différents** sans règle d'usage.

**E. Composants non standardisés**
- **Boutons** : 155 occurrences de `transition-all/duration-500` mais pas un seul composant `Button`. Chaque bouton est recodé en ligne (ex. 4 variantes dans l'en-tête `FichesTechniques`, 3 boutons identiques entr/plat/dessert dupliqués 3× dans `MenuAnalysis`). États : `disabled:` n'apparaît que 32× (ex. boutons "Générer" OK, mais boutons de formulaire d'inventaire sans `disabled` pendant le submit → double submit possible).
- **Boutons icon-only sans `aria-label`** : ~40 boutons icône (`Edit2`, `Trash2`, `Download`, `X`…) avec seulement `title=` (qui ne suffit pas pour les lecteurs d'écran).
- **Zéro `role=`, zéro `aria-`** dans tout `src/` (vérifié par recherche : 0 occurrence).
- **Modales** : un seul vrai modal (FichesTechniques) sans focus trap, sans fermeture `Escape`, sans `aria-modal` ; les formulaires "ajout/modification" d'inventaire sont des *inline expand* — pas de modal reutilisable.
- **Feedback** : `showNotification` (toast) existe mais **`alert()` natif est utilisé 64×** (MenuAnalysis 15×, Purchasing 12×, SettingsView 7×, InventoryAudit 5×…) — le NATIF `alert` cassent le style et bloque l'UI. Et `confirm()` 5× pour les suppressions (FichesTechniques, InventoryAudit avec `confirm` commenté/absent → **suppression sans confirmation**).
- **Chargement** : les vues lourdes (MenuAnalysis 1753 lignes + jsPDF, FichesTechniques 2348 + tesseract, Haccp, EpicureStudio) sont **importées statiquement** dans `views.ts` → le bundle principal charge tout. Aucun `React.lazy`.
- `animate-in fade-in slide-in-from-top-4` (classes du plugin `tailwindcss-animate`) est utilisé dans **15 composants**, mais **le plugin n'est pas installé** (`package.json` : ni `tailwindcss-animate`, ni `tw-animate-css`) → **ces animations ne s'exécutent jamais**.
- Performance : `backdrop-blur-xl`/`backdrop-blur-2xl`/`backdrop-blur-md` sur 24 éléments (sidebar, header, panneaux, toasts) + glows LED avec `box-shadow` multiples + `filter: drop-shadow` → sur une machine de restauration (CPU modeste), le glassmorphism en couches + les animations `motion` (`whileHover y:-5`) sur toutes les cartes est risqué.
- Le contenu principal a `p-10` fixe (40 px) sur toutes les vues sauf chat : `p-4`/`p-6` en dessous de 1024 px… en réalité le padding ne change pas, seul le contenu s'étire.

**F. UX fonctionnelle**
- Pas de navigation clavier / raccourcis (pas de `Cmd+K` malgré un champ de recherche global existant).
- Pas de breadcrumb / sous-navigation dans les vues à profondeur (FichesTechniques : vue → catégorie → fiche éditée → modale).
- Pas de skeleton screens : chargement = spinner centré seul, le layout saute quand les données arrivent (layout shift).
- Le formulaire d'inventaire (ajout) ne se **valide visuellement nulle part** : pas d'état d'erreur par champ, pas de `disabled` sur le submit pendant le fetch.
- Modale FichesTechniques : pas de `min-width` garanti sur les colonnes de prix (`w-10`, `w-16`) → sur fenêtre étroite le tableau déborde sans scroll horizontal explicite.

---

## 2. Design System proposé

Principe : **tout dans `@theme` de `index.css`**, puis des classes utilitaires composantes (`.btn`, `.card`, `.field`…) en `@layer components`. Un seul accent par *action* (émeraude), les couleurs de *catégorie* (ambre/bleu/violet/rouge) sont des sémantiques de **statut**, jamais des boutons.

### 2.1 Palette (tokens `@theme`)

```css
@theme {
  /* Surfaces — remplace #050505/#0A0A0A/#1A1A1A/#121212… */
  --color-surface-0: #050505;   /* obsidian — fond app */
  --color-surface-1: #0A0A0A;   /* sidebar/header, panneaux */
  --color-surface-2: #111111;   /* cartes, inputs */
  --color-surface-3: #1A1A1A;   /* surélévation (modale, dropdown) */

  /* Texte */
  --color-text-high:  #F8FAFC;  /* titres, valeurs clés */
  --color-text-base:  #CBD5E1;  /* corps (remplace text-slate-300 global) */
  --color-text-muted: #94A3B8;  /* secondaires */
  --color-text-faint: #64748B;  /* labels, meta (jamais sous #475569 pour contraste) */

  /* Accent / action — émeraude UNIQUE pour les actions */
  --color-accent-300: #6EE7B7;
  --color-accent-400: #34D399;
  --color-accent-500: #10B981;
  --color-accent-600: #059669;
  --color-accent-950: #022C22;

  /* Sémantiques de STATUT (badges, alertes, jauges) */
  --color-status-ok:      #10B981;  /* succès / stock OK */
  --color-status-warn:    #F59E0B;  /* à commander / avertissement */
  --color-status-danger:  #EF4444;  /* rupture / critique */
  --color-status-info:    #3B82F6;  /* informatif (robots, infos) */

  /* Catégories MENU (couleurs de contenu, badges uniquement) */
  --color-cat-creative:    #3B82F6;  /* cuisine créative */
  --color-cat-gastrono:    #A855F7;  /* haute gastronomie */
  --color-cat-bistro:      #F59E0B;  /* bistro chic */
  --color-cat-import:      #10B981;  /* fiches importées */

  /* Glassmorphism */
  --color-glass:          rgba(255,255,255,0.03);
  --color-glass-border:   rgba(255,255,255,0.08);
  --color-glass-strong:   rgba(10,10,10,0.85); /* modales/dropdowns */
}
```

Règles :
- Supprimer les usages de `emerald-*` au profit d'`accent-*` (alias : garder `--color-emerald-*` de Tailwind uniquement pour les exports PDF).
- `brand-*` devient un **alias** d'`accent-*` pour migration progressive : `--color-brand-500: var(--color-accent-500)` (ou migration directe).
- Les 6 hex `bg-[#1A1A1A]` etc. → `bg-surface-2` / `bg-surface-3` (≈ 80 occurrences à remplacer).

### 2.2 Typographie

```css
@layer base {
  /* Hiérarchie fixée — interdiction de text-[7px] à text-[9px] */
  .text-caption  { @apply text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-text-faint; }
  .text-label    { @apply text-xs font-semibold text-text-muted; }

  h1 { @apply font-display text-3xl font-bold tracking-tight text-text-high; }   /* vue : titre de section */
  h2 { @apply font-display text-2xl font-bold tracking-tight text-text-high; }   /* carte : titre */
  h3 { @apply font-display text-lg font-semibold text-text-high; }              /* sous-titre */
  h4 { @apply font-sans text-sm font-bold text-text-high; }                     /* label de section */

  body { @apply font-sans text-[14px] leading-relaxed text-text-base; }
}
```

Scale autorisé (interdire le reste par convention + lint) :
| Usage | Classe |
|---|---|
| Valeur héro (KPI) | `text-4xl font-black font-mono` |
| Titre vue | `text-3xl` |
| Titre carte | `text-2xl` |
| Corps principal | `text-sm` (14 px) |
| Corps tableau | `text-sm` |
| Meta / badge | `text-xs` (12 px) |
| Caption mono | `text-caption` (10 px — **plancher absolu**) |

- Bannir `text-[7px]/[7.5px]/[8px]/[9px]` (≈ 60 occurrences) → minimum `text-[10px]` via `.text-caption`.
- Réserver `uppercase tracking-widest font-black` aux **KPI et labels techniques** ; les labels de formulaire passent en `text-label` (sentence case, `font-semibold`).

### 2.3 Espacement

Grille 4 px. Tokens utiles déjà disponibles dans Tailwind ; la règle à fixer :
- `gap-2`/`gap-4` dans les groupes d'éléments, `gap-6`/`gap-8` entre sections, `p-6`/`p-8` dans les cartes (remplacer le `p-4 md:p-6` flottant et le `p-10` du contenu global par un wrapper standard `.view` avec `p-6 md:p-8` + `gap-8`).
- Remplacer le `p-10` global du main (`App.tsx` ligne 812) par `p-4 md:p-8` : 40 px de padding fixe sur 1328 px de contenu mobile-tablette est trop.

### 2.4 Bordures & radius

| Élément | Radius | Bordure |
|---|---|---|
| Micro (badges, chips A-Z) | `rounded-md` (6) | `border-white/5` |
| Inputs, boutons, cellules | `rounded-lg` (8) | `border-white/10` (repos) / `border-accent-500` (focus) |
| Cartes, panneaux | `rounded-xl` (12) | `border-white/5` ou `border-glass-border` |
| Modales, panneaux larges | `rounded-2xl` (16) | `border-white/10` |
| Piles (boutons ronds, avatars) | `rounded-full` | — |

Interdire `rounded-3xl` hors des containers de type "hero" (mode cards MenuAnalysis). Remplacer les 48 usages de `rounded-3xl` par `rounded-2xl` sauf cas délibérés.

### 2.5 Ombres & glassmorphism (3 niveaux max)

```css
@theme {
  --shadow-1: 0 1px 2px rgba(0,0,0,0.5);          /* repos */
  --shadow-2: 0 8px 24px rgba(0,0,0,0.45);         /* hover / interactive */
  --shadow-3: 0 24px 64px rgba(0,0,0,0.6);         /* modales / dropdowns */
  --shadow-led: 0 0 20px rgba(16,185,129,0.15);    /* LED accent, réservé aux KPI actifs */
}
```
- Niveau 1 = cartes au repos ; niveau 2 = au survol/focus ; niveau 3 = éléments flottants (modal, dropdown, toast).
- Le glassmorphism (`backdrop-blur`) se limite à **3 surfaces maximum** par écran : sidebar + header + modale. Les `glass-panel` (17×) gardent le blur mais on passe à `backdrop-blur-md` (moins coûteux que `-xl`/`-2xl`) et on retire le blur des toasts/dropdowns (fond `glass-strong` opaque).

### 2.6 Boutons

Un composant `Button` (`src/components/ui/Button.tsx`) en 4 variantes. Le code cible (classes) :

```
.btn           base : inline-flex items-center justify-center gap-2 text-sm font-bold
               rounded-lg px-4 py-2.5 transition-colors duration-150
               focus-visible:outline-none focus-visible:ring-2 ring-accent-400/60 ring-offset-2 ring-offset-surface-0
               disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]

.btn-primary    bg-accent-600 text-white border border-accent-400/30
               hover:bg-accent-500 shadow-led
.btn-secondary  bg-surface-3 text-text-base border border-white/10 hover:bg-white/10
.btn-ghost      bg-transparent text-text-muted hover:bg-white/5 hover:text-text-high
.btn-danger     bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white
```
Règles :
- **L'action principale d'une vue = 1 seul `btn-primary`** (émeraude). Les actions secondaires → `btn-secondary`/`btn-ghost`. Les variantes bleu/violet/ambre des boutons actuels (`MenuAnalysis`, `FichesTechniques`) deviennent `btn-secondary` avec icône colorée (la couleur reste sur l'icône/badge, pas sur le bouton).
- États `disabled` + `aria-busy` sur tous les boutons qui déclenchent un fetch (submit d'inventaire, génération IA, scan).

### 2.7 Cartes

```
.card        base : bg-surface-1 border border-white/5 rounded-xl
.card-hover  hover:shadow-2 hover:border-white/10 transition-all duration-150
.card-led    état actif (sidebar/active card) : border-accent-500/50 + .side-light-active
             (conserver le pattern existant, il est bon — mais centralisé)
.card-flat   contenu dense (tableau, liste) : bg-surface-0 border-white/10 rounded-xl overflow-hidden
```
Les 4 variantes `card-active-{emerald,amber,blue,purple}` de `index.css` (× ~80 lignes de duplication) deviennent une seule `.card-led` avec `color-mix()` ou une variable `--led-color` :

```css
.card-led {
  --led: var(--color-accent-500);
  border-left: 3px solid var(--led);
  background: linear-gradient(90deg, color-mix(in srgb, var(--led) 18%, transparent) 0%,
              color-mix(in srgb, var(--led) 5%,  transparent) 30%, transparent 100%);
  box-shadow: -15px 0 30px -10px color-mix(in srgb, var(--led) 60%, transparent);
}
```
→ − 60 lignes de CSS dupliquées, et une seule classe à personnaliser par `style={{'--led': color}}`.

### 2.8 Tableaux

```
.table         w-full text-sm; thead : text-caption bg-surface-2 border-b border-white/5 sticky
.table-row     hover:bg-white/[0.03] transition-colors
.table-zebra   even:bg-white/[0.015]  (optionnel, recommandé > 20 lignes)
.table-cell    px-4 py-3 (remplace px-8 py-6 trop large en desktop ET en mobile)
.table-num     font-mono tabular-nums text-right
```
- Remplacer `px-8 py-6` (inventaire) par `px-4 py-3` : les cellules font 64 px de padding horizontal, c'est 4× le standard.
- Colonne actions : `justify-end gap-2`, boutons icône en `.btn-ghost h-8 w-8` + `aria-label`.

### 2.9 Badges (statut)

```
.badge          inline-flex items-center gap-1.5 text-caption px-2.5 py-1 rounded-md border
.badge-ok       bg-status-ok/10   text-status-ok   border-status-ok/30
.badge-warn     bg-status-warn/10 text-status-warn border-status-warn/30
.badge-danger   bg-status-danger/10 text-status-danger border-status-danger/30
.badge-info     bg-status-info/10 text-status-info border-status-info/30
.badge-neutral  bg-white/5        text-text-muted  border-white/10
```
- Le statut d'inventaire (ok/low/critical) et les alertes (high/medium) passent par `.badge-*` au lieu de `text-emerald-500` + `animate-pulse` ad hoc (le `animate-pulse` se garde uniquement pour le `dot` live, pas pour les badges entiers — 12× actuellement).
- Les badges de catégorie menu (creative/gastronomic/bistro) utilisent `--color-cat-*`.

### 2.10 Form inputs

```
.label    block text-label mb-1.5
.input    w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-high
          placeholder:text-text-faint outline-none transition-colors
          focus:border-accent-500 focus:ring-2 ring-accent-500/20
          .input-error : border-status-danger/60 focus:ring-status-danger/20
.select   .input + appearance-none + chevron (icône lucide en absolute)
.checkbox  h-4 w-4 rounded border-white/20 bg-surface-2 accent-[#10B981]
.error-msg  text-xs text-status-danger mt-1.5 flex items-center gap-1
```
- Ajouter l'état d'erreur par champ dans le formulaire inventaire (nom vide, quantité < 0, prix NaN) — aujourd'hui : zéro validation client.
- Le `select` natif sombre : ajouter `& option { background: var(--color-surface-2); color: var(--color-text-high); }` (les `<option>` actuels sont clairs sur Chrome).

### 2.11 Modales

Un composant `Modal` unique (au lieu du pattern recodé dans FichesTechniques) :

```
.modal-overlay  fixed inset-0 z-100 bg-black/70 backdrop-blur-sm
               (data-open sur body → overflow:hidden)
.modal-panel    relative w-full max-w-3xl (lg:max-w-5xl) bg-surface-3 border border-white/10
               rounded-2xl shadow-3 max-h-[90vh] flex flex-col
.modal-header   p-6 border-b border-white/5 flex items-start justify-between gap-4
.modal-body     flex-1 overflow-y-auto p-6 custom-scrollbar
.modal-footer   p-6 border-t border-white/5 flex justify-end gap-3 bg-surface-1
```
Comportement obligatoire : `Escape` → fermeture (sauf si `preventClose`), focus trap (focus sur le premier `.input`/bouton au mount, retour focus au trigger à la fermeture), `role="dialog" aria-modal="true" aria-labelledby={titreId}`, clic overlay → fermeture.
La modale plein écran existante de FichesTechniques reste un `size="full"` de ce même composant.

---

## 3. Améliorations UX (8 propositions)

### UX-1 · Accessibilité — focus, contrastes, ARIA *(impact élevé / effort moyen)*
- **Constat** : 0 `aria-*`/`role` dans le code ; boutons icône sans label ; labels de formulaire sans `htmlFor` (le `label` d'inventaire n'est associé à aucun `input`) ; plancher de 7–9 px.
- **Faire** :
  1. `@layer base` : `*:focus-visible { outline: 2px solid var(--color-accent-400); outline-offset: 2px; border-radius: 4px; }` (global, couvre NavItem, boutons, modale).
  2. Remplacer `text-slate-550` (inexistant) par `text-text-faint` ; plancher `text-caption` (10 px) — supprimer `text-[7px]…[9px]`.
  3. Contraste : `text-text-faint` (#64748B) passe sous WCAG AA en *petit* sur `#050505` (≈ 4.7:1) → garder uniquement pour les meta ; corps en `text-text-base` (#CBD5E1).
  4. `aria-label` sur les ~40 boutons icône ; `htmlFor`+`id` sur les champs ; `aria-busy` sur les boutons async ; `role="status"` sur le toast.
  5. Modal : `role="dialog"`, focus trap, `Esc` (voir 2.11).
- **Comment faire** : un PR "a11y pass" par vue ; vérifier au clavier seul (Tab/Shift+Tab) chaque écran. Effort : 1–2 jours.

### UX-2 · Feedback — supprimer `alert()`/`confirm()`, toasts + confirm modale *(impact élevé / effort moyen)*
- **Constat** : 64 `alert()`, 5 `confirm()` natifs (bloquants, style OS, cassent l'immersion) ; suppression d'ingrédient inventaire **sans confirmation** (risque en production) ; toast existant mais singleton (1 message, 3 s, non empilable).
- **Faire** :
  1. Nouveau `Toast` empilable (max 3, `role="status"`, auto-dismiss 4 s, 7 s pour les erreurs) — remplacer toutes les `showNotification` et toutes les `alert()` par `toast.success/error/info` (64 call sites, regex de migration possible : `alert(\`?(.*)\)?` → `toast(...)`, mais à relire à la main).
  2. Composant `ConfirmDialog` (basé sur `Modal`) pour les suppressions : inventaire, fiches techniques (remplacer `confirm`), articles achats.
  3. Pendant les submits : `aria-busy` + bouton `disabled` + spinner inline (pas de double submit).
- **Effort** : 2–3 jours (le plus long = migration des 64 call sites, faisable vue par vue).

### UX-3 · Feedback — skeleton screens + empty states systématiques *(impact élevé / effort faible)*
- **Constat** : seuls des spinners centrés pendant le fetch (dashboard, inventaire, fiches) ; layout shift au chargement ; empty states corrects mais inégaux.
- **Faire** :
  1. Composant `<Skeleton className="h-4 w-40 rounded" />` (`animate-pulse bg-white/5`) + squelettes par vue : dashboard (4 KPI + 2 chartes), inventaire (en-têtes catégorie + 6 lignes), fiches (grille de 4 cartes).
  2. Pattern `if (isLoading) return <DashboardSkeleton/>` — le layout final ne bouge plus (mêmes hauteurs réservées).
  3. Unifier les empty states : icône 48 px + titre + description + **CTA** (ex. inventaire vide → bouton "Importer un CSV" ou "Ajouter un ingrédient").
- **Effort** : 1 jour.

### UX-4 · Navigation — raccourcis clavier + recherche `Ctrl/Cmd+K` *(impact élevé / effort faible)*
- **Constat** : la recherche globale existe déjà (debounce + dropdown) mais n'est accessible que par clic ; pas de raccourcis ; pas de breadcrumb.
- **Faire** :
  1. `useEffect` dans `App.tsx` : `keydown` → `Meta/Control+K` = focus du champ de recherche ; `g` puis touche (fiche "Vim-like") ou `Alt+1…9` = onglet sidebar (1=Dash, 2=Inventaire, 3=Menus, 4=Recettes, 5=Production, 6=HACCP…) ; `Esc` = fermer dropdowns/modales.
  2. Afficher `⌘K` en placeholder du champ de recherche + tooltip sur la cloche (nouvelles alerts).
  3. Breadcrumb léger dans le header sous le titre : `Inventaire / Fiches / Recette X` (état `activeTab` + état de vue sous-jacente remonté par un simple context).
- **Effort** : 1 jour.

### UX-5 · Performance — lazy loading des vues + défragmentation *(impact élevé / effort faible)*
- **Constat** : `views.ts` importe 13 composants statiquement (jsPDF, tesseract.js, papaparse, recharts chargés au boot) ; aucun `React.lazy` (vérifié : 0 occurrence).
- **Faire** :
  ```tsx
  const DashboardOverview = lazy(() =>
    import("./components/views").then(m => ({ default: m.DashboardOverview })));
  // ou plus propre : un fichier par lazy chunk
  ```
  En pratique, `React.lazy` exige des exports par défaut : soit on crée `src/components/lazy/*.tsx` (13 wrappers de 3 lignes, `export default function X(props){ return <Orig {...props}/> }`), soit on convertit les 13 composants en `export default`.
  2. `<Suspense fallback={<ViewSkeleton/>}>` autour du content area (remplace l'`animate-in fade-in` statique qui ne fonctionne de toute façon pas — voir plus bas).
  3. `recharts` et `jsPDF` ne sont utilisés que par 3–4 vues : le gain est réel (bundle initial divisé ≈ 2).
- **Effort** : 0,5 jour. **Note** : avec lazy, chaque vue devient un chunk → l'`index.html error catcher` doit couvrir les chunk load failures (ajouter un `onError` sur `React.lazy` qui propose "Recharger").

### UX-6 · Performance visuelle — réduire le glassmorphism + animations *(impact moyen / effort faible)*
- **Constat** : 24 `backdrop-blur-*`, 155 `transition-all`/`duration-500`, `motion whileHover y:-5` sur chaque carte dashboard, 8 glows LED avec `box-shadow` multiples, `filter: drop-shadow` sur les icônes.
- **Faire** :
  1. 3 surfaces floutées max par écran (sidebar, header, modale) → `backdrop-blur` des `glass-panel` remplacés par `bg-surface-1` + `border` (le fond est déjà presque opaque, le blur est perceptuellement inutile là) ; garder le blur uniquement sur les overlays (modales, toasts).
  2. `duration-500 ease-in-out` → `duration-150` pour hover/focus (500 ms = perçu comme lent) ; garder `duration-500` pour les changements de sidebar (transition d'état, pas de micro-interaction).
  3. Retirer `whileHover={{y:-5}}` sur les 4 KPI (le déplacement de 5 px sur 4 grandes surfaces = nauséeux) ; le glow LED + la `card-led` active suffisent pour le feedback.
  4. Ajouter `@media (prefers-reduced-motion: reduce) { .animate-pulse, .card-led::before { animation: none; transition: none; } }`.
- **Effort** : 0,5 jour.

### UX-7 · Responsive — modales et tableaux en fenêtre étroite *(impact moyen / effort faible)*
- **Constat** : app desktop mais modale FichesTechniques `max-w-5xl` avec colonnes `w-10`/`w-16` fixes ; tables d'inventaire sans scroll horizontal dédié (le `overflow-x-auto` existe mais le container est `max-h-[700px]` avec scroll vertical mixé) ; le mobile force redirigement vers inventaire mais les modales n'ont pas de mode mobile.
- **Faire** :
  1. `Modal` : `w-full max-w-3xl md:max-w-5xl` + `max-h-[92vh]` ; sur `< 640 px`, `inset-0` plein écran (comme le mode full actuel).
  2. Tables : wrapper dédié `overflow-x-auto` avec `min-w-[640px]` sur le `<table>` → scroll horizontal propre sur les petites fenêtres.
  3. Header : masquer le titre + sous-titre sous `md:` (ne garder que le hamburger + recherche + cloche) ; la recherche passe en icône qui ouvre une barre plein largeur.
- **Effort** : 0,5–1 jour.

### UX-8 · Cohérence — composants partagés + cleanup CSS *(impact moyen / effort moyen)*
- **Constat** : pas de `src/components/ui/` ; boutons, badges, inputs, tables recodés dans 13 fichiers ; `index.css` contient 4× les mêmes blocks `card-active-*`/`side-light-active-*` (≈ 120 lignes de duplication) ; 64 `alert()` ; plugin `tailwindcss-animate` utilisé sans être installé (44 classes mortes).
- **Faire** :
  1. Créer `src/components/ui/` : `Button.tsx`, `Badge.tsx`, `Card.tsx`, `Input.tsx` (label+input+error), `Modal.tsx`, `Skeleton.tsx`, `Toast.tsx`, `Table.tsx` (wrapper th sticky). C'est la précondition des 5 propositions précédentes.
  2. `index.css` : regrouper les 4 variantes LED en 1 (variable `--led`, voir 2.7) ; supprimer les `card-active-*` dupliquées au profit de `.card-led` ; définir `.custom-scrollbar` et `.hide-scrollbar` réellement (ou les retirer et garder `::-webkit-scrollbar` global + `scrollbar-width: thin`).
  3. Décision : installer `tw-animate-css` (`@import "tw-animate-css";`) pour faire vivre les 44 `animate-in`, ou les remplacer par `motion` (déjà installé) / un simple `transition`. Je recommande `tw-animate-css` (1 ligne, 2 ko) pour la migration la plus rapide.
  4. Conventions (README ou ce document) : 1 seul `btn-primary` par vue ; les couleurs de statut ne servent jamais de bouton ; plancher typographique 10 px.
- **Effort** : 2–3 jours pour la création des composants + migration progressive (vue par vue, pas en big-bang).

---

## 4. Priorisation (matrice impact / effort)

```
IMPACT ÉLEVÉ
│
│  UX-5 Lazy loading          UX-1 A11y (focus/aria/
│  (0,5 j)                    contrastes) (2 j)
│
│  UX-3 Skeletons (1 j)       UX-2 Toasts + Confirm
│                             (remplace 64 alert) (3 j)
│
│  UX-4 Ctrl+K + raccourcis
│  (1 j)
├────────────────────────────────────────────
│  UX-7 Modales/tables        UX-8 Composants UI
│  étroites (0,5 j)           + cleanup CSS (3 j)
│
│  UX-6 Réduction glass/      (à lancer EN PARALLÈLE
│  animations (0,5 j)         de UX-1 à UX-3)
│
IMPACT MOYEN
└────────────────────────────────────────────
EFFORT FAIBLE                        EFFORT MOYEN/ÉLEVÉ
```

**Ordre recommandé de l'itération (sprint 1, ~5 jours) :**
1. **UX-5** (lazy, 0,5 j) + **UX-6** (glass/animations, 0,5 j) — gains perceptibles immédiats, zéro risque.
2. **UX-3** (skeletons, 1 j) + **UX-4** (Ctrl+K/raccourcis, 1 j).
3. **UX-1** (a11y, 2 j) — en s'appuyant sur la création du `ui/` (début de **UX-8**).
4. **UX-2** (toasts/confirm, 3 j) et **UX-7** (modales étroites, 0,5 j) — sprint 2.

**Sprint 2 :** finir la migration `ui/` (UX-8) sur les 13 vues, migration des 64 `alert()`, suppression du CSS dupliqué LED, tokens `@theme` complets (2.1) appliqués sur 100 % des vues.

---

## 5. Exemples de code — les 4 améliorations à plus fort impact

### 5.1 Lazy loading des vues (UX-5)

`src/components/lazy/views-lazy.tsx` (nouveau, ~40 lignes) :

```tsx
import { lazy } from "react";
import type { ComponentType } from "react";

// Chaque wrapper est isolé → chunk par vue
export const DashboardOverview = lazy(() =>
  import("../DashboardOverview").then(m => ({ default: m.DashboardOverview })));
export const InventoryAudit = lazy(() =>
  import("../InventoryAudit").then(m => ({ default: m.InventoryAudit })));
export const MenuAnalysis = lazy(() =>
  import("../MenuAnalysis").then(m => ({ default: m.MenuAnalysis })));
export const FichesTechniques = lazy(() =>
  import("../FichesTechniques").then(m => ({ default: m.FichesTechniques })));
// … idem pour les 9 autres (Haccp, Purchasing, StaffPlanning, AntiWaste,
//    ProductionPlan, QualityControl, DocumentManager, RobotManagement,
//    EpicureStudio, CulinaryChat, SettingsView)
```

Dans `App.tsx`, remplacer l'import de `views.ts` et le bloc de rendu :

```tsx
import * as Views from "./components/lazy/views-lazy";
import { ViewSkeleton } from "./components/ui/Skeleton";

// À l'intérieur de <div className="flex-1 overflow-auto …"> :
<Suspense fallback={<ViewSkeleton />}>
  {activeTab === "dashboard" && <Views.DashboardOverview t={t} settings={settings} />}
  {activeTab === "inventory" && <Views.InventoryAudit … />}
  {/* … */}
</Suspense>
```

> `views.ts` reste pour les imports non-lazy (LandingPage, NavItem). L'`error catcher` d'`index.html` doit aussi attraper les échecs de chunk : ajouter
> ```js
> window.addEventListener('unhandledrejection', e => { /* existant */ });
> ```
> et un `onError` optionnel côté React si la taille de chunk devient critique.

### 5.2 Toasts empilables + ConfirmDialog (UX-2)

`src/components/ui/Toast.tsx` (nouveau) :

```tsx
import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Toast = { id: number; message: string; type: "success" | "error" | "info" };
const ToastCtx = createContext<(msg: string, type?: Toast["type"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts(p => [...p.slice(-2), { id, message, type }]); // max 3
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), type === "error" ? 7000 : 4000);
  }, []);

  const styles = {
    success: "bg-accent-600/90 text-white border-accent-400/30",
    error:   "bg-red-500/90 text-white border-red-400/30",
    info:    "bg-surface-3/95 text-text-base border-white/10",
  };
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
    error:   <AlertTriangle className="w-4 h-4 shrink-0" />,
    info:    <Info className="w-4 h-4 shrink-0" />,
  };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-md pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} role="status"
              initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className={`pointer-events-auto px-5 py-3 rounded-xl text-sm font-bold shadow-3 border flex items-center gap-3 ${styles[t.type]}`}>
              {icons[t.type]}
              <span className="flex-1">{t.message}</span>
              <button aria-label="Fermer" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>
                <X className="w-4 h-4 opacity-60 hover:opacity-100" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
```

Migration : dans chaque vue, `const toast = useToast();` puis `toast("L'ingrédient a été ajouté", "success")` — et suppression des `alert(…)`. Le `showNotification` existant d'`App.tsx` est remplacé par le provider (wrapper au-dessus de `<App/>` dans `main.tsx`), ce qui tue d'un coup le toast singleton d'`App.tsx` (lignes 71–82, 584–604).

`ConfirmDialog` = `Modal` (2.11) + 2 boutons (`btn-danger` + `btn-ghost`), usage :
```tsx
<ConfirmDialog
  open={!!pendingDelete}
  title="Supprimer cet ingrédient ?"
  description={`${item.name} sera retiré de l'inventaire. Action irréversible.`}
  confirmLabel="Supprimer" danger
  onConfirm={() => handleDelete(id)}
  onCancel={() => setPendingDelete(null)}
/>
```

### 5.3 Focus ring global + corrections a11y (UX-1)

Dans `src/index.css` :

```css
@layer base {
  /* Focus visible global — remplace les focus:ring ad hoc (13 fichiers) */
  :focus-visible {
    outline: 2px solid var(--color-accent-400);
    outline-offset: 2px;
  }
  /* Ne pas double-éclairer les inputs qui ont déjà leur ring de focus */
  .input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: none; /* leur focus:border + focus:ring prend le relais */
  }

  /* Plancher typographique + statut */
  .text-caption { @apply text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-text-faint; }
  .text-label   { @apply text-xs font-semibold text-text-muted; }

  /* Écran de chargement respectueux */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

Puis dans les vues :
- `Haccp.tsx` : `text-slate-550` → `text-text-faint` (5 lignes), `text-[8px]` → `text-caption`.
- `InventoryAudit.tsx` : boutons icône `aria-label={t.edit || "Modifier"}` / `aria-label={t.delete || "Supprimer"}` ; `shadow-glow-emerald` → `shadow-led` ; le bouton supprimer passe par `ConfirmDialog` (5.2).
- `MenuAnalysis.tsx` : `text-[9px]` → `text-caption` (11 lignes), `text-[8px]` → `text-caption` (4 lignes).

### 5.4 Réduction glassmorphism + LED unique (UX-6 + 2.7)

Dans `src/index.css`, remplacer les 4 blocs `card-active-{emerald,amber,blue,purple}` (~100 lignes) et les 4 `side-light-active-*` par :

```css
/* LED unique — la couleur est pilotée par --led (défaut : accent) */
.card-led,
.side-light-active {
  --led: var(--color-accent-500);
  cursor: pointer;
  position: relative;
  border-left: 3px solid var(--led);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--led) 20%, transparent) 0%,
    color-mix(in srgb, var(--led) 5%,  transparent) 30%,
    transparent 100%
  );
  box-shadow: -15px 0 30px -10px color-mix(in srgb, var(--led) 60%, transparent);
  transition: box-shadow 0.15s ease;
}
.side-light-active::before {
  content: "";
  position: absolute; left: -2px; top: 10%; bottom: 10%; width: 3px;
  border-radius: 0 10px 10px 0;
  background: var(--led);
  box-shadow: 0 0 10px var(--led), 0 0 20px var(--led),
              10px 0 40px color-mix(in srgb, var(--led) 80%, transparent);
  z-index: 20;
}
/* Variantes par couleur (sidebar + cartes menu) : */
.card-led-amber, .side-light-active-amber { --led: var(--color-status-warn); }
.card-led-blue,  .side-light-active-blue  { --led: var(--color-status-info); }
.card-led-purple, .side-light-active-purple { --led: var(--color-cat-gastrono); }
```

Dans `DashboardOverview.tsx`, les 4 KPI :
```tsx
// AVANT (lignes 173–177)
className={`glass-panel p-4 md:p-6 … ${activeCard === "stock"
  ? "side-light-active border-brand-500/50"
  : "led-glow-emerald border-brand-500/30"}`}
// APRÈS
className={`card p-4 md:p-6 … ${activeCard === "stock"
  ? "card-led"
  : "border-accent-500/30"}`}
// et la variante ambre :
style={{ "--led": "var(--color-status-warn)" } as React.CSSProperties}
```
Dans `MenuAnalysis.tsx` (cartes modes) : `border-blue-500/30 hover:border-blue-500/50 shadow-[0_0_25px…]` → `border-cat-creative/30 hover:border-cat-creative/50` avec `--led` correspondant ; les boutons Entrée/Plat/Dessert (3× dupliqués) → `<Button variant="secondary">` avec icône colorée.
Dans `NavItem.tsx` : `side-light-active` reste (1 classe, maintenant pilotée par `--led`) ; supprimer `text-base` (le label passe en `text-sm font-semibold` — 16 px c'est trop pour une sidebar).

---

## 6. Résumé exécutif

| Priorité | Action | Effort | Gain |
|---|---|---|---|
| P0 | Lazy loading des 13 vues (5.1) | 0,5 j | Bundle ÷ 2, démarrage ×2 plus rapide |
| P0 | Fix a11y bloquants : `slate-550`, plancher 10 px, focus ring (5.3) | 0,5 j | Lisibilité + clavier |
| P1 | Toasts + ConfirmDialog, remplacement des 64 `alert()` (5.2) | 3 j | Cohérence + sécurité (suppression) |
| P1 | Composants `ui/` (Button, Modal, Input, Badge, Skeleton, Table) | 2–3 j | Fin de la duplication (13 vues) |
| P1 | Skeletons + empty states CTA (UX-3) | 1 j | Perception de performance |
| P2 | Ctrl+K, Alt+1-9, breadcrumbs (UX-4) | 1 j | Productivité quotidienne |
| P2 | Glassmorphism 3 surfaces max, LED unique (5.4) | 0,5 j | CPU GPU, rendu lissé |
| P2 | Modales/tableaux en fenêtre étroite (UX-7) | 0,5 j | Robustesse desktop |
| P3 | Tokens `@theme` complets + hex arbitraires → tokens | 1 j | Base de tout le reste |

**Ce qu'il ne faut PAS toucher** (points forts) : le pattern `side-light-active` (une fois dédupliqué), la modale FichesTechniques (structure), la recherche globale existante, le système `t.*` de traduction, l'error catcher `index.html` (à compléter, pas à supprimer), les glows LED des KPI (signature visuelle de l'app).
