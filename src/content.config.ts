import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { parseTimecode } from "./lib/time";
import { validateChapters } from "./lib/chapters";

const timecodeSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  try {
    return parseTimecode(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid timecode",
    });
    return z.NEVER;
  }
});

const episodes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/episodes" }),
  schema: z
    .object({
      title: z.string().min(1),
      date: z.coerce.date(),
      duration: timecodeSchema.refine((value) => value > 0, "duration must be > 0"),
      file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.mp3$/, "file must match ^[a-z0-9][a-z0-9-]*\\.mp3$"),
      description: z.string().optional(),
      hosts: z.array(z.string()).default([]),
      chapters: z
        .array(
          z.object({
            start: timecodeSchema,
            title: z.string().min(1),
          }),
        )
        .default([]),
    })
    .superRefine((data, ctx) => {
      const error = validateChapters(data.chapters, data.duration);
      if (error) {
        ctx.addIssue({ code: "custom", message: error, path: ["chapters"] });
      }
    }),
});

export const collections = { episodes };
