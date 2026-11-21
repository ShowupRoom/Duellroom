// Konsistenz-Bewertung (offline): Wie zuverlässig kommt ein Deck in einen brauchbaren Zug?
// Rechnet exakt (hypergeometrisch) mit den Rollen der Karten – keine Zufallsläufe, darum ist das Ergebnis stabil.
import { isExtra } from './decks.mjs';
import { roleOf, HANDTRAPS } from './tutor.mjs';
import { engineReport, blurb, matches } from './goals.mjs';
import { handtrapInfo, TIER_TEXT } from './handtraps.mjs';

const clean = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '');
const lcName = (c) => clean(c.name).toLowerCase();
const clamp = (x) => Math.max(0, Math.min(1, x));
const pct = (x) => Math.round(x * 100) + '%';

// ---- Rolle → Konsistenz-Klasse -----------------------------------------------------------------------------
// S Starter (sucht/ruft aus dem Deck) · D Zugkarte · E Verlängerer · H Handtrap · R Entferner · T Falle
// B schweres Monster im Hauptdeck (hängt oft tot auf der Hand) · M sonstiges Monster · O sonstiges · X Extradeck
// Allzweck-Zugkarten, die in vielen Decks sinnvoll sind (nur diese werden ungefragt empfohlen)
const SAFE_DRAW = new Set(['pot of greed', 'graceful charity', 'upstart goblin', 'pot of prosperity', 'pot of desires', 'pot of extravagance', 'pot of duality', 'reinforcement of the army', 'terraforming']);
const EXT_NAMES = new Set(['monster reborn', 'premature burial', 'call of the haunted']);
const roleCache = new Map();
const roleFor = (c) => { let r = roleCache.get(c.code); if (r === undefined) { r = roleOf(c); roleCache.set(c.code, r); } return r; };
export function cls(c) {
  if (!c || isExtra(c)) return 'X';
  if (EXT_NAMES.has(lcName(c))) return 'E';
  switch (roleFor(c)) {
    case 'starter': return 'S';
    case 'draw': return 'D';
    case 'extender': return (c.type & 2) ? 'S' : 'E'; // Zauber, die Monster rufen/beschwören, funktionieren allein wie ein Starter
    case 'handtrap': return 'H';
    case 'removal': return 'R';
    case 'trap': return 'T';
    case 'boss': return /Special Summon this card/i.test(c.desc || '') ? 'E' : 'B';
    case 'material': return 'M';
    default: return 'O';
  }
}
export const CLS_DE = { S: 'Starter', D: 'Zugkarte', E: 'Verlängerer', H: 'Handtrap', R: 'Entferner', T: 'Falle', B: 'schweres Monster', M: 'Monster', O: 'sonstige Karte' };

// ---- Wahrscheinlichkeiten ----------------------------------------------------------------------------------
const LF = [0]; for (let i = 1; i <= 260; i++) LF[i] = LF[i - 1] + Math.log(i);
const lch = (n, k) => (k < 0 || k > n ? -Infinity : LF[n] - LF[k] - LF[n - k]);
const pmf = (N, K, h, k) => Math.exp(lch(K, k) + lch(N - K, h - k) - lch(N, h));
/** Wahrscheinlichkeit, in h gezogenen Karten mindestens m der K Treffer aus N Karten zu haben */
export function pAtLeast(N, K, h, m) { h = Math.min(h, N); if (m <= 0) return 1; let p = 0; for (let k = 0; k < m; k++) p += pmf(N, K, h, k); return clamp(1 - p); }

