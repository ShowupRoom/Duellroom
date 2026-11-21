// Probeduelle der KI: KI gegen Zufallsspieler (und KI gegen KI) mit den Preset-Decks.
// Aufruf: node test/ai-duel.mjs [Anzahl=20] [Modus=MODE_MR5] [Stufe=normal] [gegen=random|ai] [maxAuswahlen=2500]
import { loadCore, Game, OcgDuelMode, randomResponse, MSG_NAME } from '../src/core.mjs';
import { DuelAI } from '../src/ai.mjs';
import { loadCards, scriptReader, presets, deckCodes, mulberry } from './lib.mjs';

const [nStr = '20', modeName = 'MODE_MR5', level = 'normal', vs = 'random', maxStr = '2500'] = process.argv.slice(2);
const N = +nStr, MAX = +maxStr; const P = presets(); const cards = loadCards(); const lib = await loadCore();
const rnd = mulberry(12345);
let win = [0, 0], draw = 0, errs = 0, luaErr = new Set(), stuck = 0, fb = 0, prompts = 0, aiMs = 0, turns = 0; const retries = {};
for (let k = 0; k < N; k++) {
  const pa = P[Math.floor(rnd() * P.length)], pb = P[Math.floor(rnd() * P.length)];
  const aiSeat = k % 2; // KI abwechselnd auf Platz 1 und 2
  const g = await Game.create(lib, { flags: OcgDuelMode[modeName], decks: [deckCodes(pa), deckCodes(pb)], cards, readScript: scriptReader(modeName === 'MODE_GOAT' ? 'goat' : 'official'), seed: [BigInt(k + 1), 2n, 3n, 4n] });
  const ais = [new DuelAI(cards, level, rnd), new DuelAI(cards, vs === 'ai' ? level : 'leicht', rnd)];
  const seatsAI = vs === 'ai' ? [true, true] : [aiSeat === 0, aiSeat === 1];
  let n = 0, end = null, retry = false;
  try {
    while (n++ < MAX) {
      const r = await g.next(); if (r.kind === 'end') { end = r; break; }
      const m = r.msg; const p = m.player; prompts++;
      let resp; const evs = g.events.splice(0);
      if (seatsAI[p]) { const t0 = performance.now(); resp = ais[p].respond(m, { snap: g.snapshot(), evs, retry: r.retry }); aiMs += performance.now() - t0; }
      else resp = randomResponse(m, rnd, { cards });
      if (r.retry) { retries[MSG_NAME[m.type]] = (retries[MSG_NAME[m.type]] || 0) + 1; }
      g.respond(resp);
    }
  } catch (e) { errs++; console.log(`Duell ${k + 1} (${pa.id} vs ${pb.id}): FEHLER`, String(e.message).slice(0, 160)); }
  g.errors.forEach((x) => luaErr.add(x.slice(0, 120)));
  turns += g.turn;
  if (!end) { stuck++; } else if (end.winner === null || end.winner === undefined || end.winner > 1) draw++; else { const aiWon = vs === 'ai' ? end.winner === 0 : end.winner === aiSeat; win[aiWon ? 0 : 1]++; }
}
console.log(`${N} Duelle ${modeName} Stufe ${level} gegen ${vs}: ${vs === 'ai' ? 'Platz-1-Siege' : 'KI-Siege'} ${win[0]}, Gegner ${win[1]}, unentschieden ${draw}, nicht beendet ${stuck}, Fehler ${errs}`);
console.log(`Ø Züge ${(turns / N).toFixed(1)}, Auswahlen ${prompts}, KI-Zeit Ø ${(aiMs / Math.max(1, prompts)).toFixed(2)} ms, Wiederholungen`, JSON.stringify(retries));
console.log('Lua-Fehler', [...luaErr].slice(0, 5));
