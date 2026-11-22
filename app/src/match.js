// Match (Best of 3) mit Sidedeck: Nach jedem Spiel tauschen die Spieler Karten zwischen Haupt-/Extradeck und Sidedeck,
// der Verlierer entscheidet, wer beginnt. Vor dem Match lässt sich das Sidedeck frei aus allen Karten der Banlist aufbauen.
import { h, clear, toast } from './util.js';
import { FORMATS, fmtById, cardOf, nameOf, count, App, searchName } from './data.js';
import { cardEl } from './cards.js';
import { showCard, openModal, confirmBox } from './ui.js';
import { go, back, screens, root as navRoot } from './nav.js';
import { allowed, validate, isExtra } from '../../src/decks.mjs';
import { poolFor } from './editor.js';

const clone = (l) => (l || []).map(([c, n]) => [c, n]);
const put = (l, c) => { const e = l.find((x) => x[0] === c); if (e) e[1]++; else l.push([c, 1]); };
const take = (l, c) => { const e = l.find((x) => x[0] === c); if (!e) return false; e[1]--; if (e[1] <= 0) l.splice(l.indexOf(e), 1); return true; };
const copy = (d) => ({ ...d, main: clone(d.main), extra: clone(d.extra), side: clone(d.side) });

/** Match starten. base = Duell-Einstellungen ohne Spieler; sides = [{name, deck, human}] in der Reihenfolge der Einrichtung; first = Seite, die Spiel 1 beginnt */
export function beginMatch(base, sides, first) {
  const M = { need: 2, base, sides, wins: [0, 0], game: 1, first, start: null, over: false };
  sideRound(M, 'pre', () => { M.start = M.sides.map((s) => copy(s.deck)); playGame(M, first === 1 ? [1, 0] : [0, 1]); });
}
function playGame(M, order) {
  navRoot('duel', { ...M.base, players: order.map((i) => ({ name: M.sides[i].name, deck: M.sides[i].deck })), human: order.map((i) => M.sides[i].human), match: { M, order }, seed: undefined, stack: undefined, field: undefined });
}
/** Alle menschlichen Spieler nacheinander ans Sidedeck lassen (am Gerät mit Übergabe-Hinweis) */
function sideRound(M, mode, done) {
  const who = [0, 1].filter((i) => M.sides[i].human); let k = 0;
  const next = () => { if (k >= who.length) { done(); return; } const i = who[k++]; go('siding', { M, i, mode, hand: who.length > 1, next }); };
  next();
}

/** Siegerfenster im Duell: Spielstand, dann Side Decking und nächstes Spiel – oder Match-Ende */
export function matchModal(D, winner, reason) {
  const { M, order } = D.conf.match; const draw = winner == null || winner > 1; const ws = draw ? null : order[winner];
  if (ws !== null) M.wins[ws]++;
  const nm = (i) => M.sides[i].name; const done = M.wins.some((w) => w >= M.need); M.over = done;
  const stand = `${nm(0)} ${M.wins[0]} : ${M.wins[1]} ${nm(1)}`;
  const title = draw ? 'Unentschieden – das Spiel wird wiederholt' : done ? `${nm(ws)} gewinnt das Match!` : `${nm(ws)} gewinnt Spiel ${M.game}`;
  const body = h('div', { class: 'win-b' }, h('div', { class: 'win-ic' }, done ? '🏆' : draw ? '🤝' : '⚔'), h('h2', { class: 'title-glow' }, title), h('div', { class: 'match-score' }, stand), h('p', { class: 'muted' }, reason), h('p', { class: 'small muted' }, done ? `Best of 3 · ${M.game} Spiele gespielt` : `Best of 3 · Sieger ist, wer zuerst 2 Spiele gewinnt`));
  const menu = h('button', { class: 'btn ghost', onclick: () => { D.destroy(); navRoot('home'); } }, 'Zum Menü');
  if (done) { openModal({ host: D.root, title: '', center: true, cls: 'win', body, footer: [menu, h('button', { class: 'btn pri', onclick: () => { D.destroy(); rematch(M); } }, '↻ Neues Match')] }); return; }
  M.game++;
  openModal({ host: D.root, title: '', center: true, cls: 'win', body, footer: [menu, h('button', { class: 'btn pri', onclick: () => {
    D.destroy();
    sideRound(M, 'between', async () => {
      let ord = order; // gleiche Reihenfolge, wenn niemand verloren hat
      if (!draw) { const loser = order[1 - winner]; ord = M.sides[loser].human ? ((await confirmBox('Wer beginnt?', `${nm(loser)} hat verloren und entscheidet.`, 'Ich beginne', 'Gegner beginnt')) ? [loser, ws] : [ws, loser]) : [loser, ws]; }
      playGame(M, ord);
    });
  } }, 'Weiter: Side Decking ›')] });
}
function rematch(M) { M.wins = [0, 0]; M.game = 1; M.over = false; M.sides.forEach((s, i) => { s.deck = copy(M.start[i]); }); playGame(M, M.first === 1 ? [1, 0] : [0, 1]); }

