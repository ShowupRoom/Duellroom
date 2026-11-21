// Regeltest: Ein aus der Extra-Monsterzone zeitweilig verbannter Monster kehrt in dieselbe Zone zurück („Blauäugiger ultimativer Toon-Drache“, Aufruf: node test/emz-return.mjs [Zone 5|6])
import { loadCore, Game, OcgDuelMode, MSG_NAME, LOC, placesFromMask } from '../src/core.mjs';
import { DuelAI } from '../src/ai.mjs';
import { loadCards, scriptReader, mulberry } from './lib.mjs';
const cards = loadCards(); const base = await loadCore();
const [emzSeq = '5', seed = '3', toTurn = '6'] = process.argv.slice(2);
const field = [ // [controller, code, location, sequence, position]
  [0, 71808988, LOC.MZONE, +emzSeq, 1], [0, 53183600, LOC.GRAVE, 0, 1], [0, 15259703, LOC.SZONE, 5, 1], [0, 15259703, LOC.GRAVE, 1, 1],
  [1, 99267150, LOC.MZONE, 0, 1],
];
const lib = new Proxy(base, { get(t, k) { if (k === 'startDuel') return async (h) => { for (const [c, code, loc, seq, pos] of field) base.duelNewCard(h, { team: c, duelist: 0, code, controller: c, location: loc, sequence: seq, position: pos }); return base.startDuel(h); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
const vanilla = Array(40).fill(89631139);
const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [{ main: vanilla, extra: [71808988] }, { main: vanilla, extra: [] }], cards, readScript: (n) => { let t = scriptReader('official')(n); if (false) { const a = 'for tc in g:Iter() do\n\t\tDuel.ReturnToField(tc)\n\tend\nend'; if (!t.includes(a)) throw new Error('Muster fehlt'); t = t.replace(a, 'for tc in g:Iter() do\n\t\tif tc:IsPreviousLocation(LOCATION_MZONE) and tc:GetPreviousSequence()>=5 then Duel.ReturnToField(tc,tc:GetPreviousPosition(),1<<tc:GetPreviousSequence()) else Duel.ReturnToField(tc) end\n\tend\nend'); } return t; }, seed: [BigInt(+seed), 2n, 3n, 4n], shuffle: false });
const rnd = mulberry(99); const ai = [new DuelAI(cards, 'normal', rnd), new DuelAI(cards, 'normal', rnd)];
const nm = (c) => (cards.get(c) || {}).name || c; const LN = { 1: 'DECK', 2: 'HAND', 4: 'MZONE', 8: 'SZONE', 16: 'GRAVE', 32: 'REMOVED', 64: 'EXTRA' };
let n = 0;
while (n++ < 4000) { const r = await g.next(); if (r.kind === 'end') { console.log('ENDE'); break; } const m = r.msg; const evs = g.events.splice(0);
  for (const e of evs) { const N = MSG_NAME[e.type]; if (N === 'MOVE' || N === 'ATTACK' || N === 'CHAINING' || N === 'DAMAGE' || N === 'POS_CHANGE') console.log(`  [Z${g.turn}] ${N}`, e.code ? nm(e.code) : '', JSON.stringify({ f: e.from || e.previous, t: e.to || e.current }, (_, v) => typeof v === 'bigint' ? String(v) : v)); }
  const snap = g.snapshot(); const N = MSG_NAME[m.type];
  if (N === 'SELECT_PLACE' || N === 'SELECT_DISFIELD') console.log('   PLACE-Maske', (m.field_mask >>> 0).toString(2).padStart(32, '0'), 'count', m.count, 'player', m.player, JSON.stringify(placesFromMask(m.field_mask >>> 0, m.player)));
  const resp = ai[m.player].respond(m, { snap, evs, retry: r.retry });
  if (!['SELECT_IDLECMD', 'SELECT_BATTLECMD'].includes(N) || g.turn >= 2) console.log(`Z${g.turn} P${m.player} ${N}`, m.desc !== undefined ? 'desc=' + m.desc : '', m.cards ? m.cards.length + ' Karten' : '', JSON.stringify(resp, (_, v) => typeof v === 'bigint' ? String(v) : v).slice(0, 90));
  if (g.turn > +toTurn) break; g.respond(resp); }
const s = g.snapshot(); for (const p of [0, 1]) console.log('P' + p, 'LP', s.lp[p], 'MZ', s.players[p].mzone.map((c, i) => c ? i + ':' + nm(c.code) : null).filter(Boolean).join(' | '), 'Verbannt', s.players[p].banished.map((c) => nm(c.code)).join(','));
console.log('Fehler', g.errors.slice(0, 5));
const back = s.players[0].mzone[+emzSeq]; if (!back || back.code !== 71808988) { console.log('FEHLER: Monster kehrte nicht in die Extra-Monsterzone zurück'); process.exit(1); } console.log('OK: zurück in Zone', emzSeq);
