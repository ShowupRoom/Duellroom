// KI-Gegner: eine kleine Regel-KI. Der Spielkern nennt jede legale Möglichkeit; die KI bewertet sie und wählt.
// Sie nutzt nur Informationen, die auch ein Mensch am Tisch sieht (keine fremde Hand, keine verdeckten Karten).
import { OcgResponseType as R, OcgMessageType as MSG, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, OcgPosition as POS, LOC, placesFromMask, sumSelectionValid, randomResponse } from './core.mjs';

const T = { MONSTER: 1, SPELL: 2, TRAP: 4, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, SYNCHRO: 0x2000, QUICK: 0x10000, CONT: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, XYZ: 0x800000, PEND: 0x1000000, LINK: 0x4000000 };
const EXTRA = T.FUSION | T.SYNCHRO | T.XYZ | T.LINK;
const ZONE = { [LOC.HAND]: 'hand', [LOC.MZONE]: 'mzone', [LOC.SZONE]: 'szone', [LOC.GRAVE]: 'grave', [LOC.REMOVED]: 'banished', [LOC.EXTRA]: 'extra' };
/** Karten, die beide Seiten räumen: nur spielen, wenn der Gegner mehr zu verlieren hat */
const SYMMETRIC = new Set([53129443 /* Dark Hole */, 19613556 /* Heavy Storm */, 53582587 /* Torrential Tribute */]);

/** Wie oft darf die KI pro Phase dieselbe Aktion einer Karte versuchen? Steht kein „einmal pro Spielzug“ im Text, kann die Karte (mit Hilfe anderer) mehrfach laufen –
 *  das ist der Hebel für Mehrfach-Kombos (z. B. „Toon Table of Contents“, „Toon World the Perfect World“: 3× pro Zug). Der Kern lässt ohnehin nur Legales zu. */
const OPT_RE = /once per turn|once per duel|once while|only (?:activate|use|control|Special Summon|Normal Summon|Set|add|banish|send)[^.;]{0,60}\b(?:1|one)\b[^.;]{0,50}per turn|einmal pro (?:Spiel)?zug|einmal pro duell|nur 1 [^.;]{0,60}pro (?:Spiel)?zug/i;
const MULTI_RE = /thrice|three times|3 times|dreimal|twice per turn|two times per turn|zweimal pro/i;
const capMemo = new Map();
export function tryCap(c) {
  if (!c) return 1; const k = c.code; if (capMemo.has(k)) return capMemo.get(k);
  const d = c.desc || ''; const cap = MULTI_RE.test(d) ? 3 : OPT_RE.test(d) ? 1 : (c.type & T.SPELL || c.type & T.TRAP) && !(c.type & (T.CONT | T.FIELD)) ? 1 : 4; // einmalige Zauber/Fallen gehen nach dem Einsatz ohnehin weg
  capMemo.set(k, cap); return cap;
}

export const AI_LEVELS = {
  leicht: { name: 'Anfänger', noise: 45, chainP: 0.35, trigP: 0.6, slip: 0.22, fear: 0, lazy: 0.2, shy: 0.4 },
  normal: { name: 'Fortgeschritten', noise: 12, chainP: 0.65, trigP: 0.92, slip: 0.03, fear: 1, lazy: 0, shy: 0 },
  stark: { name: 'Profi', noise: 2, chainP: 0.85, trigP: 1, slip: 0, fear: 1.3, lazy: 0, shy: 0 },
};

// Hinweis-Nummern des Kerns (HINTMSG_*), nach Wirkung auf die gewählte Karte gruppiert
const H_COST = new Set([500, 501, 511, 512, 513, 531, 533, 532, 519, 579]);          // opfern, abwerfen, Material
const H_HURT = new Set([502, 503, 505, 507, 515, 528, 521, 530]);                      // zerstören, verbannen, zurück auf die Hand, ins Deck …
const H_GOOD = new Set([506, 508, 509, 510, 518, 520, 527, 526, 514]);                 // auf die Hand nehmen, beschwören, setzen, ausrüsten, Kontrolle

