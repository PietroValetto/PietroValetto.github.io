import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// One Markdown file per item. The file body is the 1–3 sentence blurb.
const research = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/research" }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(["publication", "working-paper", "policy", "in-progress", "data"]),
    year: z.number().optional(),
    authors: z.string().optional(), // e.g. "with S. Filauro and Z. Parolin"
    venue: z.string().optional(), // journal, series or status
    url: z.string().optional(),
    order: z.number().default(0), // higher shows first within a group
  }),
});

const media = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/media" }),
  schema: z.object({
    title: z.string(),
    outlet: z.string(),
    when: z.string().optional(), // free text, e.g. "Sep 2026"
    order: z.number().default(0), // higher shows first
    type: z.enum(["op-ed", "interview", "talk", "press", "report", "podcast"]),
    url: z.string().optional(),
  }),
});

export const collections = { research, media };
