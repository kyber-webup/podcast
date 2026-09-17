import { describe, expect, it } from "vitest";
import { getCurrentChapterIndex, validateChapters, type Chapter } from "../src/lib/chapters";

const chapters: Chapter[] = [
  { start: 0, title: "Introduction" },
  { start: 100, title: "Sujet principal" },
  { start: 200, title: "Conclusion" },
];

describe("getCurrentChapterIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(getCurrentChapterIndex([], 50)).toBe(-1);
  });

  it("returns -1 before the first chapter", () => {
    const withOffset: Chapter[] = [{ start: 10, title: "Introduction" }];
    expect(getCurrentChapterIndex(withOffset, 5)).toBe(-1);
  });

  it("returns the index exactly on a chapter start", () => {
    expect(getCurrentChapterIndex(chapters, 100)).toBe(1);
  });

  it("returns the index between two chapters", () => {
    expect(getCurrentChapterIndex(chapters, 150)).toBe(1);
  });

  it("returns the last index after the last chapter", () => {
    expect(getCurrentChapterIndex(chapters, 9999)).toBe(2);
  });
});

describe("validateChapters", () => {
  it("accepts an empty list", () => {
    expect(validateChapters([], 300)).toBeNull();
  });

  it("accepts a valid list", () => {
    expect(validateChapters(chapters, 300)).toBeNull();
  });

  it("rejects a first chapter not starting at 0", () => {
    const invalid: Chapter[] = [{ start: 5, title: "Introduction" }];
    expect(validateChapters(invalid, 300)).not.toBeNull();
  });

  it("rejects non strictly increasing starts", () => {
    const invalid: Chapter[] = [
      { start: 0, title: "Introduction" },
      { start: 100, title: "A" },
      { start: 100, title: "B" },
    ];
    expect(validateChapters(invalid, 300)).not.toBeNull();
  });

  it("rejects a start past the episode duration", () => {
    const invalid: Chapter[] = [
      { start: 0, title: "Introduction" },
      { start: 400, title: "Trop tard" },
    ];
    expect(validateChapters(invalid, 300)).not.toBeNull();
  });

  it("rejects an empty title", () => {
    const invalid: Chapter[] = [{ start: 0, title: "  " }];
    expect(validateChapters(invalid, 300)).not.toBeNull();
  });
});
