// Deck-Regeln: Prüfen und Reparieren – wird im Build (Node) und in der App (Browser) verwendet.
export const EXTRA_MASK = 0x40 | 0x2000 | 0x800000 | 0x4000000; // Fusion, Synchro, Xyz, Link
export const T = { MONSTER: 1, SPELL: 2, TRAP: 4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, SYNCHRO: 0x2000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000 };
export const isExtra = (c) => !!(c && (c.type & EXTRA_MASK));

/** Formatdefinitionen. list: Schlüssel in lists.json */
export const FORMATS = {
  goat: { id: 'goat', name: 'Goat', sub: 'April 2005', list: 'goat', core: 'MODE_GOAT', minMain: 40, maxMain: 60, maxExtra: 15, maxSide: 15 },
  edison: { id: 'edison', name: 'Edison', sub: 'März 2010', list: 'edison', core: 'MODE_EDISON', minMain: 40, maxMain: 60, maxExtra: 15, maxSide: 15 },
  advanced: { id: 'advanced', name: 'Advanced', sub: 'TCG 10/2026', list: 'tcg', core: 'MODE_MR5', minMain: 40, maxMain: 60, maxExtra: 15, maxSide: 15 },
  speed: { id: 'speed', name: 'Speed Duell', sub: '4000 LP · 3 Zonen', list: 'speed', core: 'MODE_SPEED', minMain: 20, maxMain: 30, maxExtra: 5, maxSide: 5, lp: 4000, hand: 4 },
  genesys: { id: 'genesys', name: 'Genesys', sub: '100 Punkte', list: 'genesys', core: 'MODE_GENESYS', minMain: 40, maxMain: 60, maxExtra: 15, maxSide: 15, cap: 100, noLink: true, noPendulum: true },
};

export const count = (list) => list.reduce((s, e) => s + e[1], 0);
const total = (deck) => { const m = new Map(); for (const sec of ['main', 'extra', 'side']) for (const [c, n] of deck[sec]) m.set(c, (m.get(c) || 0) + n); return m; };

/** erlaubte Kopien einer Karte in diesem Format (0–3) */
export function allowed(code, fmt, lists) {
  const L = lists[fmt.list]; if (!L) return 3;
  if (fmt.id === 'genesys') return 3;
  if (L.map[code] !== undefined) return L.map[code];
  return L.wl ? 0 : 3;
}
export const points = (code, lists) => lists.genesys.points[code] || 0;
export function deckPoints(deck, lists) { let p = 0; for (const [c, n] of total(deck)) p += points(c, lists) * n; return p; }

/** Liste verständlicher Probleme (leer = spielbar) */
export function validate(deck, fmt, cards, lists) {
  const out = [];
  const nm = (c) => cards.get(c)?.name || String(c);
  const nMain = count(deck.main), nExtra = count(deck.extra), nSide = count(deck.side);
  if (nMain < fmt.minMain) out.push({ t: 'size', msg: `Hauptdeck hat nur ${nMain} Karten (mindestens ${fmt.minMain}).` });
  if (nMain > fmt.maxMain) out.push({ t: 'size', msg: `Hauptdeck hat ${nMain} Karten (höchstens ${fmt.maxMain}).` });
  if (nExtra > fmt.maxExtra) out.push({ t: 'size', msg: `Extradeck hat ${nExtra} Karten (höchstens ${fmt.maxExtra}).` });
  if (nSide > fmt.maxSide) out.push({ t: 'size', msg: `Sidedeck hat ${nSide} Karten (höchstens ${fmt.maxSide}).` });
  for (const [c] of deck.main) if (!cards.get(c)) out.push({ t: 'unknown', code: c, msg: `Unbekannte Karte ${c}.` }); else if (isExtra(cards.get(c))) out.push({ t: 'zone', code: c, msg: `${nm(c)} gehört ins Extradeck.` });
  for (const [c] of deck.extra) if (cards.get(c) && !isExtra(cards.get(c))) out.push({ t: 'zone', code: c, msg: `${nm(c)} gehört ins Hauptdeck.` });
  for (const [c, n] of total(deck)) {
    const cd = cards.get(c); if (!cd) continue;
    const lim = allowed(c, fmt, lists);
    if (n > lim) out.push({ t: 'copies', code: c, msg: lim === 0 ? `${nm(c)} ist in diesem Format verboten.` : `${nm(c)}: höchstens ${lim}× erlaubt (im Deck ${n}×).` });
    if (fmt.noLink && (cd.type & T.LINK)) out.push({ t: 'banned', code: c, msg: `${nm(c)}: Link-Monster sind in Genesys nicht erlaubt.` });
    if (fmt.noPendulum && (cd.type & T.PENDULUM)) out.push({ t: 'banned', code: c, msg: `${nm(c)}: Pendel-Monster sind in Genesys nicht erlaubt.` });
  }
  if (fmt.cap) { const p = deckPoints(deck, lists); if (p > fmt.cap) out.push({ t: 'points', msg: `${p} Punkte – erlaubt sind ${fmt.cap}.` }); }
  return out;
}

