// Test der Kombo-Suche: (1) sie findet ein mindestens so gutes Board wie die Standard-KI, (2) die gefundene Antwortfolge lässt sich im
// Duell exakt nachspielen (gleiches Endboard) – das ist die Grundlage der Vorführung.  Aufruf: node test/combo-search.mjs [Deck-Kennung…] (SRC setzen)
import { loadCore, Game, OcgDuelMode } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes } from './lib.mjs';
import { comboSearch, scoreBoard, GOALS, passiveReply, passiveRng } from '../src/combo.mjs';

const P = presets(); const cards = loadCards(); const lib = await loadCore();
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['blueeyes', 'ryzeal', 'snakeeye'];
let fail = 0;
for (const id of ids) {
  const pa = P.find((x) => x.id === id || x.id.includes(id)); if (!pa) { console.log('Deck fehlt:', id); fail++; continue; }
  for (const goal of ['balance', 'inter']) {
    const opts = { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(pa), deckCodes(pa)], cards, readScript: scriptReader('official'), seed: [7n, 2n, 3n, 4n] };
    const res = await comboSearch(lib, opts, { cards, goal, budgetMs: 4000, rseed: 11 });
    if (!res) { console.log(`FEHLER ${id}/${goal}: keine Lösung`); fail++; continue; }
    // Nachspielen: p0 bekommt die gespeicherten Antworten der Reihe nach, p1 steht still
    const g = await Game.create(lib, opts); const pas = passiveRng(); let i = 0, desync = 0, snap = null;
    for (let s = 0; s < 5000; s++) {
      const r = await g.next(); if (r.kind === 'end') break; const m = r.msg; g.events.splice(0);
      if (g.turn >= 2) { snap = g.snapshot(); break; }
      let resp;
      if (m.player === 0) { const e = res.rec[i++]; if (e && e.t === m.type) resp = e.r; else { desync++; break; } } else resp = passiveReply(m, pas, cards);
      g.respond(resp);
    }
    try { lib.destroyDuel(g.handle); } catch (e) { /* */ }
    const again = snap ? scoreBoard(snap, cards, GOALS[goal], 0) : null;
    const same = !!again && again.score === res.board.score && !desync;
    const better = res.board.score >= res.base;
    console.log(`${same && better ? 'OK    ' : 'FEHLER'} ${id}/${goal}: ${res.sims} Läufe, Wertung ${res.base} → ${res.board.score} (Nachspiel ${again ? again.score : '–'}, Abweichungen ${desync}), Monster ${res.board.mons}, Unterbrechungen ${res.board.ints}`);
    if (!same || !better) fail++;
  }
}
// Zweiter eigener Zug (Zug 3): Zug 1 steht fest (Suchergebnis), gesucht wird der Zug danach – Nachspiel beider Züge muss das Board ergeben
for (const id of ids.slice(0, 2)) {
  const pa = P.find((x) => x.id === id || x.id.includes(id)); if (!pa) continue;
  const opts = { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(pa), deckCodes(pa)], cards, readScript: scriptReader('official'), seed: [9n, 2n, 3n, 4n] };
  const r1 = await comboSearch(lib, opts, { cards, goal: 'power', budgetMs: 2500, rseed: 5 });
  const r3 = r1 && await comboSearch(lib, opts, { cards, goal: 'power', budgetMs: 3500, rseed: 6, base: r1.rec, endTurn: 4 });
  if (!r3) { console.log(`FEHLER ${id}/Zug 3: keine Lösung`); fail++; continue; }
  const g = await Game.create(lib, opts); const pas = passiveRng(); let i = 0, desync = 0, snap = null, won = false;
  for (let s = 0; s < 8000; s++) {
    const r = await g.next(); if (r.kind === 'end') { won = r.winner === 0; snap = g.snapshot(); break; } const m = r.msg; g.events.splice(0);
    if (g.turn >= 4) { snap = g.snapshot(); break; }
    let resp;
    if (m.player === 0) { const e = r3.rec[i++]; if (e && e.t === m.type) resp = e.r; else { desync++; break; } } else resp = passiveReply(m, pas, cards);
    g.respond(resp);
  }
  try { lib.destroyDuel(g.handle); } catch (e) { /* */ }
  const again = snap ? scoreBoard(snap, cards, GOALS.power, 0) : null; const sc = again ? again.score + (won ? 500 : 0) : null;
  const same = sc === r3.board.score && !desync && r3.rec.length >= r1.rec.length && r3.rec.slice(0, r1.rec.length).every((e, k) => e.t === r1.rec[k].t);
  console.log(`${same ? 'OK    ' : 'FEHLER'} ${id}/Zug 3: Zug 1 ${r1.board.score} → Zug 3 ${r3.board.score} (Nachspiel ${sc}, Abweichungen ${desync}), ${r3.sims} Läufe, Monster ${r3.board.mons}`);
  if (!same) fail++;
}
console.log(fail ? `${fail} Fehler` : 'Alles in Ordnung');
process.exit(fail ? 1 : 0);
