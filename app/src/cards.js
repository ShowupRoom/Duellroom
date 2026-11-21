// Kartenanzeige: echtes Bild (online, einmalig geladen und auf dem Gerät gemerkt) über einem eingebauten Kartenentwurf
import { h } from './util.js';
import { App, imageId, cleanName } from './data.js';
import { store } from './store.js';
import { kind, levelText, attrName, statsText } from './strings.js';

export const cfg = { images: store.get('images', true) };
export const setImages = (v) => { cfg.images = !!v; store.set('images', !!v); };

// ---- Bild-Speicher (IndexedDB) ---------------------------------------------
const BASE = 'https://images.ygoprodeck.com/images/';
const PATH = { small: 'cards_small/', crop: 'cards_cropped/', big: 'cards/' };
let dbp = null;
const idb = () => (dbp = dbp || new Promise((res) => {
  try { const r = indexedDB.open('duellraum-bilder', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); }
}));
const idbGet = async (k) => { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const q = db.transaction('img').objectStore('img').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); };
const idbPut = async (k, v) => { const db = await idb(); if (!db) return; try { db.transaction('img', 'readwrite').objectStore('img').put(v, k); } catch (e) { /* ignorieren */ } };
export const idbCount = async () => { const db = await idb(); if (!db) return 0; return new Promise((res) => { try { const q = db.transaction('img').objectStore('img').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(0); } catch (e) { res(0); } }); };

const urls = new Map(); // Schlüssel → Objekt-URL | 'fail'
const waiting = new Map(); // Schlüssel → [img-Elemente]
const queue = []; let active = 0; let offlineUntil = 0;
const key = (k, id) => k + id;

async function fetchOne(k, id) {
  const kk = key(k, id);
  const cached = await idbGet(kk);
  if (cached) return URL.createObjectURL(cached);
  if (Date.now() < offlineUntil) return 'fail';
  const url = BASE + PATH[k] + id + '.jpg';
  try {
    const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return 'fail';
    const b = await r.blob(); if (!b.size || !/image/.test(b.type)) return 'fail';
    idbPut(kk, b); return URL.createObjectURL(b);
  } catch (e) {
    // Ohne CORS-Freigabe: Bild direkt anzeigen (wird dann vom Browser gemerkt, aber nicht von uns)
    const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; setTimeout(() => res(false), 8000); });
    if (ok) return url; offlineUntil = Date.now() + 15000; return 'fail';
  }
}
function pump() {
  while (active < 4 && queue.length) {
    const [k, id] = queue.shift(); active++;
    fetchOne(k, id).then((u) => { urls.set(key(k, id), u); for (const im of waiting.get(key(k, id)) || []) if (u !== 'fail') { im.src = u; } waiting.delete(key(k, id)); }).finally(() => { active--; pump(); });
  }
}
export function wantImage(img, k, code) {
  if (!cfg.images) return;
  const id = imageId(code); const kk = key(k, id); const u = urls.get(kk);
  if (u === 'fail') return;
  img.classList.add('art'); img.onload = () => img.classList.add('ok'); img.onerror = () => img.classList.remove('ok');
  if (u) { img.src = u; return; }
  if (!waiting.has(kk)) { waiting.set(kk, []); queue.push([k, id]); }
  waiting.get(kk).push(img); pump();
}
/** Bilder vorab laden (für Offline-Betrieb); gibt Fortschritt zurück */
export async function preload(codes, onProgress = () => {}) {
  const ids = [...new Set(codes.map(imageId))]; let done = 0, ok = 0; const kinds = ['small', 'crop'];
  const work = []; for (const id of ids) for (const k of kinds) work.push([k, id]);
  let i = 0; const total = work.length;
  const lane = async () => { while (i < work.length) { const [k, id] = work[i++]; const kk = key(k, id); if (!urls.has(kk)) { const u = await fetchOne(k, id); urls.set(kk, u); if (u !== 'fail') ok++; } else if (urls.get(kk) !== 'fail') ok++; onProgress(++done, total); } };
  await Promise.all([lane(), lane(), lane(), lane()]); return { ok, total };
}

// ---- Elemente -------------------------------------------------------------
/** nur im OCG erschienen (noch nicht im TCG) */
export const isOcg = (c) => !!c && (c.ot & 1) === 1 && (c.ot & 2) === 0;
export const ocgTag = (cls = '') => h('span', { class: 'ocg ' + cls, title: 'OCG-Karte – im TCG nicht erschienen' }, 'OCG');
const LV = (c) => (c && c.type & 1 ? (c.type & 0x4000000 ? 'L' + c.level : '★' + c.level) : '');
/** Vollständige Karte (Hand, Listen, Auswahl). o: {back, cls, atk} */
export function cardEl(code, o = {}) {
  if (o.back || !code) return h('div', { class: 'card back ' + (o.cls || '') });
  const c = App.cards.get(code);
  const k = kind(c);
  const el = h('div', { class: `card k-${k} ${o.cls || ''}`, 'data-code': code },
    h('div', { class: 'cf' },
      h('div', { class: 'cf-n' }, cleanName(c?.name || String(code))),
      c && (c.type & 1) ? h('div', { class: 'cf-a' }, attrName(c.attribute).slice(0, 4), ' ', LV(c)) : h('div', { class: 'cf-a' }, k === 'spell' ? 'Zauber' : k === 'trap' ? 'Falle' : ''),
      c && (c.type & 1) ? h('div', { class: 'cf-s' }, c.type & 0x4000000 ? `${c.attack < 0 ? '?' : c.attack}` : `${c.attack < 0 ? '?' : c.attack}/${c.defense < 0 ? '?' : c.defense}`) : null),
  );
  const im = h('img', { alt: '', draggable: 'false' }); el.append(im); wantImage(im, 'small', code);
  return el;
}
/** Karte auf dem Feld (Kunst-Ausschnitt). o: {back, peek, def, atk, defv, over, counters} */
export function fieldEl(code, o = {}) {
  const c = App.cards.get(code); const k = kind(c);
  const inner = o.back ? h('div', { class: 'fcard back' }) : h('div', { class: `fcard k-${k}` }, h('div', { class: 'fc-art' }, h('span', { class: 'fc-nm' }, cleanName(c?.name || '').slice(0, 16))));
  if (!o.back) { const im = h('img', { alt: '', draggable: 'false' }); inner.firstChild.append(im); wantImage(im, 'crop', code); }
  if (o.def) inner.classList.add('def'); if (o.peek) inner.classList.add('peek');
  const w = h('div', { class: 'fwrap' }, inner);
  if (!o.back && c && (c.type & 1) && o.atk != null && !o.peek) w.append(h('div', { class: 'fc-atk' }, fmtv(o.def ? o.defv : o.atk)));
  if (o.over) w.append(h('div', { class: 'fc-over' }, '◉' + o.over));
  if (o.counters) w.append(h('div', { class: 'fc-cnt' }, '✦' + o.counters));
  return w;
}
const fmtv = (v) => (v == null || v < 0 ? '?' : v);
export { levelText, statsText };