// ---- Profil eines Decks ----------------------------------------------------------------------------------------
/** Zählt die Klassen im Hauptdeck. limOf(code) = erlaubte Kopien im Format (Standard 3). */
export function profile(deck, cards, setnames, limOf = () => 3) {
  const entries = (deck.main || []).map(([code, n]) => ({ code, n, card: cards.get(code) })).filter((e) => e.card);
  let rep = { engines: [], bridges: [] }; try { rep = engineReport(deck, cards, setnames, roleOf); } catch (e) { /* ohne Engines */ }
  const inEng = new Set(rep.engines.flatMap((g) => g.all.map((e) => e.code)));
  const c = { S: 0, D: 0, E: 0, H: 0, R: 0, T: 0, B: 0, M: 0, O: 0 }; let N = 0, filler = 0, sCop = 0, sLim = 0; const list = [];
  for (const e of entries) {
    const k = cls(e.card); if (k === 'X') continue; const eng = inEng.has(e.code);
    N += e.n; c[k] += e.n;
    if (rep.engines.length && !eng && 'MOBE'.includes(k)) filler += e.n;
    if (k === 'S') { sCop += e.n; sLim += Math.max(e.n, Math.min(3, limOf(e.code) || 0)); }
    list.push({ code: e.code, n: e.n, k, eng });
  }
  return { N, c, engines: rep.engines.length, filler, sCop, sLim, loose: !rep.engines.length, rep, list };
}

// ---- Bewertung -------------------------------------------------------------------------------------------------
export const labelOf = (s) => (s >= 85 ? 'Sehr konstant' : s >= 72 ? 'Konstant' : s >= 58 ? 'Solide' : s >= 45 ? 'Wacklig' : 'Unzuverlässig');
export const toneOf = (s) => (s >= 72 ? 'ok' : s >= 50 ? 'warn' : 'bad');

/** Kennzahlen und Score (0–100) aus einem Profil; null, wenn zu wenige Karten */
export function rate(p) {
  const N = p.N; if (N < 10) return null; const H = 5;
  const strongK = p.c.S + p.c.D + (p.loose ? p.c.M : 0); const accK = strongK + p.c.E;
  const p5 = pAtLeast(N, strongK, H, 1), p6 = pAtLeast(N, strongK, 6, 1), pAcc = pAtLeast(N, accK, H, 1), brick = 1 - pAcc;
  const dead2 = pAtLeast(N, p.c.B, H, 2);
  const fill = p.filler + Math.max(0, p.c.H - 12);
  const s1 = 0.7 * clamp(1 - (1 - p5) / 0.30) + 0.3 * clamp(1 - brick / 0.12);
  const s2 = clamp(1 - dead2 / 0.30);
  const s3 = clamp(1 - 0.04 * Math.max(0, N - 40) - 0.06 * Math.max(0, 40 - N));
  const s4 = p.sLim ? clamp(p.sCop / p.sLim) : 0.6;
  const s5 = p.engines ? [1, 1, 0.88, 0.72][Math.min(3, p.engines)] * clamp(1 - Math.max(0, fill - 10) / 24) : 0.8 * clamp(1 - Math.max(0, p.c.H - 12) / 16);
  const raw = 100 * (0.38 * s1 + 0.20 * s2 + 0.14 * s3 + 0.10 * s4 + 0.18 * s5);
  return { raw, score: Math.round(raw), strongK, accK, p5, p6, brick, dead2, parts: { s1, s2, s3, s4, s5 }, fill, hs6: pAtLeast(N, p.c.H, 6, 1) };
}

const nm = (cards, code) => clean(cards.get(code)?.name) || String(code);
/** Anzeigename in Hinweistexten (die App setzt hier die deutschen Namen ein; gerechnet wird mit dem englischen) */
let DISPLAY = null; export const setDisplayName = (fn) => { DISPLAY = fn; };
const shown = (cards, code) => (DISPLAY ? DISPLAY(code) : nm(cards, code));
const lst = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]);

