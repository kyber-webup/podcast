# Podcast player

Lecteur de podcasts pour la diffusion en interne de DevNote

## Stack

- [Astro](https://astro.build) (site statique), TypeScript strict.
- [Tailwind CSS](https://tailwindcss.com) v4 (plugin Vite `@tailwindcss/vite`) compilé au build, aucune ressource chargée en CDN.
- Cloudflare Pages (pages statiques + fonction `/audio/*`), Cloudflare R2 pour le stockage audio.
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
| `npm run check:worker` | Vérifie les types TypeScript du code serveur (`server/`, `functions/`, `worker/`) |
| `npx wrangler pages dev dist --r2=AUDIO` | Sert le build + la route `/audio/*` en local (après `npm run build`) |

## Route audio en local (fonction Pages + R2)

En développement courant (`npm run dev`), le lecteur lit un MP3 posé dans `public/dev-audio/` : voir `.env.development`. Pour tester la vraie route `/audio/<fichier>.mp3`, celle qui lit R2 :

```bash
npm run build
npx wrangler r2 object put podcast-audio/<fichier>.mp3 --file <chemin-local> --content-type audio/mpeg --local
npx wrangler pages dev dist --r2=AUDIO
```

`--r2=AUDIO` crée un bucket simulé en local (vide au départ, d'où l'envoi du fichier à la ligne précédente). Sans `--local`, l'envoi se fait sur le vrai bucket.

Tests manuels (à refaire après toute modification de `server/audio.ts`) :

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

Le site est déployé sur **Cloudflare Pages**, projet connecté au dépôt GitHub : chaque `git push` sur `main` déclenche un build et une mise en ligne (E-03).

| Réglage du projet Pages | Valeur |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Liaison R2 (Settings → Bindings) | nom de variable `AUDIO` → bucket `podcast-audio` |

La liaison R2 est **indispensable** : sans elle, `/audio/<fichier>.mp3` renvoie une erreur et la lecture échoue. Pages ne lit pas `wrangler.jsonc` pour les liaisons, elles se déclarent dans le tableau de bord.

### Qui sert quoi

- Les pages viennent de `dist/`, produit par Astro.
- `/audio/<fichier>.mp3` est servi par la fonction `functions/audio/[name].ts`, qui lit le fichier dans R2 et gère la lecture par morceaux (le déplacement dans la barre de progression en dépend).
- La logique de cette route vit dans `server/audio.ts`, partagée avec `worker/index.ts`.

### Domaine personnalisé

Pages accepte un sous-domaine dont le DNS reste chez l'hébergeur actuel : projet → **Custom domains** → *Set up a domain* → saisir `devnote.agence-webup.com`, puis créer chez l'hébergeur un enregistrement CNAME vers `<projet>.pages.dev`. Il faut passer par le tableau de bord **avant** de créer le CNAME, sinon le domaine renvoie une erreur 522. Un domaine racine (sans sous-domaine) exigerait, lui, que la zone soit gérée par Cloudflare.

### Et si le domaine passe un jour sur Cloudflare

L'architecture Workers reste prête : `worker/index.ts` et `wrangler.workers.jsonc`, déployables par `npx wrangler deploy -c wrangler.workers.jsonc`. C'est le seul chemin qui permet d'utiliser Cloudflare Access (voir ci-dessous).

## Authentification : état actuel

⚠️ **Le site n'est pas protégé aujourd'hui.** Cloudflare Access, prévu par le cahier des charges (§9, NF-50 à NF-54), exige que le nom d'hôte appartienne à une zone Cloudflare active du compte. Le domaine de l'agence étant géré ailleurs, Access ne peut pas s'appliquer :

- garder le DNS dehors et passer par une zone « partielle » (CNAME) demande un plan **Business** ;
- déléguer seulement `devnote.agence-webup.com` comme zone séparée demande un plan **Enterprise** ;
- la seule voie gratuite est de confier la zone `agence-webup.com` à Cloudflare (changement de nameservers), ce qui ramènerait aussi au déploiement Worker.

Tant que ce n'est pas tranché, toute personne connaissant l'URL peut écouter les épisodes. À décider : basculer le DNS, ou mettre en place une protection maison (mot de passe partagé vérifié par la fonction audio).

### Si la zone arrive un jour sur Cloudflare

1. **Zero Trust → Settings → Authentication** : activer au minimum **One-time PIN** (code à usage unique par e-mail).
2. **Access → Applications → Add an application → Self-hosted** : nom « DevNote », domaine `devnote.agence-webup.com`, chemin vide (tout le site, audio compris).
3. **Politique Allow** : règle « Emails ending in » → `@agence-webup.com`, plus les autres domaines du groupe si nécessaire.
4. **Durée de session : 1 mois**, pour ne pas avoir à se reconnecter à chaque écoute.
5. Vérifier **en navigation privée** : la page de connexion doit apparaître, puis `/` **et** un fichier `/audio/...` doivent être accessibles.
6. Noter l'**AUD** de l'application et le **domaine d'équipe** (`<équipe>.cloudflareaccess.com`).

### Activer la vérification du jeton (NF-54)

Access bloque déjà les requêtes en amont. Le Worker sait en plus vérifier lui-même le jeton signé, ce qui protège la route `/audio/*` si la politique Access était un jour mal configurée. Une fois l'AUD et le domaine d'équipe notés, remplir dans `wrangler.jsonc` :

```jsonc
"vars": {
  "ENFORCE_ACCESS": "true",
  "ACCESS_TEAM_DOMAIN": "<équipe>.cloudflareaccess.com",
  "ACCESS_AUD": "<l'AUD de l'application>",
}
```

puis redéployer (sur Pages, ces valeurs se saisissent dans Settings → Variables). Ces trois valeurs ne sont pas des secrets (l'AUD est un identifiant public), elles peuvent rester dans le fichier de configuration.

À laisser sur `"false"` en développement : sans jeton Access, le Worker refuserait toutes les requêtes audio en local.
