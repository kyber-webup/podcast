// Listes de classes Tailwind partagées entre le rendu Astro et le contrôleur
// (src/scripts/player.ts), qui reconstruit certains éléments en JS : une seule
// définition garantit un rendu identique. Tailwind détecte les classes ici.

// Listes des chapitres et des épisodes : même gabarit de rangée (maquette 23:2).
export const listBoxClass =
  "overflow-hidden rounded-xs border border-surface-edge bg-surface dark:inset-shadow-sm";

// `group` sert aux rangées d'épisode, dont aria-current est porté par le <li>.
export const rowItemClass =
  "group flex border-b border-row-edge last:border-b-0";

export const rowButtonClass =
  "flex h-11 min-w-0 flex-1 items-center gap-3 px-3 text-left text-xs text-ink hover:cursor-pointer hover:bg-row-current/50 aria-[current=true]:bg-row-current aria-[current=true]:font-bold group-aria-[current=true]:bg-row-current group-aria-[current=true]:font-bold";

export const rowLeadClass = "w-12 shrink-0";

export const rowTitleClass = "min-w-0 flex-1 truncate";

// Thème clair : bandeau noir pleine largeur (maquette 28:93). Thème sombre :
// simple titre aligné à gauche, avec un écart avant la liste (maquette 23:2).
export const listHeadingClass =
  "flex h-7.5 items-center justify-center bg-heading text-sm font-bold text-heading-ink uppercase dark:mb-3 dark:block dark:h-auto dark:text-left";

// Curseur de position. range-track / range-thumb sont des variantes déclarées
// dans global.css (pseudo-éléments WebKit et Firefox). La progression est peinte
// via --seek-progress, mis à jour par le contrôleur.
export const seekClass = [
  "block h-6 w-full cursor-pointer appearance-none bg-transparent",
  "range-track:h-1.5 range-track:rounded-xs range-track:border range-track:border-control-edge range-track:bg-track",
  "range-track:bg-linear-to-r range-track:from-active range-track:to-active range-track:bg-no-repeat range-track:bg-size-[var(--seek-progress,0%)_100%]",
  "range-thumb:h-6 range-thumb:w-3.5 range-thumb:appearance-none range-thumb:rounded-xs range-thumb:border range-thumb:border-control-edge range-thumb:bg-thumb",
  // Thème clair : ombre portée douce, aucun halo hors de l'écran (maquette 28:93).
  "range-thumb:shadow-sm",
  // Thème sombre : halo discret au repos, plein au survol / au contact tactile / au focus clavier.
  "dark:range-thumb:shadow-glow-subtle dark:range-thumb:inset-shadow-glow-subtle range-thumb:transition-shadow range-thumb:duration-300 range-thumb:ease-in-out",
  "dark:range-thumb:hover:shadow-glow dark:range-thumb:hover:inset-shadow-glow",
  "dark:range-thumb:active:shadow-glow dark:range-thumb:active:inset-shadow-glow",
  "dark:range-thumb:focus-visible:shadow-glow dark:range-thumb:focus-visible:inset-shadow-glow",
  // WebKit aligne le pouce sur le haut de la piste : on le remonte de la moitié
  // de leur différence de hauteur, bordures comprises — (6 + 2 − 24 − 2) / 2.
  "[&::-webkit-slider-thumb]:-mt-2.25",
].join(" ");