/** Gesamtbewertung mit Erklärungen (deutsch) */
export function consistency(deck, cards, setnames, limOf = () => 3) {
  const p = profile(deck, cards, setnames, limOf); const r = rate(p); if (!r) return null;
  const N = p.N; const notes = []; const warn = []; const good = [];
  const sN = r.strongK;
  if (N < 40) warn.push(`Erst ${N} Karten im Hauptdeck – ab 40 ist die Bewertung aussagekräftig (und regelkonform).`);
  if (p.loose) notes.push('Keine feste Engine erkannt – als „Starter“ zählen hier Zugkarten, Suchkarten und spielbare Monster.');
  if (r.p5 >= 0.93) good.push(`${sN} Starter/Zugkarten: In ${pct(r.p5)} der Starthände ist mindestens eine dabei.`);
  else if (r.p5 >= 0.85) notes.push(`${sN} Starter/Zugkarten: In ${pct(r.p5)} der Starthände ist mindestens eine dabei – 1–3 mehr würden das Deck sicherer machen.`);
  else warn.push(`Nur ${sN} Starter/Zugkarten: In ${pct(1 - r.p5)} der Starthände hast du keinen Starter. Bei 40 Karten sind etwa 12–16 üblich.`);
  if (r.brick > 0.06) warn.push(`Brick-Risiko ${pct(r.brick)}: So oft hast du keine einzige Karte, die dein Spiel in Gang bringt.`);
  else if (N >= 40) good.push(`Brick-Risiko nur ${pct(r.brick)} – selten eine unbrauchbare Starthand.`);
  if (p.c.B >= 3 && r.dead2 > 0.1) warn.push(`${p.c.B} schwere Monster im Hauptdeck: In ${pct(r.dead2)} der Hände liegen 2 oder mehr davon tot herum (sie brauchen Tribute/Material).`);
  if (N > 40) { const gain = pAtLeast(40, sN, 5, 1); warn.push(`${N} statt 40 Karten: jede Karte über 40 verdünnt dein Deck${sN ? ` (mit 40 Karten hättest du ${pct(gain)} statt ${pct(r.p5)} Starterchance)` : ''}.`); }
  const low = p.list.filter((e) => e.k === 'S' && e.n < Math.min(3, limOf(e.code) || 0)).map((e) => `${shown(cards, e.code)} (${e.n}×)`);
  if (low.length) notes.push(`Starter nicht voll ausgespielt: ${lst(low.slice(0, 3))} – 3× ist konstanter (wenn erlaubt).`);
  if (p.engines >= 3) warn.push(`${p.engines} Engines im selben Deck: jede braucht eigene Starter – das senkt die Konstanz. Gute Brücken sind hier Pflicht.`);
  else if (p.engines === 2) notes.push('2 Engines: funktioniert mit gemeinsamen Brücken-Karten; je Engine mindestens 4–5 Starter einplanen.');
  if (p.engines && r.fill > 12) warn.push(`${r.fill} Karten gehören zu keiner Engine und starten nichts (Fremdkarten/Handtraps) – sie verwässern das Deck.`);
  if (p.c.H === 0) notes.push('Keine Handtraps: im Zug des Gegners hast du wenig Schutz.');
  else if (p.c.H > 12) warn.push(`${p.c.H} Handtraps: sie starten deine Combo nicht – ab etwa 12 steigt die Brick-Gefahr.`);
  return {
    score: r.score, label: labelOf(r.score), tone: toneOf(r.score), N, strong: sN, access: r.accK,
    p5: r.p5, p6: r.p6, brick: r.brick, dead2: r.dead2, handtraps: p.c.H, hs6: r.hs6, bosses: p.c.B, engines: p.rep.engines.map((g) => g.name), nEngines: p.engines, filler: r.fill,
    good, warn, notes, parts: r.parts,
  };
}
/** Kleine Kurzform für die Deckliste (wird mitgespeichert) */
export const consSummary = (c) => (c ? { s: c.score, p5: +c.p5.toFixed(3), b: +c.brick.toFixed(3), n: c.strong } : null);

// ---- Empfehlungen ----------------------------------------------------------------------------------------------
const plus = (p, k, eng, isNewStarter, code, limOf) => ({ ...p, N: p.N + 1, c: { ...p.c, [k]: p.c[k] + 1 }, filler: p.filler + (p.engines && !eng && 'MOBE'.includes(k) ? 1 : 0), sCop: p.sCop + (k === 'S' ? 1 : 0), sLim: p.sLim + (k === 'S' && isNewStarter ? Math.max(1, Math.min(3, limOf(code) || 0)) : 0) });
const minus = (p, e, last) => ({ ...p, N: p.N - 1, c: { ...p.c, [e.k]: p.c[e.k] - 1 }, filler: p.filler - (p.engines && !e.eng && 'MOBE'.includes(e.k) ? 1 : 0), sCop: p.sCop - (e.k === 'S' ? 1 : 0), sLim: p.sLim - (e.k === 'S' && last ? Math.max(1, Math.min(3, 3)) : 0) });

