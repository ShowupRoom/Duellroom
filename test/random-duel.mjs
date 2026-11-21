import { loadCore, Game, OcgDuelMode, randomResponse, MSG_NAME } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes, mulberry } from './lib.mjs';

const [a = 'dracotail', b = 'blueeyes', modeName = 'MODE_MR5', seedStr = '1', maxPrompts = '3000'] = process.argv.slice(2);
const P = presets(); const pa = P.find((x) => x.id === a), pb = P.find((x) => x.id === b);
const cards = loadCards(); const lib = await loadCore();
const rnd = mulberry(+seedStr);
const t0 = Date.now();
const g = await Game.create(lib, {
  flags: OcgDuelMode[modeName], decks: [deckCodes(pa), deckCodes(pb)], cards, readScript: scriptReader(modeName === 'MODE_GOAT' ? 'goat' : 'official'),
  seed: [BigInt(+seedStr), 2n, 3n, 4n],
});
const count = {}; let n = 0, end = null;
while (n++ < +maxPrompts) {
  const r = await g.next();
  if (r.kind === 'end') { end = r; break; }
  const nm = MSG_NAME[r.msg.type]; count[nm] = (count[nm] || 0) + 1;
  let resp;
  try { resp = randomResponse(r.msg, rnd, { cards }); } catch (e) { console.log('Bot-Fehler', e.message); break; }
  g.respond(resp);
  const retry = g.events.at(-1); g.events.length = 0;
}
const snap = g.snapshot();
console.log(`${a} vs ${b} ${modeName}: ${n - 1} Auswahlen, Zug ${g.turn}, ${Date.now() - t0} ms, Ende:`, end ? `Sieger ${end.winner}` : 'nein', 'LP', g.lp.join('/'));
console.log('Auswahlarten:', JSON.stringify(count));
console.log('Lua-Fehler:', g.errors.length, [...new Set(g.errors)].slice(0, 6));
console.log('Feld P1:', snap.players[0].mzone.filter(Boolean).map((c) => c.name).join(', '), '| P2:', snap.players[1].mzone.filter(Boolean).map((c) => c.name).join(', '));
