import { loadCore, Game, OcgDuelMode, randomResponse, LOC } from '../src/core.mjs';
import { OcgQueryFlags } from 'ocgcore-wasm';
import { loadCards, scriptReader, presets, deckCodes, mulberry } from './lib.mjs';
const P = presets(); const cards = loadCards(); const lib = await loadCore(); const rnd = mulberry(1);
const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(P.find(x=>x.id==='dracotail')), deckCodes(P.find(x=>x.id==='blueeyes'))], cards, readScript: scriptReader(), seed:[1n,2n,3n,4n] });
for (let i=0;i<300;i++){ const r=await g.next(); if(r.kind==='end')break; g.respond(randomResponse(r.msg,rnd)); g.events.length=0; }
for (const [name,f] of Object.entries(OcgQueryFlags)) {
  for (const [ln,loc] of [['hand',LOC.HAND],['mzone',LOC.MZONE],['szone',LOC.SZONE],['grave',LOC.GRAVE],['removed',LOC.REMOVED],['extra',LOC.EXTRA]]) {
    for (const c of [0,1]) {
      try { lib.duelQueryLocation(g.handle,{flags:f,controller:c,location:loc}); } catch(e) { console.log('FEHLER',name,ln,c,String(e.message).slice(0,80)); }
    }
  }
}
console.log('fertig');
