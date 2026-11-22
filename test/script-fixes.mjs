// Prüft die Skript-Korrekturen (sources/script-fixes.mjs): Jede Stelle muss im aktuellen ProjectIgnis-Skript genau einmal vorkommen,
// und das korrigierte Skript muss ohne Lua-Fehler laden.
import { readFileSync, existsSync } from 'node:fs';
import { FIXES, applyFix } from '../sources/script-fixes.mjs';
import { SCRIPTS, loadCards, scriptReader } from './lib.mjs';
import { loadCore, Game, OcgDuelMode, LOC } from '../src/core.mjs';
const cards = loadCards(); const lib = await loadCore(); let bad = 0;
for (const code of Object.keys(FIXES)) {
  const f = `${SCRIPTS}/official/c${code}.lua`; if (!existsSync(f)) { console.log('FEHLT ', code); bad++; continue; }
  const r = applyFix(`c${code}.lua`, readFileSync(f, 'utf-8'));
  if (!r.ok) { console.log('PASST NICHT MEHR', code, FIXES[code].why, '→ Skript wurde bei ProjectIgnis geändert, Korrektur prüfen'); bad++; continue; }
  const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [{ main: Array(40).fill(+code), extra: [] }, { main: Array(40).fill(91152256), extra: [] }], cards, readScript: scriptReader(), seed: [1n, 2n, 3n, 4n], field: [[0, +code, LOC.GRAVE, 0, 1]] });
  const err = g.errors.filter((e) => e.includes(code)); lib.destroyDuel(g.handle);
  if (err.length) { console.log('LUA-FEHLER', code, err[0]); bad++; } else console.log('OK    ', code, FIXES[code].why);
}
if (bad) { console.log(bad, 'Probleme'); process.exit(1); } console.log('Alle', Object.keys(FIXES).length, 'Skript-Korrekturen greifen');