const clone = (d) => ({ main: d.main.map((e) => [...e]), extra: d.extra.map((e) => [...e]), side: d.side.map((e) => [...e]) });
const put = (list, code, n = 1) => { const e = list.find((x) => x[0] === code); if (e) e[1] += n; else list.push([code, n]); };
const take = (list, code, n = 1) => { const i = list.findIndex((x) => x[0] === code); if (i < 0) return 0; const t = Math.min(n, list[i][1]); list[i][1] -= t; if (list[i][1] <= 0) list.splice(i, 1); return t; };

/**
 * Macht ein Deck regelkonform und spielbar. Meldet jede Änderung in Klartext.
 * 1) unbekannte Karten raus, 2) Karten in die richtige Zone, 3) zu viele Kopien/verbotene Karten raus,
 * 4) zu große Zonen kürzen, 5) Hauptdeck auf Mindestgröße auffüllen (mit Kopien schon vorhandener Karten).
 */
export function repair(deckIn, fmt, cards, lists, opts = {}) {
  const d = clone(deckIn); const log = []; const nm = (c) => cards.get(c)?.name || String(c);
  for (const sec of ['main', 'extra', 'side']) for (const [c, n] of [...d[sec]]) if (!cards.get(c)) { take(d[sec], c, n); log.push(`Unbekannte Karte ${c} entfernt (${n}×).`); }
  for (const [c, n] of [...d.main]) if (isExtra(cards.get(c))) { take(d.main, c, n); put(d.extra, c, n); log.push(`${nm(c)} ins Extradeck verschoben.`); }
  for (const [c, n] of [...d.extra]) if (!isExtra(cards.get(c))) { take(d.extra, c, n); put(d.main, c, n); log.push(`${nm(c)} ins Hauptdeck verschoben.`); }
  // Kopien / verbotene Karten: erst Side, dann Extra, dann Main kürzen
  for (const [c] of total(d)) {
    const cd = cards.get(c); let lim = allowed(c, fmt, lists);
    if ((fmt.noLink && (cd.type & T.LINK)) || (fmt.noPendulum && (cd.type & T.PENDULUM))) lim = 0;
    let over = [...total(d)].find(([k]) => k === c)[1] - lim;
    for (const sec of ['side', 'extra', 'main']) { if (over <= 0) break; const t = take(d[sec], c, over); if (t) { over -= t; log.push(`${nm(c)}: ${t}× entfernt (${lim === 0 ? 'verboten' : 'Limit ' + lim}).`); } }
  }
  if (fmt.cap) { // Genesys: teuerste Karten zuerst streichen, bis die Punkte reichen
    let p = deckPoints(d, lists);
    while (p > fmt.cap) {
      let worst = null; for (const sec of ['side', 'extra', 'main']) for (const [c] of d[sec]) { const pt = points(c, lists); if (pt > 0 && (!worst || pt > worst.pt)) worst = { c, pt, sec }; }
      if (!worst) break; take(d[worst.sec], worst.c, 1); p -= worst.pt; log.push(`${nm(worst.c)}: 1× entfernt (${worst.pt} Punkte, Limit ${fmt.cap}).`);
    }
  }
  const trim = (sec, max, label) => { let n = count(d[sec]); while (n > max) { const e = d[sec][d[sec].length - 1]; take(d[sec], e[0], 1); n--; log.push(`${label}: ${nm(e[0])} entfernt (zu viele Karten).`); } };
  trim('extra', fmt.maxExtra, 'Extradeck'); trim('side', fmt.maxSide, 'Sidedeck'); trim('main', fmt.maxMain, 'Hauptdeck');
  if (opts.fill !== false) {
    let n = count(d.main);
    if (n < fmt.minMain) {
      const used = total(d); const pts = fmt.cap ? deckPoints(d, lists) : 0; let budget = fmt.cap ? fmt.cap - pts : Infinity;
      const cand = [...d.main].sort((a, b) => b[1] - a[1]);
      const added = new Map();
      for (let pass = 0; n < fmt.minMain && pass < 3; pass++) {
        for (const [c] of cand) {
          if (n >= fmt.minMain) break;
          const lim = allowed(c, fmt, lists); const pt = fmt.cap ? points(c, lists) : 0;
          if ((used.get(c) || 0) >= lim || pt > budget) continue;
          put(d.main, c, 1); used.set(c, (used.get(c) || 0) + 1); budget -= pt; n++; added.set(c, (added.get(c) || 0) + 1);
        }
      }
      if (added.size) log.push(`Auf ${fmt.minMain} Karten aufgefüllt: ${[...added].map(([c, k]) => `${k}× ${nm(c)}`).join(', ')}.`);
      if (n < fmt.minMain) log.push(`Hauptdeck hat nur ${n} Karten – bitte im Deckeditor ergänzen.`);
    }
  }
  return { deck: d, log };
}
