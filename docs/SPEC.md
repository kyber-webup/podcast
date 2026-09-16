# Cahier des charges — Lecteur de podcast interne

> **Version** 1.0 — septembre 2026
> **Porteur** : Simon (bureau d'études, Agence Webup)
> **Destinataire** : Claude Code (réalisation) + Simon (validation, configuration Cloudflare)

---

## 0. Mode d'emploi pour Claude Code

1. Lire ce document en entier avant d'écrire la moindre ligne.
2. Lister les ambiguïtés ou contradictions trouvées et **poser les questions avant de commencer** (voir aussi §14).
3. Travailler **étape par étape** selon le plan du §12. **S'arrêter à chaque point de contrôle** (🛑) et attendre la validation de Simon.
4. Chaque exigence porte un identifiant (`F-xx`, `NF-xx`, `A-xx`, `E-xx`). Les citer dans les messages de commit et dans les récapitulatifs d'étape.
5. Priorités (MoSCoW) : **Must** = obligatoire v1 · **Should** = attendu v1 sauf blocage justifié · **Could** = seulement si le reste est terminé et validé.
6. En cas de doute sur une API Cloudflare (Wrangler, R2, Workers static assets), **vérifier la documentation officielle actuelle** plutôt que se fier à la mémoire : ces API évoluent vite.
7. Ne jamais commiter de secret ni de fichier audio.
8. **Le projet ne traite jamais les fichiers audio** (ni encodage, ni normalisation, ni métadonnées, ni script d'aucune sorte) : les MP3 arrivent finalisés depuis le logiciel de montage.

---

## 1. Contexte et objectif

L'agence enregistre un podcast interne (~20 min par épisode, format multi-sujets, deux animateurs). On veut **une page web unique** permettant aux collaborateurs de l'écouter confortablement, en particulier **sur mobile**, et de **reprendre là où ils en étaient**.

La page est **privée** : seuls les collaborateurs authentifiés y ont accès.

**Critères de succès**
- Un collaborateur ouvre le lien, s'authentifie une fois, lance un épisode en moins de 2 interactions.
- Il ferme l'onglet, revient le lendemain : l'épisode et la position sont restaurés.
- La page est utilisable au clavier et au lecteur d'écran (RGAA / WCAG 2.2 AA).
- Publier un nouvel épisode prend moins de 10 minutes à Simon.

---

## 2. Périmètre

### Inclus (v1)
- Page unique : lecteur + liste des épisodes.
- Contrôles : lecture/pause, −15 s, +15 s, curseur de position déplaçable, temps écoulé / durée.
- Reprise de lecture (épisode + position) au rechargement, par navigateur.
- **Chapitres** par épisode (navigation + chapitre en cours).
- **Badges** d'état par épisode : Nouveau / En cours (avec progression) / Écouté.
- Intégration écran verrouillé mobile (Media Session API).
- URL partageable par épisode.
- Diffusion de l'audio depuis Cloudflare R2, **sur la même origine** que la page.
- Protection de tout le site par Cloudflare Access.
- Procédure de publication d'épisode documentée, entièrement manuelle (§10).

### Exclus (v1) — évolutions possibles
- **Tout traitement des fichiers audio** (encodage, normalisation, métadonnées, scripts) : fait en amont dans le logiciel de montage, hors projet.
- Vitesse de lecture, enchaînement automatique, transcriptions (le modèle de données doit toutefois permettre d'ajouter une transcription dans le corps Markdown sans migration).
- Synchronisation de la position entre appareils.
- Flux RSS, écoute hors ligne / PWA.
- Statistiques d'écoute.
- Back-office de publication.

---

## 3. Architecture et choix techniques

```
[Logiciel de montage] ──► MP3 final ──► dépôt manuel ──► bucket R2 "podcast-audio"
[Fiche épisode]  src/content/episodes/NNN-slug.md ──────────────► commit GitHub
                                                                                  │
                                                                     Build Astro (statique)
                                                                                  │
                        Cloudflare Worker (static assets + route /audio/*)  ◄─────┘
                                                  │
                          podcast.<domaine>  ◄── Cloudflare Access (auth)
                           ├── /            → assets statiques Astro
                           └── /audio/*     → Worker → binding R2 (Range / 206)
```

| Sujet | Choix | Justification |
|---|---|---|
| Framework | **Astro**, dernière version stable, `output: 'static'` | Stack de l'agence ; aucune logique serveur côté page. |
| JS client | **TypeScript vanilla**, aucun framework UI, aucune librairie de lecteur | Poids minimal, maîtrise complète de l'accessibilité. |
| Hébergement | **Cloudflare Workers avec static assets** (recommandation actuelle de Cloudflare pour les nouveaux projets) | Une seule unité de déploiement pour les pages et la route audio. Si le projet doit finalement vivre sur Pages : Pages Function `functions/audio/[[path]].ts`, même logique. |
| Stockage audio | **Cloudflare R2** via binding | Pas de limite de 25 Mio par fichier (contrairement aux assets), pas de fichiers binaires dans Git, pas de frais de sortie. |
| Diffusion audio | **Même origine** (`/audio/*`) via le Worker | Une seule application Access protège tout ; pas de CORS ni de problème de cookie tiers (Safari). **Aucune URL publique `r2.dev`.** |
| Authentification | **Cloudflare Access** (Zero Trust, offre gratuite ≤ 50 utilisateurs) | Zéro code d'authentification dans l'app. |
| Contenu | **Content collection Astro** (fichiers Markdown + schéma Zod) | Validation au build, simple à éditer. |
| Persistance client | **localStorage**, clé versionnée | Suffisant pour la reprise par navigateur. |
| Tests | **Vitest** pour les fonctions pures | Rapide, natif Vite. |
| Fichiers audio | **Aucun traitement dans le projet** : MP3 exportés depuis le logiciel de montage et déposés tels quels dans R2 | Le montage est maîtrisé en amont ; le projet se contente de diffuser. |

---

## 4. Structure du projet

```
podcast/
├── CLAUDE.md
├── docs/SPEC.md                  ← ce document
├── astro.config.mjs
├── wrangler.jsonc
├── package.json
├── tsconfig.json                 (strict)
├── public/
│   ├── cover-512.png             (pochette, fournie par Simon — placeholder en attendant)
│   ├── favicon.svg
│   ├── robots.txt                (Disallow: /)
│   └── _headers                  (en-têtes de sécurité des assets)
├── docs/episode-template.md      (modèle de fiche épisode à copier)
├── worker/
│   └── index.ts                  (route /audio/*)
├── src/
│   ├── content.config.ts
│   ├── content/episodes/*.md
│   ├── pages/index.astro
│   ├── components/
│   │   ├── Player.astro
│   │   ├── ChapterList.astro
│   │   └── EpisodeList.astro
│   ├── lib/                      (fonctions pures, testées)
│   │   ├── time.ts               (parse / format / texte vocalisable)
│   │   ├── chapters.ts           (chapitre courant, validation)
│   │   ├── badges.ts             (calcul de l'état d'un épisode)
│   │   └── storage.ts            (lecture/écriture/migration localStorage)
│   ├── scripts/
│   │   ├── player.ts             (contrôleur du lecteur, DOM)
│   │   └── media-session.ts
│   └── styles/global.css
└── tests/
    ├── time.test.ts
    ├── chapters.test.ts
    ├── badges.test.ts
    └── storage.test.ts
```

Les fonctions de `src/lib/` ne touchent **jamais** au DOM ni à `localStorage` directement (injection), pour rester testables.

---

## 5. Modèle de données

### 5.1 Fichier épisode

Nom : `NNN-slug.md` (ex. `001-mobile-first-ecommerce.md`). Le slug du fichier sert d'identifiant d'épisode (`id`), utilisé dans l'URL et le stockage local.

```yaml
---
title: "E-commerce : penser mobile d'abord"
date: 2026-09-21               # date de publication
duration: "20:14"              # durée du MP3, relevée dans le logiciel de montage
file: "001-mobile-first-ecommerce.mp3"   # clé de l'objet dans R2
description: "Pourquoi le mobile first reste mal compris en e-commerce."   # optionnel
hosts: ["Animateur 1", "Animateur 2"]    # optionnel
chapters:                      # optionnel
  - { start: "00:00", title: "Introduction" }
  - { start: "01:45", title: "Mobile first en e-commerce" }
  - { start: "09:30", title: "Accessibilité et EAA" }
---

<!-- Corps libre : notes d'épisode, liens. Réservé plus tard à la transcription. -->
```

### 5.2 Schéma (règles de validation)

| Champ | Type | Règles |
|---|---|---|
| `title` | string | Obligatoire, non vide. |
| `date` | date | Obligatoire (`z.coerce.date()`). |
| `duration` | int ou string | Obligatoire, > 0. Même format que `start` des chapitres (secondes, `"mm:ss"` ou `"hh:mm:ss"`), transformé en secondes. Saisi à la main (voir F-48). |
| `file` | string | Obligatoire, motif `^[a-z0-9][a-z0-9-]*\.mp3$`. |
| `description` | string | Optionnel. |
| `hosts` | string[] | Défaut `[]`. |
| `chapters` | objet[] | Défaut `[]`. `start` accepte un entier (secondes) **ou** `"mm:ss"` / `"hh:mm:ss"`, transformé en secondes. |

Validations croisées sur `chapters` (via `superRefine`, le build **doit échouer** avec un message explicite) :
- s'il y a des chapitres, le premier commence à `0` ;
- les `start` sont strictement croissants ;
- chaque `start` est strictement inférieur à `duration` ;
- chaque `title` est non vide.

Importer `z` depuis `astro/zod`.

### 5.3 Données transmises au client

La page sérialise la liste des épisodes (id, title, date ISO, duration, url audio, chapters) dans un `<script type="application/json" id="episodes-data">`. Le contrôleur la lit au démarrage. Pas de requête réseau pour les métadonnées.

URL audio d'un épisode : `/audio/<file>`.

### 5.4 Stockage local

Clé : `podcast:v1`. Structure :

```ts
type StoredState = {
  version: 1;
  lastEpisodeId: string | null;
  episodes: Record<string, {
    position: number;      // secondes, entier
    completed: boolean;
    openedAt?: string;     // ISO, première ouverture (sert au badge « Nouveau »)
    updatedAt: string;     // ISO
  }>;
};
```

- Lecture tolérante : JSON invalide, clé absente ou version inconnue → état vide, **sans erreur visible**.
- Toutes les écritures dans un `try/catch` (navigation privée, quota plein).
- Les identifiants d'épisodes qui n'existent plus sont ignorés (pas de purge nécessaire en v1).

---

## 6. Exigences fonctionnelles

### 6.1 Page et mise en page

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-01 | Must | Une seule page (`/`) : en-tête (nom du podcast), lecteur, puis liste des épisodes en dessous. | Ordre du DOM = ordre visuel. |
| F-02 | Must | Liste triée du plus récent au plus ancien. | Vérifié avec 3 épisodes de dates différentes. |
| F-03 | Must | Mise en page mobile-first, utilisable de 320 px à grand écran. | Aucun défilement horizontal à 320 px ni à 400 % de zoom. |
| F-04 | Could | Mini-lecteur collant (lecture/pause + titre) quand le lecteur principal sort de l'écran. | Via `IntersectionObserver`, n'occulte aucun contenu focalisé. |

### 6.2 Lecteur

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-10 | Must | Élément `<audio preload="metadata">` **sans** attribut `controls`, piloté par des contrôles personnalisés. | — |
| F-11 | Must | Bouton lecture/pause. Son nom accessible change : « Lecture » / « Pause » (pas de `aria-pressed` en plus). | Annoncé correctement par VoiceOver et NVDA. |
| F-12 | Must | Bouton « Reculer de 15 secondes » : position − 15 s, bornée à 0. | À 8 s → 0 s. |
| F-13 | Must | Bouton « Avancer de 15 secondes » : position + 15 s, bornée à la durée. | À durée − 5 s → fin. |
| F-14 | Must | Curseur de position `<input type="range">` avec `<label>` (visuellement masqué si besoin) : `min=0`, `max=duration`, `step=1`. | — |
| F-15 | Must | Pendant le glissement (`input`) : seul l'affichage du temps change. Au relâchement (`change`) : `currentTime` est modifié. | Pas de rafale de requêtes réseau pendant le glissement (vérifier dans l'onglet réseau). |
| F-16 | Must | Clavier sur le curseur : flèches = ±5 s, Page précédente/suivante = ±60 s, Début/Fin = 0 / fin. | Testé au clavier. |
| F-17 | Must | `aria-valuetext` à jour, format vocalisable : « 3 minutes 20 secondes sur 20 minutes 14 secondes ». | Pas d'annonce du nombre brut. |
| F-18 | Must | Affichage « temps écoulé / durée » au format `m:ss` ou `h:mm:ss`. **Pas** de zone `aria-live` sur ce temps. | — |
| F-19 | Must | Titre de l'épisode en cours affiché dans le lecteur. | — |
| F-20 | Must | Aucune lecture automatique au chargement de la page. | La position est restaurée, le son ne démarre pas. |
| F-21 | Must | Gestion d'erreur : si l'audio ne se charge pas, message visible et lisible (`role="alert"`) avec un bouton « Réessayer ». | Tester en renommant un fichier. |
| F-22 | Should | Indicateur de chargement (mise en mémoire tampon) sur le bouton de lecture, via les événements `waiting` / `playing`. | Ne change pas le nom accessible. |
| F-23 | Could | Repères visuels des chapitres sur la barre de progression (`aria-hidden="true"`). | — |

### 6.3 Liste des épisodes

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-30 | Must | Liste `<ol>`. Chaque élément affiche : titre, date (format long français), durée, badge (§6.6), description si présente. | — |
| F-31 | Must | Chaque élément contient un `<button>` « Écouter » dont le nom accessible inclut le titre (ex. « Écouter : E-commerce… »). | — |
| F-32 | Must | Activer ce bouton charge l'épisode dans le lecteur, **à sa position sauvegardée**, et lance la lecture (l'action de l'utilisateur vaut consentement). | — |
| F-33 | Must | L'épisode en cours porte `aria-current="true"` et un style visuel distinct (pas uniquement la couleur). | — |
| F-34 | Must | Le focus reste sur le bouton activé (pas de déplacement forcé vers le lecteur). | — |

### 6.4 Reprise de lecture et URL

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-40 | Must | Épisode affiché au chargement, par ordre de priorité : paramètre `?e=<id>` valide → `lastEpisodeId` → épisode le plus récent. | Les trois cas sont testés. |
| F-41 | Must | Au chargement, le curseur et le temps affichent la position sauvegardée **avant** tout chargement audio (en utilisant `duration` du contenu). | Fonctionne sur iOS Safari, qui ne précharge pas. |
| F-42 | Must | La position est appliquée à `currentTime` à l'événement `loadedmetadata` (écouteur `{ once: true }`). | Aucun saut audible au démarrage. |
| F-43 | Must | Sauvegarde : au plus toutes les 5 s pendant la lecture, et à chaque `pause`, `seeked`, `visibilitychange` (masqué) et `pagehide`. | Fermeture brutale de l'onglet mobile → position à ±5 s près. |
| F-44 | Must | Un épisode est marqué `completed` quand la position dépasse **95 %** de la durée, ou à l'événement `ended`. À `ended`, la position est remise à 0. | — |
| F-45 | Must | Si la position sauvegardée dépasse durée − 5 s sans que l'épisode soit terminé, reprendre à 0. | — |
| F-46 | Should | Changer d'épisode met à jour l'URL (`?e=<id>`) via `history.replaceState`, sans rechargement. | Copier-coller l'URL ouvre le bon épisode. |
| F-47 | Should | Les positions de l'épisode quitté sont sauvegardées avant le changement. | — |
| F-48 | Must | `duration` étant saisie à la main, si la durée réelle (`audio.duration` à `loadedmetadata`) s'en écarte de plus de 2 s, la durée réelle la remplace pour le curseur, l'affichage, les chapitres et le badge de cet épisode, et un avertissement est émis dans la console (nom du fichier + écart). | Tester avec une durée volontairement fausse. |

### 6.5 Chapitres

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-50 | Must | Sous le lecteur, pour l'épisode en cours uniquement : liste `<ol>` des chapitres avec heure de début et titre. Masquée s'il n'y a pas de chapitre. | — |
| F-51 | Must | Chaque chapitre est un `<button>`. L'activer place la lecture au début du chapitre ; la lecture démarre si elle était déjà en cours, reste en pause sinon. | — |
| F-52 | Must | Le chapitre en cours porte `aria-current="true"` et un indicateur visuel non uniquement coloré. Mise à jour seulement quand le chapitre change (pas à chaque `timeupdate`). | — |
| F-53 | Must | Le titre du chapitre en cours est affiché dans le lecteur (« Chapitre : … »), **sans** `aria-live`. | — |
| F-54 | Should | Nom accessible des boutons : « Aller au chapitre 2 : Mobile first en e-commerce, à 1 minute 45 ». | — |
| F-55 | Should | Boutons « Chapitre précédent » / « Chapitre suivant » dans le lecteur, désactivés visuellement **et** fonctionnellement aux extrémités (`disabled` accepté ici car il ne s'agit pas d'un formulaire). Masqués s'il n'y a pas de chapitre. | — |
| F-56 | Could | Logique « chapitre précédent » façon lecteur audio : si on est à plus de 3 s du début du chapitre en cours, revenir au début de celui-ci plutôt qu'au précédent. | — |

Fonction pure attendue : `getCurrentChapterIndex(chapters, time): number` (−1 si aucun), recherche dichotomique non obligatoire (listes courtes).

### 6.6 Badges

États possibles, par ordre de priorité (un seul badge affiché) :

| État | Condition | Affichage |
|---|---|---|
| **Écouté** | `completed === true` | Badge « Écouté » + icône coche (`aria-hidden`). |
| **En cours** | `position ≥ 10 s` et non terminé | Badge « En cours » + barre de progression + texte « 35 % » |
| **Nouveau** | jamais ouvert (`openedAt` absent) **et** publié il y a ≤ `NEW_EPISODE_DAYS` jours | Badge « Nouveau » |
| (aucun) | autres cas | — |

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-60 | Must | Badges calculés **côté client** (le site est statique : un calcul au build ferait dépendre « Nouveau » de la date de build). | Fonction pure `getEpisodeBadge(episode, stored, now)` testée. |
| F-61 | Must | `NEW_EPISODE_DAYS = 30`, constante unique et documentée. | — |
| F-62 | Must | Le sens ne repose jamais sur la couleur seule : texte toujours présent, contraste ≥ 4.5:1 pour le texte et ≥ 3:1 pour la barre. | — |
| F-63 | Must | Barre de progression : élément décoratif (`aria-hidden="true"`), le pourcentage étant fourni en texte. | Le lecteur d'écran lit « En cours, 35 % » une seule fois. |
| F-64 | Must | Les badges se mettent à jour sans rechargement (au moins à chaque sauvegarde de l'épisode en cours et au changement d'épisode). | — |
| F-65 | Must | Sans JavaScript ou avant son exécution : aucun badge affiché (pas de flash d'un état faux). | — |
| F-66 | Should | Bouton par épisode « Marquer comme écouté » / « Marquer comme non écouté » (bascule `completed`, remet la position à 0 dans le second cas). | — |
| F-67 | Could | Lien discret en pied de page « Réinitialiser ma progression », avec confirmation. | — |

### 6.7 Media Session (écran verrouillé, écouteurs)

| ID | Priorité | Exigence | Critère d'acceptation |
|---|---|---|---|
| F-70 | Must | Détection de `'mediaSession' in navigator` ; aucune erreur si absent. | — |
| F-71 | Must | Métadonnées : titre de l'épisode, artiste = nom du podcast, pochette `/cover-512.png` (512×512) et une variante 256×256. | Visibles sur l'écran verrouillé iOS et Android. |
| F-72 | Must | Gestionnaires : `play`, `pause`, `seekbackward` et `seekforward` (15 s par défaut, ou `seekOffset` fourni), `seekto`. | Boutons de l'écran verrouillé fonctionnels. |
| F-73 | Should | `previoustrack` / `nexttrack` = chapitre précédent / suivant si l'épisode a des chapitres ; sinon non enregistrés. | — |
| F-74 | Should | `setPositionState` appelé à `loadedmetadata`, `seeked`, `ratechange`, et à chaque changement d'épisode, dans un `try/catch`. | Barre de l'écran verrouillé juste. |

---

## 7. Exigences non fonctionnelles

### 7.1 Accessibilité (RGAA 4.1 / WCAG 2.2 AA) — Must

- **NF-01** — Structure : un `h1`, des titres hiérarchisés, des landmarks (`header`, `main`, `footer`), un lien d'évitement vers la liste des épisodes.
- **NF-02** — Tous les contrôles sont des `<button type="button">` ou des éléments de formulaire natifs. Aucun `div` cliquable.
- **NF-03** — Les icônes sont en SVG inline avec `aria-hidden="true"` ; le nom accessible est porté par le bouton.
- **NF-04** — Focus visible personnalisé, contraste ≥ 3:1, jamais `outline: none` sans alternative.
- **NF-05** — Cibles tactiles ≥ 44×44 px (y compris le curseur, dont la zone de préhension doit être épaissie en CSS).
- **NF-06** — Contrastes : texte ≥ 4.5:1, composants d'interface ≥ 3:1, en thème clair **et** sombre.
- **NF-07** — Aucun raccourci clavier sur une seule touche au niveau de la page (WCAG 2.1.4). Les touches spécifiques ne s'appliquent qu'au curseur ayant le focus (F-16).
- **NF-08** — Aucune annonce `aria-live` pendant la lecture, sauf les erreurs (F-21).
- **NF-09** — Respect de `prefers-reduced-motion` (aucune animation non essentielle).
- **NF-10** — Langue de la page `lang="fr"`, titre de page pertinent (inclut le titre de l'épisode en cours : « Titre épisode — Nom du podcast »).
- **NF-11** — Redimensionnement du texte à 200 % et reflow à 320 px sans perte de contenu ni de fonctionnalité.

### 7.2 Interface

- **NF-20** (Should) — Thème sombre via `prefers-color-scheme`.
- **NF-21** (Must) — Variables CSS pour les couleurs, espacements et rayons (charte fournie par Simon ; valeurs neutres provisoires en attendant).
- **NF-22** (Must) — Polices système ou auto-hébergées. Aucune ressource tierce (pas de Google Fonts ni de CDN).

### 7.3 Performance

- **NF-30** — JS client ≤ 10 Ko gzippé.
- **NF-31** — Lighthouse mobile ≥ 95 en performance, accessibilité et bonnes pratiques (mesure locale, hors Access).
- **NF-32** — Aucune requête audio avant interaction, hormis les métadonnées (`preload="metadata"`).

### 7.4 Compatibilité

- **NF-40** — Safari iOS 16+, Chrome Android (2 dernières versions), Safari macOS, Chrome, Firefox et Edge desktop (2 dernières versions).
- **NF-41** — Amélioration progressive : sans JS, la page affiche la liste des épisodes et un message expliquant que le lecteur nécessite JavaScript.

### 7.5 Sécurité et confidentialité

- **NF-50** — Tout le site (pages **et** `/audio/*`) derrière Cloudflare Access.
- **NF-51** — Aucune autre voie d'accès : désactiver l'URL `workers.dev` et les URL de prévisualisation dans `wrangler.jsonc` (vérifier les noms exacts des options dans la doc actuelle), pas de domaine public R2 (`r2.dev`).
- **NF-52** — `robots.txt` avec `Disallow: /` + en-tête `X-Robots-Tag: noindex, nofollow` sur toutes les réponses.
- **NF-53** — En-têtes : `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` restrictive, `Content-Security-Policy` en `'self'` (à ajuster si Astro injecte des scripts en ligne : préférer la configuration Astro qui les externalise, sinon documenter l'exception).
- **NF-54** (Should) — Défense en profondeur : le Worker vérifie la présence et la validité du JWT Access (`Cf-Access-Jwt-Assertion`) sur `/audio/*`, sinon `403`. Validation de signature via les clés publiques de l'équipe Access. Activable par variable d'environnement pour permettre le développement local.
- **NF-55** — Aucune donnée personnelle collectée ; `localStorage` uniquement, rien n'est envoyé au serveur.

---

## 8. Route audio (`worker/index.ts`)

### Comportement attendu

| ID | Priorité | Exigence |
|---|---|---|
| A-01 | Must | Seules les requêtes `GET` et `HEAD` sur `/audio/<clé>` sont traitées ; les autres méthodes → `405`. |
| A-02 | Must | La clé est validée avec le motif `^[a-z0-9][a-z0-9-]*\.mp3$` (aucun `/`, `..` ou encodage) ; sinon `404`. |
| A-03 | Must | Lecture R2 avec prise en charge des en-têtes `Range` **et** conditionnels (`If-None-Match`…). Se baser sur l'exemple officiel de la doc « R2 Workers API ». Gérer les deux formes possibles de la plage retournée (`offset`/`length` et `suffix`). |
| A-04 | Must | Réponses : `200` complet, `206` partiel avec `Content-Range`, `304` si non modifié, `404` si absent, `416` si plage invalide. |
| A-05 | Must | En-têtes : `Content-Type: audio/mpeg`, `Accept-Ranges: bytes` (**y compris sur les 200** : Safari en dépend), `Content-Length`, `ETag`. |
| A-06 | Must | Cache : `Cache-Control: private, max-age=31536000, immutable`. Contenu authentifié, donc jamais `public`. Conséquence : un épisode réexporté **doit être déposé sous un nouveau nom** (ex. `001-slug-v2.mp3`) et le champ `file` mis à jour (§10). |
| A-07 | Must | Toute autre route est servie par les static assets. |
| A-08 | Must | Tests manuels documentés dans le README : |

```bash
curl -I  https://<domaine>/audio/<fichier>.mp3                          # 200 + Accept-Ranges
curl -sI -H "Range: bytes=0-1023" https://<domaine>/audio/<fichier>.mp3 # 206 + Content-Range
curl -sI -H "Range: bytes=-500"   https://<domaine>/audio/<fichier>.mp3 # 206 (suffixe)
# En production, ajouter le jeton Access : -H "cf-access-token: <token>" (cloudflared access token)
```

### Configuration `wrangler.jsonc` (indicative, à vérifier dans la doc actuelle)

- `main`: `worker/index.ts`
- `assets`: `directory: "./dist"`, `binding: "ASSETS"`, et exécution du Worker en premier **uniquement** pour `/audio/*` (option `run_worker_first` sous forme de liste de motifs).
- `r2_buckets`: binding `AUDIO` → bucket `podcast-audio` (+ `preview_bucket_name` pour le développement si nécessaire).
- `routes`: domaine personnalisé `podcast.<domaine>` (`custom_domain: true`).
- URL `workers.dev` et URL de prévisualisation désactivées (NF-51).
- `compatibility_date` récente.

### Développement local

- `astro dev` pour l'interface, avec un MP3 de test servi localement (le lecteur doit pouvoir pointer vers `public/dev-audio/` via une variable `PUBLIC_AUDIO_BASE` en développement uniquement ; ce dossier est ignoré par Git).
- `wrangler dev` après `astro build` pour tester la route `/audio/*` avec R2 simulé en local (`wrangler r2 object put ... --local`).

---

## 9. Configuration Cloudflare Access (faite par Simon)

Claude Code rédige ces étapes dans le README, **sans** les automatiser.

1. Zero Trust → Paramètres → Authentification : activer au minimum le **code à usage unique par e-mail** ; idéalement le fournisseur d'identité de l'agence (Google Workspace ou Microsoft Entra).
2. Access → Applications → **Self-hosted** : nom « Podcast interne », domaine `podcast.<domaine>`, chemin vide (tout le site).
3. Politique **Allow** : « Emails ending in » `@<domaine-agence>` (+ autres domaines du groupe si nécessaire).
4. Durée de session : 1 mois (pour éviter de se réauthentifier à chaque écoute).
5. Vérifier en navigation privée : redirection vers la page de connexion, puis accès à `/` **et** à `/audio/...`.
6. Vérifier que l'URL `workers.dev` ne répond pas.
7. Noter l'Audience (AUD) et le domaine d'équipe pour NF-54.

---

## 10. Publication d'un épisode (procédure manuelle)

Aucun script, aucun outil de traitement : le MP3 sort du logiciel de montage dans sa forme définitive et est déposé tel quel.

### 10.1 Fichier attendu (contrainte d'entrée)

- Format MP3, nommé `NNN-slug.mp3` (motif A-02), ex. `001-mobile-first-ecommerce.mp3`.
- Recommandation pour le réglage d'export du logiciel de montage : débit constant (CBR), qui rend le déplacement dans l'épisode plus précis qu'un débit variable.
- Épisode réexporté après publication : nouveau nom avec suffixe (`001-mobile-first-ecommerce-v2.mp3`), voir A-06.

### 10.2 Étapes (à reprendre dans le README)

1. Déposer le MP3 dans le bucket `podcast-audio` depuis le tableau de bord Cloudflare (R2 → bucket → Upload), ou en ligne de commande : `npx wrangler r2 object put podcast-audio/<fichier>.mp3 --file <chemin> --content-type audio/mpeg --remote`.
2. Copier `docs/episode-template.md` vers `src/content/episodes/NNN-slug.md`.
3. Renseigner `title`, `date`, `duration` (relevée dans le logiciel de montage), `file`, et au besoin `description`, `hosts`, `chapters`.
4. Lancer `npm run build` en local : le schéma signale toute erreur (champ manquant, chapitres incohérents).
5. Commit + push : le déploiement se fait automatiquement.
6. Ouvrir l'épisode en production et vérifier la lecture.

| ID | Priorité | Exigence |
|---|---|---|
| E-01 | Must | `docs/episode-template.md` : modèle commenté de fiche épisode, placé hors du dossier de la collection pour ne pas être chargé au build. |
| E-02 | Must | README : section « Publier un épisode » reprenant §10.1 et §10.2, compréhensible sans connaissance technique. |
| E-03 | Must | Déploiement automatique au push sur la branche principale (intégration Git de Cloudflare), documenté dans le README. |
| E-04 | Should | Si une fiche référence un fichier absent de R2, le lecteur affiche l'erreur F-21. Pas de vérification au build : elle exigerait des identifiants R2 dans la chaîne de build. |

---

## 11. Plan de tests

### 11.1 Tests automatisés (Vitest) — Must

- `time.ts` : `parseTimecode` (`"0:05"`, `"01:45"`, `"1:02:03"`, valeurs invalides), `formatTime` (0, 59, 60, 3599, 3600), `toSpokenTime` (singulier/pluriel : « 1 minute », « 2 minutes »).
- `chapters.ts` : chapitre courant (avant le premier, pile sur un début, entre deux, après le dernier, liste vide) ; validations du §5.2.
- `badges.ts` : chaque état, les priorités, la limite des 30 jours (J−30 et J−31), la limite des 10 s.
- `storage.ts` : JSON invalide, version inconnue, écriture qui lève une exception, mise à jour d'un épisode.

### 11.2 Recette manuelle — à documenter dans `docs/RECETTE.md`

| Scénario | iPhone Safari | Android Chrome | Desktop Firefox | Desktop Chrome |
|---|---|---|---|---|
| Lecture, pause, ±15 s | | | | |
| Glisser le curseur | | | | |
| Reprise après fermeture de l'onglet | | | | |
| Reprise après verrouillage + fermeture de l'app | | | | |
| Contrôles de l'écran verrouillé | | | — | — |
| Chapitres : navigation + chapitre courant | | | | |
| Badges : Nouveau → En cours → Écouté | | | | |
| Lien `?e=` partagé | | | | |

| Lecteur d'écran | Combinaison |
|---|---|
| VoiceOver | iOS Safari |
| TalkBack | Android Chrome |
| NVDA | Firefox Windows |
| Clavier seul | Tous les desktops |

---

## 12. Plan de réalisation

| Étape | Contenu | Exigences | Point de contrôle |
|---|---|---|---|
| 1 | Initialisation : Astro, TS strict, Vitest, `.gitignore`, structure du §4, README minimal | — | 🛑 Arborescence validée |
| 2 | Content collection + schéma + 2 épisodes factices (dont un avec chapitres) + fonctions pures de `src/lib/` et leurs tests | §5, §11.1 | 🛑 Tests au vert |
| 3 | HTML/CSS statiques : page, lecteur, liste, chapitres, badges (états forcés pour la revue visuelle), responsive, thème sombre | F-01→03, F-30→31, NF-01→22 | 🛑 **Revue visuelle et accessibilité par Simon** |
| 4 | Contrôleur du lecteur : lecture/pause, ±15 s, curseur, temps, erreurs | F-10→22 | 🛑 Démo |
| 5 | Reprise + URL | F-40→47 | 🛑 Démo |
| 6 | Chapitres | F-50→56 | 🛑 Démo |
| 7 | Badges | F-60→67 | 🛑 Démo |
| 8 | Media Session | F-70→74 | 🛑 Test sur téléphone |
| 9 | Worker `/audio/*` + `wrangler.jsonc` + test local R2 | §8, NF-51→54 | 🛑 Tests `curl` au vert |
| 10 | Modèle de fiche épisode + section « Publier un épisode » du README | §10 | 🛑 Simon publie un vrai épisode en suivant uniquement le README |
| 11 | README (déploiement automatique, Access) + `docs/RECETTE.md` | §9, §11.2 | 🛑 Déploiement + configuration Access par Simon, recette |
| 12 | Éléments Could restants | F-04, F-23, F-56, F-67 | Optionnel |

---

## 13. Définition de « terminé »

- Toutes les exigences **Must** sont implémentées et vérifiées.
- `npm run build`, `npm run test` et `npx astro check` passent sans erreur ni avertissement.
- La recette manuelle (§11.2) est remplie, sans anomalie bloquante.
- Le README permet à quelqu'un d'autre de publier un épisode sans aide.

---

## 14. Questions ouvertes (à trancher avant ou pendant l'étape 1)

1. **Sous-domaine définitif** (`podcast.<domaine>` proposé) et domaine géré par Cloudflare : à confirmer.
2. **Domaines e-mail autorisés** dans la politique Access (agence seule ou tout le groupe ?).
3. **Fournisseur d'identité** : Google Workspace, Microsoft Entra, ou code par e-mail uniquement ?
4. **Nom du podcast**, pochette (512×512) et éléments de charte graphique.
5. **Durée du badge « Nouveau »** : 30 jours proposés.
6. **Projet existant sur Cloudflare Pages ?** Si oui, adapter §3 et §8 (Pages Function au lieu du Worker).

---

## 15. Références

- Workers static assets : https://developers.cloudflare.com/workers/static-assets/
- R2 Workers API (lecture avec `range` / `onlyIf`) : https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Wrangler, configuration : https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare Access, applications self-hosted : https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/
- Validation du JWT Access : https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- Astro content collections : https://docs.astro.build/en/guides/content-collections/
- Media Session API : https://developer.mozilla.org/fr/docs/Web/API/Media_Session_API
- RGAA 4.1, thématique Multimédia : https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/
- WCAG 2.2 : https://www.w3.org/TR/WCAG22/
