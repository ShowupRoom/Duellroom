// Packt Skripte, Karten und Decks in komprimierte Blöcke (gzip, später base64 im HTML).
import { readFileSync, readdirSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
mkdirSync('app/dist', { recursive: true });
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { loadCards, SCRIPTS } from '../test/lib.mjs';

function clean(src) {
  const out = []; let close = null;
  for (const raw of src.replace(/[^\x00-\x7f]/g, '?').replace(/\r/g, '').split('\n')) {
    if (close) { if (raw.includes(close)) close = null; continue; }
    const m = raw.match(/^\s*--\[(=*)\[/);
    if (m) { const c = ']' + m[1] + ']'; if (!raw.slice(raw.indexOf('--[') + 3).includes(c)) close = c; continue; }
    if (/^\s*--/.test(raw)) continue;
    if (raw.trim().length) out.push(raw);
  }
  return out.join('\n');
}
const parts = []; const index = {}; let off = 0; let rawTotal = 0, outTotal = 0;
const add = (key, text) => { const b = Buffer.from(text, 'latin1'); parts.push(b); index[key] = [off, b.length]; off += b.length; };
for (const f of readdirSync(SCRIPTS)) { const p = path.join(SCRIPTS, f); if (statSync(p).isFile() && f.endsWith('.lua')) { const t = readFileSync(p, 'utf-8'); rawTotal += t.length; const c = clean(t); outTotal += c.length; add(f, c); } }
for (const [dir, pre] of [['official', 'o'], ['pre-release', 'p'], ['pre-errata', 'e'], ['goat', 'g']]) {
  for (const f of readdirSync(path.join(SCRIPTS, dir))) { if (!f.endsWith('.lua')) continue; const t = readFileSync(path.join(SCRIPTS, dir, f), 'utf-8'); rawTotal += t.length; const c = clean(t); outTotal += c.length; add(`${pre}/${f}`, c); }
}
const head = Buffer.from(JSON.stringify(index) + '\n', 'latin1');
const blob = Buffer.concat([Buffer.from(String(head.length).padStart(10, '0'), 'latin1'), head, ...parts]);
const gz = gzipSync(blob, { level: 9 });
writeFileSync('app/dist/scripts.gz', gz);
console.log('Skripte', Object.keys(index).length, 'roh', (rawTotal / 1e6).toFixed(1), 'MB → bereinigt', (outTotal / 1e6).toFixed(1), 'MB → gz', (gz.length / 1e6).toFixed(2), 'MB');

// Karten
const cards = loadCards(); const rows = [];
for (const c of cards.values()) rows.push([c.code, c.alias, c.setcodes, c.type, c.level, c.attribute, String(c.race), c.attack, c.defense, c.lscale, c.rscale, c.name, c.desc, c.strs.filter(Boolean).length ? c.strs : 0, c.ot || 0]);
const cj = gzipSync(Buffer.from(JSON.stringify(rows)), { level: 9 });
writeFileSync('app/dist/cards.gz', cj);
console.log('Karten', rows.length, 'gz', (cj.length / 1e6).toFixed(2), 'MB');
const data = { decks: JSON.parse(readFileSync('data/decks.json', 'utf-8')), lists: JSON.parse(readFileSync('data/lists.json', 'utf-8')), strings: JSON.parse(readFileSync('data/strings.json', 'utf-8')) };
const dj = gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
writeFileSync('app/dist/data.gz', dj);
console.log('Daten gz', (dj.length / 1e6).toFixed(2), 'MB');
