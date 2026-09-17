import { describe, expect, it } from "vitest";
import { getEpisodeBadge, NEW_EPISODE_DAYS } from "../src/lib/badges";

const now = new Date("2026-09-16T12:00:00.000Z");
const episode = { date: new Date("2026-09-01T00:00:00.000Z"), duration: 1200 };

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("getEpisodeBadge", () => {
  it("returns completed when the episode is marked completed", () => {
    const stored = { position: 5, completed: true, openedAt: "2026-09-01T00:00:00.000Z" };
    expect(getEpisodeBadge(episode, stored, now)).toEqual({ type: "completed" });
  });

  it("takes priority of completed over in-progress", () => {
    const stored = { position: 900, completed: true, openedAt: "2026-09-01T00:00:00.000Z" };
    expect(getEpisodeBadge(episode, stored, now)).toEqual({ type: "completed" });
  });

  it("returns in-progress at exactly the 10s threshold", () => {
    const stored = { position: 10, completed: false, openedAt: "2026-09-01T00:00:00.000Z" };
    expect(getEpisodeBadge(episode, stored, now)).toEqual({ type: "in-progress", percent: 1 });
  });

  it("does not return in-progress under the 10s threshold", () => {
    const stored = { position: 9, completed: false, openedAt: "2026-09-01T00:00:00.000Z" };
    expect(getEpisodeBadge(episode, stored, now)).toBeNull();
  });

  it("returns new for an unopened episode published within NEW_EPISODE_DAYS", () => {
    const recent = { date: daysAgo(NEW_EPISODE_DAYS), duration: 1200 };
    expect(getEpisodeBadge(recent, undefined, now)).toEqual({ type: "new" });
  });

  it("does not return new the day after the threshold", () => {
    const old = { date: daysAgo(NEW_EPISODE_DAYS + 1), duration: 1200 };
    expect(getEpisodeBadge(old, undefined, now)).toBeNull();
  });

  it("returns null for an already-opened, old, non-completed episode", () => {
    const stored = { position: 0, completed: false, openedAt: "2026-09-01T00:00:00.000Z" };
    const old = { date: daysAgo(NEW_EPISODE_DAYS + 1), duration: 1200 };
    expect(getEpisodeBadge(old, stored, now)).toBeNull();
  });
});
