// Texte: Systemtexte des Kerns, Kartenbeschreibungen, Namen
import { App, cleanName, strOf } from './data.js';

export const sys = (id, fb = '') => App.strings.system[Number(id)] ?? fb;
export const PHASE = { 1: 'Ziehphase', 2: 'Standby-Phase', 4: 'Main Phase 1', 8: 'Kampfphase', 16: 'Kampfphase', 32: 'Kampfphase', 64: 'Kampfphase', 128: 'Kampfphase', 256: 'Main Phase 2', 512: 'End Phase' };
export const PHASE_HELP = {
  1: 'Ziehphase: Du ziehst eine Karte. (Wer das Duell beginnt, zieht im ersten Zug nicht.)',
  2: 'Standby-Phase: Hier lösen manche Dauer-Effekte aus. Meist passiert nichts.',
  4: 'Main Phase 1: Hier spielst du fast alles: ein Monster normal beschwören oder setzen, Zauber aktivieren, Fallen setzen, Spezialbeschwörungen.',
  8: 'Kampfphase: Deine Monster greifen an. Ein Monster greift pro Zug einmal an.',
  256: 'Main Phase 2: Nach dem Kampf kannst du noch Karten spielen – zum Beispiel ein Monster in Verteidigung setzen.',
  512: 'End Phase: Der Zug endet. Hast du mehr als 6 Karten auf der Hand, wirfst du ab.',
};
export const LOCN = { 1: 'Deck', 2: 'Hand', 4: 'Monsterzone', 8: 'Zauber/Fallen-Zone', 16: 'Friedhof', 32: 'Verbannt', 64: 'Extradeck', 128: 'Material' };
export const RACE_BITS = [[1n, 'Krieger'], [2n, 'Hexer'], [4n, 'Fee'], [8n, 'Unterweltler'], [16n, 'Zombie'], [32n, 'Maschine'], [64n, 'Wasser'], [128n, 'Pyro'], [256n, 'Fels'], [512n, 'Geflügeltes Ungeheuer'], [1024n, 'Pflanze'], [2048n, 'Insekt'], [4096n, 'Donner'], [8192n, 'Drache'], [16384n, 'Ungeheuer'], [32768n, 'Ungeheuer-Krieger'], [65536n, 'Dinosaurier'], [131072n, 'Fisch'], [262144n, 'Seeschlange'], [524288n, 'Reptil'], [1048576n, 'Psycho'], [2097152n, 'Göttliches Ungeheuer'], [4194304n, 'Schöpfergott'], [8388608n, 'Wyrm'], [16777216n, 'Cyberse'], [33554432n, 'Illusion'], [67108864n, 'Cyborg'], [134217728n, 'Magischer Ritter'], [268435456n, 'Hoher Drache'], [536870912n, 'Omega-Psycho'], [1073741824n, 'Himmlischer Krieger'], [2147483648n, 'Galaxie']];
export const ATTR_BITS = [[1, 'ERDE'], [2, 'WASSER'], [4, 'FEUER'], [8, 'WIND'], [16, 'LICHT'], [32, 'FINSTERNIS'], [64, 'GÖTTLICH']];
export const raceName = (r) => { const b = BigInt(r || 0); return RACE_BITS.filter(([v]) => b & v).map(([, n]) => n).join('/'); };
export const attrName = (a) => ATTR_BITS.filter(([v]) => (a || 0) & v).map(([, n]) => n).join('/');

/** Text zu einer Beschreibungsnummer des Kerns (Systemtext oder Kartentext) */
export function descText(desc, fallbackCode = 0) {
  const d = Number(desc || 0); if (!d) return '';
  if (d < 10000) return sys(d);
  const code = Math.floor(d / 16), idx = d % 16; const c = App.cards.get(code) || App.cards.get(fallbackCode);
  return strOf(c, idx);
}
export const victoryText = (r) => App.strings.victory[r] || (r === 1 ? 'LP haben 0 erreicht' : 'Spielende');
export const counterText = (t) => App.strings.counter[t] || 'Zählmarke';

export function typeText(c) {
  if (!c) return '';
  const t = c.type;
  if (t & 2) { const k = t & 0x10000 ? 'Schnell' : t & 0x20000 ? 'Dauer' : t & 0x40000 ? 'Ausrüstung' : t & 0x80000 ? 'Spielfeld' : t & 0x80 ? 'Ritual' : 'Normal'; return `Zauberkarte · ${k}`; }
  if (t & 4) { const k = t & 0x20000 ? 'Dauer' : t & 0x100000 ? 'Konter' : 'Normal'; return `Fallenkarte · ${k}`; }
  const sub = []; const M = [[0x40, 'Fusion'], [0x80, 'Ritual'], [0x2000, 'Synchro'], [0x800000, 'Xyz'], [0x4000000, 'Link'], [0x1000000, 'Pendel'], [0x800, 'Zwilling'], [0x200, 'Spirit'], [0x400, 'Union'], [0x200000, 'Flipp'], [0x400000, 'Toon'], [0x1000, 'Empfänger'], [0x10, 'Normal'], [0x20, 'Effekt'], [0x4000, 'Spielmarke']];
  for (const [b, n] of M) if (t & b) sub.push(n);
  return `${raceName(c.race)} / ${sub.join('/')}`;
}
export const levelText = (c) => { if (!c || !(c.type & 1)) return ''; if (c.type & 0x4000000) return `Link ${c.level}`; return `${c.type & 0x800000 ? 'Rang' : 'Stufe'} ${c.level}`; };
export const atkText = (v) => (v < 0 ? '?' : String(v));
export function statsText(c) {
  if (!c || !(c.type & 1)) return '';
  if (c.type & 0x4000000) return `ATK ${atkText(c.attack)}`;
  return `ATK ${atkText(c.attack)} / VER ${atkText(c.defense)}`;
}
export const kind = (c) => { if (!c) return 'x'; const t = c.type; if (t & 2) return 'spell'; if (t & 4) return 'trap'; if (t & 0x4000000) return 'link'; if (t & 0x800000) return 'xyz'; if (t & 0x2000) return 'synchro'; if (t & 0x40) return 'fusion'; if (t & 0x80) return 'ritual'; if (t & 0x4000) return 'token'; if (t & 0x20) return 'effect'; return 'normal'; };
export const KIND_DE = { spell: 'Zauber', trap: 'Falle', link: 'Link', xyz: 'Xyz', synchro: 'Synchro', fusion: 'Fusion', ritual: 'Ritual', effect: 'Effekt', normal: 'Normal', token: 'Spielmarke' };
export const shortName = (code) => cleanName(App.cards.get(code)?.name || String(code));
/** Satz mit Platzhalter %ls füllen */
export const fill = (txt, ...args) => { let i = 0; return (txt || '').replace(/%ls|%d|%s/g, () => (args[i] !== undefined ? args[i++] : '')); };
