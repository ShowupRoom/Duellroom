// Deck-Ziele aus den tatsächlich gespielten Karten: erkennt Engines (Archetypen), ihre Starter und Bosse,
// die Brücken zwischen den Engines und beschreibt jede Karte mit einem kurzen deutschen Satz aus ihrem Effekttext.
import { isExtra, T } from './decks.mjs';

const clean = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '');
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = (a) => [...new Set(a)];

/** Gehört die Karte (Setcode s) zum Archetyp a? (Untertypen gehören zum Obertyp) */
const matches = (s, a) => (s & 0xfff) === (a & 0xfff) && ((s & a & 0xf000) === (a & 0xf000));

const FROM = { deck: 'dem Deck', hand: 'der Hand', gy: 'dem Friedhof', graveyard: 'dem Friedhof', 'extra deck': 'dem Extradeck', banishment: 'den verbannten Karten' };
const SUMMON = { fusion: 'Fusionsbeschwörung', ritual: 'Ritualbeschwörung', synchro: 'Synchrobeschwörung', xyz: 'Xyz-Beschwörung', link: 'Linkbeschwörung', pendulum: 'Pendelbeschwörung' };

/** Kurzbeschreibung des Effekts (deutsch, höchstens zwei Teile) */
export function blurb(c) {
  const d = (c && c.desc || '').replace(/\r/g, ' ').replace(/\s+/g, ' '); if (!d) return '';
  const out = []; const add = (s) => { if (s && !out.includes(s) && out.length < 2) out.push(s); };
  let m;
  if (/discard this card/i.test(d) && /(opponent|negate|Quick Effect|during either player)/i.test(d)) add('Handtrap: wirkt aus der Hand im Zug des Gegners');
  if ((m = d.match(/add (?:1|2|3|up to \d+) (?:face-up )?(?:Level \d+ or (?:lower|higher) )?(?:"([^"]+)")?[^.;]{0,70}? (?:from your (Deck|GY|Graveyard|banishment)(?: or [^.;]{0,20})?) to your hand/i))) {
    const from = (m[2] || 'Deck').toLowerCase(); add(from === 'deck' ? (m[1] ? `sucht „${m[1]}“ aus dem Deck` : 'sucht eine passende Karte aus dem Deck') : `holt eine Karte aus ${FROM[from]} zurück auf die Hand`);
  }
  if ((m = d.match(/Special Summon (?:1|2|3|up to \d+|any number of) (?:"([^"]+)")?[^.;]{0,90}?from your (Deck|hand|GY|Graveyard|Extra Deck)/i))) add(`ruft ${m[1] ? '„' + m[1] + '“' : 'ein Monster'} aus ${FROM[m[2].toLowerCase()]}`);
  else if (/Special Summon this card/i.test(d)) add('kann sich selbst ins Spiel bringen');
  if ((m = d.match(/\b(Fusion|Ritual|Synchro|Xyz|Link|Pendulum) Summon\b/)) && (c.type & (T.SPELL | T.TRAP) || /you can[^.;]{0,40}\b(Fusion|Ritual|Synchro|Xyz|Link) Summon/i.test(d))) add('ermöglicht eine ' + SUMMON[m[1].toLowerCase()]);
  if (/send [^.;]{0,60}from your Deck to the (GY|Graveyard)/i.test(d)) add('schickt eine Karte aus dem Deck auf den Friedhof');
  if (/\bdraw (?:\d+ cards?|1 card|cards?)\b/i.test(d) && !/opponent draws/i.test(d)) add('zieht Karten');
  if (/\bnegate\b/i.test(d)) add(/(activation|effect)/i.test(d) ? 'negiert Aktivierungen und Effekte des Gegners' : 'negiert Beschwörungen oder Angriffe');
  if (/take control/i.test(d)) add('übernimmt ein Monster des Gegners');
  if (/\bdestroy\b/i.test(d) && /opponent|your opponent'?s?|face-up/i.test(d)) add('zerstört Karten des Gegners'); else if (/\bdestroy\b/i.test(d)) add('zerstört Karten');
  if (/\bbanish\b/i.test(d)) add('verbannt Karten');
  if (/return [^.;]{0,60}to the (hand|Deck)/i.test(d)) add('schickt Karten zurück auf die Hand oder ins Deck');
  if (/inflict[^.;]{0,40}damage/i.test(d)) add('fügt Effektschaden zu');
  if (/(cannot be destroyed|unaffected by|cannot be targeted)/i.test(d) && c.type & T.MONSTER) add('ist gegen Effekte geschützt');
  if (/gains? \d+ ATK|ATK (?:by|of) \d+|increases? the ATK/i.test(d)) add('stärkt Monster');
  return out.join(' und ');
}

const typeOfExtra = (c) => (c.type & T.FUSION ? 'Fusion' : c.type & T.SYNCHRO ? 'Synchro' : c.type & T.XYZ ? 'Xyz' : c.type & T.LINK ? 'Link' : '');

/** Engines, Brücken und Texte. roleOf(card) liefert die Rolle einer Karte. */
export function engineReport(deck, cards, setnames, roleOf) {
  const sn = setnames || {};
  const entries = [...deck.main, ...deck.extra].map(([code, n]) => ({ code, n, card: cards.get(code) })).filter((e) => e.card).map((e) => ({ ...e, role: roleOf(e.card), name: clean(e.card.name), ex: isExtra(e.card) }));
  const sets = (e) => e.card.setcodes || [];
  // 1) Engines: Archetypen mit mindestens 2 verschiedenen Karten und 4 Exemplaren, der Reihe nach
  const dn = (deck.name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  const hit = (s) => !!sn[s] && dn.includes(sn[s].toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim());
  let rest = entries.filter((e) => sets(e).length && e.role !== 'handtrap' && e.role !== 'draw'); const engines = [];
  while (engines.length < 3) {
    const w = new Map();
    for (const e of rest) for (const s of sets(e)) { if (!sn[s]) continue; const o = w.get(s) || { n: 0, k: 0, x: 0 }; o.n += e.n; o.k++; if (e.ex) o.x++; w.set(s, o); }
    const score = ([s, o]) => o.n + o.x * 2 + (hit(s) ? 12 : 0);
    const top = [...w].filter(([s, o]) => (o.n >= 4 && o.k >= 2) || (hit(s) && o.n >= 2)).sort((a, b) => score(b) - score(a) || b[1].k - a[1].k || a[0] - b[0])[0];
    if (!top) break;
    const [code] = top; const members = rest.filter((e) => sets(e).some((s) => matches(s, code)));
    engines.push({ code, name: sn[code], members, all: [] }); rest = rest.filter((e) => !members.includes(e));
  }
  if (!engines.length) return { engines: [], bridges: [] };
  for (const g of engines) g.all = entries.filter((e) => sets(e).some((s) => matches(s, g.code)));
  const by = (arr, f) => arr.filter(f);
  const rank = (a, b) => b.n - a.n || (b.card.attack || 0) - (a.card.attack || 0);
  for (const g of engines) {
    const mem = g.all;
    g.copies = g.members.reduce((s, e) => s + e.n, 0);
    g.starters = by(mem, (e) => e.role === 'starter').sort(rank).slice(0, 3);
    g.extenders = by(mem, (e) => e.role === 'extender').sort(rank).slice(0, 3);
    if (!g.starters.length) { g.starters = g.extenders.slice(0, 2); g.extenders = g.extenders.slice(2); }
    g.bosses = by(mem, (e) => e.ex || e.role === 'boss').sort((a, b) => (b.card.attack || 0) - (a.card.attack || 0)).slice(0, 3);
    g.support = by(mem, (e) => !e.ex && (e.card.type & (T.SPELL | T.TRAP)) && !g.starters.includes(e) && !g.extenders.includes(e)).sort(rank).slice(0, 2);
    const kinds = {}; for (const e of mem) if (e.ex) { const k = typeOfExtra(e.card); kinds[k] = (kinds[k] || 0) + e.n; }
    const k = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0]; g.kind = k ? k[0] : '';
  }
  // 2) Brücken
  const bridges = []; const seen = new Set(); const addB = (e, why) => { if (!seen.has(e.code)) { seen.add(e.code); bridges.push({ code: e.code, name: e.name, why, ex: e.ex }); } };
  if (engines.length > 1) {
    for (const e of entries) { const hit = engines.filter((g) => g.all.includes(e)); if (hit.length > 1) addB(e, `gehört zu „${hit[0].name}“ und „${hit[1].name}“ – so wechselst du zwischen beiden Engines`); }
    for (const e of entries) {
      const own = engines.filter((g) => g.all.includes(e)); const d = e.card.desc || '';
      for (const g of engines) { if (own.includes(g) || !g.name) continue; if (new RegExp('"' + esc(g.name) + '"').test(d)) { addB(e, own[0] ? `führt von „${own[0].name}“ zu „${g.name}“ (der Text verweist auf „${g.name}“-Karten)` : `unterstützt „${g.name}“ – der Text verweist auf „${g.name}“-Karten`); } }
    }
  }
  // generische Extradeck-Monster (gehören zu keiner Engine) verbinden die Engines über gemeinsames Material
  const generic = entries.filter((e) => e.ex && !engines.some((g) => g.all.includes(e)) && !(e.card.setcodes || []).length).sort((a, b) => (b.card.attack || 0) - (a.card.attack || 0));
  for (const e of generic.slice(0, engines.length > 1 ? 3 : 2)) addB(e, engines.length > 1 ? `gehört zu keiner Engine und nimmt Material aus beiden – ${typeOfExtra(e.card)}-Brücke` : `Extra-Hilfe außerhalb der Engine (${typeOfExtra(e.card)})`);
  return { engines, bridges: bridges.slice(0, 5), generic };
}

/** Text für Ziel und Plan aus dem Bericht; null, wenn keine Engine erkannt wurde */
export function goalText(rep, ctx) {
  const { engines, bridges } = rep; if (!engines.length) return null;
  const nm = (e) => `«${e.name}»`;
  const act = (e) => { const b = blurb(e.card); return nm(e) + (b ? ` (${b})` : ''); };
  const boss = (e) => { const a = e.card.attack; const b = blurb(e.card); return `${nm(e)}${typeOfExtra(e.card) ? ' [' + typeOfExtra(e.card) + ']' : ''} (${a != null && a >= 0 ? a + ' ATK' : '? ATK'}${b ? ', ' + b : ''})`; };
  const lines = []; const engLine = (g) => {
    const S = g.starters.slice(0, 2), E = g.extenders.slice(0, 2), B = g.bosses.slice(0, 2), P = g.support.slice(0, 1);
    const parts = [];
    if (S.length) parts.push(`Start: ${list(S.map(act))}`);
    if (E.length) parts.push(`Verlängern: ${list(E.map(act))}`);
    if (B.length) parts.push(`Ziel: ${list(B.map(boss))}`);
    if (P.length) parts.push(`Unterstützung: ${list(P.map(act))}`);
    return parts.join(' → ');
  };
  const main = engines[0]; const hts = ctx.handtraps.slice(0, 2), rm = ctx.removal.slice(0, 2);
  const brief = (g) => { const S = g.starters.slice(0, 2).map(nm), B = g.bosses.slice(0, 2).map((e) => `${nm(e)} (${e.card.attack >= 0 ? e.card.attack + ' ATK' : '? ATK'})`); return `„${g.name}“${g.kind ? ' [' + g.kind + ']' : ''}${S.length ? ': Start mit ' + list(S) : ''}${B.length ? (S.length ? ', ' : ': ') + 'Ziel ' + list(B) : ''}`; };
  let goal;
  if (engines.length === 1) {
    goal = `Dein Ziel: Die Engine ${brief(main)}. So baust du Schritt für Schritt dein Endboard auf.`;
    if (bridges.length) goal += ` Hilfe von außerhalb der Engine: ${list(bridges.slice(0, 2).map((b) => nm(b)))}.`;
  } else {
    goal = `Dein Deck verbindet ${engines.length} Engines – ${engines.map(brief).join('; ')}.`;
    if (bridges.length) goal += ` Brücken zwischen ihnen: ${list(bridges.slice(0, 3).map((b) => nm(b)))} – so greifen die Engines ineinander und du erreichst mehrere Bosse in einem Zug.`;
  }
  if (hts.length) goal += ` Halte ${list(hts.map(nm))} als Schutz im Zug des Gegners bereit.`;
  const plan = [];
  engines.forEach((g, i) => plan.push(`Engine „${g.name}“${i === 0 ? ' (Hauptplan)' : ''}: ` + engLine(g) + '.'));
  for (const b of bridges.slice(0, 3)) plan.push(`Brücke «${b.name}»: ${b.why}.`);
  const top = engines.flatMap((g) => g.bosses).sort((a, b) => (b.card.attack || 0) - (a.card.attack || 0)).filter((e, i, a) => a.findIndex((x) => x.code === e.code) === i).slice(0, 2);
  if (top.length) plan.push(`Endboard: ${list(top.map(boss))}.`);
  if (hts.length || rm.length) plan.push(`Schutz & Aufräumen: ${list([...hts, ...rm].map(nm))} – ${hts.length ? 'Handtraps im Zug des Gegners, ' : ''}${rm.length ? 'Entferner gegen Hindernisse' : ''}`.replace(/, $/, '') + '.');
  return { goal, plan };
}