export class DuelAI {
  constructor(cards, level = 'normal', rnd = Math.random) { this.cards = cards; this.rnd = rnd; this.setLevel(level); this.reset(); }
  setLevel(l) { this.level = AI_LEVELS[l] ? l : 'normal'; this.L = AI_LEVELS[this.level]; }
  reset() { this.hint = null; this.chain = []; this.tried = new Map(); this.acts = 0; this.declined = new Set(); this.plan = null; this.S = null; }

  // ---------------------------------------------------------------- Beobachten
  note(evs) {
    for (const m of evs || []) {
      switch (m.type) {
        case MSG.HINT: if (m.hint_type === 3) this.hint = Number(m.hint); break;
        case MSG.NEW_TURN: this.tried.clear(); this.acts = 0; this.declined.clear(); this.plan = null; break;
        case MSG.NEW_PHASE: this.tried.clear(); this.declined.clear(); this.plan = null; break;
        case MSG.CHAINING: this.chain.push(m.controller); break;
        case MSG.CHAIN_END: this.chain = []; break;
        default: break;
      }
    }
  }
  info(code) { return this.cards.get(code) || { type: 0, level: 0, attack: 0, defense: 0 }; }
  at(c) { const P = this.S && this.S.players[c.controller]; const k = ZONE[c.location]; return P && k ? P[k][c.sequence] || null : null; }
  /** Wert einer Karte (für Opfer, Ziele, Material) */
  val(code, live) {
    const i = this.info(code); const t = i.type;
    if (t & T.MONSTER) { const a = live ? live.attack : i.attack, d = live ? live.defense : i.defense; return Math.max(a, d * 0.6, 0) + (t & EXTRA ? 600 : 0) + (i.level || 0) * 40 + (t & T.EFFECT ? 250 : 0); }
    return (t & T.FIELD ? 700 : 600) + (t & T.TRAP ? 150 : 0);
  }
  cardVal(s) { return this.val(s.code, this.at(s)); }
  /** was ich vom Gegnerfeld sehe: offene Monster zählen voll, verdeckte Karten pauschal */
  visibleValue(p) {
    const P = this.S.players[p]; let v = 0;
    for (const c of P.mzone) if (c) v += c.position & POS.FACEUP ? this.val(c.code, c) : 900;
    for (const c of P.szone) if (c) v += 450;
    return v;
  }
  mine(me) { return this.S.players[me]; }

