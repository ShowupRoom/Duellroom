#!/usr/bin/env bash
# Baut alle Daten und die App neu (SRC = Ordner aus fetch-sources.sh)
set -euo pipefail
node tools/fetch-genesys.mjs || true
node tools/build-strings.mjs
node tools/build-lists.mjs
node tools/build-decks.mjs
node tools/finish-decks.mjs
node tools/name-decks.mjs
node tools/build-de.mjs
node app/build-pack.mjs
node app/build-www.mjs
