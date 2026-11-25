// Eigene Decks fest in die App übernehmen → data/own-decks.json (danach tools/build-decks.mjs bzw. tools/rebuild.sh)
// Eingaben (beliebig viele): Sicherungsdatei der App (duellraum-sicherung-*.json), .ydk-Dateien, Textdateien mit Deck-Links (…?deck=…)
// Aufruf: node tools/import-own.mjs datei1 [datei2 …]   – gleiche Decknamen werden ersetzt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseYdk, group } from './ydk.mjs';
import { loadCards } from '../test/lib.mjs';
const cards = loadCards(); const OUT = new URL('../data/own-decks.json', import.meta.url);
const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : [];
const unb64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
const unpack = (s) => (s ? s.split('.').filter(Boolean).map((x) => { const [c, n] = x.split('*'); return [+c, +(n || 1)]; }) : []);
const got = [];
for (const f of process.argv.slice(2)) {
  const t = readFileSync(f, 'utf-8');
  if (/\.ydk$/i.test(f)) { const r = parseYdk(t); got.push({ name: f.split('/').pop().replace(/\.ydk$/i, ''), fmt: 'advanced', list: 'tcg', main: group(r.main, cards), extra: group(r.extra, cards), side: group(r.side, cards) }); continue; }
  let j = null; try { j = JSON.parse(t); } catch (e) { /* kein JSON */ }
  if (j && j.app === 'duellraum' && j.data) { for (const d of JSON.parse(j.data['dr.decks'] || '[]')) if (d.main && d.main.length) got.push({ name: d.name, fmt: d.fmt || 'advanced', list: d.list, main: d.main, extra: d.extra || [], side: d.side || [] }); continue; }
  for (const m of t.matchAll(/[?&]deck=([A-Za-z0-9_-]+)/g)) { const o = JSON.parse(unb64(m[1])); got.push({ name: o.n, fmt: o.f || 'advanced', list: o.l, main: unpack(o.m), extra: unpack(o.e), side: unpack(o.s) }); }
}
const byName = new Map(have.map((d) => [d.name + '|' + d.fmt, d])); for (const d of got) byName.set(d.name + '|' + d.fmt, d);
const all = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
writeFileSync(OUT, JSON.stringify(all, null, 1));
const cnt = (L) => L.reduce((s, [, n]) => s + n, 0);
console.log(`${got.length} Deck(s) gelesen, insgesamt ${all.length} eigene Decks:`); for (const d of all) console.log(`  • ${d.name} (${d.fmt}${d.list && d.fmt === 'advanced' ? ' ' + d.list : ''}) – ${cnt(d.main)} / ${cnt(d.extra)} / ${cnt(d.side)}`);
