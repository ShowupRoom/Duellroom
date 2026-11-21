// Auswahlfenster zu allen Entscheidungen, die der Spielkern verlangt
import { h, clear, toast, zkey as key } from './util.js';
import { App, nameOf, cardOf, cleanName } from './data.js';
import { OcgResponseType as R, OcgMessageType as MSG, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, LOC, OcgPosition as POS, placesFromMask, sumSelectionValid } from '../../src/core.mjs';
import { cardMatchesOpcode } from 'ocgcore-wasm';
import { cardEl } from './cards.js';
import { openModal } from './ui.js';
import { sys, descText, PHASE, RACE_BITS, ATTR_BITS, fill } from './strings.js';
import { idleTip, battleTip, chainTip } from './tips.js';

const M = (D, o) => openModal({ host: D.root, ...o });
const FIELD = LOC.MZONE | LOC.SZONE;
export async function ask(D, msg) {
  switch (msg.type) {
    case MSG.SELECT_IDLECMD: return askIdle(D, msg);
    case MSG.SELECT_BATTLECMD: return askBattle(D, msg);
    case MSG.SELECT_CARD: return askCards(D, msg, 'card');
    case MSG.SELECT_TRIBUTE: return askCards(D, msg, 'tribute');
    case MSG.SELECT_SUM: return askCards(D, msg, 'sum');
    case MSG.SELECT_UNSELECT_CARD: return askUnselect(D, msg);
    case MSG.SELECT_CHAIN: return askChain(D, msg);
    case MSG.SELECT_EFFECTYN: return askEffectYN(D, msg);
    case MSG.SELECT_YESNO: return askYesNo(D, msg);
    case MSG.SELECT_OPTION: return askOption(D, msg);
    case MSG.SELECT_PLACE: case MSG.SELECT_DISFIELD: return askPlace(D, msg);
    case MSG.SELECT_POSITION: return askPosition(D, msg);
    case MSG.SELECT_COUNTER: return askCounter(D, msg);
    case MSG.SORT_CARD: case MSG.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
    case MSG.ANNOUNCE_RACE: return askRace(D, msg);
    case MSG.ANNOUNCE_ATTRIB: return askAttrib(D, msg);
    case MSG.ANNOUNCE_NUMBER: return askNumber(D, msg);
    case MSG.ANNOUNCE_CARD: return askAnnounceCard(D, msg);
    case MSG.ROCK_PAPER_SCISSORS: return askRps(D, msg);
    default: throw new Error('Unbekannte Auswahl ' + msg.type);
  }
}

