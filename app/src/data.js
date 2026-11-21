// Gemeinsame Daten der App: Karten, Decks, Listen, Texte, Kern
import { openCards, openData, fetchBin } from './pack.js';
import { OcgDuelMode } from '../../src/core.mjs';
import { FORMATS, count, allowed } from '../../src/decks.mjs';
import { analyze } from '../../src/tutor.mjs';
import { consistency, consSummary, setDisplayName } from '../../src/konsistenz.mjs';
import { textHook } from './util.js';
import { store } from './store.js';

export const App = { cards: null, decks: [], lists: null, strings: null, readFor: null, lib: null, byName: null, de: null, deName: null, enByDe: null, lang: store.get('lang', 'de') };

const V = typeof __VERSION__ !== 'undefined' ? '?v=' + __VERSION__ : '';
export async function boot(progress = () => {}) {
  progress('Karten und Decks werden geladen …', 0.2);
  const cardsP = fetchBin('data/cards.dat' + V).then((u) => { progress('Karten werden gelesen …', 0.55); return openCards(u); });
  const dataP = fetchBin('data/decks.dat' + V).then(openData);
  const deP = fetchBin('data/de.dat' + V).then(openData).catch(() => null); // deutsche Kartentexte – fehlen sie, bleibt es englisch
  const [cards, d, de] = await Promise.all([cardsP, dataP, deP]);
  App.cards = cards; App.decks = d.decks; App.lists = d.lists; App.strings = d.strings;
  if (de) { buildDe(de); textHook.fn = (t) => ((t.includes('„') || t.includes('«')) ? loc(t) : t); setDisplayName((code) => nameOf(code)); }
  progress('Fertig', 1);
}

// ---- Formate -------------------------------------------------------------
const M = OcgDuelMode;
export const MODES = {
  goat: { flags: M.MODE_GOAT, scripts: 'goat', emz: false, pzone: false },
  edison: { flags: M.MODE_MR1, scripts: 'edison', emz: false, pzone: false },
  advanced: { flags: M.MODE_MR5, scripts: 'official', emz: true, pzone: true },
  genesys: { flags: M.MODE_MR5 & ~(M.EMZONE | M.PZONE | M.SEPARATE_PZONE | M.FSX_MMZONE), scripts: 'official', emz: false, pzone: false },
};
export const FORMAT_INFO = {
  goat: { title: 'Goat', sub: 'April 2005', blurb: 'Das berühmte „Ziegen“-Format: alte Karten, langsame Duelle, große Zauber wie Heavy Storm und Delinquent Duo. Perfekt, um die Grundlagen zu lernen.', icon: '🐐' },
  edison: { title: 'Edison', sub: 'März 2010', blurb: 'Das klassische Format von 2010: Synchro und Fusion gibt es, aber noch kein Xyz und keine Pendel. Viel Taktik, viele Fallen.', icon: '⚡' },
  advanced: { title: 'Advanced', sub: 'Aktuell · TCG / OCG', blurb: 'Das moderne Spiel mit Link, Pendel und Extra-Monsterzonen und der heutigen Verbotsliste. Schnell, kombo-lastig.', icon: '🌀' },
  genesys: { title: 'Genesys', sub: '100 Punkte', blurb: 'Alle Karten sind erlaubt – aber jede starke Karte kostet Punkte. Du baust ein Deck mit höchstens 100 Punkten.', icon: '🧬' },
};
/** Verbotslisten im Advanced-Format (Auswahl) */
export const ADV_LISTS = ['tcg', 'ocg', 'none'];
export const LIST_NAME = { tcg: 'TCG', ocg: 'OCG', none: 'Keine Banlist' };
export const fmtOf = (deck) => ({ ...FORMATS[deck.fmt], list: deck.list || FORMATS[deck.fmt].list });
export const fmtById = (id, list) => ({ ...FORMATS[id], list: list || FORMATS[id].list });

export const expand = (l) => l.flatMap(([c, n]) => Array(n).fill(c));

