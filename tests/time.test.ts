import { describe, expect, it } from "vitest";
import { formatTime, parseTimecode, toSpokenTime } from "../src/lib/time";

describe("parseTimecode", () => {
  it("parses mm:ss", () => {
    expect(parseTimecode("0:05")).toBe(5);
    expect(parseTimecode("01:45")).toBe(105);
  });

  it("parses hh:mm:ss", () => {
    expect(parseTimecode("1:02:03")).toBe(3723);
  });

  it("parses a plain number of seconds", () => {
    expect(parseTimecode(90)).toBe(90);
  });

  it("throws on invalid values", () => {
    expect(() => parseTimecode("abc")).toThrow();
    expect(() => parseTimecode("1:99")).toThrow();
    expect(() => parseTimecode("1:2:3:4")).toThrow();
    expect(() => parseTimecode(-1)).toThrow();
  });
});

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [60, "1:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });

  it.each([
    [0, "00:00"],
    [59, "00:59"],
    [144, "02:24"],
    [3599, "59:59"],
    [3600, "1:00:00"],
  ])("pads minutes for %i seconds as %s", (seconds, expected) => {
    expect(formatTime(seconds, { pad: true })).toBe(expected);
  });
});

describe("toSpokenTime", () => {
  it("uses the singular form for 1 minute / 1 seconde", () => {
    expect(toSpokenTime(61)).toBe("1 minute 1 seconde");
  });

  it("uses the plural form for 2 minutes and more", () => {
    expect(toSpokenTime(125)).toBe("2 minutes 5 secondes");
  });

  it("omits the minutes when under a minute", () => {
    expect(toSpokenTime(5)).toBe("5 secondes");
  });

  it("includes hours when relevant", () => {
    expect(toSpokenTime(3723)).toBe("1 heure 2 minutes 3 secondes");
  });
});
