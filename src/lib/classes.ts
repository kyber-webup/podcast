// Listes de classes Tailwind partagées entre le rendu Astro et le contrôleur
// (src/scripts/player.ts), qui reconstruit certains éléments en JS : une seule
// définition garantit un rendu identique. Tailwind détecte les classes ici.

export const chapterItemClass = "border-b border-rose-500 last:border-b-0";

export const chapterButtonClass =
  "flex h-11 w-full items-center gap-3 px-3 text-left text-xs text-white hover:cursor-pointer hover:bg-rose-500/20 aria-[current=true]:bg-rose-500/50 aria-[current=true]:font-bold";

export const chapterTimeClass = "w-10 shrink-0";

export const chapterTitleClass = "min-w-0 flex-1";

export const badgeClass = "text-xs font-bold";

// Curseur de position. range-track / range-thumb sont des variantes déclarées
// dans global.css (pseudo-éléments WebKit et Firefox). La progression est peinte
// via --seek-progress, mis à jour par le contrôleur.
export const seekClass = [
  "block h-6 w-full cursor-pointer appearance-none bg-transparent",
  "range-track:h-1.5 range-track:rounded-xs range-track:border range-track:border-gray-700 range-track:bg-gray-800",
  "range-track:bg-linear-to-r range-track:from-cyan-400 range-track:to-cyan-400 range-track:bg-no-repeat range-track:bg-size-[var(--seek-progress,0%)_100%]",
  "range-thumb:h-6 range-thumb:w-3.5 range-thumb:appearance-none range-thumb:rounded-xs range-thumb:border range-thumb:border-cyan-400 range-thumb:bg-cyan-100",
  // Halo discret au repos ; plein au survol / au contact tactile / au focus clavier, avec un fondu.
  "range-thumb:shadow-glow-subtle range-thumb:inset-shadow-glow-subtle range-thumb:transition-shadow range-thumb:duration-300 range-thumb:ease-in-out",
  "range-thumb:hover:shadow-glow range-thumb:hover:inset-shadow-glow",
  "range-thumb:active:shadow-glow range-thumb:active:inset-shadow-glow",
  "range-thumb:focus-visible:shadow-glow range-thumb:focus-visible:inset-shadow-glow",
  // WebKit centre mal le pouce sur une piste plus fine que lui : (6 − 24) / 2.
  "[&::-webkit-slider-thumb]:-mt-2",
].join(" ");
