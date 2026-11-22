// Duell-Akademie: fünf kurze Lektionen mit fester Hand und festem Feld. Die Begleiterin sagt jeden Schritt an;
// am Ende gibt es Sterne, ab zwei Sternen eine Belohnung (Hülle, Feld oder Titel).
import { h, toast } from './util.js';
import { withTutor, nameOf } from './data.js';
import { go, screens, back } from './nav.js';
import { store } from './store.js';
import { openModal } from './ui.js';
import { artEl } from './home.js';
import { settings } from './screens.js';
import { unlock } from './look.js';

const MZ = 4, ATK = 1; // Monsterzone, offene Angriffsposition
const deck = (main, extra = []) => ({ id: 'akademie', name: 'Akademie-Deck', fmt: 'advanced', list: 'none', status: 'ok', main: main.map(([c, n]) => [c, n]), extra: extra.map(([c, n]) => [c, n]) });
const FILL = [[32864, 6], [15025844, 6], [89631139, 3], [46986414, 3]]; // harmlose normale Monster als Rest des Decks
const C = { alex: 43096270, luster: 11091375, celtic: 91152256, mirror: 44095762, rota: 32807846, ash: 14558127, poly: 24094653, wing: 35809262, avian: 21844576, burst: 58932615, proxy: 22862454, gaia: 6368038, elf: 15025844 };

