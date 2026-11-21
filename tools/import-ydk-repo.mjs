// Importiert alle .ydk-Dateien eines Ordners (z. B. anonfansub/ygodecks) in data/decks-ydk.json
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadCards, SCRIPTS, SP } from '../test/lib.mjs';
import { parseYdk, parseLflist, needsScript, typeLetter, canon, group, checkAgainstList } from './ydk.mjs';

const ROOT = process.argv[2] || SP + '/decks/src/ygodecks';
const OUT = process.argv[3] || new URL('../data/decks-ydk.json', import.meta.url).pathname;
const SRC = process.argv[4] || 'github.com/anonfansub/ygodecks';
const cards = loadCards();
const LF = { tcg: parseLflist(SP + '/lflists/repo/0TCG.lflist.conf'), ocg: parseLflist(SP + '/lflists/repo/OCG.lflist.conf'), goat: parseLflist(SP + '/lflists/repo/GOAT.lflist.conf') };
const hasScript = (code) => ['official', 'pre-release', 'pre-errata'].some((d) => existsSync(`${SCRIPTS}/${d}/c${code}.lua`));

function* walk(d) { for (const f of readdirSync(d).sort()) { if (f === '.git') continue; const p = path.join(d, f); if (statSync(p).isDirectory()) yield* walk(p); else if (f.toLowerCase().endsWith('.ydk')) yield p; } }

const decks = []; const seen = new Map(); const stat = { files: 0, dup: 0 };
for (const file of walk(ROOT)) {
  stat.files++;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const parts = rel.split('/'); const name = parts[parts.length - 1].replace(/\.ydk$/i, '');
  const grp = parts[0]; const sub = parts.length > 2 ? parts.slice(1, -1).join('/') : '';
  const raw = parseYdk(readFileSync(file, 'utf-8'));
  const d = { main: group(raw.main, cards), extra: group(raw.extra, cards), side: group(raw.side, cards) };
  const key = JSON.stringify([d.main.slice().sort(), d.extra.slice().sort()]);
  const nMain = raw.main.length, nExtra = raw.extra.length, nSide = raw.side.length;
  const all = [...d.main, ...d.extra, ...d.side].map((x) => x[0]);
  const unknown = [...new Set(all.filter((c) => !cards.has(c)))];
  const noScript = [...new Set(all.filter((c) => cards.has(c) && needsScript(cards.get(c).type) && !hasScript(c)))];
  const issues = [];
  if (nMain < 40) issues.push(`Hauptdeck nur ${nMain} Karten`); if (nMain > 60) issues.push(`Hauptdeck ${nMain} Karten`);
  if (nExtra > 15) issues.push(`Extradeck ${nExtra} Karten`); if (nSide > 15) issues.push(`Sidedeck ${nSide} Karten`);
  const copies = new Map(); for (const [c, n] of [...d.main, ...d.extra, ...d.side]) copies.set(c, (copies.get(c) || 0) + n);
  const over = [...copies].filter(([, n]) => n > 3).map(([c]) => c); if (over.length) issues.push(`mehr als 3 Kopien: ${over.map((c) => cards.get(c)?.name || c).join(', ')}`);
  // Karten in der falschen Zone (Extra-Monster im Main etc.) – häufig bei Konvertierungen
  const EX = 0x40 | 0x2000 | 0x800000 | 0x4000000;
  const badZone = d.main.filter(([c]) => cards.get(c) && (cards.get(c).type & EX)).map(([c]) => c);
  const badZone2 = d.extra.filter(([c]) => cards.get(c) && !(cards.get(c).type & EX)).map(([c]) => c);
  if (badZone.length || badZone2.length) issues.push('Karten in falscher Zone');
  const legal = {}; for (const k of Object.keys(LF)) { const bad = checkAgainstList(d, LF[k], cards); legal[k] = bad.length === 0; }
  const entry = {
    id: 'y-' + rel.replace(/\.ydk$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name, grp, sub, src: SRC, nMain, nExtra, nSide, main: d.main, extra: d.extra, side: d.side,
    unknown, noScript, issues, legal,
    status: unknown.length || issues.length ? 'defekt' : noScript.length ? 'eingeschraenkt' : 'ok',
  };
  if (seen.has(key)) { entry.dupOf = seen.get(key); stat.dup++; } else seen.set(key, entry.id);
  decks.push(entry);
}
writeFileSync(OUT, JSON.stringify(decks));
const by = {}; for (const d of decks) by[d.status] = (by[d.status] || 0) + 1;
console.log('Dateien', stat.files, 'Decks', decks.length, 'Duplikate', stat.dup, 'Status', by, 'KB', Math.round(readFileSync(OUT).length / 1024));
const issues = {}; for (const d of decks) for (const i of d.issues) { const k = i.replace(/\d+/g, 'N').slice(0, 30); issues[k] = (issues[k] || 0) + 1; }
console.log('Probleme', issues);
console.log('unbekannte Karten gesamt', new Set(decks.flatMap((d) => d.unknown)).size, 'ohne Skript', new Set(decks.flatMap((d) => d.noScript)).size);
const byGrp = {}; for (const d of decks) { byGrp[d.grp] = byGrp[d.grp] || { n: 0, ok: 0, eing: 0, def: 0 }; byGrp[d.grp].n++; byGrp[d.grp][d.status === 'ok' ? 'ok' : d.status === 'eingeschraenkt' ? 'eing' : 'def']++; }
console.log(byGrp);
