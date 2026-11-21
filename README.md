# Duellraum – Yu-Gi-Oh! zu zweit

Private App für zwei Spieler: Duelle mit dem echten EDOPro-Spielkern (ocgcore als WebAssembly), Formate Goat, Edison, Advanced, Genesys und Speed Duell (4000 LP, 3 Zonen, 26 Starter- und Promo-Decks), 900+ Decks mit Tutor (Ziele pro Engine inkl. Brücken und Boss-Monstern), Deck-Werkstatt mit Drag & Drop, Duell gegen die KI (Anfänger, Fortgeschritten, Profi), Online-Duell zwischen zwei Handys. OCG-exklusive Karten sind mit einer roten „OCG“-Marke gekennzeichnet. Jedes Deck bekommt einen Konsistenz-Wert (0–100, exakt gerechnet); im Editor zeigen Empfehlungen, welche Karten die Konsistenz erhöhen. Der Starthand-Test lässt dich Combos mit gemischter Starthand wie im Duell ausprobieren.

- **Automatische Updates:** Der GitHub-Workflow `update.yml` holt alle 3 Tage die neuesten Daten von ProjectIgnis (CardScripts, BabelCDB, LFLists, Distribution, EDOPro-KI-Decks) sowie die Genesys-Punkte (YGOPRODeck), baut die App neu, testet sie mit Probeduellen und veröffentlicht sie auf GitHub Pages. Die App zeigt dann „Neue Version verfügbar“.
- **Von Hand aktualisieren:** Actions → „Kartenlisten aktualisieren …“ → „Run workflow“.
- **Lokal bauen:** `bash tools/fetch-sources.sh /tmp/src && SRC=/tmp/src bash tools/rebuild.sh` → `app/www`.

- **Querformat wie Master Duel:** Links Gegner, Karteninfo und du, in der Mitte das Feld (Feldzauber neben den Monsterzonen, Extradeck links unten, Friedhof/Deck rechts), unten die große Hand, rechts das **Phasenrad** (antippen → Kampfphase, Main Phase 2 oder End Phase wählen) und die Aktionen.
- **Deutsch:** Kartennamen und Effekttexte kommen aus der deutschen Karten-Datenbank (mycard/ygopro-database, `locales/de-DE`) und werden bei jedem Update neu gebaut (`tools/build-de.mjs` → `data/de.json`, nicht im Repository). Die Suche versteht deutsche und englische Namen; abschaltbar unter Einstellungen.
- **Effekt-Markierung:** Wird ein Effekt aktiviert, zeigt die App den Kartentext mit der passenden Stelle hervorgehoben (Kettenbanner, Kettenfenster, Karten-Fenster; `app/src/effecttext.js`). Die Zuordnung ist eine Heuristik (Kurztext des Effekts, Herkunftsort, Pendelbereich) und markiert nur, wenn sie sich sicher ist.
- **App-Sperre:** Liegt `app/lock.txt` im Repository (ein Zeile `v1.…`, erzeugt aus einem Passwort mit PBKDF2-SHA256), fragt die App beim Start nach dem Passwort. Im Code steht nur der Prüfcode, nie das Passwort; ein freigeschaltetes Gerät merkt sich das, in den Einstellungen lässt es sich wieder sperren. Ohne Datei ist die App offen. Ein ungültiges Format bricht den Bau ab.
- **Keine Banlist:** Im Advanced-Format kann statt TCG/OCG „Keine Banlist“ gewählt werden – dann gibt es keine Verbotsliste, keine Prüfung und keine Markierungen.

Kartendaten und Skripte: Project Ignis (EDOPro). Kartenbilder werden zur Laufzeit von YGOPRODeck geladen. Yu-Gi-Oh! ist eine Marke von Konami; dies ist ein privates, nicht-kommerzielles Fanprojekt.