export const LESSONS = [
  { id: 1, t: 'Beschwören & Angreifen', art: 46986414, reward: { k: 'ak1', t: 'Hülle „Kirschblüte“' },
    text: 'Du bist am Zug. Auf deinem Feld steht schon «Schimmerdrache» (1900 ATK), der Gegner hat «Keltischer Wächter» (1400 ATK). Beschwöre «Alexandrit-Drache» aus deiner Hand und greif dann an: Zerstöre das gegnerische Monster und triff den Gegner direkt.',
    goal: '★ Schaden gemacht · ★★ Monster des Gegners zerstört · ★★★ zerstört und mindestens 2500 Schaden',
    setup: () => ({ me: 1, mode: 'solo', decks: [deck([[C.celtic, 2], ...FILL]), deck([[C.alex, 2], ...FILL])], stack: [[], [C.alex]], field: [[1, C.luster, MZ, 1, ATK], [0, C.celtic, MZ, 2, ATK]] }),
    endTurn: 3,
    stars: (D) => { const op = D.snap.players[0]; const dmg = (D.conf.lp || 8000) - D.snap.lp[0]; const mons = op.mzone.filter(Boolean).length; return mons === 0 && dmg >= 2500 ? 3 : mons === 0 ? 2 : dmg > 0 ? 1 : 0; },
    tip: (D, msg, kind) => {
      if (kind === 'idle') { const a = find(D, C.alex, 'summon'); if (a) return { keys: [a.key], kind: 'summon', text: 'Beschwöre zuerst «Alexandrit-Drache»: Er ist Stufe 4 und braucht deshalb kein Opfer. 2000 ATK sind stark!' };
        if (msg.to_bp) return { keys: [], bp: true, text: 'Jetzt hast du zwei starke Monster. Gehe in die Kampfphase!' }; }
      if (kind === 'battle') { const L = msg.attacks || []; const lu = L.find((x) => x.code === C.luster); const al = L.find((x) => x.code === C.alex);
        if (lu && D.snap.players[0].mzone.some(Boolean)) return { keys: [kk(lu)], text: 'Greif mit «Schimmerdrache» den «Keltischen Wächter» an: 1900 ist mehr als 1400 – der Wächter wird zerstört und der Gegner verliert 500 LP.' };
        if (al) return { keys: [kk(al)], text: 'Der Weg ist frei! «Alexandrit-Drache» greift direkt an – 2000 Schaden.' };
        if (msg.to_ep) return { keys: [], ep: true, text: 'Alle Angriffe sind erledigt. Beende deinen Zug.' }; }
      return null;
    } },
  { id: 2, t: 'Fallen & Verteidigung', art: 44095762, reward: { k: 'ak2', t: 'Spielfeld „Eispalast“' },
    text: 'Fallen setzt du verdeckt – im Zug des Gegners schnappen sie zu. Setze «Spiegelkraft» und beende deinen Zug. Greift der Gegner an, aktivierst du sie: Alle seine Monster in Angriffsposition werden zerstört.',
    goal: '★ Falle gesetzt · ★★ ein Monster zerstört · ★★★ alle Angreifer zerstört',
    setup: () => ({ me: 0, mode: 'ai', level: 'normal', decks: [deck([[C.mirror, 2], ...FILL]), deck([[C.gaia, 2], [C.celtic, 2], ...FILL])], stack: [[C.mirror], []], field: [[1, C.gaia, MZ, 1, ATK], [1, C.celtic, MZ, 3, ATK]] }),
    endTurn: 3,
    stars: (D) => { const op = D.snap.players[1]; const n = op.mzone.filter(Boolean).length; const used = (D.rec && D.rec.plays[0].has(C.mirror)); return used && n === 0 ? 3 : used ? 2 : D.akSet ? 1 : 0; },
    tip: (D, msg, kind) => {
      if (kind === 'idle') { const a = find(D, C.mirror, 'spellset'); if (a) return { keys: [a.key], kind: 'spellset', text: 'Setze «Spiegelkraft» verdeckt in deine Zauber- & Fallenzone. Der Gegner sieht nicht, was es ist!' };
        if (msg.to_ep) return { keys: [], ep: true, text: 'Gut! Beende jetzt deinen Zug – und warte, bis der Gegner angreift.' }; }
      if (kind === 'chain' && (msg.selects || []).some((s) => s.code === C.mirror)) return { keys: [], text: 'Der Gegner greift an – jetzt! Aktiviere «Spiegelkraft»: Alle seine Monster in Angriffsposition werden zerstört.', pick: C.mirror };
      return null;
    } },
  { id: 3, t: 'Ketten verstehen', art: 14558127, reward: { k: 'ak3', t: 'Titel „Kettenprofi“' },
    text: 'Der Gegner ist zuerst dran und will mit «Verstärkung für die Armee» eine Karte suchen. Du hast «Aschenblüte & Freudiger Frühling» auf der Hand: Wirf sie ab, wenn er die Karte aktiviert – sie kommt in der Kette nach ihm und wirkt deshalb zuerst. Seine Suche wird negiert!',
    goal: '★★★ Suche des Gegners mit Aschenblüte negiert',
    setup: () => ({ me: 1, mode: 'ai', level: 'normal', decks: [deck([[C.rota, 3], [C.celtic, 3], [89631139, 6], [46986414, 6], [6368038, 4]]), deck([[C.ash, 2], ...FILL])], stack: [[C.rota], [C.ash]], field: [] }),
    endTurn: 2,
    stars: (D) => (D.rec && D.rec.plays[1].has(C.ash) && D.akNeg ? 3 : D.rec && D.rec.plays[1].has(C.ash) ? 2 : 0),
    tip: (D, msg, kind) => { if (kind === 'chain' && (msg.selects || []).some((s) => s.code === C.ash)) return { keys: [], text: 'Jetzt! Der Gegner will eine Karte aus dem Deck suchen. Antworte mit «Aschenblüte» – sie kommt als Kettenglied 2 und wirkt zuerst: Die Suche wird negiert.', pick: C.ash }; return null; } },
  { id: 4, t: 'Fusion', art: 35809262, reward: { k: 'ak4', t: 'Hülle „Sternenstaub“' },
    text: 'Mit «Polymerisation» verschmilzt du zwei Monster zu einem stärkeren aus dem Extradeck. Aktiviere Polymerisation und wähle «Elementar-HELD Avian» und «Elementar-HELD Burstinatrix» als Material – heraus kommt «Elementar-HELD Flammenflügelmann».',
    goal: '★★★ Flammenflügelmann auf dem Feld',
    setup: () => ({ me: 0, mode: 'solo', decks: [deck([[C.poly, 2], [C.avian, 2], [C.burst, 2], ...FILL], [[C.wing, 1]]), deck(FILL)], stack: [[C.poly, C.avian, C.burst], []], field: [] }),
    endTurn: 2,
    stars: (D) => (D.snap.players[0].mzone.some((c) => c && c.code === C.wing) ? 3 : D.rec && D.rec.plays[0].has(C.poly) ? 1 : 0),
    tip: (D, msg, kind) => { if (kind === 'idle') { const a = find(D, C.poly, 'activate'); if (a) return { keys: [a.key], kind: 'activate', text: 'Aktiviere «Polymerisation». Danach wählst du das Fusionsmonster und die zwei Materialien von deiner Hand.' };
      if (D.snap.players[0].mzone.some((c) => c && c.code === C.wing) && msg.to_ep) return { keys: [], ep: true, text: 'Geschafft! «Flammenflügelmann» ist da. Beende deinen Zug.' }; } return null; } },
  { id: 5, t: 'Link-Beschwörung', art: 22862454, reward: { k: 'ak5', t: 'Spielfeld „Rosengarten“' },
    text: 'Für eine Link-Beschwörung legst du Monster von deinem Feld auf den Friedhof und holst dafür ein Link-Monster aus dem Extradeck. «Proxydrache» braucht 2 Monster. Danach hast du sogar noch deine Normalbeschwörung frei!',
    goal: '★★ Proxydrache auf dem Feld · ★★★ und danach noch ein Monster beschworen',
    setup: () => ({ me: 0, mode: 'solo', decks: [deck([[C.luster, 2], ...FILL], [[C.proxy, 1]]), deck(FILL)], stack: [[C.luster], []], field: [[0, C.celtic, MZ, 1, ATK], [0, C.elf, MZ, 3, ATK]] }),
    endTurn: 2,
    stars: (D) => { const mz = D.snap.players[0].mzone; const link = mz.some((c) => c && c.code === C.proxy); return link && mz.some((c) => c && c.code === C.luster) ? 3 : link ? 2 : 0; },
    tip: (D, msg, kind) => { if (kind !== 'idle') return null; const has = D.snap.players[0].mzone.some((c) => c && c.code === C.proxy); const p = !has && find(D, C.proxy, 'special'); if (p) return { keys: [p.key], kind: 'special', text: 'Tippe auf dein Extradeck und beschwöre «Proxydrache»: Wähle «Keltischer Wächter» und «Mystische Elfe» als Link-Material.' };
      const l = find(D, C.luster, 'summon'); if (l) return { keys: [l.key], kind: 'summon', text: 'Super – jetzt hast du deine Normalbeschwörung noch frei. Beschwöre «Schimmerdrache»!' };
      if (msg.to_ep) return { keys: [], ep: true, text: 'Klasse! Beende deinen Zug.' }; return null; } },
];
const kk = (x) => `${x.controller}:${x.location}:${x.sequence}`;
function find(D, code, kind) { for (const [key, L] of D.acts || []) for (const a of L) if (a.code === code && a.kind === kind) return { key, a }; return null; }

