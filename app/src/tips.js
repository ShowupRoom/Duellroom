// Der Tutor im Duell: schlägt auf Grundlage der Deck-Analyse sinnvolle Aktionen vor
import { cardOf, nameOf, descOf } from './data.js';
import { h } from './util.js';
import { boardText } from './demo.js';
import { roleOf } from '../../src/tutor.mjs';
import { blockAdvice, summonAdvice } from '../../src/block.mjs';

export const first = (txt, n = 190) => { const t = (txt || '').replace(/\s+/g, ' ').trim(); const m = t.match(/^.*?[.。!](?=\s|$)/); let s = m ? m[0] : t; return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const inK = (arr, c) => (arr || []).includes(c);
const VERB = { summon: 'Beschwöre', special: 'Spezialbeschwöre', set: 'Setze', spellset: 'Setze', activate: 'Aktiviere', pos: 'Ändere die Position von' };

/** Vorschlag für die Hauptphase. acts: flache Liste {kind, code, key} */
export function idleTip(D, msg) {
  const me = msg.player; const T = D.deckOf(me).tutor || {}; const K = T.keys || {}; const L = D.actList; const snap = D.snap;
  const mk = (a, why) => ({ keys: [a.key], text: `${VERB[a.kind]} «${nameOf(a.code)}». ${why}` });
  const eff = (c) => first(descOf(cardOf(c)));
  let a = L.find((x) => ['activate', 'summon', 'special'].includes(x.kind) && inK(K.starters, x.code));
  if (a) return mk(a, `Das ist einer deiner Starter – er holt die nächsten Teile deiner Combo. ${eff(a.code)}`);
  a = L.find((x) => ['activate', 'summon', 'special'].includes(x.kind) && inK(K.extenders, x.code));
  if (a) return mk(a, `Er bringt weitere Monster ins Spiel. ${eff(a.code)}`);
  a = L.find((x) => x.kind === 'special' && inK(K.bosses, x.code));
  if (a) return mk(a, `Das ist eines deiner stärksten Monster – das Ziel deiner Combo.`);
  a = L.find((x) => x.kind === 'activate' && cardOf(x.code) && (cardOf(x.code).type & 2) && (roleOf(cardOf(x.code)) === 'draw' || roleOf(cardOf(x.code)) === 'starter'));
  if (a) return mk(a, eff(a.code));
  const oppMon = snap.players[1 - me].mzone.filter(Boolean).length;
  a = L.find((x) => x.kind === 'activate' && inK(K.removal, x.code));
  if (a && oppMon) return mk(a, `Damit räumst du Hindernisse des Gegners ab. ${eff(a.code)}`);
  const sums = L.filter((x) => x.kind === 'summon');
  if (sums.length) {
    const score = (x) => { const c = cardOf(x.code); return (c.level <= 4 ? 1000 : 0) + (c.attack || 0) + (inK(K.handtraps, x.code) ? -5000 : 0); };
    a = [...sums].sort((x, y) => score(y) - score(x))[0]; const c = cardOf(a.code);
    return { keys: [a.key], text: `Du hast diesen Zug noch keine Normalbeschwörung benutzt: «${nameOf(a.code)}» (ATK ${c.attack}) ist ${c.level <= 4 ? 'ohne Opfer' : 'mit Opfern'} spielbar.` };
  }
  a = L.find((x) => x.kind === 'spellset' && cardOf(x.code) && (cardOf(x.code).type & 4));
  if (a) return { keys: [a.key], text: `Setze die Falle «${nameOf(a.code)}» verdeckt – du kannst sie ab dem nächsten Zug (oder im Zug des Gegners) auslösen. ${eff(a.code)}` };
  if (msg.to_bp && snap.players[me].mzone.some((m) => m && (m.position & 1))) return { keys: [], text: 'Du hast ein Monster in Angriffsposition – gehe in die Kampfphase, um anzugreifen.', bp: true };
  return { keys: [], text: 'Hier gibt es nichts Sinnvolles mehr zu tun. Beende deinen Zug – setze vorher noch Fallen oder Monster, wenn du welche übrig hast.', ep: true };
}
export function battleTip(D, msg) {
  const me = msg.player; const snap = D.snap; const opp = snap.players[1 - me].mzone.filter(Boolean); const mine = snap.players[me].mzone;
  const stat = (c) => (c.position & 1 ? c.attack : c.defense);
  let best = null;
  for (const at of msg.attacks) {
    const c = mine[at.sequence]; if (!c) continue;
    const key = `${at.controller}:${at.location}:${at.sequence}`;
    if (at.can_direct && !opp.length) return { keys: [key], text: `Der Gegner hat kein Monster: «${nameOf(at.code)}» kann direkt angreifen und ${c.attack} Schaden machen.` };
    const safe = opp.filter((o) => (o.position & 8 || o.position & 2) ? false : c.attack > stat(o));
    if (safe.length && (!best || c.attack > best.atk)) best = { key, atk: c.attack, name: nameOf(at.code), tgt: nameOf(safe[0].code) };
  }
  if (best) return { keys: [best.key], text: `«${best.name}» (ATK ${best.atk}) ist stärker als «${best.tgt}» – ein sicherer Angriff.` };
  if (msg.attacks.some((a) => a.can_direct)) { const a = msg.attacks.find((x) => x.can_direct); return { keys: [`${a.controller}:${a.location}:${a.sequence}`], text: `«${nameOf(a.code)}» könnte direkt angreifen, aber der Gegner hat Monster. Greife nur an, wenn du sicher stärker bist.` }; }
  return { keys: [], text: 'Kein Angriff ist wirklich sicher. Verzichte lieber darauf: Ein schwächeres Monster würde zerstört werden.', ep: true };
}
export function chainTip(D, msg) {
  const me = msg.player; const opts = msg.selects.map((s, i) => ({ i, code: s.code, card: cardOf(s.code) }));
  const top = D.chain && D.chain.length ? D.chain[D.chain.length - 1] : null;
  if (top && top.p !== me) { const adv = blockAdvice(cardOf(top.code), opts, nameOf); if (adv) return { text: adv.text, keys: [], pick: adv.pick, level: adv.level }; }
  else if (!top && D.spCount && D.spCount[1 - me] > 0) { const adv = summonAdvice(D.spCount[1 - me], opts, nameOf); if (adv) return { text: adv.text, keys: [], pick: adv.pick, level: adv.level }; }
  const T = D.deckOf(msg.player).tutor || {}; const K = T.keys || {};
  const a = msg.selects.findIndex((s) => inK(K.handtraps, s.code) || inK(K.removal, s.code));
  if (a >= 0) { const s = msg.selects[a]; return { text: `«${nameOf(s.code)}» passt hier gut: ${first(descOf(cardOf(s.code)))}`, keys: [] }; }
  return { text: 'Du darfst antworten, musst aber nicht. Antworte nur, wenn dir die Aktion des Gegners schadet oder dein Effekt jetzt am besten wirkt.', keys: [] };
}
export function introText(deck) {
  const t = deck.tutor || {}; return { title: `Dein Ziel mit „${deck.name}“`, goal: t.goal, plan: t.plan || [] };
}

// ---- Tutor mit Hintergrund-Suche: dieselbe Suche und Bewertung wie in der Kombo-Ansicht, ab der aktuellen Spielsituation ----------------------
const STEP = { summon: 'Normalbeschwörung von', special: 'Spezialbeschwörung von', set: 'Setze', spellset: 'Setze', activate: 'Aktiviere', pos: 'Positionswechsel von' };
/** p = Zwischenstand/Ergebnis der Suche: { plan, planBoard|board, sims, score, base, final } */
export function searchTip(D, msg, p, goalName) {
  const plan = p.plan || []; if (!plan.length) return null;
  const f = plan[0]; const steps = plan.filter((x) => x.code).slice(0, 8); const board = p.planBoard || p.board;
  const keys = f.code ? [`${f.ctrl}:${f.loc}:${f.seq}`] : [];
  const eff = (f.kind === 'activate' && first(descOf(cardOf(f.code)))) || '';
  const head = f.kind === 'ep' ? 'Nach der Suche gibt es nichts Sinnvolles mehr zu spielen – beende deinen Zug (setze vorher, was noch liegt).'
    : f.kind === 'bp' ? 'Hier ist in der Hauptphase nichts Sinnvolles mehr zu tun – gehe in die Kampfphase.'
      : `${STEP[f.kind]} «${nameOf(f.code)}». ${eff}`;
  const info = { sims: p.sims || 0, score: Math.round(p.planScore ?? p.score ?? 0), base: Math.round(p.base || 0), live: !p.final, goal: goalName };
  const node = () => h('div', { class: 'tut-s' },
    h('p', { class: 'tut-g' }, head),
    steps.length > 1 ? h('div', null, h('div', { class: 'small muted' }, 'Danach (Plan der Suche):'), h('ol', { class: 'tut-p' }, steps.slice(1).map((x) => h('li', null, `${STEP[x.kind]} «${nameOf(x.code)}»`)))) : null,
    board ? h('p', { class: 'small' }, h('b', null, 'Endboard: '), boardText(board)) : null,
    h('p', { class: 'small muted' }, info.live ? `⏳ Die Suche läuft im Hintergrund weiter – ${info.sims} Varianten geprüft, der Vorschlag wird laufend besser.` : `✓ ${info.sims} Varianten geprüft · Wertung ${info.score} (Standard-KI: ${info.base}).`),
    h('p', { class: 'small muted' }, `Ziel „${info.goal}“ wie in der Kombo-Ansicht. Annahme: Der Gegner antwortet in deinem Zug auf nichts – unterbricht er dich, passt der Tutor den Plan neu an.`));
  return { keys, text: head, bp: f.kind === 'bp', ep: f.kind === 'ep', search: info, node, plan, board };
}
