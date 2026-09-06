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
            "vendor-charts": ["recharts"],
            "vendor-pdf": ["jspdf", "jspdf-autotable"],
            "vendor-csv": ["papaparse"],
            "vendor-qrcode": ["qrcode.react"],
          },
        },
      },
    },
  };
});
