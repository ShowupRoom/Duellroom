// Spiel-Engines: lokal (Kern im Worker), als Gastgeber (lokal + Weiterleitung) und als Gast (über das Netz)
import { LOC, isPrompt, OcgMessageType as MSG } from '../../src/core.mjs';

export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
/** Ein Kern-Worker mit Aufrufen und Antworten (prog = Zwischenstände einer laufenden Suche) */
function mkWorker() {
  const w = new Worker('worker.js?v=' + VERSION); const waits = new Map(); let seq = 0;
  w.onmessage = (e) => { const d = e.data; if (d.prog) { const x = waits.get(d.prog); if (x && x.prog) x.prog(d.info); return; } const x = waits.get(d.id); if (!x) return; waits.delete(d.id); if (d.err) x.rej(new Error(d.err)); else x.res(d.res); };
  w.onerror = (e) => { for (const x of waits.values()) x.rej(new Error('Spielkern-Fehler: ' + (e.message || e))); waits.clear(); };
  return { w, call: (op, a, prog) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej, prog }); w.postMessage({ id, op, a }); }) };
}
let main = null;
const M = () => main || (main = mkWorker());
const call = (op, a) => M().call(op, a);
/** Kern schon im Hauptmenü vorladen */
let warm = null;
export const prewarm = () => (warm = warm || call('init', { v: VERSION }).catch((e) => { warm = null; throw e; }));

/** Kombo-Suche für eine Starthand. args = Duell-Aufbau (wie bei create) + goal; opt = { ms, helpers, onProgress(info) } → { rec, board, … } oder null.
 *  Mehrere Worker suchen unabhängig voneinander (verschiedene Zufallsfolgen), das beste Ergebnis gewinnt. */
let searching = null;
export async function searchCombo(args, { ms = 15000, helpers = 0, onProgress = () => {} } = {}) {
  await prewarm();
  const deadline = Date.now() + ms; const pool = [{ call: (op, a, p) => M().call(op, a, p), tmp: null }];
  for (let k = 0; k < helpers; k++) { try { const x = mkWorker(); pool.push({ call: x.call, tmp: x.w }); } catch (e) { /* kein weiterer Worker */ } }
  const last = pool.map(() => null); let stopped = false;
  const merge = () => {
    const f = last.filter(Boolean); if (!f.length) return;
    const top = f.reduce((a, b) => (b.score > a.score ? b : a));
    onProgress({ sims: f.reduce((n, x) => n + x.sims, 0), ms: Math.max(...f.map((x) => x.ms)), score: top.score, board: top.board, base: f[0].base, hand: (f.find((x) => x.hand) || {}).hand, top: (f.find((x) => x.top) || {}).top, left: Math.max(0, deadline - Date.now()), total: ms, workers: f.length });
  };
  searching = { stop: () => { stopped = true; for (const x of pool) { if (x.tmp) x.tmp.postMessage({ op: 'cancel' }); } M().w.postMessage({ op: 'cancel' }); } };
  const jobs = pool.map((x, k) => (async () => {
    if (x.tmp) await x.call('init', { v: VERSION });
    if (stopped) return null;
    return x.call('search', { ...args, v: VERSION, deadline, rseed: 20260101 + k * 7919, worker: k }, (info) => { last[k] = info; merge(); });
  })());
  const out = await Promise.allSettled(jobs);
  for (const x of pool) if (x.tmp) x.tmp.terminate();
  searching = null;
  const ok = out.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  if (!ok.length) { const bad = out.find((r) => r.status === 'rejected'); if (bad && !stopped) throw bad.reason; return null; }
  const best = ok.reduce((a, b) => (b.board.score > a.board.score ? b : a));
  return { ...best, sims: ok.reduce((n, x) => n + x.sims, 0), workers: ok.length };
}
export const stopSearch = () => { if (searching) searching.stop(); };

export class LocalEngine {
  async create(opts) { await prewarm(); await call('create', { ...opts, v: VERSION }); }
  step(resp) { return call('step', resp); }
  destroy() { call('destroy').catch(() => {}); }
}