// ---- Eigene Decks ----------------------------------------------------------
export const customDecks = () => store.get('decks', []);
export function saveCustom(deck) {
  const all = customDecks(); const i = all.findIndex((d) => d.id === deck.id);
  const rec = { ...deck, custom: true, grp: 'Meine Decks', updated: Date.now() }; delete rec.tutor;
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  store.set('decks', all); return rec;
}
export function deleteCustom(id) { store.set('decks', customDecks().filter((d) => d.id !== id)); }
export function withTutor(d) {
  if (!d.tutor || !d.tutor.goal) { d.tutor = { ...analyze(d, App.cards, App.strings && App.strings.setname), ...(d.tutor || {}) }; }
  if (d.tutor.cons === undefined) { try { d.tutor.cons = consSummary(consOf(d)); } catch (e) { d.tutor.cons = null; } }
  return d;
}
/** Erlaubte Kopien einer Karte im Format des Decks */
export const limitOf = (deck) => { const f = fmtById(deck.fmt, deck.fmt === 'advanced' ? deck.list : undefined); return (code) => allowed(code, f, App.lists); };
/** Konsistenz-Bewertung eines Decks (null, wenn zu wenige Karten) */
export const consOf = (deck) => consistency(deck, App.cards, App.strings && App.strings.setname, limitOf(deck));
export function allDecks(fmt) {
  const mine = customDecks().filter((d) => !fmt || d.fmt === fmt).map((d) => ({ ...d, grp: 'Meine Decks', sub: '', status: d.status || 'ok', repairs: d.repairs || [] }));
  return [...mine, ...App.decks.filter((d) => !fmt || d.fmt === fmt)];
}

// ---- Karten-Hilfen -----------------------------------------------------------
export const cardOf = (code) => App.cards.get(code);
const stripName = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '');
/** Deutsche Namen und Texte: Die Logik (Tutor, KI, Ziele) rechnet weiter mit dem englischen Original; angezeigt wird Deutsch. */
function buildDe(de) {
  App.de = new Map(); App.deName = new Map(); App.enByDe = new Map();
  for (const k of Object.keys(de)) { const code = +k; App.de.set(code, de[k]); const c = App.cards.get(code); if (!c) continue; const en = stripName(c.name); if (!App.deName.has(en)) { App.deName.set(en, de[k][0]); if (!App.enByDe.has(de[k][0])) App.enByDe.set(de[k][0], en); } }
}
export const useDe = () => App.lang !== 'en' && !!App.de;
/** Anzeigename einer Karte (aus dem englischen Namen) */
export const cleanName = (n) => { const s = stripName(n); if (useDe()) { const g = App.deName.get(s); if (g) return g; } return s; };
export const nameOf = (code) => cleanName(App.cards.get(code)?.name || String(code));
/** Kartentext in der gewählten Sprache */
export const descOf = (c) => { if (!c) return ''; if (useDe()) { const t = App.de.get(c.code); if (t && t[1]) return t[1]; } return c.desc || ''; };
/** Effekttext (strN) einer Karte in der gewählten Sprache */
export const strOf = (c, i) => { if (!c) return ''; if (useDe()) { const t = App.de.get(c.code); if (t && t[2] && t[2][i]) return t[2][i]; } return (c.strs && c.strs[i]) || ''; };
/** Englische Namen in „…“ / «…» eines Textes durch die deutschen ersetzen (Tutor-Texte entstehen mit englischen Namen) */
export const loc = (t) => { if (!t || !useDe() || typeof t !== 'string') return t; return t.replace(/([„«])([^“»]{2,80})([“»])/g, (m, a, n, z) => { const g = App.deName.get(n); return g ? a + g + z : m; }); };
/** Suchtext einer Karte: englischer und deutscher Name */
export const searchName = (c) => (c.name + '|' + ((App.deName && App.deName.get(stripName(c.name))) || '')).toLowerCase();
/** Kartennummer, unter der das Bild zu finden ist (Goat-Einträge zeigen auf das Original) */
export const imageId = (code) => { const c = App.cards.get(code); return c && c.alias && code >= 504700000 && code < 504800000 ? c.alias : code; };
export { FORMATS, count };

// ---- Goat-Umrechnung: Originalcode ↔ Goat-Eintrag -------------------------------------------------
let gm = null;
export function goatMaps() { if (!gm) { gm = { to: new Map(), from: new Map() }; for (const c of App.cards.values()) if (c.code >= 504700000 && c.code < 504800000 && c.alias) { gm.to.set(c.alias, c.code); gm.from.set(c.code, c.alias); } } return gm; }
export const toFmtCode = (code, fmt) => (fmt === 'goat' ? goatMaps().to.get(code) ?? code : (goatMaps().from.get(code) ?? code));
export const toPlainCode = (code) => goatMaps().from.get(code) ?? code;
