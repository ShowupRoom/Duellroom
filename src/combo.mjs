// Kombo-Suche: Für eine feste Starthand werden im Hintergrund viele Züge durchgespielt (auch solche, die eigene Monster als Material
// auflösen), das Endboard wird bewertet und die beste Antwortfolge geliefert. Der Kern ist deterministisch (gleicher Startwert + gleiche
// Antworten = gleiches Spiel), darum lässt sich die beste Folge später Schritt für Schritt vorspielen.
import { Game, OcgMessageType as MSG, OcgResponseType as R, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, OcgPosition as POS, randomResponse, seededRandom } from './core.mjs';
import { DuelAI } from './ai.mjs';

const T = { MONSTER: 1, SPELL: 2, TRAP: 4, QUICKPLAY: 0x10000, CONT: 0x20000, FIELD: 0x80000 };
/** Wonach das Endboard bewertet wird */
export const GOALS = {
  balance: { name: 'Ausgewogen', mon: 30, atk: 1, inter: 0.6 },
  power: { name: 'Stärkste Monster', mon: 40, atk: 1.6, inter: 0.3 },
  inter: { name: 'Meiste Unterbrechungen', mon: 14, atk: 0.4, inter: 1.1 },
};

// ---- Bewertung des Endboards ---------------------------------------------------------------------
const NEG = /negate (the |that |its |this )?(activation|effects?|Summon|Special Summon)/i;
const REM = /(destroy|banish|return|shuffle|send|take control|change)[^.;]{0,90}(opponent|monster|card|face-up)/i;
const QUICK = /\(Quick Effect\)/i;
const FLOOD = /(opponent|neither player)[^.;]{0,50}(cannot|can't)|cannot be (targeted|destroyed|Special Summoned)|unaffected by/i;
const HANDTRAP = /^(ash blossom & joyous spring|maxx "c"|nibiru, the primal being|effect veiler|droll & lock bird|ghost ogre & snow rabbit|ghost belle & haunted mansion|ghost mourner & moonlit chill|ghost sister & spooky dogwood|ghost reaper & winter cherries|gamma, the magnet warrior|mulcharmy .*|dimension shifter|retaliating "c"|psy-framegear gamma|artifact lancea|d\.d\. crow|fantastical dragon phantazmay|called by the grave|crossout designator|solemn judgment|solemn strike|solemn warning|infinite impermanence|nibiru the primal being)$/;
const HANDEFF = /discard this card|send this card from your hand|reveal this card in your hand|if this card is in your hand|you can send this card from your hand/i;
const memo = new Map(); const memoH = new Map();
/** Karte, deren Störeffekt nur aus der Hand wirkt (auf dem Feld nutzlos) */
export function isHandOnly(code, cards) {
  if (memoH.has(code)) return memoH.get(code);
  const c = cards.get(code); const v = !!c && (c.type & T.MONSTER) && (HANDEFF.test(c.desc || '') || HANDTRAP.test((c.name || '').toLowerCase()));
  memoH.set(code, v); return v;
}
/** Wie viele Punkte Störung (Negation, Entfernung, Sperre) diese Karte auf dem Feld darstellt */
export function interruptPts(code, cards) {
  if (memo.has(code)) return memo.get(code);
  const c = cards.get(code); let v = 0;
  if (c) {
    const d = c.desc || '', t = c.type;
    if (t & T.TRAP) v = NEG.test(d) ? 40 : REM.test(d) ? 28 : FLOOD.test(d) ? 12 : 8;
    else if (t & T.SPELL) v = (t & T.QUICKPLAY) ? (NEG.test(d) ? 36 : REM.test(d) ? 22 : 4) : (t & (T.CONT | T.FIELD)) && FLOOD.test(d) ? 12 : 0;
    else if (HANDEFF.test(d) || HANDTRAP.test((c.name || '').toLowerCase())) v = 0; // Wirkt nur aus der Hand, nicht vom Feld
    else if (QUICK.test(d)) v = NEG.test(d) ? 40 : REM.test(d) ? 28 : 6;
    else if (FLOOD.test(d)) v = 8;
  }
  memo.set(code, v); return v;
}
/** Bewertet das Feld von Spieler p (Hand: nur Handtraps zählen als Störung) */
export function scoreBoard(snap, cards, G, p = 0) {
  const P = snap.players[p]; let score = 0, atk = 0, inter = 0, mons = 0, ints = 0; const mon = [], ist = [], hand = [];
  for (const c of P.mzone) {
    if (!c) continue;
    if (c.position & POS.FACEUP) {
      const a = Math.max(c.attack, 0); const v = interruptPts(c.code, cards); const dead = isHandOnly(c.code, cards);
      mon.push([c.code, a]); mons++; atk += a; inter += v; if (v >= 20) { ints++; ist.push([c.code, v]); }
      score += dead ? 4 : (a < 800 && v < 20 ? G.mon * 0.5 : G.mon) + Math.min(a, 4500) / 100 * G.atk; // Handfallen auf dem Feld sind verschenkt; Mini-Monster zählen halb
    }
    else { score += 8; mon.push([0, 0]); }
  }
  for (const c of P.szone) {
    if (!c) continue; const v = interruptPts(c.code, cards); inter += v; if (v >= 20) { ints++; ist.push([c.code, v]); }
    score += c.position & POS.FACEUP ? 3 : 2;
  }
  for (const c of P.hand) { if (!c) continue; const n = ((cards.get(c.code) || {}).name || '').toLowerCase(); if (HANDTRAP.test(n)) { inter += 30; ints++; hand.push(c.code); } }
  score += inter * G.inter;
  return { score: Math.round(score * 10) / 10, mons, atk, inter, ints, mon, st: P.szone.filter(Boolean).length, hand, intCards: ist, handCount: P.hand.filter(Boolean).length };
}

// ---- Gegner, der stillsteht (gleiche Regel in Suche und Vorführung → gleiche Spielverläufe) ------------------
export function passiveReply(msg, rnd, cards) {
  switch (msg.type) {
    case MSG.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: msg.to_ep ? IA.TO_EP : IA.TO_BP, index: null };
    case MSG.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: msg.to_ep ? BA.TO_EP : BA.TO_M2, index: null };
    case MSG.SELECT_CHAIN: return msg.forced ? { type: R.SELECT_CHAIN, index: 0 } : { type: R.SELECT_CHAIN, index: null };
    default: return randomResponse(msg, rnd, { cards });
  }
}
export const passiveRng = () => seededRandom([1n, 2n, 3n, 4n]);

