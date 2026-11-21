// Kleine Helfer: DOM-Bau, Töne, Zufall
/** Hook für Anzeigetexte (App: englische Kartennamen in „…“ durch deutsche ersetzen) */
export const textHook = { fn: null };
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(textHook.fn ? textHook.fn(String(kid)) : String(kid))); }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand32 = () => { const a = new Uint32Array(1); (globalThis.crypto || { getRandomValues: (x) => { x[0] = Math.random() * 4294967296; } }).getRandomValues(a); return a[0]; };
export const shuffled = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rand32() % (i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

let toastEl;
export function toast(msg, ms = 2400) {
  if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.append(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), ms);
}

// Töne: kleine synthetische Effekte (WebAudio), abschaltbar
let ac = null; export const sound = { on: true };
export function beep(kind = 'tap') {
  if (!sound.on) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain();
    const P = { tap: [520, 0.05, 'sine', 0.05], ok: [740, 0.09, 'triangle', 0.07], hit: [120, 0.18, 'sawtooth', 0.09], chain: [330, 0.14, 'square', 0.04], win: [880, 0.4, 'triangle', 0.08], summon: [440, 0.2, 'triangle', 0.07] }[kind] || [440, .05, 'sine', .05];
    o.type = P[2]; o.frequency.setValueAtTime(P[0], t); if (kind === 'summon' || kind === 'win') o.frequency.exponentialRampToValueAtTime(P[0] * 1.8, t + P[1]); if (kind === 'hit') o.frequency.exponentialRampToValueAtTime(50, t + P[1]);
    g.gain.setValueAtTime(P[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[1]); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + P[1] + 0.02);
  } catch (e) { /* kein Ton */ }
}

export const zkey = (p, l, s) => `${p}:${l}:${s}`;
