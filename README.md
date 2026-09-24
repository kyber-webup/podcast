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

## Mise en ligne

### Déploiement manuel

> **Le fichier `.env.development`** (non versionné) contient `PUBLIC_AUDIO_BASE=/dev-audio` pour écouter un MP3 local pendant le développement. Il ne s'applique **qu'au serveur de dev** : un `npm run build` produit toujours des adresses `/audio/…` servies par R2. Le script `postbuild` retire en plus `dev-audio/` du dossier publié, pour qu'aucun fichier audio ne parte en ligne.

```bash
npm run build
npx wrangler deploy
```

`wrangler deploy` envoie le contenu de `dist/` (les pages) et le Worker (la route `/audio/*`). Les fichiers audio, eux, vivent dans R2 et ne sont jamais renvoyés par le déploiement.

**Tant que le sous-domaine `devnote.agence-webup.com` n'existe pas, le site déployé n'est joignable par aucune adresse.** C'est voulu : `workers_dev` est désactivé dans `wrangler.jsonc` pour qu'il n'existe aucune porte d'entrée autre que le domaine de l'agence (NF-51). Le déploiement reste utile — il valide la chaîne complète et le site sera en ligne dès que le sous-domaine sera branché.

### Brancher le sous-domaine

Une fois `devnote.agence-webup.com` créé par le sysadmin sur la zone Cloudflare de l'agence :

1. Décommenter le bloc `routes` dans `wrangler.jsonc` (il est déjà écrit, avec un TODO).
2. Relancer `npx wrangler deploy`.
3. Ouvrir `https://devnote.agence-webup.com` : le site doit répondre.

### Déploiement automatique (E-03)

Pour que chaque `git push` sur la branche principale mette le site à jour tout seul :

1. Créer un dépôt GitHub et y pousser le projet.
2. Tableau de bord Cloudflare → **Workers & Pages** → **Create** → onglet **Workers** → **Connect to Git**, choisir le dépôt.
3. Commande de build : `npm run build`. Rien d'autre à changer : `wrangler.jsonc` décrit déjà le Worker, les fichiers statiques et le bucket R2.
4. Vérifier qu'un push déclenche bien un déploiement (onglet **Deployments**).

À faire une seule fois, par Simon, dans le tableau de bord — ce n'est pas automatisable depuis le projet.

## Configuration Cloudflare Access

Le site n'a pas de compte utilisateur : c'est Cloudflare Access qui filtre à l'entrée. Configuration à faire une seule fois par Simon, dans le tableau de bord Cloudflare (§9 de la spec), une fois le sous-domaine en place.

1. **Zero Trust → Settings → Authentication** : activer au minimum **One-time PIN** (code à usage unique envoyé par e-mail). Le fournisseur d'identité de l'agence (Google Workspace, Microsoft Entra) peut être ajouté plus tard.
2. **Access → Applications → Add an application → Self-hosted** : nom « DevNote », domaine `devnote.agence-webup.com`, chemin vide (tout le site, audio compris).
3. **Politique Allow** : règle « Emails ending in » → `@agence-webup.com`, plus les autres domaines du groupe si nécessaire.
4. **Durée de session : 1 mois**, pour ne pas avoir à se reconnecter à chaque écoute.
5. Vérifier **en navigation privée** : la page de connexion doit apparaître, puis `/` **et** un fichier `/audio/...` doivent être accessibles.
6. Vérifier que l'URL `*.workers.dev` ne répond pas (NF-51).
7. Noter l'**AUD** de l'application (Access → l'application → Overview) et le **domaine d'équipe** (`<équipe>.cloudflareaccess.com`).

### Activer la vérification côté Worker (NF-54)

Access bloque déjà les requêtes en amont. Le Worker sait en plus vérifier lui-même le jeton signé, ce qui protège la route `/audio/*` si la politique Access était un jour mal configurée. Une fois l'AUD et le domaine d'équipe notés, remplir dans `wrangler.jsonc` :

```jsonc
"vars": {
  "ENFORCE_ACCESS": "true",
  "ACCESS_TEAM_DOMAIN": "<équipe>.cloudflareaccess.com",
  "ACCESS_AUD": "<l'AUD de l'application>",
}
```

puis redéployer. Ces trois valeurs ne sont pas des secrets (l'AUD est un identifiant public), elles peuvent rester dans le fichier de configuration.

À laisser sur `"false"` en développement : sans jeton Access, le Worker refuserait toutes les requêtes audio en local.
