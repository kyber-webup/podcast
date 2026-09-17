export const NEW_EPISODE_DAYS = 15;
const IN_PROGRESS_THRESHOLD_SECONDS = 10;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type EpisodeBadge =
  | { type: "completed" }
  | { type: "in-progress"; percent: number }
  | { type: "new" }
  | null;

export type BadgeEpisodeInfo = {
  date: Date;
  duration: number;
};

export type BadgeEpisodeProgress = {
  position: number;
  completed: boolean;
  openedAt?: string;
};

export function getEpisodeBadge(
  episode: BadgeEpisodeInfo,
  stored: BadgeEpisodeProgress | undefined,
  now: Date,
): EpisodeBadge {
  if (stored?.completed) {
    return { type: "completed" };
  }

  if (stored && stored.position >= IN_PROGRESS_THRESHOLD_SECONDS) {
    const percent =
      episode.duration > 0 ? Math.min(100, Math.round((stored.position / episode.duration) * 100)) : 0;
    return { type: "in-progress", percent };
  }

  if (!stored?.openedAt) {
    const daysSincePublication = (now.getTime() - episode.date.getTime()) / MS_PER_DAY;
    if (daysSincePublication <= NEW_EPISODE_DAYS) {
      return { type: "new" };
    }
  }

  return null;
}
