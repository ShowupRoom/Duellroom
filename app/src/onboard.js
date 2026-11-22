// Einstieg für Neue: Willkommen (drei Wege) → „Welche Karten gefallen dir?“ → passende Einsteiger-Decks → erstes Duell mit Begleiterin.
import { h, clear, toast } from './util.js';
import { App, allDecks, withTutor, saveCustom, nameOf } from './data.js';
import { go, screens, replace } from './nav.js';
import { store } from './store.js';
import { artEl, fav } from './home.js';
import { settings } from './screens.js';

/** Kategorien: Kunstbild + Decks, die dazu passen (nach Namen) */
export const CATS = [
  { id: 'mag', t: 'Magierinnen', art: 38033121, re: /Dark Magician|Magician|Spellbook|Yugi|Spellcaster|Witchcraft|Ars Magna|Artmage|Azamina/i },
  { id: 'dra', t: 'Drachen', art: 89631139, re: /Blue-Eyes|Red-Eyes|Galaxy-Eyes|Kaiba|Dragon|Tenpai|Dracotail|Dragunity|Rotaugen|Drachen/i },
  { id: 'cute', t: 'Niedlich', art: 40640057, re: /Toon|Pegasus|Dragonmaid|Mokey|Melodious|Kuriboh|Koala|Slime|Clown/i },
  { id: 'war', t: 'Krieger & Helden', art: 89943723, re: /HERO|Warrior|Heroic|Mitsurugi|Fire Fist|Sword of Souls|Joey|Gladiator|Bujin|Krieger|Kartenritter|Paladin/i },
  { id: 'light', t: 'Eis & Licht', art: 41175645, re: /Silent Magician|Light|White Aura|Hieratic|Constellar|Labrynth|Parshath|Sky Striker/i },
  { id: 'rose', t: 'Blumen & Natur', art: 73580471, re: /Rose|Plant|Rikka|Sunavalon|Traptrix|Lunalight|Cactus|Ruin/i },
  { id: 'mach', t: 'Maschinen', art: 70095154, re: /Cyber|Machina|Deskbot|Super Defense|Roid|Appliancer|Mekk|Batteryman|Gogogo|Ally of Justice|Jinzo|Krawler/i },
  { id: 'ghost', t: 'Geister & Yokai', art: 14558127, re: /Ghostrick|Mayakashi|Shiranui|Gravekeeper|Zombie|Bakura|Grabwächter|Geister|Lady of Lament/i },
  { id: 'beast', t: 'Mondlicht-Tiere', art: 47705572, re: /Lunalight|Beast|Phantom|Koala|Bounzer|Tenyi/i },
  { id: 'sea', t: 'Meer', art: 55063751, re: /Aqua|Gishki|Mako|Sea|Atlantean|Meer/i },
  { id: 'dark', t: 'Dunkle Mächte', art: 99177923, re: /Dark World|Despia|Branded|Snake-Eye|Archfiend|Monarch|Shaddoll|Dark Mimic|Destiny Board|Venom/i },
  { id: 'god', t: 'Götter & Legenden', art: 10000020, re: /Sacred Beast|Slifer|Obelisk|Divine|Egyptian|Marik|Ra\)|Horus|Exodius|Sphinx/i },
];
const EASY = (d) => (d.fmt === 'speed' ? 4 : 0) + (/^\d{4} S[AU]\d|Starting Deck|Structure|Reloaded|Ishizu|Marik|Mokuba|Weevil|Kaiba|Yugi|Joey|Mai |Pegasus/i.test(d.name) ? 2 : 0) + (d.fmt === 'goat' || d.fmt === 'edison' ? 1 : 0)
  - (/Snake-Eye|Ryzeal|Maliss|Fiendsmith|Branded|Despia|Azamina|Ars Magna|Tenpai|Labrynth/i.test(d.name) ? 2 : 0);