  // ---------------------------------------------------------------- Einstieg
  respond(msg, ctx = {}) {
    this.note(ctx.evs); if (ctx.snap) this.S = ctx.snap;
    try {
      if (ctx.retry || !this.S) { this.plan = null; return this.fallback(msg); }
      const r = this.decide(msg); this.hint = null; return r;
    } catch (e) { this.hint = null; this.plan = null; return this.fallback(msg); }
  }
  fallback(msg) { return randomResponse(msg, this.rnd, { cards: this.cards }); }
  slips() { return this.L.slip > 0 && this.rnd() < this.L.slip; }
  decide(msg) {
    switch (msg.type) {
      case MSG.SELECT_IDLECMD: return this.idle(msg);
      case MSG.SELECT_BATTLECMD: return this.battle(msg);
      case MSG.SELECT_CHAIN: return this.chainSel(msg);
      case MSG.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: this.rnd() < this.L.trigP };
      case MSG.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: this.rnd() < 0.8 };
      case MSG.SELECT_OPTION: return { type: R.SELECT_OPTION, index: Math.floor(this.rnd() * msg.options.length) };
      case MSG.SELECT_CARD: return this.pickCards(msg);
      case MSG.SELECT_UNSELECT_CARD: return this.pickUnselect(msg);
      case MSG.SELECT_PLACE: case MSG.SELECT_DISFIELD: return this.place(msg);
      case MSG.SELECT_POSITION: return this.position(msg);
      case MSG.SELECT_TRIBUTE: return this.tribute(msg);
      case MSG.SELECT_SUM: return { type: R.SELECT_SUM, indicies: this.sum(msg) };
      case MSG.ANNOUNCE_RACE: case MSG.ANNOUNCE_ATTRIB: case MSG.ANNOUNCE_CARD: case MSG.ANNOUNCE_NUMBER: return this.announce(msg);
      default: return this.fallback(msg);
    }
  }

  // ---------------------------------------------------------------- Hauptphase
  idle(msg) {
    const me = msg.player, S = this.S, my = S.players[me], op = S.players[1 - me];
    const myMon = my.mzone.filter(Boolean), opMon = op.mzone.filter(Boolean);
    const opTop = Math.max(0, ...opMon.filter((c) => c.position & POS.FACEUP).map((c) => c.attack));
    const free = my.mzone.slice(0, 5).filter((c) => !c).length;
    const cand = [];
    const add = (kind, c, i, score, extra = '') => { const key = `${kind}|${c.code}|${c.location}|${c.sequence}|${extra}`; if ((this.tried.get(key) || 0) >= (this.L.reuse && (kind === 'act' || kind === 'ssum') ? tryCap(this.cards.get(c.code)) : 1)) return; cand.push({ kind, i, score, key }); };
    msg.summons.forEach((c, i) => {
      const inf = this.info(c.code); const lv = inf.level & 0xff; const need = lv >= 7 ? 2 : lv >= 5 ? 1 : 0;
      if (need) {
        const lows = myMon.map((m) => m.position & POS.FACEUP ? m.attack : 800).sort((a, b) => a - b).slice(0, need); const cost = lows.reduce((a, b) => a + b, 0); const gain = inf.attack - cost;
        add('sum', c, i, gain > 300 ? 46 + gain / 250 : 2);
      } else add('sum', c, i, 55 + inf.attack / 100);
    });
    msg.special_summons.forEach((c, i) => { const inf = this.info(c.code); add('ssum', c, i, 70 + (inf.attack || 0) / 120 + (inf.type & EXTRA ? 6 : 0)); });
    msg.activates.forEach((c, i) => {
      const inf = this.info(c.code); const t = inf.type; let s;
      if (t & T.SPELL) {
        s = c.location === LOC.HAND ? (t & T.FIELD ? 68 : 74) : c.location === LOC.SZONE ? 42 : 40;
        if (SYMMETRIC.has(c.code)) s = this.visibleValue(1 - me) > this.visibleValue(me) * 1.4 + 300 ? 76 : -50;
        if (t & T.EQUIP && !myMon.length) s = -30;
      } else if (t & T.TRAP) s = c.location === LOC.SZONE ? 44 : 30;
      else if (c.location === LOC.HAND) s = t & T.PEND ? 66 : 62;
      else if (c.location === LOC.MZONE) s = 52;
      else if (c.location === LOC.GRAVE) s = 48;
      else s = 32;
      add('act', c, i, s, String(c.description));
    });
    msg.monster_sets.forEach((c, i) => { const inf = this.info(c.code); add('mset', c, i, inf.attack >= 1700 ? 14 : (myMon.length ? 26 : 52) + (inf.defense - inf.attack) / 200); });
    msg.spell_sets.forEach((c, i) => { const t = this.info(c.code).type; add('sset', c, i, t & T.TRAP ? 48 : t & T.FIELD ? 30 : 24); });
    msg.pos_changes.forEach((c, i) => {
      const live = this.at(c); if (!live) return; const att = live.position & POS.ATTACK;
      if (att && live.attack < opTop && live.defense > live.attack) add('pos', c, i, 36); else if (!att && (live.position & POS.FACEUP) && (live.attack > opTop || !opMon.length)) add('pos', c, i, 38); else if (!att && !(live.position & POS.FACEUP)) add('pos', c, i, 34);
    });
    void free;
    let best = null;
    if (this.L.lazy && this.acts > 0 && this.rnd() < this.L.lazy) cand.length = 0;
    if (this.acts < 70) for (const o of cand) { const sc = o.score + this.rnd() * this.L.noise; if (o.score > 0 && (!best || sc > best.sc)) best = { ...o, sc }; }
    if (best && this.L.slip && this.rnd() < this.L.slip && cand.length > 1) best = cand[Math.floor(this.rnd() * cand.length)];
    if (best) {
      this.acts++; this.tried.set(best.key, (this.tried.get(best.key) || 0) + 1);
      const A = { sum: IA.SELECT_SUMMON, ssum: IA.SELECT_SPECIAL_SUMMON, act: IA.SELECT_ACTIVATE, mset: IA.SELECT_MONSTER_SET, sset: IA.SELECT_SPELL_SET, pos: IA.SELECT_POS_CHANGE }[best.kind];
      return { type: R.SELECT_IDLECMD, action: A, index: best.i };
    }
    const canHit = my.mzone.some((c) => c && (c.position & POS.ATTACK) && (c.position & POS.FACEUP));
    if (msg.to_bp && canHit) return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
    if (msg.to_ep) return { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null };
    return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
  }

  // ---------------------------------------------------------------- Kampf
  /** Wert eines Angriffs von `a` auf das Ziel `t` (offen sichtbar; verdeckte Ziele nur geschätzt) */
  atkValue(a, t) {
    const atk = a.attack;
    if (!t) return 100 + atk / 10;
    if (!(t.position & POS.FACEUP)) return atk >= 2000 ? 26 : atk >= 1600 ? 6 : -30;
    if (t.position & POS.ATTACK) {
      if (atk > t.attack) return 60 + (atk - t.attack) / 25 + t.attack / 60;
      if (atk === t.attack) return this.val(a.code, a) <= this.val(t.code, t) ? 12 : -25;
      return -60 * this.L.fear;
    }
    if (atk > t.defense) return 42 + t.defense / 70;
    return atk === t.defense ? 0 : -45 * this.L.fear;
  }
  battle(msg) {
    const me = msg.player, S = this.S, op = S.players[1 - me]; const opLP = S.lp[1 - me];
    let best = null; const opMon = op.mzone.filter(Boolean);
    if (this.L.shy && this.rnd() < this.L.shy) msg.attacks = [];
    msg.attacks.forEach((c, i) => {
      const key = `${c.location}:${c.sequence}`; if (this.declined.has(key)) return;
      const a = this.at(c); if (!a) return;
      let v = c.can_direct && !opMon.length ? this.atkValue(a, null) : -999;
      if (c.can_direct && a.attack >= opLP) v = 1000;
      if (opMon.length) for (const t of opMon) v = Math.max(v, this.atkValue(a, t));
      if (c.can_direct && opMon.length) v = Math.max(v, 8);
      v += this.rnd() * this.L.noise * 0.3;
      if (v > (this.L.slip ? -5 : 0) && (!best || v > best.v)) best = { v, i, key, c };
    });
    if (best) { this.plan = { key: best.key, c: best.c }; return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: best.i }; }
    if (msg.chains.length && this.rnd() < 0.25) return { type: R.SELECT_BATTLECMD, action: BA.SELECT_CHAIN, index: Math.floor(this.rnd() * msg.chains.length) };
    if (msg.to_ep) return { type: R.SELECT_BATTLECMD, action: BA.TO_EP, index: null };
    return { type: R.SELECT_BATTLECMD, action: BA.TO_M2, index: null };
  }

  // ---------------------------------------------------------------- Ketten
  chainSel(msg) {
    const me = msg.player; const sel = msg.selects;
    if (msg.forced) return { type: R.SELECT_CHAIN, index: Math.floor(this.rnd() * sel.length) };
    if (!sel.length) return { type: R.SELECT_CHAIN, index: null };
    let p = this.L.chainP; const top = this.chain.length ? this.chain[this.chain.length - 1] : null;
    if (top === null) p = Math.max(p, this.L.trigP * 0.9);           // Auslöser nach Beschwörung o. Ä.
    else if (top === me) p = p * (this.L.own ?? 0.35);              // nicht auf die eigene Kette setzen
    const scored = sel.map((c, i) => { const t = this.info(c.code).type; return { i, s: (t & T.TRAP ? 60 : t & T.SPELL ? 50 : 45) + this.rnd() * 8 }; }).sort((a, b) => b.s - a.s);
    if (this.rnd() < p) return { type: R.SELECT_CHAIN, index: scored[0].i };
    return { type: R.SELECT_CHAIN, index: null };
  }

  // ---------------------------------------------------------------- Kartenauswahl
  /** Wirkt die Auswahl für mich (gut), kostet sie mich etwas (Kosten) oder trifft sie jemanden (schaden)? */
  mode(selects, me) {
    const h = this.hint;
    if (h !== null) { if (H_COST.has(h)) return 'cost'; if (H_HURT.has(h)) return 'hurt'; if (H_GOOD.has(h)) return 'good'; if (h === 504) return 'cost'; }
    return selects.some((s) => s.controller !== me) ? 'hurt' : 'cost';
  }
  ranked(selects, me, mode) {
    const idx = selects.map((s, i) => ({ i, v: this.cardVal(s) + this.rnd() * 30, own: s.controller === me }));
    if (mode === 'good') return idx.sort((a, b) => b.v - a.v);
    if (mode === 'hurt') return idx.sort((a, b) => (a.own === b.own ? b.v - a.v : a.own ? 1 : -1));
    return idx.sort((a, b) => (a.own === b.own ? a.v - b.v : a.own ? -1 : 1));  // Kosten: eigene, wertlose zuerst
  }
  pickCards(msg) {
    const me = msg.player, n = msg.selects.length; const min = Math.max(msg.min, 0), max = Math.min(msg.max, n);
    // Angriffsziel
    if (this.plan && msg.can_cancel && msg.selects.every((s) => s.controller !== me && s.location === LOC.MZONE)) {
      const a = this.at(this.plan.c); const plan = this.plan; this.plan = null;
      if (a) {
        let best = null; msg.selects.forEach((s, i) => { const t = this.at(s); if (!t) return; const v = this.atkValue(a, t) + this.rnd() * 3; if (!best || v > best.v) best = { i, v }; });
        if (best && best.v > (this.L.slip ? -5 : 0)) return { type: R.SELECT_CARD, indicies: [best.i] };
      }
      this.declined.add(plan.key); return { type: R.SELECT_CARD, indicies: null };
    }
    this.plan = null;
    if (this.slips()) return this.fallback(msg);
    const mode = this.mode(msg.selects, me);
    const k = mode === 'cost' ? min : Math.max(min, Math.min(max, mode === 'good' ? Math.max(min, 1) : max));
    if (k === 0) return msg.can_cancel ? { type: R.SELECT_CARD, indicies: null } : { type: R.SELECT_CARD, indicies: [] };
    return { type: R.SELECT_CARD, indicies: this.ranked(msg.selects, me, mode).slice(0, k).map((x) => x.i) };
  }
  pickUnselect(msg) {
    const me = msg.player; const sel = msg.select_cards;
    const chosen = msg.unselect_cards.length;
    if (msg.can_finish && (chosen >= Math.max(msg.min, 1) || !sel.length)) return { type: R.SELECT_UNSELECT_CARD, index: null };
    if (!sel.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
    const mode = this.mode(sel, me);
    return { type: R.SELECT_UNSELECT_CARD, index: this.ranked(sel, me, mode)[0].i };
  }
  tribute(msg) {
    const need = Math.max(msg.min, 1); const order = msg.selects.map((s, i) => ({ i, v: this.cardVal(s), w: s.release_param || 1 })).sort((a, b) => a.v - b.v);
    let sum = 0; const out = [];
    for (const o of order) { if (sum >= need) break; out.push(o.i); sum += o.w; }
    return { type: R.SELECT_TRIBUTE, indicies: out.slice(0, Math.max(msg.max, 1)) };
  }
  sum(msg) {
    const n = msg.selects.length; const w = msg.selects.map((s) => this.cardVal(s));
    if (n <= 14) {
      const masks = [...Array(1 << n).keys()].filter((m) => m);
      const cost = (m) => { let c = 0, k = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) { c += w[i]; k++; } return c + k * 400; };
      masks.sort((a, b) => cost(a) - cost(b));
      for (const m of masks) { const idx = []; for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i); if (sumSelectionValid(msg, idx)) return idx; }
      if (sumSelectionValid(msg, [])) return [];
      return [];
    }
    const order = [...Array(n).keys()].sort((a, b) => w[a] - w[b]); const chosen = [];
    for (const i of order) { chosen.push(i); if (sumSelectionValid(msg, chosen)) return chosen; }
    return [];
  }

  // ---------------------------------------------------------------- Plätze, Stellung, Ansagen
  place(msg) {
    const me = msg.player; const free = placesFromMask(msg.field_mask >>> 0, me); const want = msg.type === MSG.SELECT_DISFIELD ? (p) => p.player !== me : (p) => p.player === me;
    const pref = [2, 1, 3, 0, 4, 5, 6, 7]; const rank = (p) => (pref.indexOf(p.sequence) < 0 ? 9 : pref.indexOf(p.sequence)) + (p.location === LOC.SZONE ? 20 : 0);
    const a = free.filter(want).sort((x, y) => rank(x) - rank(y)); const b = free.filter((p) => !want(p)).sort((x, y) => rank(x) - rank(y));
    const k = msg.count || 1; const pick = [...a, ...b].slice(0, k);
    return { type: msg.type === MSG.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places: pick };
  }
  position(msg) {
    const inf = this.info(msg.code); const ok = (p) => msg.positions & p; let pos;
    if (ok(POS.FACEUP_ATTACK) && (inf.attack >= inf.defense * 0.9 || inf.attack >= 1500 || !ok(POS.FACEUP_DEFENSE))) pos = POS.FACEUP_ATTACK;
    else if (ok(POS.FACEUP_DEFENSE)) pos = POS.FACEUP_DEFENSE;
    else pos = [POS.FACEUP_ATTACK, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK].find(ok) || POS.FACEUP_ATTACK;
    return { type: R.SELECT_POSITION, position: pos };
  }
  announce(msg) {
    const me = msg.player, op = this.S.players[1 - me];
    if (msg.type === MSG.ANNOUNCE_RACE || msg.type === MSG.ANNOUNCE_ATTRIB) {
      const key = msg.type === MSG.ANNOUNCE_RACE ? 'race' : 'attribute'; const avail = msg.available; const tally = new Map();
      for (const c of op.mzone) if (c && (c.position & POS.FACEUP)) { const v = key === 'race' ? this.info(c.code).race : this.info(c.code).attribute; tally.set(v, (tally.get(v) || 0) + 1); }
      const bits = []; const lim = msg.type === MSG.ANNOUNCE_RACE ? 64n : 16n;
      for (let i = 0n; i < lim; i++) { const b = 1n << i; if (BigInt(avail) & b) bits.push(msg.type === MSG.ANNOUNCE_RACE ? b : Number(b)); }
      let pick = bits[0]; let top = -1; for (const b of bits) { const c = tally.get(b) || 0; if (c > top) { top = c; pick = b; } }
      return msg.type === MSG.ANNOUNCE_RACE ? { type: R.ANNOUNCE_RACE, races: [pick] } : { type: R.ANNOUNCE_ATTRIB, attributes: [pick] };
    }
    return this.fallback(msg);
  }
}
