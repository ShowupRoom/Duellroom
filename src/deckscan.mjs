// Deck-Analyse für den Kombo-Modus: Sie liest die Deckliste (Haupt- und Extradeck) und ordnet jede Karte ein –
// Starter/Verlängerer/Bosse, Handtraps, Fallen und Schnellzauber als Störer, Karten ohne „einmal pro Zug“ (die man mehrfach nutzen kann)
// und Vorteilskarten (suchen, ziehen, zurückholen). Die Kombo-Suche bewertet danach; der Überblick wird am Anfang angezeigt.
import { roleOf } from './tutor.mjs';
import { interruptPts, handPts, isAdvantage } from './interrupts.mjs';
import { tryCap } from './ai.mjs';

const T = { MONSTER: 1, SPELL: 2, TRAP: 4, CONT: 0x20000, FIELD: 0x80000, NORMAL: 0x10 };
const EXTRA_T = 0x40 | 0x2000 | 0x800000 | 0x4000000; // Fusion, Synchro, Xyz, Link

/** deck = { main: [[code, Anzahl], …], extra: […] } – auch die Vorlagen-Form [x, Anzahl, code] wird gelesen */
const norm = (l) => (l || []).map((e) => (e.length > 2 ? [e[e.length - 1], e[1]] : [e[0], e[1]]));
export function scanDeck(deck, cards) {
  const out = { size: 0, extra: 0, roles: {}, hand: [], setInt: [], multi: [], adv: [], links: [] };
  const add = (list, code, n, extra) => { const e = list.find((x) => x.code === code); if (e) e.n += n; else list.push({ code, n, ...extra }); };
  for (const [code, n] of norm(deck.main)) {
    const c = cards.get(code); if (!c) continue; out.size += n;
    const role = roleOf(c); out.roles[role] = (out.roles[role] || 0) + n;
    const hp = handPts(code, cards), ip = interruptPts(code, cards);
    if (hp && (c.type & T.MONSTER)) add(out.hand, code, n, { pts: hp });
    else if ((c.type & (T.SPELL | T.TRAP)) && (ip >= 20 || hp)) add(out.setInt, code, n, { pts: Math.max(ip, hp) });
    if (isAdvantage(code, cards)) add(out.adv, code, n);
    const d = c.desc || ''; if (!hp && (c.type & (T.MONSTER | T.CONT | T.FIELD)) && /:|\(Quick Effect\)/.test(d) && tryCap(c) > 1 && !(c.type & T.NORMAL && !(c.type & 0x20))) add(out.multi, code, n, { cap: tryCap(c) });
  }
  for (const [code, n] of norm(deck.extra)) { const c = cards.get(code); if (!c) continue; out.extra += n; if (c.type & 0x4000000) add(out.links, code, n); }
  out.hand.sort((a, b) => b.pts - a.pts); out.setInt.sort((a, b) => b.pts - a.pts);
  return out;
}

/** Kurze deutsche Zeilen für das Such-Fenster (nameOf: Code → Name) */
export function scanLines(s, nameOf) {
  const nm = (l, k = 4) => l.slice(0, k).map((x) => `${nameOf(x.code)}${x.n > 1 ? ' ×' + x.n : ''}`).join(', ') + (l.length > k ? ` + ${l.length - k} weitere` : '');
  const R = s.roles; const st = (R.starter || 0), ex = (R.extender || 0);
  const lines = [`Deck: ${s.size} Karten (+${s.extra} Extradeck) · ${st} Starter, ${ex} Verlängerer, ${R.removal || 0} Entferner, ${(R.handtrap || 0)} Störer`];
  if (s.hand.length) lines.push('Handtraps (bleiben auf der Hand, stören im Zug des Gegners): ' + nm(s.hand));
  if (s.setInt.length) lines.push('Fallen/Schnellzauber als Störer (werden gesetzt): ' + nm(s.setInt));
  if (s.multi.length) lines.push('Ohne „einmal pro Zug“ (die Suche nutzt sie mehrfach): ' + nm(s.multi));
  if (s.adv.length) lines.push(`${s.adv.reduce((n, x) => n + x.n, 0)} Karten bringen Vorteil (suchen, ziehen, zurückholen) – sie sollen immer gespielt werden`);
  return lines;
}
