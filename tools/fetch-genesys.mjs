// Holt die aktuellen Genesys-Punkte von der YGOPRODeck-API → sources/fetched/genesys-points.txt (bei Fehler bleibt die alte Liste)
import { writeFileSync, readFileSync } from 'node:fs';
const OUT = new URL('../sources/fetched/genesys-points.txt', import.meta.url);
try {
  const r = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?format=genesys&misc=yes', { headers: { 'User-Agent': 'Duellraum-Update (privat)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json(); const rows = [];
  for (const c of j.data || []) { const p = Number(c.genesys_points ?? c.misc_info?.[0]?.genesys_points ?? 0); if (p > 0) rows.push(`${c.name}: ${p}`); }
  if (rows.length < 50) throw new Error('verdächtig wenige Einträge: ' + rows.length);
  rows.sort((a, b) => a.localeCompare(b)); const old = readFileSync(OUT, 'utf-8').trim().split('\n').length;
  writeFileSync(OUT, rows.join('\n') + '\n'); console.log('Genesys-Punkte:', rows.length, 'Karten (vorher', old + ')');
} catch (e) { console.log('Genesys-Punkte nicht aktualisiert (alte Liste bleibt):', e.message); }
