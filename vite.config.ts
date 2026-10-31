import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        // html2canvas : dépd optionnelle de jspdf (lazy import), jamais appelée
        // dans ce projet → on l'exclut du bundle pour économiser ~202 kB.
        external: ["html2canvas"],
        output: {
          // Vendors utilitaires : partages par plusieurs vues lazy, Rollup les
          // hoistait dans le chunk principal. Ici ils ne chargent qu'a la demande.
          manualChunks: {
            // ⚠ Pas de regle pour Motion : une entree ["motion/react", ...] a
            // deja ete testee et FAISAIT ECHEC la separation. Elle rassemble tous
            // les modules du paquet dans un seul chunk, y compris les features
            // lourdes que `LazyMotion` est cense charger a la demande ; comme
            // l'enveloppe legere (`m` + `LazyMotion`) est importee statiquement,
            // le chunk fusionne devient statiquement accessible et se retrouve
            // cite dans index.html — les features se chargedaient donc au
            // chargement initial, et le gain se reduisait a peines rien (~40 ko).
            // Laisser Rollup decider produit le chunk asynchrone attendu.
            // T4.1 : les entrees "vendor-charts"/"vendor-pdf"/"vendor-csv"/
            // "vendor-qrcode" ont ete RETIREES (même lecon que Motion, cf. ci-dessus).
            // Ces quatre paquets ne sont importes QUE par des vues lazy (recharts :
            // DashboardOverview/InventoryAudit/SettingsView ; jspdf : Purchasing/
            // FichesTechniques/MenuAnalysis/SettingsView ; papaparse : InventoryAudit ;
            // qrcode.react : SettingsView — toutes via lazy-views.ts). En les figeant
            // par nom, Rollup y HOISTAIT le runtime React partage (les helpers lazy(),
            // react.dev/errors) ; le chunk devenait ainsi un dependant STATIQUE du chunk
            // d'entree (import{...}from"./vendor-charts" en tete de index.js) et les
            // 388 723 o (charts) + 422 612 o (pdf) se telechargeaient au demarrage.
            // Sans regle, Rollup en fait des chunks ASYNCHRONES chargés a la demande.
            // Le contrat est verrouille par scripts/verify-bundle.mjs (chunk d'entree
            // sous 620 000 o) + la mesure du lot initial de index.html.
            // Les traductions (5 langues, ~147 Ko source) ne sont pas nécessaires
            // au premier rendu : le module est importé par les vues, donc un chunk
            // dédié part en async et sort du plafond du chunk d'entrée.
            "i18n": ["./src/data/translations.ts"],
          },
        },
      },
    },
  };
});
