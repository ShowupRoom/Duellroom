// Kombo-Suche: Für eine feste Starthand werden im Hintergrund viele Züge durchgespielt (auch solche, die eigene Monster als Material
// auflösen), das Endboard wird bewertet und die beste Antwortfolge geliefert. Der Kern ist deterministisch (gleicher Startwert + gleiche
// Antworten = gleiches Spiel), darum lässt sich die beste Folge später Schritt für Schritt vorspielen.
import { Game, OcgMessageType as MSG, OcgResponseType as R, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, OcgPosition as POS, LOC, randomResponse, seededRandom } from './core.mjs';
import { DuelAI, tryCap } from './ai.mjs';
import { isHandOnly, interruptPts, handPts, isAdvantage } from './interrupts.mjs';

const T = { MONSTER: 1, SPELL: 2, TRAP: 4, QUICKPLAY: 0x10000, CONT: 0x20000, FIELD: 0x80000 };
/** Wonach das Endboard bewertet wird */
export const GOALS = {
  balance: { name: 'Ausgewogen', mon: 30, atk: 1, inter: 0.6 },
  power: { name: 'Stärkste Monster', mon: 40, atk: 1.6, inter: 0.3 },
  inter: { name: 'Meiste Unterbrechungen', mon: 14, atk: 0.4, inter: 1.1 },
};

// ---- Bewertung des Endboards ---------------------------------------------------------------------
export { isHandOnly, interruptPts };
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
    else { score += c.code && isHandOnly(c.code, cards) ? 1 : 8; mon.push([0, 0]); } // verdeckte Handtrap (z. B. Geistermädchen) ist auf dem Feld verschenkt
  }
  for (const c of P.szone) {
    if (!c) continue; const v = interruptPts(c.code, cards); inter += v; if (v >= 20) { ints++; ist.push([c.code, v]); }
    score += 6; // jede gelegte/gesetzte Karte ist genutzt (Mind Scan & Co. gehören aufs Feld)
  }
  let idle = 0; // Karten, die auf der Hand liegen geblieben sind, obwohl sie Vorteil bringen könnten (Such-/Zieh-/Rückholkarten wiegen schwerer)
  for (const c of P.hand) { if (!c) continue; const hp = handPts(c.code, cards); if (hp) { inter += hp; ints++; hand.push(c.code); } else if (!isHandOnly(c.code, cards)) idle += isAdvantage(c.code, cards) ? 1.7 : 1; }
  score += inter * G.inter - idle * 7;
  if (snap.lp) score -= Math.max(0, 8000 - snap.lp[p] - 1500) / 60; // Lebenspunkte nicht sinnlos verbrennen (Toon World kostet 1000 und ist frei)
  return { score: Math.round(score * 10) / 10, mons, atk, inter, ints, mon, st: P.szone.filter(Boolean).length, hand, intCards: ist, handCount: P.hand.filter(Boolean).length, idle };
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

/** Kann an dieser Stelle in der Hauptphase noch etwas Nützliches gespielt werden? Wählt (nach Priorität, dann zufällig) eine Aktion, die diese Karte in dieser Runde noch nicht
 *  so oft hatte, wie ihr Text erlaubt (tryCap) – so wird nichts liegen gelassen, was Vorteil bringt (aktivieren > Spezialbeschwörung > Normalbeschwörung > setzen). */
function exhaustPick(m, used, cards, rnd, only = null) {
  const lists = [[IA.SELECT_ACTIVATE, m.activates], [IA.SELECT_SPECIAL_SUMMON, m.special_summons], [IA.SELECT_SUMMON, m.summons], [IA.SELECT_SPELL_SET, m.spell_sets]];
  for (const [act, list] of lists) {
    if (only && !only.includes(act)) continue;
    const ok = (list || []).map((c, i) => [c, i]).filter(([c]) => (used.get(`${act}|${c.code}|${c.location}|${c.sequence}|${c.description}`) || 0) < (act === IA.SELECT_ACTIVATE ? tryCap(cards.get(c.code)) : 1));
    if (ok.length) { const [c, i] = ok[Math.floor(rnd() * ok.length)]; const k = `${act}|${c.code}|${c.location}|${c.sequence}|${c.description}`; used.set(k, (used.get(k) || 0) + 1); return { type: R.SELECT_IDLECMD, action: act, index: i }; }
  }
  return null;
}
/** Entscheidungen, an denen die Suche Alternativen durchprobiert (Antwort des Kerns hat dabei jeweils die Form `{type, …}`) */
const BRANCH = new Set([MSG.SELECT_IDLECMD, MSG.SELECT_CARD, MSG.SELECT_CHAIN, MSG.SELECT_EFFECTYN, MSG.SELECT_YESNO, MSG.SELECT_OPTION]);

