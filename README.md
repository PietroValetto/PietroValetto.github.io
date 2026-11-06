# pietrovaletto.github.io

Personal academic site of Pietro Valetto: CV, research, Popular Economics, and the EU Iran-War Fuel Cost Tracker.
Live at https://pietrovaletto.github.io/ (GitHub Pages, free).

## Layout
- `site/`: Astro static site (Home, Research, Popular Economics, Media).
- `tracker/`: the EU fuel cost tracker (Vite + React + Python pipeline). It was moved here from `eu-iran-war-fuel-cost` with its history and is served at `/tracker/`.
- `cv/cv.html`: the CV source. `cv/build.sh` renders it to `site/public/cv.pdf`.
- `.github/workflows/deploy.yml`: builds and deploys on every push to `main`. It also runs Mon/Thu/Fri 08:00 UTC to refresh tracker data from the Oil Bulletin and the Substack "Latest issues" list.

## Everyday edits
| To… | Edit |
|---|---|
| Change the home-page bio | `site/src/content/home.md` |
| Add a paper or project | a new `.md` in `site/src/content/research/` (copy an existing one; `kind` picks the section) |
| Add press, a talk or an op-ed | a new `.md` in `site/src/content/media/` |
| Add profile links (ORCID, X, YouTube…) | `site/src/site.ts`; empty links are hidden |
| Update the CV | edit `cv/cv.html`, run `cv/build.sh`, commit `site/public/cv.pdf` |

Push to `main` and the site redeploys in about a minute.

## Local preview
```bash
./build.sh && python3 -m http.server 4321 -d site/dist
```
`cd site && npm run dev` gives live reload for the Astro pages (the tracker tab needs `./build.sh` first).
Set `SKIP_SUBSTACK=1` to build without fetching the newsletter feed.
