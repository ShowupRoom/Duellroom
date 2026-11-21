// Anbindung des EDOPro-Spielkerns (ocgcore als WebAssembly) für ein Duell zu zweit.
// Der Kern entscheidet, was legal ist; dieser Adapter übersetzt nur Nachrichten und Antworten.
import createCore, {
  OcgDuelMode, OcgProcessResult, OcgLocation, OcgPosition, OcgMessageType, OcgResponseType,
  OcgQueryFlags, SelectIdleCMDAction, SelectBattleCMDAction, cardMatchesOpcode,
} from 'ocgcore-wasm';

export { OcgDuelMode, OcgLocation, OcgPosition, OcgMessageType, OcgResponseType, SelectIdleCMDAction, SelectBattleCMDAction };

export const LOC = OcgLocation;
const MSG = OcgMessageType;
export const MSG_NAME = Object.fromEntries(Object.entries(OcgMessageType).map(([k, v]) => [v, k]));

export async function loadCore() { return createCore({ sync: true }); }

const QUERY = OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.LEVEL | OcgQueryFlags.RANK |
  OcgQueryFlags.ATTRIBUTE | OcgQueryFlags.RACE | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.OVERLAY_CARD |
  OcgQueryFlags.COUNTERS | OcgQueryFlags.STATUS | OcgQueryFlags.EQUIP_CARD | OcgQueryFlags.TARGET_CARD |
  OcgQueryFlags.IS_PUBLIC; // „offene“ Karten (z. B. Hand unter „Gedankenlesen“) – sonst bleibt die gegnerische Hand verdeckt

const PROMPTS = new Set([
  MSG.SELECT_IDLECMD, MSG.SELECT_BATTLECMD, MSG.SELECT_EFFECTYN, MSG.SELECT_YESNO, MSG.SELECT_OPTION, MSG.SELECT_CARD,
  MSG.SELECT_CHAIN, MSG.SELECT_PLACE, MSG.SELECT_POSITION, MSG.SELECT_TRIBUTE, MSG.SORT_CHAIN, MSG.SELECT_COUNTER,
  MSG.SELECT_SUM, MSG.SELECT_DISFIELD, MSG.SORT_CARD, MSG.SELECT_UNSELECT_CARD, MSG.ANNOUNCE_RACE, MSG.ANNOUNCE_ATTRIB,
  MSG.ANNOUNCE_CARD, MSG.ANNOUNCE_NUMBER, MSG.ROCK_PAPER_SCISSORS,
]);
export const isPrompt = (m) => PROMPTS.has(m.type);

/**
 * Freie Felder aus der Feldmaske des Kerns (gesetztes Bit = nicht verfügbar).
 * Die unteren 16 Bit gehören der fragenden Seite, die oberen 16 Bit dem Gegner.
 */
export function placesFromMask(mask, asking = 0) {
  const out = [];
  for (let side = 0; side < 2; side++) {
    const base = side * 16, player = side === 0 ? asking : 1 - asking;
    for (let s = 0; s < 7; s++) if (!((mask >>> (base + s)) & 1)) out.push({ player, location: LOC.MZONE, sequence: s });
    for (let s = 0; s < 8; s++) if (!((mask >>> (base + 8 + s)) & 1)) out.push({ player, location: LOC.SZONE, sequence: s });
  }
  return out;
}

