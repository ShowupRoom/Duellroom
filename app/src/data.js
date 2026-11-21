// Gemeinsame Daten der App: Karten, Decks, Listen, Texte, Kern
import { openCards, openData, fetchBin } from './pack.js';
import { OcgDuelMode } from '../../src/core.mjs';
import { FORMATS, count } from '../../src/decks.mjs';
import { analyze } from '../../src/tutor.mjs';
import { store } from './store.js';

export const App = { cards: null, decks: [], lists: null, strings: null, readFor: null, lib: null, byName: null };

const V = typeof __VERSION__ !== 'undefined' ? '?v=' + __VERSION__ : '';
export async function boot(progress = () => {}) {
  progress('Karten und Decks werden geladen …', 0.2);
  const cardsP = fetchBin('data/cards.dat' + V).then((u) => { progress('Karten werden gelesen …', 0.55); return openCards(u); });
  const dataP = fetchBin('data/decks.dat' + V).then(openData);
  const [cards, d] = await Promise.all([cardsP, dataP]);
  App.cards = cards; App.decks = d.decks; App.lists = d.lists; App.strings = d.strings;
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
export function withTutor(d) { if (!d.tutor || !d.tutor.goal) { d.tutor = { ...analyze(d, App.cards), ...(d.tutor || {}) }; } return d; }
export function allDecks(fmt) {
  const mine = customDecks().filter((d) => !fmt || d.fmt === fmt).map((d) => ({ ...d, grp: 'Meine Decks', sub: '', status: d.status || 'ok', repairs: d.repairs || [] }));
  return [...mine, ...App.decks.filter((d) => !fmt || d.fmt === fmt)];
}

// ---- Karten-Hilfen -----------------------------------------------------------
export const cardOf = (code) => App.cards.get(code);
export const cleanName = (n) => (n || '').replace(/\s*\((goat|pre-errata)\)$/i, '');
export const nameOf = (code) => cleanName(App.cards.get(code)?.name || String(code));
/** Kartennummer, unter der das Bild zu finden ist (Goat-Einträge zeigen auf das Original) */
export const imageId = (code) => { const c = App.cards.get(code); return c && c.alias && code >= 504700000 && code < 504800000 ? c.alias : code; };
export { FORMATS, count };

// ---- Goat-Umrechnung: Originalcode ↔ Goat-Eintrag -------------------------------------------------
let gm = null;
export function goatMaps() { if (!gm) { gm = { to: new Map(), from: new Map() }; for (const c of App.cards.values()) if (c.code >= 504700000 && c.code < 504800000 && c.alias) { gm.to.set(c.alias, c.code); gm.from.set(c.code, c.alias); } } return gm; }
export const toFmtCode = (code, fmt) => (fmt === 'goat' ? goatMaps().to.get(code) ?? code : (goatMaps().from.get(code) ?? code));
export const toPlainCode = (code) => goatMaps().from.get(code) ?? code;
