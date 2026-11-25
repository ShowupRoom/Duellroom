// Sammelt alle Decks (Vorlagen, .ydk-Repo, Goat/Edison/Genesys von ygoprodeck), prüft/repariert sie und schreibt data/decks.json
import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { loadCards, goatMap, FET, SRC } from '../test/lib.mjs';
import { FORMATS, validate, repair, count } from '../src/decks.mjs';
import { group, canon, parseYdk } from './ydk.mjs';
const cards = loadCards(); const GM = goatMap(cards);
const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url), 'utf-8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseList = (s) => (s === '-' || !s ? [] : s.split(',').map((x) => x.split(':').map(Number)));
let toGoat = false;
const normalize = (l) => group(l.flatMap(([c, n]) => Array(n).fill(toGoat && GM.has(canon(c, cards)) ? GM.get(canon(c, cards)) : c)), cards);

const raw = []; // {id,name,fmt,list,grp,sub,src,main,extra,side,tutor?}
// 0) Dennis’ eigene Decks (fest eingebaut, auf beiden Handys verfügbar) – data/own-decks.json, gepflegt mit tools/import-own.mjs
{ const f = new URL('../data/own-decks.json', import.meta.url);
  if (existsSync(f)) for (const d of JSON.parse(readFileSync(f, 'utf-8'))) raw.push({ id: 'own-' + slug(d.name) + (d.fmt !== 'advanced' ? '-' + d.fmt : ''), name: d.name, fmt: d.fmt || 'advanced', list: d.list || (d.fmt === 'advanced' ? 'tcg' : d.fmt), grp: 'Dennis’ Decks', sub: '', src: 'eigenes Deck', main: d.main, extra: d.extra || [], side: d.side || [] }); }
