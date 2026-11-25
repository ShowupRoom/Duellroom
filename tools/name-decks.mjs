// Decknamen vervollständigen: Fehlen im Namen die Archetypen, die das Deck wirklich trägt, werden die wichtigsten (max. 2) angehängt;
// Abkürzungen (BES, PUNK, FA …) werden ausgeschrieben, doppelte Namen im selben Format unterscheidbar gemacht.
// Der ursprüngliche Name bleibt vorne stehen (und als nameOrig erhalten). Aufruf: node tools/name-decks.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCards } from '../test/lib.mjs';
const cards = loadCards(); const DRY = process.argv.includes('--dry');
const P = new URL('../data/decks.json', import.meta.url); const DB = JSON.parse(readFileSync(P, 'utf-8')); const L = Array.isArray(DB) ? DB : DB.decks;
const S = JSON.parse(readFileSync(new URL('../data/strings.json', import.meta.url), 'utf-8')).setname;
const FIX = { roid: '-roid', 'abyss-': 'Abyss', 'gagaga': 'Gagaga', dragontail: 'Dracotail' };
const clean = (nm) => { if (!nm) return null; const parts = nm.split('|').map((x) => x.trim()); if (parts.some((x) => GENERIC.has(x.toLowerCase()))) return null; let n = parts[0].replace(/\s+/g, ' ').trim(); n = FIX[n.toLowerCase()] || n.replace(/-$/, ''); return n; };
const setName = (s) => clean(S[s] || S[s & 0xfff]);
// zu allgemein, um ein Deck zu benennen
const GENERIC_LIST = (['Mulcharmy', 'Maxx', 'Nibiru', 'Called by', 'Ash Blossom', 'Droll', 'Ghost', 'Effect Veiler', 'Infinite Impermanence', 'Number', 'Fusion', 'Polymerization', 'Synchro', 'Xyz', 'Link', 'Ritual', 'Pendulum', 'Dragon', 'Spellcaster', 'Warrior', 'Magician', 'Change', 'Hand', 'Utopia', 'Utopic', 'Rank-Up-Magic', 'Mask', 'Forbidden', 'Monarch', 'Gate Guardian', 'Starving Venom', 'Roid', 'Sangen', 'Tenyi', 'Fiendsmith'].map((x) => x.toLowerCase()).filter((x) => x !== 'fiendsmith' && x !== 'monarch' && x !== 'roid'));
const GENERIC = new Set(GENERIC_LIST);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');
const words = (s) => s.toLowerCase().split(/[^a-z0-9äöüß!]+/).filter((w) => w.length > 2);
function archetypes(d) {
  const c = new Map(); const tot = [...d.main, ...(d.extra || [])].reduce((s, [, n]) => s + n, 0);
  for (const [code, n] of [...d.main, ...(d.extra || [])]) { const v = cards.get(code); if (!v) continue; const seen = new Set(); for (const s of v.setcodes || []) { const nm = setName(s); if (!nm || seen.has(nm)) continue; seen.add(nm); c.set(nm, (c.get(nm) || 0) + n); } }
  const min = Math.max(5, Math.round(tot * 0.1));
  return [...c.entries()].filter(([nm, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([nm]) => nm);
}
const mentioned = (name, a) => { const n = norm(name); if (n.includes(norm(a))) return true; const w = words(a); return w.length > 0 && w.every((x) => name.toLowerCase().includes(x)) || words(a).some((x) => x.length > 4 && name.toLowerCase().includes(x)); };
const changes = [];
for (const d of L) {
  const orig = d.nameOrig || d.name; const top = archetypes(d); let name = orig;
  const ac = norm(orig); const abbr = top.find((a) => ac.length <= 6 && norm(a) === ac); // „BES“ = „B.E.S.“
  if (abbr && abbr !== orig) name = abbr;
  else { const add = top.filter((a) => !mentioned(orig, a)).slice(0, 2); const hasAny = top.some((a) => mentioned(orig, a)); const take = hasAny ? add.slice(0, 1) : add; if (take.length) name = `${orig} – ${take.join(' / ')}`; }
  d._new = name; d._top = top;
}
// doppelte Namen in derselben Gruppe und demselben Format: nächster Archetyp, sonst Spielweise, sonst Nummer
const by = new Map(); for (const d of L) { const k = d.fmt + '|' + d.grp + '|' + d._new; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
for (const [, G] of by) { if (G.length < 2) continue; const used = new Set(); const styles = new Set(G.map((d) => (d.tutor && d.tutor.style) || ''));
  for (const d of G) { let nm = d._new; const extra = d._top.find((a) => !mentioned(nm, a)); const st = (d.tutor && d.tutor.style) || '';
    if (extra) nm = `${nm}${nm.includes(' – ') ? ' / ' : ' – '}${extra}`; else if (st && styles.size > 1) nm = `${nm} (${st})`;
    let i = 2; const base = nm; while (used.has(nm)) nm = `${base} (${i++})`; used.add(nm); d._new = nm; } }
for (const d of L) { if (d._new !== d.name) changes.push([d.grp, d.fmt, d.name, d._new]); if (!DRY) { if (d._new !== d.name) { d.nameOrig = d.nameOrig || d.name; d.name = d._new; } } delete d._new; delete d._top; }
if (!DRY) writeFileSync(P, JSON.stringify(DB));
console.log(`${changes.length} von ${L.length} Decknamen ${DRY ? 'würden ' : ''}ergänzt.`);
if (process.env.SHOW) for (const c of changes.slice(0, +process.env.SHOW)) console.log(`  [${c[0]}] ${c[2]}  →  ${c[3]}`);
