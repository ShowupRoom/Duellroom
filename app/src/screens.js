// Start, Formatwahl, Spieler-Setup, Deckauswahl mit Tutor, Lernen, Einstellungen
import { h, $, clear, toast, uid, shuffled, rand32, sound } from './util.js';
import { App, FORMAT_INFO, FORMATS, allDecks, fmtOf, fmtById, nameOf, withTutor, expand, count, cardOf, cleanName, customDecks, deleteCustom, consOf, ADV_LISTS, LIST_NAME, imageId } from './data.js';
import { consBlock, consChip } from './cons.js';
import { lockOn, relock } from './lock.js';
import { cardEl, cfg as imgCfg, setImages, preload, idbCount, storageInfo, isOcg, ocgTag } from './cards.js';
import { openModal, confirmBox, showCard } from './ui.js';
import { go, back, screens } from './nav.js';
import { store } from './store.js';
import { ROLE_DE, roleOf } from '../../src/tutor.mjs';
import { validate, deckPoints, isExtra } from '../../src/decks.mjs';
import { handtrapPlan } from '../../src/block.mjs';
import { kind, KIND_DE } from './strings.js';
import { AI_LEVELS } from '../../src/ai.mjs';

const hdr = (title, sub, right) => h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: () => back(), 'aria-label': 'Zurück' }, '←'), h('h2', null, title, sub ? h('div', { class: 'sub' }, sub) : null), right || null);

export const settings = {
  get names() { return store.get('names', ['Spieler 1', 'Spieler 2']); }, set names(v) { store.set('names', v); },
  get tutor() { return store.get('tutor', true); }, set tutor(v) { store.set('tutor', v); },
  get lp() { return store.get('lp', 8000); }, set lp(v) { store.set('lp', v); },
  get dedication() { return store.get('dedication', 'Zum Hochzeitstag – für dich ♥'); }, set dedication(v) { store.set('dedication', v); },
};
sound.on = store.get('sound', true);

// ---- Start ------------------------------------------------------------------
screens.home = () => h('div', { class: 'screen home' },
  h('div', { class: 'home-bg' }),
  h('div', { class: 'body home-body' },
    h('div', { class: 'home-hero' }, h('div', { class: 'sigil' }, '⚔'), h('h1', { class: 'home-t title-glow' }, 'DUELLRAUM'), h('div', { class: 'home-s' }, 'Yu-Gi-Oh! zu zweit'), h('div', { class: 'home-d' }, settings.dedication)),
    h('div', { class: 'home-menu' },
      h('button', { class: 'btn pri lg', onclick: () => go('formats') }, '⚔  Duell starten'),
      store.get('last') ? h('button', { class: 'btn lg', onclick: () => { const l = store.get('last'); try { go('duel', hydrate(l)); } catch (e) { toast('Das letzte Duell konnte nicht geladen werden.'); } } }, '↻  Letztes Duell wiederholen') : null,
      h('button', { class: 'btn lg', onclick: () => go('online') }, '🌐  Online gegeneinander'),
      h('button', { class: 'btn lg', onclick: () => go('workshop') }, '🃏  Deck-Werkstatt'),
      h('button', { class: 'btn lg', onclick: () => go('learn') }, '🎓  Lernen & Regeln'),
      h('button', { class: 'btn lg ghost', onclick: () => go('settings') }, '⚙  Einstellungen'),
      isApp() ? null : h('button', { class: 'btn ghost sm', style: 'align-self:center;margin-top:4px', onclick: installApp }, '📲  Als App auf dem Handy installieren')),
    h('div', { class: 'home-f muted small' }, `${App.decks.length} Decks · ${App.cards.size.toLocaleString('de-DE')} Karten · offline spielbar`)));
const isApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function installApp() {
  if (window.__bip) { const e = window.__bip; window.__bip = null; e.prompt(); try { await e.userChoice; } catch (x) { /* */ } return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const m = openModal({ title: '📲 Als App installieren', center: true, body: h('div', null, ios
    ? h('ol', null, h('li', null, 'Diese Seite in Safari öffnen.'), h('li', null, 'Unten auf das Teilen-Symbol (□↑) tippen.'), h('li', null, '„Zum Home-Bildschirm“ wählen, dann „Hinzufügen“.'))
    : h('ol', null, h('li', null, 'Diese Seite in Chrome öffnen.'), h('li', null, 'Oben rechts auf ⋮ tippen.'), h('li', null, '„App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.')),
    h('p', { class: 'small muted' }, 'Danach startet Duellraum wie eine normale App – schnell und auch ohne Internet (nur das Online-Duell braucht Internet).')), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK') });
}
/** gespeichertes Duell wieder zusammensetzen */
function hydrate(l) {
  const find = (id) => allDecks().find((d) => d.id === id) || (() => { throw new Error('Deck fehlt'); })();
  return { ...l, players: l.players.map((p) => ({ name: p.name, deck: withTutor(find(p.deck)) })) };
}

// ---- Format wählen ----------------------------------------------------------
screens.formats = () => h('div', { class: 'screen' }, hdr('Format wählen', 'Welche Regeln und welche Verbotsliste?'),
  h('div', { class: 'body' }, h('div', { class: 'wrap fmt-grid' }, ['goat', 'edison', 'advanced', 'genesys', 'speed'].map((id) => {
    const f = FORMAT_INFO[id]; const n = allDecks(id).filter((d) => d.status !== 'entwurf').length;
    return h('button', { class: 'panel fmt-card f-' + id, onclick: () => go('setup', { fmt: id }) },
      h('div', { class: 'fmt-ic' }, f.icon), h('div', { class: 'grow' }, h('div', { class: 'fmt-t' }, f.title), h('div', { class: 'gold small' }, f.sub), h('p', { class: 'muted fmt-b' }, f.blurb), h('div', { class: 'chip' }, n + ' Decks')));
  }))));

// ---- Spieler-Setup ------------------------------------------------------------
const MODES = [
  { id: 'hot', t: 'Zu zweit am Gerät', d: 'Ihr spielt abwechselnd; bei jedem Wechsel wird das Gerät übergeben, die Hand bleibt geheim.' },
  { id: 'ai', t: 'Gegen die KI', d: 'Die KI spielt wie ein Mensch: Sie beschwört, aktiviert Karten, greift an und antwortet auf deine Züge.' },
  { id: 'solo', t: 'Allein üben', d: 'Der Gegner steht still. Ideal, um die eigene Combo zu lernen.' },
];
screens.setup = ({ fmt }) => {
  const saved = store.get('setup.' + fmt, {}); const info = FORMAT_INFO[fmt];
  let st = { mode: saved.mode === 'bot' ? 'ai' : (saved.mode || 'hot'), level: saved.level || 'normal', names: saved.names || settings.names, decks: saved.decks || [null, null], list: saved.list || 'tcg', first: saved.first || 'random' };
  const pool = () => allDecks(fmt).filter((d) => d.status !== 'entwurf' && (fmt !== 'advanced' || st.list === 'none' || d.list === st.list || d.custom));
  const byId = (id) => id && allDecks(fmt).find((d) => d.id === id);
  const start = () => {
    const ds = st.decks.map(byId); const pl = [0, 1].map((i) => ({ name: (st.names[i] || 'Spieler ' + (i + 1)).trim(), deck: withTutor(ds[i]) }));
    if (st.mode === 'ai' && (!st.names[1] || st.names[1] === 'Spieler 2')) pl[1].name = 'KI · ' + AI_LEVELS[st.level].name;
    const first = st.first === 'random' ? (rand32() & 1) : +st.first;
    if (first === 1) { pl.reverse(); }
    const human = st.mode === 'hot' ? [true, true] : (first === 1 ? [false, true] : [true, false]);
    const conf = { fmt, list: st.list, mode: st.mode, level: st.level, players: pl, human, lp: settings.lp, tutor: settings.tutor };
    store.set('last', { ...conf, players: pl.map((p) => ({ name: p.name, deck: p.deck.id })) });
    go('duel', conf);
  };
  const root = h('div', { class: 'screen' }, hdr(info.title + ' – Duell einrichten', info.sub));
  const body = h('div', { class: 'body' }); const foot = h('div', { class: 'ft' }); root.append(body, foot);
  const save = () => { store.set('setup.' + fmt, st); settings.names = st.names; };
  const render = () => {
    clear(body); clear(foot);
    if (st.mode === 'ai' && !byId(st.decks[1])) { const p = pool(); if (p.length) { st.decks[1] = p[rand32() % p.length].id; save(); } }
    const dsel = st.decks.map(byId);
    body.append(h('div', { class: 'wrap col' },
      h('div', { class: 'seg' }, MODES.map((m) => h('button', { class: 'seg-b' + (st.mode === m.id ? ' on' : ''), onclick: () => { st.mode = m.id; save(); render(); } }, m.t))),
      h('div', { class: 'muted small', style: 'margin:-2px 2px 4px' }, MODES.find((m) => m.id === st.mode).d),
      st.mode === 'ai' ? h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('span', { class: 'muted small' }, 'Stärke der KI:'), Object.entries(AI_LEVELS).map(([id, l]) => h('button', { class: 'chip' + (st.level === id ? ' on' : ''), onclick: () => { st.level = id; save(); render(); } }, l.name))) : null,
      fmt === 'advanced' ? h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Verbotsliste:'), ADV_LISTS.map((l) => h('button', { class: 'chip' + (st.list === l ? ' on' : ''), onclick: () => { st.list = l; st.decks = [null, null]; save(); render(); } }, LIST_NAME[l]))) : null,
      h('div', { class: 'pl-grid' }, [0, 1].map((i) => {
        const d = dsel[i]; const dis = i === 1 && st.mode !== 'hot';
        return h('div', { class: 'panel pl' },
          h('div', { class: 'row' }, h('div', { class: 'pl-num' }, i + 1), h('input', { class: 'input grow', value: st.names[i], maxlength: 18, placeholder: 'Name', oninput: (e) => { st.names[i] = e.target.value; save(); } })),
          h('div', { class: 'muted small', style: 'margin-top:6px' }, i === 1 && st.mode === 'solo' ? 'Übungsgegner (macht nichts)' : i === 1 && st.mode === 'ai' ? 'KI-Gegner · ' + AI_LEVELS[st.level].name : 'Spielt mit:'),
          d ? deckMini(d) : h('div', { class: 'deck-empty' }, 'Noch kein Deck gewählt'),
          h('div', { class: 'row', style: 'margin-top:8px' },
            h('button', { class: 'btn grow ' + (d ? '' : 'pri'), onclick: () => go('decks', { fmt, list: st.list, title: `Deck für ${st.names[i] || 'Spieler ' + (i + 1)}`, onPick: (dk) => { st.decks[i] = dk.id; save(); } }) }, d ? 'Anderes Deck' : 'Deck wählen'),
            h('button', { class: 'btn ghost', title: 'Zufälliges Deck', onclick: () => { const p = pool(); st.decks[i] = p[rand32() % p.length].id; save(); render(); } }, '🎲')));
      })),
      h('div', { class: 'panel row', style: 'flex-wrap:wrap' },
        h('span', { class: 'muted small' }, 'Wer beginnt?'),
        [['random', 'Zufall'], ['0', st.names[0] || 'Spieler 1'], ['1', st.names[1] || 'Spieler 2']].map(([v, t]) => h('button', { class: 'chip' + (st.first === v ? ' on' : ''), onclick: () => { st.first = v; save(); render(); } }, t)),
        h('span', { class: 'grow' }), h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: settings.tutor, onchange: (e) => { settings.tutor = e.target.checked; } }), ' Tutor-Tipps'))));
    foot.append(h('button', { class: 'btn pri lg grow', disabled: !(dsel[0] && dsel[1]), onclick: start }, dsel[0] && dsel[1] ? '⚔  Duell beginnen' : 'Bitte beide Decks wählen'));
  };
  render();
  // nach der Deckwahl zurückkommen → neu zeichnen
  root.refresh = () => { st.decks = (store.get('setup.' + fmt, st).decks) || st.decks; render(); };
  return root;
};
function deckMini(d) {
  const t = withTutor(d).tutor; const art = (t.keys?.bosses?.[0]) || (t.keys?.starters?.[0]) || d.main[0][0];
  return h('div', { class: 'deck-mini' }, cardEl(art, { cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'dm-n' }, d.name), h('div', { class: 'muted small' }, d.sub || d.grp || ''), h('span', { class: 'chip' }, t.style || '')));
}

