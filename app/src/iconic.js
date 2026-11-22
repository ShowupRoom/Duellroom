// Große Beschwörungs-Animationen für ikonische Karten: Lichtstrahlen, Ringe, Funken, Kartenkunst und Name – je Karte eigenes Thema.
// Eigene CSS-Zeichnung; das Kartenbild kommt wie überall von der Bilderseite. Antippen überspringt.
import { h } from './util.js';
import { cardOf, nameOf } from './data.js';
import { store } from './store.js';
import { wantImage } from './cards.js';

// Thema: Farben a/b, Stil (dragon, magic, god, dark, machine, cute, hero, light), kurzer Satz
const T = (s, a, b, line) => ({ s, a, b, line });
export const ICONIC = {
  89631139: T('dragon', '#bfe8ff', '#2a7bff', 'Der legendäre weiße Drache erhebt sich!'),
  23995346: T('dragon', '#e6f6ff', '#2a7bff', 'Drei Köpfe, eine unaufhaltsame Macht!'),
  38517737: T('dragon', '#bfe8ff', '#2a7bff', 'Weißes Licht zerreißt den Himmel!'),
  55410871: T('dragon', '#d8f2ff', '#6a3cff', 'Chaos und Licht vereint!'),
  46986414: T('magic', '#c9a8ff', '#5a2ab0', 'Der stärkste Magier in Angriff und Verteidigung!'),
  38033121: T('cute', '#ffd1ea', '#ff5fae', 'Die Schülerin des Dunklen Magiers ist da!'),
  40737112: T('magic', '#d8b8ff', '#2a0a5a', 'Chaos-Magie durchflutet das Feld!'),
  30208479: T('magic', '#ffb8d0', '#3a0a3a', 'Aus der Dunkelheit des Rituals …'),
  98502113: T('magic', '#c9a8ff', '#2a3ab0', 'Magier und Drachenjäger in einer Gestalt!'),
  41721210: T('magic', '#c9a8ff', '#2a7bff', 'Magier und Drache werden eins!'),
  41175645: T('light', '#ffffff', '#8ab8ff', 'Stilles Licht, grenzenlose Kraft.'),
  74677422: T('dark', '#ff6a5a', '#2a0505', 'Der Drache mit den roten Augen – voller Potenzial!'),
  37818794: T('dark', '#ff7a6a', '#3a0a3a', 'Rote Augen, dunkle Magie!'),
  11901678: T('dark', '#ff6a5a', '#1a0505', 'Totenkopf und Drache vereint!'),
  10000020: T('god', '#ff6a5a', '#7a0a0a', 'Der Himmelsdrache brüllt!'),
  10000000: T('god', '#8ac8ff', '#0a2a7a', 'Der Peiniger erhebt seine Faust!'),
  10000010: T('god', '#ffe08a', '#a86a0a', 'Die Sonne selbst steigt auf das Feld!'),
  33396948: T('god', '#ffe08a', '#7a4a0a', 'Das Verbotene ist entfesselt!'),
  44508094: T('light', '#e6f6ff', '#6ab8ff', 'Sternenstaub funkelt über dem Feld!'),
  24696097: T('light', '#e6f6ff', '#8a6aff', 'Schneller als jede Sternschnuppe!'),
  82044279: T('light', '#d8ffe6', '#2ab87a', 'Klare Flügel, schneidender Wind!'),
  73580471: T('dark', '#ff8ab8', '#5a0a2a', 'Ein Sturm aus Rosenblättern!'),
  70902743: T('dark', '#ff8a4a', '#5a0a0a', 'Glühende Hitze des roten Drachen!'),
  9012916: T('dark', '#8a9aff', '#0a0a2a', 'Schwarze Federn verdunkeln den Himmel!'),
  89943723: T('hero', '#ffffff', '#3a7aff', 'Der Held aus der Neo-Galaxie!'),
  35809262: T('hero', '#ffb86a', '#a83a0a', 'Flammen und Flügel – ein Held!'),
  25366484: T('hero', '#fff2c0', '#c8901e', 'Strahlend wie der Morgen!'),
  70095154: T('machine', '#bff6ff', '#2a8aa8', 'Ein Drache aus Stahl und Licht!'),
  1546123: T('machine', '#bff6ff', '#2a5aa8', 'Drei Köpfe aus Stahl!'),
  83104731: T('machine', '#ffd08a', '#6a4a1a', 'Zahnräder greifen ineinander!'),
  77585513: T('machine', '#ff6a6a', '#2a2a3a', 'Fallen? Hier nicht mehr!'),
  40640057: T('cute', '#ffd8a8', '#8a4a1a', 'Kuriboh hüpft aufs Feld!'),
  57116033: T('cute', '#fff2c0', '#c8a01e', 'Kleine Flügel, großes Herz!'),
  90960358: T('cute', '#ffd1ea', '#ff5fae', 'Toon-Magie mit Augenzwinkern!'),
  53183600: T('cute', '#bfe8ff', '#2a7bff', 'Der Drache – jetzt in Toon!'),
  71808988: T('cute', '#e6f6ff', '#2a7bff', 'Drei Toon-Köpfe, null Gnade!'),
  21296502: T('cute', '#c9a8ff', '#5a2ab0', 'Hokuspokus im Toon-Stil!'),
  84013237: T('hero', '#fff2c0', '#c8901e', 'Die Nummer der Hoffnung!'),
  56840427: T('hero', '#fff2c0', '#e85a1e', 'Hoffnung, die heller strahlt!'),
  72989439: T('light', '#fff2c0', '#5a3ab0', 'Licht und Dunkelheit im Gleichgewicht!'),
  82301904: T('dark', '#ffd08a', '#2a0a3a', 'Das Ende aller Dinge naht!'),
  70781052: T('dark', '#ffe08a', '#2a1a3a', 'Blitze zucken aus der Finsternis!'),
  6368038: T('hero', '#ffd08a', '#5a2a8a', 'Der zornige Ritter galoppiert heran!'),
  99267150: T('dark', '#ffd08a', '#3a1a0a', 'Fünf Köpfe, fünf Elemente!'),
  93717133: T('light', '#b8f0ff', '#2a2aa8', 'Ein Photonenstrahl erhellt die Galaxie!'),
  39272762: T('light', '#b8f0ff', '#5a1aa8', 'Neo-Galaxie, entfesselt!'),
  88177324: T('light', '#ffd0ff', '#2a1a8a', 'Die Zeit selbst steht still!'),
  16178681: T('light', '#ffb8b8', '#2a8a5a', 'Bunte Augen, doppelter Schaden!'),
  13331639: T('god', '#ffe08a', '#3a0a3a', 'Der oberste König erwacht!'),
  5043010: T('machine', '#bff6ff', '#1a6aa8', 'Die Firewall ist aktiv!'),
  86066372: T('machine', '#ffd08a', '#a83a0a', 'Zugriff gewährt – Angriff!'),
  1861629: T('machine', '#bff6ff', '#2a5aa8', 'Code entschlüsselt!'),
  31833038: T('machine', '#ffb8b8', '#5a0a1a', 'Nachgeladen und bereit!'),
  4280258: T('light', '#d8ffe6', '#2a8a7a', 'Die Göttin spannt ihren Bogen!'),
  79856792: T('light', '#ffffff', '#ff5fae', 'Alle Farben des Regenbogens!'),
  78371393: T('dark', '#ffb8e0', '#3a0a3a', 'Liebe kennt keine Grenzen …'),
  26077387: T('machine', '#ffb8b8', '#a81a2a', 'Himmelsjäger startklar!'),
  63288573: T('machine', '#ff8a6a', '#a81a2a', 'Ass im Anflug!'),
  14558127: T('cute', '#ffd1ea', '#ff7ab8', 'Ein Hauch von Frühling!'),
  10000: T('dragon', '#ffe08a', '#a86a0a', 'Zehntausend Jahre Macht in einem Drachen!'),
  57314798: T('god', '#ffe08a', '#3a2a0a', 'Numeron – die Zahl am Anfang aller Zahlen!'),
  10443957: T('machine', '#bff6ff', '#2a5aa8', 'Unendliche Cyber-Kraft!'),
  59400890: T('magic', '#d8b8ff', '#3a0a5a', 'Der Magier der Zerstörung erscheint!'),
  45112597: T('dragon', '#b8f0ff', '#0a4a7a', 'Der Meeresdrache aus der Weltsee!'),
  63767246: T('light', '#b8f0ff', '#2a2aa8', 'Ein Titan aus Galaxienlicht!'),
  28400508: T('dark', '#ffd08a', '#5a1a0a', 'Draglubion entfesselt alle Drachen-Nummern!'),
  84815190: T('light', '#d8ffe6', '#2a8a5a', 'Die Baronin der Blumen zieht ihr Schwert!'),
  85289965: T('machine', '#ffb8b8', '#5a0a1a', 'Klinge und Revolver – bereit zum Feuern!'),
  44146295: T('dragon', '#d8f6ff', '#2a6aa8', 'Eiskalte Klingen aus Jade!'),
  87746184: T('dark', '#ffe0a8', '#5a2a0a', 'Der gebrandmarkte Drache steigt auf!'),
  22850702: T('light', '#fff2c0', '#5a3ab0', 'Licht und Dunkelheit – ein Engel des Chaos!'),
  23995346: T('dragon', '#e6f6ff', '#2a7bff', 'Drei Köpfe, eine unaufhaltsame Macht!'),
  62873545: T('dragon', '#e6f6ff', '#c8901e', 'Der Ritter auf dem ultimativen Drachen!'),
  41209827: T('dark', '#d8ff8a', '#3a0a5a', 'Gift und Hunger in Drachengestalt!'),
  16195942: T('dark', '#c8b8ff', '#1a0a3a', 'Rebellion in schwarzen Schwingen!'),
  1686814: T('light', '#ffe8a8', '#a83a0a', 'Ein Drache, beschworen ohne Material!'),
};
// ---- Automatisch: mächtige Bossmonster (auch ohne eigenen Eintrag) ----------------------------------------------------------
const ATTR = { 1: ['hero', '#ffd08a', '#6a4a1a'], 2: ['dragon', '#b8f0ff', '#0a4a8a'], 4: ['dark', '#ffb86a', '#8a1a0a'], 8: ['light', '#d8ffe6', '#1a8a5a'], 16: ['light', '#fff2c0', '#c8901e'], 32: ['dark', '#d8a8ff', '#2a0a3a'], 64: ['god', '#ffe08a', '#a86a0a'] };
const KIND = (t, lv) => (t & 0x4000000 ? `Link-${lv} – die Pfeile zeigen auf den Sieg!` : t & 0x800000 ? `Rang ${lv} – überlagert und bereit!` : t & 0x2000 ? 'Die Sterne stimmen sich ein …' : t & 0x40 ? 'Aus der Fusion geboren!' : t & 0x80 ? 'Das Ritual ist vollendet!' : 'Ein Bossmonster betritt das Feld!');
function bossOf(c) {
  if (!c || !(c.type & 1)) return null; const t = c.type; const lv = c.level & 0xff; const extra = t & (0x40 | 0x80 | 0x2000 | 0x800000 | 0x4000000);
  const big = c.attack >= 3000 || (extra && c.attack >= 2500 && ((t & 0x4000000) ? lv >= 4 : lv >= 8));
  if (!big) return null; let [s, a, b] = ATTR[c.attribute] || ATTR[32];
  const rc = BigInt(c.race || 0); // Rasse ist im Kartenbestand eine BigInt-Bitmaske
  if (rc & 0x2000n && s !== 'god') s = 'dragon'; else if (rc & 0x20n) s = 'machine'; else if (rc & 0x2n && s !== 'god') s = 'magic';
  return { ...T(s, a, b, KIND(t, lv)), boss: true };
}
const STYLE_IC = { dragon: '✦', magic: '✧', god: '☀', dark: '✶', machine: '⬡', cute: '♥', hero: '★', light: '✺' };
export const iconicOn = () => store.get('fx.iconic', true);
export function iconicOf(code) { const c = cardOf(code); return ICONIC[code] || (c && c.alias && ICONIC[c.alias]) || (store.get('fx.boss', true) ? bossOf(c) : null); }

