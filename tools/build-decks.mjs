// Sammelt alle Decks (Vorlagen, .ydk-Repo, Goat/Edison/Genesys von ygoprodeck), prüft/repariert sie und schreibt data/decks.json
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCards, goatMap, FET } from '../test/lib.mjs';
import { FORMATS, validate, repair, count } from '../src/decks.mjs';
import { group, canon } from './ydk.mjs';
const cards = loadCards(); const GM = goatMap(cards);
const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url), 'utf-8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseList = (s) => (s === '-' || !s ? [] : s.split(',').map((x) => x.split(':').map(Number)));
let toGoat = false;
const normalize = (l) => group(l.flatMap(([c, n]) => Array(n).fill(toGoat && GM.has(canon(c, cards)) ? GM.get(canon(c, cards)) : c)), cards);

const raw = []; // {id,name,fmt,list,grp,sub,src,main,extra,side,tutor?}
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
// 3) Goat / Edison / Genesys
for (const [fmt, file] of [['goat', 'goat.txt'], ['edison', 'edison.txt'], ['genesys', 'genesys.txt']]) {
  toGoat = fmt === 'goat';
  for (const line of readFileSync(FET + file, 'utf-8').trim().split('\n')) {
    const [name, url, m, e, s] = line.split('|');
    raw.push({ id: `${fmt}-${slug(name)}`, name, fmt, list: FORMATS[fmt].list, grp: 'Beliebte Decks', sub: '', src: url, main: normalize(parseList(m)), extra: normalize(parseList(e)), side: normalize(parseList(s)) });
  }
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
