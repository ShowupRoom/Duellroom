import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readCdb } from '../src/cdb-node.mjs';
export const SP = '/tmp/claude-0/-home-claude/fdbbce0a-44a7-56cd-85ff-0f0cc9a17a48/scratchpad';
/** Wurzel der Rohdaten (ProjectIgnis-Repos); in GitHub Actions per SRC gesetzt */
export const SRC = process.env.SRC || SP;
export const SCRIPTS = process.env.SCRIPTS || SRC + '/ocg/scripts';
export const CDB = SRC + '/babel/BabelCDB/cards.cdb';
const DBDIR = SRC + '/babel/BabelCDB/';
export const LFL = SRC + '/lflists/repo/';
export const FET = new URL('../sources/fetched/', import.meta.url).pathname;
/** cards.cdb + Vorabveröffentlichungen + Goat-Einträge (nur Karten, die cards.cdb nicht kennt, kommen dazu) */
export function loadCards() {
  const cards = readCdb(CDB);
  for (const f of readdirSync(DBDIR).filter((x) => /^(prerelease-|release-).*\.cdb$/.test(x)).sort()) { const t = readCdb(DBDIR + f, new Map()); for (const [k, v] of t) if (!cards.has(k)) cards.set(k, v); }
  readCdb(DBDIR + 'goat-entries.cdb', cards);
  return cards;
}
/** Originalcode → Goat-Code (für Goat-Format: Karten mit angepasstem Goat-Text) */
export function goatMap(cards) { const m = new Map(); for (const c of cards.values()) if (c.code >= 504700000 && c.code < 504800000 && c.alias) m.set(c.alias, c.code); return m; }
export function scriptReader(mode = 'official') {
  return (name) => {
    if (/^c\d+\.lua$/.test(name)) {
      for (const dir of mode === 'goat' ? ['goat', 'pre-errata', 'official'] : mode === 'edison' ? ['pre-errata', 'official', 'pre-release'] : ['official', 'pre-release', 'pre-errata']) {
        const f = path.join(SCRIPTS, dir, name);
        if (existsSync(f)) return readFileSync(f, 'utf-8');
      }
      return '';
    }
    const f = path.join(SCRIPTS, name);
    return existsSync(f) ? readFileSync(f, 'utf-8') : '';
  };
}
export function presets() { return JSON.parse(readFileSync(new URL('../data/presets.json', import.meta.url), 'utf-8')); }
export function deckCodes(p) {
  const expand = (l) => l.flatMap((e) => Array(e[1]).fill(e[e.length - 1]));
  return { main: expand(p.main), extra: expand(p.extra) };
}
export function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
