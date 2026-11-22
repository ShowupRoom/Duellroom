// Test der Störkarten-Tabelle, der Deck-Analyse und der Ziehvorschau.  Aufruf: node test/interrupts.mjs (SRC setzen)
import { loadCore, Game, OcgDuelMode } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes } from './lib.mjs';
import { passiveReply, passiveRng } from '../src/combo.mjs';
import { interruptPts, handPts, isHandOnly, isAdvantage } from '../src/interrupts.mjs';
import { handtrapInfo } from '../src/handtraps.mjs';
import { HANDTRAPS, roleOf } from '../src/tutor.mjs';
import { scanDeck } from '../src/deckscan.mjs';

const cards = loadCards(); const P = presets(); const lib = await loadCore();
const byName = (n) => [...cards.values()].find((c) => c.name === n);
let fail = 0; const ok = (c, msg) => { console.log(`${c ? 'OK    ' : 'FEHLER'} ${msg}`); if (!c) fail++; };

// Fallen, die aus der Hand wirken dürfen, sind als Handtraps erkannt – im Deckbau-Filter, im Tutor und in der Kombo-Wertung
for (const n of ['Dominus Impulse', 'Dominus Purge', 'Infinite Impermanence', 'Evenly Matched']) {
  const c = byName(n); ok(!!c, `${n}: Karte vorhanden`); if (!c) continue;
  ok(!!handtrapInfo(c, 'advanced'), `${n}: als Handtrap erkannt (Deckbau-Filter)`);
  ok(HANDTRAPS.has(n.toLowerCase()) && roleOf(c) === 'handtrap', `${n}: Rolle „Handtrap“ im Tutor`);
  ok(interruptPts(c.code, cards) >= 26, `${n}: gesetzt zählt als Störung (${interruptPts(c.code, cards)})`);
  ok(handPts(c.code, cards) > 0, `${n}: auf der Hand zählt ein Teil (${handPts(c.code, cards)})`);
}
const ash = byName('Ash Blossom & Joyous Spring');
ok(handPts(ash.code, cards) >= 30 && isHandOnly(ash.code, cards) && interruptPts(ash.code, cards) === 0, 'Ash Blossom: wirkt nur aus der Hand');
ok(interruptPts(byName('Called by the Grave').code, cards) >= 20, 'Called by the Grave: gesetzt eine Störung');
ok(isAdvantage(byName('Toon Table of Contents').code, cards), 'Toon Table of Contents: Vorteilskarte');

// Deck-Analyse
for (const id of ['m-toon', 'ryzeal']) {
  const pa = P.find((x) => x.id === id); const s = scanDeck(pa, cards);
  ok(s.size >= 40 && s.hand.length > 0, `${id}: ${s.size} Karten, ${s.hand.length} Handtrap-Arten`);
  if (id === 'm-toon') {
    const names = s.setInt.map((x) => cards.get(x.code).name);
    ok(['Dominus Impulse', 'Infinite Impermanence', 'Mind Scan'].every((n) => names.includes(n)), 'm-toon: Dominus-Funke, Impermanenz und Mind Scan als gesetzte Störer erkannt');
    ok(s.multi.some((x) => cards.get(x.code).name === 'Toon World the Perfect World'), 'm-toon: Toon World als mehrfach nutzbar erkannt');
  }
}

// Ziehvorschau: die oberste Karte ist die, die im nächsten eigenen Zug gezogen wird
{
  const pa = P.find((x) => x.id === 'ryzeal');
  const opts = { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(pa), deckCodes(pa)], cards, readScript: scriptReader('official'), seed: [7n, 2n, 3n, 4n] };
  const g = await Game.create(lib, opts); const pas = passiveRng(); let top = null, h0 = null, drew = null;
  for (let s = 0; s < 5000; s++) {
    const r = await g.next(); if (r.kind === 'end') break; g.events.splice(0);
    if (!top) { top = g.deckTop(0, 3); h0 = g.snapshot().players[0].hand.map((c) => c.code); }
    if (g.turn >= 3) { const h = g.snapshot().players[0].hand.map((c) => c.code); const rest = h0.slice(); for (const c of h) { const k = rest.indexOf(c); if (k >= 0) rest.splice(k, 1); else drew = c; } break; }
    g.respond(passiveReply(r.msg, pas, cards));
  }
  try { lib.destroyDuel(g.handle); } catch (e) { /* */ }
  ok(top && drew === top[0], `Ziehvorschau: oberste Karte ${top && cards.get(top[0]).name} = gezogene Karte ${drew && cards.get(drew).name}`);
}
console.log(fail ? `${fail} Fehler` : 'Alles in Ordnung'); process.exit(fail ? 1 : 0);
