#!/usr/bin/env bash
# Builds the whole site into site/dist: the Astro site plus the tracker under /tracker/.
set -euo pipefail
cd "$(dirname "$0")"
(cd tracker && npm ci --silent && npm run build)
(cd site && npm ci --silent && npm run build)
rm -rf site/dist/tracker && cp -R tracker/dist site/dist/tracker
echo "Built site/dist"