export const progress = () => store.get('academy', {});
export const lessonOf = (D) => LESSONS.find((l) => l.id === D.conf.lesson);
export function lessonTip(D, msg, kind) { const L = lessonOf(D); if (!L) return null; try { return L.tip(D, msg, kind); } catch (e) { return null; } }

export function startLesson(L) {
  const S = L.setup(); const me = S.me; const names = [settings.names[0] || 'Du', 'Übungsgegner']; const P = me === 0 ? names : [names[1], names[0]];
  go('duel', { fmt: 'advanced', list: 'none', mode: S.mode, level: S.level || 'normal', lesson: L.id, players: [{ name: P[0], deck: withTutor(S.decks[0]) }, { name: P[1], deck: withTutor(S.decks[1]) }], human: me === 0 ? [true, false] : [false, true], lp: 8000, stack: S.stack, field: S.field, tutor: true, noIntro: true });
}
/** wird nach jedem Schritt aufgerufen – am Ende der Lektion Sterne vergeben */
export function lessonCheck(D) {
  const L = lessonOf(D); if (!L || D.akDone || !D.snap) return false;
  if ((D.turnNo || 0) < L.endTurn) return false;
  D.akDone = true; const st = L.stars(D); const P = progress(); const best = Math.max(P[L.id] || 0, st); P[L.id] = best; store.set('academy', P);
  const fresh = st >= 2 && unlock(L.reward.k); const next = LESSONS.find((x) => x.id === L.id + 1);
  const body = h('div', { class: 'win-b' }, h('div', { class: 'ak-stars' }, [1, 2, 3].map((i) => h('span', { class: i <= st ? 'on' : '' }, '★'))), h('h2', { class: 'title-glow' }, st >= 2 ? 'Lektion geschafft!' : st === 1 ? 'Fast!' : 'Noch nicht ganz'),
    h('p', { class: 'muted' }, L.goal), fresh ? h('p', { class: 'ak-rew' }, `🎁 Neu freigeschaltet: ${L.reward.t}`, h('br'), h('span', { class: 'small muted' }, L.reward.k === 'ak3' ? 'Dein Titel steht jetzt im Hauptmenü.' : 'Zu finden unter Optionen → Aussehen.')) : null);
  const m = openModal({ host: D.root, title: '', center: true, cls: 'win', body, footer: [h('button', { class: 'btn ghost', onclick: () => { m.close(); D.destroy(); go('academy'); } }, 'Zur Akademie'), h('button', { class: 'btn', onclick: () => { m.close(); D.destroy(); startLesson(L); } }, 'Nochmal'), next && st >= 1 ? h('button', { class: 'btn pri', onclick: () => { m.close(); D.destroy(); startLesson(next); } }, 'Nächste Lektion ›') : null].filter(Boolean) });
  D.stopped = true; return true;
}
export function lessonIntro(D) {
  const L = lessonOf(D); if (!L) return Promise.resolve();
  return new Promise((res) => { const m = openModal({ host: D.root, title: `🎓 Lektion ${L.id} · ${L.t}`, center: true, body: h('div', null, h('p', { class: 'tut-g' }, L.text), h('p', { class: 'small muted' }, L.goal)), footer: h('button', { class: 'btn pri', onclick: () => { m.close(); res(); } }, 'Los geht’s'), onClose: res }); });
}