/** Zufallszahlen aus dem Duell-Startwert (gleicher Startwert → gleiche Mischung, z. B. für „Gleiche Hand nochmal“) */
export function seededRandom(seed) {
  let a = 0x9e3779b9;
  for (const x of seed) { a = Math.imul(a ^ Number(BigInt(x) & 0xffffffffn), 0x85ebca6b); a ^= a >>> 13; a = Math.imul(a, 0xc2b2ae35); a ^= a >>> 16; }
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Fisher-Yates; „stack“ = Karten, die zuerst gezogen werden sollen (die Oberseite des Decks ist das Listenende) */
export function shuffleDeck(main, rnd, stack) {
  const a = [...main];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (stack && stack.length) {
    const top = [];
    for (const code of stack) { const i = a.lastIndexOf(code); if (i >= 0) { a.splice(i, 1); top.push(code); } }
    a.push(...top.reverse());
  }
  return a;
}

/**
 * Regelkorrekturen an den Kernskripten (Text-Ersetzung beim Laden; fehlt das Muster, bleibt das Skript unverändert).
 * utility.lua: Zeitweilig verbannte Monster aus einer Extra-Monsterzone kehren in diese Zone zurück (statt in eine Hauptmonsterzone zu wandern),
 * sofern sie frei ist – so wie es die offizielle Regel vorsieht (z. B. „Blauäugiger ultimativer Toon-Drache“, Dimensionstransporter).
 */
const PATCHES = {
  'utility.lua': [[
    'local function select_field_return_cards(p,g)\n\tif #g==0 then return end\n',
    'local function select_field_return_cards(p,g)\n\tif #g==0 then return end\n'
    + '\tlocal eg=g:Filter(function(c) return c:IsPreviousLocation(LOCATION_MZONE) and c:GetPreviousSequence()>=5 and Duel.CheckLocation(c:GetPreviousControler(),LOCATION_MZONE,c:GetPreviousSequence()) end,nil)\n'
    + '\tfor tc in eg:Iter() do Duel.ReturnToField(tc,tc:GetPreviousPosition(),1<<tc:GetPreviousSequence()) end\n'
    + '\tg:Sub(eg)\n\tif #g==0 then return end\n',
  ]],
};
export function patchScript(name, text) {
  const list = PATCHES[name]; if (!list || !text) return text;
  for (const [a, b] of list) if (text.includes(a)) text = text.replace(a, b);
  return text;
}

export class Game {
  /**
   * @param lib  Kern
   * @param opts { flags, forbidden?, decks:[{main:[codes],extra:[codes]},{…}], cards:Map, readScript(name)->string, seed?, startingLP?, startingDraw?, drawPerTurn? }
   */
  static async create(lib, opts) {
    const g = new Game(lib, opts);
    await g.init();
    return g;
  }

  constructor(lib, opts) {
    this.lib = lib; this.opts = opts; this.cards = opts.cards;
    this.log = []; this.events = []; this.winner = null; this.reason = null; this.turn = 0; this.phase = null; this.turnPlayer = 0;
    this.chain = []; this.over = false; this.lp = [opts.startingLP ?? 8000, opts.startingLP ?? 8000];
    this.errors = []; this.retries = 0;
  }

  async init() {
    const { lib, opts } = this;
    const seed = opts.seed ?? [BigInt(Date.now() & 0xffffffff), 7n, 11n, 13n];
    const team = { drawCountPerTurn: opts.drawPerTurn ?? 1, startingDrawCount: opts.startingDraw ?? 5, startingLP: opts.startingLP ?? 8000 };
    this.handle = await lib.createDuel({
      flags: opts.flags, seed, team1: team, team2: team,
      cardReader: (c) => this.cards.get(c) ?? null,
      scriptReader: (s) => { try { return patchScript(s, opts.readScript(s) ?? ''); } catch (e) { return ''; } },
      errorHandler: (t, x) => { this.errors.push(`${t}: ${x}`); },
    });
    if (!this.handle) throw new Error('Duell konnte nicht erzeugt werden');
    for (const f of ['constant.lua', 'utility.lua']) {
      const ok = await lib.loadScript(this.handle, f, patchScript(f, opts.readScript(f)));
      if (!ok) throw new Error('Basisskript fehlt: ' + f);
    }
    // Der Kern mischt nicht selbst: Ohne Mischen wären die Starthände immer die letzten Karten der Deckliste.
    const rnd = seededRandom(seed);
    for (let t = 0; t < 2; t++) {
      const d = { ...opts.decks[t], main: opts.shuffle === false ? opts.decks[t].main : shuffleDeck(opts.decks[t].main, rnd, opts.stack && opts.stack[t]) };
      d.main.forEach((code, i) => lib.duelNewCard(this.handle, { team: t, duelist: 0, code, controller: t, location: LOC.DECK, sequence: i, position: OcgPosition.FACEDOWN_DEFENSE }));
      (d.extra || []).forEach((code, i) => lib.duelNewCard(this.handle, { team: t, duelist: 0, code, controller: t, location: LOC.EXTRA, sequence: i, position: OcgPosition.FACEDOWN_DEFENSE }));
    }
    // Vorgegebene Aufstellung (Tests/Rätsel): [Besitzer, Code, Ort, Zone, Position]
    for (const [c, code, loc, seq, pos] of opts.field || []) lib.duelNewCard(this.handle, { team: c, duelist: 0, code, controller: c, location: loc, sequence: seq, position: pos ?? OcgPosition.FACEUP_ATTACK });
    await lib.startDuel(this.handle);
  }

  name(code) { return this.cards.get(code)?.name || String(code); }

  /** Läuft bis zur nächsten Entscheidung. Rückgabe: {kind:'prompt', msg} oder {kind:'end'}. */
  async next() {
    for (let guard = 0; guard < 100000; guard++) {
      const st = await this.lib.duelProcess(this.handle);
      const msgs = this.lib.duelGetMessage(this.handle);
      let prompt = null;
      for (const m of msgs) { this.onMessage(m); if (isPrompt(m)) prompt = m; }
      if (msgs.some((m) => m.type === MSG.RETRY)) {
        if (++this.retries > 30) throw new Error('Antwort wiederholt abgelehnt: ' + (this.prompt ? MSG_NAME[this.prompt.type] : '?') + ' ' + JSON.stringify(this.lastResponse, (k, v) => typeof v === 'bigint' ? String(v) : v));
        if (!prompt && this.prompt) return { kind: 'prompt', msg: this.prompt, retry: true };
      } else if (prompt) this.retries = 0;
      if (st === OcgProcessResult.END || this.over) { this.over = true; return { kind: 'end', winner: this.winner, reason: this.reason }; }
      if (st === OcgProcessResult.CONTINUE) continue;
      if (prompt) { this.prompt = prompt; return { kind: 'prompt', msg: prompt }; }
      // Warten ohne erkannte Auswahl: nächste Runde
    }
    throw new Error('Kein Fortschritt im Duell');
  }

  respond(resp) { this.lastResponse = resp; this.lib.duelSetResponse(this.handle, resp); }

  onMessage(m) {
    const t = m.type;
    this.events.push(m);
    if (t === MSG.NEW_TURN) { this.turn++; this.turnPlayer = m.player; this.log.push(`Zug ${this.turn} – Spieler ${m.player + 1}`); }
    else if (t === MSG.NEW_PHASE) { this.phase = m.phase; }
    else if (t === MSG.WIN) { this.winner = m.player; this.reason = m.reason; this.over = true; this.log.push(`Sieg Spieler ${m.player + 1} (Grund ${m.reason})`); }
    else if (t === MSG.LPUPDATE) { this.lp[m.player] = m.lp; }
    else if (t === MSG.DAMAGE) { this.lp[m.player] -= m.amount; this.log.push(`Spieler ${m.player + 1} erleidet ${m.amount} Schaden`); }
    else if (t === MSG.RECOVER) { this.lp[m.player] += m.amount; }
    else if (t === MSG.PAY_LPCOST) { this.lp[m.player] -= m.amount; }
    else if (t === MSG.CHAINING) { this.chain.push(m); this.log.push(`Kette ${this.chain.length}: ${this.name(m.code)}`); }
    else if (t === MSG.CHAIN_END) { this.chain = []; }
    else if (t === MSG.SUMMONING || t === MSG.SPSUMMONING || t === MSG.FLIPSUMMONING) {
      this.log.push(`${t === MSG.SUMMONING ? 'Normalbeschwörung' : t === MSG.SPSUMMONING ? 'Spezialbeschwörung' : 'Flip-Beschwörung'}: ${this.name(m.code)}`);
    } else if (t === MSG.ATTACK) { this.log.push('Angriff'); }
  }

  /** Vollständiger Feldzustand (beide Seiten). Die Oberfläche blendet verdeckte Information aus. */
  snapshot() {
    const { lib, handle } = this;
    const out = { lp: [...this.lp], turn: this.turn, phase: this.phase, turnPlayer: this.turnPlayer, players: [] };
    for (let c = 0; c < 2; c++) {
      const P = { deck: lib.duelQueryCount(handle, c, LOC.DECK), extraCount: lib.duelQueryCount(handle, c, LOC.EXTRA) };
      for (const [key, loc] of [['hand', LOC.HAND], ['mzone', LOC.MZONE], ['szone', LOC.SZONE], ['grave', LOC.GRAVE], ['banished', LOC.REMOVED], ['extra', LOC.EXTRA]]) {
        P[key] = lib.duelQueryLocation(handle, { flags: QUERY, controller: c, location: loc }).map((q, seq) => (q ? { ...q, controller: c, location: loc, sequence: seq, name: q.code ? this.name(q.code) : '', type: this.cards.get(q.code)?.type ?? 0 } : null));
      }
      out.players.push(P);
    }
    return out;
  }
}

/** Zufalls-Spieler für Tests: wählt irgendeine legale Antwort. */
export function randomResponse(msg, rnd, ctx = {}) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const R = OcgResponseType;
  switch (msg.type) {
    case MSG.SELECT_IDLECMD: {
      const opts = [];
      const add = (act, list) => (list || []).forEach((_, i) => opts.push({ type: R.SELECT_IDLECMD, action: act, index: i }));
      add(SelectIdleCMDAction.SELECT_SUMMON, msg.summons); add(SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, msg.special_summons);
      add(SelectIdleCMDAction.SELECT_POS_CHANGE, msg.pos_changes); add(SelectIdleCMDAction.SELECT_MONSTER_SET, msg.monster_sets);
      add(SelectIdleCMDAction.SELECT_SPELL_SET, msg.spell_sets); add(SelectIdleCMDAction.SELECT_ACTIVATE, msg.activates);
      const acts = opts.length;
      // Fortschritt erzwingen: mit steigender Zahl an Aktionen wird die Phase öfter beendet
      if (msg.to_bp && rnd() < 0.35) return { type: R.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null };
      if (!acts || rnd() < 0.15) {
        if (msg.to_ep) return { type: R.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null };
        if (msg.to_bp) return { type: R.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null };
      }
      return pick(opts);
    }
    case MSG.SELECT_BATTLECMD: {
      if (msg.attacks?.length && rnd() < 0.8) return { type: R.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: Math.floor(rnd() * msg.attacks.length) };
      if (msg.chains?.length && rnd() < 0.3) return { type: R.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index: Math.floor(rnd() * msg.chains.length) };
      if (msg.to_ep) return { type: R.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null };
      return { type: R.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null };
    }
    case MSG.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: rnd() < 0.7 };
    case MSG.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: rnd() < 0.5 };
    case MSG.SELECT_OPTION: return { type: R.SELECT_OPTION, index: Math.floor(rnd() * msg.options.length) };
    case MSG.SELECT_CARD: {
      const n = msg.selects.length; const min = Math.max(msg.min, 0), max = Math.min(msg.max, n);
      if (min === 0 && msg.can_cancel && rnd() < 0.3) return { type: R.SELECT_CARD, indicies: null };
      const k = min + Math.floor(rnd() * (max - min + 1));
      const idx = [...Array(n).keys()].sort(() => rnd() - 0.5).slice(0, k);
      return { type: R.SELECT_CARD, indicies: idx };
    }
    case MSG.SELECT_UNSELECT_CARD: {
      const sel = msg.select_cards.length;
      if (sel && rnd() < 0.8) return { type: R.SELECT_UNSELECT_CARD, index: Math.floor(rnd() * sel) };
      if (msg.can_finish) return { type: R.SELECT_UNSELECT_CARD, index: null };
      if (msg.can_cancel) return { type: R.SELECT_UNSELECT_CARD, index: null };
      return { type: R.SELECT_UNSELECT_CARD, index: sel ? 0 : null };
    }
    case MSG.SELECT_CHAIN: {
      if (!msg.forced && (rnd() < 0.45 || !msg.selects.length)) return { type: R.SELECT_CHAIN, index: null };
      return { type: R.SELECT_CHAIN, index: Math.floor(rnd() * msg.selects.length) };
    }
    case MSG.SELECT_PLACE: case MSG.SELECT_DISFIELD: {
      const free = placesFromMask(msg.field_mask >>> 0, msg.player);
      const k = msg.count || 1;
      const ch = [...free].sort(() => rnd() - 0.5).slice(0, k);
      return { type: msg.type === MSG.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places: ch };
    }
    case MSG.SELECT_POSITION: {
      const ps = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEUP_DEFENSE].filter((p) => msg.positions & p);
      return { type: R.SELECT_POSITION, position: pick(ps.length ? ps : [OcgPosition.FACEUP_ATTACK]) };
    }
    case MSG.SELECT_TRIBUTE: {
      // einfache Auswahl: so viele wie nötig (nach Wert), sonst min
      const need = msg.min; const idx = [...Array(msg.selects.length).keys()];
      let sum = 0; const chosen = [];
      for (const i of idx.sort(() => rnd() - 0.5)) { if (sum >= need) break; chosen.push(i); sum += msg.selects[i].value ?? 1; }
      return { type: R.SELECT_TRIBUTE, indicies: chosen };
    }
    case MSG.SELECT_SUM: {
      const pick1 = sumSelection(msg, rnd);
      return { type: R.SELECT_SUM, indicies: pick1 };
    }
    case MSG.SELECT_COUNTER: {
      let left = msg.count; const counters = msg.cards.map(() => 0);
      msg.cards.forEach((c, i) => { const t = Math.min(c.count, left); counters[i] = t; left -= t; });
      return { type: R.SELECT_COUNTER, counters };
    }
    case MSG.SORT_CARD: case MSG.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
    case MSG.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: [msg.available ? firstBit(msg.available) : 1n].flat() };
    case MSG.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: [firstBit(msg.available)] };
    case MSG.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 };
    case MSG.ANNOUNCE_CARD: return { type: R.ANNOUNCE_CARD, card: announceCard(msg, rnd, ctx) };
    case MSG.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 };
    default: throw new Error('Unbekannte Auswahl: ' + MSG_NAME[msg.type]);
  }
}
function firstBit(v) {
  if (typeof v === 'bigint') { for (let i = 0n; i < 64n; i++) if (v & (1n << i)) return 1n << i; return 1n; }
  for (let i = 0; i < 32; i++) if (v & (1 << i)) return 1 << i; return 1;
}

