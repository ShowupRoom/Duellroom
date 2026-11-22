// Aufzeichnung für Duellbuch, Album, Wiederholungen und Herausforderungen. Alles bleibt auf diesem Gerät (localStorage).
import { store } from './store.js';
import { settings } from './screens.js';

const J = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { __b: String(v) } : v));
const P = (s) => JSON.parse(s, (k, v) => (v && typeof v === 'object' && v.__b !== undefined ? BigInt(v.__b) : v));
export const day = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

// ---- während des Duells ----------------------------------------------------------------------------------------------
export function recStart(D) { const lp = D.conf.lp || 8000; D.rec = { start: Date.now(), maxHit: null, maxChain: 0, minLp: [lp, lp], plays: [new Set(), new Set()], lastAtk: 0, hand0: null }; }
const local = (D, p) => D.conf.human[p] && !(D.net && p !== D.viewer) && !D.demo && !D.conf.replay;
export function recPlay(D, p, code) { if (!D.rec || !code || p == null) return; D.rec.plays[p].add(code); if (local(D, p)) albumPlay(code); }
export function recAttack(D, code) { if (D.rec) D.rec.lastAtk = code || 0; }
export function recDamage(D, victim, amount, inBattle) {
  if (!D.rec) return; const by = 1 - victim; const code = inBattle ? D.rec.lastAtk : (D.chain && D.chain.length ? D.chain[D.chain.length - 1].code : 0);
  if (!D.rec.maxHit || amount > D.rec.maxHit.v) D.rec.maxHit = { v: amount, p: by, code };
}
export function recChain(D) { if (D.rec) D.rec.maxChain = Math.max(D.rec.maxChain, D.chain ? D.chain.length : 0); }
export function recSnap(D, snap) {
  if (!D.rec || !snap) return; snap.players.forEach((x, p) => { if (x && x.lp != null) D.rec.minLp[p] = Math.min(D.rec.minLp[p], x.lp); });
  if (!D.rec.hand0 && snap.turn === 1 && snap.players[0].hand && snap.players[0].hand.length) D.rec.hand0 = snap.players[0].hand.map((c) => c && c.code).filter(Boolean);
}

// ---- nach dem Duell ---------------------------------------------------------------------------------------------------
const deckRec = (d) => ({ id: d.id, name: d.name, fmt: d.fmt, list: d.list, main: d.main, extra: d.extra || [] });
export function recFinish(D, winner, draw) {
  if (!D.rec || D.demo || D.conf.replay || D.conf.challenge) return;
  const c = D.conf; const names = c.players.map((x, i) => D.pname(i)); const kind = c.mode === 'hot' ? 'hot' : D.net ? 'net' : c.mode === 'ai' ? 'ai' : c.test ? 'test' : c.mode;
  const g = { t: Date.now(), kind, lp: c.lp || 8000, fmt: c.fmt, list: c.list, names, decks: c.players.map((x) => x.deck.name), human: c.human, viewer: D.viewer, winner: draw ? null : winner, turns: D.turnNo, dur: Date.now() - D.rec.start,
    maxHit: D.rec.maxHit, maxChain: D.rec.maxChain, minLp: D.rec.minLp, plays: D.rec.plays.map((s) => [...s].slice(0, 60)) };
  // Wiederholung: Decks, Startwert und alle Antworten – das Duell lässt sich exakt nachspielen
  if (!D.net && D.hist && D.hist.length < 4000) g.replay = J({ conf: { fmt: c.fmt, list: c.list, lp: c.lp, stack: c.stack, field: c.field, players: c.players.map((x) => ({ name: x.name, deck: deckRec(x.deck) })) }, seed: D.seedUsed, hist: D.hist });
  const B = store.get('book', { games: [] }); B.games.unshift(g); B.games = B.games.slice(0, 40);
  B.games.forEach((x, i) => { if (i >= 12) delete x.replay; }); // Wiederholungen nur für die letzten 12 Duelle (Speicherplatz)
  try { store.set('book', B); } catch (e) { B.games.forEach((x, i) => { if (i >= 3) delete x.replay; }); try { store.set('book', B); } catch (e2) { /* */ } }
  if (!draw) for (let p = 0; p < 2; p++) if (p === winner && local(D, p)) albumWin(D.rec.plays[p]);
}
export function replayConf(g) { const R = P(g.replay); return { ...R.conf, seed: R.seed, replay: R.hist, mode: 'replay', human: [false, false], tutor: false }; }

// ---- Album -----------------------------------------------------------------------------------------------------------
export const album = () => store.get('album', {});
function albumPlay(code) { const A = album(); const e = A[code] || { n: 0, w: 0, first: Date.now() }; e.n++; e.last = Date.now(); A[code] = e; try { store.set('album', A); } catch (x) { /* */ } }
function albumWin(set) { const A = album(); for (const c of set) if (A[c]) A[c].w = (A[c].w || 0) + 1; store.set('album', A); }
export function albumFav(code, v) { const A = album(); const e = A[code] || { n: 0, w: 0 }; e.fav = v; A[code] = e; store.set('album', A); }

// ---- Duellbuch-Auswertung ---------------------------------------------------------------------------------------------
export function bookStats() {
  const B = store.get('book', { games: [] }); const n1 = settings.names[0] || 'Spieler 1', n2 = settings.names[1] || 'Spieler 2';
  const duo = B.games.filter((g) => g.kind === 'hot' || g.kind === 'net');
  const winsOf = (nm) => duo.filter((g) => g.winner != null && g.names[g.winner] === nm).length;
  let best = { nm: null, n: 0 }; let curNm = null, cur = 0; for (const g of [...duo].reverse()) { const w = g.winner != null ? g.names[g.winner] : null; if (w && w === curNm) cur++; else { curNm = w; cur = w ? 1 : 0; } if (cur > best.n) best = { nm: curNm, n: cur }; }
  const time = duo.reduce((s, g) => s + (g.dur || 0), 0);
  const all = B.games; const hits = all.filter((g) => g.maxHit).sort((a, b) => b.maxHit.v - a.maxHit.v);
  const comeback = all.filter((g) => g.winner != null && g.minLp && g.minLp[g.winner] > 0 && g.minLp[g.winner] <= (g.lp || 8000) * 0.3).sort((a, b) => a.minLp[a.winner] - b.minLp[b.winner]);
  const chains = all.filter((g) => g.maxChain >= 2).sort((a, b) => b.maxChain - a.maxChain);
  const ai = all.filter((g) => g.kind === 'ai'); const aiW = ai.filter((g) => g.winner != null && g.human[g.winner]).length;
  return { n1, n2, duo, w1: winsOf(n1), w2: winsOf(n2), streak: best, time, top: { hit: hits[0], comeback: comeback[0], chain: chains[0] }, ai: { n: ai.length, w: aiW }, games: all };
}

// ---- Herausforderungen (als Link teilbar) ------------------------------------------------------------------------------
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const challenges = () => store.get('chal', []);
export function addChallenge(ch) { const L = challenges().filter((x) => x.id !== ch.id); L.unshift(ch); store.set('chal', L.slice(0, 20)); }
export function challengeLink(ch) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('ch', b64(JSON.stringify(ch))); return u.toString(); }
/** Link beim Start lesen (…?ch=…) */
export function readChallengeFromUrl() {
  try { const q = new URLSearchParams(location.search).get('ch'); if (!q) return null; const ch = JSON.parse(unb64(q)); if (!ch || !ch.deck || !ch.hand) return null; ch.inbox = true; addChallenge(ch); history.replaceState(null, '', location.pathname); return ch; } catch (e) { return null; }
}
