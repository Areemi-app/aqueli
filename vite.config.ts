import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// Réglages recommandés par Tauri : port fixe, pas d'effacement de la console,
// et on ne surveille pas le dossier Rust (il est recompilé par Tauri lui-même).
export default defineConfig({
  plugins: [react()],
  // Numéro de version affiché dans Paramètres › À propos.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "chrome120",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Les petites images restent des fichiers : la politique de sécurité n'autorise que 'self'.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
