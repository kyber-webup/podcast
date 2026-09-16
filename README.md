# Podcast player

Lecteur de podcasts pour la diffusion en interne de DevNote

## Stack

- [Astro](https://astro.build) (site statique), TypeScript strict.
- [Tailwind CSS](https://tailwindcss.com) v4 (plugin Vite `@tailwindcss/vite`) compilé au build, aucune ressource chargée en CDN.
- Cloudflare Workers (static assets + route `/audio/*`), Cloudflare R2 pour le stockage audio, Cloudflare Access pour l'authentification.
- [Vitest](https://vitest.dev).

## Commandes

| Commande          | Action                                    |
| ----------------- | ----------------------------------------- |
| `npm install`     | Installe les dépendances                  |
| `npm run dev`     | Démarre le serveur de développement Astro |
| `npm run build`   | Build statique dans `dist/`               |
| `npm run preview` | Prévisualise le build en local            |
| `npm run test`    | Lance les tests Vitest                    |
| `npx astro check` | Vérifie les types TypeScript              |
