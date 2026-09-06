// Build de production avec sourcemap (pour scripts/analyze-bundle.mjs).
// Repique la config de vite.config.ts + active le sourcemap, sans le passer en CLI.
// Usage: node scripts/build-analyze.mjs
import { build, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const mode = "production";
const env = loadEnv(mode, root, "");

await build({
  root,
  configFile: false,
  logLevel: "warn",
  base: "./",
  plugins: [react(), tailwindcss()],
  define: { "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY) },
  resolve: { alias: { "@": root } },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1_000_000,
    rollupOptions: {
      external: ["html2canvas"],
      output: {
        manualChunks: {
          "vendor-charts": ["recharts"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
          "vendor-csv": ["papaparse"],
          "vendor-qrcode": ["qrcode.react"],
        },
      },
    },
  },
});
console.log("build ok (sourcemaps actifs)");
