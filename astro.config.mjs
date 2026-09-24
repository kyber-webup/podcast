// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",

  // Par défaut, Astro écrit les petits scripts directement dans le HTML. Notre
  // politique de sécurité (`default-src 'self'`, voir public/_headers) interdit
  // les scripts en ligne : ils seraient donc bloqués en production, sans erreur
  // visible au build. On force donc l'écriture dans des fichiers séparés.
  build: {
    inlineStylesheets: "never",
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 0,
    },
  },
});