/** Spielt die Animation; Promise endet nach der Animation oder beim Antippen */
export function playIconic(host, code, { fast = false, kind = 'Beschwörung' } = {}) {
  const th = iconicOf(code); if (!th) return Promise.resolve(); const cc = cardOf(code);
  const ms = fast ? 1500 : 2600;
  return new Promise((res) => {
    const art = h('img', { class: 'ic-art', alt: '' }); wantImage(art, 'crop', cardOf(code) && cardOf(code).alias && ICONIC[cardOf(code).alias] ? cardOf(code).alias : code);
    const parts = h('div', { class: 'ic-parts' }); for (let i = 0; i < 26; i++) { const a = (i / 26) * 360 + Math.random() * 10; const d = 30 + Math.random() * 30; parts.append(h('i', { style: `--a:${a}deg;--d:${d}vmax;--t:${(0.6 + Math.random() * 0.9).toFixed(2)}s;--dl:${(0.25 + Math.random() * 0.4).toFixed(2)}s` }, th.s === 'cute' ? (i % 3 ? '♥' : '✦') : th.s === 'magic' ? '✧' : '')); }
    const el = h('div', { class: `ic-ov ic-${th.s}${fast ? ' fast' : ''}`, style: `--ia:${th.a};--ib:${th.b}`, onclick: () => done() },
      h('div', { class: 'ic-dim' }), h('div', { class: 'ic-rays' }), h('div', { class: 'ic-ring r1' }), h('div', { class: 'ic-ring r2' }), h('div', { class: 'ic-ring r3' }),
      th.s === 'magic' || th.s === 'god' ? h('div', { class: 'ic-circle' }) : null, th.s === 'machine' ? h('div', { class: 'ic-scan' }) : null, th.s === 'dragon' || th.s === 'god' ? h('div', { class: 'ic-flash' }) : null,
      parts, h('div', { class: 'ic-card' }, art, h('div', { class: 'ic-shine' })),
      h('div', { class: 'ic-txt' }, h('div', { class: 'ic-k' }, `${STYLE_IC[th.s] || '✦'}  ${th.boss ? 'BOSSMONSTER · ' : ''}${kind.toUpperCase()}  ${STYLE_IC[th.s] || '✦'}`), h('div', { class: 'ic-n' }, nameOf(code)), h('div', { class: 'ic-l' }, th.line), cc && cc.attack != null ? h('div', { class: 'ic-atk' }, `ATK ${cc.attack < 0 ? '?' : cc.attack}`) : null));
    let fin = false; const done = () => { if (fin) return; fin = true; el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 260); };
    host.append(el); if (th.s === 'god' || th.s === 'dragon') host.classList.add('ic-shake'); setTimeout(() => host.classList.remove('ic-shake'), 700);
    try { if (navigator.vibrate && store.get('sound', true)) navigator.vibrate(th.s === 'god' ? [40, 60, 80] : 30); } catch (e) { /* */ }
    setTimeout(done, ms);
  });
}
if (typeof window !== 'undefined') window.__iconic = playIconic;