// 1) Vorlagen (handgeschriebene Erklärungen)
for (const p of JSON.parse(readFileSync(new URL('../data/presets.json', import.meta.url), 'utf-8'))) {
  raw.push({ id: p.id, name: p.name, fmt: 'advanced', list: p.list === 'ocg' ? 'ocg' : 'tcg', grp: 'Turnier-Decks', sub: p.grp === 'own' ? 'Eigene' : p.grp.toUpperCase(), src: p.src || 'cardcluster.de', handmade: { style: p.style, goal: p.idea, plan: p.ratio, weak: p.weak },
    main: normalize(p.main.map((e) => [e[e.length - 1], e[1]])), extra: normalize(p.extra.map((e) => [e[e.length - 1], e[1]])), side: [] });
}
// 2) .ydk-Repo
for (const d of JSON.parse(readFileSync(new URL('../data/decks-ydk.json', import.meta.url), 'utf-8'))) {
  if (d.dupOf) continue;
  raw.push({ id: d.id, name: d.name, fmt: 'advanced', list: 'tcg', grp: d.grp === 'todo' ? 'Entwürfe' : d.grp, sub: d.sub, src: d.src, main: d.main, extra: d.extra, side: d.side });
}
// 2b) EDOPro-KI-Decks (ProjectIgnis/windbot): aktuelle, gut spielbare Archetyp-Decks → „Beliebte Decks“ (Advanced)
const WB = SRC + '/windbot/Decks';
if (existsSync(WB)) {
  const known = new Set(raw.map((d) => JSON.stringify([d.main.slice().sort(), d.extra.slice().sort()])));
  const pretty = (f) => f.replace(/^AI_/, '').replace(/\.ydk$/i, '').replace(/[\[\]]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/(\d{4})/, ' $1').replace(/\s+/g, ' ').trim();
  let n = 0;
  for (const f of readdirSync(WB).filter((x) => /\.ydk$/i.test(x)).sort()) {
    const r = parseYdk(readFileSync(WB + '/' + f, 'utf-8'));
    const d = { main: group(r.main, cards), extra: group(r.extra, cards), side: group(r.side, cards) };
    if (r.main.length < 30 || r.main.filter((c) => cards.has(c)).length < Math.min(35, r.main.length - 2)) continue; // zu viele Karten, die es nicht in der Datenbank gibt (Custom-Karten)
    const key = JSON.stringify([d.main.slice().sort(), d.extra.slice().sort()]); if (known.has(key)) continue; known.add(key);
    const okIn = (l) => !validate(d, { ...FORMATS.advanced, list: l }, cards, lists).length;
    const list = okIn('tcg') ? 'tcg' : okIn('ocg') ? 'ocg' : 'tcg';
    raw.push({ id: 'wb-' + slug(f.replace(/\.ydk$/i, '')), name: pretty(f), fmt: 'advanced', list, grp: 'Beliebte Decks', sub: '', src: 'EDOPro (ProjectIgnis/windbot)', main: d.main, extra: d.extra, side: d.side }); n++;
  }
  console.log('EDOPro-KI-Decks übernommen:', n);
}
// 3) Goat / Edison / Genesys
for (const [fmt, file] of [['goat', 'goat.txt'], ['edison', 'edison.txt'], ['genesys', 'genesys.txt']]) {
  toGoat = fmt === 'goat';
  for (const line of readFileSync(FET + file, 'utf-8').trim().split('\n')) {
    const [name, url, m, e, s] = line.split('|');
    raw.push({ id: `${fmt}-${slug(name)}`, name, fmt, list: FORMATS[fmt].list, grp: 'Beliebte Decks', sub: '', src: url, main: normalize(parseList(m)), extra: normalize(parseList(e)), side: normalize(parseList(s)) });
  }
}
// 3b) Speed Duell: die offiziellen Starter-Decks (data/speed-decks.json, Kartennamen → Codes)
{
  const nrm = (n) => n.toLowerCase().replace(/[“”]/g, '"').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  const by = new Map(); for (const c of cards.values()) { const k = nrm(c.name); if (!by.has(k)) by.set(k, []); by.get(k).push(c.code); }
  const sp = lists.speed.map; const miss = [];
  const pick = (name) => { const cs = (by.get(nrm(name)) || []).filter((c) => c < 100000000 || sp[c] !== undefined); if (!cs.length) return 0; return cs.find((c) => (sp[c] ?? 0) > 0 && c < 100000000) || cs.find((c) => (sp[c] ?? 0) > 0) || cs[0]; };
  const conv = (l) => l.flatMap(([n, k]) => { const c = pick(n); if (!c) { miss.push(n); return []; } return [[c, k]]; });
  for (const d of JSON.parse(readFileSync(new URL('../data/speed-decks.json', import.meta.url), 'utf-8'))) {
    const all = conv([...d.main, ...d.extra]); const isEx = (c) => cards.get(c) && ((cards.get(c).type & 0x40) || (cards.get(c).type & 0x2000) || (cards.get(c).type & 0x800000) || (cards.get(c).type & 0x4000000));
    raw.push({ id: d.id, name: d.name, fmt: 'speed', list: 'speed', grp: /Promo/.test(d.sub) ? 'Promo-Decks' : 'Starter Decks', sub: d.sub, src: d.src, main: all.filter(([c]) => !isEx(c)), extra: all.filter(([c]) => isEx(c)), side: [] });
  }
  if (miss.length) console.log('Speed-Deck-Namen ohne Karte:', miss);
}
const out = []; const stat = { ok: 0, repaired: 0, openIssues: 0 };
for (const r of raw) {
  const fmt = { ...FORMATS[r.fmt], list: r.list };
  const before = validate(r, fmt, cards, lists);
  const { deck, log } = repair(r, fmt, cards, lists);
  const after = validate(deck, fmt, cards, lists);
  const e = { ...r, ...deck, repairs: log, issues: after.map((x) => x.msg), status: after.length ? 'offen' : log.length ? 'angepasst' : 'ok', nMain: count(deck.main), nExtra: count(deck.extra), nSide: count(deck.side) };
  stat[after.length ? 'openIssues' : log.length ? 'repaired' : 'ok']++;
  out.push(e);
}
writeFileSync(new URL('../data/decks-raw.json', import.meta.url), JSON.stringify(out));
const by = {}; for (const d of out) { const k = d.fmt + ':' + d.status; by[k] = (by[k] || 0) + 1; }
console.log('Decks', out.length, stat, by);
for (const d of out.filter((x) => x.status === 'offen').slice(0, 15)) console.log('OFFEN', d.fmt, d.name, d.issues.slice(0, 2));
for (const d of out.filter((x) => x.fmt !== 'advanced' && x.repairs.length)) console.log('ANGEPASST', d.fmt, d.name, '|', d.repairs.join(' ').slice(0, 220));
