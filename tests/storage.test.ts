import { describe, expect, it } from "vitest";
import { createEmptyState, parseState, updateEpisodeState, writeState, type StoredState } from "../src/lib/storage";

describe("parseState", () => {
  it("returns an empty state when there is nothing stored", () => {
    expect(parseState(null)).toEqual(createEmptyState());
  });

  it("returns an empty state on invalid JSON", () => {
    expect(parseState("not json")).toEqual(createEmptyState());
  });

  it("returns an empty state on an unknown version", () => {
    const raw = JSON.stringify({ version: 2, lastEpisodeId: null, episodes: {} });
    expect(parseState(raw)).toEqual(createEmptyState());
  });

  it("parses a valid stored state", () => {
    const raw = JSON.stringify({
      version: 1,
      lastEpisodeId: "001-episode",
      episodes: { "001-episode": { position: 42, completed: false, updatedAt: "2026-09-16T00:00:00.000Z" } },
    });
    expect(parseState(raw)).toEqual({
      version: 1,
      lastEpisodeId: "001-episode",
      episodes: { "001-episode": { position: 42, completed: false, updatedAt: "2026-09-16T00:00:00.000Z" } },
    });
  });
});

describe("writeState", () => {
  it("returns true when the write succeeds", () => {
    const calls: Array<[string, string]> = [];
    const ok = writeState(createEmptyState(), (key, value) => calls.push([key, value]));
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("returns false instead of throwing when the write fails", () => {
    const ok = writeState(createEmptyState(), () => {
      throw new Error("quota exceeded");
    });
    expect(ok).toBe(false);
  });
});

describe("updateEpisodeState", () => {
  it("adds a new episode entry", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    const state = updateEpisodeState(createEmptyState(), "001-episode", { position: 30 }, now);

    expect(state.lastEpisodeId).toBe("001-episode");
    expect(state.episodes["001-episode"]).toEqual({
      position: 30,
      completed: false,
      openedAt: undefined,
      updatedAt: now.toISOString(),
    });
  });

  it("merges with the previous entry instead of overwriting it", () => {
    const initial: StoredState = {
      version: 1,
      lastEpisodeId: "001-episode",
      episodes: {
        "001-episode": {
          position: 10,
          completed: false,
          openedAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
    };
    const now = new Date("2026-09-16T12:00:00.000Z");
    const next = updateEpisodeState(initial, "001-episode", { position: 60 }, now);

    expect(next.episodes["001-episode"]).toEqual({
      position: 60,
      completed: false,
      openedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: now.toISOString(),
    });
  });
});