// ---- Ein Durchlauf bis zum Ende des ersten Zugs -----------------------------------------------------
const key = (r) => JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? String(v) : v));
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** prefix = bisher gewählte Antworten (werden unverändert gespielt); an Stelle prefix.length wird `force` gespielt bzw. – mit `avoid` – etwas anderes als avoid.r */
export async function runOnce(lib, opts, cards, { prefix = [], force = null, avoid = null, level = {}, rnd, endTurn = 2, from = 0 }) {
  const g = await Game.create(lib, opts);
  const ai = new DuelAI(cards, 'stark', rnd); ai.L = { ...ai.L, chainP: 1, trigP: 1, own: 0.05, ...level };
  const pas = passiveRng(); const rec = []; let steps = 0, i = 0, ok = false, hand = null, won = false, snapEnd = null;
  try {
    while (steps++ < 4000) {
      const r = await g.next();
      if (r.kind === 'end') { if (r.winner === 0) { ok = won = true; snapEnd = g.snapshot(); } break; } // Sieg im Suchzug (z. B. direkter Angriff auf den stillstehenden Gegner)
      const m = r.msg; const evs = g.events.splice(0);
      if (g.turn >= endTurn) { ok = true; break; }
      let resp;
      if (m.player === 0) {
        const snap0 = g.snapshot(); if (i === from) hand = snap0.players[0].hand.filter(Boolean).map((c) => c.code);
        resp = ai.respond(m, { snap: snap0, evs, retry: r.retry });
        if (i < prefix.length && prefix[i].t === m.type) resp = prefix[i].r;
        else if (i === prefix.length && !r.retry) {
          if (force && force.t === m.type) resp = force.r;
          else if (avoid && avoid.t === m.type) {
            const orig = key(avoid.r); let cand = resp;
            for (let t = 0; t < 10 && key(cand) === orig; t++) cand = t % 2 === 0 ? randomResponse(m, rnd, { cards }) : ai.respond(m, { snap: g.snapshot(), evs: [], retry: false });
            resp = cand;
          }
        }
        rec.push(m.type === MSG.SELECT_IDLECMD ? { t: m.type, r: resp, m } : { t: m.type, r: resp }); i++;
      } else resp = passiveReply(m, pas, cards);
      g.respond(resp);
    }
    return { ok, rec, hand, won, snap: ok ? (snapEnd || g.snapshot()) : null };
  } finally { try { lib.destroyDuel(g.handle); } catch (e) { /* schon weg */ } }
}

/** Alle erlaubten Antworten auf eine Hauptphasen-Abfrage */
export function idleCands(m) {
  const out = []; const add = (act, list) => (list || []).forEach((_, i) => out.push({ type: R.SELECT_IDLECMD, action: act, index: i }));
  add(IA.SELECT_SUMMON, m.summons); add(IA.SELECT_SPECIAL_SUMMON, m.special_summons); add(IA.SELECT_ACTIVATE, m.activates);
  add(IA.SELECT_MONSTER_SET, m.monster_sets); add(IA.SELECT_SPELL_SET, m.spell_sets); add(IA.SELECT_POS_CHANGE, m.pos_changes);
  if (m.to_ep) out.push({ type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null });
  if (m.to_bp) out.push({ type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null });
  return out;
}

