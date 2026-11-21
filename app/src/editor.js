// Deck-Werkstatt: eigene Decks bauen, Ziehen & Ablegen aus allen Karten, Prüfung je Format
import { h, $, clear, toast, uid } from './util.js';
import { App, FORMAT_INFO, FORMATS, fmtById, allDecks, customDecks, saveCustom, deleteCustom, withTutor, nameOf, cardOf, cleanName, count, expand, toFmtCode, toPlainCode, goatMaps } from './data.js';
import { cardEl } from './cards.js';
import { openModal, confirmBox, cardInfoBody } from './ui.js';
import { go, back, replace, screens, setGuard, setParams } from './nav.js';
import { store } from './store.js';
import { validate, repair, allowed, points, deckPoints, isExtra } from '../../src/decks.mjs';
import { kind, typeText, levelText, attrName, statsText, ATTR_BITS } from './strings.js';
import { enableDnd } from './dnd.js';
import { deckRow, deckDetail } from './screens.js';

const KO = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'token', 'spell', 'trap'];
const put = (l, c, n = 1) => { const e = l.find((x) => x[0] === c); if (e) e[1] += n; else l.push([c, n]); };
const take = (l, c, n = 1) => { const i = l.findIndex((x) => x[0] === c); if (i < 0) return 0; const t = Math.min(n, l[i][1]); l[i][1] -= t; if (l[i][1] <= 0) l.splice(i, 1); return t; };
const num = (l, c) => (l.find((x) => x[0] === c) || [0, 0])[1];
const clone = (l) => (l || []).map((e) => [...e]);
const sortList = (l) => l.sort((a, b) => { const A = cardOf(a[0]), B = cardOf(b[0]); return KO.indexOf(kind(A)) - KO.indexOf(kind(B)) || (A?.name || '').localeCompare(B?.name || ''); });

