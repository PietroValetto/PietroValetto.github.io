import { SITE } from "../site";

export interface Post { title: string; url: string; date: Date; subtitle: string; }

const cdata = (s = "") => s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"')
   .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const tag = (xml: string, name: string) => decode(cdata(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]));

/** Latest posts from the Substack RSS feed. Returns [] if the feed can't be reached, so the build never fails on it. */
export async function latestPosts(n = 6): Promise<Post[]> {
  if (process.env.SKIP_SUBSTACK) return [];
  try {
    const res = await fetch(SITE.pe.feed, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(([, item]) => ({
      title: tag(item, "title"),
      url: tag(item, "link"),
      date: new Date(tag(item, "pubDate")),
      subtitle: tag(item, "description"),
    }));
  } catch (e) {
    console.warn(`[substack] feed unavailable, skipping latest posts: ${e}`);
    return [];
  }
}
