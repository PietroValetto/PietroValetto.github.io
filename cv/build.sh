#!/usr/bin/env bash
# Renders cv/cv.html to site/public/cv.pdf with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf=site/public/cv.pdf "file://$PWD/cv/cv.html"
