// Hauptmenü im Master-Duel-Aufbau: Profil-Leiste, Info-Karussell, Tagesaufgabe, vier runde Knöpfe, große Lieblingskarte rechts.
// Alle Grafiken sind eigene SVG/CSS-Zeichnungen; das Kartenbild kommt wie im Duell von der Bilderseite.
import { h, clear, toast } from './util.js';
import { App, nameOf } from './data.js';
import { openModal } from './ui.js';
import { go, screens } from './nav.js';
import { store } from './store.js';
import { cardEl, wantImage } from './cards.js';
import { settings, isApp, installApp, hydrate } from './screens.js';
import { curBan } from './md.js';

const svg = (s, cls = 'ic') => { const d = document.createElement('span'); d.className = cls; d.innerHTML = s; return d; };
const IC = {
  duel: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l20 20M7 9l2-2 3 0 0 3M27 29l-4 4M29 27l4-4M31 33l6 6M33 31l6 6M35 41l6-6"/><path d="M39 7L19 27M41 9l-2-2-3 0 0 3M21 29l4 4M19 27l-4-4M17 33l-6 6M15 31l-6 6M13 41l-6-6"/></svg>',
  deck: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="6" y="14" width="14" height="22" rx="2" transform="rotate(-16 13 25)"/><rect x="15" y="11" width="14" height="22" rx="2" transform="rotate(-5 22 22)"/><rect x="25" y="11" width="14" height="22" rx="2" transform="rotate(7 32 22)"/><path d="M12 38c6 3 18 3 26-1" stroke-linecap="round"/></svg>',
  learn: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M24 14c-5-4-12-4-18-2v24c6-2 13-2 18 2 5-4 12-4 18-2V12c-6-2-13-2-18 2z"/><path d="M24 14v24M11 18h7M11 23h7M30 18h7M30 23h7" stroke-linecap="round"/></svg>',
  opts: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="24" cy="24" r="6"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2" stroke-linecap="round"/><circle cx="24" cy="24" r="13"/></svg>',
  online: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="24" rx="8" ry="18"/><path d="M7 18h34M7 30h34"/></svg>',
  play: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><rect x="5" y="10" width="38" height="28" rx="3"/><path d="M20 17l11 7-11 7z" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M8 12h32M8 24h32M8 36h32"/></svg>',
  album: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="9" y="6" width="30" height="36" rx="3"/><rect x="15" y="12" width="8" height="11" rx="1"/><rect x="26" y="12" width="8" height="11" rx="1"/><rect x="15" y="27" width="8" height="10" rx="1"/><path d="M26 32h8"/></svg>',
  book: '<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24 41s-15-9.2-15-20a8.5 8.5 0 0 1 15-5.5A8.5 8.5 0 0 1 39 21c0 10.8-15 20-15 20z"/></svg>',
  log: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="6" y="11" width="36" height="26" rx="2"/><path d="M6 13l18 13 18-13"/></svg>',
};
export { IC as HOME_ICONS, svg as iconEl };
export const nameOfCard = (c) => nameOf(c);

