// Störkarten: Was zählt als Unterbrechung für den Gegner – auf dem Feld (Monster, gesetzte Fallen/Schnellzauber) und auf der Hand (Handtraps,
// Fallen, die aus der Hand gespielt werden dürfen)? Feste Tabelle für die wichtigen Karten, Textregeln für alle anderen.
// Wird von der Kombo-Suche (Bewertung des Endboards) und der Deck-Analyse benutzt.
const T = { MONSTER: 1, SPELL: 2, TRAP: 4, QUICKPLAY: 0x10000, CONT: 0x20000, FIELD: 0x80000, NORMAL: 0x10 };
const clean = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '').toLowerCase();

const NEG = /negate (the |that |its |this )?(activation|activated|effects?|Summon|Special Summon)/i;
const REM = /(destroy|banish|return|shuffle|send|take control|change)[^.;]{0,90}(opponent|monster|card|face-up)/i;
const QUICK = /\(Quick Effect\)/i;
const FLOOD = /(opponent|neither player)[^.;]{0,50}(cannot|can't)|cannot be (targeted|destroyed|Special Summoned)|unaffected by/i;
const HANDEFF = /discard this card|send this card from your hand|reveal this card in your hand|if this card is in your hand|you can send this card from your hand/i;

/** Punkte, wenn die Karte als Handtrap-MONSTER am Zugende noch auf der Hand liegt (englischer Name, klein) */
export const HAND_MON = {
  'ash blossom & joyous spring': 36, 'maxx "c"': 34, 'nibiru, the primal being': 34, 'effect veiler': 30, 'droll & lock bird': 28,
  'ghost ogre & snow rabbit': 32, 'ghost belle & haunted mansion': 28, 'ghost mourner & moonlit chill': 28, 'ghost sister & spooky dogwood': 22, 'ghost reaper & winter cherries': 28,
  'mulcharmy fuwalos': 24, 'mulcharmy purulia': 24, 'mulcharmy meowls': 24, 'retaliating "c"': 20, 'flying "c"': 14, 'd.d. crow': 20, 'artifact lancea': 22,
  'psy-framegear gamma': 28, 'gamma, the magnet warrior': 16, 'dimension shifter': 18, 'fantastical dragon phantazmay': 18, 'skull meister': 20,
};
/** Fallen, die auch aus der Hand wirken dürfen (Punkte auf der Hand – gesetzt zählen sie als Feldkarte, das ist besser) */
export const HAND_ST = { 'infinite impermanence': 16, 'dominus impulse': 14, 'dominus purge': 14, 'evenly matched': 12 };
/** Feste Feldwerte, wo der Kartentext allein falsch einschätzt (gesetzte Fallen/Schnellzauber, Dauerfallen) */
export const FIELD_PTS = {
  'infinite impermanence': 40, 'dominus impulse': 34, 'dominus purge': 34, 'evenly matched': 26, 'solemn strike': 40, 'solemn warning': 38, 'solemn judgment': 40,
  'called by the grave': 22, 'crossout designator': 18, 'forbidden droplet': 36, 'torrential tribute': 30, 'mirror force': 30, 'bottomless trap hole': 24,
  'dark bribe': 34, 'magic jammer': 36, 'seven tools of the bandit': 38, 'divine wrath': 38, 'vanity\'s emptiness': 34, 'skill drain': 30, 'imperial iron wall': 24,
  'compulsory evacuation device': 26, 'dimensional prison': 28, 'trap stun': 26, 'wiretap': 34, 'anti-spell fragrance': 20,
};

const memo = new Map(), memoH = new Map(), memoP = new Map(), memoA = new Map();
/** Karte, deren Störeffekt nur aus der Hand wirkt (auf dem Feld nutzlos) */
export function isHandOnly(code, cards) {
  if (memoH.has(code)) return memoH.get(code);
  const c = cards.get(code); const n = c ? clean(c.name) : '';
  const v = !!c && (c.type & T.MONSTER) && (HANDEFF.test(c.desc || '') || n in HAND_MON);
  memoH.set(code, v); return v;
}
/** Wie viele Punkte Störung (Negation, Entfernung, Sperre) diese Karte auf dem Feld darstellt */
export function interruptPts(code, cards) {
  if (memo.has(code)) return memo.get(code);
  const c = cards.get(code); let v = 0;
  if (c) {
    const d = c.desc || '', t = c.type, n = clean(c.name);
    if (n in FIELD_PTS && !(t & T.MONSTER)) v = FIELD_PTS[n];
    else if (t & T.TRAP) v = NEG.test(d) ? 40 : REM.test(d) ? 28 : FLOOD.test(d) ? 12 : 8;
    else if (t & T.SPELL) v = (t & T.QUICKPLAY) ? (NEG.test(d) ? 36 : REM.test(d) ? 22 : 4) : (t & (T.CONT | T.FIELD)) && FLOOD.test(d) ? 12 : 0;
    else if (isHandOnly(code, cards)) v = 0; // Wirkt nur aus der Hand, nicht vom Feld
    else if (QUICK.test(d)) v = NEG.test(d) ? 40 : REM.test(d) ? 28 : 6;
    else if (FLOOD.test(d)) v = 8;
  }
  memo.set(code, v); return v;
}
/** Punkte, wenn die Karte am Zugende noch auf der Hand liegt und dort stört (Handtrap-Monster, Fallen mit Handaktivierung) */
export function handPts(code, cards) {
  if (memoP.has(code)) return memoP.get(code);
  const c = cards.get(code); const n = c ? clean(c.name) : ''; const v = !c ? 0 : (c.type & T.MONSTER) ? (HAND_MON[n] || 0) : (HAND_ST[n] || 0);
  memoP.set(code, v); return v;
}
/** Karte, die dem Spieler Vorteil bringt (suchen, ziehen, zurückholen, beschwören) – sie soll gespielt werden, nicht auf der Hand versauern */
const ADV = /\badd\b[^.;]{0,90}\bto your hand|\bSpecial Summon\b[^.;]{0,90}\bfrom (your|the) (Deck|GY|hand)|\bdraw \d+ cards?|\bdraw 1 card|\bplace\b[^.;]{0,60}\bface-up in your (Spell|Pendulum)|\bSet\b[^.;]{0,60}\bfrom your (Deck|GY)|\bactivate\b[^.;]{0,40}\bfrom your (Deck|GY)/i;
export function isAdvantage(code, cards) {
  if (memoA.has(code)) return memoA.get(code);
  const c = cards.get(code); const v = !!c && !isHandOnly(code, cards) && ADV.test(c.desc || '');
  memoA.set(code, v); return v;
}