/** Port von select_sum_check1 (playerop.cpp): Summe mit je zwei möglichen Werten pro Karte (niedrige/hohe 16 Bit). */
export function sumCheck1(op, index, acc) {
  const size = op.length;
  if (acc === 0 || index === size) return false;
  const o1 = op[index] & 0xffff; const o2 = op[index] >>> 16;
  if (index === size - 1) return acc === o1 || acc === o2;
  return (acc > o1 && sumCheck1(op, index + 1, acc - o1)) || (o2 > 0 && acc > o2 && sumCheck1(op, index + 1, acc - o2));
}
/** Prüft eine Auswahl (Indizes in msg.selects) wie der Kern es tut. */
export function sumSelectionValid(msg, indicies) {
  const must = msg.selects_must.map((c) => c.amount);
  const chosen = indicies.map((i) => msg.selects[i].amount);
  const acc = msg.amount;
  if (msg.max) {
    const max = Math.max(msg.max, msg.min);
    if (indicies.length < msg.min || indicies.length > max) return false;
    return sumCheck1([...must, ...chosen], 0, acc);
  }
  let sum = 0, mx = 0, mn = 0x7fffffff;
  for (const op of [...must, ...chosen]) {
    const o1 = op & 0xffff; const o2 = op >>> 16; const ms = (o2 && o2 < o1) ? o2 : o1;
    sum += ms; mx += o2 > o1 ? o2 : o1; if (ms < mn) mn = ms;
  }
  return !(mx < acc || sum - mn >= acc);
}
/** Zufällige gültige Summenauswahl; wirft nicht, sondern liefert notfalls [] (Kern lehnt dann ab). */
export function sumSelection(msg, rnd) {
  const n = msg.selects.length;
  if (n <= 14) {
    const masks = [...Array(1 << n).keys()].sort(() => rnd() - 0.5);
    for (const m of masks) {
      const idx = []; for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i);
      if (sumSelectionValid(msg, idx)) return idx;
    }
    return [];
  }
  const idx = [...Array(n).keys()].sort(() => rnd() - 0.5); const chosen = [];
  for (const i of idx) { chosen.push(i); if (sumSelectionValid(msg, chosen)) return chosen; }
  return [];
}
/** Karte für ANNOUNCE_CARD: irgendeine, die die Bedingungen (Opcodes) des Kerns erfüllt. */
export function announceCard(msg, rnd, ctx) {
  const cards = ctx.cards; if (!cards) return 0;
  const ok = []; for (const c of cards.values()) { if (ok.length >= 400) break; if (cardMatchesOpcode(c, msg.opcodes)) ok.push(c.code); }
  return ok.length ? ok[Math.floor(rnd() * ok.length)] : 0;
}
