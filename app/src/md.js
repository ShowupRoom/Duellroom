// Oberfläche im Stil von MDPro3 (Fan-Client im Master-Duel-Look): Hauptmenü, Duell-Zentrale (erst Banlist, dann Spielart),
// Deck-Zentrale (Decks je Banlist, Deck-Werkstatt) und Einstellungen (Seiten links, Zeilen rechts).
// Nur Aufbau und Verhalten sind dem Vorbild nachempfunden – es werden weder Code noch Bilder oder Texte von MDPro3 oder Konami verwendet.
import { h, clear, toast, sound } from './util.js';
import { App, FORMAT_INFO, allDecks, customDecks, deleteCustom, withTutor, count, LIST_NAME } from './data.js';
import { openModal, confirmBox } from './ui.js';
import { go, back, screens } from './nav.js';
import { store } from './store.js';
import { cardEl, cfg as imgCfg, setImages, idbCount, storageInfo, setFieldFull, fieldCfg } from './cards.js';
import { settings, deckRow, deckDetail, dataPanels, isApp, installApp, hydrate } from './screens.js';
import { importDialog, toYdk } from './editor.js';
import { AI_LEVELS } from '../../src/ai.mjs';
import { VERSION } from './engine.js';
import { look, FIELDS, SLEEVES, applyLook, unlocked } from './look.js';
import { libOn, setLibOn, libSummary, libClear } from './combolib.js';

// ---- Banlists -------------------------------------------------------------------------------------------------
export const BANS = [
  { id: 'goat', fmt: 'goat', list: 'goat', t: 'Goat', s: 'April 2005', ic: '🐐', b: FORMAT_INFO.goat.blurb },
  { id: 'edison', fmt: 'edison', list: 'edison', t: 'Edison', s: 'März 2010', ic: '⚡', b: FORMAT_INFO.edison.blurb },
  { id: 'tcg', fmt: 'advanced', list: 'tcg', t: 'Advanced · TCG', s: 'Aktuelle TCG-Liste', ic: '🌀', b: 'Das moderne Spiel mit Link, Pendel und Extra-Monsterzonen und der aktuellen TCG-Verbotsliste. Schnell, kombo-lastig.' },
  { id: 'ocg', fmt: 'advanced', list: 'ocg', t: 'Advanced · OCG', s: 'Aktuelle OCG-Liste', ic: '🌀', b: 'Wie Advanced, aber mit der OCG-Verbotsliste – mehr Karten sind erlaubt (auch solche, die es im TCG noch nicht gibt).' },
  { id: 'none', fmt: 'advanced', list: 'none', t: 'Advanced · ohne Banlist', s: 'Nur die Spielregeln', ic: '🌀', b: 'Das moderne Spiel ganz ohne Verbotsliste: alle Karten dreifach erlaubt, nur die Deckregeln gelten.' },
  { id: 'genesys', fmt: 'genesys', list: 'genesys', t: 'Genesys', s: '100 Punkte', ic: '🧬', b: FORMAT_INFO.genesys.blurb },
  { id: 'speed', fmt: 'speed', list: 'speed', t: 'Speed Duell', s: '4000 LP · 3 Zonen', ic: '🚀', b: FORMAT_INFO.speed.blurb },
];
export const banOf = (id) => BANS.find((b) => b.id === id) || BANS[2];
export const curBan = () => banOf(store.get('banlist', 'tcg'));
export const setBan = (b) => store.set('banlist', b.id);
/** Decks einer Banlist: Vorlagen des Formats; bei Advanced nur die der gewählten Liste, eigene Decks nur in der Liste, für die sie gebaut wurden */
export const decksOf = (ban) => allDecks(ban.fmt).filter((d) => ban.fmt !== 'advanced' || ban.list === 'none' || (d.custom ? (d.list || 'tcg') === ban.list : d.list === ban.list));

