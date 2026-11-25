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
// Ersatzweg: öffentlicher Bild-Zwischenspeicher wsrv.nl (kostenlos, holt das Bild einmal bei ygoprodeck und liefert es selbst aus).
// Hilft, wenn ygoprodeck den eigenen Anschluss sperrt oder hakt – dann fragt das Handy nicht mehr direkt dort an.
const SRC = {
  ygo: (k, id) => BASE + PATH[k] + id + '.jpg',
  wsrv: (k, id) => 'https://wsrv.nl/?url=' + encodeURIComponent('images.ygoprodeck.com/images/' + PATH[k] + id + '.jpg') + '&maxage=31d',
};
let ygoBadUntil = 0; // ygoprodeck hakt → so lange zuerst den Ersatzweg nehmen
const order = () => (Date.now() < ygoBadUntil ? ['wsrv', 'ygo'] : ['ygo', 'wsrv']);
/** ein Bild von einer Quelle holen: {blob} | {url} (nur anzeigbar, ohne CORS) | '404' | 'err' */
async function getFrom(src, k, id, allowUrl = true) {
  const url = SRC[src](k, id);
  try {
    const r = await fetch(url, { mode: 'cors' }); if (r.status === 404) return '404'; if (!r.ok) return 'err';
    const b = await r.blob(); return b.size && /image/.test(b.type) ? { blob: b } : '404';
  } catch (e) {
    if (!allowUrl) return 'err';
    const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; setTimeout(() => res(false), 8000); });
    return ok ? { url } : 'err';
  }
}
/** der Reihe nach über die Quellen: merkt sich, wenn ygoprodeck hakt (10 min Ersatzweg zuerst) */
async function getAny(k, id, allowUrl = true) {
  let miss = 0;
  for (const src of order()) {
    const r = await getFrom(src, k, id, allowUrl);
    if (typeof r === 'object') { if (src === 'ygo') ygoBadUntil = 0; imgHealth.src = src; return r; }
    if (r === '404') { miss++; if (src === 'ygo') return '404'; continue; } // Karte hat kein Bild – der Ersatzweg kennt es dann auch nicht
    if (src === 'ygo') ygoBadUntil = Date.now() + 10 * 60000;
  }
  return miss ? '404' : 'err';
}
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

const urls = new Map(); // Schlüssel → Objekt-URL | {fail: Zeitpunkt}
const waiting = new Map(); // Schlüssel → [img-Elemente]
const queue = []; let active = 0; let offlineUntil = 0;
const key = (k, id) => k + id;
const RETRY_MS = 45000; // ein fehlgeschlagenes Bild wird nach dieser Zeit (oder sobald das Netz zurück ist) erneut versucht
/** Zustand der Bildquelle – für „Bilder-Verbindung testen“ und die Drosselung */
export const imgHealth = { ok: 0, fail: 0, streak: 0, last: null, src: null };
const noteOk = () => { imgHealth.ok++; imgHealth.streak = 0; imgHealth.last = 'ok'; };
const noteFail = (why) => { imgHealth.fail++; imgHealth.streak++; imgHealth.last = why; };

