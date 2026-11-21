import { loadCore, Game, OcgDuelMode, randomResponse, MSG_NAME } from '../src/core.mjs';
import { loadCards, scriptReader, presets, deckCodes, mulberry } from './lib.mjs';
const P = presets(); const cards = loadCards(); const lib = await loadCore(); const rnd = mulberry(1);
const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks: [deckCodes(P.find(x=>x.id==='dracotail')), deckCodes(P.find(x=>x.id==='blueeyes'))], cards, readScript: scriptReader(), seed:[1n,2n,3n,4n] });
const J=(o)=>JSON.stringify(o,(k,v)=>typeof v==='bigint'?String(v):v);
for (let i=0;i<400;i++){
  const r=await g.next(); if(r.kind==='end')break;
  if(i<395 && MSG_NAME[r.msg.type]!=="SELECT_PLACE") {} 
  if(i>=390||MSG_NAME[r.msg.type]!=="SELECT_PLACE"&&i<60) console.log(i,MSG_NAME[r.msg.type],J(r.msg).slice(0,260));
  const resp=randomResponse(r.msg,rnd); if(i>=390) console.log("  ->",J(resp));
  g.respond(resp);
  const ev=g.events.map(e=>MSG_NAME[e.type]); if(i>=390||ev.includes("RETRY")) console.log("   events:",ev.join(",")); g.events.length=0;
}
