#!/bin/sh
# publica dist/ no branch gh-pages → https://rijuniorr.github.io/frango/
set -e
node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build  # sem npm: o PATH do Windows tem uma aspa quebrada
cd dist && touch .nojekyll && rm -rf .git
git init -qb gh-pages && git add -A && git commit -qm deploy
git push -qf https://github.com/rijuniorr/frango.git gh-pages
rm -rf .git
