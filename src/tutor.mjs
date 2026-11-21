// „KI-Tutor“ (offline): erkennt die Rolle jeder Karte im Deck und erklärt das Ziel in einfachen Worten.
import { isExtra, T } from './decks.mjs';
import { engineReport, goalText } from './goals.mjs';

const lc = (s) => s.toLowerCase();
const HANDTRAPS = new Set(['ash blossom & joyous spring', 'maxx "c"', 'nibiru, the primal being', 'effect veiler', 'droll & lock bird', 'ghost ogre & snow rabbit', 'ghost belle & haunted mansion', 'ghost mourner & moonlit chill', 'ghost sister & spooky dogwood', 'mulcharmy fuwalos', 'mulcharmy meowls', 'mulcharmy purulia', 'infinite impermanence', 'called by the grave', 'crossout designator', 'forbidden droplet', 'd.d. crow', 'retaliating "c"', 'flying "c"', 'kuriboh', 'winged kuriboh', 'winged kuriboh lv10', 'gorgonic guardian', 'artifact lancea', 'bystial magnamhut', 'bystial saronir', 'bystial dis pater', 'bystial druiswurm', 'bystial baldrake', 'evenly matched', 'solemn strike', 'solemn warning', 'solemn judgment', 'ghost belle & haunted mansion']);
const REMOVAL = new Set(['raigeki', 'dark hole', 'mirror force', 'torrential tribute', 'heavy storm', 'mystical space typhoon', "harpie's feather duster", 'lightning vortex', 'smashing ground', 'bottomless trap hole', 'ring of destruction', 'nobleman of crossout', 'nobleman of extermination', 'book of moon', 'compulsory evacuation device', 'sakuretsu armor', 'magic cylinder', 'dimensional prison', 'chain destruction', 'fissure', 'trap hole', 'twin twisters', 'cosmic cyclone', 'harpie’s feather duster', 'giant trunade', 'cold wave', 'dust tornado', 'smashing ground', 'change of heart', 'brain control', 'snatch steal', 'mind control', 'confiscation', 'delinquent duo', 'creature swap', 'monster gate', 'dark world lightning', 'dian keto the cure master']);
const DRAW = new Set(['pot of greed', 'graceful charity', 'upstart goblin', 'pot of prosperity', 'pot of desires', 'pot of extravagance', 'card destruction', 'allure of darkness', 'destiny draw', 'reinforcement of the army', 'pot of duality', 'foolish burial', 'terraforming', 'monster reborn', 'premature burial', 'called by the grave']);
const SEARCH = /\badd\b[^.;]{0,90}\bfrom your (Deck|GY|Graveyard)\b[^.;]{0,40}\bto your hand|\bSpecial Summon\b[^.;]{0,80}\bfrom your Deck|\bsend\b[^.;]{0,60}\bfrom your Deck\b[^.;]{0,20}\bto the (GY|Graveyard)|\bDeck\b[^.;]{0,30}\bto your hand/i;
const BURN = /inflict\b[^.;]{0,60}\bdamage|damage to your opponent/i;
const STUN = /negate|cannot (attack|be Special Summoned|Special Summon|activate)|Skill Drain|can't (attack|be Special Summoned)/i;

export const ROLE_DE = { starter: 'Starter', extender: 'Verlängerer', boss: 'Boss', handtrap: 'Handtrap', removal: 'Entferner', draw: 'Hilfe', material: 'Material', trap: 'Falle', other: '' };

export function roleOf(c) {
  if (!c) return 'other';
  const n = lc(c.name).replace(/\s*\((goat|pre-errata)\)$/, ''); const d = c.desc || '';
  if (isExtra(c)) return 'boss';
  if (HANDTRAPS.has(n)) return 'handtrap';
  if (c.type & (T.SPELL | T.TRAP)) {
    if (DRAW.has(n)) return 'draw';
    if (REMOVAL.has(n)) return 'removal';
    if (SEARCH.test(d) && (c.type & T.SPELL)) return 'starter';
    if (/destroy|banish|return[^.;]{0,40}to the hand|negate/i.test(d)) return 'removal';
    if (/draw \d+ cards?|draw 1 card|draw cards/i.test(d) && (c.type & T.SPELL)) return 'draw';
    if (/Special Summon/i.test(d)) return (c.type & T.TRAP) ? 'trap' : 'extender';
    return (c.type & T.TRAP) ? 'trap' : 'other';
  }
  if (c.type & T.MONSTER) {
    if (c.level >= 7 || (c.attack >= 2400 && c.level >= 6)) return 'boss';
    if (SEARCH.test(d) && !(c.type & T.NORMAL)) return 'starter';
    if (/Special Summon this card|you can Special Summon this card/i.test(d)) return 'extender';
    return 'material';
  }
  return 'other';
}

const names = (codes, cards, k = 3) => codes.slice(0, k).map((c) => cards.get(c)?.name.replace(/\s*\((GOAT|Pre-Errata)\)$/i, '')).filter(Boolean);
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]);

