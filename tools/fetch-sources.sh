#!/usr/bin/env bash
# Holt die aktuellen Rohdaten von ProjectIgnis (EDOPro) nach $1
set -euo pipefail
D="${1:?Zielordner}"; mkdir -p "$D"
clone() { rm -rf "$D/$2"; mkdir -p "$(dirname "$D/$2")"; git clone -q --depth 1 "https://github.com/ProjectIgnis/$1.git" "$D/$2"; echo "$1: $(git -C "$D/$2" log -1 --format='%cd %h' --date=short)"; }
clone CardScripts ocg/scripts
clone BabelCDB babel/BabelCDB
clone LFLists lflists/repo
clone windbot windbot
mkdir -p "$D/dist-repo/d/config/languages/Deutsch"
curl -fsSL https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/strings.conf -o "$D/dist-repo/d/config/strings.conf"
curl -fsSL https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/languages/Deutsch/strings.conf -o "$D/dist-repo/d/config/languages/Deutsch/strings.conf"
echo "Quellen bereit in $D"
