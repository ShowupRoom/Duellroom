// Anzeige der Konsistenz: Wert, Kennzahlen, Erklärungen (Deck-Ansicht und Editor)
import { h } from './util.js';

const pct = (x) => Math.round(x * 100) + '%';
const bar = (label, value, text, good, hint) => h('div', { class: 'cons-row' },
  h('div', { class: 'cons-rl' }, h('span', null, label), h('b', null, text)),
  h('div', { class: 'cons-bar' }, h('i', { class: good ? 'g' : 'b', style: `width:${Math.max(2, Math.round(value * 100))}%` })),
  hint ? h('div', { class: 'small muted' }, hint) : null);

/** Der Block mit Score, Balken und Hinweisen (c = Ergebnis von consistency()) */
export function consBlock(c) {
  const list = (items, cls, ic) => items && items.length ? h('ul', { class: 'cons-l ' + cls }, items.map((t) => h('li', null, h('span', null, ic), ' ' + t))) : null;
  return h('div', { class: 'cons' },
    h('div', { class: 'cons-top' }, h('div', { class: 'cons-score ' + c.tone }, String(c.score)), h('div', { class: 'grow' }, h('div', { class: 'cons-lab' }, c.label), h('div', { class: 'small muted' }, 'Konsistenz von 0 bis 100 – wie zuverlässig dein Deck in einen brauchbaren Zug kommt'))),
    bar('Starter in der Starthand', c.p5, pct(c.p5), c.p5 >= 0.9, `${c.strong} Starter/Zugkarten bei ${c.N} Karten · mit 6 Karten (als Zweiter) ${pct(c.p6)}`),
    bar('Brick-Risiko', c.brick, pct(c.brick), c.brick <= 0.05, 'Hand ohne eine einzige Karte, die dein Spiel startet'),
    bar('Tote Karten (2+ schwere Monster)', c.dead2, pct(c.dead2), c.dead2 <= 0.1, c.bosses ? `${c.bosses} schwere Monster im Hauptdeck` : 'keine schweren Monster im Hauptdeck'),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin:6px 0' }, h('span', { class: 'chip' }, `${c.N} Karten`), h('span', { class: 'chip' }, `${c.handtraps} Handtraps`), c.nEngines ? h('span', { class: 'chip' }, c.nEngines === 1 ? 'Engine: ' + c.engines[0] : `${c.nEngines} Engines`) : h('span', { class: 'chip' }, 'keine feste Engine')),
    list(c.good, 'good', '✓'), list(c.warn, 'warn', '⚠'), list(c.notes, 'note', 'ℹ'),
    h('details', { class: 'small muted' }, h('summary', null, 'So wird gerechnet'), h('p', null, 'Starter sind Karten, die selbst suchen oder Monster ins Spiel bringen (auch Zauber, die beschwören), dazu Zugkarten. Aus der Anzahl im Deck wird genau berechnet, wie oft sie in den ersten 5 Karten vorkommen. Dazu kommen: tote schwere Monster, Deckgröße (40 ist ideal), ob Starter in voller Anzahl gespielt werden und ob die Karten zu einer Engine passen. Die Rollen der Karten werden aus dem Kartentext erkannt – das ist eine gute Näherung, aber kein Ersatz für Spielgefühl.')));
}

export const consChip = (cons) => (cons ? h('span', { class: 'chip ' + (cons.s >= 72 ? 'ok' : cons.s >= 50 ? 'warn' : 'bad'), title: 'Konsistenz (0–100)' }, 'K ' + cons.s) : null);
