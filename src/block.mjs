// Blockieren statt mitspielen: Wann lohnt es sich, einen Effekt des Gegners mit einer Handtrap oder Negation zu stoppen?
// Gerechnet wird mit den englischen Kartentexten (wie der übrige Tutor); die Texte für den Spieler sind deutsch.
import { roleOf, HANDTRAPS } from './tutor.mjs';

const lc = (s) => (s || '').toLowerCase().replace(/\s*\((goat|pre-errata)\)$/, '');
/** Effekte, die aus dem Deck suchen / beschwören / auf den Friedhof schicken (genau das stoppt „Ash Blossom“) */
const FROM_DECK = /\badd\b[^.;]{0,90}\bfrom (?:your )?Deck\b[^.;]{0,40}\bto (?:your )?hand|\bSpecial Summon\b[^.;]{0,100}\bfrom (?:your )?Deck|\bsend\b[^.;]{0,60}\bfrom (?:your )?Deck\b[^.;]{0,20}\bto the (?:GY|Graveyard)|\btake\b[^.;]{0,80}\bfrom (?:your )?Deck\b|\busing\b[^.;]{0,100}\bDeck\b[^.;]{0,30}\bas (?:Fusion |Synchro )?Material/i;
const SEARCH_ONLY = /\badd\b[^.;]{0,90}\bfrom (?:your )?Deck\b[^.;]{0,40}\bto (?:your )?hand/i;
const NEGATES = /negate (?:the activation|its effects?|that effect|the effect|the activation and|its activation)|negate the activation/i;
const SPSUM = /\bSpecial Summon/i;
const HOPT = /once per turn|you can only use (?:this|each) effect of "[^"]+" once per turn|once while face-up/i;

/** Was kann diese Karte im Zug des Gegners „blockieren“? (nur Karten, bei denen wir den Effekt sicher kennen) */
export const KNOWN = {
  'ash blossom & joyous spring': { when: 'Gegen Effekte, die etwas aus dem Deck suchen, von dort beschwören oder auf den Friedhof schicken. Am besten gegen seinen ersten Starter.', fit: (l) => FROM_DECK.test(l.desc || ''), why: 'negiert genau solche Effekte (Suchen, Beschwören oder Schicken aus dem Deck)' },
  'droll & lock bird': { when: 'Sobald der Gegner eine Karte aus dem Deck auf die Hand nimmt (nicht ziehen): Danach darf in diesem Zug keiner mehr suchen. Der laufende Sucheffekt wird nicht gestoppt.', fit: (l) => SEARCH_ONLY.test(l.desc || ''), why: 'verhindert, dass er in diesem Zug noch einmal sucht (der laufende Sucheffekt geht aber durch)' },
  'effect veiler': { when: 'Nur in der Main Phase des Gegners: negiert die Effekte eines Monsters, das offen auf dem Feld liegt (nicht als Antwort auf eine Kette).', fit: (l) => !!(l.type & 1), why: 'negiert die Effekte dieses Monsters' },
  'maxx "c"': { when: 'Wenn der Gegner Monster spezialbeschwört: Für jede weitere Beschwörung in diesem Zug ziehst du eine Karte. Früh einsetzen, bevor seine Combo läuft.', fit: null },
  'nibiru, the primal being': { when: 'Wenn der Gegner in diesem Zug 5 oder mehr Monster beschworen hat: Du opferst ein Monster, zerstörst sein Feld und bekommst einen starken Token.', fit: null },
  'infinite impermanence': { when: 'Gegen ein offenes Monster auf dem Feld: negiert dessen Effekte (auch die Aktivierung eines Effekts). Verdeckt setzen; die Zone, in der sie liegt, ist für ihn gesperrt.', fit: (l) => !!(l.type & 1), why: 'negiert die Effekte dieses Monsters' },
  'called by the grave': { when: 'Verbannt ein Monster aus seinem Friedhof und negiert dessen Effekte (und gleichnamige) in diesem Zug – gut gegen Effekte, die er vom Friedhof nutzen will.', fit: null },
};

const valueOf = (c) => {
  const d = c.desc || ''; const r = roleOf(c);
  const why = [];
  if (FROM_DECK.test(d)) why.push('sucht oder beschwört aus dem Deck');
  if (r === 'starter') why.push('ist ein Starter');
  else if (r === 'extender') why.push('bringt weitere Monster ins Spiel');
  else if (r === 'draw') why.push('verschafft ihm Karten');
  if ((c.type & 1) && SPSUM.test(d) && !why.length) why.push('beschwört weitere Monster');
  const key = r === 'starter' || r === 'extender' || FROM_DECK.test(d);
  return { role: r, key, why: why.join(' und '), once: HOPT.test(d) };
};

