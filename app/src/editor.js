// Deck-Werkstatt: eigene Decks bauen, Ziehen & Ablegen aus allen Karten, Prüfung je Format
import { h, $, clear, toast, uid } from './util.js';
import { App, FORMAT_INFO, FORMATS, fmtById, allDecks, customDecks, saveCustom, deleteCustom, withTutor, nameOf, cardOf, cleanName, count, expand, toFmtCode, toPlainCode, goatMaps, consOf, limitOf, ADV_LISTS, LIST_NAME, descOf, searchName, useDe } from './data.js';
import { suggest, profile } from '../../src/konsistenz.mjs';
import { handtrapInfo, TIER_TEXT, TIER_SHORT } from '../../src/handtraps.mjs';
import { roleOf, ROLE_DE } from '../../src/tutor.mjs';
import { matches } from '../../src/goals.mjs';
import { consBlock } from './cons.js';
import { cardEl, isOcg, ocgTag } from './cards.js';
import { openModal, confirmBox, cardInfoBody } from './ui.js';
import { go, back, replace, screens, setGuard, setParams } from './nav.js';
import { store } from './store.js';
import { validate, repair, allowed, points, deckPoints, isExtra } from '../../src/decks.mjs';
import { kind, typeText, levelText, attrName, statsText, ATTR_BITS } from './strings.js';
import { enableDnd } from './dnd.js';
import { deckRow, deckDetail, startTest } from './screens.js';

const KO = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'token', 'spell', 'trap'];
const put = (l, c, n = 1) => { const e = l.find((x) => x[0] === c); if (e) e[1] += n; else l.push([c, n]); };
const take = (l, c, n = 1) => { const i = l.findIndex((x) => x[0] === c); if (i < 0) return 0; const t = Math.min(n, l[i][1]); l[i][1] -= t; if (l[i][1] <= 0) l.splice(i, 1); return t; };
const num = (l, c) => (l.find((x) => x[0] === c) || [0, 0])[1];
const clone = (l) => (l || []).map((e) => [...e]);
const ROLE_ORDER = { starter: 0, extender: 1, draw: 2, removal: 3, boss: 4, handtrap: 5, trap: 6, material: 7, other: 8 };
// ---- Sortieren (Kartenvorrat und Deck getrennt einstellbar, wird auf dem Gerät gemerkt) ------------------------------
export const SORT_KEYS = [['auto', 'Automatisch'], ['std', 'Standard'], ['name', 'Name'], ['level', 'Stufe / Rang'], ['atk', 'ATK'], ['def', 'Verteidigung'], ['attr', 'Attribut'], ['type', 'Kartenart'], ['role', 'Rolle im Deck']];
const NATURAL = { auto: 1, std: 1, name: 1, level: -1, atk: -1, def: -1, attr: 1, type: 1, role: 1 }; // -1 = hoch → niedrig
const SORTS = { pool: { k: 'auto', d: 1 }, deck: { k: 'std', d: 1 } };
const numKey = (k, c) => { if (!(c.type & 1)) return null; if (k === 'level') return c.level & 0xff; if (k === 'atk') return c.attack >= 0 ? c.attack : null; if (k === 'def') return (c.type & 0x4000000) || c.defense < 0 ? null : c.defense; return null; };
function sortKey(k, c) {
  switch (k) {
    case 'name': return cleanName(c.name);
    case 'level': case 'atk': case 'def': return numKey(k, c);
    case 'attr': return (c.type & 1) && c.attribute ? Math.log2(c.attribute & -c.attribute) : 99;
    case 'type': case 'std': return KO.indexOf(kind(c));
    case 'role': return ROLE_ORDER[roleOf(c)] ?? 9;
    default: return 0;
  }
}
/** Sortiert Einträge (Schlüssel einmal berechnen); Karten ohne Wert (z. B. Zauber bei ATK) stehen immer hinten */
function sortItems(items, cardOfItem, mode) {
  const k = mode.k === 'auto' ? 'name' : mode.k, d = mode.d;
  const dec = items.map((it) => { const c = cardOfItem(it); return { it, key: sortKey(k, c), nm: cleanName(c?.name || '') }; });
  dec.sort((a, b) => {
    const na = a.key === null, nb = b.key === null; if (na !== nb) return na ? 1 : -1;
    let r = typeof a.key === 'string' ? a.key.localeCompare(b.key) : (a.key || 0) - (b.key || 0); r *= d; if (r) return r;
    return a.nm.localeCompare(b.nm);
  });
  return dec.map((x) => x.it);
}
const sortList = (l) => { const m = SORTS.deck; return sortItems(l, (e) => cardOf(e[0]), m.k === 'std' ? { k: 'type', d: 1 } : m); };

// ---- Kartenvorrat je Format -----------------------------------------------------------------------
const pools = new Map();
export function poolFor(fmtId) {
  if (pools.has(fmtId)) return pools.get(fmtId);
  const gm = goatMaps(); const out = []; const L = App.lists;
  for (const c of App.cards.values()) {
    if (c.type & 0x4000) continue; const isG = c.code >= 504700000 && c.code < 504800000;
    if (fmtId === 'goat') { if (!(L.goat.map[c.code] > 0)) continue; if (gm.to.has(c.code)) continue; if (!isG && c.alias) continue; /* Alternativ-Artwork derselben Karte nicht doppelt zeigen */ } else { if (isG || c.alias) continue; if (fmtId === 'speed' && !(L.speed.map[c.code] > 0)) continue; }
    if (fmtId === 'edison' && (c.type & (0x800000 | 0x4000000 | 0x1000000))) continue;
    if (fmtId === 'genesys' && (c.type & (0x4000000 | 0x1000000))) continue;
    if (!(c.type & 7)) continue;
    out.push({ c, ln: searchName(c) });
  }
  for (const e of out) e.sk = cleanName(e.c.name); out.sort((a, b) => a.sk.localeCompare(b.sk)); pools.set(fmtId, out); return out;
}

