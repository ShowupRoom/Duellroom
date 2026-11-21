import { readFileSync } from 'node:fs';
import { loadCore } from '../src/core.mjs';
import { OcgDuelMode } from 'ocgcore-wasm';
const SP='/tmp/claude-0/-home-claude/fdbbce0a-44a7-56cd-85ff-0f0cc9a17a48/scratchpad/ocg/scripts/';
const lib = await loadCore();
const t = readFileSync(SP+'utility.lua','utf-8');
const variants = {
 orig: t,
 ascii: t.replace(/[^\x00-\x7f]/g,'?'),
 nocomment: t.split('\n').filter((l)=>!/^\s*--/.test(l)||/^\s*--\[\[/.test(l)).join('\n'),
 trim: t.split('\n').map(l=>l.replace(/^[ \t]+/,'')).join('\n'),
};
for (const [k,v] of Object.entries(variants)) {
  const errs=[]; const h = await lib.createDuel({flags:OcgDuelMode.MODE_MR5,seed:[1n,2n,3n,4n],team1:{drawCountPerTurn:1,startingDrawCount:5,startingLP:8000},team2:{drawCountPerTurn:1,startingDrawCount:5,startingLP:8000},cardReader:()=>null,scriptReader:()=>'',errorHandler:(a,b)=>errs.push(b)});
  const c = readFileSync(SP+'constant.lua','utf-8'); await lib.loadScript(h,'constant.lua',c);
  const ok = await lib.loadScript(h,'utility.lua',v); console.log(k, ok, errs.slice(0,2));
}
