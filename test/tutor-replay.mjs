// Test der Tutor-Suche mitten im Spiel: Ein laufendes Duell (beide Seiten KI-gesteuert) wird bis zur Hauptphase von Zug 3 gespielt, alle Antworten
// werden aufgezeichnet. Die Suche spielt sie in einem frischen Duell nach (replay), probiert von dort aus Alternativen und liefert Plan + Board.
// Geprüft: (1) der erste Schritt des Plans ist an der Stelle wirklich erlaubt, (2) Nachspielen von Verlauf + Antwortfolge ergibt exakt das gemeldete Board.
import { loadCore, Game, OcgDuelMode, OcgMessageType as MSG, seededRandom } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes } from './lib.mjs';
import { comboSearch, scoreBoard, GOALS, passiveReply, passiveRng, idleStep } from '../src/combo.mjs';
import { DuelAI } from '../src/ai.mjs';

const P = presets(); const cards = loadCards(); const lib = await loadCore();
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['blueeyes', 'snakeeye'];
let fail = 0;
for (const id of ids) {
  const pa = P.find((x) => x.id === id || x.id.includes(id)); if (!pa) { console.log('Deck fehlt:', id); fail++; continue; }
  const opts = { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(pa), deckCodes(pa)], cards, readScript: scriptReader('official'), seed: [5n, 9n, 3n, 4n] };
  const g = await Game.create(lib, opts); const rnd = seededRandom([3n, 1n, 4n, 1n]); const ais = [new DuelAI(cards, 'normal', rnd), new DuelAI(cards, 'normal', rnd)];
  const hist = []; let msg = null, evs = [];
  for (let s = 0; s < 6000; s++) {
    const r = await g.next(); if (r.kind === 'end') break; const m = r.msg; evs = g.events.splice(0);
    if (g.turn >= 3 && m.player === 0 && m.type === MSG.SELECT_IDLECMD) { msg = m; break; }
    const resp = ais[m.player].respond(m, { snap: g.snapshot(), evs, retry: r.retry }); hist.push(resp); g.respond(resp);
  }
  if (!msg) { console.log(`FEHLER ${id}: Zug 3 nicht erreicht`); fail++; continue; }
  const turn = g.turn; const res = await comboSearch(lib, opts, { cards, goal: 'balance', budgetMs: 4000, rseed: 21, me: 0, replay: hist, endTurn: turn + 1 });
  try { lib.destroyDuel(g.handle); } catch (e) { /* */ }
  if (!res || !res.plan || !res.plan.length) { console.log(`FEHLER ${id}: kein Plan`); fail++; continue; }
  // (1) erster Plan-Schritt = erste Antwort der Folge und an dieser Stelle erlaubt
  const st0 = idleStep(msg, res.rec[0].r); const okFirst = !!st0 && JSON.stringify(st0) === JSON.stringify(res.plan[0]);
  // (2) Nachspiel: Verlauf + Folge, Gegner steht still
  const g2 = await Game.create(lib, opts); const pas = passiveRng(); let rp = 0, i = 0, snap = null, desync = 0;
  for (let s = 0; s < 6000; s++) {
    const r = await g2.next(); if (r.kind === 'end') break; const m = r.msg; g2.events.splice(0);
    if (rp < hist.length) { g2.respond(hist[rp++]); continue; }
    if (g2.turn >= turn + 1) { snap = g2.snapshot(); break; }
    let resp; if (m.player === 0) { const e = res.rec[i++]; if (e && e.t === m.type) resp = e.r; else { desync++; break; } } else resp = passiveReply(m, pas, cards);
    g2.respond(resp);
  }
  try { lib.destroyDuel(g2.handle); } catch (e) { /* */ }
  const again = snap ? scoreBoard(snap, cards, GOALS.balance, 0) : null; const same = !!again && again.score === res.board.score && !desync;
  const names = res.plan.slice(0, 4).map((x) => x.kind + ':' + (cards.get(x.code) || { name: '–' }).name).join(' → ');
  console.log(`${okFirst && same ? 'OK    ' : 'FEHLER'} ${id}: Verlauf ${hist.length} Antworten, ${res.sims} Läufe, Wertung ${res.base} → ${res.board.score} (Nachspiel ${again ? again.score : '–'}, Abweichungen ${desync}) · Plan: ${names}`);
  if (!(okFirst && same)) fail++;
}
console.log(fail ? `${fail} Fehler` : 'Alles in Ordnung'); process.exit(fail ? 1 : 0);