/** Deck analysieren: Rollen + Stil + automatischer Text (handgeschriebene Texte überschreiben `goal`/`plan`) */
export function analyze(deck, cards, setnames) {
  const all = [...deck.main, ...deck.extra].map(([c, n]) => ({ code: c, n, card: cards.get(c) })).filter((x) => x.card);
  const roles = {}; for (const x of all) roles[x.code] = roleOf(x.card);
  const by = (r, extraOnly) => all.filter((x) => roles[x.code] === r && (extraOnly === undefined || isExtra(x.card) === extraOnly)).sort((a, b) => b.n - a.n || (b.card.attack || 0) - (a.card.attack || 0)).map((x) => x.code);
  const starters = by('starter'), extenders = by('extender'), handtraps = by('handtrap'), removal = by('removal'), draw = by('draw');
  const extraBosses = by('boss', true).sort((a, b) => (cards.get(b).attack || 0) - (cards.get(a).attack || 0));
  const mainBosses = by('boss', false).sort((a, b) => (cards.get(b).attack || 0) - (cards.get(a).attack || 0));
  const typeN = (m) => deck.extra.reduce((s, [c, n]) => s + ((cards.get(c)?.type & m) ? n : 0), 0);
  const ex = { fusion: typeN(T.FUSION), synchro: typeN(T.SYNCHRO), xyz: typeN(T.XYZ), link: typeN(T.LINK) };
  const nExtra = deck.extra.reduce((s, [, n]) => s + n, 0);
  const ritual = deck.main.reduce((s, [c, n]) => s + ((cards.get(c)?.type & T.RITUAL) ? n : 0), 0);
  const nm = (c) => cards.get(c)?.name?.toLowerCase() || '';
  const exo = ['exodia the forbidden one', 'left leg of the forbidden one', 'right leg of the forbidden one', 'left arm of the forbidden one', 'right arm of the forbidden one'].filter((x) => deck.main.some(([c]) => nm(c) === x)).length;
  const cnt = (re, types) => deck.main.reduce((s, [c, n]) => { const cd = cards.get(c); return s + (cd && (cd.type & types) && re.test(cd.desc || '') ? n : 0); }, 0);
  const burn = cnt(BURN, T.SPELL | T.TRAP), stun = cnt(STUN, T.SPELL | T.TRAP);
  let style = 'Beatdown';
  if (exo >= 4) style = 'Exodia';
  else if (burn >= 6) style = 'Burn';
  else if (nExtra >= 5 && Math.max(...Object.values(ex)) >= 3) { const k = Object.entries(ex).sort((a, b) => b[1] - a[1])[0][0]; style = { fusion: 'Fusion-Combo', synchro: 'Synchro-Combo', xyz: 'Xyz-Combo', link: 'Link-Combo' }[k]; }
  else if (ritual >= 4) style = 'Ritual';
  else if (stun >= 7) style = 'Stun / Control';
  else if (removal.length >= 8) style = 'Control';
  const bosses = (extraBosses.length ? extraBosses : mainBosses);
  const S = names(starters.length ? starters : extenders, cards, 2), B = names(bosses, cards, 2), H = names(handtraps, cards, 2), R = names(removal, cards, 2), E = names(extenders, cards, 2);
  let goal, plan = [];
  const hs = H.length ? ` Halte ${list(H)} als Schutz auf der Hand, um den Zug des Gegners zu stören.` : '';
  switch (style) {
    case 'Exodia': goal = `Dein Ziel: Alle fünf Exodia-Teile gleichzeitig auf die Hand bekommen – dann gewinnst du sofort. Alles andere im Deck hilft nur dabei, schnell Karten zu ziehen und zu suchen, und dich so lange zu schützen.`; plan = ['Ziehe und suche so viele Karten wie möglich (z. B. mit ' + list(names(draw.concat(starters), cards, 3)) + ').', 'Zähle mit: Wie viele der 5 Teile hast du schon? Wirf überflüssige Karten ab, um tiefer zu graben.', 'Sobald alle 5 Teile auf der Hand sind, endet das Duell sofort.', 'Der Gegner muss dich bremsen – bleibe am Leben, bis es klappt.']; break;
    case 'Burn': goal = `Dein Ziel: Den Gegner durch Effektschaden besiegen, statt Monster anzugreifen. Bremse seine Angriffe aus und lasse die Lebenspunkte durch Karteneffekte auf 0 fallen.`; plan = ['Halte den Gegner mit Verteidigern und Sperrkarten auf Abstand.', 'Spiele Schadens-Karten, die dem Gegner direkt Lebenspunkte abziehen.', 'Behalte seine Lebenspunkte im Blick – 8000 sind das Ziel.', `Schütze dich mit ${list(names(removal.concat(handtraps), cards, 2)) || 'Fallen'}.`]; break;
    case 'Stun / Control': goal = `Dein Ziel: Den Gegner mit Sperr- und Negations-Karten zum Stillstand bringen und dann mit wenigen, sicheren Angriffen gewinnen. Du gewinnst durch Kontrolle, nicht durch Tempo.`; plan = [`Setze Fallen und Dauerzauber verdeckt (${list(names(removal, cards, 3))}).`, 'Lass den Gegner zuerst handeln und antworte mit deinen Effekten.', 'Baue ein Monster als Mauer auf und räume mit Effekten auf.', 'Greife erst an, wenn der Gegner keine Antwort mehr hat.']; break;
    case 'Beatdown': case 'Control': goal = `Dein Ziel: Starke Monster (${list(B) || 'deine größten Monster'}) aufs Feld bringen und damit Druck machen.${R.length ? ` Entferne Hindernisse mit ${list(R)}.` : ''} Wer zuerst keine Antwort mehr hat, verliert.${hs}`; plan = ['Beschwöre ein Monster pro Zug (Normalbeschwörung) – starke Monster brauchen Opfer (Tribute).', R.length ? `Räume die Karten des Gegners mit ${list(R)} ab, bevor du angreifst.` : 'Räume zuerst die Verteidiger des Gegners ab, bevor du angreifst.', 'Setze Fallen verdeckt, damit du auf Angriffe antworten kannst.', 'Greife an, wenn dein Monster stärker ist – oder wenn der Gegner keine Monster hat.']; break;
    case 'Ritual': { const rs = names(all.filter((x) => (x.card.type & T.RITUAL) && (x.card.type & T.SPELL)).map((x) => x.code), cards, 2); goal = `Dein Ziel: Ritualmonster (${list(B) || 'deine Ritualmonster'}) beschwören. Dafür brauchst du einen Ritualzauber${rs.length ? ` (${list(rs)})` : ''} und Monster als Material, deren Stufen zusammen reichen.${hs}`; plan = ['Suche den passenden Ritualzauber und das Ritualmonster.', 'Lege Monster mit genügend Stufen als Material bereit (Hand oder Feld).', 'Spiele den Ritualzauber und beschwöre das Ritualmonster.', H.length ? `Halte ${list(H)} für den Zug des Gegners zurück.` : 'Setze eine Falle als Schutz.']; break; }
    default: goal = `Dein Ziel: Spiele mit einem Starter (${list(S) || 'deinen Suchkarten'}) deine Combo an, rufe damit ${extraBosses.length ? 'Extradeck-Monster' : 'starke Monster'} (${list(B) || 'deine Bosse'}) und baue ein starkes Endboard auf.${hs}`; plan = [`Start: Suche in der Starthand einen Starter (${list(S) || 'Suchkarte'}). Er holt die nächsten Teile deiner Combo.`, `Aufbau: Beschwöre ${extraBosses.length ? 'über ' + style.split('-')[0] + ' ' : ''}${list(B) || 'deine Bosse'}.`, E.length ? `Verlängern: ${list(E)} hilft dir, mehr Monster auf das Feld zu bringen.` : 'Verlängern: Nutze Effekte deiner Monster, um zusätzlich Monster zu rufen.', H.length ? `Schutz: Halte ${list(H)} zurück und nutze sie im Zug des Gegners.` : 'Schutz: Halte eine Fallen- oder Quick-Effekt-Karte für den Gegnerzug bereit.']; break;
  }
  // Engines, Brücken und Bosse aus den gespielten Karten (überschreibt die allgemeinen Texte, wenn eine Engine erkannt wurde)
  let engines = [], bridges = [];
  try {
    const rep = engineReport(deck, cards, setnames, roleOf); const nmOf = (c) => ({ name: cards.get(c)?.name.replace(/\s*\((GOAT|Pre-Errata)\)$/i, '') || String(c) });
    const inEng = new Set(rep.engines.flatMap((g) => g.all.map((e) => e.code))); const gt = rep.engines.length ? goalText(rep, { handtraps: handtraps.map(nmOf), removal: removal.filter((c) => !inEng.has(c)).map(nmOf) }) : null;
    if (gt && style !== 'Exodia' && style !== 'Burn') { goal = gt.goal; plan = gt.plan; }
    engines = rep.engines.map((g) => ({ n: g.name, k: g.kind, c: g.copies, st: g.starters.map((e) => e.code), ex: g.extenders.map((e) => e.code), bo: g.bosses.map((e) => e.code), su: g.support.map((e) => e.code) }));
    bridges = rep.bridges.map((b) => ({ c: b.code, w: b.why }));
  } catch (e) { /* allgemeiner Text bleibt */ }
  return { style, goal, plan, roles, engines, bridges, keys: { starters: starters.slice(0, 6), extenders: extenders.slice(0, 6), bosses: bosses.slice(0, 6), handtraps: handtraps.slice(0, 6), removal: removal.slice(0, 6) } };
}