/** passende Decks, die einsteigerfreundlichsten zuerst */
export function recommend(ids, n = 3) {
  const cats = CATS.filter((c) => ids.includes(c.id)); if (!cats.length) return [];
  const all = App.decks.filter((d) => d.status === 'ok' && d.main && d.main.length);
  const sc = all.map((d) => { const hits = cats.filter((c) => c.re.test(d.name)).length; return { d, s: hits ? hits * 5 + EASY(d) : -1 }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const out = []; const seen = new Set(); for (const x of sc) { const k = x.d.name.replace(/\s*\(.*\)/, '').toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(x.d); if (out.length >= n) break; }
  return out;
}
/** Kunstbild eines Decks: stärkstes Monster */
export function coverOf(d) {
  let best = -1, code = 0; for (const e of [...(d.extra || []), ...(d.main || [])]) { const c = Array.isArray(e) ? (e.length > 2 ? e[e.length - 1] : e[0]) : e; const k = App.cards.get(c); if (k && (k.type & 1) && k.attack > best) { best = k.attack; code = c; } }
  return code || fav.hero;
}
const FMT_T = { speed: 'Speed Duell · 20 Karten', goat: 'Goat · klassisch 2005', edison: 'Edison · klassisch 2010', advanced: 'Advanced · modern', genesys: 'Genesys' };
const LIST_OF = { speed: 'speed', goat: 'goat', edison: 'edison', advanced: 'tcg', genesys: 'genesys' };

/** Erstes leichtes Duell gegen die KI mit Begleiterin */
export function easyDuel(deck) {
  const d = withTutor(deck); const op = App.decks.find((x) => x.fmt === d.fmt && x.status === 'ok' && x.id !== d.id && EASY(x) >= 2) || App.decks.find((x) => x.fmt === d.fmt && x.status === 'ok' && x.id !== d.id);
  store.set('buddy.on', true); store.set('banlist', LIST_OF[d.fmt] || 'tcg');
  go('duel', { fmt: d.fmt, list: LIST_OF[d.fmt] || 'tcg', mode: 'ai', level: 'leicht', players: [{ name: settings.names[0] || 'Du', deck: d }, { name: 'KI · Anfänger', deck: withTutor(op) }], human: [true, false], lp: d.fmt === 'speed' ? 4000 : 8000, tutor: true });
}

screens.welcome = () => {
  const done = (k) => { store.set('onb.done', k); };
  const opt = (n, ic, t, s, main, on) => h('button', { class: 'wl-o' + (main ? ' main' : ''), onclick: on }, h('span', { class: 'wl-n' }, n), h('span', { class: 'wl-ic' }, ic), h('b', null, t), h('span', { class: 'wl-s' }, s));
  return h('div', { class: 'screen nx wl' }, h('div', { class: 'nx-bg' }), h('div', { class: 'wl-ring' }), h('div', { class: 'wl-hero' }, artEl(fav.hero, 'wl-art')),
    h('button', { class: 'nx-x', title: 'Später', onclick: () => { done('skip'); replace('home'); } }, '✕'),
    h('div', { class: 'wl-t' }, h('div', { class: 'wl-k' }, 'WILLKOMMEN IM DUELLRAUM'), h('h1', null, 'Schön, dass du da bist,', h('br'), h('span', null, 'wie möchtest du starten?')), h('p', null, 'Du kannst jederzeit wechseln – alles andere schaltet sich mit der Zeit frei.')),
    h('div', { class: 'wl-ch' },
      opt('01', '❀', 'Ich bin neu', 'Karten aussuchen, die dir gefallen · eine Begleiterin erklärt jeden Zug', true, () => { done('new'); go('taste'); }),
      opt('02', '✦', 'Etwas Erfahrung', 'Duell-Akademie: kurze Lektionen mit vorbereiteter Hand', false, () => { done('mid'); go('academy'); }),
      opt('03', '⚔', 'Ich spiele schon', 'Direkt zur Duell-Zentrale mit allen Formaten', false, () => { done('pro'); replace('home'); go('duelhub'); })));
};

screens.taste = () => {
  const sel = new Set(store.get('taste', [])); const grid = h('div', { class: 'ts-grid' }); const res = h('div', { class: 'ts-res nx-pn' });
  const paint = () => {
    clear(res); const rec = recommend([...sel]);
    if (!sel.size) { res.append(h('div', { class: 'ts-x' }, h('span', { class: 'nx-lbl' }, 'Tippe Bilder an'), h('br'), 'Wähle ein oder mehrere Themen – dann schlage ich dir passende Decks vor.')); return; }
    res.append(h('div', { class: 'ts-x' }, h('span', { class: 'nx-lbl' }, 'Passt zu dir'), h('br'), rec.length ? rec.map((d, i) => h('span', null, i ? ' · ' : '', h('b', null, d.name))) : 'Noch nichts Passendes – wähle ein weiteres Thema.'),
      h('div', { class: 'ts-dk' }, rec.map((d) => h('div', { class: 'ts-c' }, artEl(coverOf(d), 'ts-ci')))),
      h('button', { class: 'nx-btn', disabled: !rec.length, onclick: () => { store.set('taste', [...sel]); go('recos', { ids: [...sel] }); } }, 'Decks ansehen ›'));
  };
  for (const c of CATS) {
    const t = h('button', { class: 'ts-t' + (sel.has(c.id) ? ' on' : ''), onclick: () => { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); t.classList.toggle('on', sel.has(c.id)); paint(); } },
      artEl(c.art, 'ts-img'), h('span', { class: 'ts-hk' }, '♥'), h('span', { class: 'ts-l' }, c.t));
    grid.append(t);
  }
  paint();
  return h('div', { class: 'screen nx ts' }, h('div', { class: 'nx-bg' }), h('div', { class: 'nx-head' }, h('div', { class: 'bar' }), h('div', null, h('h1', null, 'Welche Karten gefallen dir?'), h('p', null, 'Tippe an, was du schön findest – daraus entsteht dein erstes Deck'))),
    h('button', { class: 'nx-x', onclick: () => go('home') }, '✕'), h('div', { class: 'ts-wrap nx-scroll' }, grid), res);
};

screens.recos = ({ ids = store.get('taste', []) } = {}) => {
  const rec = recommend(ids, 4);
  const card = (d) => {
    const c = coverOf(d); const n = (d.main || []).reduce((s, e) => s + (Array.isArray(e) ? (e.length > 2 ? e[1] : e[1]) : 1), 0);
    const mine = () => { const r = saveCustom({ ...d, id: 'm' + Date.now().toString(36), name: d.name, fmt: d.fmt, list: LIST_OF[d.fmt] || 'tcg', custom: true }); toast(`«${r.name}» liegt jetzt unter Decks → Meine Decks.`); };
    return h('div', { class: 'rc-c nx-pn' }, h('div', { class: 'rc-art' }, artEl(c, 'rc-img')), h('div', { class: 'rc-b' },
      h('div', { class: 'nx-lbl' }, FMT_T[d.fmt] || d.fmt), h('h3', null, d.name), h('p', null, `${n} Karten · Lieblingsmonster «${nameOf(c)}»`),
      h('div', { class: 'rc-a' }, h('button', { class: 'nx-btn', onclick: () => easyDuel(d) }, '▶ Erstes Duell'), h('button', { class: 'nx-btn ghost', onclick: mine }, '♥ Behalten'))));
  };
  return h('div', { class: 'screen nx rc' }, h('div', { class: 'nx-bg' }), h('div', { class: 'nx-head' }, h('div', { class: 'bar' }), h('div', null, h('h1', null, 'Deine ersten Decks'), h('p', null, 'Leicht zu spielen · gegen eine freundliche KI · die Begleiterin hilft bei jedem Zug'))),
    h('button', { class: 'nx-x', onclick: () => go('home') }, '✕'),
    h('div', { class: 'rc-list nx-scroll' }, rec.length ? rec.map(card) : h('p', { class: 'muted' }, 'Keine passenden Decks gefunden.')));
};
