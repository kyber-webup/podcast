# Podcast player

Lecteur de podcasts pour la diffusion en interne de DevNote

## Stack

- [Astro](https://astro.build) (site statique), TypeScript strict.
- [Tailwind CSS](https://tailwindcss.com) v4 (plugin Vite `@tailwindcss/vite`) compilé au build, aucune ressource chargée en CDN.
- Cloudflare Workers (static assets + route `/audio/*`), Cloudflare R2 pour le stockage audio, Cloudflare Access pour l'authentification.
- [Vitest](https://vitest.dev).

## Commandes

| Commande               | Action                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm install`          | Installe les dépendances                             |
| `npm run dev`          | Démarre le serveur de développement Astro            |
| `npm run build`        | Build statique dans `dist/`                          |
| `npm run preview`      | Prévisualise le build en local                       |
| `npm run test`         | Lance les tests Vitest                                |
| `npx astro check`      | Vérifie les types TypeScript (site)                   |
| `npm run check:worker` | Vérifie les types TypeScript du Worker (`worker/`)    |
| `npx wrangler dev`     | Sert le build + la route `/audio/*` en local (après `npm run build`) |

## Route audio en local (Worker + R2)

Le Worker (`worker/index.ts`) sert `/audio/<fichier>.mp3` depuis R2 ; toutes les autres routes sont servies par les fichiers statiques de `dist/`. `wrangler dev` simule R2 en local (aucune donnée réelle) :

```bash
npm run build
npx wrangler r2 object put podcast-audio-preview/<fichier>.mp3 --file <chemin-local> --content-type audio/mpeg --local
npx wrangler dev
```

(`podcast-audio-preview` est le bucket utilisé par `wrangler dev` en local, voir `preview_bucket_name` dans `wrangler.jsonc` — le vrai bucket `podcast-audio` n'est utilisé qu'en production.)

Tests manuels (à refaire après toute modification de `worker/index.ts`) :

```bash
curl -I  http://localhost:8787/audio/<fichier>.mp3                          # 200 + Accept-Ranges
curl -sI -H "Range: bytes=0-1023" http://localhost:8787/audio/<fichier>.mp3 # 206 + Content-Range
curl -sI -H "Range: bytes=-500"   http://localhost:8787/audio/<fichier>.mp3 # 206 (suffixe)
# En production, ajouter le jeton Access : -H "cf-access-token: <token>" (cloudflared access token)
```

`ENFORCE_ACCESS` (dans `wrangler.jsonc`) est à `"false"` par défaut pour permettre ces tests en local sans Cloudflare Access. En production, il doit passer à `"true"`, avec `ACCESS_TEAM_DOMAIN` et `ACCESS_AUD` renseignés (voir la configuration Access, à documenter à l'étape 11).

## Publier un épisode

Aucune connaissance technique n'est nécessaire pour publier un épisode — seulement un compte GitHub avec accès à ce dépôt et un accès au tableau de bord Cloudflare (R2).

### Ce qu'il faut avant de commencer

- Le MP3 final, exporté par le logiciel de montage — le projet ne le modifie jamais (pas d'encodage, de normalisation ni de métadonnées ici).
- Le fichier doit être nommé `NNN-slug.mp3` (ex. `005-choisir-son-editeur.mp3`) : un numéro à 3 chiffres, un tiret, un résumé du titre en minuscules avec des tirets, puis `.mp3`.
- Réglage recommandé à l'export : débit constant (CBR) — ça rend le déplacement dans l'épisode plus précis qu'un débit variable.
- Si tu republies un épisode déjà en ligne (correction, nouvel export), donne-lui un **nouveau nom** avec un suffixe (`005-choisir-son-editeur-v2.mp3`) : les fichiers audio sont mis en cache très longtemps, un nom identique ne se mettrait pas à jour pour les auditeurs.

### Étapes

1. **Déposer le MP3 dans R2** : tableau de bord Cloudflare → R2 → bucket `podcast-audio` → **Upload**. (Ou en ligne de commande : `npx wrangler r2 object put podcast-audio/<fichier>.mp3 --file <chemin-local> --content-type audio/mpeg --remote`.)
2. **Créer la fiche de l'épisode** : copie [`docs/episode-template.md`](docs/episode-template.md) vers `src/content/episodes/NNN-slug.md`, et remplis les champs (titre, date, durée, nom du fichier, et éventuellement description, animateurs, chapitres). Le modèle contient des explications pour chaque champ.
3. **Vérifier avant d'envoyer** : lance `npm run build` sur ta machine. S'il y a une erreur dans la fiche (champ manquant, chapitres incohérents…), le message l'indique clairement, avec le nom du fichier concerné.
4. **Envoyer** : commite et pousse sur la branche principale (`git add`, `git commit`, `git push`). Le déploiement se fait automatiquement (voir ci-dessous) — pas d'action supplémentaire côté Cloudflare.
5. **Vérifier en ligne** : une fois le déploiement terminé (quelques minutes), ouvre le site en production et lance la lecture de l'épisode pour confirmer que tout fonctionne.

Si la fiche référence un fichier absent de R2 (oubli à l'étape 1, faute de frappe dans `file`), le site ne plantera pas : le lecteur affichera le message d'erreur habituel (« La lecture a échoué », avec un bouton Réessayer) au moment de la lecture.

### Déploiement automatique (E-03)

Ce dépôt doit être connecté à Cloudflare pour que chaque `git push` sur la branche principale déclenche automatiquement un build et une mise en ligne (tableau de bord Cloudflare → Workers & Pages → connecter le dépôt GitHub, build command `npm run build`, dossier de sortie `dist`). C'est une configuration à faire une seule fois, par Simon, dans le tableau de bord Cloudflare — elle n'est pas encore en place à ce stade du projet.
