// Handtraps: erkennen und nach Stärke einordnen (Stufen S bis C).
// Die Stufen sind eine Einschätzung für das moderne TCG/OCG (Advanced); in alten Formaten (Goat, Edison) gibt es nur wenige Handtraps.
const clean = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '').toLowerCase();

export const TIER_SCORE = { S: 100, A: 80, B: 60, C: 40 };
export const TIER_SHORT = { S: 'Pflicht', A: 'stark', B: 'situativ', C: 'Nische' };
export const TIER_TEXT = { S: 'Pflicht in fast jedem Deck', A: 'sehr stark', B: 'gut, aber situativ', C: 'nur in passenden Decks' };

// Name (englisch, klein) → [Stufe, kurze Erklärung – nur, wo sicher]
const LIST = {
  'ash blossom & joyous spring': ['S', 'Stoppt Karten, die suchen, aus dem Deck beschwören oder Karten aus dem Deck ins Grab schicken – trifft die meisten Starter.'],
  'maxx "c"': ['S', 'Du ziehst für jede Spezialbeschwörung des Gegners eine Karte – bestraft lange Kombos.'],
  'nibiru, the primal being': ['S', 'Antwort auf lange Beschwörungs-Kombos: Nach vielen Beschwörungen in einem Zug kannst du sie spielen.'],
  'effect veiler': ['A', 'Negiert den Effekt eines offenen Monsters des Gegners bis zum Zugende.'],
  'ghost ogre & snow rabbit': ['A', 'Zerstört die Karte, die ihren Effekt auf dem Spielfeld aktiviert.'],
  'ghost belle & haunted mansion': ['A', 'Stoppt Effekte aus dem Friedhof und verbannt die Karte.'],
  'ghost mourner & moonlit chill': ['A', ''],
  'droll & lock bird': ['A', 'Stoppt Suchkarten: Danach kann der Gegner in diesem Zug nichts mehr aus dem Deck auf die Hand nehmen.'],
  'mulcharmy fuwalos': ['A', ''],
  'mulcharmy purulia': ['A', ''],
  'mulcharmy meowls': ['A', ''],
  'ghost sister & spooky dogwood': ['B', ''],
  'retaliating "c"': ['B', ''],
  'flying "c"': ['C', ''],
  'd.d. crow': ['B', 'Verbannt eine Karte aus dem gegnerischen Friedhof – stoppt Wiederbelebung und Friedhof-Effekte.'],
  'kuriboh': ['B', 'Verhindert den Schaden eines Angriffs (auch in alten Formaten wie Goat und Edison spielbar).'],
  'artifact lancea': ['B', ''],
  'bystial magnamhut': ['B', 'Nur in LICHT-/FINSTERNIS-Decks sinnvoll.'],
  'bystial saronir': ['B', 'Nur in LICHT-/FINSTERNIS-Decks sinnvoll.'],
  'bystial dis pater': ['B', 'Nur in LICHT-/FINSTERNIS-Decks sinnvoll.'],
  'bystial druiswurm': ['B', 'Nur in LICHT-/FINSTERNIS-Decks sinnvoll.'],
  'bystial baldrake': ['B', 'Nur in LICHT-/FINSTERNIS-Decks sinnvoll.'],
  'honest': ['B', 'Gibt einem LICHT-Monster im Kampf die ATK des gegnerischen Monsters dazu (Handtrap im Kampf).'],
  'ghost reaper & winter cherries': ['A', 'Stoppt Effekte, die Monster aus dem Friedhof zurückholen oder verbannen, und gibt dem Gegner dafür Schaden.'],
  'psy-framegear gamma': ['A', 'Negiert einen Effekt des Gegners, der im Friedhof oder in der Hand angestoßen wird.'],
  'gamma, the magnet warrior': ['C', ''],
  'dimension shifter': ['B', 'Verbannt statt Friedhof: Karten des Gegners landen bis zu seinem nächsten Zug im Aus – stoppt Friedhof-Kombos.'],
  'fantastical dragon phantazmay': ['C', ''],
  'skull meister': ['B', 'Stoppt Friedhof-Effekte des Gegners.'],
  // Fallen und Schnellzauber, die auch aus der Hand wirken können (oder gesetzt als Störer dienen)
  'infinite impermanence': ['A', 'Falle: macht einen offenen Monstereffekt des Gegners wirkungslos. Gesetzt (in deinem Zug) wirkt sie im Zug des Gegners, aus der Hand nur, wenn du keine Karten kontrollierst.'],
  'dominus impulse': ['B', 'Falle: stoppt einen Effekt, der Monster spezialbeschwört. Kann aus der Hand gespielt werden, wenn der Gegner eine Karte kontrolliert (dann sind deine LICHT-, ERDE- und WIND-Effekte für den Rest des Duells gesperrt).'],
  'dominus purge': ['B', 'Falle: stoppt einen Effekt, der Karten aus dem Deck auf die Hand nimmt. Kann aus der Hand gespielt werden, wenn der Gegner eine Karte kontrolliert (dann sind deine FINSTERNIS-, WASSER- und FEUER-Effekte für den Rest des Duells gesperrt).'],
  'evenly matched': ['B', 'Falle: Der Gegner muss Karten verbannen, bis er nicht mehr Karten hat als du. Aus der Hand spielbar, wenn du keine Karten kontrollierst – stark im zweiten Zug.'],
};

