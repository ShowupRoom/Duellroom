// Spiel-Engines: lokal (Kern im Worker), als Gastgeber (lokal + Weiterleitung) und als Gast (über das Netz)
import { LOC, isPrompt, OcgMessageType as MSG } from '../../src/core.mjs';

let worker = null, seqId = 0; const waits = new Map();
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
function W() {
  if (worker) return worker;
  worker = new Worker('worker.js?v=' + VERSION);
  worker.onmessage = (e) => { const { id, res, err } = e.data; const w = waits.get(id); if (!w) return; waits.delete(id); if (err) w.rej(new Error(err)); else w.res(res); };
  worker.onerror = (e) => { for (const w of waits.values()) w.rej(new Error('Spielkern-Fehler: ' + (e.message || e))); waits.clear(); };
  return worker;
}
const call = (op, a) => new Promise((res, rej) => { const id = ++seqId; waits.set(id, { res, rej }); W().postMessage({ id, op, a }); });
/** Kern schon im Hauptmenü vorladen */
let warm = null;
export const prewarm = () => (warm = warm || call('init', { v: VERSION }).catch((e) => { warm = null; throw e; }));

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
