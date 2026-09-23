import { describe, expect, it } from "vitest";
import { findInitialEpisode, getResumePosition, isCompleted } from "../src/lib/playback";

const episodes = [{ id: "003-latest" }, { id: "002-middle" }, { id: "001-first" }];

describe("findInitialEpisode", () => {
  it("prefers the episode requested in the URL", () => {
    expect(findInitialEpisode(episodes, "001-first", "002-middle").id).toBe("001-first");
  });

  it("falls back to the last listened episode", () => {
    expect(findInitialEpisode(episodes, "unknown", "002-middle").id).toBe("002-middle");
    expect(findInitialEpisode(episodes, null, "002-middle").id).toBe("002-middle");
  });

  it("falls back to the first (most recent) episode", () => {
    expect(findInitialEpisode(episodes, null, null).id).toBe("003-latest");
    expect(findInitialEpisode(episodes, "unknown", "gone").id).toBe("003-latest");
  });
});

describe("getResumePosition", () => {
  it("keeps the saved position", () => {
    expect(getResumePosition(120, 1200, false)).toBe(120);
  });

  it("restarts an unfinished episode stopped in its last 5 seconds", () => {
    expect(getResumePosition(1196, 1200, false)).toBe(0);
    expect(getResumePosition(1195, 1200, false)).toBe(1195);
  });

  it("keeps the position of a completed episode", () => {
    expect(getResumePosition(1198, 1200, true)).toBe(1198);
  });

  it("keeps the position when the duration is unknown", () => {
    expect(getResumePosition(30, 0, false)).toBe(30);
  });
});

describe("isCompleted", () => {
  it("is true past 95% of the duration", () => {
    expect(isCompleted(1141, 1200)).toBe(true);
    expect(isCompleted(1140, 1200)).toBe(false);
  });

  it("is false when the duration is unknown", () => {
    expect(isCompleted(10, 0)).toBe(false);
  });
});
