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
            "vendor-charts": ["recharts"],
            "vendor-pdf": ["jspdf", "jspdf-autotable"],
            "vendor-csv": ["papaparse"],
            "vendor-qrcode": ["qrcode.react"],
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
