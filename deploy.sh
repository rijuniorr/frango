#!/bin/sh
# publica dist/ no branch gh-pages → https://rijuniorr.github.io/frango/
set -e
npm run build
cd dist && touch .nojekyll && rm -rf .git
git init -qb gh-pages && git add -A && git commit -qm deploy
git push -qf https://github.com/rijuniorr/frango.git gh-pages
rm -rf .git
