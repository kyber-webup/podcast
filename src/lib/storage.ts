export const STORAGE_KEY = "podcast:v1";
const STORAGE_VERSION = 1;

export type EpisodeState = {
  position: number;
  completed: boolean;
  openedAt?: string;
  updatedAt: string;
};

export type StoredState = {
  version: 1;
  lastEpisodeId: string | null;
  episodes: Record<string, EpisodeState>;
};

export function createEmptyState(): StoredState {
  return { version: STORAGE_VERSION, lastEpisodeId: null, episodes: {} };
}

export function parseState(raw: string | null): StoredState {
  if (!raw) {
    return createEmptyState();
  }

  try {
    const data = JSON.parse(raw) as Partial<StoredState> | null;

    if (
      data === null ||
      typeof data !== "object" ||
      data.version !== STORAGE_VERSION ||
      typeof data.episodes !== "object" ||
      data.episodes === null
    ) {
      return createEmptyState();
    }

    return {
      version: STORAGE_VERSION,
      lastEpisodeId: typeof data.lastEpisodeId === "string" ? data.lastEpisodeId : null,
      episodes: data.episodes,
    };
  } catch {
    return createEmptyState();
  }
}

export function serializeState(state: StoredState): string {
  return JSON.stringify(state);
}

export function writeState(state: StoredState, write: (key: string, value: string) => void): boolean {
  try {
    write(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

export function updateEpisodeState(
  state: StoredState,
  episodeId: string,
  patch: Partial<Pick<EpisodeState, "position" | "completed" | "openedAt">>,
  now: Date,
): StoredState {
  const previous = state.episodes[episodeId];

  const next: EpisodeState = {
    position: patch.position ?? previous?.position ?? 0,
    completed: patch.completed ?? previous?.completed ?? false,
    openedAt: patch.openedAt ?? previous?.openedAt,
    updatedAt: now.toISOString(),
  };

  return {
    ...state,
    lastEpisodeId: episodeId,
    episodes: { ...state.episodes, [episodeId]: next },
  };
}
