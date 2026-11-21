# Duellraum – Yu-Gi-Oh! zu zweit

Private App für zwei Spieler: Duelle mit dem echten EDOPro-Spielkern (ocgcore als WebAssembly), Formate Goat, Edison, Advanced und Genesys, 828 Decks mit Tutor, Deck-Werkstatt mit Drag & Drop, Online-Duell zwischen zwei Handys.

- **Automatische Updates:** Der GitHub-Workflow `update.yml` holt alle 3 Tage die neuesten Daten von ProjectIgnis (CardScripts, BabelCDB, LFLists, Distribution) sowie die Genesys-Punkte (YGOPRODeck), baut die App neu, testet sie mit Probeduellen und veröffentlicht sie auf GitHub Pages. Die App zeigt dann „Neue Version verfügbar“.
- **Von Hand aktualisieren:** Actions → „Kartenlisten aktualisieren …“ → „Run workflow“.
- **Lokal bauen:** `bash tools/fetch-sources.sh /tmp/src && SRC=/tmp/src bash tools/rebuild.sh` → `app/www`.

Kartendaten und Skripte: Project Ignis (EDOPro). Kartenbilder werden zur Laufzeit von YGOPRODeck geladen. Yu-Gi-Oh! ist eine Marke von Konami; dies ist ein privates, nicht-kommerzielles Fanprojekt.
