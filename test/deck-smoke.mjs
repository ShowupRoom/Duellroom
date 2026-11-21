// Jedes importierte Deck im echten Kern gegen einen Zufalls-Gegner spielen lassen; Lua-Fehler pro Karte sammeln.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCore, Game, OcgDuelMode, randomResponse } from '../src/core.mjs';
import { loadCards, scriptReader, mulberry } from './lib.mjs';
const file = process.argv[2] || new URL('../data/decks.json', import.meta.url).pathname;
const maxP = +(process.env.MAXP || 700);
const MODE = { goat: 'MODE_GOAT', edison: 'MODE_MR1', advanced: 'MODE_MR5', genesys: 'MODE_MR1' };
const decks = JSON.parse(readFileSync(file, 'utf-8'));
const cards = loadCards(); const lib = await loadCore();
const ex = (l) => l.flatMap(([c, n]) => Array(n).fill(c));
const cnt = (l) => l.reduce((s, e) => s + e[1], 0);
for (const d of decks) { d.nMain = cnt(d.main); d.unknown = [...d.main, ...d.extra].filter((e) => !cards.has(e[0])).map((e) => e[0]); }
const oppFor = {}; for (const f of ['goat', 'edison', 'advanced', 'genesys']) oppFor[f] = decks.find((d) => d.fmt === f && d.nMain >= 40 && !d.unknown.length);
const res = {}; const t0 = Date.now();
for (const [k, d] of decks.entries()) {
  if (d.unknown?.length || d.nMain < 40) { res[d.id] = { skipped: true }; continue; }
  const opp = oppFor[d.fmt]; const mode = MODE[d.fmt]; const rnd = mulberry(k + 7); const r = { turns: 0, ended: false, prompts: 0, lua: [] };
  try {
    const g = await Game.create(lib, { flags: OcgDuelMode[mode], decks: [{ main: ex(d.main), extra: ex(d.extra) }, { main: ex(opp.main), extra: ex(opp.extra) }], cards, readScript: scriptReader(d.fmt === 'goat' ? 'goat' : d.fmt === 'edison' ? 'edison' : 'official'), seed: [BigInt(k + 1), 2n, 3n, 4n] });
    while (r.prompts++ < maxP) { const x = await g.next(); if (x.kind === 'end') { r.ended = true; break; } g.respond(randomResponse(x.msg, rnd, { cards })); g.events.length = 0; }
    r.turns = g.turn; const codes = new Set();
    for (const e of g.errors) { const m = e.match(/c(\d{5,9})\b/); codes.add(m ? Number(m[1]) : e.slice(0, 80)); }
    r.lua = [...codes]; lib.destroyDuel(g.handle);
  } catch (e) { r.crash = String(e.message).slice(0, 120); }
  res[d.id] = r;
}
writeFileSync(process.argv[3] || '/tmp/claude-0/-home-claude/fdbbce0a-44a7-56cd-85ff-0f0cc9a17a48/scratchpad/decks/smoke.json', JSON.stringify(res));
const v = Object.values(res);
console.log('Decks', v.length, 'übersprungen', v.filter((x) => x.skipped).length, 'Abstürze', v.filter((x) => x.crash).length, 'mit Lua-Fehler', v.filter((x) => x.lua?.length).length, 'beendet', v.filter((x) => x.ended).length, 'Sek', Math.round((Date.now() - t0) / 1000));
const bad = new Map(); for (const x of v) for (const c of x.lua || []) bad.set(c, (bad.get(c) || 0) + 1);
console.log('Fehlerkarten', [...bad].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => `${c} ${cards.get(c)?.name ?? ''} x${n}`));
console.log('Abstürze', Object.entries(res).filter(([, x]) => x.crash).slice(0, 8).map(([id, x]) => id + ': ' + x.crash));