// ---------------------------------------------------------------- Hauptphase & Kampf
function register(D, c, kind, label, resp, pri) {
  const k = key(c.controller, c.location, c.sequence); const rec = { kind, code: c.code, key: k, label, resp, pri };
  if (!D.acts.has(k)) D.acts.set(k, []); D.acts.get(k).push(rec); D.actList.push(rec); return rec;
}
function askIdle(D, msg) {
  D.acts = new Map(); D.actList = [];
  const r = (action, index) => ({ type: R.SELECT_IDLECMD, action, index });
  msg.summons.forEach((c, i) => register(D, c, 'summon', sys(1151, 'Normalbeschwörung'), r(IA.SELECT_SUMMON, i), true));
  msg.special_summons.forEach((c, i) => register(D, c, 'special', sys(1152, 'Spezialbeschwörung'), r(IA.SELECT_SPECIAL_SUMMON, i), true));
  msg.pos_changes.forEach((c, i) => register(D, c, 'pos', 'Kampfposition ändern', r(IA.SELECT_POS_CHANGE, i)));
  msg.monster_sets.forEach((c, i) => register(D, c, 'set', sys(1153, 'Setzen'), r(IA.SELECT_MONSTER_SET, i)));
  msg.spell_sets.forEach((c, i) => register(D, c, 'spellset', sys(1153, 'Setzen'), r(IA.SELECT_SPELL_SET, i)));
  msg.activates.forEach((c, i) => { const d = descText(c.description, c.code); register(D, c, 'activate', 'Aktivieren' + (d && c.description > 0n ? ': ' + d.replace(/\s+/g, ' ').slice(0, 90) : ''), r(IA.SELECT_ACTIVATE, i), true); });
  const btns = [];
  if (msg.to_bp) btns.push({ label: '⚔ Kampf', cls: 'gold', onclick: () => D.answer(r(IA.TO_BP, null)) });
  if (msg.to_ep) btns.push({ label: 'Zug beenden ⏭', cls: 'red', onclick: () => D.answer(r(IA.TO_EP, null)) });
  const n = D.actList.length;
  D.setTip(D.conf.tutor ? idleTip(D, msg) : null); if (D.conf.tutor) D.tipBtn.classList.add('pulse');
  D.setBar(`${D.pname(msg.player)} · ${PHASE[D.phase] || 'Main Phase'}`, btns, n ? 'Tippe auf eine leuchtende Karte' : 'Keine Aktion möglich – beende die Phase');
  const p = D.wait('idle'); D.render(); return p;
}
function askBattle(D, msg) {
  D.acts = new Map(); D.actList = [];
  const r = (action, index) => ({ type: R.SELECT_BATTLECMD, action, index });
  msg.attacks.forEach((c, i) => register(D, c, 'attack', 'Angreifen' + (c.can_direct ? ' (direkt möglich)' : ''), r(BA.SELECT_BATTLE, i), true));
  msg.chains.forEach((c, i) => { const d = descText(c.description, c.code); register(D, c, 'activate', 'Aktivieren' + (d && c.description > 0n ? ': ' + d.slice(0, 90) : ''), r(BA.SELECT_CHAIN, i), true); });
  const btns = [];
  if (msg.to_m2) btns.push({ label: 'Main Phase 2', cls: 'gold', onclick: () => D.answer(r(BA.TO_M2, null)) });
  if (msg.to_ep) btns.push({ label: 'Zug beenden ⏭', cls: 'red', onclick: () => D.answer(r(BA.TO_EP, null)) });
  D.setTip(D.conf.tutor ? battleTip(D, msg) : null); if (D.conf.tutor) D.tipBtn.classList.add('pulse');
  D.setBar(`${D.pname(msg.player)} · Kampfphase`, btns, msg.attacks.length ? 'Tippe ein leuchtendes Monster an, um anzugreifen' : 'Keine Angriffe möglich');
  const p = D.wait('battle'); D.render(); return p;
}

// ---------------------------------------------------------------- Kartenauswahl
const sk = (s) => key(s.controller, s.location, s.sequence);
const onField = (D, list) => list.length > 0 && list.every((s) => (s.location & FIELD) && !(s.location & LOC.OVERLAY) && D.cardAt(s.controller, s.location, s.sequence)) && new Set(list.map(sk)).size === list.length;
function candLabel(D, s) { return D.selVisible(s) ? cleanName(nameOf(s.code)) : 'Verdeckte Karte'; }