// ---- Werkstatt-Übersicht -----------------------------------------------------------------------------
screens.workshop = () => {
  const root = h('div', { class: 'screen' }, h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: () => back() }, '←'), h('h2', null, 'Deck-Werkstatt', h('div', { class: 'sub' }, 'Eigene Decks bauen und anpassen'))));
  const body = h('div', { class: 'body' }); root.append(body);
  const paint = () => {
    clear(body); const mine = customDecks();
    body.append(h('div', { class: 'wrap col' },
      h('div', { class: 'row', style: 'flex-wrap:wrap' },
        h('button', { class: 'btn pri', onclick: () => pickFormat((f) => go('editor', { fmt: f })) }, '＋ Neues Deck'),
        h('button', { class: 'btn', onclick: () => pickFormat((f) => go('decks', { fmt: f, list: f === 'advanced' ? 'tcg' : f, title: 'Als Vorlage kopieren', onPick: (d) => setTimeout(() => go('editor', { deck: { ...structuredClone(d), id: undefined, name: d.name + ' (Kopie)' } }), 60) })) }, '⧉ Aus Sammlung kopieren'),
        h('button', { class: 'btn', onclick: () => pickFormat((f) => importDialog(f, (d) => go('editor', { deck: d }))) }, '⇪ .ydk importieren')),
      h('p', { class: 'muted small' }, 'Tipp: Die Decks, die ihr wirklich zuhause habt, baut ihr hier nach – per Ziehen & Ablegen aus allen Karten. Gespeicherte Decks erscheinen beim Duell unter „Meine Decks“.'),
      mine.length ? h('div', { class: 'dk-grid' }, mine.map((d) => h('div', { class: 'col', style: 'gap:4px' }, deckRow({ ...d, grp: 'Meine Decks' }, () => go('editor', { deck: d })),
        h('div', { class: 'row small muted', style: 'padding:0 6px' }, h('span', { class: 'grow' }, `${FORMAT_INFO[d.fmt].title} · ${count(d.main)}/${count(d.extra)}/${count(d.side)}`), h('button', { class: 'chip', onclick: async () => { if (await confirmBox('Deck löschen?', `„${d.name}“ wirklich löschen?`, 'Löschen', 'Abbrechen', true)) { deleteCustom(d.id); paint(); } } }, '🗑'))))) : h('div', { class: 'deck-empty' }, 'Noch keine eigenen Decks.')));
  };
  paint(); return root;
};
function pickFormat(cb) {
  const m = openModal({ title: 'Für welches Format?', center: true, body: h('div', { class: 'col' }, ['goat', 'edison', 'advanced', 'genesys', 'speed'].map((f) => h('button', { class: 'btn', style: 'justify-content:flex-start', onclick: () => { m.close(); cb(f); } }, FORMAT_INFO[f].icon + '  ' + FORMAT_INFO[f].title + ' – ' + FORMAT_INFO[f].sub))) });
}

// ---- .ydk Import/Export --------------------------------------------------------------------------------------
export function parseYdk(text, fmtId) {
  const d = { main: [], extra: [], side: [] }; let sec = 'main'; const unknown = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim(); if (!t) continue;
    if (/^#main/i.test(t)) { sec = 'main'; continue; } if (/^#extra/i.test(t)) { sec = 'extra'; continue; } if (/^!side/i.test(t)) { sec = 'side'; continue; } if (t[0] === '#' || t[0] === '!') continue;
    const code = parseInt(t, 10); if (!code) continue; const c = toFmtCode(code, fmtId);
    if (!App.cards.get(c)) { unknown.push(code); continue; } put(d[sec], c, 1);
  }
  return { deck: d, unknown };
}
export const toYdk = (d) => { const p = (l) => expand(l).map((c) => toPlainCode(c)).join('\n'); return `#created by Duellraum\n#main\n${p(d.main)}\n#extra\n${p(d.extra)}\n!side\n${p(d.side)}\n`; };
function importDialog(fmtId, done) {
  const ta = h('textarea', { class: 'input', style: 'width:100%;height:160px;padding:10px', placeholder: 'Hier den Inhalt einer .ydk-Datei einfügen …' });
  const file = h('input', { type: 'file', accept: '.ydk,.txt', style: 'display:none', onchange: async (e) => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } });
  const m = openModal({ title: '.ydk importieren', body: h('div', { class: 'col' }, h('p', { class: 'small muted' }, 'Wähle eine Datei oder füge den Text ein. Karten, die es nicht gibt, werden übersprungen.'), file, h('button', { class: 'btn', onclick: () => file.click() }, '📂 Datei wählen'), ta), footer: h('button', { class: 'btn pri', onclick: () => { const r = parseYdk(ta.value, fmtId); if (!count(r.deck.main) && !count(r.deck.extra)) { toast('Keine Karten gefunden.'); return; } m.close(); if (r.unknown.length) toast(`${r.unknown.length} unbekannte Karte(n) übersprungen`); done({ name: 'Importiertes Deck', fmt: fmtId, list: fmtId === 'advanced' ? 'tcg' : fmtId, ...r.deck }); } }, 'Importieren') });
}

