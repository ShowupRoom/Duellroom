// Deutsche Spieltexte des EDOPro-Clients (mit englischem Rückfall) → data/strings.json
import { readFileSync, writeFileSync } from 'node:fs';
import { SRC } from '../test/lib.mjs';
const SP = SRC + '/dist-repo/d/config/';
const parse = (f) => {
  const out = { system: {}, victory: {}, counter: {}, setname: {} };
  for (const line of readFileSync(f, 'utf-8').split('\n')) {
    const l = line.replace(/\r$/, ''); const m = l.match(/^!(system|victory|counter)\s+(\S+)\s+(.*)$/);
    if (m) out[m[1]][+m[2]] = m[3];
    const sn = l.match(/^!setname\s+(0x[0-9a-fA-F]+)\s+(.*?)(\t.*)?$/); if (sn) out.setname[parseInt(sn[1], 16)] = sn[2].trim();
  }
  return out;
};
const en = parse(SP + 'strings.conf'), de = parse(SP + 'languages/Deutsch/strings.conf');
const res = { system: {}, victory: {}, counter: {}, setname: {}, setnameDe: {} };
for (const k of ['system', 'victory', 'counter']) res[k] = { ...en[k], ...de[k] };
res.setname = en.setname; // englische Archetyp-Namen (Rechenwerte der Logik)
res.setnameDe = { ...en.setname, ...de.setname }; // deutsche Namen für die Anzeige (fehlende bleiben englisch)
writeFileSync('data/strings.json', JSON.stringify(res));
console.log('system', Object.keys(res.system).length, 'victory', Object.keys(res.victory).length, 'counter', Object.keys(res.counter).length, 'davon deutsch', Object.keys(de.system).length);
console.log(res.system[1150], '|', res.system[549], '|', res.system[31], '|', res.system[1190], '|', res.victory[1]);
