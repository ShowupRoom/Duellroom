// Baut data/lists.json: Goat (Whitelist), Edison, TCG, OCG (Verbotslisten) und Genesys (Punkte).
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCards, LFL, FET } from '../test/lib.mjs';
import { parseLflist } from './ydk.mjs';
const cards = loadCards();
const norm = (n) => n.toLowerCase().replace(/[“”]/g, '"').replace(/’/g, "'").replace(/\s*\((goat|pre-errata)\)\s*$/i, '').trim();
const byName = new Map();
for (const c of cards.values()) { const k = norm(c.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c.code); }
const codesOf = (name) => byName.get(norm(name)) || [];
const obj = (m) => Object.fromEntries(m);
const out = {};
for (const [k, f] of [['goat', 'GOAT'], ['tcg', '0TCG'], ['ocg', 'OCG']]) {
  const l = parseLflist(`${LFL}${f}.lflist.conf`); out[k] = { name: l.name, wl: l.whitelist, map: obj(l.map) };
}
// Goat: die Datei nennt teils Sondercodes (5110…, 5047…) – verlässlich ist der Kartenname im Kommentar
{
  const g = { name: out.goat.name, wl: true, map: {} }; const missG = []; let inList = false;
  for (const raw of readFileSync(`${LFL}GOAT.lflist.conf`, 'utf-8').split(/\r?\n/)) {
    if (raw.startsWith('!')) { if (inList) break; inList = true; continue; }
    const m = raw.match(/^(\d+)\s+(\d)\s*--(.*)/); if (!m) continue;
    const name = m[3].split(/\t|\s{3,}/)[0].trim(); const lim = Number(m[2]); const cs = new Set([...codesOf(name), Number(m[1])]);
    if (cs.size === 1 && !cards.has(Number(m[1]))) missG.push(name);
    for (const c of cs) g.map[c] = g.map[c] === undefined ? lim : Math.min(g.map[c], lim);
  }
  out.goat = g; if (missG.length) console.log('Goat-Namen ohne Karte:', missG.slice(0, 20), missG.length);
}
// Speed Duell: Positivliste (nur Karten des Speed-Duel-Pools); gleichnamige Karten (andere Codes) gelten mit
{
  const sp = parseLflist(`${LFL}Speed.lflist.conf`); const map = {}; const names = new Map();
  for (const raw of readFileSync(`${LFL}Speed.lflist.conf`, 'utf-8').split(/\r?\n/)) { const m = raw.match(/^(\d+)\s+(\d)\s*--(.*)/); if (m) names.set(Number(m[1]), m[3].split(/\t|\s{3,}/)[0].trim()); }
  for (const [c, lim] of sp.map) { map[c] = lim; for (const c2 of codesOf(names.get(c) || '')) map[c2] = map[c2] === undefined ? lim : Math.min(map[c2], lim); }
  out.speed = { name: sp.name, wl: true, map };
}
// Edison
const miss = [];
const ed = { name: 'Edison (März 2010, TCG)', wl: false, map: {} };
for (const line of readFileSync(FET + 'edison-list.txt', 'utf-8').trim().split('\n')) {
  const [t, ...names] = line.split('|'); const lim = t === 'F' ? 0 : t === 'L' ? 1 : 2;
  for (const n of names) { const cs = codesOf(n); if (!cs.length) miss.push('Edison: ' + n); for (const c of cs) ed.map[c] = lim; }
}
out.edison = ed;
// Genesys
const gp = { name: 'Genesys-Punkteliste', wl: false, map: {}, points: {} };
let lines = 0;
for (const line of readFileSync(FET + 'genesys-points.txt', 'utf-8').trim().split('\n')) {
  const m = line.match(/^(.*): (\d+)$/); if (!m) continue; lines++;
  const name = m[1].replace(/^"A Case for K9"$/, 'A Case for K9'); const cs = codesOf(name);
  if (!cs.length) { miss.push('Genesys: ' + name); continue; }
  for (const c of cs) gp.points[c] = Number(m[2]);
}
out.genesys = gp;
writeFileSync(new URL('../data/lists.json', import.meta.url), JSON.stringify(out));
console.log('Goat', Object.keys(out.goat.map).length, 'Edison', Object.keys(ed.map).length, 'TCG', Object.keys(out.tcg.map).length, 'OCG', Object.keys(out.ocg.map).length, 'Genesys-Karten', Object.keys(gp.points).length, '(Zeilen', lines + ')');
console.log('Nicht aufgelöst:', miss);