// ---- Editor ----------------------------------------------------------------------------------------------------------
screens.editor = (params = {}) => {
  const src = params.deck || {}; const S = { id: src.id || 'my-' + uid(), saved: !!src.id && customDecks().some((d) => d.id === src.id), name: src.name || 'Mein Deck', fmt: src.fmt || params.fmt || 'advanced', list: src.list || 'tcg', main: clone(src.main), extra: clone(src.extra), side: clone(src.side), dirty: params.dirty ?? !src.id };
  if (S.fmt === 'goat') { for (const k of ['main', 'extra', 'side']) S[k] = S[k].map(([c, n]) => [toFmtCode(c, 'goat'), n]); }
  try { const sv = store.get('ed.sort', null); if (sv && sv.pool && sv.deck) { Object.assign(SORTS.pool, sv.pool); Object.assign(SORTS.deck, sv.deck); } } catch (e) { /* Standard */ }
  const F = { q: '', type: 'all', attr: 0, lvl: 'all', sub: 'all', legal: true, more: false, ocg: 'all', rec: false, ht: 0, eng: null }; let split = 1; let sel = null;
  let CONS = null, REC = null, recSet = new Set(), recT = 0;
  const fmt = () => fmtById(S.fmt, S.fmt === 'advanced' ? S.list : undefined);
  const lim = (code) => allowed(code, fmt(), App.lists);
  const totalOf = (code) => num(S.main, code) + num(S.extra, code) + num(S.side, code);
  const root = h('div', { class: 'screen ed' });
  const nameIn = h('input', { class: 'input ed-name', value: S.name, maxlength: 40, oninput: (e) => { S.name = e.target.value; S.dirty = true; } });
  const status = h('div', { class: 'ed-status' }); const deckPane = h('div', { class: 'ed-deck ed-scroll', 'data-zone': 'none' }); const poolBox = h('div', { class: 'ed-pool', 'data-zone': 'pool' }); const poolList = h('div', { class: 'ed-grid ed-scroll' }); const dock = h('div', { class: 'ed-dock' });
  const split1 = h('div', { class: 'ed-split s1' }, deckPane, poolBox);
  root.append(h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: () => back() }, '←'), nameIn, h('button', { class: 'btn sm pri', onclick: () => save() }, '💾'), h('button', { class: 'ibtn', onclick: () => menu() }, '⋯')), status, split1, dock);

  // ---- Format-Zeile & Prüfung
  const issues = () => validate({ main: S.main, extra: S.extra, side: S.side }, fmt(), App.cards, App.lists);
  const paintStatus = () => {
    const iss = issues(); const pts = deckPoints(S, App.lists); clear(status);
    status.append(h('div', { class: 'tabs' }, ['goat', 'edison', 'advanced', 'genesys', 'speed'].map((f) => h('button', { class: 'chip' + (S.fmt === f ? ' on' : ''), onclick: () => switchFmt(f) }, FORMAT_INFO[f].title)), S.fmt === 'advanced' ? ADV_LISTS.map((l) => h('button', { class: 'chip' + (S.list === l ? ' on' : ''), onclick: () => { S.list = l; S.dirty = true; paint(); } }, LIST_NAME[l])) : null),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, h('span', { class: 'chip ' + (count(S.main) >= FORMATS[S.fmt].minMain && count(S.main) <= FORMATS[S.fmt].maxMain ? 'ok' : 'bad') }, `Haupt ${count(S.main)}`), h('span', { class: 'chip ' + (count(S.extra) <= FORMATS[S.fmt].maxExtra ? 'ok' : 'bad') }, `Extra ${count(S.extra)}`), h('span', { class: 'chip ' + (count(S.side) <= FORMATS[S.fmt].maxSide ? 'ok' : 'bad') }, `Side ${count(S.side)}`), S.fmt === 'genesys' ? h('span', { class: 'chip ' + (pts <= 100 ? 'ok' : 'bad') }, `${pts}/100 Punkte`) : null,
        ocgN() ? h('button', { class: 'chip ' + (S.fmt === 'advanced' && S.list === 'tcg' ? 'warn' : ''), onclick: showOcg }, `OCG ${ocgN()}`) : null,
        CONS ? h('button', { class: 'chip ' + CONS.tone, title: 'Konsistenz', onclick: () => showCons() }, '🎯 ' + CONS.score) : null,
        h('button', { class: 'chip ' + (iss.length ? 'warn' : 'ok'), onclick: () => showIssues() }, iss.length ? `⚠ ${iss.length} Hinweis${iss.length > 1 ? 'e' : ''}` : '✓ spielbar'), h('button', { class: 'chip' + (SORTS.pool.k !== 'auto' || SORTS.deck.k !== 'std' ? ' on' : ''), title: 'Sortieren', onclick: () => sortDialog() }, '⇅ Sortieren'), h('button', { class: 'chip', title: 'Aufteilung Deck / Kartenvorrat', onclick: () => { split = (split + 1) % 3; split1.className = 'ed-split s' + split; } }, '⇕')));
  };
  const ocgCodes = () => [...new Set(['main', 'extra', 'side'].flatMap((z) => S[z].map((e) => e[0])))].filter((c) => isOcg(cardOf(c)));
  const ocgN = () => ocgCodes().reduce((n, c) => n + totalOf(c), 0);
  // ---- Konsistenz & Empfehlungen
  const deckObj = () => ({ fmt: S.fmt, list: S.list, name: S.name, main: S.main, extra: S.extra, side: S.side });
  const calcCons = () => { try { CONS = count(S.main) >= 10 ? consOf(deckObj()) : null; } catch (e) { CONS = null; } };
  const markRec = () => { for (const e of poolList.querySelectorAll('.pc')) e.classList.toggle('rec', recSet.has(+e.dataset.code)); };
  const recalcNow = () => {
    clearTimeout(recT);
    try { REC = count(S.main) >= 10 ? suggest(deckObj(), App.cards, App.strings && App.strings.setname, { limOf: limitOf(deckObj()), can: (c) => totalOf(c) < lim(c), pool: poolFor(S.fmt), max: 6, fmtId: S.fmt }) : null; } catch (e) { REC = null; }
    recSet = new Set(REC ? REC.codes : []); markRec();
  };
  const scheduleRec = () => { clearTimeout(recT); recT = setTimeout(() => { if (document.body.classList.contains('dragging')) { scheduleRec(); return; } recalcNow(); }, 450); };
  function showCons() {
    if (!CONS) { toast('Lege zuerst mindestens 10 Karten ins Hauptdeck – dann kann ich die Konsistenz bewerten.', 3500); return; }
    const body = h('div'); const nmOf = (c) => cleanName(cardOf(c)?.name);
    const m = openModal({ title: 'Konsistenz', cls: 'tall', body, footer: [h('button', { class: 'btn', onclick: () => { m.close(); F.rec = true; recalcNow(); paintFilters(); applyFilter(); } }, '★ Im Kartenvorrat zeigen'), h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK')] });
    const row = (code, why, gain, extra, btns) => h('div', { class: 'rec-row' }, h('div', { class: 'rec-c' }, cardEl(code, { cls: 'md' })), h('div', { class: 'grow' }, h('div', { class: 'rec-n' }, nmOf(code), gain >= 0.5 ? h('span', { class: 'chip ok' }, '+' + Math.max(1, Math.round(gain)) + ' Punkte') : null), h('div', { class: 'small' }, why), extra ? h('div', { class: 'small muted' }, extra) : null, h('div', { class: 'row', style: 'margin-top:6px;gap:6px;flex-wrap:wrap' }, btns)));
    const after = () => { calcCons(); recalcNow(); paintModal(); };
    const doAdd = (a) => { if (!add('main', a.code, true)) return; if (a.cut) take(S.main, a.cut, 1); S.dirty = true; paint(); after(); toast(a.cut ? `Getauscht: + ${nmOf(a.code)}, − ${nmOf(a.cut)}` : `+ ${nmOf(a.code)}`); };
    const paintModal = () => {
      clear(body); if (!CONS) { body.append(h('p', null, 'Zu wenige Karten für eine Bewertung.')); return; }
      body.append(consBlock(CONS));
      if (!REC) return;
      body.append(h('h4', { class: 'dsec' }, '★ Empfohlen – erhöht die Konsistenz'));
      if (REC.add.length) REC.add.forEach((a) => body.append(row(a.code, a.why, a.gain, a.cut ? `Tausch gegen ${nmOf(a.cut)} – ${a.cutWhy}.` : '', [h('button', { class: 'btn sm pri', onclick: () => doAdd(a) }, a.cut ? '⇄ Tauschen' : '＋ Hinzufügen'), h('button', { class: 'btn sm ghost', onclick: () => { m.close(); openDock(a.code, 'pool'); } }, 'Karte ansehen')])));
      else body.append(h('p', { class: 'small muted' }, 'Keine weitere Karte würde die Konsistenz deutlich erhöhen – oder es gibt keinen sinnvollen Tausch. Prüfe die Hinweise oben.'));
      if (REC.prot.length) { body.append(h('h4', { class: 'dsec' }, '🛡 Schutz im Zug des Gegners')); REC.prot.forEach((a) => body.append(row(a.code, a.why, 0, '', [h('button', { class: 'btn sm', onclick: () => { if (add('main', a.code, true)) { S.dirty = true; paint(); after(); } } }, '＋ Hinzufügen'), h('button', { class: 'btn sm ghost', onclick: () => { m.close(); openDock(a.code, 'pool'); } }, 'Karte ansehen')]))); }
      if (REC.cut.length) { body.append(h('h4', { class: 'dsec' }, '✂ Schwache Karten')); REC.cut.forEach((a) => body.append(row(a.code, a.why + '.', a.gain, '', [h('button', { class: 'btn sm red', onclick: () => { take(S.main, a.code, 1); S.dirty = true; paint(); after(); } }, '− Eine Kopie entfernen')]))); }
    };
    recalcNow(); paintModal();
  }
  function showOcg() {
    const tcg = S.fmt === 'advanced' && S.list === 'tcg'; const m = openModal({ title: 'OCG-Karten in diesem Deck', center: true, body: h('div', null, h('p', { class: 'small' }, tcg ? 'Diese Karten sind bisher nur im OCG (Japan/Asien) erschienen. Im TCG gibt es sie noch nicht – für ein echtes TCG-Deck solltest du sie ersetzen.' : 'Diese Karten sind bisher nur im OCG erschienen.'), h('ul', { class: 'small' }, ocgCodes().map((c) => h('li', null, `${totalOf(c)}× ${cleanName(cardOf(c).name)}`)))), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK') });
  }
  function showIssues() {
    const iss = issues(); const m = openModal({ title: iss.length ? 'Das stimmt noch nicht' : 'Alles in Ordnung', center: true, body: iss.length ? h('ul', { class: 'small' }, iss.map((i) => h('li', null, i.msg))) : h('p', null, 'Dieses Deck ist für das Format regelkonform und spielbar.'), footer: iss.length ? [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Selbst beheben'), h('button', { class: 'btn pri', onclick: () => { m.close(); autoFix(); } }, '🛠 Automatisch reparieren')] : h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK') });
  }
  function autoFix() {
    const r = repair({ main: S.main, extra: S.extra, side: S.side }, fmt(), App.cards, App.lists); S.main = r.deck.main; S.extra = r.deck.extra; S.side = r.deck.side; S.dirty = true; paint();
    const m = openModal({ title: 'Reparatur', center: true, body: r.log.length ? h('ul', { class: 'small' }, r.log.map((l) => h('li', null, l))) : h('p', null, 'Es war nichts zu reparieren.'), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK') });
  }
  function switchFmt(f) {
    if (f === S.fmt) return; const old = S.fmt;
    for (const k of ['main', 'extra', 'side']) S[k] = S[k].map(([c, n]) => [toFmtCode(toPlainCode(c), f), n]); S.fmt = f; S.dirty = true; paint();
    const n = issues().length; if (n) toast(`${n} Hinweis(e) für ${FORMAT_INFO[f].title} – tippe auf „Hinweise“, um sie zu reparieren.`, 4000);
  }

  // ---- Deckansicht
  const badSet = () => new Set(issues().filter((i) => i.code).map((i) => i.code));
  const paintDeck = () => {
    const keepTop = deckPane.scrollTop; clear(deckPane); const bad = badSet();
    for (const [z, label, max] of [['main', 'Hauptdeck', FORMATS[S.fmt].maxMain], ['extra', 'Extradeck', FORMATS[S.fmt].maxExtra], ['side', 'Sidedeck', FORMATS[S.fmt].maxSide]]) {
      const list = sortList(S[z]); const n = count(list);
      const zone = h('div', { class: 'dz', 'data-zone': z }, h('div', { class: 'dz-h' }, h('b', null, label), h('span', { class: 'muted small' }, `${n}${z === 'main' ? ` / ${FORMATS[S.fmt].minMain}–${FORMATS[S.fmt].maxMain}` : ' / ' + max}`)),
        h('div', { class: 'ed-grid' }, list.length ? list.flatMap(([c, k]) => Array.from({ length: k }, () => ecEl(c, z, bad.has(c)))) : h('div', { class: 'dz-empty' }, z === 'main' ? 'Karten hierher ziehen oder unten antippen' : 'leer')));
      deckPane.append(zone);
    }
    deckPane.scrollTop = keepTop;
  };
  const ecEl = (c, z, bad) => { const e = h('div', { class: 'ec' + (bad ? ' bad' : ''), 'data-code': c, 'data-src': z }, cardEl(c, { cls: 'ed' }), isOcg(cardOf(c)) && S.list !== 'none' && S.list !== 'ocg' ? ocgTag() : null); if (S.fmt === 'genesys' && points(c, App.lists)) e.append(h('span', { class: 'pt' }, points(c, App.lists))); return e; };

  // ---- Kartenvorrat
  let filtered = []; let shown = 0; const CH = 72;
  const subMasks = { all: 0, normal: 0x10, effect: 0x20, fusion: 0x40, ritual: 0x80, synchro: 0x2000, xyz: 0x800000, link: 0x4000000, pendulum: 0x1000000, tuner: 0x1000 };
  const applyFilter = () => {
    const q = F.q.trim().toLowerCase(); const pl = poolFor(S.fmt);
    if (F.rec) {
      if (!REC) recalcNow(); const idx = new Map(pl.map((e) => [e.c.code, e])); filtered = (REC ? REC.codes : []).map((c) => idx.get(c)).filter((e) => e && (!q || e.ln.includes(q)));
      shown = 0; clear(poolList); poolList.scrollTop = 0; more(); return;
    }
    filtered = pl.filter(({ c, ln }) => {
      if (F.type === 'monster' && (!(c.type & 1) || isExtra(c))) return false; if (F.type === 'spell' && !(c.type & 2)) return false; if (F.type === 'trap' && !(c.type & 4)) return false; if (F.type === 'extra' && !isExtra(c)) return false;
      if (F.attr && !(c.attribute & F.attr)) return false;
      if (F.lvl !== 'all' && (c.type & 1)) { const l = c.level & 0xff; if (F.lvl === 'low' && l > 4) return false; if (F.lvl === 'mid' && (l < 5 || l > 6)) return false; if (F.lvl === 'high' && l < 7) return false; } else if (F.lvl !== 'all') return false;
      if (F.sub !== 'all') { const mk = subMasks[F.sub]; if (!(c.type & mk)) return false; }
      if (F.legal && lim(c.code) === 0) return false;
      if (F.ocg === 'only' && !isOcg(c)) return false; if (F.ocg === 'none' && isOcg(c)) return false;
      if (F.ht) { const hi = handtrapInfo(c, S.fmt); if (!hi || (F.ht === 'best' && !hi.curated)) return false; }
      if (F.eng && !(c.setcodes || []).some((s) => matches(s, F.eng.code))) return false;
      if (q && !(ln.includes(q) || (q.length > 3 && descOf(c).toLowerCase().includes(q)))) return false;
      return true;
    });
    if (q) { const nm = []; const ds = []; for (const e of filtered) (e.ln.includes(q) ? nm : ds).push(e); filtered = nm.concat(ds); }
    if (F.ht) filtered = filtered.map((e) => ({ e, s: handtrapInfo(e.c, S.fmt).score })).sort((a, b) => b.s - a.s || a.e.sk.localeCompare(b.e.sk)).map((x) => x.e); // beste Handtraps zuerst
    else if (F.eng && !q) filtered = filtered.map((e) => ({ e, r: ROLE_ORDER[roleOf(e.c)] ?? 9 })).sort((a, b) => a.r - b.r || a.e.sk.localeCompare(b.e.sk)).map((x) => x.e); // Starter zuerst
    if (SORTS.pool.k !== 'auto') filtered = sortItems(filtered, (e) => e.c, SORTS.pool); // ausdrücklich gewählte Reihenfolge
    shown = 0; clear(poolList); poolList.scrollTop = 0; more(); paintSummary();
  };
  const pcEl = (c) => { const code = c.code; const l = lim(code); const e = h('div', { class: 'pc' + (l === 0 ? ' ban' : '') + (recSet.has(code) ? ' rec' : ''), 'data-code': code, 'data-src': 'pool' }, cardEl(code, { cls: 'ed' }), poolBadge(c), isOcg(c) && S.list !== 'none' && S.list !== 'ocg' ? ocgTag() : null, l < 3 ? h('span', { class: 'lim l' + l }, l === 0 ? '✕' : l) : null, S.fmt === 'genesys' && points(code, App.lists) ? h('span', { class: 'pt' }, points(code, App.lists)) : null, h('span', { class: 'inn' }, totalOf(code) ? '×' + totalOf(code) : '')); return e; };
  const more = () => { const end = Math.min(filtered.length, shown + CH); const frag = document.createDocumentFragment(); for (let i = shown; i < end; i++) frag.append(pcEl(filtered[i].c)); shown = end; poolList.append(frag); if (!filtered.length) poolList.append(h('div', { class: 'dz-empty' }, F.rec ? (count(S.main) < 10 ? 'Lege erst ein paar Karten ins Deck – dann gibt es Empfehlungen.' : 'Keine Empfehlung – dein Deck ist in dieser Hinsicht gut aufgestellt.') : (F.ht && F.eng ? 'Diese Engine hat keine Handtraps im Format. Hebe einen der beiden Filter auf.' : F.ht ? 'Keine Handtraps gefunden – prüfe „nur erlaubte“ oder die Verbotsliste.' : 'Keine Karte gefunden'))); countEl.textContent = `${filtered.length.toLocaleString('de-DE')} Karten`; };
  const refreshPool = () => { for (const e of poolList.querySelectorAll('.pc')) { const code = +e.dataset.code; const n = totalOf(code); e.classList.toggle('rec', recSet.has(code)); const i = e.querySelector('.inn'); if (i) i.textContent = n ? '×' + n : ''; } };
  poolList.addEventListener('scroll', () => { if (poolList.scrollTop + poolList.clientHeight > poolList.scrollHeight - 400 && shown < filtered.length) more(); });
  const countEl = h('span', { class: 'muted small' });
  let deb; const searchIn = h('input', { class: 'search', placeholder: 'Karte suchen (deutsch oder englisch) …', oninput: (e) => { clearTimeout(deb); deb = setTimeout(() => { F.q = e.target.value; applyFilter(); }, 150); } });
  const chip = (label, active, fn) => h('button', { class: 'chip' + (active ? ' on' : ''), onclick: fn }, label);
  const paintFilters = () => {
    clear(filterBar);
    filterBar.append(h('div', { class: 'tabs' }, chip(F.rec ? '★ Empfohlen' : '☆ Empfohlen', F.rec, () => { F.rec = !F.rec; if (F.rec) recalcNow(); paintFilters(); applyFilter(); }), chip(F.ht === 'best' ? '🛡 Beste Handtraps' : F.ht === 'all' ? '🛡 Alle Handtraps' : '🛡 Handtraps', !!F.ht, () => { F.ht = F.ht ? (F.ht === 'best' ? 'all' : 0) : 'best'; if (F.ht) F.rec = false; paintFilters(); applyFilter(); }), chip(F.eng ? '⚙ ' + engName(F.eng.code) : '⚙ Engine', !!F.eng, () => pickEngine()), [['all', 'Alle'], ['monster', 'Monster'], ['spell', 'Zauber'], ['trap', 'Fallen'], ['extra', 'Extra']].map(([k, t]) => chip(t, F.type === k, () => { F.type = k; paintFilters(); applyFilter(); })), chip(F.more ? '▲ Filter' : '▼ Filter', F.more, () => { F.more = !F.more; paintFilters(); }), chip('nur erlaubte', F.legal, () => { F.legal = !F.legal; paintFilters(); applyFilter(); }), chip(F.ocg === 'all' ? 'OCG: alle' : F.ocg === 'only' ? 'nur OCG' : 'ohne OCG', F.ocg !== 'all', () => { F.ocg = F.ocg === 'all' ? 'only' : F.ocg === 'only' ? 'none' : 'all'; paintFilters(); applyFilter(); }), countEl));
    if (F.more) filterBar.append(h('div', { class: 'tabs' }, chip('alle Attribute', !F.attr, () => { F.attr = 0; paintFilters(); applyFilter(); }), ATTR_BITS.slice(0, 6).map(([v, n]) => chip(n[0] + n.slice(1).toLowerCase(), F.attr === v, () => { F.attr = v; paintFilters(); applyFilter(); }))),
      h('div', { class: 'tabs' }, [['all', 'jede Stufe'], ['low', '1–4'], ['mid', '5–6'], ['high', '7+']].map(([k, t]) => chip(t, F.lvl === k, () => { F.lvl = k; paintFilters(); applyFilter(); }))),
      h('div', { class: 'tabs' }, [['all', 'jede Art'], ['normal', 'Normal'], ['effect', 'Effekt'], ['fusion', 'Fusion'], ['ritual', 'Ritual'], ['synchro', 'Synchro'], ['xyz', 'Xyz'], ['link', 'Link'], ['pendulum', 'Pendel'], ['tuner', 'Empfänger']].map(([k, t]) => chip(t, F.sub === k, () => { F.sub = k; paintFilters(); applyFilter(); }))));
  };
  const filterBar = h('div', { class: 'ed-filters' }); const sumEl = h('div', { class: 'ed-sum small muted' });
  poolBox.append(h('div', { class: 'ed-pool-h' }, searchIn, filterBar, sumEl), poolList);

  // ---- Handtrap- und Engine-Filter
  const ROLE_SHORT = { starter: 'Start', extender: 'Verl.', draw: 'Zug', removal: 'Räum.', boss: 'Boss', handtrap: 'HT', trap: 'Falle', material: 'Mat.' };
  const engName = (code) => { const sn = App.strings; return (useDe() && sn.setnameDe && sn.setnameDe[code]) || sn.setname[code] || ('#' + code.toString(16)); };
  const poolBadge = (c) => {
    if (F.ht) { const hi = handtrapInfo(c, S.fmt); return hi ? h('span', { class: 'ht-t t' + hi.tier, title: `Handtrap Stufe ${hi.tier}: ${TIER_TEXT[hi.tier]}` }, hi.tier) : null; }
    if (F.eng) { const r = roleOf(c); return ROLE_SHORT[r] ? h('span', { class: 'rl-t r-' + r, title: ROLE_DE[r] }, ROLE_SHORT[r]) : null; }
    return null;
  };
  const htInDeck = () => { let n = 0, best = 0; for (const z of ['main', 'side']) for (const [code, k] of S[z]) { const hi = handtrapInfo(cardOf(code), S.fmt); if (hi) { n += k; if (hi.curated) best += k; } } return { n, best }; };
  function paintSummary() {
    clear(sumEl); if (!F.ht && !F.eng) { sumEl.style.display = 'none'; return; } sumEl.style.display = '';
    if (F.ht) { const d = htInDeck(); sumEl.append(h('div', null, h('b', null, F.ht === 'best' ? 'Beste zuerst' : 'Alle erkannten'), ' · ', ...['S', 'A', 'B', 'C'].flatMap((t) => [h('span', { class: 'ht-t t0 ' + t }, t), ` ${TIER_SHORT[t]}  `]), `· im Deck: ${d.best}` + (d.n > d.best ? ` (+${d.n - d.best})` : ''))); }
    if (F.eng) sumEl.append(h('div', null, h('b', null, `Engine „${engName(F.eng.code)}“`), F.ht ? ' – nur Handtraps dieser Engine.' : ' – sortiert nach Rolle: Starter, Verlängerer, Zugkarten, Entferner, Bosse.'));
  }
  function sortDialog(which = 'deck') {
    const body = h('div', { class: 'col' }); let cur = which;
    const save = () => { try { store.set('ed.sort', { pool: SORTS.pool, deck: SORTS.deck }); } catch (e) { /* ohne Speicher */ } };
    const paint = () => {
      clear(body); const m = SORTS[cur]; const keys = SORT_KEYS.filter(([k]) => (cur === 'pool' ? k !== 'std' : k !== 'auto'));
      body.append(h('div', { class: 'tabs' }, [['deck', 'Mein Deck'], ['pool', 'Kartenvorrat']].map(([k, t]) => h('button', { class: 'chip' + (cur === k ? ' on' : ''), onclick: () => { cur = k; paint(); } }, t))),
        h('div', { class: 'small muted' }, cur === 'deck' ? 'Ordnet die Karten in Haupt-, Extra- und Sidedeck.' : 'Ordnet die Kartenliste unten. „Automatisch“ sortiert nach Name – bei Handtrap- und Engine-Filter nach Stärke bzw. Rolle.'),
        h('div', { class: 'tags' }, keys.map(([k, t]) => h('button', { class: 'chip' + (m.k === k ? ' on' : ''), onclick: () => { m.k = k; m.d = NATURAL[k] ?? 1; save(); apply(); paint(); } }, t))));
      const numeric = ['level', 'atk', 'def'].includes(m.k);
      if (!['auto', 'std', 'type'].includes(m.k)) body.append(h('button', { class: 'btn', onclick: () => { m.d = -m.d; save(); apply(); paint(); } }, (m.d === NATURAL[m.k] ? 'Reihenfolge: ' : 'Umgekehrt: ') + (numeric ? (m.d < 0 ? 'hoch → niedrig ⬇' : 'niedrig → hoch ⬆') : m.k === 'name' ? (m.d > 0 ? 'A → Z ⬇' : 'Z → A ⬆') : (m.d > 0 ? 'wichtig zuerst ⬇' : 'wichtig zuletzt ⬆')) + '  (tippen zum Umkehren)'));
      if (numeric) body.append(h('div', { class: 'small muted' }, 'Karten ohne diesen Wert (z. B. Zauber, Fallen, Link bei Verteidigung) stehen am Ende.'));
    };
    const apply = () => { if (cur === 'deck') paintDeck(); else applyFilter(); paintStatus(); };
    const m = openModal({ title: 'Sortieren', cls: 'peek sortm', body, footer: [h('button', { class: 'btn ghost', onclick: () => { SORTS.pool.k = 'auto'; SORTS.pool.d = 1; SORTS.deck.k = 'std'; SORTS.deck.d = 1; save(); paintDeck(); applyFilter(); paintStatus(); paint(); } }, 'Zurücksetzen'), h('button', { class: 'btn pri', onclick: () => m.close() }, 'Fertig')] });
    paint();
  }
  const engCache = new Map();
  function engineList(fmtId) {
    if (engCache.has(fmtId)) return engCache.get(fmtId);
    const sn = App.strings.setname; const byBase = new Map(); for (const k of Object.keys(sn).map(Number)) { const b = k & 0xfff; if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(k); }
    const cnt = new Map();
    for (const { c } of poolFor(fmtId)) { const seen = new Set(); for (const s of c.setcodes || []) for (const a of byBase.get(s & 0xfff) || []) if (!seen.has(a) && matches(s, a)) { seen.add(a); cnt.set(a, (cnt.get(a) || 0) + 1); } }
    const out = [...cnt].filter(([, n]) => n >= 3).map(([code, n]) => ({ code, n })); engCache.set(fmtId, out); return out;
  }
  function pickEngine() {
    const all = engineList(S.fmt).map((e) => ({ ...e, name: engName(e.code), alt: App.strings.setname[e.code] || '' })).sort((a, b) => a.name.localeCompare(b.name));
    let mine = []; try { if (count(S.main) >= 10) { const rep = profile(deckObj(), App.cards, App.strings.setname, limitOf(deckObj())).rep; mine = rep.engines.map((g) => all.find((e) => e.code === g.code) || { code: g.code, n: 0, name: engName(g.code), alt: g.name }); } } catch (e) { mine = []; }
    const body = h('div'); const list = h('div', { class: 'col', style: 'gap:6px;margin-top:8px' });
    const row = (e) => h('button', { class: 'btn' + (F.eng && F.eng.code === e.code ? ' pri' : ''), style: 'justify-content:space-between;text-align:left;height:auto;padding:9px 12px', onclick: () => { F.eng = { code: e.code }; F.rec = false; m.close(); paintFilters(); applyFilter(); } }, h('span', null, e.name), h('span', { class: 'muted small' }, e.n ? `${e.n} Karten` : ''));
    const q = h('input', { class: 'search', placeholder: 'Engine suchen (deutsch oder englisch) …', oninput: () => paint() });
    const paint = () => { clear(list); const t = q.value.trim().toLowerCase();
      if (!t && mine.length) { list.append(h('div', { class: 'small muted' }, 'In deinem Deck')); mine.forEach((e) => list.append(row(e))); list.append(h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Alle Engines')); }
      const hit = all.filter((e) => !t || e.name.toLowerCase().includes(t) || e.alt.toLowerCase().includes(t)); hit.slice(0, 160).forEach((e) => list.append(row(e)));
      if (!hit.length) list.append(h('div', { class: 'muted small' }, 'Keine Engine gefunden.')); else if (hit.length > 160) list.append(h('div', { class: 'muted small' }, `… ${hit.length - 160} weitere – Suche eingrenzen.`)); };
    body.append(q, list); paint();
    const m = openModal({ title: 'Engine wählen', cls: 'tall', body, footer: [F.eng ? h('button', { class: 'btn ghost', onclick: () => { F.eng = null; m.close(); paintFilters(); applyFilter(); } }, 'Filter aufheben') : null, h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen')].filter(Boolean) });
  }

  // ---- Ändern
  function add(zone, code, silent) {
    const c = cardOf(code); if (!c) return false; const ex = isExtra(c); if (zone !== 'side') zone = ex ? 'extra' : 'main';
    const l = lim(code); const f = fmt();
    if (totalOf(code) >= l) { toast(l === 0 ? `„${cleanName(c.name)}“ ist in diesem Format verboten.` : `„${cleanName(c.name)}“: höchstens ${l}× erlaubt.`); return false; }
    const max = FORMATS[S.fmt][zone === 'main' ? 'maxMain' : zone === 'extra' ? 'maxExtra' : 'maxSide']; if (count(S[zone]) >= max) { toast(`${zone === 'main' ? 'Hauptdeck' : zone === 'extra' ? 'Extradeck' : 'Sidedeck'} ist voll (${max}).`); return false; }
    if (f.cap && deckPoints(S, App.lists) + points(code, App.lists) > f.cap) { toast('Nicht genug Genesys-Punkte (100).'); return false; }
    put(S[zone], code, 1); S.dirty = true; if (!silent) paint(); return true;
  }
  function remove(zone, code) { take(S[zone], code, 1); S.dirty = true; paint(); }
  function move(zone, to, code) {
    const c = cardOf(code); const ex = isExtra(c); if (to !== 'side') to = ex ? 'extra' : 'main'; if (to === zone) return;
    const max = FORMATS[S.fmt][to === 'main' ? 'maxMain' : to === 'extra' ? 'maxExtra' : 'maxSide']; if (count(S[to]) >= max) { toast('Dieser Bereich ist voll.'); return; }
    take(S[zone], code, 1); put(S[to], code, 1); S.dirty = true; paint();
  }
  function paint() { calcCons(); paintStatus(); paintDeck(); refreshPool(); scheduleRec(); if (sel) paintDock(); }

  // ---- Dock (Karte antippen)
  function openDock(code, srcZone) { sel = { code, src: srcZone }; paintDock(); }
  function paintDock() {
    const { code, src: z } = sel; const c = cardOf(code); clear(dock); dock.classList.add('open'); const ex = isExtra(c); const inDeck = totalOf(code);
    const btns = z === 'pool' ? [h('button', { class: 'btn pri', onclick: () => { add(ex ? 'extra' : 'main', code); } }, ex ? '＋ Extradeck' : '＋ Hauptdeck'), h('button', { class: 'btn', onclick: () => add('side', code) }, '＋ Side'), h('button', { class: 'btn ghost', onclick: () => remove(num(S.main, code) ? 'main' : num(S.extra, code) ? 'extra' : 'side', code) , disabled: !inDeck }, '−')]
      : [h('button', { class: 'btn red', onclick: () => { remove(z, code); if (!num(S[z], code)) closeDock(); } }, '− Entfernen'), h('button', { class: 'btn', onclick: () => add(z, code) }, '＋ Kopie'), z === 'side' ? h('button', { class: 'btn', onclick: () => { move('side', ex ? 'extra' : 'main', code); if (!num(S.side, code)) closeDock(); } }, '→ Deck') : h('button', { class: 'btn', onclick: () => { move(z, 'side', code); if (!num(S[z], code)) closeDock(); } }, '→ Side')];
    dock.append(h('button', { class: 'sh-x', onclick: closeDock }, '✕'), h('div', { class: 'sh-top' }, cardEl(code, { cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, cleanName(c.name)), h('div', { class: 'small muted' }, typeText(c)), (c.type & 1) ? h('div', { class: 'small' }, [attrName(c.attribute), levelText(c)].filter(Boolean).join(' · ')) : null, (c.type & 1) ? h('div', { class: 'small gold' }, statsText(c)) : null,
      isOcg(c) ? h('div', { class: 'small', style: 'margin-top:4px' }, ocgTag(), ' nur im OCG erschienen') : null,
      recInfo(code), htInfoLine(c),
      h('div', { class: 'small', style: 'margin-top:4px' }, `Im Deck: ${inDeck}× · erlaubt: ${lim(code)}×` + (S.fmt === 'genesys' ? ` · ${points(code, App.lists)} Punkte` : '')))),
      h('div', { class: 'sh-t' }, descOf(c).replace(/\r/g, '')), h('div', { class: 'row', style: 'margin-top:8px' }, btns));
  }
  const htInfoLine = (c) => { const hi = handtrapInfo(c, S.fmt); const r = F.eng ? roleOf(c) : null; return h('div', null, hi ? h('div', { class: 'small ht-line' }, `🛡 Handtrap · Stufe ${hi.tier} (${TIER_TEXT[hi.tier]})` + (hi.note ? ': ' + hi.note : hi.curated ? '' : ' – automatisch erkannt: wirkt im Zug des Gegners aus der Hand.')) : null, r && ROLE_SHORT[r] ? h('div', { class: 'small muted' }, 'Rolle in der Engine: ' + ROLE_DE[r]) : null); };
  const recInfo = (code) => { const a = REC && (REC.add.find((x) => x.code === code) || REC.prot.find((x) => x.code === code)); return a ? h('div', { class: 'small rec-line' }, '★ Empfohlen: ' + a.why) : null; };
  function closeDock() { sel = null; dock.classList.remove('open'); clear(dock); }

  // ---- Ziehen & Ablegen
  enableDnd({
    root, itemSel: '.pc, .ec', zoneSel: '[data-zone]', scrollers: () => [deckPane, poolList],
    getData: (el) => ({ code: +el.dataset.code, src: el.dataset.src }),
    ghost: (el) => { const g = el.querySelector('.card').cloneNode(true); g.style.width = '56px'; g.style.setProperty('--w', '56px'); return g; },
    onDrop: (d, z) => { const to = z.dataset.zone; if (to === 'none') return; if (d.src === 'pool') { if (to === 'pool') return; add(to, d.code); } else { if (to === 'pool') { remove(d.src, d.code); closeDock(); } else move(d.src, to, d.code); } },
    onTap: (el) => openDock(+el.dataset.code, el.dataset.src),
  });

  // ---- Menü, Speichern
  const snapshot = () => ({ deck: { id: S.id, name: S.name, fmt: S.fmt, list: S.list, main: clone(S.main), extra: clone(S.extra), side: clone(S.side) }, dirty: S.dirty });
  const leave = (fn) => { setParams(snapshot()); setGuard(null); fn(); };
  function menu() {
    const m = openModal({ title: 'Deck-Menü', center: true, body: h('div', { class: 'col' },
      h('button', { class: 'btn', onclick: () => { m.close(); showIssues(); } }, '✓ Prüfen / Reparieren'),
      h('button', { class: 'btn', onclick: () => { m.close(); leave(() => go('decks', { fmt: S.fmt, list: S.list, title: 'Deck als Vorlage laden', onPick: (d) => setTimeout(() => replace('editor', { dirty: true, deck: { id: S.saved ? S.id : undefined, name: S.saved || count(S.main) ? S.name : d.name + ' (Kopie)', fmt: S.fmt, list: S.list, main: clone(d.main), extra: clone(d.extra), side: clone(d.side) } }), 60) })); } }, '⧉ Anderes Deck als Vorlage laden'),
      h('button', { class: 'btn', onclick: () => { m.close(); importDialog(S.fmt, (d) => { S.main = d.main; S.extra = d.extra; S.side = d.side; S.dirty = true; paint(); applyFilter(); }); } }, '⇪ .ydk importieren'),
      h('button', { class: 'btn', onclick: () => { m.close(); exportDialog(); } }, '⇩ .ydk exportieren'),
      h('button', { class: 'btn', onclick: () => { m.close(); handTest(); } }, '🧪 Starthand-Test (Combos ausprobieren)'),
      h('button', { class: 'btn', onclick: () => { m.close(); testDeck(); } }, '▶ Speichern & im Duell testen'),
      h('button', { class: 'btn red', onclick: async () => { m.close(); if (await confirmBox('Deck leeren?', 'Alle Karten werden entfernt.', 'Leeren', 'Abbrechen', true)) { S.main = []; S.extra = []; S.side = []; S.dirty = true; paint(); } } }, '🗑 Deck leeren')), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen') });
  }
  function exportDialog() {
    const txt = toYdk(S); const m = openModal({ title: '.ydk exportieren', body: h('div', { class: 'col' }, h('textarea', { class: 'input', readonly: true, style: 'width:100%;height:180px;padding:10px', value: txt }), h('p', { class: 'small muted' }, 'Diese Datei kannst du in EDOPro, Master Duel-Deck-Tools oder YGOPRODeck einlesen.')), footer: [h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(txt); toast('Kopiert'); } catch (e) { toast('Kopieren nicht möglich – bitte Text markieren.'); } } }, 'Kopieren'), h('button', { class: 'btn pri', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: (S.name || 'deck').replace(/[^\w\-]+/g, '_') + '.ydk' }); document.body.append(a); a.click(); a.remove(); } }, 'Herunterladen')] });
  }
  function save(silent) {
    if (!S.name.trim()) S.name = 'Mein Deck'; const iss = issues();
    saveCustom({ id: S.id, name: S.name.trim(), fmt: S.fmt, list: fmt().list, main: S.main, extra: S.extra, side: S.side, src: 'Eigenes Deck', status: iss.length ? 'angepasst' : 'ok', repairs: [], sub: FORMAT_INFO[S.fmt].title }); S.saved = true; S.dirty = false;
    if (!silent) toast(iss.length ? 'Gespeichert – das Deck hat noch Hinweise.' : 'Deck gespeichert ✓'); return true;
  }
  function handTest() {
    if (count(S.main) < 10) { toast('Zuerst mindestens 10 Karten ins Hauptdeck legen.'); return; }
    if (issues().length && !S.warned) { S.warned = true; toast('Das Deck hat noch Hinweise – der Test funktioniert trotzdem. Nochmal tippen zum Starten.', 3500); return; }
    save(true); leave(() => startTest({ id: S.id, name: S.name, fmt: S.fmt, list: S.list, main: clone(S.main), extra: clone(S.extra), side: clone(S.side) }));
  }
  function testDeck() {
    if (issues().length) { toast('Das Deck hat noch Hinweise – bitte zuerst prüfen/reparieren.', 3500); showIssues(); return; }
    save(true); const st = store.get('setup.' + S.fmt, {}); st.decks = [S.id, (st.decks && st.decks[1]) || S.id]; st.mode = 'solo'; if (S.fmt === 'advanced') st.list = S.list; store.set('setup.' + S.fmt, st);
    leave(() => go('setup', { fmt: S.fmt }));
  }

  // Zurück: ungespeicherte Änderungen
  setGuard(async () => {
    if (!S.dirty || (!count(S.main) && !count(S.extra) && !count(S.side))) { setGuard(null); return true; }
    return new Promise((res) => { const m = openModal({ title: 'Änderungen speichern?', center: true, sticky: true, body: h('p', null, `„${S.name}“ hat ungespeicherte Änderungen.`), footer: [h('button', { class: 'btn ghost', onclick: () => { m.close(); setGuard(null); res(true); } }, 'Verwerfen'), h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Weiter bearbeiten'), h('button', { class: 'btn pri', onclick: () => { save(true); m.close(); setGuard(null); res(true); } }, 'Speichern')] }); });
  });
  paintFilters(); paint(); applyFilter();
  return root;
};
