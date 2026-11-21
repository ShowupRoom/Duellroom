// Findet im Kartentext die Stelle, die zu einem aktivierten Effekt gehört, und markiert sie.
// Ablauf: Text in Effekt-Abschnitte teilen → mit Effekt-Kurztext (strN), Herkunftsort und Kartenart vergleichen → nur bei klarem Ergebnis markieren.
import { App, useDe, descOf } from './data.js';
import { LOC } from '../../src/core.mjs';
import { h } from './util.js';

const PHEAD = /^\[\s*(Pendulum Effect|Pendeleffekt)/i, MHEAD = /^\[\s*(Monster Effect|Monstereffekt)/i;
const SKIP = /^(-{5,}|Pendelbereich\s*=|Pendulum Scale\s*=)/i;
const HOUSE_EN = /^(\*|You can only\b[^:;]*$)/i;
const HOUSE_DE = /^Du kannst (?:nur\b|(?:diesen|jeden|jede|jedes|dieses|diese)\b[^:;]*\bnur\b)[^:;]*$/;
// Satzanfänge, die einen neuen Effekt beginnen (englischer Text liegt ohne Zeilenumbrüche vor)
const OPEN_EN = /^(You can|You may|You must|You cannot|Once per|During|When|While|At the|Each time|Cannot|Your opponent|Neither|Quick|If (?:this|a|an|your|you (?:control|Normal|Special|have|Fusion|Synchro|Xyz|Link|Ritual|activate|take)|the|there|another|any|it)\b)/;
const STOP_EN = new Set('the this that from your with card cards and for one per turn you can its only using activate affected when will then also each other either both are not has have all any may must into onto'.split(' '));
const STOP_DE = new Set('die der das den dem des von deiner deinem deinen deine dein dieser diese dieses diesen mit und für eine einen einem einer pro spielzug kannst kann nur auch dann wenn falls aktivieren aktiviert aktiviere'.split(' '));
const SYN_EN = { search: ['add'], revive: ['special'], recycle: ['shuffle', 'return'], mill: ['send'], summon: ['summon'] };
const SYN_DE = { such: ['hinzu', 'füge'], suche: ['hinzu', 'füge'], platz: ['lege', 'platz'], aufde: ['aufgedeckt', 'umdreh'], tausc: ['wechs', 'tausch'], ände: ['änder', 'wechs'], zähle: ['zählmarke'] };

const clean = (t) => (t || '').replace(/\r/g, '');

/** Satzgrenzen innerhalb einer Zeile (ohne Rückwärtssuche, damit es auch auf älteren iPhones läuft) */
function sentences(t, s0) {
  const out = []; const re = /[.!?)"”]\s+(?=[A-ZÄÖÜ„“])/g; let from = 0, m;
  while ((m = re.exec(t))) { out.push([s0 + from, s0 + m.index + 1]); from = m.index + m[0].length; }
  out.push([s0 + from, s0 + t.length]); return out;
}

/** Text → Abschnitte {s,e,house,sec,line}; Offsets beziehen sich auf den Text selbst */
export function split(text, lang) {
  const out = []; let pos = 0, sec = null, prev = null, line = 0;
  for (const raw of text.split('\n')) {
    line++; const lead = raw.length - raw.replace(/^\s+/, '').length; const t = raw.trim(); const s0 = pos + lead; const e0 = s0 + t.length; pos += raw.length + 1;
    if (!t) continue;
    if (PHEAD.test(t)) { sec = 'p'; prev = null; continue; }
    if (MHEAD.test(t)) { sec = 'm'; prev = null; continue; }
    if (SKIP.test(t)) { prev = null; continue; }
    if (t[0] === '●' && prev) { prev.e = e0; continue; }
    const parts = lang === 'en' ? sentences(t, s0) : [[s0, e0]];
    for (const [a, b] of parts) {
      const tx = text.slice(a, b).trim(); if (!tx) continue;
      const house = lang === 'en' ? HOUSE_EN.test(tx) : HOUSE_DE.test(tx);
      if (lang === 'en' && prev && prev.line === line && !prev.house && !house && !(tx.includes(':') || OPEN_EN.test(tx))) { prev.e = b; continue; }
      prev = { s: a, e: b, house, sec, line }; out.push(prev);
    }
  }
  return out;
}

const words = (t) => t.toLowerCase().match(/[a-zäöüß0-9]+/g) || [];
/** Längste Wortfolge, die im Effekt-Kurztext und im Abschnitt gleich aufeinander folgt (Wortanfänge verglichen) */
function longestRun(a, b) {
  const x = a.map((w) => w.slice(0, 6)), y = b.map((w) => w.slice(0, 6)); let best = 0; let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) { const cur = new Array(y.length + 1).fill(0); for (let j = 1; j <= y.length; j++) if (x[i - 1] === y[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; } prev = cur; }
  return best;
}
function labelStems(label, lang) {
  const stop = lang === 'de' ? STOP_DE : STOP_EN; const syn = lang === 'de' ? SYN_DE : SYN_EN; const set = new Set();
  for (const w of words(label.replace(/[„“"«»][^„“"«»]*[„“"«»]/g, ' '))) {
    if (w.length < 4 || stop.has(w)) continue; set.add(w.slice(0, 6));
    if (lang === 'de') { for (const k of Object.keys(syn)) if (w.startsWith(k)) for (const x of syn[k]) set.add(x); } else for (const x of syn[w] || []) set.add(x.slice(0, 6));
  }
  return [...set];
}

const HAND_COST = { en: /this card from your hand|from your hand|discard this card/i, de: /von deiner Hand|diese Karte ab|abwerfen/i };
const HAND_SELF = { en: /this card from your hand/i, de: /diese Karte von deiner Hand/i };
const GY_SELF = { en: /\bthis card (?:in|from) your GY\b|\bthis card is in your GY\b|\bif this card is sent to the GY\b|\bthis card in the GY\b/i, de: /diese Karte (?:in|aus|von) deinem Friedhof|diese Karte [^;:]{0,24}Friedhof (?:liegt|ist)|falls diese Karte auf den Friedhof gelegt wird|wenn diese Karte auf den Friedhof gelegt wird/i };
const REM_SELF = { en: /this card (?:is|are) banished|if this card is banished|while this card is banished/i, de: /diese Karte verbannt (?:ist|wird|wurde)|solange diese Karte verbannt/i };
const clause = (t) => { const i = t.search(/[:;]/); return i < 0 ? t : t.slice(0, i); };

function locScore(tx, lang, loc) {
  if (!loc) return 0; const cl = clause(tx); let s = 0;
  const hand = HAND_COST[lang].test(cl);
  if (loc === LOC.HAND) s += hand ? 1.5 : 0; else if (HAND_SELF[lang].test(cl)) s -= 1;
  const gy = GY_SELF[lang].test(cl) && !hand;
  if (loc === LOC.GRAVE) s += gy ? 2 : -0.3; else if (gy) s -= 1.5;
  const rem = REM_SELF[lang].test(cl);
  if (loc === LOC.REMOVED) s += rem ? 2 : -0.3; else if (rem) s -= 1;
  return s;
}

/** Abschnitt in der Anzeigesprache zum Abschnitt der Wertungssprache: gleiche Anzahl → gleiche Stelle */
function mapIdx(base, disp, i) {
  if (base.length === disp.length) return i;
  const nb = base.filter((u) => !u.house), nd = disp.filter((u) => !u.house);
  if (nb.length !== nd.length) return -1;
  const k = nb.indexOf(base[i]); return k < 0 ? -1 : disp.indexOf(nd[k]);
}

// Englisches Stichwort des Kurztexts → Wortteile im deutschen Kartentext (Notlösung, wenn englischer und deutscher Text nicht Abschnitt für Abschnitt zusammenpassen)
const DICT = {
  special: ['spezial'], summon: ['beschw'], normal: ['normal'], fusion: ['fusion'], synchro: ['synchro'], xyz: ['xyz'], link: ['link'], ritual: ['ritual'], pendulum: ['pendel'], tribute: ['tribut'],
  search: ['hinzu'], add: ['hinzu'], draw: ['zieh'], destroy: ['zerst'], banish: ['verbann'], negate: ['annull'], discard: ['abwerf'], send: ['friedhof'], target: ['wähl'], damage: ['schaden'],
  recover: ['lp'], gain: ['lp'], attack: ['angriff'], position: ['position'], equip: ['ausrüst'], counter: ['zählmarke'], return: ['zurück'], shuffle: ['misch'], level: ['stufe'], token: ['spielmarke'],
  control: ['kontrollier'], flip: ['umdreh', 'aufgedeckt'], monster: ['monster'], spell: ['zauber'], trap: ['falle'], deck: ['deck'], hand: ['hand'], field: ['spielfeld'], reveal: ['vorzeig', 'aufdeck'],
  detach: ['abhäng'], attach: ['material'], material: ['material'], reduce: ['reduzier', 'verring'], increase: ['erhöh'], halve: ['halb'], skip: ['überspring'], declare: ['nenn', 'deklarier'], activate: ['aktivier'],
  set: ['setz'], copy: ['kopier'], pay: ['zahl'], lose: ['verlier'], change: ['änder', 'wechs'], atk: ['atk'], def: ['def'], graveyard: ['friedhof'],
};
function dictStems(label) {
  const set = new Set();
  for (const w of words(label.replace(/[„“"«»][^„“"«»]*[„“"«»]/g, ' '))) { const k = DICT[w] ? w : w.replace(/(?:ed|es|s|ing)$/, ''); for (const x of DICT[k] || []) set.add(x); }
  return [...set];
}

const NORMALISH = (type) => type === 2 || type === 4 || type === 0x10002 || type === 0x100004 || type === 0x82;

/**
 * Effekt-Ansicht: { text, ranges } – ranges = markierte Bereiche im (bereinigten) Anzeigetext, leer wenn unsicher.
 * desc: Beschreibungsnummer des Kerns (Karten-Code*16 + Nr.), loc: Ort, von dem aus aktiviert wird
 */
export function effectView(code, desc, loc) {
  const c = App.cards.get(code); if (!c) return { text: '', ranges: [] };
  const text = clean(descOf(c)); const view = { text, ranges: [], why: '' };
  if (!text || (c.type & 1 && !(c.type & 0x1000000) && !/[:;]/.test(text) && text.length < 90)) return view; // Normalmonster / Flavortext
  const de = useDe() ? App.de.get(code) : null; const deOk = !!(de && de[1]);
  const dispLang = deOk ? 'de' : 'en';
  // Kurztexte des Effekts (strN), deutsch und englisch
  const d = Number(desc || 0); const lab = { en: '', de: '' };
  if (d >= 10000) {
    const sc = App.cards.get(Math.floor(d / 16)) || c; const idx = d % 16; const sd = useDe() ? App.de.get(sc.code) : null;
    lab.en = (sc.strs && sc.strs[idx]) || ''; lab.de = (sd && sd[2] && sd[2][idx]) || '';
  }
  const pend = !!(c.type & 0x1000000);
  const tryLang = (lang) => {
    const label = lab[lang]; const baseText = lang === 'de' ? clean(de[1]) : clean(c.desc); const base = split(baseText, lang);
    const hasSec = base.some((u) => u.sec);
    const elig = base.filter((u) => !u.house && (!hasSec || !pend || (loc === LOC.SZONE ? u.sec === 'p' : u.sec !== 'p')));
    if (!elig.length) return null;
    if (NORMALISH(c.type) || elig.length === 1) return { lang, base, elig, picks: elig, baseText };
    const stems = labelStems(label, lang);
    const scored = elig.map((u) => {
      const tx = baseText.slice(u.s, u.e); const ws = new Set(words(tx).map((w) => w.slice(0, 6))); const low = tx.toLowerCase();
      const m = stems.filter((s) => (lang === 'de' ? low.includes(s) : ws.has(s))).length; const run = label ? longestRun(words(label), words(tx)) : 0;
      return { u, sc: (stems.length ? 3 * m / stems.length : 0) + (run > 1 ? 0.8 * Math.min(run - 1, 5) : 0) + locScore(tx, lang, loc) };
    }).sort((a, b) => b.sc - a.sc);
    view.dbg = { label, lang, scores: scored.map((x) => [+x.sc.toFixed(2), baseText.slice(x.u.s, x.u.e).slice(0, 50)]) };
    if (scored[0].sc >= 1.4 && scored[0].sc - scored[1].sc >= 0.6) return { lang, base, elig, picks: [scored[0].u], baseText };
    return null;
  };
  // Es zählt der Kurztext, den auch die Anzeige nennt (deutsch, sonst englisch); die Zählung beider Datenbanken weicht bei manchen Karten voneinander ab
  const order = deOk && lab.de ? ['de'] : ['en'];
  let hit = null; for (const lg of order) { hit = tryLang(lg); if (hit) break; }
  if (!hit) { view.why = 'unsicher'; return view; }
  const { base, elig, picks, lang: baseLang } = hit;
  // in die Anzeigesprache übertragen
  let ranges;
  if (baseLang === dispLang) ranges = picks.map((u) => [u.s, u.e]);
  else {
    const disp = split(text, dispLang); ranges = [];
    for (const u of picks) { const k = mapIdx(base, disp, base.indexOf(u)); if (k < 0 || !disp[k]) { ranges = null; break; } ranges.push([disp[k].s, disp[k].e]); }
    if (!ranges) {
      // Notlösung: Stichworte des englischen Kurztexts direkt im deutschen Text suchen
      const stems = NORMALISH(c.type) ? [] : dictStems(lab.en); const lc = text.toLowerCase(); const hasSec2 = disp.some((u) => u.sec);
      const el2 = disp.filter((u) => !u.house && (!hasSec2 || !pend || (loc === LOC.SZONE ? u.sec === 'p' : u.sec !== 'p')));
      const sc2 = el2.map((u) => { const tx = lc.slice(u.s, u.e); const m = stems.filter((x) => tx.includes(x)).length; return { u, sc: (stems.length ? 3 * m / stems.length : 0) + locScore(text.slice(u.s, u.e), 'de', loc) }; }).sort((a, b) => b.sc - a.sc);
      if (sc2.length > 1 && stems.length && sc2[0].sc >= 1.8 && sc2[0].sc - sc2[1].sc >= 0.8) ranges = [[sc2[0].u.s, sc2[0].u.e]];
      else { view.why = 'Abschnitte passen nicht'; return view; }
    }
  }
  // Wenn fast der ganze Text markiert wäre, sagt die Markierung nichts mehr
  const body = split(text, dispLang).filter((u) => !u.house).reduce((n, u) => n + (u.e - u.s), 0) || 1;
  const cov = ranges.reduce((n, [a, b]) => n + (b - a), 0);
  if (cov / body > 0.85 && !(elig.length === 1 && pend)) { view.why = 'ganzer Text'; return view; }
  view.ranges = ranges.sort((a, b) => a[0] - b[0]); return view;
}

/** Mehrere Ansichten derselben Karte (z. B. zwei mögliche Aktivierungen) zusammenfassen */
export function mergeViews(views) {
  const vs = views.filter(Boolean); if (!vs.length) return null;
  const all = [].concat(...vs.map((v) => v.ranges || [])).sort((a, b) => a[0] - b[0]);
  const merged = []; for (const r of all) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push([r[0], r[1]]); }
  return { text: vs[0].text, ranges: merged };
}

/** Kartentext als DOM-Knoten, markierte Stellen als <mark>. */
export function markNode(view) {
  if (!view || !view.ranges || !view.ranges.length) return document.createTextNode(view ? view.text : '');
  const kids = []; let at = 0;
  for (const [a, b] of view.ranges) { if (a > at) kids.push(view.text.slice(at, a)); kids.push(h('mark', { class: 'fx-mark' }, view.text.slice(a, b))); at = b; }
  if (at < view.text.length) kids.push(view.text.slice(at));
  return h('span', null, kids);
}

/** Ganzer Kartentext mit Markierung, in eigener Box (im Querformat sichtbar, dort ist Platz zum Lesen) */
export function fullNode(view) {
  if (!view || !view.text) return null;
  return h('div', { class: 'fx-full' }, markNode(view));
}

/** Nur die markierte Stelle (gekürzt) */
export function excerptNode(view, max = 180) {
  if (!view || !view.ranges || !view.ranges.length) return null;
  let t = view.ranges.map(([a, b]) => view.text.slice(a, b).replace(/\s+/g, ' ').trim()).join(' … ');
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …';
  return h('mark', { class: 'fx-mark' }, t);
}

/** Scrollt eine Textbox so, dass die erste Markierung sichtbar ist */
export function revealMark(box) {
  const mk = box && box.querySelector && box.querySelector('mark.fx-mark'); if (!mk) return;
  const dy = mk.getBoundingClientRect().top - box.getBoundingClientRect().top; if (dy > 6 || dy < 0) box.scrollTop = Math.max(0, box.scrollTop + dy - 6);
}
