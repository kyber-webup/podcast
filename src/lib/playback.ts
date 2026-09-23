import type { Chapter } from "./chapters";

const COMPLETED_RATIO = 0.95;
const RESUME_END_MARGIN_SECONDS = 5;

/** Épisode tel que sérialisé par index.astro dans #episodes-data et lu par le lecteur. */
export type PlayerEpisode = {
  id: string;
  title: string;
  hosts: string[];
  date: string;
  duration: number;
  audioSrc: string;
  chapters: Chapter[];
};

/** F-40 : épisode demandé dans l'URL, sinon le dernier écouté, sinon le plus récent. */
export function findInitialEpisode<T extends { id: string }>(
  episodes: T[],
  requestedId: string | null,
  lastEpisodeId: string | null,
): T {
  const byId = (id: string) => episodes.find((episode) => episode.id === id);

  return (requestedId && byId(requestedId)) || (lastEpisodeId && byId(lastEpisodeId)) || episodes[0];
}

/** F-45 : un épisode non terminé arrêté dans ses dernières secondes reprend au début. */
export function getResumePosition(position: number, duration: number, completed: boolean): number {
  if (!completed && duration > 0 && position > duration - RESUME_END_MARGIN_SECONDS) {
    return 0;
  }
  return position;
}

/** F-44 */
export function isCompleted(position: number, duration: number): boolean {
  return duration > 0 && position / duration > COMPLETED_RATIO;
}
