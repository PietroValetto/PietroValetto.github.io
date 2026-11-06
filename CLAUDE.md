# pietrovaletto.github.io — notes for Claude

This repo is Pietro's personal site, and it is also the **only home of the EU fuel cost tracker** (`tracker/`), served at https://pietrovaletto.github.io/tracker/.

- The old repo `PietroValetto/eu-iran-war-fuel-cost` is **archived and read-only**. Its Pages site just redirects here. Never work in `~/Developer/eu-iran-war-fuel-cost`.
- Tracker features: make a branch off `main` in this repo, change files under `tracker/`, and open a PR here. Small fixes can go straight to `main`.
- Always `git pull` before you start and before you push. The deploy workflow commits refreshed tracker data (`tracker/public/data/`) and `site/src/data/substack-posts.json` on Mon/Thu/Fri.
- If a merge conflicts only in `tracker/public/data/*.json`, take either side and let the next data run regenerate the files. Don't hand-merge generated JSON.
- Don't add workflows under `tracker/.github/`. The single workflow is `.github/workflows/deploy.yml` at the root.
- Build everything with `./build.sh`, then preview with `python3 -m http.server 4321 -d site/dist`.
- The Popular Economics page's live counter reads `scenarios.lastBulletin.EU.totalExtraCost`, `dailyRate` and `measuredThrough` from `tracker/public/data/{petrol,diesel}-deficit.json`, plus `households.json`. If you rename or move those fields, update `site/src/lib/tracker.ts`.
- A push made while an earlier Pages deploy is still in progress can fail with "in progress deployment". Re-run it from the Actions tab (workflow_dispatch).