// ---- Verdeckte Informationen für einen Spieler ausblenden ---------------------------------------------
const FACEUP = 5;
const hideCard = (c) => (c ? { ...c, code: 0, name: '', type: 0, attack: 0, defense: 0, level: 0, rank: 0, attribute: 0, race: 0n, overlayCards: [], targetCards: [], counters: {} } : c);
export function maskSnap(s, v) {
  const o = 1 - v; const P = s.players.map((x) => ({ ...x }));
  const op = P[o];
  op.hand = op.hand.map((c) => (c && !c.isPublic ? hideCard(c) : c));
  op.extra = op.extra.map((c) => (c && !(c.position & FACEUP) ? hideCard(c) : c));
  for (const k of ['mzone', 'szone', 'banished']) op[k] = op[k].map((c) => (c && !(c.position & FACEUP) && !c.isPublic ? hideCard(c) : c)); // „Gedankenlesen“ macht gesetzte Karten offen
  // eigene verdeckt verbannte Karten bleiben sichtbar
  return { ...s, players: P };
}
export function maskEvents(evs, v) {
  const out = [];
  for (const m of evs) {
    if (isPrompt(m)) continue;
    switch (m.type) {
      case MSG.DRAW: out.push(m.player === v ? m : { ...m, drawn: m.drawn.map((d) => ({ ...d, code: (d.position & FACEUP) ? d.code : 0 })) }); break;
      case MSG.MOVE: { const t = m.to; const vis = (t.controller === v && t.location !== LOC.DECK) || (t.position & FACEUP) || t.location === LOC.GRAVE; out.push(vis ? m : { ...m, card: 0 }); break; }
      case MSG.SET: out.push(m.controller === v ? m : { ...m, code: 0 }); break;
      case MSG.SHUFFLE_HAND: case MSG.SHUFFLE_EXTRA: out.push(m.player === v ? m : { ...m, cards: (m.cards || []).map(() => 0) }); break;
      case MSG.CONFIRM_CARDS: if (m.player === v) out.push(m); break;
      case MSG.HINT: if (m.player === undefined || m.player === v) out.push(m); break;
      default: out.push(m);
    }
  }
  return out;
}

// ---- Gastgeber: leitet jeden Schritt (für den Gast maskiert) weiter und wartet auf dessen Antworten -------------
export class HostLink {
  constructor(sess, guestSeat) {
    this.s = sess; this.gs = guestSeat; this.seq = 0; this.last = null; this.waiter = null;
    sess.handle('resp', (m) => { if (this.waiter && m.seq === this.seq) { const w = this.waiter; this.waiter = null; w(m.resp); } });
    sess.handle('sync', (m) => {
      if (m.resp !== undefined && m.resp !== null && m.lastSeq === this.seq && this.waiter) { const w = this.waiter; this.waiter = null; w(m.resp); return; }
      if (this.last && (m.lastSeq || 0) < this.seq) this.s.send(this.last);
    });
  }
  forward(st) {
    const r = st.r; let rr;
    if (r.kind === 'end') rr = r; else if (r.msg.player === this.gs) rr = r; else rr = { kind: 'wait', player: r.msg.player };
    this.seq++; this.last = { t: 'step', seq: this.seq, r: rr, evs: maskEvents(st.evs, this.gs), snap: maskSnap(st.snap, this.gs) };
    this.s.send(this.last);
  }
  waitResp() { return new Promise((res) => { this.waiter = res; }); }
  abort() { if (this.waiter) { const w = this.waiter; this.waiter = null; w(null); } }
}

// ---- Gast: bekommt Schritte vom Gastgeber, schickt nur eigene Antworten zurück -----------------------------------
export class RemoteEngine {
  constructor(sess) {
    this.s = sess; this.inbox = []; this.waiter = null; this.lastSeq = 0; this.lastResp = null;
    sess.handle('step', (m) => { if (m.seq <= this.lastSeq) return; this.lastSeq = m.seq; this.lastResp = null; this.push(m); });
    this.off = sess.on((ev) => { if (ev === 'open') this.sync(); });
  }
  sync() { this.s.send({ t: 'sync', lastSeq: this.lastSeq, resp: this.lastResp && this.lastResp.seq === this.lastSeq ? this.lastResp.resp : null }); }
  push(m) { if (this.waiter) { const w = this.waiter; this.waiter = null; w(m); } else this.inbox.push(m); }
  step(resp) {
    if (resp !== undefined && resp !== null) { this.lastResp = { seq: this.lastSeq, resp }; this.s.send({ t: 'resp', seq: this.lastSeq, resp }); }
    return this.inbox.length ? Promise.resolve(this.inbox.shift()) : new Promise((r) => { this.waiter = r; });
  }
  abort() { if (this.waiter) { const w = this.waiter; this.waiter = null; w(null); } }
  destroy() { this.abort(); if (this.off) this.off(); }
}