async function fetchOne(k, id) {
  const kk = key(k, id);
  const cached = await idbGet(kk);
  if (cached) return URL.createObjectURL(cached);
  if (Date.now() < offlineUntil) return 'later';
  const r = await getAny(k, id);
  if (r === '404') { noteFail('kein Bild'); return 'fail'; }
  if (r === 'err') { noteFail('netz'); return backoff(); }
  noteOk(); if (r.blob) { idbPut(kk, r.blob); return URL.createObjectURL(r.blob); } return r.url;
}
// Netz weg oder Quelle sperrt: kurz pausieren (wächst bei Dauerfehlern bis 2 min) – die Bilder bleiben in der Warteschlange
function backoff() { offlineUntil = Date.now() + Math.min(120000, 5000 * Math.max(1, imgHealth.streak)); return 'later'; }
function pump() {
  while (active < 4 && queue.length) {
    if (Date.now() < offlineUntil) { setTimeout(pump, offlineUntil - Date.now() + 50); return; }
    const [k, id] = queue.shift(); active++;
    fetchOne(k, id).then((u) => {
      const kk = key(k, id);
      if (u === 'later') { queue.push([k, id]); return; } // später erneut – die wartenden Bilder bleiben angemeldet
      if (u === 'fail') { urls.set(kk, { fail: Date.now() }); waiting.delete(kk); return; }
      urls.set(kk, u); for (const im of waiting.get(kk) || []) im.src = u; waiting.delete(kk);
    }).finally(() => { active--; pump(); });
  }
}
// Netz zurück / App wieder im Vordergrund: Pausen und alte Fehlschläge vergessen, Warteschlange weiterlaufen lassen
const wake = () => { offlineUntil = 0; for (const [kk, u] of urls) if (u && u.fail) urls.delete(kk); pump(); };
try { addEventListener('online', wake); document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); }); } catch (e) { /* kein Browser */ }
export function wantImage(img, k, code) {
  if (!cfg.images) return;
  const id = imageId(code); const kk = key(k, id); const u = urls.get(kk);
  if (u && u.fail) { if (Date.now() - u.fail < RETRY_MS) return; urls.delete(kk); }
  img.classList.add('art'); img.onload = () => img.classList.add('ok'); img.onerror = () => img.classList.remove('ok');
  if (typeof u === 'string') { img.classList.add('nf'); img.src = u; if (img.complete && img.naturalWidth) img.classList.add('ok'); return; } // schon geladen: sofort zeigen, kein erneutes Einblenden (sonst flackert das Bild bei jedem Neuzeichnen des Felds)
  if (!waiting.has(kk)) { waiting.set(kk, []); queue.push([k, id]); }
  waiting.get(kk).push(img); pump();
}
/** Bilder eines Decks sofort holen, vor allem anderen (beim Öffnen eines Decks oder Duellstart) – schon gespeicherte werden übersprungen */
export function warmDeck(...lists) {
  if (!cfg.images) return; const ids = new Set();
  for (const L of lists) for (const e of L || []) { const c = Array.isArray(e) ? e[e.length - 1] : (e && e.code) || e; if (c) ids.add(imageId(+c)); }
  const front = [];
  for (const id of ids) for (const k of ['small', 'crop']) { const kk = key(k, id); if (urls.has(kk) && !(urls.get(kk) && urls.get(kk).fail)) continue; if (urls.get(kk) && urls.get(kk).fail) urls.delete(kk); if (waiting.has(kk)) { const i = queue.findIndex(([a, b]) => a === k && b === id); if (i > 0) front.push(...queue.splice(i, 1)); continue; } waiting.set(kk, []); front.push([k, id]); }
  queue.unshift(...front); pump();
}
/** Verbindung zur Bildquelle prüfen (ohne Zwischenspeicher): 'ok' | 'gesperrt' | 'offline' | 'fehler <code>' */
export async function testImages() {
  if (!navigator.onLine) return 'offline';
  const probe = async (src) => { const t = Date.now(); const url = SRC[src]('small', 46986414) + (src === 'ygo' ? '?t=' : '&t=') + t;
    try { const r = await fetch(url, { mode: 'cors', cache: 'no-store' }); if (!r.ok) return r.status === 403 || r.status === 429 ? 'gesperrt' : 'fehler ' + r.status; const b = await r.blob(); return b.size && /image/.test(b.type) ? 'ok' : 'fehler'; }
    catch (e) { const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; setTimeout(() => res(false), 9000); }); return ok ? 'ok' : 'gesperrt'; } };
  const [y, w] = await Promise.all([probe('ygo'), probe('wsrv')]);
  if (y !== 'ok' && w === 'ok') ygoBadUntil = Date.now() + 10 * 60000;
  return y === 'ok' ? 'ok' : w === 'ok' ? 'ersatz' : y;
}
/** Bilder vorab laden (für Offline-Betrieb); gedrosselt (≈ 4 pro Sekunde), bricht bei Dauerfehlern ab – ygoprodeck sperrt sonst den Anschluss */
export async function preload(codes, onProgress = () => {}, ctl = { stop: false }) {
  const ids = [...new Set(codes.map(imageId))]; let done = 0, ok = 0; const kinds = ['small', 'crop'];
  const work = []; for (const id of ids) for (const k of kinds) work.push([k, id]);
  let i = 0; const total = work.length; let streak = 0; let aborted = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Nur auf dem Gerät speichern (kein Objekt-URL im Speicher behalten – bei tausenden Bildern wichtig)
  const one = async (k, id) => {
    const kk = key(k, id); if (await idbHas(kk)) return 'have';
    const r = await getAny(k, id, false); if (r === '404') return 'skip'; if (r === 'err' || !r.blob) return false;
    return (await idbPutWait(kk, r.blob)) ? 'net' : false;
  };
  const lane = async () => {
    while (i < work.length && !ctl.stop && !aborted) {
      const [k, id] = work[i++]; const t0 = Date.now(); const r = await one(k, id);
      if (r === 'have' || r === 'net') { ok++; streak = 0; } else if (r === false) { streak++; if (streak >= 12) { aborted = true; break; } await wait(2000 * streak); }
      onProgress(++done, total); if (r === 'net') await wait(Math.max(0, 500 - (Date.now() - t0))); // höchstens ~2 neue Bilder pro Sekunde und Spur
    }
  };
  await Promise.all([lane(), lane()]); return { ok, total, done, stopped: (!!ctl.stop || aborted) && done < total, aborted };
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
