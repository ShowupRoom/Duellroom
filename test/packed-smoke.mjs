// Prüft, dass die gepackten (bereinigten) Skripte genauso funktionieren wie die Originale.
import { readFileSync } from 'node:fs';
import { loadCore, Game, OcgDuelMode, randomResponse } from '../src/core.mjs';
import { openScripts, openCards, openData } from '../app/src/pack.js';
import { mulberry } from './lib.mjs';
const rd = (f) => new Uint8Array(readFileSync(new URL('../app/dist/' + f, import.meta.url)));
const readFor = await openScripts(rd('scripts.gz')); const cards = await openCards(rd('cards.gz')); const { decks } = await openData(rd('data.gz'));
const lib = await loadCore(); const ex = (l) => l.flatMap(([c, n]) => Array(n).fill(c));
const MODE = { goat: 'MODE_GOAT', edison: 'MODE_MR1', advanced: 'MODE_MR5', genesys: 'MODE_MR5' };
const N = +(process.env.N || 60); const rnd = mulberry(3); let lua = new Map(), ended = 0, n = 0;
for (let i = 0; i < N; i++) {
  const d = decks[Math.floor(rnd() * decks.length)]; const same = decks.filter((x) => x.fmt === d.fmt && x.status !== 'entwurf'); const o = same[Math.floor(rnd() * same.length)];
  const g = await Game.create(lib, { flags: OcgDuelMode[MODE[d.fmt]], decks: [{ main: ex(d.main), extra: ex(d.extra) }, { main: ex(o.main), extra: ex(o.extra) }], cards, readScript: readFor(d.fmt === 'goat' ? 'goat' : d.fmt === 'edison' ? 'edison' : 'official'), seed: [BigInt(i + 1), 2n, 3n, 4n] });
  for (let k = 0; k < 600; k++) { const r = await g.next(); if (r.kind === 'end') { ended++; break; } g.respond(randomResponse(r.msg, rnd, { cards })); g.events.length = 0; }
  for (const e of g.errors) lua.set(e.slice(0, 120), (lua.get(e.slice(0, 120)) || 0) + 1);
  lib.destroyDuel(g.handle); n++;
}
console.log('Duelle', n, 'beendet', ended, 'Lua-Fehler', [...lua]);
