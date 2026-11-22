// Test der Kombo-Bibliothek: Eine lange Suche findet für eine Starthand einen Plan. Danach bekommt eine sehr kurze Suche (nur Grundläufe)
// denselben Spielaufbau mit dem Plan als Vorgabe (guides) – sie muss mindestens so gut sein wie der gespeicherte Plan, ohne Vorgabe meist schlechter.
import { loadCore, OcgDuelMode } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes } from './lib.mjs';
import { comboSearch } from '../src/combo.mjs';

const P = presets(); const cards = loadCards(); const lib = await loadCore();
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['snakeeye', 'ryzeal'];
let fail = 0;
for (const id of ids) {
  const pa = P.find((x) => x.id === id || x.id.includes(id)); if (!pa) { console.log('Deck fehlt:', id); fail++; continue; }
  const opts = { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(pa), deckCodes(pa)], cards, readScript: scriptReader('official'), seed: [7n, 2n, 9n, 4n] };
  const long = await comboSearch(lib, opts, { cards, goal: 'balance', budgetMs: 8000, rseed: 5 });
  const plan = long.plan.filter((x) => x.code && x.kind !== 'ep' && x.kind !== 'bp').map((x) => ({ kind: x.kind, code: x.code }));
  const plain = await comboSearch(lib, opts, { cards, goal: 'balance', budgetMs: 300, rseed: 99 });
  const guided = await comboSearch(lib, opts, { cards, goal: 'balance', budgetMs: 300, rseed: 99, guides: [plan] });
  const ok = guided.board.score >= long.board.score - 0.01 || guided.board.score >= long.board.score * 0.97;
  if (!ok) fail++;
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${id}: lange Suche ${long.board.score} · kurz ohne Bibliothek ${plain.board.score} · kurz mit Bibliothek ${guided.board.score} (Plan ${plan.length} Schritte)`);
}
console.log(fail ? `${fail} Fehler` : 'Alles in Ordnung'); process.exit(fail ? 1 : 0);