/** Auswahl direkt auf dem Spielfeld (Karten leuchten, Antippen wählt aus) */
function fieldSelect(D, items, o) {
  return new Promise((resolve) => {
    const chosen = new Set(); let last = '';
    const keys = items.map(sk);
    const resp = (idx) => o.respond(idx);
    const bar = () => {
      const idx = [...chosen].sort((a, b) => a - b); const ok = o.valid(idx);
      const btns = [];
      if (o.cancel) btns.push({ label: 'Abbrechen', cls: 'ghost', onclick: () => D.answer(resp(null)) });
      btns.push({ label: o.finishLabel || 'Bestätigen', cls: 'pri', disabled: !ok, onclick: () => { D.answer(resp(idx)); } });
      D.setBar(o.title, btns, `${o.count ? o.count(idx) : idx.length + ' gewählt'}${last ? ' · ' + last : ''}`);
    };
    const toggle = (i) => {
      if (chosen.has(i)) chosen.delete(i);
      else { if (o.max && chosen.size >= o.max) { if (o.max === 1) chosen.clear(); else { toast(`Höchstens ${o.max} Karten.`); return; } } chosen.add(i); }
      last = candLabel(D, items[i]); D.chosen = new Set([...chosen].map((j) => keys[j])); D.render(); bar();
    };
    D.cand = new Map(items.map((s, i) => [keys[i], () => toggle(i)]));
    D.setTip(null); const p = D.wait('select'); p.then(resolve); D.render(); bar();
  });
}
/** Auswahl in einem Fenster (für Hand, Deck, Friedhof …) */
function modalSelect(D, items, o) {
  return new Promise((resolve) => {
    const chosen = new Set(o.pre || []); const grid = h('div', { class: 'cgrid' }); const cnt = h('span', { class: 'small muted grow' });
    const done = (v) => { m.close(); resolve(v); };
    const ok = h('button', { class: 'btn pri', onclick: () => done([...chosen].sort((a, b) => a - b)) }, o.finishLabel || 'Bestätigen');
    const upd = () => { const idx = [...chosen]; ok.disabled = !o.valid(idx); cnt.textContent = o.count ? o.count(idx.sort((a, b) => a - b)) : `${idx.length} gewählt`; };
    items.forEach((s, i) => {
      const vis = D.selVisible(s); const b = h('div', { class: 'cg' + (chosen.has(i) ? ' chosen' : '') },
        h('button', { class: 'cg-c', onclick: () => { if (chosen.has(i)) chosen.delete(i); else { if (o.max && chosen.size >= o.max) { if (o.max === 1) { chosen.clear(); [...grid.children].forEach((x) => x.classList.remove('chosen')); } else { toast(`Höchstens ${o.max} Karten.`); return; } } chosen.add(i); } b.classList.toggle('chosen', chosen.has(i)); upd(); } }, vis ? cardEl(s.code, { cls: 'md' }) : cardEl(0, { back: true, cls: 'md' }), o.badge ? h('span', { class: 'bdg' }, o.badge(s, i)) : null),
        h('div', { class: 'small cg-n' }, candLabel(D, s)), vis ? h('button', { class: 'cg-i', onclick: () => D.info(s.code) }, 'ⓘ') : null);
      grid.append(b);
    });
    const foot = [cnt]; if (o.cancel) foot.push(h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Abbrechen')); foot.push(ok);
    const m = M(D, { title: o.title, sticky: true, body: grid, footer: foot, cls: 'tall' }); upd();
  });
}
async function askCards(D, msg, kind) {
  const list = msg.selects; const n = list.length; let min, max, valid, respond, count, badge, pre;
  if (kind === 'sum') {
    min = msg.min; max = msg.max || n; const must = msg.selects_must || [];
    valid = (idx) => sumSelectionValid(msg, idx); respond = (idx) => ({ type: R.SELECT_SUM, indicies: idx || [] });
    const val = (a) => { const lo = a & 0xffff, hi = a >>> 16; return hi && hi !== lo ? `${lo}/${hi}` : `${lo}`; };
    badge = (s) => val(s.amount);
    count = (idx) => { const tot = idx.reduce((a, i) => a + (list[i].amount & 0xffff), 0) + must.reduce((a, c) => a + (c.amount & 0xffff), 0); return `Summe ${tot} von ${msg.amount}${must.length ? ` (inkl. ${must.length} Pflicht)` : ''}`; };
  } else {
    min = Math.min(msg.min, n); max = Math.min(msg.max || n, n);
    valid = (idx) => idx.length >= min && idx.length <= max;
    respond = (idx) => (kind === 'tribute' ? { type: R.SELECT_TRIBUTE, indicies: idx } : { type: R.SELECT_CARD, indicies: idx });
    if (kind === 'tribute') { badge = (s) => (s.release_param > 1 ? `×${s.release_param}` : ''); valid = (idx) => idx.length >= Math.min(1, n) && idx.length <= max; }
    count = (idx) => `${idx.length} von ${min === max ? max : `${min}–${max}`} gewählt`;
    if (!msg.can_cancel && n > 0 && min >= n && kind === 'card') return respond(list.map((_, i) => i));
  }
  const title = D.hintText || (kind === 'tribute' ? 'Wähle die Monster, die du opferst' : kind === 'sum' ? 'Wähle Karten für die Summe' : 'Wähle Karten');
  const o = { title, min, max, valid, respond, count, badge, cancel: !!msg.can_cancel && kind !== 'sum' };
  const items = list;
  let idx;
  if (onField(D, items)) { const r = await fieldSelect(D, items, { ...o, respond: (i) => (i === null ? (kind === 'tribute' ? { type: R.SELECT_TRIBUTE, indicies: null } : { type: R.SELECT_CARD, indicies: null }) : respond(i)) }); return r; }
  idx = await modalSelect(D, items, o);
  return idx === null ? (kind === 'tribute' ? { type: R.SELECT_TRIBUTE, indicies: null } : { type: R.SELECT_CARD, indicies: null }) : respond(idx);
}
async function askUnselect(D, msg) {
  const sel = msg.select_cards, uns = msg.unselect_cards; const all = [...sel, ...uns];
  const title = D.hintText || 'Wähle Karten'; const sub = `${uns.length} gewählt${msg.min ? ` · mindestens ${msg.min}` : ''}${msg.max ? `, höchstens ${msg.max}` : ''}`;
  if (onField(D, all)) {
    D.cand = new Map(); D.chosen = new Set(uns.map(sk));
    sel.forEach((s, i) => D.cand.set(sk(s), () => D.answer({ type: R.SELECT_UNSELECT_CARD, index: i })));
    uns.forEach((s, j) => D.cand.set(sk(s), () => D.answer({ type: R.SELECT_UNSELECT_CARD, index: sel.length + j })));
    const btns = []; if (msg.can_cancel && !msg.can_finish) btns.push({ label: 'Abbrechen', cls: 'ghost', onclick: () => D.answer({ type: R.SELECT_UNSELECT_CARD, index: null }) });
    if (msg.can_finish) btns.push({ label: 'Fertig ✓', cls: 'pri', onclick: () => D.answer({ type: R.SELECT_UNSELECT_CARD, index: null }) });
    D.setTip(null); D.setBar(title, btns, sub + ' · antippen zum Wählen/Abwählen'); const p = D.wait('unselect'); D.render(); return p;
  }
  return new Promise((resolve) => {
    const grid = h('div', { class: 'cgrid' }); const fin = (v) => { m.close(); resolve({ type: R.SELECT_UNSELECT_CARD, index: v }); };
    const mk = (s, idx, chosen) => { const vis = D.selVisible(s); return h('div', { class: 'cg' + (chosen ? ' chosen' : '') }, h('button', { class: 'cg-c', onclick: () => fin(idx) }, vis ? cardEl(s.code, { cls: 'md' }) : cardEl(0, { back: true, cls: 'md' })), h('div', { class: 'small cg-n' }, candLabel(D, s)), vis ? h('button', { class: 'cg-i', onclick: () => D.info(s.code) }, 'ⓘ') : null); };
    sel.forEach((s, i) => grid.append(mk(s, i, false))); uns.forEach((s, j) => grid.append(mk(s, sel.length + j, true)));
    const foot = [h('span', { class: 'small muted grow' }, sub)]; if (msg.can_cancel && !msg.can_finish) foot.push(h('button', { class: 'btn ghost', onclick: () => fin(null) }, 'Abbrechen')); if (msg.can_finish) foot.push(h('button', { class: 'btn pri', onclick: () => fin(null) }, 'Fertig ✓'));
    const m = M(D, { title, sticky: true, body: grid, footer: foot, cls: 'tall' });
  });
}

// ---------------------------------------------------------------- Kette, Ja/Nein, Optionen
function ctxLines(D) { return D.logLines.slice(-2).map((l) => h('div', { class: 'small muted' }, l)); }
function askChain(D, msg) {
  if (!msg.selects.length && !msg.forced) return Promise.resolve({ type: R.SELECT_CHAIN, index: null }); // nichts möglich → nicht fragen
  return new Promise((resolve) => {
    const tip = D.conf.tutor ? chainTip(D, msg) : null;
    const fin = (i) => { m.close(); resolve({ type: R.SELECT_CHAIN, index: i }); };
    const rows = msg.selects.map((s, i) => { const d = descText(s.description, s.code); return h('div', { class: 'ch-row' }, h('button', { onclick: () => D.info(s.code) }, cardEl(s.code, { cls: 'sm' })), h('div', { class: 'grow' }, h('b', null, cleanName(nameOf(s.code))), h('div', { class: 'small muted' }, (d && s.description > 0n ? d : 'Effekt aktivieren').slice(0, 130))), h('button', { class: 'btn pri sm', onclick: () => fin(i) }, 'Aktivieren')); });
    const body = h('div', { class: 'col' }, ctxLines(D), rows, tip ? h('div', { class: 'tutor panel small' }, '💡 ' + tip.text) : null);
    const m = M(D, { title: msg.forced ? 'Ein Effekt löst aus' : 'Möchtest du antworten?', sticky: true, cls: 'peek', body, footer: msg.forced ? null : h('button', { class: 'btn', onclick: () => fin(null) }, 'Nein, weiter') });
  });
}
function askEffectYN(D, msg) {
  return new Promise((resolve) => {
    const name = cleanName(nameOf(msg.code)); const d = descText(msg.description, msg.code);
    const text = d ? fill(d, name, name) : `Möchtest du den Effekt von «${name}» aktivieren?`;
    const fin = (y) => { m.close(); resolve({ type: R.SELECT_EFFECTYN, yes: y }); };
    const m = M(D, { title: 'Effekt aktivieren?', sticky: true, cls: 'peek', body: h('div', { class: 'row' }, h('button', { onclick: () => D.info(msg.code) }, cardEl(msg.code, { cls: 'sm' })), h('div', { class: 'grow' }, h('b', null, name), h('div', { class: 'small' }, text))), footer: [h('button', { class: 'btn', onclick: () => fin(false) }, 'Nein'), h('button', { class: 'btn pri', onclick: () => fin(true) }, 'Ja')] });
  });
}
function askYesNo(D, msg) {
  return new Promise((resolve) => {
    const d = descText(msg.description) || 'Bist du einverstanden?'; const fin = (y) => { m.close(); resolve({ type: R.SELECT_YESNO, yes: y }); };
    const m = M(D, { title: 'Entscheidung', sticky: true, cls: 'peek', body: h('p', { style: 'margin:4px 0' }, fill(d, '', '')), footer: [h('button', { class: 'btn', onclick: () => fin(false) }, 'Nein'), h('button', { class: 'btn pri', onclick: () => fin(true) }, 'Ja')] });
  });
}
function askOption(D, msg) {
  return new Promise((resolve) => {
    const fin = (i) => { m.close(); resolve({ type: R.SELECT_OPTION, index: i }); };
    const m = M(D, { title: D.hintText || 'Wähle eine Option', sticky: true, cls: 'peek', body: h('div', { class: 'col' }, msg.options.map((o, i) => h('button', { class: 'btn', style: 'justify-content:flex-start;text-align:left;height:auto;padding:10px 14px', onclick: () => fin(i) }, descText(o) || `Option ${i + 1}`))) });
  });
}

// ---------------------------------------------------------------- Zonen, Position, Zähler
function askPlace(D, msg) {
  const isDis = msg.type === MSG.SELECT_DISFIELD; const list = placesFromMask(msg.field_mask >>> 0, msg.player);
  const count = msg.count || 1; const type = isDis ? R.SELECT_DISFIELD : R.SELECT_PLACE;
  const toResp = (ks) => ({ type, places: ks.map((k) => { const [player, location, sequence] = k.split(':').map(Number); return { player, location, sequence }; }) });
  const allowed = new Set(list.map((z) => key(z.player, z.location, z.sequence)));
  if (allowed.size <= count) return Promise.resolve(toResp([...allowed]));
  return new Promise((resolve) => {
    const chosen = new Set(); D.setTip(null);
    const upd = () => { D.zoneSel = { allowed, chosen, count, toggle }; D.render(); D.setBar(D.hintText || (isDis ? 'Wähle Zonen, die gesperrt werden' : 'Wähle eine Zone'), [{ label: 'Bestätigen', cls: 'pri', disabled: chosen.size !== count, onclick: () => D.answer(toResp([...chosen])) }], `${chosen.size} von ${count} gewählt · leuchtende Zonen antippen`); };
    const toggle = (k) => { if (chosen.has(k)) chosen.delete(k); else { if (chosen.size >= count) { if (count === 1) chosen.clear(); else { toast(`Es sind ${count} Zonen zu wählen.`); return; } } chosen.add(k); } if (count === 1 && chosen.size === 1) { D.zoneSel = { allowed, chosen, count, toggle }; D.answer(toResp([...chosen])); return; } upd(); };
    D.wait('place').then(resolve); upd();
  });
}
function askPosition(D, msg) {
  const opts = [[POS.FACEUP_ATTACK, 'Angriff (offen)'], [POS.FACEUP_DEFENSE, 'Verteidigung (offen)'], [POS.FACEDOWN_DEFENSE, 'Verdeckt in Verteidigung'], [POS.FACEDOWN_ATTACK, 'Verdeckt in Angriff']].filter(([v]) => msg.positions & v);
  if (opts.length === 1) return Promise.resolve({ type: R.SELECT_POSITION, position: opts[0][0] });
  return new Promise((resolve) => {
    const fin = (v) => { m.close(); resolve({ type: R.SELECT_POSITION, position: v }); };
    const m = M(D, { title: 'In welcher Position?', sticky: true, cls: 'peek', body: h('div', { class: 'row' }, cardEl(msg.code, { cls: 'md' }), h('div', { class: 'col grow' }, opts.map(([v, t]) => h('button', { class: 'btn', onclick: () => fin(v) }, t)))) });
  });
}
function askCounter(D, msg) {
  return new Promise((resolve) => {
    const vals = msg.cards.map(() => 0); const tot = () => vals.reduce((a, b) => a + b, 0);
    const info = h('div', { class: 'small muted grow' }); const ok = h('button', { class: 'btn pri', onclick: () => { m.close(); resolve({ type: R.SELECT_COUNTER, counters: vals }); } }, 'Bestätigen');
    const upd = () => { info.textContent = `${tot()} von ${msg.count} Zählern`; ok.disabled = tot() !== msg.count; rows.forEach((r, i) => { r.num.textContent = vals[i]; }); };
    const rows = msg.cards.map((c, i) => { const num = h('b', null, '0'); return { num, el: h('div', { class: 'row' }, cardEl(c.code, { cls: 'sm' }), h('div', { class: 'grow' }, nameOf(c.code), h('div', { class: 'small muted' }, `${c.count} vorhanden`)), h('button', { class: 'ibtn', onclick: () => { if (vals[i] > 0) { vals[i]--; upd(); } } }, '−'), num, h('button', { class: 'ibtn', onclick: () => { if (vals[i] < c.count && tot() < msg.count) { vals[i]++; upd(); } } }, '+')) }; });
    const m = M(D, { title: `Entferne ${msg.count} Zähler`, sticky: true, body: h('div', { class: 'col' }, rows.map((r) => r.el)), footer: [info, ok] }); upd();
  });
}

// ---------------------------------------------------------------- Ansagen
function bitsOf(av, table) { const b = BigInt(av); return table.filter(([v]) => b & BigInt(v)); }
function askRace(D, msg) {
  return new Promise((resolve) => {
    const opts = bitsOf(msg.available, RACE_BITS); const chosen = new Set(); const need = msg.count || 1;
    const ok = h('button', { class: 'btn pri', disabled: true, onclick: () => { m.close(); resolve({ type: R.ANNOUNCE_RACE, races: [...chosen].map((v) => BigInt(v)) }); } }, 'Bestätigen');
    const m = M(D, { title: need > 1 ? `Wähle ${need} Typen` : 'Wähle einen Typ', sticky: true, body: h('div', { class: 'tags' }, opts.map(([v, n]) => { const b = h('button', { class: 'chip', onclick: () => { if (chosen.has(v)) chosen.delete(v); else { if (chosen.size >= need) { if (need === 1) { chosen.clear(); [...b.parentNode.children].forEach((x) => x.classList.remove('on')); } else return; } chosen.add(v); } b.classList.toggle('on', chosen.has(v)); ok.disabled = chosen.size !== need; } }, n); return b; })), footer: ok });
  });
}
function askAttrib(D, msg) {
  return new Promise((resolve) => {
    const opts = bitsOf(msg.available, ATTR_BITS); const chosen = new Set(); const need = msg.count || 1;
    const ok = h('button', { class: 'btn pri', disabled: true, onclick: () => { m.close(); resolve({ type: R.ANNOUNCE_ATTRIB, attributes: [...chosen] }); } }, 'Bestätigen');
    const m = M(D, { title: need > 1 ? `Wähle ${need} Attribute` : 'Wähle ein Attribut', sticky: true, body: h('div', { class: 'tags' }, opts.map(([v, n]) => { const b = h('button', { class: 'chip', onclick: () => { if (chosen.has(v)) chosen.delete(v); else { if (chosen.size >= need) { if (need === 1) { chosen.clear(); [...b.parentNode.children].forEach((x) => x.classList.remove('on')); } else return; } chosen.add(v); } b.classList.toggle('on', chosen.has(v)); ok.disabled = chosen.size !== need; } }, n); return b; })), footer: ok });
  });
}
function askNumber(D, msg) {
  return new Promise((resolve) => { const m = M(D, { title: 'Wähle eine Zahl', sticky: true, body: h('div', { class: 'tags' }, msg.options.map((v, i) => h('button', { class: 'chip', onclick: () => { m.close(); resolve({ type: R.ANNOUNCE_NUMBER, value: i }); } }, String(v)))) }); });
}
function askAnnounceCard(D, msg) {
  return new Promise((resolve) => {
    let all = null; const list = h('div', { class: 'cgrid' }); let q = '';
    const find = () => { if (!all) { all = []; for (const c of App.cards.values()) if (c.code < 504700000 || c.code >= 504800000) { try { if (cardMatchesOpcode(c, msg.opcodes)) all.push(c); } catch (e) { /* */ } } } };
    const paint = () => { find(); clear(list); const ql = q.toLowerCase(); const res = all.filter((c) => !ql || c.name.toLowerCase().includes(ql)).slice(0, 60); if (!res.length) list.append(h('p', { class: 'muted' }, 'Keine passende Karte.')); res.forEach((c) => list.append(h('button', { class: 'cg', onclick: () => { m.close(); resolve({ type: R.ANNOUNCE_CARD, card: c.code }); } }, cardEl(c.code, { cls: 'sm' }), h('div', { class: 'small cg-n' }, cleanName(c.name))))); };
    const m = M(D, { title: D.hintText || 'Nenne eine Karte', sticky: true, cls: 'tall', body: h('div', null, h('input', { class: 'search', placeholder: 'Kartenname (englisch) eintippen …', oninput: (e) => { q = e.target.value; paint(); } }), h('div', { style: 'height:10px' }), list) }); paint();
  });
}
function askRps(D, msg) {
  return new Promise((resolve) => { const m = M(D, { title: 'Schere, Stein, Papier', sticky: true, center: true, body: h('div', { class: 'row', style: 'justify-content:center' }, [[1, '✌ Schere'], [2, '✊ Stein'], [3, '✋ Papier']].map(([v, t]) => h('button', { class: 'btn lg', onclick: () => { m.close(); resolve({ type: R.ROCK_PAPER_SCISSORS, value: v }); } }, t))) }); });
}
