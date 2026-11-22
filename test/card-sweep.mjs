// Massentest über ALLE Karten: jede Karte bekommt eine eigene Spielsituation und aktiviert über zwei eigene Züge alles, was geht.
// Geprüft wird: Skriptfehler (Lua), Absturz der Engine, hängende Duelle und – wenn der Kartentext eine harte Sperre nennt
// („You can only use this effect of X once per turn“ / „You can only activate 1 X per turn“) – ob dieselbe Aktivierung im selben Zug erneut angeboten wird.
// Aufruf: node test/card-sweep.mjs [teil] [teile]  → schreibt sweep-<teil>.json in OUT (Standard: aktuelles Verzeichnis)
import { writeFileSync } from 'node:fs';
import { loadCore, Game, OcgDuelMode, OcgResponseType as R, SelectIdleCMDAction as IA, OcgMessageType as MSG, LOC } from '../src/core.mjs';
import { passiveReply } from '../src/combo.mjs';
import { loadCards, scriptReader, mulberry } from './lib.mjs';

const part = +(process.argv[2] || 0), parts = +(process.argv[3] || 1); const OUT = process.env.OUT || '.'; const LIMIT = +(process.env.LIMIT || 0);
const cards = loadCards(); const lib = await loadCore(); const read = scriptReader('official');
const UP = 1, SET = 8;
const EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000; const MON = 0x1, TOKEN = 0x4000, SKILL = 0x8000000, FIELD = 0x80000, SPELL = 0x2;
const FILL = [91152256, 11091375, 6368038, 15025844, 43096270, 40640057]; // normale/einfache Monster als Material, Opfer und Ziele
const all = [...cards.values()].filter((c) => !c.alias && !(c.type & (TOKEN | SKILL)) && c.code < 500000000 && c.code > 100).map((c) => c.code).sort((a, b) => a - b);
const mine = all.filter((_, i) => i % parts === part).slice(0, LIMIT || undefined);

const hardPhrase = (c) => { const n = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const t = c.desc || '';
  return { eff: new RegExp(`You can only use (this|each) effect of "?${n}"? once per turn`, 'i').test(t), act: new RegExp(`You can only activate 1 "?${n}"? per turn`, 'i').test(t) }; };

function hardDescs(code) {
  const src = read(`c${code}.lua`) || ''; const out = new Set();
  for (const blk of src.split(/Effect\.CreateEffect/).slice(1)) {
    const d = blk.match(/SetDescription\(aux\.Stringid\(id,(\d+)\)\)/); const hard = /SetCountLimit\(\s*1\s*,\s*\{?\s*id\b/.test(blk.split(/RegisterEffect/)[0]);
    if (d && hard) out.add(String(BigInt(code) * 1048576n + BigInt(d[1])));
  }
  return out;
}
async function one(code) {
  const c = cards.get(code); const isEx = !!(c.type & EXTRA) && !!(c.type & MON); const isMon = !!(c.type & MON); const fld = !!(c.type & FIELD) && !!(c.type & SPELL);
  const main = [...(isEx ? [] : [code, code, code]), ...Array(34).fill(0).map((_, i) => FILL[i % FILL.length])];
  const field = [[0, FILL[0], LOC.MZONE, 3, UP], [0, FILL[2], LOC.MZONE, 4, UP], [0, code, LOC.GRAVE, 0, UP], [1, FILL[1], LOC.MZONE, 1, UP], [1, 17985575, LOC.MZONE, 2, UP]];
  if (isMon) field.push([0, code, LOC.MZONE, 0, UP]); else if (!fld) field.push([0, code, LOC.SZONE, 0, SET]);
  const r = { code, err: [], hang: false, crash: null, acts: 0, opt: [] };
  let g;
  try {
    g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [{ main, extra: isEx ? [code, code] : [] }, { main: Array(40).fill(0).map((_, i) => FILL[i % FILL.length]), extra: [] }], cards, readScript: read, seed: [BigInt(code), 7n, 1n, 3n], field, stack: [isEx ? [] : [code, code, code], []], shuffle: true });
  } catch (e) { r.crash = 'create: ' + String(e.message || e).slice(0, 200); return r; }
  const rnd = mulberry(code); const hp = hardPhrase(c); const HD = hardDescs(code); const used = new Map(); let seenErr = 0; let turn = 0;
  const note = (e) => { if (r.err.length < 3) r.err.push(String(e).slice(0, 240)); };
  try {
    for (const e of g.errors) note(e); seenErr = g.errors.length;
    let i = 0;
    for (; i < 3000; i++) {
      const x = await g.next();
      if (g.errors.length > seenErr) { for (const e of g.errors.slice(seenErr)) note(e); seenErr = g.errors.length; }
      g.events.length = 0;
      if (x.kind === 'end' || g.turn > 3) break;
      if (g.turn !== turn) { turn = g.turn; used.clear(); }
      const m = x.msg; let resp;
      const offers = m.type === MSG.SELECT_IDLECMD ? m.activates || [] : m.type === MSG.SELECT_CHAIN ? m.selects || [] : [];
      if (HD.size) for (const o of offers) if (o.code === code && used.has(String(o.description)) && HD.has(String(o.description)) && r.opt.length < 2) r.opt.push({ turn, desc: String(o.description), first: used.get(String(o.description)), where: o.location });
      if (m.player === 0 && m.type === MSG.SELECT_IDLECMD) {
        const k = (m.activates || []).findIndex((o) => o.code === code && !used.has(String(o.description)));
        const ks = (m.special_summons || []).findIndex((o) => o.code === code); const kn = (m.summons || []).findIndex((o) => o.code === code);
        if (k >= 0) { used.set(String(m.activates[k].description), m.activates[k].location); r.acts++; resp = { type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: k }; }
        else if (ks >= 0) resp = { type: R.SELECT_IDLECMD, action: IA.SELECT_SPECIAL_SUMMON, index: ks };
        else if (kn >= 0) resp = { type: R.SELECT_IDLECMD, action: IA.SELECT_SUMMON, index: kn };
      } else if (m.player === 0 && m.type === MSG.SELECT_CHAIN) {
        const k = (m.selects || []).findIndex((o) => o.code === code && !used.has(String(o.description)));
        if (k >= 0) { used.set(String(m.selects[k].description), m.selects[k].location); r.acts++; resp = { type: R.SELECT_CHAIN, index: k }; }
      }
      if (!resp && m.type === MSG.SELECT_BATTLECMD && (m.attacks || []).length) resp = { type: R.SELECT_BATTLECMD, action: 1, index: 0 };
      g.respond(resp ?? passiveReply(m, rnd, cards));
    }
    if (i >= 3000) r.hang = true;
  } catch (e) { r.crash = String(e.message || e).slice(0, 240); }
  try { lib.destroyDuel(g.handle); } catch (e) { /* */ }
  return r;
}

const t0 = Date.now(); const res = [];
for (let i = 0; i < mine.length; i++) {
  res.push(await one(mine[i]));
  if (i % 250 === 0) { console.log(`Teil ${part}: ${i}/${mine.length} (${Math.round((Date.now() - t0) / 1000)} s)`); writeFileSync(`${OUT}/sweep-${part}.json`, JSON.stringify(res)); }
}
writeFileSync(`${OUT}/sweep-${part}.json`, JSON.stringify(res));
const bad = res.filter((r) => r.err.length || r.crash || r.hang || r.opt.length);
console.log(`Teil ${part} fertig: ${res.length} Karten, auffällig ${bad.length}, ${Math.round((Date.now() - t0) / 1000)} s`);
