// Kombo-Vorführung: erklärt in einfachen Worten, was die KI gerade tut und warum
import { nameOf, cardOf, descOf } from './data.js';
import { OcgMessageType as MSG, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, LOC } from '../../src/core.mjs';
import { effectView } from './effecttext.js';
import { descText, levelText } from './strings.js';
import { first } from './tips.js';
import { roleOf, ROLE_DE } from '../../src/tutor.mjs';

const inK = (a, c) => (a || []).includes(c);
const nm = (code) => `«${nameOf(code)}»`;
const FROM = { [LOC.HAND]: 'aus der Hand', [LOC.GRAVE]: 'aus dem Friedhof', [LOC.REMOVED]: 'aus der Verbannung', [LOC.DECK]: 'aus dem Deck', [LOC.EXTRA]: 'aus dem Extra Deck', [LOC.MZONE]: 'vom Feld', [LOC.SZONE]: 'vom Feld' };

/** Rolle der Karte im Deck des Spielers: [Name, Satz dazu] oder null */
export function roleInfo(D, p, code) {
  const K = ((D.deckOf(p) || {}).tutor || {}).keys || {};
  if (inK(K.starters, code)) return ['Starter', 'Setzt die Combo in Gang: holt oder beschwört die nächsten Teile.'];
  if (inK(K.extenders, code)) return ['Verlängerer', 'Bringt weitere Monster oder Karten ins Spiel und baut das Feld aus.'];
  if (inK(K.bosses, code)) return ['Boss', 'Eines der stärksten Monster des Decks – das Ziel der Combo.'];
  if (inK(K.handtraps, code)) { const c = cardOf(code); return c && (c.type & 1) ? ['Handtrap', 'Wird im Zug des Gegners aus der Hand gespielt, um ihn zu stören.'] : ['Störer', 'Wird im Zug des Gegners ausgelöst, um ihn zu stören.']; }
  if (inK(K.removal, code)) return ['Entferner', 'Räumt Karten des Gegners vom Feld.'];
  const c = cardOf(code); const r = c ? roleOf(c) : null;
  if (r && ROLE_DE[r] && r !== 'other' && r !== 'material') return [ROLE_DE[r], ''];
  return null;
}

/** Markierte Stelle des Kartentextes, die zu diesem Effekt gehört (gekürzt); sonst der erste Satz */
export function effectExcerpt(code, desc, loc, max = 190) {
  let t = '';
  try {
    const v = effectView(code, desc, loc);
    if (v && v.ranges && v.ranges.length) t = v.ranges.map(([a, b]) => v.text.slice(a, b).replace(/\s+/g, ' ').trim()).join(' … ');
  } catch (e) { t = ''; }
  if (!t) t = first(descOf(cardOf(code)), max);
  const k = cardOf(code); if (k && (k.type & (0x40 | 0x2000 | 0x800000 | 0x4000000))) { const m = t.match(/^[^:;.]{3,110}?\s+(Einmal pro Spielzug|Einmal pro Zug|Du kannst|Wenn |Falls |Solange |Jedes Mal|Einmal )/); if (m && /[+＋]/.test(t.slice(0, m[0].length - m[1].length))) t = t.slice(m[0].length - m[1].length); } // Beschwörungsmaterial vor dem Effekt weglassen
  t = t.replace(/^[●•]\s*/, '');
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …' : t;
}

const typeWord = (c) => (!c ? 'Monster' : c.type & 0x40 ? 'Fusionsmonster' : c.type & 0x2000 ? 'Synchromonster' : c.type & 0x800000 ? 'Xyz-Monster' : c.type & 0x4000000 ? 'Link-Monster' : 'Monster');
const stat = (c) => (c && (c.type & 1) ? `${c.type & 0x4000000 ? 'Link ' + c.level : levelText(c)}, ATK ${c.attack < 0 ? '?' : c.attack}` : '');

