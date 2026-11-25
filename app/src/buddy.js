// Begleiterin im Duell: Deine Lieblingskarte spricht in einer Sprechblase den nächsten Zug (aus dem Tutor), „Mach ich!“ führt ihn aus.
// Dazu „Kurz gesagt“: die wichtigsten Eigenschaften der Karte als Symbole statt langem Kartentext.
import { h, clear } from './util.js';
import { cardOf, nameOf } from './data.js';
import { store } from './store.js';
import { artEl, fav } from './home.js';

export const buddyCode = () => store.get('buddy.code', fav.hero);
export const buddyOn = (D) => store.get('buddy.on', true) && !!(D.conf.tutor) && !D.demo && !(D.conf.replay);

/** Kurzfassung einer Karte aus dem (englischen) Original-Text: bis zu drei Zeilen mit Symbol */
export function shortRows(code) {
  const c = cardOf(code); if (!c) return []; const d = c.desc || ''; const out = [];
  const add = (ic, t) => { if (out.length < 3 && !out.some((x) => x[1] === t)) out.push([ic, t]); };
  if (/add[^.]{0,80}from your Deck to your hand/i.test(d)) add('⌕', 'Sucht eine Karte aus dem Deck');
  if (/from your (GY|Graveyard)[^.]{0,30}to your hand|add[^.]{0,60}from your (GY|Graveyard)/i.test(d)) add('↺', 'Holt eine Karte aus dem Friedhof');
  if (/draw \d|draw (a|1|2|3) card/i.test(d)) add('✚', 'Zieht Karten');
  if (/Special Summon[^.]{0,60}from (your|the) (Deck|hand|GY|Graveyard)/i.test(d)) add('⬆', 'Beschwört weitere Monster');
  if (/negate/i.test(d)) add('⛔', 'Negiert Effekte des Gegners');
  if (/destroy/i.test(d)) add('✖', 'Zerstört Karten');
  if (/banish/i.test(d)) add('◎', 'Verbannt Karten');
  if (/discard this card|send this card from your hand/i.test(d)) add('⚡', 'Wirkt aus der Hand – auch im Zug des Gegners');
  if (/You can only (use|activate)/i.test(d)) add('1×', 'Nur einmal pro Spielzug (alle Kopien)'); else if (/Once per turn/i.test(d)) add('1×', 'Einmal pro Spielzug (je Karte)');
  if (!out.length && (c.type & 1) && !(c.type & 0x20)) add('★', `Normales Monster · ATK ${c.attack}`);
  return out;
}
const keyCode = (D, k) => { if (!k) return 0; const [c, l, s] = k.split(':').map(Number); const x = D.cardAt && D.cardAt(c, l, s); return x && x.code; };

/** Aktion des Tipps ausführen (erste passende Aktion an der markierten Karte, sonst Phase) */
export function doTip(D) {
  const t = D.tip; if (!t || !D.pending) return false;
  if (t.ep && D.phaseOpts && D.phaseOpts.EP) { D.answer(D.phaseOpts.EP); return true; }
  if (t.bp && D.phaseOpts && D.phaseOpts.BP) { D.answer(D.phaseOpts.BP); return true; }
  const k = (t.keys || [])[0]; const L = k && D.acts && D.acts.get(k); if (!L || !L.length) return false;
  const want = t.kind || (t.plan && t.plan[0] && t.plan[0].kind); const a = (want && L.find((x) => x.kind === want)) || L.find((x) => x.pri) || L[0];
  D.answer(a.resp); return true;
}

export function buddyMount(D) {
  const av = h('button', { class: 'bdy-av nx-av pk', title: 'Begleiterin', onclick: () => { D.buddyHidden = !D.buddyHidden; buddyUpdate(D); } }, artEl(buddyCode(), 'bdy-img'));
  const name = h('div', { class: 'bdy-nm' }, (nameOf(buddyCode()) || 'Begleiterin').toUpperCase().slice(0, 22));
  const bub = h('div', { class: 'bdy-bub' });
  const el = h('div', { class: 'bdy' }, bub, av, name);
  D.root.append(el); D.buddy = { el, bub, sig: '' };
  buddyUpdate(D);
}
export function buddyUpdate(D) {
  const B = D.buddy; if (!B) return; const on = buddyOn(D); B.el.classList.toggle('off', !on); if (!on) return;
  const t = D.tip; const mine = D.pending && D.conf.human[D.pending.player != null ? D.pending.player : D.viewer];
  const show = !!(t && t.text && D.pending && !D.buddyHidden);
  B.el.classList.toggle('quiet', !show); if (!show) { B.sig = ''; return; }
  // Nur neu bauen, wenn sich der Tipp selbst ändert – die laufende Suchanzeige wird an Ort und Stelle aktualisiert,
  // sonst würden die Knöpfe ständig ersetzt und ein Fingertipp ginge verloren.
  const sig = (t.text || '') + '|' + (t.keys || []).join(',') + '|' + !!(t.search && t.search.live) + '|' + !!mine;
  if (sig === B.sig) { const lv = B.bub.querySelector('.bdy-live'); if (lv && t.search) lv.textContent = `⏳ Ich suche noch nach etwas Besserem … (${t.search.sims} Varianten)`; return; }
  B.sig = sig; clear(B.bub);
  const code = keyCode(D, (t.keys || [])[0]); const rows = code ? shortRows(code) : [];
  const canDo = !!(mine && ((t.keys && t.keys.length && D.acts && D.acts.get(t.keys[0])) || (t.ep && D.phaseOpts && D.phaseOpts.EP) || (t.bp && D.phaseOpts && D.phaseOpts.BP)));
  B.bub.append(...[h('div', { class: 'bdy-t' }, t.text.replace(/\s+/g, ' ').slice(0, 260)),
    rows.length ? h('div', { class: 'bdy-rows' }, rows.map(([ic, x]) => h('div', { class: 'bdy-r' }, h('i', null, ic), x))) : null,
    t.search && t.search.live ? h('div', { class: 'bdy-live' }, `⏳ Ich suche noch nach etwas Besserem … (${t.search.sims} Varianten)`) : null,
    h('div', { class: 'bdy-b' },
      canDo ? h('button', { class: 'bdy-go', onclick: () => { doTip(D); } }, 'Mach ich!') : null,
      h('button', { onclick: () => D.showTip() }, 'Warum?'),
      h('button', { onclick: () => { D.buddyHidden = true; buddyUpdate(D); } }, 'Selbst spielen'))].filter(Boolean));
}