screens.academy = () => {
  const P = progress(); const cur = LESSONS.find((l) => !(P[l.id] >= 1)) || LESSONS[LESSONS.length - 1]; let sel = cur;
  const side = h('div', { class: 'ak-side nx-pn' });
  const paintSide = () => {
    side.replaceChildren(h('div', { class: 'ak-ar' }, artEl(sel.art, 'ak-ari')), h('div', { class: 'nx-lbl' }, `Lektion ${sel.id}`), h('h3', null, sel.t), h('p', null, sel.text),
      h('div', { class: 'ak-rw' }, h('span', null, '🎁 ', sel.reward.t), h('span', { class: 'ak-st' }, [1, 2, 3].map((i) => h('i', { class: i <= (P[sel.id] || 0) ? 'on' : '' }, '★')))),
      h('button', { class: 'nx-btn', onclick: () => { if (sel.id > 1 && !(P[sel.id - 1] >= 1)) { toast('Schließe zuerst die Lektion davor ab.'); return; } startLesson(sel); } }, '▶ Lektion starten'));
  };
  const POS = [[4, 8], [36, 44], [70, 10], [62, 70], [14, 70]];
  const map = h('div', { class: 'ak-map' }, h('div', { class: 'ak-line' }), LESSONS.map((L, i) => {
    const st = P[L.id] || 0; const lock = L.id > 1 && !(P[L.id - 1] >= 1);
    const n = h('button', { class: 'ak-nd' + (st >= 1 ? ' done' : '') + (L === cur ? ' cur' : '') + (lock ? ' lock' : ''), style: `left:${POS[i][0]}%;top:${POS[i][1]}%`, onclick: () => { sel = L; paintSide(); } },
      h('div', { class: 'ak-c' }, artEl(L.art, 'ak-ci')), h('div', { class: 'ak-s' }, st ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''), h('div', { class: 'ak-t' }, `${L.id} · ${L.t}`));
    return n;
  }));
  paintSide();
  return h('div', { class: 'screen nx ak' }, h('div', { class: 'nx-bg' }), h('div', { class: 'nx-head' }, h('div', { class: 'bar' }), h('div', null, h('h1', null, 'Duell-Akademie'), h('p', null, 'Kurze Lektionen mit vorbereiteter Hand · 2–3 Minuten'))),
    h('button', { class: 'nx-x', onclick: () => back() }, '✕'), map, side);
};
export const hasTitle = () => !!(store.get('unlocks', {}).ak3);

if (typeof window !== 'undefined') window.__ak = { LESSONS, startLesson };