/** Sucht für die durch `opts` (Spielaufbau inkl. Startwert) festgelegte Starthand die beste Antwortfolge des ersten Zugs.
 *  cfg: { cards, goal, budgetMs, onProgress(info), stop() } → { rec, board, sims, ms, base } */
export async function comboSearch(lib, opts, cfg) {
  const { cards, goal = 'balance', deadline = 0, onProgress = () => {}, stop = () => false, rseed = 20260101, worker = 0, base: B = [], endTurn = 2 } = cfg; const from = B.length; const budgetMs = deadline ? Math.max(500, deadline - Date.now()) : (cfg.budgetMs || 15000); const G = GOALS[goal] || GOALS.balance;
  const rnd = mulberry(rseed); let hand = null; const t0 = Date.now(); let best = null, base = null, sims = 0, fails = 0;
  const left = () => !stop() && Date.now() - t0 < budgetMs;
  /** Ergebnis bewerten; true, wenn es das bisher beste übertrifft */
  const take = (res) => {
    sims++; if (!res.ok) { fails++; return false; }
    res.board = scoreBoard(res.snap, cards, G, 0); if (res.won) res.board.score += 500; if (!base) base = res.board; if (!hand) hand = res.hand;
    if (!best || res.board.score > best.board.score || (res.board.score === best.board.score && res.rec.length < best.rec.length)) { const better = !best || res.board.score > best.board.score; best = res; return better; }
    return false;
  };
  const tick = async (improved) => { onProgress({ worker, hand, sims, ms: Date.now() - t0, score: best ? best.board.score : 0, board: best ? best.board : null, base: base ? base.score : 0, improved }); await new Promise((r) => setTimeout(r, 0)); };
  const LV = [{ noise: 2 }, { noise: 6 }, { noise: 14 }, { noise: 30, slip: 0.03 }, { noise: 50, slip: 0.06 }, { noise: 80, slip: 0.1 }];
  const run = async (o) => { const res = await runOnce(lib, opts, cards, { rnd, endTurn, from, ...o, prefix: o.prefix || B }); const imp = take(res); await tick(imp); return res; };
  // 1) Grundläufe der KI mit unterschiedlich viel Zufall
  for (let k = 0; k < 4 && left(); k++) await run({ level: LV[k % LV.length] }); // (Zugfolge davor, falls vorhanden, wird unverändert vorgespielt)
  // 2) Vorausschau: an jeder Hauptphasen-Entscheidung alle Möglichkeiten durchspielen (die KI spielt danach weiter) und die beste festhalten
  let cur = best;
  for (let pass = 0; pass < 2 && cur && left(); pass++) {
    let at = from;
    for (;;) {
      if (!left()) break;
      const j = cur.rec.findIndex((x, n) => n >= at && x.t === MSG.SELECT_IDLECMD); if (j < 0) break;
      const mine = key(cur.rec[j].r); let cands = idleCands(cur.rec[j].m).filter((c) => key(c) !== mine);
      if (cands.length > 14) cands = cands.map((c) => [c, rnd()]).sort((a, b) => a[1] - b[1]).slice(0, 14).map((x) => x[0]);
      let win = null;
      for (const c of cands) {
        if (!left()) break;
        const res = await run({ prefix: cur.rec.slice(0, j), force: { t: MSG.SELECT_IDLECMD, r: c }, level: LV[pass] });
        if (res.ok && res.board.score > (win ? win.board.score : cur.board.score)) win = res;
      }
      if (win) cur = win;
      at = j + 1;
    }
  }
  // 3) Verbessern: an einer zufälligen Stelle der bisher besten Folge anders entscheiden und neu weiterspielen
  while (best && left()) {
    const rec = best.rec; let k;
    const idle = rec.map((x, j) => (x.t === MSG.SELECT_IDLECMD && j >= from ? j : -1)).filter((j) => j >= 0);
    if (rec.length <= from) break;
    if (rnd() < 0.5 && idle.length) k = idle[Math.floor(rnd() * idle.length)]; else k = from + Math.floor(rnd() * (rec.length - from));
    await run({ prefix: rec.slice(0, k), avoid: rec[k], level: rnd() < 0.7 ? LV[Math.floor(rnd() * 4)] : { noise: 2 } });
    if (rnd() < 0.06) await run({ level: LV[2 + Math.floor(rnd() * 4)] }); // Neustart gegen Sackgassen
  }
  return best ? { rec: best.rec.map((x) => ({ t: x.t, r: x.r })), board: best.board, hand, sims, ms: Date.now() - t0, base: base ? base.score : 0, fails } : null;
}
