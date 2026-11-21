// Deutsche Kartennamen und -texte (mycard/ygopro-database, locales/de-DE) → data/de.json  { code: [Name, Text, [Effekttexte]] }
// Die Logik der App rechnet weiter mit den englischen Texten; angezeigt wird Deutsch.
import { writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SRC, loadCards } from '../test/lib.mjs';
const { Database } = createRequire(import.meta.url)('node-sqlite3-wasm');
const path = SRC + '/de-db/locales/de-DE/cards.cdb';
if (!existsSync(path)) { console.log('Keine deutsche Datenbank gefunden:', path, '– überspringe'); process.exit(0); }
const db = new Database(path, { readOnly: true }); const de = new Map();
for (const r of db.all('select * from texts')) if (r.name && r.name.trim()) { const e = [r.name.trim(), (r.desc || '').replace(/\r/g, '')]; const st = []; for (let i = 1; i <= 16; i++) st.push((r['str' + i] || '').replace(/\r/g, '')); while (st.length && !st[st.length - 1]) st.pop(); if (st.length) e.push(st); de.set(r.id, e); }
db.close();
const cards = loadCards(); const out = {}; let n = 0, viaAlias = 0, miss = 0;
for (const c of cards.values()) {
  let t = de.get(c.code); if (!t && c.alias) { t = de.get(c.alias); if (t) viaAlias++; }
  if (t) { out[c.code] = t; n++; } else miss++;
}
writeFileSync('data/de.json', JSON.stringify(out));
console.log(`Deutsche Texte: ${n} von ${cards.size} Karten (davon ${viaAlias} über Alias), ohne deutschen Text: ${miss}`);
