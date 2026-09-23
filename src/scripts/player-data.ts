import type { PlayerEpisode } from "../lib/playback";
import { STORAGE_KEY, parseState, writeState, type StoredState } from "../lib/storage";

export function readEpisodes(): PlayerEpisode[] {
  const node = document.getElementById("episodes-data");
  if (!node?.textContent) {
    return [];
  }
  try {
    const data: unknown = JSON.parse(node.textContent);
    return Array.isArray(data) ? (data as PlayerEpisode[]) : [];
  } catch {
    return [];
  }
}

export function readStoredState(): StoredState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseState(null);
  }
}

export function writeStoredState(state: StoredState): void {
  writeState(state, (key, value) => localStorage.setItem(key, value));
}
