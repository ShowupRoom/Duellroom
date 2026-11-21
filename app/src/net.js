// Online-Sitzung zwischen zwei Handys: WebRTC-Datenkanal über PeerJS. Der Gastgeber rechnet, der Gast sieht nur seine Sicht.
import Peer from 'peerjs';
import { store } from './store.js';

const enc = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? { $b: String(v) } : v));
const dec = (s) => JSON.parse(s, (k, v) => (v && typeof v === 'object' && typeof v.$b === 'string' && Object.keys(v).length === 1 ? BigInt(v.$b) : v));
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPH[b % ALPH.length]).join('');
const PREFIX = 'duellraum-v1-';

function peerOpts() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };
  const q = new URLSearchParams(location.search).get('peer'); // nur für Tests: eigener Vermittlungsserver
  if (q) { const [host, port] = q.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false }); }
  return o;
}

/** Eine laufende Online-Sitzung (bleibt über Bildschirmwechsel bestehen) */
export class Session {
  constructor(role, code) {
    this.role = role; this.code = code || newCode(); this.conn = null; this.peer = null; this.state = 'start'; this.partner = null; this.listeners = new Set(); this.handlers = new Map(); this.lastIn = 0; this.closed = false; this.queue = [];
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev, data) { for (const f of [...this.listeners]) { try { f(ev, data); } catch (e) { console.error(e); } } }
  handle(t, fn) { this.handlers.set(t, fn); }
  setState(s, info) { this.state = s; this.emit('state', info); }
  get connected() { return !!(this.conn && this.conn.open); }

  open() {
    return new Promise((res, rej) => {
      const id = this.role === 'host' ? PREFIX + this.code : undefined;
      this.setState('server');
      const p = this.peer = id ? new Peer(id, peerOpts()) : new Peer(peerOpts());
      let done = false;
      p.on('open', () => { if (!done) { done = true; res(); } this.setState(this.role === 'host' ? 'waiting' : 'connecting'); if (this.role === 'guest') this.dial(); });
      p.on('error', (e) => {
        const t = e && e.type;
        if (!done) { done = true; rej(new Error(t === 'unavailable-id' ? 'Dieser Raum-Code ist schon vergeben.' : t === 'network' || t === 'server-error' ? 'Keine Verbindung zum Vermittlungsserver – ist Internet an?' : 'Verbindungsfehler: ' + (t || e))); return; }
        if (t === 'peer-unavailable') { this.setState('notfound'); this.retryDial(4000); }
        else if (t === 'network' || t === 'disconnected' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') { this.setState('offline'); setTimeout(() => this.reconnectServer(), 2500); }
      });
      p.on('disconnected', () => { if (!this.closed) setTimeout(() => this.reconnectServer(), 1500); });
      p.on('connection', (c) => { if (this.role !== 'host') return; this.attach(c); });
    });
  }
  reconnectServer() { if (this.closed || !this.peer || this.peer.destroyed) return; if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (e) { /* */ } } }
  dial() {
    if (this.closed || !this.peer || this.peer.disconnected) return;
    const c = this.peer.connect(PREFIX + this.code, { reliable: true }); this.attach(c);
  }
  retryDial(ms) { clearTimeout(this.rt); this.rt = setTimeout(() => { if (!this.connected && !this.closed) this.dial(); }, ms); }
  attach(c) {
    c.on('open', () => {
      if (this.conn && this.conn !== c) { try { this.conn.close(); } catch (e) { /* */ } }
      this.conn = c; this.lastIn = Date.now(); this.setState('connected'); this.emit('open');
      for (const m of this.queue.splice(0)) this.send(m);
      clearInterval(this.hb); this.hb = setInterval(() => this.beat(), 3000);
    });
    c.on('data', (d) => { this.lastIn = Date.now(); let m; try { m = dec(d); } catch (e) { return; } if (m.t === 'ping') return; const h = this.handlers.get(m.t); if (h) h(m); this.emit('msg', m); });
    c.on('close', () => { if (this.conn === c) this.lost(); });
    c.on('error', () => { if (this.conn === c) this.lost(); });
  }
  beat() {
    if (!this.conn) return;
    if (this.conn.open) { try { this.conn.send(enc({ t: 'ping' })); } catch (e) { /* */ } }
    if (Date.now() - this.lastIn > 12000) this.lost();
  }
  lost() {
    if (this.closed) return; const c = this.conn; this.conn = null; try { c && c.close(); } catch (e) { /* */ }
    clearInterval(this.hb); this.setState('lost'); this.emit('lost');
    if (this.role === 'guest') this.retryDial(1500);
  }
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(enc(m)); return true; } catch (e) { /* */ } } this.queue.push(m); if (this.queue.length > 50) this.queue.shift(); return false; }
  close() { this.closed = true; clearInterval(this.hb); clearTimeout(this.rt); try { this.conn && this.conn.open && this.conn.send(enc({ t: 'bye' })); } catch (e) { /* */ } setTimeout(() => { try { this.peer && this.peer.destroy(); } catch (e) { /* */ } }, 300); this.emit('closed'); }
}

export let session = null;
window.__net = () => session;
export function startSession(role, code) { if (session) session.close(); session = new Session(role, code); return session; }
export function endSession() { if (session) session.close(); session = null; }
export const myName = () => store.get('name', '');
export const setMyName = (n) => store.set('name', n);

// ---- Bildschirm wach halten während eines Online-Duells --------------------------------------------------
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch (e) { /* nicht unterstützt */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session && session.wantAwake) keepAwake(true); });