/** prefix = bisher gewählte Antworten (werden unverändert gespielt); an Stelle prefix.length wird `force` gespielt bzw. – mit `avoid` – etwas anderes als avoid.r.
 *  level.exhaust: in der Hauptphase nicht aufhören, solange noch etwas Nützliches spielbar ist */
export async function runOnce(lib, opts, cards, { prefix = [], force = null, avoid = null, level = {}, rnd, endTurn = 2, from = 0, me = 0, replay = null, guide = null }) {
  const g = await Game.create(lib, opts);
  const ai = new DuelAI(cards, 'stark', rnd); ai.L = { ...ai.L, chainP: 1, trigP: 1, own: 0.05, reuse: 1, ...level };
  const pas = passiveRng(); const rec = []; const used = new Map(); let gi = 0; let steps = 0, i = 0, ok = false, hand = null, top = null, won = false, snapEnd = null, turnSeen = 0, rp = 0;
  try {
    while (steps++ < 6000) {
      const r = await g.next();
      if (r.kind === 'end') { if (r.winner === me && !(replay && rp < replay.length)) { ok = won = true; snapEnd = g.snapshot(); } break; } // Sieg im Suchzug (z. B. direkter Angriff auf den stillstehenden Gegner)
      const m = r.msg; const evs = g.events.splice(0);
      if (replay && rp < replay.length) { g.respond(replay[rp++]); continue; } // laufendes Duell nachspielen (beide Spieler): bis zur aktuellen Entscheidung
      if (g.turn >= endTurn) { ok = true; break; }
      if (g.turn !== turnSeen) { turnSeen = g.turn; used.clear(); }
      let resp;
      if (m.player === me) {
        const snap0 = g.snapshot(); if (i === from) { hand = snap0.players[me].hand.filter(Boolean).map((c) => c.code); top = g.deckTop(me, 8); }
        resp = ai.respond(m, { snap: snap0, evs, retry: r.retry });
        if (level.exhaust && m.type === MSG.SELECT_IDLECMD && !r.retry && resp.action !== undefined && (resp.action === IA.TO_EP || resp.action === IA.TO_BP)) { const x = exhaustPick(m, used, cards, rnd); if (x) resp = x; }
        // „Erst alle Effekte, dann das Material verbrauchen“: statt sofort aus dem Extradeck zu beschwören, erst noch offene Aktivierungen spielen (Kitt-/Fraktall-Effekte brauchen ihr Monster noch auf dem Feld)
        if (level.fx && m.type === MSG.SELECT_IDLECMD && !r.retry && resp.action === IA.SELECT_SPECIAL_SUMMON) { const c = (m.special_summons || [])[resp.index]; if (c && c.location === LOC.EXTRA && rnd() < level.fx) { const x = exhaustPick(m, used, cards, rnd, [IA.SELECT_ACTIVATE]); if (x) resp = x; } }
        // bekannte Kombo (aus der Bibliothek) nachspielen: Hauptphasen-Schritte nach Art + Karte; fehlt eine Karte, wird der Schritt übersprungen
        if (guide && i >= prefix.length && m.type === MSG.SELECT_IDLECMD && !r.retry) { while (gi < guide.length) { const x = guideResp(m, guide[gi++]); if (x) { resp = x; break; } } }
        if (i < prefix.length && prefix[i].t === m.type) resp = prefix[i].r;
        else if (i === prefix.length && !r.retry) {
          if (force && force.t === m.type) resp = force.r;
          else if (avoid && avoid.t === m.type) {
            const orig = key(avoid.r); let cand = resp;
            for (let t = 0; t < 10 && key(cand) === orig; t++) cand = t % 2 === 0 ? randomResponse(m, rnd, { cards }) : ai.respond(m, { snap: g.snapshot(), evs: [], retry: false });
            resp = cand;
          }
        }
        rec.push(BRANCH.has(m.type) && !r.retry ? { t: m.type, r: resp, m } : { t: m.type, r: resp }); i++;
      } else resp = passiveReply(m, pas, cards);
      g.respond(resp);
    }
    return { ok, rec, hand, top, won, snap: ok ? (snapEnd || g.snapshot()) : null };
  } finally { try { lib.destroyDuel(g.handle); } catch (e) { /* schon weg */ } }
}