const hdr = (title, sub, right) => h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: () => back(), 'aria-label': 'Zurück' }, '←'), h('h2', null, title, sub ? h('div', { class: 'sub' }, sub) : null), right || null);
const mdItem = ({ ic, t, s, on, sm, onclick }) => h('button', { class: 'md-item' + (on ? ' on' : '') + (sm ? ' sm' : ''), onclick }, h('span', { class: 'mi-ic' }, ic), h('span', { class: 'mi-x' }, h('span', { class: 'mi-t' }, t), s ? h('span', { class: 'mi-s' }, s) : null), h('i', { class: 'mi-arr' }, '›'));
/** Banlist-Auswahl: senkrechte Liste (breit) bzw. waagerechte Leiste (schmal) */
const banList = (ban, pick) => h('div', { class: 'ban-list' }, BANS.map((b) => mdItem({ ic: b.ic, t: b.t, s: b.s, sm: true, on: b.id === ban.id, onclick: () => pick(b) })));
const banRail = (ban, pick) => h('div', { class: 'ban-rail tabs' }, BANS.map((b) => h('button', { class: 'md-tab' + (b.id === ban.id ? ' on' : ''), onclick: () => pick(b) }, b.ic + ' ' + b.t)));

// ---- Hauptmenü --------------------------------------------------------------------------------------------------
screens.home = () => {
  const last = store.get('last'); const ban = curBan();
  return h('div', { class: 'screen home md-home' }, h('div', { class: 'home-bg' }),
    h('div', { class: 'body home-body' },
      h('div', { class: 'md-hero' }, h('div', { class: 'sigil' }, '⚔'), h('h1', { class: 'home-t title-glow' }, 'DUELLRAUM'), h('div', { class: 'home-s' }, 'Yu-Gi-Oh! zu zweit'), h('div', { class: 'home-d' }, settings.dedication)),
      h('div', { class: 'md-menu' },
        mdItem({ ic: '⚔', t: 'Duell', s: 'KI · zu zweit · üben · Kombo-Ansicht · online', onclick: () => go('duelhub') }),
        mdItem({ ic: '🃏', t: 'Decks', s: 'Deck-Werkstatt · Decks je Banlist', onclick: () => go('deckhub') }),
        mdItem({ ic: '🎓', t: 'Lernen & Regeln', s: 'In wenigen Minuten spielbereit', onclick: () => go('learn') }),
        mdItem({ ic: '⚙', t: 'Einstellungen', s: 'Duell · Kombo-Ansicht · Ton · Karten · Daten', onclick: () => go('settings') }),
        last ? h('button', { class: 'btn ghost sm md-last', onclick: () => { try { go('duel', hydrate(last)); } catch (e) { toast('Das letzte Duell konnte nicht geladen werden.'); } } }, '↻  Letztes Duell wiederholen') : null,
        isApp() ? null : h('button', { class: 'btn ghost sm md-last', onclick: installApp }, '📲  Als App auf dem Handy installieren')),
      h('div', { class: 'home-f muted small' }, `Banlist: ${ban.t} · ${App.decks.length} Decks · ${App.cards.size.toLocaleString('de-DE')} Karten · offline spielbar`)));
};

// ---- Duell-Zentrale -----------------------------------------------------------------------------------------------
screens.duelhub = () => {
  let ban = curBan();
  const root = h('div', { class: 'screen md-pg' }, hdr('Duell', 'Erst die Banlist, dann die Spielart')); const body = h('div', { class: 'body' }); root.append(body);
  const paint = () => {
    clear(body); const n = decksOf(ban).filter((d) => d.status !== 'entwurf').length; const P = { fmt: ban.fmt, list: ban.list };
    const mine = decksOf(ban).filter((d) => d.custom).length;
    body.append(h('div', { class: 'wrap dh' },
      h('div', { class: 'dh-l' }, h('div', { class: 'md-lbl' }, '1 · Banlist'), banList(ban, (b) => { ban = b; setBan(b); paint(); }), banRail(ban, (b) => { ban = b; setBan(b); paint(); })),
      h('div', { class: 'dh-r' }, h('div', { class: 'md-lbl' }, '2 · Spielart'),
        h('div', { class: 'ban-info' }, h('b', null, ban.ic + '  ' + ban.t), h('span', { class: 'muted small' }, `${n} Decks${mine ? ' (davon ' + mine + ' eigene)' : ''}`), h('p', { class: 'muted small' }, ban.b)),
        mdItem({ ic: '🤖', t: 'Gegen die KI', s: 'Sie beschwört, aktiviert, greift an und antwortet auf deine Züge', onclick: () => go('setup', { ...P, mode: 'ai' }) }),
        mdItem({ ic: '👥', t: 'Zu zweit am Gerät', s: 'Abwechselnd; die Hand bleibt geheim', onclick: () => go('setup', { ...P, mode: 'hot' }) }),
        mdItem({ ic: '🎯', t: 'Allein üben', s: 'Der Gegner steht still – ideal für die eigene Combo', onclick: () => go('setup', { ...P, mode: 'solo' }) }),
        mdItem({ ic: '🎬', t: 'Kombo-Ansicht', s: 'Die KI spielt das Deck vor und erklärt jeden Schritt', onclick: () => go('setup', { ...P, demo: true }) }),
        mdItem({ ic: '🌐', t: 'Online-Duell', s: 'Jeder am eigenen Handy, mit Raum-Code', onclick: () => go('online', P) }))));
  };
  paint(); return root;
};

