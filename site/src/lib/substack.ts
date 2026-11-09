import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SITE } from "../site";

// Substack sometimes blocks cloud build servers (HTTP 403). The last good fetch is saved here and used as a fallback.
const CACHE = resolve(process.cwd(), "src/data/substack-posts.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface Post { title: string; url: string; date: Date; subtitle: string; }

const cdata = (s = "") => s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"')
   .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const tag = (xml: string, name: string) => decode(cdata(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]));

function cached(n: number): Post[] {
  try {
    return (JSON.parse(readFileSync(CACHE, "utf8")) as Post[]).slice(0, n).map((p) => ({ ...p, date: new Date(p.date) }));
  } catch {
    return [];
  }
}

/** Latest posts from the Substack RSS feed, falling back to the saved copy. Never fails the build. */
export async function latestPosts(n = 6): Promise<Post[]> {
  if (process.env.SKIP_SUBSTACK) return [];
  try {
    const res = await fetch(SITE.pe.feed, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(([, item]) => ({
      title: tag(item, "title"),
      url: tag(item, "link"),
      date: new Date(tag(item, "pubDate")),
      subtitle: tag(item, "description"),
    }));
    if (!posts.length) throw new Error("feed had no items");
    try { writeFileSync(CACHE, JSON.stringify(posts, null, 1) + "\n"); } catch {}
    return posts;
  } catch (e) {
    const fallback = cached(n);
    console.warn(`[substack] feed unavailable (${e}); using ${fallback.length} saved posts`);
    return fallback;
  }
}
