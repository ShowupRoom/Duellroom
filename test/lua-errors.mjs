// Welche Karten-Skripte melden Fehler beim Laden? Jede Karte der Vorlagendecks einzeln anlegen.
import { loadCore, Game, OcgDuelMode } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes } from './lib.mjs';
const cards = loadCards(); const lib = await loadCore();
const codes = new Set(); for (const p of presets()) { const d = deckCodes(p); d.main.concat(d.extra).forEach((c) => codes.add(c)); }
const filler = [...codes].slice(0, 1);
const errs = new Map();
for (const code of codes) {
  const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [{ main: [code, ...Array(39).fill(filler[0])], extra: [] }, { main: Array(40).fill(filler[0]), extra: [] }], cards, readScript: scriptReader(), seed: [1n, 2n, 3n, 4n] });
  if (g.errors.some((e) => e.includes(String(code)) || /\[string "c\d+/.test(e))) errs.set(code, g.errors.filter((e) => !e.includes(String(filler[0]))).slice(0, 2));
  lib.destroyDuel(g.handle);
}
console.log('Karten gesamt', codes.size, 'mit Skriptfehler', errs.size);
for (const [c, e] of [...errs].slice(0, 12)) console.log(c, cards.get(c)?.name, '|', e.join(' || ').slice(0, 260));
