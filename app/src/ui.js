// Gemeinsame Oberflächen-Bausteine: Fenster, Kartenansicht
import { h, $ } from './util.js';
import { App } from './data.js';
import { cardEl } from './cards.js';
import { typeText, levelText, attrName, statsText, kind } from './strings.js';
import { cleanName } from './data.js';

export function openModal({ title, body, footer, center = false, cls = '', onClose, host, sticky = false } = {}) {
  const box = h('div', { class: 'box ' + cls },
    title != null ? h('div', { class: 'mh' }, h('h3', null, title), sticky ? null : h('button', { class: 'ibtn', onclick: () => close() }, '✕')) : null,
    h('div', { class: 'mb' }, body), footer ? h('div', { class: 'mf' }, footer) : null);
  const el = h('div', { class: 'modal' + (center ? ' center' : '') + (/\bpeek\b/.test(cls) ? ' peek' : '') }, box);
  if (!sticky) el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  function close(r) { el.remove(); onClose && onClose(r); }
  (host || $('#app')).append(el); return { el, box, close };
}
export function confirmBox(title, text, yes = 'Ja', no = 'Abbrechen', danger = false) {
  return new Promise((res) => {
    const m = openModal({ title, center: true, body: h('p', { style: 'margin:6px 0 10px' }, text), footer: [h('button', { class: 'btn ghost', onclick: () => { res(false); m.close(); } }, no), h('button', { class: 'btn ' + (danger ? 'red' : 'pri'), onclick: () => { res(true); m.close(); } }, yes)], onClose: () => res(false) });
  });
}
export function cardInfoBody(code, extra) {
  const c = App.cards.get(code); if (!c) return h('div', null, 'Unbekannte Karte ' + code);
  const lv = levelText(c), at = attrName(c.attribute);
  return h('div', { class: 'cinfo' },
    h('div', { class: 'cinfo-top' }, cardEl(code, { cls: 'lg' }),
      h('div', { class: 'grow' }, h('div', { class: 'cinfo-n' }, cleanName(c.name)), h('div', { class: 'muted small' }, typeText(c)),
        (c.type & 1) ? h('div', { class: 'small', style: 'margin-top:4px' }, [at, lv].filter(Boolean).join(' · ')) : null,
        (c.type & 1) ? h('div', { class: 'small gold' }, statsText(c)) : null,
        (c.type & 0x1000000) ? h('div', { class: 'small muted' }, `Pendel-Skala ${c.lscale} / ${c.rscale}`) : null, extra || null)),
    h('div', { class: 'cinfo-t' }, (c.desc || '').replace(/\r/g, '')));
}
export function showCard(code, footer) {
  const m = openModal({ title: null, body: cardInfoBody(code), footer: footer || h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen'), cls: 'cardbox' });
  return m;
}