/** Das Feld nach dem Zug in einem Satz */
export function endBoard(D, p) {
  const pl = D.snap && D.snap.players[p]; if (!pl) return '';
  const mon = pl.mzone.filter(Boolean).map((c) => `${nm(c.code)}${c.attack != null && c.position & 1 ? ' (' + c.attack + ')' : ''}`);
  const st = pl.szone.filter(Boolean).length;
  return `Feld am Zugende: ${mon.length ? mon.join(', ') : 'keine Monster'} · Zauber/Fallen: ${st} · Hand: ${pl.hand.length} · Friedhof: ${pl.grave.length}`;
}

const pick = (list, i) => (list && i != null ? list[i] : null);

/** Erklärt, was die KI mit der Antwort `resp` auf die Nachricht `msg` tut. Gibt null zurück, wenn es nichts zu sagen gibt.
 *  kind 'step' = ein eigener Schritt (mit Karte und Erklärung), 'note' = kurzer Zusatz zum laufenden Schritt */
export function explain(D, msg, resp) {
  const p = msg.player; const who = D.pname(p);
  const R = (code, extra = {}) => ({ code, who, p, role: code ? roleInfo(D, p, code) : null, ...extra });
  switch (msg.type) {
    case MSG.SELECT_IDLECMD: {
      const a = resp && resp.action; const i = resp && resp.index;
      if (a === IA.SELECT_SUMMON) { const c = pick(msg.summons, i); if (!c) return null; const k = cardOf(c.code); return R(c.code, { kind: 'step', loc: c, title: 'Normalbeschwörung', line: `${nm(c.code)} (${stat(k)})`, text: k && k.level > 4 ? 'Ein hochstufiges Monster braucht Opfer.' : 'Die Normalbeschwörung des Zuges – ohne Opfer spielbar.' }); }
      if (a === IA.SELECT_SPECIAL_SUMMON) { const c = pick(msg.special_summons, i); if (!c) return null; const k = cardOf(c.code); const fromExtra = c.location === LOC.EXTRA; return R(c.code, { kind: 'step', loc: c, title: 'Spezialbeschwörung', line: `${nm(c.code)} ${FROM[c.location] || ''}`.trim(), text: fromExtra ? `${typeWord(k)} (${stat(k)}). Es wird mit den richtigen Materialien aus dem Extra Deck beschworen.` : first(descOf(k), 170) }); }
      if (a === IA.SELECT_ACTIVATE) { const c = pick(msg.activates, i); if (!c) return null; const lbl = descText(c.description, c.code, c.location); const ok = lbl && c.description > 0n && lbl.trim() !== 'Aktivieren'; return R(c.code, { kind: 'step', loc: c, title: 'Effekt aktivieren', line: `${nm(c.code)}${ok ? ' – ' + lbl.replace(/\s+/g, ' ').slice(0, 70) : ''}`, text: effectExcerpt(c.code, c.description, c.location) }); }
      if (a === IA.SELECT_MONSTER_SET) { const c = pick(msg.monster_sets, i); if (!c) return null; return R(c.code, { kind: 'step', loc: c, title: 'Monster setzen', line: nm(c.code), text: 'Verdeckt in Verteidigung gelegt: Der Gegner sieht die Karte nicht.' }); }
      if (a === IA.SELECT_SPELL_SET) { const c = pick(msg.spell_sets, i); if (!c) return null; const k = cardOf(c.code); return R(c.code, { kind: 'step', loc: c, title: k && (k.type & 4) ? 'Falle setzen' : 'Zauber setzen', line: nm(c.code), text: k && (k.type & 4) ? 'Fallen werden verdeckt gelegt und können ab dem nächsten Zug – auch im Zug des Gegners – ausgelöst werden.' : 'Verdeckt gelegt, um sie später zu aktivieren.' }); }
      if (a === IA.SELECT_POS_CHANGE) { const c = pick(msg.pos_changes, i); if (!c) return null; return R(c.code, { kind: 'step', loc: c, title: 'Position ändern', line: nm(c.code), text: 'Das Monster wechselt die Kampfposition.' }); }
      if (a === IA.TO_BP) return R(0, { kind: 'step', title: 'Kampfphase', line: 'Weiter zum Kampf', text: 'Jetzt greifen die Monster an.' });
      if (a === IA.TO_EP) return R(0, { kind: 'step', title: 'Zug beenden', line: 'Der Zug ist zu Ende', text: endBoard(D, p), end: true });
      return null;
    }
    case MSG.SELECT_BATTLECMD: {
      const a = resp && resp.action; const i = resp && resp.index;
      if (a === BA.SELECT_BATTLE) { const c = pick(msg.attacks, i); if (!c) return null; const k = cardOf(c.code); return R(c.code, { kind: 'step', loc: c, title: 'Angriff', line: `${nm(c.code)} greift an${c.can_direct ? ' (direkt möglich)' : ''}`, text: `ATK ${k && k.attack >= 0 ? k.attack : '?'}. Das Ziel wird im nächsten Schritt gewählt.` }); }
      if (a === BA.SELECT_CHAIN) { const c = pick(msg.chains, i); if (!c) return null; return R(c.code, { kind: 'step', loc: c, title: 'Effekt im Kampf', line: nm(c.code), text: effectExcerpt(c.code, c.description, c.location) }); }
      return null;
    }
    case MSG.SELECT_CHAIN: {
      const i = resp && resp.index; if (i == null) return null; const c = pick(msg.selects, i); if (!c) return null;
      const trig = !D.chain.length;
      return R(c.code, { kind: 'step', loc: c, title: trig ? 'Auslöser-Effekt' : 'Antwort in der Kette', line: nm(c.code), text: effectExcerpt(c.code, c.description, c.location) });
    }
    case MSG.SELECT_EFFECTYN: {
      if (!resp || !resp.yes || !msg.code) return null;
      return R(msg.code, { kind: 'note', text: `Aktiviert den Effekt von ${nm(msg.code)}.` });
    }
    case MSG.SELECT_CARD: case MSG.SELECT_TRIBUTE: {
      const ix = resp && resp.indicies; if (!ix || !ix.length) return null;
      const names = ix.map((j) => msg.selects[j]).filter(Boolean).map((s) => (D.selVisible(s) ? nm(s.code) : 'eine verdeckte Karte'));
      return names.length ? R(0, { kind: 'note', text: `Wählt: ${names.join(', ')}` }) : null;
    }
    default: return null;
  }
}