// ---- Deck-Zentrale (Deck-Werkstatt) -----------------------------------------------------------------------------------
const GROUPS = ['Meine Decks', 'Beliebte Decks', 'Turnier-Decks', 'Archetypen', 'Mechaniken', 'Master Duel', 'Anime', 'Structure Decks', 'Promo-Decks', 'Starter Decks', 'Weltmeisterschaft', 'Entwürfe'];
screens.deckhub = () => {
  let ban = curBan(), q = '', sub = null; const pg = store.get('deckhub', {}); let grp = pg.grp || (decksOf(ban).some((d) => d.custom) ? 'Meine Decks' : 'Beliebte Decks');
  const root = h('div', { class: 'screen md-pg' }, hdr('Decks', 'Deck-Werkstatt · jedes Deck gehört zu einer Banlist'));
  const top = h('div', { class: 'dk-top' }), bodyEl = h('div', { class: 'body' }); root.append(top, bodyEl);
  const dl = () => decksOf(ban);
  const fresh = (d) => ({ ...structuredClone(d), id: undefined, list: ban.list, fmt: ban.fmt });
  const open = (d) => {
    const mine = !!d.custom; const m = openModal({ title: d.name, cls: 'tall', body: deckDetail(d), footer: mine
      ? [h('button', { class: 'btn red sm', onclick: async () => { if (await confirmBox('Deck löschen?', `„${d.name}“ wirklich löschen?`, 'Löschen', 'Abbrechen', true)) { deleteCustom(d.id); m.close(); render(); } } }, 'Löschen'),
        h('button', { class: 'btn sm', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([toYdk(d)], { type: 'text/plain' })), download: d.name.replace(/[^\w\- äöüÄÖÜß]/g, '') + '.ydk' }); a.click(); } }, '⇩ .ydk'),
        h('button', { class: 'btn pri', onclick: () => { m.close(); go('editor', { deck: d }); } }, '✎ Bearbeiten')]
      : [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Schließen'), h('button', { class: 'btn pri', onclick: () => { m.close(); go('editor', { deck: { ...fresh(d), name: d.name + ' (eigene Version)' } }); } }, '✎ Als eigenes Deck bearbeiten')] });
  };
  const render = () => {
    clear(top); clear(bodyEl); const decks = dl(); const groups = GROUPS.filter((g) => g === 'Meine Decks' || decks.some((d) => d.grp === g));
    if (!groups.includes(grp)) grp = groups[0];
    top.append(banRail(ban, (b) => { ban = b; setBan(b); sub = null; q = ''; render(); }),
      h('div', { class: 'row dk-tools' }, h('input', { class: 'search', placeholder: `Deck suchen (${decks.length}) …`, value: q, oninput: (e) => { q = e.target.value; renderList(); } }),
        h('button', { class: 'btn pri sm', onclick: () => go('editor', { fmt: ban.fmt, list: ban.list }) }, '＋ Neu'),
        h('button', { class: 'btn sm', onclick: () => go('decks', { fmt: ban.fmt, list: ban.list, title: 'Als Vorlage kopieren', onPick: (d) => setTimeout(() => go('editor', { deck: { ...fresh(d), name: d.name + ' (Kopie)' } }), 60) }) }, '⧉ Vorlage'),
        h('button', { class: 'btn sm', onclick: () => importDialog(ban.fmt, (d) => go('editor', { deck: { ...d, fmt: ban.fmt, list: ban.list } })) }, '⇪ .ydk')),
      h('div', { class: 'tabs' }, groups.map((g) => h('button', { class: 'md-tab sm' + (g === grp && !q ? ' on' : ''), onclick: () => { grp = g; sub = null; q = ''; store.set('deckhub', { grp }); render(); } }, g + ' (' + decks.filter((d) => d.grp === g).length + ')'))));
    const subs = [...new Set(decks.filter((d) => d.grp === grp).map((d) => d.sub).filter(Boolean))].sort();
    if (!q && grp !== 'Meine Decks' && subs.length > 1 && subs.length < 60) top.append(h('div', { class: 'tabs' }, h('button', { class: 'chip' + (sub === null ? ' on' : ''), onclick: () => { sub = null; render(); } }, 'Alle'), subs.map((s) => h('button', { class: 'chip' + (sub === s ? ' on' : ''), onclick: () => { sub = s; render(); } }, s.replace(/^\d /, '')))));
    renderList();
  };
  const renderList = () => {
    clear(bodyEl); const decks = dl();
    const list = q ? decks.filter((d) => (d.name + ' ' + (d.sub || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 120) : decks.filter((d) => d.grp === grp && (!sub || d.sub === sub));
    const mine = grp === 'Meine Decks' && !q;
    bodyEl.append(h('div', { class: 'wrap col' },
      mine ? h('p', { class: 'muted small', style: 'margin:0 2px' }, `Eigene Decks für ${ban.t}. Sie erscheinen beim Duell unter dieser Banlist; ein Deck bleibt der Banlist zugeordnet, für die du es gebaut hast.`) : null,
      list.length ? h('div', { class: 'dk-grid' }, list.map((d) => deckRow(d, () => open(d)))) : h('div', { class: 'muted', style: 'text-align:center;padding:26px' }, mine ? 'Noch keine eigenen Decks für diese Banlist. Mit „＋ Neu“ baust du eins, mit „⧉ Vorlage“ startest du von einem fertigen Deck.' : 'Nichts gefunden.')));
  };
  render(); return root;
};
screens.workshop = (p) => screens.deckhub(p);

// ---- Einstellungen (Aufbau wie MDPro3: Seiten links, Zeilen rechts) ------------------------------------------------
const AIP_OPTS = [['relaxed', 'Entspannt'], ['normal', 'Normal'], ['fast', 'Schnell']];
const demoCfg = () => ({ opp: 'passive', goal: 'balance', ms: 15000, ...store.get('cfg.demo', {}) });
screens.settings = () => {
  const pages = [['duel', '⚔', 'Duell'], ['look', '🎨', 'Aussehen'], ['combo', '🎬', 'Kombo-Ansicht'], ['sound', '🔊', 'Ton'], ['cards', '🃏', 'Karten & Sprache'], ['player', '👤', 'Spieler'], ['data', '💾', 'Daten'], ['about', 'ℹ', 'Über']];
  let page = store.get('setpage', 'duel'); if (!pages.some((p) => p[0] === page)) page = 'duel';
  const root = h('div', { class: 'screen md-pg' }, hdr('Einstellungen')); const nav = h('div', { class: 'sx-pages' }); const rows = h('div', { class: 'sx-rows' });
  root.append(h('div', { class: 'body sx-body' }, h('div', { class: 'sx-wrap' }, nav, rows)));
  const toggle = (label, note, get, set) => h('div', { class: 'sx-row' }, h('div', { class: 'sx-l' }, h('div', { class: 'sx-n' }, label), h('div', { class: 'sx-nt' }, note)), h('label', { class: 'sx-c' }, h('input', { type: 'checkbox', class: 'sw', checked: get(), onchange: (e) => set(e.target.checked) })));
  const choice = (label, note, opts, get, set) => {
    const cur = () => Math.max(0, opts.findIndex((o) => o[0] === get())); const val = h('button', { class: 'sx-v' });
    const upd = () => { val.textContent = opts[cur()][1]; }; const step = (d) => { set(opts[(cur() + d + opts.length) % opts.length][0]); upd(); };
    upd(); val.onclick = () => step(1);
    return h('div', { class: 'sx-row' }, h('div', { class: 'sx-l' }, h('div', { class: 'sx-n' }, label), h('div', { class: 'sx-nt' }, note)), h('div', { class: 'sx-c sx-sel' }, h('button', { class: 'sx-a', onclick: () => step(-1), 'aria-label': 'Zurück' }, '‹'), val, h('button', { class: 'sx-a', onclick: () => step(1), 'aria-label': 'Weiter' }, '›')));
  };
  const text = (label, note, get, set, max = 30) => h('div', { class: 'sx-row' }, h('div', { class: 'sx-l' }, h('div', { class: 'sx-n' }, label), note ? h('div', { class: 'sx-nt' }, note) : null), h('div', { class: 'sx-c' }, h('input', { class: 'input', value: get(), maxlength: max, oninput: (e) => set(e.target.value) })));
  const picker = (label, note, items, get, set, kind) => h('div', { class: 'sx-row sx-pick' }, h('div', { class: 'sx-l' }, h('div', { class: 'sx-n' }, label), h('div', { class: 'sx-nt' }, note)),
    h('div', { class: 'pk-grid' }, items.map((it) => h('button', { class: 'pk-t' + (get() === it.id ? ' on' : '') + (unlocked(it.lock) ? '' : ' lock'), title: unlocked(it.lock) ? it.name : 'Freischalten in der Duell-Akademie', onclick: () => { if (!unlocked(it.lock)) { toast('🔒 Wird in der Duell-Akademie freigeschaltet.'); return; } set(it.id); applyLook(true); paint(); } },
      kind === 'field' ? h('div', { class: 'pk-fd', style: `background:${it.bg};--zl:${it.line}` }, h('i'), h('i'), h('i')) : it.bg ? h('div', { class: 'pk-sl', style: `background:${it.bg} center/100% 100% no-repeat` }) : h('div', { class: 'pk-sl pk-ph' }, it.id === 'random' ? '🎲' : '＝'), h('span', null, it.name)))));
  const lvOpts = Object.entries(AI_LEVELS).map(([id, l]) => [id, l.name]);
  const body = async () => {
    const P = page; const out = [];
    if (P === 'duel') out.push(
      choice('KI-Tempo', 'Wie zügig die KI zieht und wie lange ihre Effekte gezeigt werden.', AIP_OPTS, () => store.get('aipace', 'relaxed'), (v) => store.set('aipace', v)),
      choice('Animationen', 'Banner, Ketten- und Beschwörungsanzeigen. „Schnell“ zeigt sie kürzer, „Aus“ gar nicht.', [['normal', 'Normal'], ['fast', 'Schnell'], ['off', 'Aus']], () => (store.get('anim', true) ? store.get('tempo', 'fast') : 'off'), (v) => { store.set('anim', v !== 'off'); if (v !== 'off') store.set('tempo', v); }),
      choice('Stärke der KI', 'Voreinstellung für „Gegen die KI“ (im Duell-Einrichten änderbar).', lvOpts, () => store.get('cfg.level', 'normal'), (v) => store.set('cfg.level', v)),
      toggle('Tutor-Tipps im Duell', 'Zeigt einen Lampen-Knopf mit Zugvorschlägen.', () => settings.tutor, (v) => { settings.tutor = v; }),
      toggle('Große Beschwörungs-Animationen', 'Ikonische Karten (z. B. Blauäugiger w. Drache, Dunkler Magier, die Götterkarten, Sternenstaubdrache) bekommen beim Beschwören einen großen Auftritt. Antippen überspringt.', () => store.get('fx.iconic', true), (v) => store.set('fx.iconic', v)),
      toggle('… auch für Bossmonster', 'Alle mächtigen Monster bekommen den großen Auftritt: ab 3000 ATK, oder aus dem Extradeck mit Stufe/Rang ab 8 bzw. Link ab 4. Farbe und Stil nach Attribut und Typ.', () => store.get('fx.boss', true), (v) => store.set('fx.boss', v)),
      toggle('Begleiterin', 'Deine Lieblingskarte erklärt in einer Sprechblase den nächsten Zug („Mach ich!“ führt ihn aus). Braucht Tutor-Tipps.', () => store.get('buddy.on', true), (v) => store.set('buddy.on', v)),
      h('div', { class: 'sx-row' }, h('div', { class: 'sx-l' }, h('div', { class: 'sx-n' }, 'Wer ist deine Begleiterin?'), h('div', { class: 'sx-nt' }, 'Eine Karte deiner Wahl – ihr Bild erscheint im Duell neben der Sprechblase.')), h('button', { class: 'btn', onclick: () => import('./home.js').then((m) => m.pickCard('Begleiterin wählen', (c) => { store.set('buddy.code', c); toast('Begleiterin gewählt: ' + m.nameOfCard(c)); })) }, 'Wählen …')),
      toggle('Tutor sucht im Hintergrund', 'Wie in der Kombo-Ansicht: Während du am Zug bist, sucht der Tutor ab deiner Hand den besten Zug und verbessert den Vorschlag laufend. Aus = nur einfache Regel-Tipps.', () => store.get('tutor.bg', true), (v) => store.set('tutor.bg', v)),
      choice('Suchdauer pro Zug', 'Wie lange der Tutor nach einem besseren Plan sucht (er zeigt schon vorher Zwischenergebnisse).', [[8000, '8 s'], [15000, '15 s'], [30000, '30 s']], () => store.get('tutor.ms', 15000), (v) => store.set('tutor.ms', v)),
      choice('Startlebenspunkte', 'Gilt für alle Formate außer Speed Duell (dort immer 4000).', [[4000, '4000'], [8000, '8000'], [16000, '16000']], () => settings.lp, (v) => { settings.lp = v; }),
      choice('Karten auf dem Feld', 'Ganze Karte wie in den Fenstern oder nur das Kunstbild mit farbigem Rahmen.', [['full', 'Ganze Karte'], ['art', 'Nur Kunst']], () => (fieldCfg.full ? 'full' : 'art'), (v) => setFieldFull(v === 'full')));
    else if (P === 'look') out.push(
      choice('Spielfeld-Ansicht', 'Master Duel: schräges Feld, LP-Plaketten in den Ecken, runde Knöpfe, Karteninfo über „i“. Klassisch: flaches Feld mit Karteninfo links (nur Querformat).', [['md', 'Master Duel'], ['classic', 'Klassisch']], () => store.get('layout', 'md'), (v) => store.set('layout', v)),
      picker('Spielfeld-Design', 'Hintergrund und Zonen im Duell – auch das Hauptmenü übernimmt die Farben.', FIELDS, () => look.field, (v) => { look.field = v; }, 'field'),
      toggle('Bewegte Hintergründe', 'Funkelnde Sterne, Glut oder Scan-Linien bei passenden Designs. Aus spart Akku.', () => look.fx, (v) => { look.fx = v; applyLook(); }),
      picker('Meine Kartenhülle', 'Rückseite deiner Karten – auf dem Feld, im Friedhof-Stapel, im Deck.', SLEEVES, () => look.sleeve, (v) => { look.sleeve = v; }),
      picker('Hülle des Gegners', 'Rückseite der gegnerischen Karten. „Zufällig“ würfelt bei jedem Duell neu.', [{ id: 'same', name: 'Wie meine' }, { id: 'random', name: 'Zufällig' }, ...SLEEVES], () => look.sleeveOp, (v) => { look.sleeveOp = v; }));
    else if (P === 'combo') { const C = demoCfg(); const sv = (k, v) => { const c = demoCfg(); c[k] = v; store.set('cfg.demo', c); };
      out.push(choice('Gegner', 'Ob der Gegner still steht oder mitspielt und antwortet.', [['passive', 'Steht still'], ['ai', 'Spielt mit (KI)']], () => demoCfg().opp, (v) => sv('opp', v)),
        choice('Ziel der Suche', 'Wonach die Kombo-Suche – und der Tutor im Duell – das beste Endboard auswählt.', [['balance', 'Ausgewogen'], ['power', 'Stärkste Monster'], ['inter', 'Meiste Unterbrechungen']], () => demoCfg().goal, (v) => sv('goal', v)),
        toggle('Kombo-Bibliothek im Hintergrund', (() => { const S = libSummary(); return `Beim Start der App werden deine eigenen Decks immer wieder mit neuen Starthänden durchsucht (nicht während eines Duells). Tutor und Kombo-Ansicht probieren die gefundenen Kombos zuerst aus. Bisher: ${S.combos} Kombos aus ${S.runs} Suchläufen für ${S.withLib} von ${S.decks} eigenen Decks.`; })(), () => libOn(), (v) => setLibOn(v)),
        choice('Suchdauer pro Starthand', 'Je länger die Suche, desto besser die gefundene Kombo (Deckanalyse, Handtraps, Fallen, mehrfach nutzbare Karten).', [[0, 'Aus'], [8000, 'Kurz · 8 s'], [15000, 'Normal · 15 s'], [30000, 'Gründlich · 30 s']], () => demoCfg().ms, (v) => sv('ms', v)),
        h('div', { class: 'sx-hint' }, 'Die Kombo-Ansicht startest du unter Duell → Banlist wählen → Kombo-Ansicht. Die KI-Geschwindigkeit der Vorführung stellst du unter „Duell“ ein.')); void C; }
    else if (P === 'sound') out.push(toggle('Töne', 'Kleine Effekte bei Aktionen.', () => sound.on, (v) => { sound.on = v; store.set('sound', v); }));
    else if (P === 'cards') out.push(
      toggle('Kartenbilder', 'Bilder werden bei Internet einmal geladen und auf dem Gerät gemerkt. Ohne Bilder erscheinen gezeichnete Karten.', () => imgCfg.images, (v) => setImages(v)),
      App.de ? toggle('Kartentexte auf Deutsch', 'Kartennamen und Effekttexte auf Deutsch (aus = englische Originale).', () => App.lang !== 'en', (v) => { App.lang = v ? 'de' : 'en'; store.set('lang', App.lang); }) : null);
    else if (P === 'player') out.push(
      text('Spieler 1', 'Name im Duell', () => settings.names[0], (v) => { const n = [...settings.names]; n[0] = v; settings.names = n; }, 18),
      text('Spieler 2', 'Name im Duell', () => settings.names[1], (v) => { const n = [...settings.names]; n[1] = v; settings.names = n; }, 18),
      text('Widmung', 'Steht auf dem Hauptmenü', () => settings.dedication, (v) => { settings.dedication = v; }, 60));
    else if (P === 'data') { const n = await idbCount(), si = await storageInfo(); out.push(...dataPanels(n, si, () => paint())); }
    else out.push(h('div', { class: 'sx-about' }, h('b', null, 'Duellraum'), h('p', null, `Version ${VERSION}`), h('p', { class: 'muted small' }, 'Spielkern: EDOPro-Kern (ocgcore) als WebAssembly · Regeln und Kartenskripte stammen aus dem Project-Ignis-Projekt · Deck-Sammlungen aus frei zugänglichen Quellen.'), h('p', { class: 'muted small' }, 'Die Oberfläche ist in Aufbau und Verhalten an das Fan-Projekt MDPro3 angelehnt. Es wurden keine Bilder, Texte oder Programmteile von MDPro3 oder Konami übernommen. Yu-Gi-Oh! ist eine Marke von Konami; dies ist ein privates Projekt ohne Verbindung zu Konami.')));
    return out.filter(Boolean);
  };
  const paint = async () => {
    clear(nav); nav.append(...pages.map(([id, ic, t]) => h('button', { class: 'sx-pg' + (id === page ? ' on' : ''), onclick: () => { page = id; store.set('setpage', id); paint(); } }, h('span', null, ic), h('b', null, t))));
    const items = await body(); clear(rows); rows.append(h('div', { class: 'sx-title' }, pages.find((p) => p[0] === page)[2]), ...items);
  };
  paint(); return root;
};
