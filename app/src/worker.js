// Spielkern im Hintergrund-Thread: die Oberfläche friert nie ein, während der Kern rechnet.
import { loadCore, Game } from '../../src/core.mjs';
import { openScripts, openCards, fetchBin } from './pack.js';

let ready = null, lib = null, readFor = null, cards = null, g = null;
async function load(v) {
  const q = v ? '?v=' + v : '';
  const [s, c, l] = await Promise.all([fetchBin('data/scripts.dat' + q).then(openScripts), fetchBin('data/cards.dat' + q).then(openCards), loadCore()]);
  readFor = s; cards = c; lib = l;
  // Basisskripte einmal vorwärmen (Kompilierung im Hintergrund)
  return true;
}
function drop() { if (g && g.handle) { try { lib.destroyDuel(g.handle); } catch (e) { /* */ } } g = null; }
self.onmessage = async (e) => {
  const { id, op, a } = e.data;
  try {
    let res = null;
    if (op === 'init') { ready = ready || load(a && a.v); res = await ready; }
    else if (op === 'create') {
      await (ready || (ready = load(a.v))); drop();
      g = await Game.create(lib, { flags: a.flags, decks: a.decks, cards, readScript: readFor(a.scripts), seed: a.seed, startingLP: a.lp, stack: a.stack });
      res = true;
    } else if (op === 'step') {
      if (!g) throw new Error('Kein Duell aktiv');
      if (a !== undefined && a !== null) g.respond(a);
      const r = await g.next(); const evs = g.events.splice(0); const errors = g.errors.splice(0);
      res = { r, evs, snap: g.snapshot(), errors };
      if (r.kind === 'end') drop();
    } else if (op === 'destroy') { drop(); res = true; }
    self.postMessage({ id, res });
  } catch (err) { self.postMessage({ id, err: String((err && err.stack) || err) }); }
};
