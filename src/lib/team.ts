// Équipe du podcast : l'écran affiche tout le monde, seuls les animateurs de
// l'épisode en cours sont allumés (maquette 23:2). À tenir à jour à la main —
// les fiches d'épisode ne listent que leurs propres animateurs.
export const TEAM = ["Elia", "Nathan", "Simon", "Mathis", "Leana", "Bryan"];

/** L'équipe, complétée par tout animateur cité dans une fiche mais absent de la liste. */
export function buildRoster(episodeHosts: string[]): string[] {
  const extras = episodeHosts.filter((host) => !TEAM.includes(host));
  return [...TEAM, ...new Set(extras)];
}