// ---- Deck wählen ----------------------------------------------------------------
const GROUP_ORDER = ['Meine Decks', 'Beliebte Decks', 'Turnier-Decks', 'Archetypen', 'Mechaniken', 'Master Duel', 'Anime', 'Structure Decks', 'Promo-Decks', 'Starter Decks', 'Weltmeisterschaft', 'Entwürfe'];
export function deckArt(d) { const t = withTutor(d).tutor; return (t.keys?.bosses?.[0]) || (t.keys?.starters?.[0]) || d.main[0]?.[0]; }
screens.decks = ({ fmt, list, title, onPick }) => {
  const f = FORMATS[fmt]; let decks = allDecks(fmt).filter((d) => fmt !== 'advanced' || d.custom || list === 'none' || d.list === list);
  const groups = GROUP_ORDER.filter((g) => decks.some((d) => d.grp === g));
  let grp = groups.includes('Beliebte Decks') ? 'Beliebte Decks' : (decks.some((d) => d.custom) ? 'Meine Decks' : groups.includes('Turnier-Decks') ? 'Turnier-Decks' : groups[0]);
  let sub = null, q = ''; let sortBy = 'name';
  const root = h('div', { class: 'screen' }, hdr(title || 'Deck wählen', FORMAT_INFO[fmt].title + (fmt === 'advanced' ? ' · ' + (list === 'none' ? 'ohne Banlist' : list.toUpperCase()) : '')));
  const top = h('div', { class: 'dk-top' }); const bodyEl = h('div', { class: 'body' }); root.append(top, bodyEl);
  const render = () => {
    clear(top); clear(bodyEl);
    top.append(h('input', { class: 'search', placeholder: `Deck suchen (${decks.length} Decks) …`, value: q, oninput: (e) => { q = e.target.value; renderList(); } }),
      h('div', { class: 'tabs' }, groups.map((g) => h('button', { class: 'chip' + (g === grp && !q ? ' on' : ''), onclick: () => { grp = g; sub = null; q = ''; render(); } }, g + ' (' + decks.filter((d) => d.grp === g).length + ')'))));
    const subs = [...new Set(decks.filter((d) => d.grp === grp).map((d) => d.sub).filter(Boolean))].sort();
    if (!q && subs.length > 1 && subs.length < 60) top.append(h('div', { class: 'tabs' }, h('button', { class: 'chip' + (sub === null ? ' on' : ''), onclick: () => { sub = null; render(); } }, 'Alle'), subs.map((s) => h('button', { class: 'chip' + (sub === s ? ' on' : ''), onclick: () => { sub = s; render(); } }, s.replace(/^\d /, '')))));
    top.append(h('div', { class: 'tabs' }, h('span', { class: 'muted small', style: 'align-self:center' }, 'Sortieren:'), [['name', 'Name'], ['cons', '🎯 Konsistenz']].map(([k, t]) => h('button', { class: 'chip' + (sortBy === k ? ' on' : ''), onclick: () => { sortBy = k; render(); } }, t))));
    renderList();
  };
  const renderList = () => {
    clear(bodyEl);
    let list2 = q ? decks.filter((d) => (d.name + ' ' + (d.sub || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 120) : decks.filter((d) => d.grp === grp && (!sub || d.sub === sub));
    if (sortBy === 'cons') list2 = [...list2].sort((a, b) => ((withTutor(b).tutor.cons?.s ?? -1) - (withTutor(a).tutor.cons?.s ?? -1)));
    if (!list2.length) bodyEl.append(h('div', { class: 'muted', style: 'text-align:center;padding:30px' }, grp === 'Meine Decks' && !q ? 'Noch keine eigenen Decks. In der Deck-Werkstatt kannst du welche bauen.' : 'Nichts gefunden.'));
    bodyEl.append(h('div', { class: 'wrap dk-grid' }, list2.map((d) => deckRow(d, () => openDeck(d)))));
  };
  const openDeck = (d) => {
    const m = openModal({ title: d.name, cls: 'tall', body: deckDetail(d), footer: onPick ? [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Zurück'), h('button', { class: 'btn pri', onclick: () => { m.close(); onPick(d); back(); setTimeout(() => { const el = $('#app .screen'); el && el.refresh && el.refresh(); }, 30); } }, '✓ Dieses Deck nehmen')] : [h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen')] });
  };
  render(); return root;
};
export function deckRow(d, onclick) {
  const t = withTutor(d).tutor; const art = deckArt(d);
  return h('button', { class: 'deck-row', onclick },
    cardEl(art, { cls: 'sm' }),
    h('div', { class: 'grow', style: 'text-align:left' }, h('div', { class: 'dr-n' }, d.name), h('div', { class: 'muted small dr-s' }, [d.sub, t.style].filter(Boolean).join(' · ')),
      h('div', { class: 'row', style: 'gap:6px;margin-top:3px;flex-wrap:wrap' }, d.status === 'angepasst' ? h('span', { class: 'chip warn' }, 'angepasst') : null, d.custom ? h('span', { class: 'chip ok' }, 'eigenes Deck') : null, consChip(t.cons), stat(d) ? h('span', { class: 'chip' }, stat(d)) : null)));
}
const stat = (d) => { const s = store.get('stats', {})[d.id]; return s ? `${s.w}–${s.l}` : ''; };

// ---- Deck-Detail mit Tutor -----------------------------------------------------------
/** Starthand-Test: alleine mit dem Deck üben – Hand ziehen, Combos wie im Duell ausspielen, neu mischen */
export function startTest(deck) {
  const d = withTutor(deck); const fmt = d.fmt || 'advanced'; const lst = fmt === 'advanced' ? (d.list || 'tcg') : (d.list || 'tcg');
  go('duel', { fmt, list: lst, mode: 'solo', test: true, players: [{ name: 'Du', deck: d }, { name: 'Übungsgegner', deck: d }], human: [true, false], lp: settings.lp, tutor: settings.tutor });
}
export function deckDetail(deck, { edit } = {}) {
  withTutor(deck); const t = deck.tutor; const root = h('div', { class: 'ddet' });
  root.append(h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, h('span', { class: 'chip on' }, t.style || 'Deck'), h('span', { class: 'chip' }, count(deck.main) + ' Haupt'), h('span', { class: 'chip' }, count(deck.extra) + ' Extra'), deck.src && !/^http/.test(deck.src) ? h('span', { class: 'chip muted' }, deck.src) : null, deck.status === 'angepasst' ? h('span', { class: 'chip warn' }, 'regelkonform angepasst') : null));
  root.append(h('div', { class: 'tutor panel' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🎓'), h('b', null, 'Tutor: Das Ziel dieses Decks')),
    h('p', { class: 'tut-g' }, t.goal), t.plan?.length ? h('ol', { class: 'tut-p' }, t.plan.map((s) => h('li', null, s))) : null,
    t.hint ? h('p', { class: 'small' }, h('b', null, 'Tipp: '), t.hint) : null, t.weak ? h('p', { class: 'small' }, h('b', null, 'Achtung: '), t.weak) : null));
  try { const cons = consOf(deck); if (cons) root.append(h('div', { class: 'panel' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🎯'), h('b', null, 'Konsistenz')), consBlock(cons))); } catch (e) { /* ohne Bewertung */ }
  if (t.engines && t.engines.length) {
    const ER = [['st', 'Starter', 'starter'], ['ex', 'Verlängerer', 'extender'], ['bo', 'Boss', 'boss'], ['su', 'Support', 'removal']];
    root.append(h('div', { class: 'panel engines' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '⚙'), h('b', null, t.engines.length > 1 ? `Engines in diesem Deck (${t.engines.length})` : 'Engine in diesem Deck')),
      t.engines.map((e, i) => h('div', { class: 'eng' }, h('div', { class: 'eng-n' }, `„${e.n}“`, e.k ? h('span', { class: 'chip' }, e.k) : null, i === 0 && t.engines.length > 1 ? h('span', { class: 'chip on' }, 'Hauptengine') : null),
        h('div', { class: 'keycards' }, ER.flatMap(([k, label, role]) => (e[k] || []).slice(0, 3).map((c) => h('button', { class: 'keyc', onclick: () => showCard(c) }, cardEl(c, { cls: 'md' }), h('span', { class: 'role ' + role }, label))))))),
      t.bridges && t.bridges.length ? h('div', { class: 'eng bridges' }, h('div', { class: 'eng-n' }, '🔗 Brücken'), h('div', { class: 'keycards' }, t.bridges.map((b) => h('button', { class: 'keyc', onclick: () => showCard(b.c) }, cardEl(b.c, { cls: 'md' }), h('span', { class: 'role bridge' }, 'Brücke')))), h('ul', { class: 'small muted' }, t.bridges.map((b) => h('li', null, h('b', null, nameOf(b.c)), ': ' + b.w)))) : null));
  }
  const keys = t.keys || {}; const rows = [['starters', 'Starter – bringen die Combo ins Rollen', 'starter'], ['extenders', 'Verlängerer – bringen mehr Monster ins Spiel', 'extender'], ['bosses', 'Bosse – dein Endziel', 'boss'], ['handtraps', 'Handtraps – nur im Zug des Gegners', 'handtrap'], ['removal', 'Entferner & Fallen – räumen Hindernisse', 'removal']];
  for (const [k, label, role] of rows) if (keys[k]?.length) root.append(h('div', { class: 'keyrow' }, h('div', { class: 'small muted' }, label), h('div', { class: 'keycards' }, keys[k].slice(0, 6).map((c) => h('button', { class: 'keyc', onclick: () => showCard(c) }, cardEl(c, { cls: 'md' }), h('span', { class: 'role ' + role }, ROLE_DE[role] || role))))));
  const hp = handtrapPlan(keys.handtraps || [], App.cards);
  if (hp.length) root.append(h('div', { class: 'panel' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🛑'), h('b', null, 'Blockieren – Handtraps richtig einsetzen')),
    h('p', { class: 'small' }, 'Stoppe den ersten wichtigen Schritt des Gegners (Starter, Sucheffekt): Wird er blockiert, fallen alle Kettenglieder weg, die darauf aufbauen. Im Duell sagt dir der Tutor (💡), ob sich das Blockieren gerade lohnt.'),
    h('ul', { class: 'small' }, hp.map((x) => h('li', null, h('b', null, nameOf(x.code)), ': ' + x.when)))));
  const sec = [['main', 'Hauptdeck'], ['extra', 'Extradeck'], ['side', 'Sidedeck']];
  for (const [k, label] of sec) if (deck[k]?.length) {
    root.append(h('h4', { class: 'dsec' }, `${label} (${count(deck[k])})`));
    const sorted = [...deck[k]].sort((a, b) => { const A = cardOf(a[0]), B = cardOf(b[0]); const ka = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'token', 'spell', 'trap'].indexOf(kind(A)), kb = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'token', 'spell', 'trap'].indexOf(kind(B)); return ka - kb || cleanName(A?.name || '').localeCompare(cleanName(B?.name || '')); });
    root.append(h('div', { class: 'dgrid' }, sorted.flatMap(([c, n]) => Array.from({ length: n }, () => h('button', { class: 'dg-c', onclick: () => showCard(c) }, cardEl(c, { cls: 'sm' }), isOcg(cardOf(c)) && deck.list !== 'none' && deck.list !== 'ocg' ? ocgTag() : null)))));
  }
  if (deck.repairs?.length) root.append(h('details', { class: 'panel', style: 'margin-top:10px' }, h('summary', null, 'Was wurde angepasst? (' + deck.repairs.length + ')'), h('ul', { class: 'small muted' }, deck.repairs.map((r) => h('li', null, r)))));
  root.append(h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:wrap' },
    h('button', { class: 'btn', onclick: () => testHand(deck) }, '🖐 Probehand ziehen'),
    h('button', { class: 'btn', onclick: () => startTest(deck) }, '🧪 Starthand-Test'),
    h('button', { class: 'btn ghost', onclick: () => { const d = { ...structuredClone(deck), id: undefined, name: deck.name + ' (eigene Version)' }; go('editor', { deck: d }); } }, '✎ Im Editor anpassen')));
  const s = store.get('stats', {})[deck.id]; if (s) root.append(h('p', { class: 'small muted' }, `Deine Bilanz mit diesem Deck: ${s.w} Siege, ${s.l} Niederlagen.`));
  return root;
}
export function handComment(codes, deck) {
  const k = deck.tutor?.keys || {}; const nm = (c) => nameOf(c); const has = (arr) => codes.filter((c) => (arr || []).includes(c));
  const st = has(k.starters), ex = has(k.extenders), ht = has(k.handtraps), rm = has(k.removal), bo = has(k.bosses);
  const out = [];
  if (st.length) out.push(`Gute Hand: Mit ${[...new Set(st)].map(nm).join(' und ')} kannst du deine Combo starten.`); else if (ex.length) out.push(`Kein richtiger Starter, aber ${[...new Set(ex)].map(nm).join(' und ')} kann dir weiterhelfen.`); else out.push('Keine Combo-Karte in der Hand – spiele ruhig: ein Monster setzen oder normal beschwören und Fallen setzen.');
  if (ht.length) out.push(`${[...new Set(ht)].map(nm).join(', ')}: nicht in deinem Zug ausspielen – halte sie zurück und nutze sie, wenn der Gegner etwas tut.`);
  if (rm.length) out.push(`${[...new Set(rm)].map(nm).join(', ')} räumt Karten des Gegners ab.`);
  if (bo.length) out.push(`${[...new Set(bo)].map(nm).join(', ')} ist ein starkes Monster – du brauchst Opfer oder Material dafür.`);
  return out;
}
function testHand(deck) {
  const draw = () => shuffled(expand(deck.main)).slice(0, 5);
  let hand = draw(); const body = h('div'); const m = openModal({ title: 'Probehand', body, footer: [h('button', { class: 'btn ghost', onclick: () => { hand = draw(); paint(); } }, '↻ Neu ziehen'), h('button', { class: 'btn', onclick: () => m.close() }, 'Fertig')] });
  const paint = () => { clear(body); body.append(h('div', { class: 'hand-row' }, hand.map((c) => h('button', { onclick: () => showCard(c) }, cardEl(c, { cls: 'md' })))), h('div', { class: 'tutor panel', style: 'margin-top:12px' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🎓'), h('b', null, 'Was sagt der Tutor?')), handComment(hand, deck).map((s) => h('p', { class: 'small' }, s)))); };
  paint();
}

// ---- Lernen --------------------------------------------------------------------------------
const LEARN = [
  ['Das Ziel des Spiels', 'Beide Spieler starten mit 8000 Lebenspunkten (LP). Du gewinnst, wenn die Lebenspunkte deines Gegners auf 0 sinken. Du verlierst auch, wenn du keine Karte mehr ziehen kannst. Manche Decks haben Spezial-Siege (zum Beispiel Exodia).'],
  ['Das Spielfeld', 'Jede Seite hat 5 Monsterzonen und 5 Zauber-/Fallenzonen, dazu die Feldzone (für Feldzauber), den Friedhof, das Deck und – bei neueren Regeln – das Extradeck. In der modernen Variante gibt es außerdem zwei gemeinsame Extra-Monsterzonen in der Mitte. Verbannte Karten liegen aus dem Spiel.'],
  ['Der Zug in Phasen', '1) Ziehphase: du ziehst 1 Karte. 2) Standby-Phase: wenige Effekte lösen aus. 3) Main Phase 1: Hier spielst du fast alles. 4) Kampfphase: deine Monster greifen an. 5) Main Phase 2: nach dem Kampf darfst du noch Karten spielen. 6) End Phase: Zug endet, bei mehr als 6 Handkarten wirfst du ab. Wer beginnt, darf im ersten Zug nicht angreifen und zieht nicht.'],
  ['Monster beschwören', 'Einmal pro Zug darfst du ein Monster normal beschwören (Stufe 1–4 ohne Opfer, Stufe 5–6 mit 1 Opfer, Stufe 7+ mit 2 Opfern) oder verdeckt setzen. Zusätzlich gibt es beliebig viele Spezialbeschwörungen durch Karteneffekte – zum Beispiel aus dem Extradeck.'],
  ['Zauber & Fallen', 'Zauberkarten spielst du in deinem Zug offen aus (Schnell-Zauber auch im Zug des Gegners, wenn sie vorher verdeckt gesetzt waren). Fallen musst du erst verdeckt setzen und können frühestens im nächsten Zug aktiviert werden – dann aber auch im Zug des Gegners.'],
  ['Kämpfen', 'Dein Monster in Angriffsposition greift ein gegnerisches Monster an: Das Monster mit mehr ATK gewinnt, das schwächere wird zerstört, und der Besitzer erleidet die Differenz als Schaden. Gegen ein Monster in Verteidigung vergleicht man ATK mit VER; es gibt nur Schaden, wenn eine Spezialfähigkeit das erlaubt. Hat der Gegner kein Monster, greifst du direkt an.'],
  ['Ketten & Antworten', 'Aktivierst du eine Karte, darf der Gegner darauf antworten (Kette). Die zuletzt aktivierte Karte wird zuerst abgehandelt. Deshalb fragt das Spiel dich bei jeder Aktion des Gegners, ob du eine Karte aktivieren möchtest – nur, wenn überhaupt etwas möglich ist.'],
  ['Das Extradeck', 'Bis zu 15 starke Monster (Fusion, Synchro, Xyz, Link) liegen im Extradeck. Sie werden nicht gezogen, sondern mit Material vom Feld beschworen. Tippe im Duell auf dein Extradeck, um zu sehen, welche Monster du gerade rufen kannst.'],
  ['Begriffe', 'Starter: Karte, die deine Combo beginnt. Boss: dein stärkstes Monster. Handtrap: Monster, das du aus der Hand im Zug des Gegners nutzt. Tribut: Monster, das du für eine starke Beschwörung opferst. Material: Monster, die für Extradeck-Beschwörungen verbraucht werden. Friedhof (GY): Ablage zerstörter Karten.'],
];
screens.learn = () => h('div', { class: 'screen' }, hdr('Lernen & Regeln', 'In wenigen Minuten spielbereit'),
  h('div', { class: 'body' }, h('div', { class: 'wrap col' },
    h('div', { class: 'panel tutor' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🎓'), h('b', null, 'So lernst du am schnellsten')), h('p', null, 'Wähle zuerst das Format „Goat“ oder „Edison“ und ein einfaches Deck – hier ist das Spiel langsam und gut zu verstehen. Spiele „Allein üben“, damit der Gegner stillhält. Der Tutor sagt dir bei jedem Deck das Ziel und schlägt dir im Duell Züge vor.')),
    LEARN.map(([t, x], i) => h('details', { class: 'panel', open: i === 0 }, h('summary', null, t), h('p', { class: 'small' }, x))))));

// ---- Einstellungen ----------------------------------------------------------------------------------
screens.settings = () => {
  const root = h('div', { class: 'screen' }, hdr('Einstellungen')); const body = h('div', { class: 'body' }); root.append(body);
  const paint = async () => {
    clear(body); const n = await idbCount(); const si = await storageInfo(); const mbOf = (x) => Math.round(x / 1048576); const deckCodes = () => { const s = new Set(); for (const d of allDecks()) for (const sec of ['main', 'extra', 'side']) for (const [c] of (d[sec] || [])) s.add(c); return s; };
    const tog = (label, sub, get, set) => h('label', { class: 'panel row set-row' }, h('div', { class: 'grow' }, h('div', null, label), h('div', { class: 'muted small' }, sub)), h('input', { type: 'checkbox', class: 'sw', checked: get(), onchange: (e) => { set(e.target.checked); } }));
    body.append(h('div', { class: 'wrap col' },
      tog('Kartenbilder', 'Bilder werden bei Internet einmal geladen und auf dem Gerät gemerkt. Ohne Bilder erscheinen gezeichnete Karten.', () => imgCfg.images, (v) => setImages(v)),
      tog('Tutor-Tipps im Duell', 'Zeigt einen Lampen-Knopf mit Zugvorschlägen.', () => settings.tutor, (v) => { settings.tutor = v; }),
      App.de ? tog('Kartentexte auf Deutsch', 'Kartennamen und Effekttexte in deutscher Sprache (aus), um die englischen Originale zu sehen.', () => App.lang !== 'en', (v) => { App.lang = v ? 'de' : 'en'; store.set('lang', App.lang); }) : null,
      tog('Töne', 'Kleine Effekte bei Aktionen.', () => sound.on, (v) => { sound.on = v; store.set('sound', v); }),
      h('div', { class: 'panel col' }, h('b', null, 'Startlebenspunkte'), h('div', { class: 'row' }, [4000, 8000, 16000].map((v) => h('button', { class: 'chip' + (settings.lp === v ? ' on' : ''), onclick: () => { settings.lp = v; paint(); } }, v)))),
      h('div', { class: 'panel col' }, h('b', null, 'Widmung auf dem Startbildschirm'), h('input', { class: 'input', value: settings.dedication, maxlength: 60, oninput: (e) => { settings.dedication = e.target.value; } })),
      h('div', { class: 'panel col' }, h('b', null, 'Bilder für Offline-Betrieb vorladen'), h('div', { class: 'muted small' }, `${n} Bilder auf diesem Gerät gespeichert. Lade alle Karten auf einmal (unabhängig vom Format) oder nur die Beliebt-/Turnier-Decks eines Formats (ca. 15 KB je Karte).`),
        h('div', { class: 'small', style: 'color:' + (si.persisted ? 'var(--ok,#6c6)' : 'var(--warn,#e9b44c)') }, si.persisted ? '🔒 Speicher dauerhaft gesichert – der Browser löscht die Bilder nicht von selbst.' : '⚠️ Speicher nicht gesichert – der Browser darf Bilder bei Platzmangel oder nach einigen Tagen ohne Nutzung löschen. Auf dem iPhone: Seite über „Teilen → Zum Home-Bildschirm“ als App ablegen, dann bleibt alles erhalten.'), si.quota ? h('div', { class: 'muted small' }, `Belegt: ${mbOf(si.used)} MB von ca. ${mbOf(si.quota)} MB erlaubt.`) : null,
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, [['Alle Decks aller Formate', 'alle Karten, die in irgendeinem Deck vorkommen', () => deckCodes()], ['Wirklich alle Karten', 'alle Karten der Datenbank – für eigene Decks mit beliebigen Karten', () => { const s = deckCodes(); for (const c of App.cards.values()) if (!(c.type & 0x4000)) s.add(c.code); return s; }]].map(([label, what, get]) => h('button', { class: 'btn sm pri', onclick: async (e) => {
          const b = e.currentTarget; if (b._ctl) { b._ctl.stop = true; return; } // zweiter Tipp = abbrechen
          const codes = [...get()]; const n = new Set(codes.map(imageId)).size; const mb = Math.round(n * 15 / 1024);
          if (!(await confirmBox(`${label} laden?`, `${n} Karten (${what}), ca. ${mb} MB. Am besten im WLAN und mit Strom. Schon gespeicherte Bilder werden übersprungen. Du kannst jederzeit abbrechen (Knopf nochmal antippen) und später weitermachen.`, 'Laden', 'Abbrechen'))) return;
          const ctl = { stop: false }; b._ctl = ctl; const r = await preload(codes, (a, t) => { b.textContent = `${Math.round(a / t * 100)} % · tippen = stopp`; }, ctl); b._ctl = null; const had = await idbCount();
          toast(r.stopped ? `Gestoppt – ${r.ok} Bilder gespeichert. Du kannst später weitermachen.` : `${r.ok} von ${r.total} Bildern gespeichert (jetzt ${had} auf dem Gerät)` + (r.ok < r.total ? ' – manche Karten haben kein Bild oder es gab keine Verbindung.' : '')); paint();
        } }, label))),
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, ['goat', 'edison', 'advanced', 'genesys', 'speed'].map((f) => h('button', { class: 'btn sm', onclick: async (e) => { const b = e.currentTarget; const codes = new Set(); for (const d of allDecks(f).filter((x) => x.grp === 'Beliebte Decks' || x.grp === 'Turnier-Decks' || x.custom || f === 'speed')) for (const s of ['main', 'extra']) for (const [c] of d[s]) codes.add(c); b.disabled = true; const r = await preload([...codes], (a, t) => { b.textContent = `${a}/${t}`; }); b.textContent = FORMAT_INFO[f].title; b.disabled = false; toast(`${r.ok} von ${r.total} Bildern gespeichert` + (r.ok < r.total ? ' – ohne Internet nicht möglich?' : '')); paint(); } }, FORMAT_INFO[f].title)))),
      lockOn() ? h('div', { class: 'panel col' }, h('b', null, 'App-Sperre'), h('div', { class: 'muted small' }, 'Dieses Gerät ist freigeschaltet. Nach dem Sperren fragt die App beim nächsten Start wieder nach dem Passwort.'), h('button', { class: 'btn sm', onclick: relock }, '🔒 Jetzt sperren')) : null,
      h('div', { class: 'panel col' }, h('b', null, 'Eigene Decks'), h('div', { class: 'muted small' }, customDecks().length + ' gespeichert (nur auf diesem Gerät).'),
        h('button', { class: 'btn red sm', onclick: async () => { if (await confirmBox('Alle eigenen Decks löschen?', 'Das kann nicht rückgängig gemacht werden.', 'Löschen', 'Abbrechen', true)) { customDecks().forEach((d) => deleteCustom(d.id)); paint(); } } }, 'Alle eigenen Decks löschen')),
      h('div', { class: 'muted small', style: 'padding:6px' }, 'Spielkern: EDOPro-Kern (ocgcore) als WebAssembly · Regeln und Kartenskripte stammen aus dem Project-Ignis-Projekt · Deck-Sammlungen aus frei zugänglichen Quellen.')));
  };
  paint(); return root;
};
