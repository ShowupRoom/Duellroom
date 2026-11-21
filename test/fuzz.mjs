import { loadCore, Game, OcgDuelMode, randomResponse, MSG_NAME } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes, mulberry } from './lib.mjs';
const N = +(process.env.N || 40), mode = process.env.MODE || 'MODE_MR5', maxP = +(process.env.MAXP || 4000);
const P = presets().filter((p) => !process.env.ONLY || process.env.ONLY.split(',').includes(p.id));
const cards = loadCards(); const lib = await loadCore();
const rnd = mulberry(+(process.env.SEED || 5));
const stats = { done: 0, ended: 0, capped: 0, crash: [], luaErr: new Map(), prompts: {}, ms: 0, turns: 0 };
for (let i = 0; i < N; i++) {
  const a = P[Math.floor(rnd() * P.length)], b = P[Math.floor(rnd() * P.length)];
  const t0 = Date.now();
  try {
    const g = await Game.create(lib, { flags: OcgDuelMode[mode], decks: [deckCodes(a), deckCodes(b)], cards, readScript: scriptReader(mode === 'MODE_GOAT' ? 'goat' : 'official'), seed: [BigInt(i + 1), 2n, 3n, 4n] });
    let n = 0, ended = false;
    while (n++ < maxP) {
      const r = await g.next();
      if (r.kind === 'end') { ended = true; break; }
      const nm = MSG_NAME[r.msg.type]; stats.prompts[nm] = (stats.prompts[nm] || 0) + 1;
      g.respond(randomResponse(r.msg, rnd, { cards })); g.events.length = 0;
    }
    stats.done++; ended ? stats.ended++ : stats.capped++; stats.turns += g.turn;
    for (const e of g.errors) { const k = e.slice(0, 160); stats.luaErr.set(k, (stats.luaErr.get(k) || 0) + 1); }
    lib.destroyDuel(g.handle);
  } catch (e) { stats.crash.push(`${a.id} vs ${b.id} #${i}: ${String(e.message).slice(0, 120)}`); }
  stats.ms += Date.now() - t0;
}
console.log(`Duelle ${stats.done}/${N} (${mode}): beendet ${stats.ended}, Limit ${stats.capped}, Abstürze ${stats.crash.length}, ⌀ Züge ${(stats.turns / Math.max(1, stats.done)).toFixed(1)}, ${stats.ms} ms`);
console.log('Auswahlarten:', JSON.stringify(stats.prompts));
console.log('Abstürze:', stats.crash.slice(0, 10));
console.log('Lua-Fehler:', [...stats.luaErr.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12));