const GK = { summon: ['summons', IA.SELECT_SUMMON], special: ['special_summons', IA.SELECT_SPECIAL_SUMMON], activate: ['activates', IA.SELECT_ACTIVATE], set: ['monster_sets', IA.SELECT_MONSTER_SET], spellset: ['spell_sets', IA.SELECT_SPELL_SET], pos: ['pos_changes', IA.SELECT_POS_CHANGE] };
/** Schritt {kind, code} einer gespeicherten Kombo → passende Antwort in dieser Abfrage (oder null) */
function guideResp(m, st) { const g = st && GK[st.kind]; if (!g) return null; const L = m[g[0]] || []; const k = L.findIndex((c) => c.code === st.code); return k < 0 ? null : { type: R.SELECT_IDLECMD, action: g[1], index: k }; }
/** Eine Hauptphasen-Antwort als lesbarer Schritt (für den Tutor): Art, Karte, Ort – so lässt sich die Karte im Duell hervorheben */
export function idleStep(m, r) {
  if (r.action === IA.TO_EP) return { kind: 'ep', action: r.action, index: null };
  if (r.action === IA.TO_BP) return { kind: 'bp', action: r.action, index: null };
  const L = { [IA.SELECT_SUMMON]: ['summon', m.summons], [IA.SELECT_SPECIAL_SUMMON]: ['special', m.special_summons], [IA.SELECT_ACTIVATE]: ['activate', m.activates], [IA.SELECT_MONSTER_SET]: ['set', m.monster_sets], [IA.SELECT_SPELL_SET]: ['spellset', m.spell_sets], [IA.SELECT_POS_CHANGE]: ['pos', m.pos_changes] }[r.action];
  const c = L && (L[1] || [])[r.index]; if (!c) return null;
  return { kind: L[0], code: c.code, ctrl: c.controller, loc: c.location, seq: c.sequence, action: r.action, index: r.index };
}
/** Die Hauptphasen-Schritte einer Antwortfolge (höchstens n, bis Kampfphase/Zugende) */
export function planOf(rec, from = 0, n = 8) {
  const out = []; for (let j = from; j < rec.length && out.length < n; j++) { const x = rec[j]; if (!x.m || x.t !== MSG.SELECT_IDLECMD) continue; const st = idleStep(x.m, x.r); if (!st) continue; out.push(st); if (st.kind === 'ep' || st.kind === 'bp') break; }
  return out;
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
/** Alternativen an einer Entscheidung: Hauptphase (alle Aktionen), Karte wählen (Suchziel, Material, Opfer), Kette, Ja/Nein, Option */
export function branchCands(m, rnd) {
  switch (m.type) {
    case MSG.SELECT_IDLECMD: return idleCands(m);
    case MSG.SELECT_CARD: {
      const n = (m.selects || []).length, min = Math.max(m.min, 0), max = Math.min(m.max, n); const out = [];
      if (n < 2 || n > 60) return out;
      if (max <= 1 || min === 1 && max === 1) { for (let k = 0; k < n; k++) out.push({ type: R.SELECT_CARD, indicies: [k] }); if (min === 0 && m.can_cancel) out.push({ type: R.SELECT_CARD, indicies: null }); }
      else if (min >= 1) for (let t = 0; t < 6; t++) { const idx = [...Array(n).keys()].sort(() => rnd() - 0.5).slice(0, min + Math.floor(rnd() * (max - min + 1))); out.push({ type: R.SELECT_CARD, indicies: idx }); }
      return out;
    }
    case MSG.SELECT_CHAIN: return m.forced || !(m.selects || []).length ? [] : [...m.selects.map((_, i) => ({ type: R.SELECT_CHAIN, index: i })), { type: R.SELECT_CHAIN, index: null }];
    case MSG.SELECT_EFFECTYN: return [{ type: R.SELECT_EFFECTYN, yes: true }, { type: R.SELECT_EFFECTYN, yes: false }];
    case MSG.SELECT_YESNO: return [{ type: R.SELECT_YESNO, yes: true }, { type: R.SELECT_YESNO, yes: false }];
    case MSG.SELECT_OPTION: return (m.options || []).map((_, i) => ({ type: R.SELECT_OPTION, index: i }));
    default: return [];
  }
}

/** Sucht für die durch `opts` (Spielaufbau inkl. Startwert) festgelegte Starthand die beste Antwortfolge des Zuges ab `base`.
 *  cfg: { cards, goal, deadline | budgetMs, onProgress(info), stop(), base, endTurn, rseed, worker } → { rec, board, sims, ms, base, hand } */
export async function comboSearch(lib, opts, cfg) {
  const { cards, goal = 'balance', deadline = 0, onProgress = () => {}, stop = () => false, rseed = 20260101, worker = 0, base: B = [], endTurn = 2, me = 0, replay = null, guides = null } = cfg; const from = B.length; const budgetMs = deadline ? Math.max(500, deadline - Date.now()) : (cfg.budgetMs || 15000); const G = GOALS[goal] || GOALS.balance;
  const rnd = mulberry(rseed); let hand = null, top = null; const t0 = Date.now(); let best = null, base = null, sims = 0, fails = 0;
  const left = (f = 1) => !stop() && Date.now() - t0 < budgetMs * f;
  const champs = new Map(); const sigOf = (rec) => { const j = rec.findIndex((x, n) => n >= from && x.m && x.t === MSG.SELECT_IDLECMD); return j < 0 ? '' : key(rec[j].r); };
  const topChamps = (n) => [...champs.values()].sort((a, b) => b.board.score - a.board.score).slice(0, n);
  /** Ergebnis bewerten; true, wenn es das bisher beste übertrifft */
  const take = (res) => {
    sims++; if (!res.ok) { fails++; return false; }
    res.board = scoreBoard(res.snap, cards, G, me); if (res.won) res.board.score += 500; if (!base) base = res.board; if (!hand) { hand = res.hand; top = res.top; }
    const sg = sigOf(res.rec), ch = champs.get(sg); if (!ch || res.board.score > ch.board.score) champs.set(sg, res); // je Eröffnung (erste Hauptphasen-Aktion) die beste Variante merken
    if (!best || res.board.score > best.board.score || (res.board.score === best.board.score && res.rec.length < best.rec.length)) { const better = !best || res.board.score > best.board.score; best = res; return better; }
    return false;
  };
  const tick = async (improved) => { onProgress({ worker, hand, top, sims, ms: Date.now() - t0, score: best ? best.board.score : 0, board: best ? best.board : null, base: base ? base.score : 0, improved, plan: improved && best ? planOf(best.rec, from) : undefined }); await new Promise((r) => setTimeout(r, 0)); };
  // Spielstärke der KI in den Läufen: wenig bis viel Zufall; „exhaust“ = nichts liegen lassen
  const LV = [{ noise: 2, exhaust: 1 }, { noise: 2, fx: 0.7, exhaust: 1 }, { noise: 6, exhaust: 1, fx: 0.6 }, { noise: 14, exhaust: 1, fx: 0.85 }, { noise: 30, slip: 0.03, exhaust: 1, fx: 0.5 }, { noise: 50, slip: 0.06 }, { noise: 80, slip: 0.1, exhaust: 1, fx: 0.9 }];
  const lvl = (k) => LV[(k + worker) % LV.length];
  const run = async (o) => { const res = await runOnce(lib, opts, cards, { rnd, endTurn, from, me, replay, ...o, prefix: o.prefix || B }); const imp = take(res); await tick(imp); return res; };
  // 1) Grundläufe der KI mit unterschiedlich viel Zufall (Zugfolge davor, falls vorhanden, wird unverändert vorgespielt)
  for (let k = 0; k < 4 && left(); k++) await run({ level: lvl(k) });
  // 1b) bekannte Kombos dieses Decks (Bibliothek) zuerst: die mit den meisten Karten aus der aktuellen Hand, je zweimal mit wenig Zufall
  if (guides && guides.length && hand) {
    const hs = new Set(hand); const ranked = guides.map((gd) => [gd, gd.filter((x) => hs.has(x.code)).length + (hs.has(gd[0] && gd[0].code) ? 2 : 0)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [gd] of ranked) { if (!left(0.3)) break; await run({ guide: gd, level: lvl(0) }); await run({ guide: gd, level: lvl(1) }); }
  }
  // 2) Vorausschau: an jeder Entscheidung alle Möglichkeiten durchspielen (die KI spielt danach weiter) und die beste festhalten –
  //    erst die Hauptphasen-Züge (zweimal), dann Suchziele, Material, Ketten, Optionen
  // look: ab `start` an jeder Entscheidung (höchstens maxPos Stellen) alle Alternativen durchspielen, je Alternative `reps` Läufe mit unterschiedlich viel Zufall, und die beste übernehmen
  const look = async (types, start, { maxPos = 1e9, reps = 1, lv = lvl(0), frac = 1 } = {}) => {
    let cur = start, at = from, seen = 0;
    for (;;) {
      if (!left(frac) || !cur || seen >= maxPos) break;
      const j = cur.rec.findIndex((x, n) => n >= at && x.m && types.has(x.t)); if (j < 0) break;
      const mine = key(cur.rec[j].r); let cands = branchCands(cur.rec[j].m, rnd).filter((c) => key(c) !== mine);
      if (cands.length > 12) cands = cands.map((c) => [c, rnd()]).sort((a, b) => a[1] - b[1]).slice(0, 12).map((x) => x[0]);
      let win = null;
      for (const c of cands) {
        for (let q = 0; q < reps; q++) {
          if (!left(frac)) break;
          const res = await run({ prefix: cur.rec.slice(0, j), force: { t: cur.rec[j].t, r: c }, level: q === 0 ? lv : lvl(q + 2) });
          if (res.ok && res.board.score > (win ? win.board.score : cur.board.score)) win = res;
        }
      }
      if (win) cur = win;
      at = j + 1; seen++;
    }
    return cur;
  };
  const IDLE = new Set([MSG.SELECT_IDLECMD]); const SUB = new Set([MSG.SELECT_CARD, MSG.SELECT_CHAIN, MSG.SELECT_EFFECTYN, MSG.SELECT_YESNO, MSG.SELECT_OPTION]);
  // 2a) Breite: alle ersten Hauptphasen-Aktionen mit mehreren Läufen – jede Eröffnung bekommt ihre beste Fortsetzung (eine Eröffnung wie „Kitt zuerst“ ist erst nach zwei, drei richtigen Folgezügen gut)
  await look(IDLE, best, { maxPos: 1, reps: 3, lv: lvl(1), frac: 0.4 });
  // 2b) Tiefe: die besten Eröffnungen (nicht nur die führende) jeweils die ersten drei Entscheidungen durchprobieren
  for (const ch of topChamps(5)) { if (!left(0.4)) break; await look(IDLE, ch, { maxPos: 3, reps: 2, lv: lvl(2), frac: 0.4 }); }
  // 2c) die führende Variante durchgehend verbessern: Hauptphase, dann Suchziele/Material/Ketten, dann noch einmal Hauptphase
  let cur = best;
  cur = await look(IDLE, cur, { lv: lvl(0), frac: 0.6 }); cur = await look(SUB, cur, { lv: lvl(1), frac: 0.7 }); cur = await look(IDLE, cur, { lv: lvl(2), frac: 0.75 });
  // 3) Verbessern: an einer zufälligen Stelle der bisher besten Folge anders entscheiden und neu weiterspielen
  while (best && left()) {
    const src = rnd() < 0.45 ? best : (topChamps(6)[Math.floor(rnd() * rnd() * Math.min(6, champs.size))] || best); const rec = src.rec; let k;
    const pos = rec.map((x, j) => (x.m && j >= from ? j : -1)).filter((j) => j >= 0);
    if (rec.length <= from) break;
    if (rnd() < 0.6 && pos.length) k = pos[Math.floor(rnd() * pos.length)]; else k = from + Math.floor(rnd() * (rec.length - from));
    await run({ prefix: rec.slice(0, k), avoid: rec[k], level: rnd() < 0.7 ? lvl(Math.floor(rnd() * 5)) : LV[0] });
    if (rnd() < 0.06) await run({ level: LV[2 + Math.floor(rnd() * 5)] }); // Neustart gegen Sackgassen
  }
  return best ? { rec: best.rec.map((x) => ({ t: x.t, r: x.r })), plan: planOf(best.rec, from), board: best.board, hand, top, sims, ms: Date.now() - t0, base: base ? base.score : 0, fails } : null;
}
