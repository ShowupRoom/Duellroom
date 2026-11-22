// „Einmal pro Spielzug“: Blauäugiger ultimativer Toon-Drache darf seinen Effekt nur einmal nutzen (Kern + Skript)
import { loadCore, Game, OcgDuelMode, randomResponse, MSG_NAME, LOC, OcgResponseType as R, SelectIdleCMDAction as IA } from '../src/core.mjs';
import { loadCards, scriptReader, mulberry } from './lib.mjs';
const cards = loadCards(); const lib = await loadCore(); const rnd = mulberry(3);
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? String(v) : v));
const BETUD = 71808988, BETD = 53183600, TOONWORLD = 15259703, TOONKINGDOM = 500000090;
const filler = Array(40).fill(BETD);
const field = [[0, BETUD, LOC.MZONE, 2], [0, BETD, LOC.GRAVE, 0], [0, BETD, LOC.GRAVE, 1], [0, 15259703, LOC.GRAVE, 2]];
const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [{ main: filler, extra: [] }, { main: filler, extra: [] }], cards, readScript: scriptReader(), seed: [1n, 2n, 3n, 4n], field });
let acts = 0;
for (let i = 0; i < 200; i++) {
  const r = await g.next(); if (r.kind === 'end') break; const m = r.msg; const t = MSG_NAME[m.type];
  if (t === 'SELECT_IDLECMD' && m.player === 0) {
    const a = (m.activates || []).map((x) => x.code + ':' + x.description);
    console.log('Idle', 'aktivierbar:', a.join(', ') || '–');
    const k = (m.activates || []).findIndex((x) => x.code === BETUD);
    if (k >= 0 && acts < 3) { acts++; console.log('  -> aktiviere Effekt Nr.', acts); g.respond({ type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: k }); continue; }
    console.log(acts === 1 ? 'OK: Effekt genau einmal pro Spielzug' : 'FEHLER: Effekt ' + acts + '× aktivierbar'); process.exit(acts === 1 ? 0 : 1);
  }
  if (t === 'SELECT_IDLECMD') { g.respond({ type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }); continue; }
  g.respond(randomResponse(m, rnd));
}
