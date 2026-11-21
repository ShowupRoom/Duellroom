// Deutsche Spieltexte des EDOPro-Clients (mit englischem Rückfall) → data/strings.json
import { readFileSync, writeFileSync } from 'node:fs';
import { SRC } from '../test/lib.mjs';
const SP = SRC + '/dist-repo/d/config/';
const parse = (f) => {
  const out = { system: {}, victory: {}, counter: {} };
  for (const line of readFileSync(f, 'utf-8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^!(system|victory|counter)\s+(\S+)\s+(.*)$/);
    if (m) out[m[1]][m[1] === 'system' ? +m[2] : +m[2]] = m[3];
  }
  return out;
};
const en = parse(SP + 'strings.conf'), de = parse(SP + 'languages/Deutsch/strings.conf');
const res = { system: {}, victory: {}, counter: {} };
for (const k of Object.keys(res)) res[k] = { ...en[k], ...de[k] };
writeFileSync('data/strings.json', JSON.stringify(res));
console.log('system', Object.keys(res.system).length, 'victory', Object.keys(res.victory).length, 'counter', Object.keys(res.counter).length, 'davon deutsch', Object.keys(de.system).length);
console.log(res.system[1150], '|', res.system[549], '|', res.system[31], '|', res.system[1190], '|', res.victory[1]);
