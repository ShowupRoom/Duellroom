import pkg from 'node-sqlite3-wasm'; const { Database } = pkg;
import { readdirSync, existsSync } from 'node:fs';
import { SP } from './lib.mjs';
const dir = SP + '/babel/BabelCDB/';
const want = [10611873,74212164,47828069,75934716,47605577,11333460,72978038,46983930,9362643,73090586,9484285];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.cdb'))) {
  const db = new Database(dir + f, { readOnly: true });
  const rows = db.all(`select d.id,d.alias,t.name from datas d join texts t on t.id=d.id where d.id in (${want.join(',')})`);
  if (rows.length) console.log(f, rows.map((r) => `${r.id}:${r.name}`).join(' | '));
  db.close();
}
for (const c of want) for (const d of ['official','pre-release','unofficial']) if (existsSync(SP+`/ocg/scripts/${d}/c${c}.lua`)) console.log('Skript', c, d);
