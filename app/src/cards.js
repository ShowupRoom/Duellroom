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
const open = () => new Promise((res) => {
  try {
    const r = indexedDB.open('duellraum-bilder', 1); r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => { const db = r.result; const drop = () => { dbp = null; try { db.close(); } catch (e) { /* schon zu */ } }; db.onclose = drop; db.onversionchange = drop; res(db); };
    r.onerror = () => res(null); r.onblocked = () => res(null);
  } catch (e) { res(null); }
});
const idb = () => (dbp = dbp || open());
// Ein Zugriff; bei toter Verbindung (iOS kappt sie im Hintergrund) wird neu verbunden und es gibt einen zweiten Versuch.
const tx = async (mode, fn) => {
  for (let t = 0; t < 2; t++) {
    const db = await idb(); if (!db) return { ok: false };
    try {
      const v = await new Promise((res, rej) => {
        const x = db.transaction('img', mode); const q = fn(x.objectStore('img')); let out;
        if (q) q.onsuccess = () => { out = q.result; };
        x.oncomplete = () => res(out); x.onerror = () => rej(x.error || new Error('Fehler')); x.onabort = () => rej(x.error || new Error('Abbruch'));
      });
      return { ok: true, v };
    } catch (e) { dbp = null; try { db.close(); } catch (e2) { /* egal */ } }
  }
  return { ok: false };
};
// Gespeichert wird als Rohdaten (ArrayBuffer): Blobs in IndexedDB gehen auf iPhones manchmal verloren
const pack = async (b) => ({ t: b.type || 'image/jpeg', d: await b.arrayBuffer() });
const unpack = (v) => (v instanceof Blob ? v : v && v.d ? new Blob([v.d], { type: v.t || 'image/jpeg' }) : null);
const idbGet = async (k) => { const r = await tx('readonly', (s) => s.get(k)); return r.ok ? unpack(r.v) : null; };
const idbPut = async (k, b) => { try { const v = await pack(b); const r = await tx('readwrite', (s) => { s.put(v, k); }); if (r.ok) persistStorage(); return r.ok; } catch (e) { return false; } };
const idbHas = async (k) => { const r = await tx('readonly', (s) => s.getKey(k)); return r.ok && r.v !== undefined; };
const idbPutWait = idbPut;
export const idbCount = async () => { const r = await tx('readonly', (s) => s.count()); return r.ok ? r.v : 0; };
let persisted = null;
/** Bittet den Browser, die Bilder nicht von selbst zu löschen (auf dem iPhone nur für die App auf dem Home-Bildschirm wirksam) */
export const persistStorage = async () => {
  try { if (navigator.storage && navigator.storage.persist) { persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } } catch (e) { /* nicht unterstützt */ }
  return persisted;
};
export const storageInfo = async () => {
  const o = { persisted: await persistStorage(), used: 0, quota: 0 };
  try { const e = await navigator.storage.estimate(); o.used = e.usage || 0; o.quota = e.quota || 0; } catch (e) { /* egal */ }
  return o;
};

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
export async function preload(codes, onProgress = () => {}, ctl = { stop: false }) {
  const ids = [...new Set(codes.map(imageId))]; let done = 0, ok = 0; const kinds = ['small', 'crop'];
  const work = []; for (const id of ids) for (const k of kinds) work.push([k, id]);
  let i = 0; const total = work.length;
  // Nur auf dem Gerät speichern (kein Objekt-URL im Speicher behalten – bei tausenden Bildern wichtig)
  const one = async (k, id) => {
    const kk = key(k, id); if (await idbHas(kk)) return true;
    try { const r = await fetch(BASE + PATH[k] + id + '.jpg', { mode: 'cors' }); if (!r.ok) return false; const b = await r.blob(); if (!b.size || !/image/.test(b.type)) return false; return await idbPutWait(kk, b); } catch (e) { return false; }
  };
  const lane = async () => { while (i < work.length && !ctl.stop) { const [k, id] = work[i++]; if (await one(k, id)) ok++; onProgress(++done, total); } };
  await Promise.all([lane(), lane(), lane(), lane(), lane()]); return { ok, total, done, stopped: !!ctl.stop && done < total };
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
export const fieldCfg = { full: store.get('fieldfull', true) }; // true (Standard) = dieselbe Karte wie in den Fenstern, false = nur Kunst mit farbigem Rahmen
export const setFieldFull = (v) => { fieldCfg.full = !!v; store.set('fieldfull', !!v); };
/** Link-Pfeile: Bit des Kerns → Richtung (Zeile, Spalte) aus Sicht des Besitzers */
const LKV = [[0x1, 1, -1], [0x2, 1, 0], [0x4, 1, 1], [0x8, 0, -1], [0x20, 0, 1], [0x40, -1, -1], [0x80, -1, 0], [0x100, -1, 1]];
export function fieldEl(code, o = {}) {
  const c = App.cards.get(code); const k = kind(c);
  const inner = o.back ? h('div', { class: 'fcard back' }) : fieldCfg.full ? h('div', { class: `fcard full k-${k}` }, cardEl(code, { cls: 'fld' })) : h('div', { class: `fcard k-${k}` }, h('div', { class: 'fc-art' }, h('span', { class: 'fc-nm' }, cleanName(c?.name || '').slice(0, 16))));
  if (!o.back && !fieldCfg.full) { const im = h('img', { alt: '', draggable: 'false' }); inner.firstChild.append(im); wantImage(im, 'crop', code); }
  if (o.def) inner.classList.add('def'); if (o.peek) inner.classList.add('peek');
  const w = h('div', { class: 'fwrap' }, inner);
  if (!o.back && c && (c.type & 1) && o.atk != null && !o.peek) w.append(h('div', { class: 'fc-atk' }, fmtv(o.def ? o.defv : o.atk)));
  // Link-Pfeile (nur auf dem Feld): Gegner steht auf dem Kopf, seine Richtungen sind auf dem Bildschirm gespiegelt
  if (!o.back && o.lk && c && (c.type & 0x4000000) && c.link_marker) { const f = o.flip ? -1 : 1; const ar = LKV.filter(([b]) => c.link_marker & b).map(([, dr, dc]) => [dr * f, dc * f]); w.append(h('div', { class: 'lk ' + (o.flip ? 'op' : 'me') }, ar.map(([dr, dc]) => h('i', { 'data-v': `${dr},${dc}` })))); if (ar.some(([dr]) => dr === 1)) w.classList.add('lkb'); }
  if (o.over) w.append(h('div', { class: 'fc-over' }, '◉' + o.over));
  if (o.counters) w.append(h('div', { class: 'fc-cnt' }, '✦' + o.counters));
  return w;
}
const fmtv = (v) => (v == null || v < 0 ? '?' : v);
export { levelText, statsText };
