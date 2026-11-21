// Kartendaten aus einer EDOPro-Datenbank (.cdb) für Tests unter Node lesen.
import pkg from 'node-sqlite3-wasm';
const { Database } = pkg;

export function readCdb(path, into = new Map()) {
  const db = new Database(path, { readOnly: true });
  const rows = db.all('select d.id,d.ot,d.alias,d.setcode,d.type,d.atk,d.def,d.level,d.race,d.attribute,t.name,t.desc,t.str1,t.str2,t.str3,t.str4,t.str5,t.str6,t.str7,t.str8,t.str9,t.str10,t.str11,t.str12,t.str13,t.str14,t.str15,t.str16 from datas d join texts t on t.id=d.id');
  for (const r of rows) into.set(r.id, rowToCard(r));
  db.close();
  return into;
}

export function rowToCard(r) {
  let lv = r.level, ls = 0, rs = 0;
  if (r.type & 0x1000000) { ls = (lv >>> 24) & 0xff; rs = (lv >>> 16) & 0xff; lv = lv & 0xffff; }
  const sc = []; const s = BigInt.asUintN(64, BigInt(r.setcode || 0));
  for (let i = 0; i < 4; i++) { const v = Number((s >> BigInt(16 * i)) & 0xffffn); if (v) sc.push(v); }
  const strs = []; for (let i = 1; i <= 16; i++) strs.push(r['str' + i] || '');
  return {
    code: r.id, alias: r.alias, setcodes: sc, type: r.type, level: lv, attribute: r.attribute, race: BigInt(r.race),
    attack: r.atk, defense: r.def, lscale: ls, rscale: rs, link_marker: (r.type & 0x4000000) ? r.def : 0,
    name: r.name, desc: r.desc, strs, ot: r.ot || 0,
  };
}