// ---- Kartenvorrat je Format -----------------------------------------------------------------------
const pools = new Map();
export function poolFor(fmtId) {
  if (pools.has(fmtId)) return pools.get(fmtId);
  const gm = goatMaps(); const out = []; const L = App.lists;
  for (const c of App.cards.values()) {
    if (c.type & 0x4000) continue; const isG = c.code >= 504700000 && c.code < 504800000;
    if (fmtId === 'goat') { if (!(L.goat.map[c.code] > 0)) continue; if (gm.to.has(c.code)) continue; } else { if (isG || c.alias) continue; }
    if (fmtId === 'edison' && (c.type & (0x800000 | 0x4000000 | 0x1000000))) continue;
    if (fmtId === 'genesys' && (c.type & (0x4000000 | 0x1000000))) continue;
    if (!(c.type & 7)) continue;
    out.push({ c, ln: c.name.toLowerCase() });
  }
  out.sort((a, b) => a.ln.localeCompare(b.ln)); pools.set(fmtId, out); return out;
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
  const m = openModal({ title: 'Für welches Format?', center: true, body: h('div', { class: 'col' }, ['goat', 'edison', 'advanced', 'genesys'].map((f) => h('button', { class: 'btn', style: 'justify-content:flex-start', onclick: () => { m.close(); cb(f); } }, FORMAT_INFO[f].icon + '  ' + FORMAT_INFO[f].title + ' – ' + FORMAT_INFO[f].sub))) });
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
  const F = { q: '', type: 'all', attr: 0, lvl: 'all', sub: 'all', legal: true, more: false }; let split = 1; let sel = null;
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
    status.append(h('div', { class: 'tabs' }, ['goat', 'edison', 'advanced', 'genesys'].map((f) => h('button', { class: 'chip' + (S.fmt === f ? ' on' : ''), onclick: () => switchFmt(f) }, FORMAT_INFO[f].title)), S.fmt === 'advanced' ? ['tcg', 'ocg'].map((l) => h('button', { class: 'chip' + (S.list === l ? ' on' : ''), onclick: () => { S.list = l; S.dirty = true; paint(); } }, l.toUpperCase())) : null),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, h('span', { class: 'chip ' + (count(S.main) >= 40 && count(S.main) <= 60 ? 'ok' : 'bad') }, `Haupt ${count(S.main)}`), h('span', { class: 'chip ' + (count(S.extra) <= 15 ? 'ok' : 'bad') }, `Extra ${count(S.extra)}`), h('span', { class: 'chip ' + (count(S.side) <= 15 ? 'ok' : 'bad') }, `Side ${count(S.side)}`), S.fmt === 'genesys' ? h('span', { class: 'chip ' + (pts <= 100 ? 'ok' : 'bad') }, `${pts}/100 Punkte`) : null,
        h('button', { class: 'chip ' + (iss.length ? 'warn' : 'ok'), onclick: () => showIssues() }, iss.length ? `⚠ ${iss.length} Hinweis${iss.length > 1 ? 'e' : ''}` : '✓ spielbar'), h('button', { class: 'chip', onclick: () => { split = (split + 1) % 3; split1.className = 'ed-split s' + split; } }, '⇕')));
  };
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
    clear(deckPane); const bad = badSet();
    for (const [z, label, max] of [['main', 'Hauptdeck', 60], ['extra', 'Extradeck', 15], ['side', 'Sidedeck', 15]]) {
      const list = sortList(S[z]); const n = count(list);
      const zone = h('div', { class: 'dz', 'data-zone': z }, h('div', { class: 'dz-h' }, h('b', null, label), h('span', { class: 'muted small' }, `${n}${z === 'main' ? ' / 40–60' : ' / ' + max}`)),
        h('div', { class: 'ed-grid' }, list.length ? list.map(([c, k]) => ecEl(c, k, z, bad.has(c))) : h('div', { class: 'dz-empty' }, z === 'main' ? 'Karten hierher ziehen oder unten antippen' : 'leer')));
      deckPane.append(zone);
    }
  };
  const ecEl = (c, k, z, bad) => { const e = h('div', { class: 'ec' + (bad ? ' bad' : ''), 'data-code': c, 'data-src': z }, cardEl(c, { cls: 'ed' }), k > 1 ? h('span', { class: 'cnt' }, '×' + k) : null); if (S.fmt === 'genesys' && points(c, App.lists)) e.append(h('span', { class: 'pt' }, points(c, App.lists))); return e; };

  // ---- Kartenvorrat
  let filtered = []; let shown = 0; const CH = 72;
  const subMasks = { all: 0, normal: 0x10, effect: 0x20, fusion: 0x40, ritual: 0x80, synchro: 0x2000, xyz: 0x800000, link: 0x4000000, pendulum: 0x1000000, tuner: 0x1000 };
  const applyFilter = () => {
    const q = F.q.trim().toLowerCase(); const pl = poolFor(S.fmt);
    filtered = pl.filter(({ c, ln }) => {
      if (F.type === 'monster' && (!(c.type & 1) || isExtra(c))) return false; if (F.type === 'spell' && !(c.type & 2)) return false; if (F.type === 'trap' && !(c.type & 4)) return false; if (F.type === 'extra' && !isExtra(c)) return false;
      if (F.attr && !(c.attribute & F.attr)) return false;
      if (F.lvl !== 'all' && (c.type & 1)) { const l = c.level & 0xff; if (F.lvl === 'low' && l > 4) return false; if (F.lvl === 'mid' && (l < 5 || l > 6)) return false; if (F.lvl === 'high' && l < 7) return false; } else if (F.lvl !== 'all') return false;
      if (F.sub !== 'all') { const mk = subMasks[F.sub]; if (!(c.type & mk)) return false; }
      if (F.legal && lim(c.code) === 0) return false;
      if (q && !(ln.includes(q) || (q.length > 3 && c.desc && c.desc.toLowerCase().includes(q)))) return false;
      return true;
    });
    if (q) { const nm = []; const ds = []; for (const e of filtered) (e.ln.includes(q) ? nm : ds).push(e); filtered = nm.concat(ds); }
    shown = 0; clear(poolList); poolList.scrollTop = 0; more();
  };
  const pcEl = (c) => { const code = c.code; const l = lim(code); const e = h('div', { class: 'pc' + (l === 0 ? ' ban' : ''), 'data-code': code, 'data-src': 'pool' }, cardEl(code, { cls: 'ed' }), l < 3 ? h('span', { class: 'lim l' + l }, l === 0 ? '✕' : l) : null, S.fmt === 'genesys' && points(code, App.lists) ? h('span', { class: 'pt' }, points(code, App.lists)) : null, h('span', { class: 'inn' }, totalOf(code) ? '×' + totalOf(code) : '')); return e; };
  const more = () => { const end = Math.min(filtered.length, shown + CH); const frag = document.createDocumentFragment(); for (let i = shown; i < end; i++) frag.append(pcEl(filtered[i].c)); shown = end; poolList.append(frag); if (!filtered.length) poolList.append(h('div', { class: 'dz-empty' }, 'Keine Karte gefunden')); countEl.textContent = `${filtered.length.toLocaleString('de-DE')} Karten`; };
  const refreshPool = () => { for (const e of poolList.querySelectorAll('.pc')) { const code = +e.dataset.code; const n = totalOf(code); const i = e.querySelector('.inn'); if (i) i.textContent = n ? '×' + n : ''; } };
  poolList.addEventListener('scroll', () => { if (poolList.scrollTop + poolList.clientHeight > poolList.scrollHeight - 400 && shown < filtered.length) more(); });
  const countEl = h('span', { class: 'muted small' });
  let deb; const searchIn = h('input', { class: 'search', placeholder: 'Karte suchen (Name, englisch) …', oninput: (e) => { clearTimeout(deb); deb = setTimeout(() => { F.q = e.target.value; applyFilter(); }, 150); } });
  const chip = (label, active, fn) => h('button', { class: 'chip' + (active ? ' on' : ''), onclick: fn }, label);
  const paintFilters = () => {
    clear(filterBar);
    filterBar.append(h('div', { class: 'tabs' }, [['all', 'Alle'], ['monster', 'Monster'], ['spell', 'Zauber'], ['trap', 'Fallen'], ['extra', 'Extra']].map(([k, t]) => chip(t, F.type === k, () => { F.type = k; paintFilters(); applyFilter(); })), chip(F.more ? '▲ Filter' : '▼ Filter', F.more, () => { F.more = !F.more; paintFilters(); }), chip('nur erlaubte', F.legal, () => { F.legal = !F.legal; paintFilters(); applyFilter(); }), countEl));
    if (F.more) filterBar.append(h('div', { class: 'tabs' }, chip('alle Attribute', !F.attr, () => { F.attr = 0; paintFilters(); applyFilter(); }), ATTR_BITS.slice(0, 6).map(([v, n]) => chip(n[0] + n.slice(1).toLowerCase(), F.attr === v, () => { F.attr = v; paintFilters(); applyFilter(); }))),
      h('div', { class: 'tabs' }, [['all', 'jede Stufe'], ['low', '1–4'], ['mid', '5–6'], ['high', '7+']].map(([k, t]) => chip(t, F.lvl === k, () => { F.lvl = k; paintFilters(); applyFilter(); }))),
      h('div', { class: 'tabs' }, [['all', 'jede Art'], ['normal', 'Normal'], ['effect', 'Effekt'], ['fusion', 'Fusion'], ['ritual', 'Ritual'], ['synchro', 'Synchro'], ['xyz', 'Xyz'], ['link', 'Link'], ['pendulum', 'Pendel'], ['tuner', 'Empfänger']].map(([k, t]) => chip(t, F.sub === k, () => { F.sub = k; paintFilters(); applyFilter(); }))));
  };
  const filterBar = h('div', { class: 'ed-filters' });
  poolBox.append(h('div', { class: 'ed-pool-h' }, searchIn, filterBar), poolList);

  // ---- Ändern
  function add(zone, code, silent) {
    const c = cardOf(code); if (!c) return false; const ex = isExtra(c); if (zone !== 'side') zone = ex ? 'extra' : 'main';
    const l = lim(code); const f = fmt();
    if (totalOf(code) >= l) { toast(l === 0 ? `„${cleanName(c.name)}“ ist in diesem Format verboten.` : `„${cleanName(c.name)}“: höchstens ${l}× erlaubt.`); return false; }
    const max = zone === 'main' ? 60 : 15; if (count(S[zone]) >= max) { toast(`${zone === 'main' ? 'Hauptdeck' : zone === 'extra' ? 'Extradeck' : 'Sidedeck'} ist voll (${max}).`); return false; }
    if (f.cap && deckPoints(S, App.lists) + points(code, App.lists) > f.cap) { toast('Nicht genug Genesys-Punkte (100).'); return false; }
    put(S[zone], code, 1); S.dirty = true; if (!silent) paint(); return true;
  }
  function remove(zone, code) { take(S[zone], code, 1); S.dirty = true; paint(); }
  function move(zone, to, code) {
    const c = cardOf(code); const ex = isExtra(c); if (to !== 'side') to = ex ? 'extra' : 'main'; if (to === zone) return;
    const max = to === 'main' ? 60 : 15; if (count(S[to]) >= max) { toast('Dieser Bereich ist voll.'); return; }
    take(S[zone], code, 1); put(S[to], code, 1); S.dirty = true; paint();
  }
  function paint() { paintStatus(); paintDeck(); refreshPool(); if (sel) paintDock(); }

  // ---- Dock (Karte antippen)
  function openDock(code, srcZone) { sel = { code, src: srcZone }; paintDock(); }
  function paintDock() {
    const { code, src: z } = sel; const c = cardOf(code); clear(dock); dock.classList.add('open'); const ex = isExtra(c); const inDeck = totalOf(code);
    const btns = z === 'pool' ? [h('button', { class: 'btn pri', onclick: () => { add(ex ? 'extra' : 'main', code); } }, ex ? '＋ Extradeck' : '＋ Hauptdeck'), h('button', { class: 'btn', onclick: () => add('side', code) }, '＋ Side'), h('button', { class: 'btn ghost', onclick: () => remove(num(S.main, code) ? 'main' : num(S.extra, code) ? 'extra' : 'side', code) , disabled: !inDeck }, '−')]
      : [h('button', { class: 'btn red', onclick: () => { remove(z, code); if (!num(S[z], code)) closeDock(); } }, '− Entfernen'), h('button', { class: 'btn', onclick: () => add(z, code) }, '＋ Kopie'), z === 'side' ? h('button', { class: 'btn', onclick: () => { move('side', ex ? 'extra' : 'main', code); if (!num(S.side, code)) closeDock(); } }, '→ Deck') : h('button', { class: 'btn', onclick: () => { move(z, 'side', code); if (!num(S[z], code)) closeDock(); } }, '→ Side')];
    dock.append(h('button', { class: 'sh-x', onclick: closeDock }, '✕'), h('div', { class: 'sh-top' }, cardEl(code, { cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, cleanName(c.name)), h('div', { class: 'small muted' }, typeText(c)), (c.type & 1) ? h('div', { class: 'small' }, [attrName(c.attribute), levelText(c)].filter(Boolean).join(' · ')) : null, (c.type & 1) ? h('div', { class: 'small gold' }, statsText(c)) : null,
      h('div', { class: 'small', style: 'margin-top:4px' }, `Im Deck: ${inDeck}× · erlaubt: ${lim(code)}×` + (S.fmt === 'genesys' ? ` · ${points(code, App.lists)} Punkte` : '')))),
      h('div', { class: 'sh-t' }, (c.desc || '').replace(/\r/g, '')), h('div', { class: 'row', style: 'margin-top:8px' }, btns));
  }
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