/**
 * Welche Karten würden die Konsistenz erhöhen? o: { limOf, can(code), pool: [{c, ln}], max }
 * Rückgabe: { score, add: [{code, k, gain, why, cut, cutWhy, copy}], cut: [{code, gain, why}], prot: [{code, why}], codes: [...] }
 */
export function suggest(deck, cards, setnames, o = {}) {
  const limOf = o.limOf || (() => 3), can = o.can || (() => true), pool = o.pool || [], max = o.max || 6;
  const p0 = profile(deck, cards, setnames, limOf); const r0 = rate(p0); if (!r0) return null;
  const engs = p0.rep.engines; const have = new Map(p0.list.map((e) => [e.code, e]));
  const deckNames = [...new Set((deck.main || []).map(([c]) => nm(cards, c).toLowerCase()))].filter((n) => n.length > 3);
  const deckDescs = (deck.main || []).map(([c]) => (cards.get(c)?.desc || '').toLowerCase()).join('\n');
  const syn = (c) => { const d = (c.desc || '').toLowerCase(); const n = lcName(c); let s = 0; for (const x of deckNames) { if (x === n) continue; if (d.includes('"' + x + '"')) s += 2; } if (deckDescs.includes('"' + n + '"')) s += 3; return s; };
  // Kandidaten: Karten der erkannten Engines, schon gespielte Karten (mehr Kopien) und bekannte Allzweck-Karten
  const cands = []; const seenName = new Set();
  for (const { c, ln } of pool) {
    if (!c || isExtra(c)) continue; const eng = engs.length && (c.setcodes || []).some((s) => engs.some((g) => matches(s, g.code)));
    const nmL = lcName(c); // (nicht „ln“: dort steht seit der deutschen Anzeige „englisch|deutsch“)
    const hiC = handtrapInfo(c, o.fmtId); const isHT = !!(hiC && hiC.curated); const generic = SAFE_DRAW.has(nmL) || HANDTRAPS.has(nmL) || isHT;
    if (!(eng || have.has(c.code) || generic)) continue;
    const k = isHT ? 'H' : cls(c); if (!'SDEH'.includes(k) || k === 'X') continue;
    if (k === 'E' && !eng && !have.has(c.code)) continue; // Allzweck-Verlängerer nur, wenn schon im Deck
    if (!can(c.code)) continue; const key = lcName(c); if (seenName.has(key)) continue; seenName.add(key); cands.push({ c, k, eng: !!eng, have: have.get(c.code) });
  }
  // Streichkandidaten
  // Geschützte Karten: nennt der Decktitel sie, oder verweist eine andere Karte im Deck mit ihrem Namen darauf, gehören sie zum Plan
  const dn = (deck.name || '').toLowerCase(); const others = (deck.main || []).map(([c]) => ({ code: c, d: (cards.get(c)?.desc || '').toLowerCase() }));
  const protectedCard = (e) => { const n = nm(cards, e.code).toLowerCase(); if (n.length > 3 && dn.includes(n)) return true; return others.some((o) => o.code !== e.code && o.d.includes('"' + n + '"')); };
  const totB = p0.c.B; const cutsPool = p0.list.filter((e) => {
    if (e.k === 'S' || e.k === 'D' || protectedCard(e)) return false;
    if (e.k === 'B' && e.eng) return false;
    if (p0.engines) return (!e.eng && 'MOBET'.includes(e.k) && e.k !== 'T') || (e.k === 'B' && totB >= 5) || (e.k === 'H' && p0.c.H > 12);
    return e.k === 'O' || (e.k === 'B' && totB >= 5) || (e.k === 'H' && p0.c.H > 12);
  });
  const cutWhy = (e) => e.k === 'B' ? 'schweres Monster im Hauptdeck – hängt oft tot auf der Hand' : e.k === 'H' ? 'mehr Handtraps als nötig – sie starten deine Combo nicht' : p0.engines ? 'gehört zu keiner Engine und startet nichts – verwässert das Deck' : 'startet nichts und macht dein Deck dünner';
  const out = [];
  for (const cd of cands) {
    if (cd.k === 'H') continue; // Handtraps werden als „Schutz“ behandelt
    const isNew = !cd.have || cd.have.k !== 'S';
    const pAdd = plus(p0, cd.k, cd.eng, isNew && cd.k === 'S', cd.c.code, limOf); let best = null;
    if (p0.N < 40) best = { gain: rate(pAdd).raw - r0.raw, cut: null };
    for (const e of cutsPool) { if (e.code === cd.c.code) continue; const g = rate(minus(pAdd, e, e.n === 1)).raw - r0.raw; if (!best || g > best.gain) best = { gain: g, cut: e }; }
    if (!best || best.gain < 1.5) continue;
    const have0 = cd.have ? cd.have.n : 0; const lim = Math.min(3, limOf(cd.c.code) || 0); const bl = blurb(cd.c);
    const g = engs.find((g) => (cd.c.setcodes || []).some((s) => matches(s, g.code)));
    const why = have0 ? `Du spielst ${shown(cards, cd.c.code)} nur ${have0}× (erlaubt ${lim}×) – eine Kopie mehr erhöht die Chance auf einen Start.` : cd.k === 'D' ? `Zugkarte${bl ? ' – ' + bl : ''}: mehr Zugriff auf deine Karten.` : `${CLS_DE[cd.k]}${g ? ' der Engine „' + g.name + '“' : ''}${bl ? ' – ' + bl : ''}.`;
    out.push({ code: cd.c.code, k: cd.k, gain: best.gain, syn: syn(cd.c) + (have0 ? 4 : 0), why, cut: best.cut ? best.cut.code : null, cutWhy: best.cut ? cutWhy(best.cut) : '', copy: have0 > 0 });
  }
  out.sort((a, b) => Math.round(b.gain * 2) - Math.round(a.gain * 2) || b.syn - a.syn || b.gain - a.gain);
  const add = []; const usedCut = new Map();
  for (const s of out) { if (add.length >= max) break; if (s.cut) { const n = usedCut.get(s.cut) || 0; const have = p0.list.find((e) => e.code === s.cut)?.n || 1; if (n >= have) continue; usedCut.set(s.cut, n + 1); } add.push(s); }
  // schwache Karten: Gewinn, wenn sie durch einen zusätzlichen Starter ersetzt würden
  const cut = cutsPool.map((e) => { const pS = plus(minus(p0, e, e.n === 1), 'S', true, true, e.code, limOf); return { code: e.code, k: e.k, gain: rate(pS).raw - r0.raw, why: cutWhy(e) }; }).filter((x) => x.gain >= 1.5).sort((a, b) => b.gain - a.gain).slice(0, 4);
  // Schutz: Handtraps, wenn weniger als 3
  const prot = [];
  if (p0.c.H < 3) {
    // nur echte Handtraps (Rangliste), die besten zuerst; Karten wie „Called by the Grave“ sind Schutz, aber keine Handtrap
    const hts = cands.filter((cd) => cd.k === 'H').map((cd) => ({ cd, hi: handtrapInfo(cd.c, o.fmtId) })).filter((x) => x.hi && x.hi.curated).sort((a, b) => b.hi.score - a.hi.score || lcName(a.cd.c).localeCompare(lcName(b.cd.c)));
    for (const { cd, hi } of hts) { const bl = hi.note || (blurb(cd.c) || '').replace(/^Handtrap: /, ''); prot.push({ code: cd.c.code, why: `Handtrap Stufe ${hi.tier} (${TIER_TEXT[hi.tier]})${bl ? ' – ' + bl : ''}`, syn: 0 }); if (prot.length >= 12) break; }
  }
  const protTop = prot.slice(0, 3);
  return { score: r0.score, base: r0.raw, add, cut, prot: protTop, codes: [...add.map((a) => a.code), ...protTop.map((a) => a.code)] };
}
