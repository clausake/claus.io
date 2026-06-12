import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import javascriptObfuscator from 'rollup-plugin-javascript-obfuscator';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      // L'obfuscateur est desactive en local pour eviter l'ecran noir (du au debugProtection/anti-debug de l'obfuscateur sous React 19)
      // Vous pouvez le reactiver de maniere securisee avec debugProtection: false
      /*
      javascriptObfuscator({
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        stringArray: true
      })
      */
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
  };
});