/** Wie lange der Schritt zum Lesen stehen bleibt (ms) */
export const readMs = (ex) => Math.min(5800, 3300 + Math.min(230, (ex.line || '').length + (ex.text || '').length) * 5); // ≈ 4 s pro Karte, längere Texte etwas länger

/** Das Endboard der Suche in einem Satz */
export function boardText(b) {
  if (!b) return '';
  const mons = (b.mon || []).filter(([c]) => c).map(([c, a]) => `${nm(c)}${a ? ' (' + a + ')' : ''}`);
  const ints = (b.intCards || []).map(([c]) => nm(c)); const hd = (b.hand || []).map((c) => nm(c));
  const parts = [`${b.mons} Monster${mons.length ? ': ' + mons.join(', ') : ''}`];
  if (b.st) parts.push(`${b.st} Zauber/Fallen`);
  if (ints.length || hd.length) parts.push(`Unterbrechungen: ${[...ints, ...hd.map((x) => x + ' (Hand)')].join(', ')}`);
  return parts.join(' · ');
}

/** Spielt die in der Suche gefundene Antwortfolge der Reihe nach ab; weicht das Spiel ab (sollte nie passieren) oder ist die Folge zu Ende, übernimmt die normale KI */
export class ReplayBot {
  constructor(rec, fallback) { this.rec = rec; this.i = 0; this.fb = fallback; this.off = false; }
  respond(msg, ctx) {
    if (!this.off && this.i < this.rec.length) { const e = this.rec[this.i]; if (e.t === msg.type) { this.i++; return e.r; } this.off = true; }
    return this.fb.respond(msg, ctx);
  }
}