/**
 * Soll ich diese Kette blockieren? link = Karte des Gegners (Kettenglied), opts = meine Antwortmöglichkeiten [{ i, code, card }]
 * Ergebnis: { text, pick } oder null, wenn ich nichts zum Blockieren habe.
 */
export function blockAdvice(link, opts, nameOf) {
  if (!link || !opts.length) return null;
  const v = valueOf(link); const ln = nameOf(link.code);
  const cands = [];
  for (const o of opts) {
    const c = o.card; if (!c) continue; const n = lc(c.name); const k = KNOWN[n];
    let fit = 0, how = '';
    if (k) { if (k.fit && k.fit(link)) { fit = 3; how = k.why; } }
    else if (NEGATES.test(c.desc || '')) { fit = 2; how = 'negiert die Aktivierung oder den Effekt'; }
    else if (HANDTRAPS.has(n)) { fit = 1; how = ''; }
    if (fit) cands.push({ ...o, fit, how, n });
  }
  if (!cands.length) return null;
  const PRI = { 'ash blossom & joyous spring': 3, 'infinite impermanence': 2, 'effect veiler': 1 }; // bei gleichem Wert zuerst die Karte, die den Effekt wirklich stoppt
  cands.sort((a, b) => b.fit - a.fit || (PRI[b.n] || 0) - (PRI[a.n] || 0)); const b = cands[0]; const bn = nameOf(b.code);
  if (v.key && b.fit >= 2) {
    return { pick: b.i, level: 'block', text: `🛑 Block-Chance: «${ln}» ${v.why ? v.why + ' –' : 'ist ein wichtiger Schritt seiner Combo –'} ${b.fit === 3 ? `«${bn}» ${b.how}` : `mit «${bn}» stoppst du das`}. Wird dieser Schritt blockiert, fallen alle Kettenglieder weg, die darauf aufbauen – das erspart dir meist den größten Teil seiner Kombo.${v.once ? ' Und seinen „Einmal pro Zug“-Effekt hat er damit schon verbraucht.' : ''}` };
  }
  if (b.fit >= 2) {
    return { pick: -1, level: 'wait', text: `«${ln}» ist kein entscheidender Schritt (${v.role === 'boss' ? 'ein großes Monster, aber der Effekt allein ist selten die Combo' : 'eher Beiwerk'}). Spar dir «${bn}» für seinen Starter oder Sucheffekt – wenn dieser Schritt blockiert wird, bricht viel mehr weg.` };
  }
  return { pick: -1, level: 'maybe', text: `Du könntest «${bn}» einsetzen, aber «${ln}» ist kein klarer Starter. Warte lieber auf einen Effekt, der etwas aus dem Deck holt oder Monster beschwört.` };
}

/** Hinweis bei Beschwörungen des Gegners (Maxx „C“ / Nibiru) – kein Kettenglied, aber ein Fenster zum Blockieren */
export function summonAdvice(spCount, opts, nameOf) {
  for (const o of opts) {
    const n = lc(o.card?.name);
    if (n === 'maxx "c"' && spCount >= 1) return { pick: o.i, level: 'block', text: `🛑 Der Gegner beschwört Monster (bisher ${spCount} Spezialbeschwörung${spCount === 1 ? '' : 'en'}): «${nameOf(o.code)}» jetzt aktivieren – du ziehst dann für jede weitere Beschwörung in diesem Zug eine Karte. Je früher, desto mehr.` };
    if (n === 'nibiru, the primal being' && spCount >= 5) return { pick: o.i, level: 'block', text: `🛑 Er hat schon ${spCount} Monster beschworen: «${nameOf(o.code)}» zerstört jetzt sein Feld und gibt ihm einen schwachen Token – ein starker Gegenschlag.` };
  }
  return null;
}

/** Karten im Deck, die blockieren können, mit Einsatzhinweis (Deck-Ansicht) */
export function handtrapPlan(codes, cards) {
  const out = [];
  for (const code of codes) {
    const c = cards.get(code); if (!c) continue; const k = KNOWN[lc(c.name)];
    if (k) out.push({ code, when: k.when });
  }
  return out;
}
