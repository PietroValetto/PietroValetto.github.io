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
    section: z.enum(["writing", "featured", "appearances"]),
    // writing: pieces by Pietro · featured: coverage of him as a creator · appearances: podcasts and videos
    type: z.enum(["op-ed", "policy brief", "research column", "article", "interview", "feature", "list", "podcast", "video", "talk", "report"]),
    lang: z.string().default("en"), // ISO code: en, it, fr, de, es, nl
    date: z.string().optional(), // "YYYY-MM-DD" or "YYYY-MM" or "YYYY"; sorts newest first
    url: z.string().optional(),
    thumb: z.string().optional(), // path under public/, e.g. /media/thumbs/x.jpg (filled by scripts/fetch-thumbs.mjs)
    blurb: z.string().optional(), // one-line description shown next to the thumbnail
  }),
});

export const collections = { research, media };