// ---- Lieblingskarten (Profilbild und großes Bild rechts) ---------------------------------------------------------------
const DEF_HERO = 46986414; // Dunkler Magier
export const fav = {
  get hero() { return store.get('home.hero', DEF_HERO); }, set hero(v) { store.set('home.hero', v); },
  get avatar() { return store.get('home.avatar', 89631139); }, set avatar(v) { store.set('home.avatar', v); },
};
export function artEl(code, cls) { const im = h('img', { class: cls, alt: '', draggable: 'false' }); wantImage(im, 'crop', code); return im; }
/** Karte suchen und wählen (Name deutsch oder englisch) */
export function pickCard(title, done) {
  const list = h('div', { class: 'pc-grid' }); const inp = h('input', { class: 'input', placeholder: 'Kartenname, z. B. Dunkler Magier' });
  const run = () => {
    const q = inp.value.trim().toLowerCase(); clear(list); if (q.length < 2) { list.append(h('p', { class: 'muted small' }, 'Mindestens zwei Buchstaben eingeben.')); return; }
    let n = 0; for (const [code, c] of App.cards) { if (n >= 36) break; if (!(c.type & 1)) continue; const nm = (nameOf(code) || '').toLowerCase(); if (nm.includes(q) || (c.name || '').toLowerCase().includes(q)) { n++; list.append(h('button', { class: 'pc-it', onclick: () => { m.close(); done(code); } }, cardEl(code, { cls: 'sm' }))); } }
    if (!n) list.append(h('p', { class: 'muted small' }, 'Keine Monsterkarte gefunden.'));
  };
  inp.addEventListener('input', run);
  const m = openModal({ title, cls: 'tall', body: h('div', { class: 'col' }, inp, list), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Abbrechen') });
  setTimeout(() => { inp.focus(); run(); }, 50);
}

// ---- Tagesaufgabe -----------------------------------------------------------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
export function bumpDay(k) { const d = store.get('day', {}); const t = today(); const v = d.d === t ? d : { d: t }; v[k] = (v[k] || 0) + 1; store.set('day', v); }
const MISSIONS = [
  { k: 'wins', n: 1, t: 'Gewinne ein Duell' }, { k: 'duels', n: 3, t: 'Spiele 3 Duelle' }, { k: 'demos', n: 1, t: 'Sieh dir eine Kombo-Ansicht an' }, { k: 'wins', n: 2, t: 'Gewinne 2 Duelle' },
];
function mission() {
  const day = Math.floor(Date.now() / 864e5); const M = MISSIONS[day % MISSIONS.length]; const d = store.get('day', {}); const have = d.d === today() ? (d[M.k] || 0) : 0;
  const left = 24 - new Date().getHours();
  return { ...M, have: Math.min(have, M.n), done: have >= M.n, left };
}

// ---- Info-Karussell ---------------------------------------------------------------------------------------------------
function slides() {
  const last = store.get('last'); const ban = curBan(); const out = [];
  out.push({ t: settings.dedication || 'Willkommen im Duellraum', s: 'Yu-Gi-Oh! zu zweit', gold: true });
  if (last) out.push({ t: 'Letztes Duell wiederholen', s: 'Gleiche Decks, gleiche Einstellungen', on: () => { try { go('duel', hydrate(last)); } catch (e) { toast('Das letzte Duell konnte nicht geladen werden.'); } } });
  out.push({ t: 'Neu hier? Leichter Einstieg', s: 'Karten aussuchen, die dir gefallen – mit Begleiterin', on: () => go('taste') });
  out.push({ t: 'Kombo-Ansicht', s: 'Die KI spielt dein Deck vor und erklärt jeden Schritt', on: () => go('setup', { fmt: ban.fmt, list: ban.list, demo: true }) });
  out.push({ t: `Banlist: ${ban.t}`, s: `${App.decks.length} Decks · ${App.cards.size.toLocaleString('de-DE')} Karten · offline spielbar`, on: () => go('duelhub') });
  if (!isApp()) out.push({ t: 'Als App installieren', s: 'Auf dem Startbildschirm, ohne Browser-Leiste', on: installApp });
  return out;
}

screens.home = () => {
  if (!store.get('onb.done')) return screens.welcome(); // erster Start: Einstieg wählen
  const ban = curBan(); const names = settings.names; const S = slides(); let si = 0; const M = mission();
  const avatar = h('button', { class: 'hm-av', title: 'Profilbild ändern', onclick: () => pickCard('Profilbild wählen', (c) => { fav.avatar = c; go('home'); }) }, artEl(fav.avatar, 'hm-avi'));
  const slideBox = h('div', { class: 'hm-sl' }); const dots = h('div', { class: 'hm-dots' });
  const paintSlide = () => {
    clear(slideBox); const x = S[si];
    slideBox.append(artEl(fav.hero, 'hm-slbg'), h('div', { class: 'hm-slband' },
      h('button', { class: 'hm-arr', onclick: (e) => { e.stopPropagation(); si = (si + S.length - 1) % S.length; paintSlide(); } }, '‹'),
      h('div', { class: 'hm-slx' }, h('div', { class: 'hm-slt' + (x.gold ? ' gold' : '') }, x.t), h('div', { class: 'hm-sls' }, x.s)),
      h('button', { class: 'hm-arr', onclick: (e) => { e.stopPropagation(); si = (si + 1) % S.length; paintSlide(); } }, '›')));
    slideBox.onclick = () => { if (S[si].on) S[si].on(); };
    clear(dots); S.forEach((_, i) => dots.append(h('i', { class: i === si ? 'on' : '' })));
  };
  paintSlide(); let timer = setInterval(() => { if (!slideBox.isConnected) { clearInterval(timer); return; } si = (si + 1) % S.length; paintSlide(); }, 6000);
  const circ = (ic, t, on) => h('button', { class: 'hm-c', onclick: on }, h('span', { class: 'hm-cr' }, svg(IC[ic])), h('span', { class: 'hm-ct' }, t));
  const top = (ic, t, on) => h('button', { class: 'hm-ti', title: t, 'aria-label': t, onclick: on }, svg(IC[ic]));
  const last = store.get('last');
  const go2 = last ? { k: 'WEITER', t: 'Letztes Duell', on: () => { try { go('duel', hydrate(last)); } catch (e) { toast('Das letzte Duell konnte nicht geladen werden.'); } } }
    : { k: 'LOS GEHT’S', t: 'Gegen die KI', on: () => go('setup', { fmt: ban.fmt, list: ban.list, mode: 'ai' }) };
  return h('div', { class: 'screen hm' },
    h('div', { class: 'hm-bg' }, h('i', { class: 'hm-sh a' }), h('i', { class: 'hm-sh b' }), h('i', { class: 'hm-sh c' })),
    h('button', { class: 'hm-hero', title: 'Bild ändern (Lieblingskarte)', onclick: () => pickCard('Lieblingskarte fürs Hauptmenü', (c) => { fav.hero = c; go('home'); }) },
      svg(RING, 'hm-ring'), artEl(fav.hero, 'hm-art'), h('i', { class: 'hm-spark s1' }), h('i', { class: 'hm-spark s2' }), h('i', { class: 'hm-spark s3' })),
    h('div', { class: 'hm-l' },
      h('div', { class: 'hm-prof' }, avatar, h('div', { class: 'hm-pn' }, h('div', { class: 'hm-name' }, names[0] || 'Spieler 1'), h('div', { class: 'hm-sub' }, h('span', { class: 'hm-bn' }, ban.ic), h('span', null, store.get('unlocks', {}).ak3 ? 'Kettenprofi' : 'Duellraum')))),
      slideBox, dots,
      h('button', { class: 'hm-mis' + (M.done ? ' done' : ''), onclick: () => go('duelhub') }, h('div', { class: 'hm-mh' }, h('b', null, 'AUFGABE'), h('span', null, M.done ? '✓ Geschafft!' : `◷ Noch ${M.left} Std.`)), h('div', { class: 'hm-mt' }, `${M.t} (${M.have}/${M.n})`)),
      h('div', { class: 'hm-cs' }, circ('duel', 'DUELL', () => go('duelhub')), circ('deck', 'DECK', () => go('deckhub')), circ('learn', 'LERNEN', () => go('learn')), circ('opts', 'OPTIONEN', () => go('settings')))),
    h('div', { class: 'hm-top' },
      h('button', { class: 'hm-pill', onclick: () => go('duelhub'), title: 'Banlist wechseln' }, h('span', { class: 'hm-pi' }, ban.ic), h('span', { class: 'hm-pt' }, ban.t), h('span', { class: 'hm-plus' }, '+')),
      top('album', 'Karten-Album', () => go('album')), top('book', 'Unser Duellbuch', () => go('book')), top('online', 'Online-Duell', () => go('online', { fmt: ban.fmt, list: ban.list })), top('play', 'Kombo-Ansicht', () => go('setup', { fmt: ban.fmt, list: ban.list, demo: true })), top('menu', 'Einstellungen', () => go('settings'))),
    h('button', { class: 'hm-go', onclick: go2.on }, h('span', { class: 'hm-gk' }, go2.k), h('span', { class: 'hm-gt' }, go2.t)));
};

// Magischer Kreis hinter der Lieblingskarte (eigene Zeichnung: Ringe, Runenstriche)
const RING = (() => {
  let ticks = ''; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const r1 = 168, r2 = i % 3 ? 176 : 184; ticks += `<line x1="${200 + Math.cos(a) * r1}" y1="${200 + Math.sin(a) * r1}" x2="${200 + Math.cos(a) * r2}" y2="${200 + Math.sin(a) * r2}"/>`; }
  let runes = ''; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const x = 200 + Math.cos(a) * 150, y = 200 + Math.sin(a) * 150; runes += `<path transform="translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90})" d="M-5 -6h10M0 -6v12M-4 6l4-4 4 4"/>`; }
  return `<svg viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-width="2"><circle cx="200" cy="200" r="192" stroke-width="3"/><circle cx="200" cy="200" r="164"/><circle cx="200" cy="200" r="136" stroke-width="1.4"/>${ticks}${runes}<path d="M200 64l118 204H82z" stroke-width="1.4" opacity=".7"/><path d="M200 336L82 132h236z" stroke-width="1.4" opacity=".7"/></svg>`;
})();