// ---- Side-Decking-Bildschirm ----------------------------------------------------------------------------------------
screens.siding = ({ M, i, mode, hand, next }) => {
  const side = M.sides[i]; const fid = M.base.fmt; const fmt = fmtById(fid, M.base.list); const F = FORMATS[fid]; const pre = mode === 'pre';
  const S = copy(side.deck); const want = count(S.side); let info = false, q = '', covered = !!hand && !pre || (!!hand && pre && i === 1);
  const root = h('div', { class: 'screen md-pg' }, h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: () => { if (pre) back(); else toast('Das Side Decking gehört zum Match – tippe auf „Fertig“.'); }, 'aria-label': 'Zurück' }, '←'),
    h('h2', null, pre ? 'Sidedeck bauen' : `Side Decking · Spiel ${M.game}`, h('div', { class: 'sub' }, `${side.name} · ${side.deck.name}`))));
  const body = h('div', { class: 'body' }), foot = h('div', { class: 'ft' }); root.append(body, foot);
  const nMain = () => count(S.main), nExtra = () => count(S.extra), nSide = () => count(S.side);
  const total = (c) => [S.main, S.extra, S.side].reduce((n, l) => n + (l.find((x) => x[0] === c) || [0, 0])[1], 0);
  const issues = () => { const o = validate({ main: S.main, extra: S.extra, side: S.side }, fmt, App.cards, App.lists); if (!pre && want > 0 && nSide() !== want) o.unshift(`Das Sidedeck muss wieder ${want} Karten haben (jetzt ${nSide()}).`); return o; };
  const card = (c, z) => h('button', { class: 'sd-c', onclick: () => tap(c, z) }, cardEl(c, { cls: 'sm' }));
  const grid = (z) => { const l = [...S[z]].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]))); return h('div', { class: 'sd-grid' }, l.length ? l.flatMap(([c, n]) => Array.from({ length: n }, () => card(c, z))) : h('div', { class: 'muted small', style: 'grid-column:1/-1;padding:8px' }, z === 'side' ? (pre ? 'Noch leer – such unten Karten aus und tippe sie an.' : 'Das Sidedeck ist leer.') : '–')); };
  const tap = (c, z) => {
    if (info) { showCard(c); return; }
    if (z === 'side') { const ex = isExtra(cardOf(c)); take(S.side, c); put(ex ? S.extra : S.main, c); }
    else { if (nSide() >= F.maxSide) { toast(`Das Sidedeck ist voll (${F.maxSide} Karten).`); return; } take(S[z], c); put(S.side, c); }
    paint();
  };
  const addFromPool = (c) => { if (info) { showCard(c); return; } if (nSide() >= F.maxSide) { toast(`Das Sidedeck ist voll (${F.maxSide} Karten).`); return; } if (total(c) >= allowed(c, fmt, App.lists)) { toast(allowed(c, fmt, App.lists) === 0 ? 'Diese Karte ist in dieser Banlist verboten.' : `Mehr als ${allowed(c, fmt, App.lists)} Kopie(n) sind nicht erlaubt.`); return; } put(S.side, c); paint(); };
  const poolBox = () => {
    if (!pre) return null; const list = h('div', { class: 'sd-grid' }); const draw = () => { clear(list); const t = q.trim().toLowerCase(); if (t.length < 2) { list.append(h('div', { class: 'muted small', style: 'grid-column:1/-1;padding:6px' }, 'Tippe mindestens 2 Buchstaben (deutsch oder englisch).')); return; } for (const e of poolFor(fid).filter((x) => x.ln.includes(t)).slice(0, 60)) list.append(h('button', { class: 'sd-c', onclick: () => addFromPool(e.c.code) }, cardEl(e.c.code, { cls: 'sm' }))); };
    const inp = h('input', { class: 'search', placeholder: 'Karte fürs Sidedeck suchen …', value: q, oninput: (e) => { q = e.target.value; draw(); } }); draw();
    return h('div', { class: 'panel col sd-z' }, h('b', null, 'Karten hinzufügen'), inp, list);
  };
  const paint = () => {
    clear(body); clear(foot);
    if (covered) { body.append(h('div', { class: 'wrap col', style: 'align-items:center;padding:30px 10px;text-align:center' }, h('div', { style: 'font-size:46px' }, '🤝'), h('h3', null, `${side.name} ist dran`), h('p', { class: 'muted' }, 'Gerät übergeben – die andere Person darf nicht mitschauen. Dann tippen.'), h('button', { class: 'btn pri lg', onclick: () => { covered = false; paint(); } }, 'Ich bin bereit'))); return; }
    const iss = issues(); const okMain = nMain() >= F.minMain && nMain() <= F.maxMain;
    body.append(h('div', { class: 'wrap col' },
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, h('span', { class: 'chip ' + (okMain ? 'ok' : 'bad') }, `Haupt ${nMain()} / ${F.minMain}–${F.maxMain}`), h('span', { class: 'chip' }, `Extra ${nExtra()}`), h('span', { class: 'chip ' + (!pre && want > 0 ? (nSide() === want ? 'ok' : 'bad') : '') }, `Side ${nSide()}${!pre && want > 0 ? ' / ' + want : ' / ' + F.maxSide}`),
        h('button', { class: 'chip' + (info ? ' on' : ''), onclick: () => { info = !info; paint(); } }, info ? 'ℹ Karteninfo: an' : 'ℹ Karteninfo: aus')),
      h('p', { class: 'muted small', style: 'margin:0 2px' }, pre ? 'Tippe eine Karte im Haupt- oder Extradeck, um sie ins Sidedeck zu legen, und eine Sidedeck-Karte, um sie zurückzulegen. Neue Karten suchst du unten.' : 'Tippe eine Karte, um sie zwischen Deck und Sidedeck zu tauschen. Am Ende muss das Deck wieder legal sein und das Sidedeck gleich groß bleiben.'),
      h('div', { class: 'sd-cols' }, h('div', { class: 'col' }, h('div', { class: 'panel sd-z' }, h('b', null, `Hauptdeck (${nMain()})`), grid('main')), h('div', { class: 'panel sd-z' }, h('b', null, `Extradeck (${nExtra()})`), grid('extra'))),
        h('div', { class: 'col' }, h('div', { class: 'panel sd-z sd-side' }, h('b', null, `Sidedeck (${nSide()})`), grid('side')), poolBox())),
      iss.length ? h('div', { class: 'panel', style: 'border-color:rgba(255,90,115,.6)' }, h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, iss.slice(0, 5).map((t) => h('li', null, t)))) : null));
    const ok = !iss.length;
    foot.append(pre ? h('button', { class: 'btn ghost', onclick: () => { side.deck = copy(side.deck); finish(true); } }, 'Ohne Sidedeck') : null,
      h('button', { class: 'btn pri lg grow', disabled: !ok, onclick: () => finish(false) }, ok ? '✓ Fertig – weiter' : 'Deck ist noch nicht legal'));
  };
  const finish = (skip) => { if (!skip) side.deck = { ...side.deck, main: S.main, extra: S.extra, side: S.side }; next(); };
  paint(); return root;
};