// Erkennung für alle übrigen Karten: Monster, das im Zug des Gegners aus der Hand wirkt (Schnelleffekt)
const HAND_COST = /(?:discard|send) this card from your hand|discard this card|reveal this card in your hand|this card in your hand\b/i;
const QUICK = /\(Quick Effect\)|\bQuick Effect\b|During the (?:Battle Phase|Damage Step|damage calculation)|During damage calculation|When (?:an opponent|your opponent)|If (?:an opponent|your opponent)/i;

const HAND_ST = /you can activate this card from your hand|can be activated from your hand/i;
function looksLikeHandtrap(c) {
  if ((c.type & 6) && !(c.type & 1)) return !!(c.type & 4 || c.type & 0x10000) && HAND_ST.test(c.desc || ''); // Falle/Schnellzauber, der aus der Hand gespielt werden darf
  if (!(c.type & 1) || !(c.type & 0x20)) return false; // nur Effektmonster
  if (c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000)) return false; // Extradeck-Monster haben keine Hand
  const d = (c.desc || '').replace(/\r/g, ' ');
  const sents = d.split(/[.;]\s+/);
  return sents.some((s) => { const i = s.indexOf(':'); if (i < 0) return false; const head = s.slice(0, i), tail = s.slice(i); return QUICK.test(head) && HAND_COST.test(tail.slice(0, 120)); });
}

/** { tier, score, note, curated } oder null, wenn die Karte keine Handtrap ist */
// In alten Formaten (Goat, Edison) sind Kuriboh und Honest die wichtigsten Handtraps
const OLD = { kuriboh: 'A', honest: 'A' };
const OLD_FMT = new Set(['goat', 'edison']);
export function handtrapInfo(c, fmtId) {
  if (!c) return null; const n = clean(c.name); const e = LIST[n];
  if (e) { const t = OLD_FMT.has(fmtId) && OLD[n] ? OLD[n] : e[0]; return { tier: t, score: TIER_SCORE[t], note: e[1], curated: true }; }
  if (!looksLikeHandtrap(c)) return null;
  const d = (c.desc || '');
  const score = 30 + (/negate/i.test(d) ? 8 : 0) + (/destroy|banish/i.test(d) ? 4 : 0);
  return { tier: 'C', score, note: '', curated: false };
}
/** Namen (klein) der fest eingestuften Handtraps – Grundlage für Rollen (Tutor) und Kombo-Suche */
export const CURATED = new Set(Object.keys(LIST));
export const isHandtrap = (c, fmtId) => !!handtrapInfo(c, fmtId);
