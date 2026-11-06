#!/usr/bin/env python3
"""Download a thumbnail for every media item that has a `url` but no `thumb`.

YouTube -> the video thumbnail; Spotify -> the episode artwork (oEmbed);
anything else -> the page's og:image / twitter:image. Images are centre-cropped
to 16:9, saved as site/public/media/thumbs/<slug>.jpg, and `thumb:` is written
into the item's front matter. Items with no image keep the green outlet card.

    python3 scripts/fetch_thumbs.py            # only items without a thumb
    python3 scripts/fetch_thumbs.py --force    # refetch all
"""
import html, io, json, pathlib, re, sys, urllib.parse, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA = ROOT / "site/src/content/media"
OUT = ROOT / "site/public/media/thumbs"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def get(url: str, timeout=20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en,it;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def image_url(url: str) -> str | None:
    u = urllib.parse.urlparse(url)
    if "youtube.com" in u.netloc or "youtu.be" in u.netloc:
        vid = urllib.parse.parse_qs(u.query).get("v", [u.path.strip("/")])[0]
        for name in ("maxresdefault", "hqdefault"):
            cand = f"https://i.ytimg.com/vi/{vid}/{name}.jpg"
            try:
                if len(get(cand)) > 2000:
                    return cand
            except Exception:
                pass
    if "spotify.com" in u.netloc:
        return json.loads(get(f"https://open.spotify.com/oembed?url={urllib.parse.quote(url, safe='')}"))["thumbnail_url"]
    page = get(url).decode("utf-8", "ignore")
    for prop in ("og:image", "twitter:image", "og:image:url"):
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{prop}["\'][^>]+content=["\']([^"\']+)', page, re.I) or \
            re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{prop}["\']', page, re.I)
        if m:
            return urllib.parse.urljoin(url, html.unescape(m.group(1)))
    return None


def to_16x9(data: bytes) -> Image.Image:
    """Crop wide images to 16:9; show square-ish artwork (podcast covers) whole over a blurred backdrop."""
    from PIL import ImageFilter
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    if w / h < 1.3:
        bg = cover(im).filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * 0.8))
        fg = im.resize((int(w * 360 / h), 360), Image.LANCZOS)
        bg.paste(fg, ((640 - fg.width) // 2, 0))
        return bg
    return cover(im)


def cover(im: Image.Image) -> Image.Image:
    w, h = im.size
    if w / h > 16 / 9:
        nw = int(h * 16 / 9); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w * 9 / 16); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((640, 360), Image.LANCZOS)


def main(force: bool) -> None:
    for md in sorted(MEDIA.glob("*.md")):
        text = md.read_text()
        fm = text.split("---")[1]
        url = re.search(r"^url:\s*(.+)$", fm, re.M)
        if not url or (re.search(r"^thumb:", fm, re.M) and not force):
            continue
        url = url.group(1).strip().strip('"')
        try:
            src = image_url(url)
            if not src:
                print(f"–  {md.stem}: no image on page"); continue
            img = to_16x9(get(src))
            dest = OUT / f"{md.stem}.jpg"
            img.save(dest, quality=82, optimize=True, progressive=True)
            fm2 = re.sub(r"^thumb:.*\n", "", fm, flags=re.M).rstrip("\n") + f"\nthumb: /media/thumbs/{md.stem}.jpg\n"
            md.write_text(text.replace(fm, fm2, 1))
            print(f"✓  {md.stem}")
        except Exception as e:
            print(f"✗  {md.stem}: {e}")


if __name__ == "__main__":
    main("--force" in sys.argv)
