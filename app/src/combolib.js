// Kombo-Bibliothek: Beim Start der App werden deine eigenen Decks im Hintergrund immer wieder mit zufälligen Starthänden durchsucht.
// Die besten gefundenen Züge werden je Deck als Kartenfolge gespeichert (Art + Karte, z. B. „Normalbeschwörung Kitt → Aktiviere …“).
// Tutor und Kombo-Ansicht probieren diese bekannten Kombos dann als Erstes aus (comboSearch → guides) und bauen darauf auf.
import { store } from './store.js';
import { customDecks, MODES, expand, App } from './data.js';
// eigene Decks: „Meine Decks“ auf diesem Gerät + die fest eingebauten „Dennis’ Decks“ (doppelte Listen nur einmal)
const ownDecks = () => { const seen = new Set(); const L = [...customDecks(), ...((App.decks || []).filter((d) => d.grp === 'Dennis’ Decks'))]; return L.filter((d) => { const k = JSON.stringify([d.main, d.extra]); if (seen.has(k)) return false; seen.add(k); return true; }); };
import { searchCombo } from './engine.js';
import { rand32, sleep } from './util.js';

const KEY = (d) => 'clib.' + (d.id || d.name || 'x');
export const libOn = () => store.get('clib.on', true);
export const setLibOn = (v) => { store.set('clib.on', !!v); if (v) libLoop(); else libPause(); };
export function libGet(d) { return (d && store.get(KEY(d), null)) || { items: [], runs: 0 }; }
const save = (d, L) => { try { store.set(KEY(d), L); } catch (e) { /* Speicher voll: Bibliothek ist nur ein Vorteil */ } };

/** Ergebnis einer Suche übernehmen (nur die Hauptphasen-Schritte mit Karte) */
export function libAdd(d, res) {
  if (!d || !res || !res.plan || !res.board) return;
  const plan = res.plan.filter((x) => x.code && x.kind !== 'ep' && x.kind !== 'bp').map((x) => ({ kind: x.kind, code: x.code })); if (!plan.length) return;
  const L = libGet(d); const sig = plan.map((x) => x.kind[0] + x.code).join(','); const sc = Math.round(res.board.score * 10) / 10;
  const e = L.items.find((x) => x.sig === sig);
  if (e) { e.n++; e.score = Math.max(e.score, sc); } else L.items.push({ sig, plan, score: sc, n: 1, hand: (res.hand || []).slice(0, 7), board: res.board.mons != null ? { mons: res.board.mons, ints: res.board.ints } : null });
  L.items.sort((a, b) => b.score - a.score); L.items = L.items.slice(0, 40); save(d, L);
}
/** Gespeicherte Kombos als Vorgaben für die Suche */
export function libGuides(d) { return d ? libGet(d).items.slice(0, 24).map((x) => x.plan) : []; }
export function libSummary() {
  const ds = ownDecks(); let n = 0, runs = 0, k = 0; for (const d of ds) { const L = libGet(d); if (L.items.length) k++; n += L.items.length; runs += L.runs || 0; }
  return { decks: ds.length, withLib: k, combos: n, runs };
}
export function libClear() { for (const d of ownDecks()) store.set(KEY(d), null); }

// ---- Hintergrund-Lauf ----------------------------------------------------------------------------------------------------------
let running = false, cur = null;
const busy = () => (typeof document !== 'undefined' && document.hidden) || (typeof window !== 'undefined' && window.__duel && !window.__duel.stopped);
/** Sofort anhalten (Duell startet) – der Lauf wartet, bis wieder Ruhe ist */
export function libPause() { if (cur) { cur.aborted = true; try { cur.stop && cur.stop(); } catch (e) { /* */ } } }
export async function libLoop() {
  if (running || !libOn()) return; running = true;
  try {
    const decks = ownDecks().filter((d) => d && d.main && d.main.length && MODES[d.fmt || 'advanced']);
    const rounds = decks.length * 4; // je App-Start vier neue Starthände pro Deck
    for (let r = 0; r < rounds && libOn(); r++) {
      while (busy()) await sleep(2000);
      const d = decks[r % decks.length]; const m = MODES[d.fmt || 'advanced'];
      const mk = () => ({ main: expand(d.main), extra: expand(d.extra || []) });
      const copts = { flags: m.flags, decks: [mk(), mk()], scripts: m.scripts, seed: [rand32(), rand32(), rand32(), rand32()].map((x) => BigInt(x)), lp: m.lp || 8000, hand: m.hand };
      const goal = (store.get('cfg.demo', {}) || {}).goal || 'balance';
      const ctl = {}; cur = ctl; const watch = setInterval(() => { if (busy()) libPause(); }, 700);
      let res = null; try { res = await searchCombo({ ...copts, goal, guides: libGuides(d) }, { ms: 12000, helpers: 1, useMain: false, ctl }); } catch (e) { res = null; }
      clearInterval(watch); cur = null;
      if (ctl.aborted) { r--; continue; } // unterbrochen: dieselbe Runde später noch einmal
      if (res) { libAdd(d, res); const L = libGet(d); L.runs = (L.runs || 0) + 1; save(d, L); }
      await sleep(500);
    }
  } finally { running = false; }
}
