// Duellbuch (eure Duelle gegeneinander, Höhepunkte zum Wiederansehen, Herausforderungen) und Karten-Album.
import { h, clear, toast } from './util.js';
import { App, allDecks, customDecks, withTutor, nameOf, cardOf } from './data.js';
import { go, screens, back } from './nav.js';
import { store } from './store.js';
import { openModal } from './ui.js';
import { cardEl } from './cards.js';
import { artEl, fav, pickCard } from './home.js';
import { settings } from './screens.js';
import { bookStats, replayConf, day, album, albumFav, challenges, addChallenge, challengeLink } from './record.js';
import { coverOf } from './onboard.js';

const head = (t, s) => h('div', { class: 'nx-head' }, h('div', { class: 'bar' }), h('div', null, h('h1', null, t), h('p', null, s)));
const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60} Min.`; };
const watch = (g) => { if (!g || !g.replay) { toast('Für dieses Duell ist keine Wiederholung gespeichert.'); return; } try { go('duel', replayConf(g)); } catch (e) { toast('Die Wiederholung konnte nicht geladen werden.'); } };
/** Wertung als freundliche Punktzahl (Kombo-Wertung kann negativ sein) */
const pts = (x) => Math.max(0, Math.round((x || 0) + 60));
const LIST_OF = { speed: 'speed', goat: 'goat', edison: 'edison', advanced: 'tcg', genesys: 'genesys' };

// ---- Duellbuch ---------------------------------------------------------------------------------------------------------
screens.book = () => {
  const S = bookStats(); const av2 = store.get('home.avatar2', 38033121);
  const pl = (nm, code, cls, deck, key) => h('div', { class: 'bk-p' }, h('button', { class: 'nx-av ' + cls, title: 'Bild ändern', style: 'width:78px;height:78px;margin:0 auto;display:block;border:0;cursor:pointer', onclick: () => pickCard('Profilbild für ' + nm, (c) => { store.set(key, c); go('book'); }) }, artEl(code)), h('b', null, nm), h('span', null, deck || ''));
  const favDeck = (nm) => { const c = {}; S.duo.forEach((g) => g.names.forEach((n, i) => { if (n === nm) c[g.decks[i]] = (c[g.decks[i]] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]).map((x) => x[0])[0]; };
  const n = S.duo.length; const next = [5, 10, 20, 50, 100].find((x) => x > n) || n + 50;
  const left = h('div', { class: 'bk-vs nx-pn' }, h('div', { class: 'nx-lbl' }, 'Gesamtstand · zu zweit'),
    h('div', { class: 'bk-duo' }, pl(S.n1, fav.avatar, '', favDeck(S.n1), 'home.avatar'), h('div', { class: 'bk-sc' }, h('div', { class: 'bk-v' }, String(S.w1), h('span', { style: 'opacity:.4' }, ' : '), h('span', { class: 'w' }, String(S.w2))), h('small', null, `${n} DUELL${n === 1 ? '' : 'E'}`)), pl(S.n2, av2, 'pk', favDeck(S.n2), 'home.avatar2')),
    h('div', { class: 'bk-st' },
      h('div', null, h('span', null, 'Längste Siegesserie'), h('b', null, S.streak.nm ? `${S.streak.nm} · ${S.streak.n} Sieg${S.streak.n === 1 ? '' : 'e'}` : '–')),
      h('div', null, h('span', null, 'Gemeinsam gespielt'), h('b', null, S.time ? dur(S.time) : '–')),
      h('div', null, h('span', null, 'Gegen die KI'), h('b', null, S.ai.n ? `${S.ai.w} von ${S.ai.n} gewonnen` : '–')),
      h('div', null, h('span', null, 'Nächster Meilenstein'), h('b', null, `${next} Duelle zu zweit (${n}/${next})`))),
    !n ? h('p', { class: 'bk-hint' }, 'Spielt ein Duell „Zu zweit“ (Duell → Zu zweit) oder online – dann zählt hier euer Stand.') : null);
  const T = S.top; const mom = (g, title, sub, code) => g ? h('div', { class: 'bk-m' }, h('div', { class: 'bk-mi' }, artEl(code || fav.hero)), h('div', { class: 'bk-mt' }, h('b', null, title), h('span', null, sub)), g.replay ? h('button', { class: 'bk-pl', title: 'Ansehen', onclick: () => watch(g) }, '▶') : null) : null;
  const hl = [
    T.hit && mom(T.hit, `Größter Treffer · ${T.hit.maxHit.v.toLocaleString('de-DE')}`, `${T.hit.names[T.hit.maxHit.p]}${T.hit.maxHit.code ? ' mit «' + nameOf(T.hit.maxHit.code) + '»' : ''} · ${day(T.hit.t)}`, T.hit.maxHit.code),
    T.comeback && mom(T.comeback, `Sieg mit nur ${T.comeback.minLp[T.comeback.winner].toLocaleString('de-DE')} LP`, `${T.comeback.names[T.comeback.winner]} · ${T.comeback.decks[T.comeback.winner]} · ${day(T.comeback.t)}`, coverOfName(T.comeback.decks[T.comeback.winner])),
    T.chain && mom(T.chain, `Längste Kette · ${T.chain.maxChain} Glieder`, `${T.chain.names.join(' gegen ')} · ${day(T.chain.t)}`, coverOfName(T.chain.decks[0])),
  ].filter(Boolean);
  const recent = S.games.slice(0, 6).map((g) => h('div', { class: 'bk-g' }, h('span', { class: 'bk-gd' }, day(g.t)), h('span', { class: 'bk-gn' }, g.winner == null ? `${g.names.join(' – ')} · unentschieden` : `🏆 ${g.names[g.winner]}`), h('span', { class: 'bk-gx' }, `${g.decks[g.winner ?? 0]} · ${g.turns} ${g.turns === 1 ? 'Zug' : 'Züge'}`), g.replay ? h('button', { class: 'bk-pl sm', onclick: () => watch(g) }, '▶') : null));
  const CH = challenges(); const open = CH.filter((c) => c.inbox && c.answer == null);
  const right = h('div', { class: 'bk-hl nx-pn nx-scroll' }, h('div', { class: 'nx-lbl' }, '✦ Höhepunkte'), hl.length ? hl : h('p', { class: 'bk-hint' }, 'Nach euren ersten Duellen erscheinen hier die besten Momente – zum Wiederansehen.'),
    open.map((c) => h('div', { class: 'bk-ch' }, '🏆 ', h('b', null, `Herausforderung von ${c.from}:`), ` „Schaffst du mit meiner Starthand (${c.deck.name}) mehr als ${pts(c.score)} Punkte?“ `, h('button', { class: 'bk-acc', onclick: () => acceptChallenge(c) }, 'Annehmen ›'))),
    h('div', { class: 'bk-new' }, h('button', { class: 'nx-btn pink', onclick: () => newChallenge() }, '🏆 Herausforderung stellen'), CH.length ? h('button', { class: 'nx-btn ghost', onclick: () => go('challenges') }, `Alle (${CH.length})`) : null),
    recent.length ? h('div', { class: 'nx-lbl', style: 'margin-top:12px' }, 'Letzte Duelle') : null, recent);
  return h('div', { class: 'screen nx bk' }, h('div', { class: 'nx-bg' }), head('Unser Duellbuch', 'Eure Duelle – mit Höhepunkten zum Wiederansehen'), h('button', { class: 'nx-x', onclick: () => back() }, '✕'), left, right);
};
function coverOfName(nm) { const d = allDecks().find((x) => x.name === nm); return d ? coverOf(d) : fav.hero; }

// ---- Herausforderungen ---------------------------------------------------------------------------------------------------
function newChallenge() {
  const ds = [...customDecks(), ...allDecks().filter((d) => !d.custom && d.status === 'ok').slice(0, 0)]; const last = store.get('last');
  const list = h('div', { class: 'col' });
  const pick = (d) => { m.close(); const dd = withTutor(d); go('duel', { fmt: dd.fmt, list: dd.list || LIST_OF[dd.fmt] || 'tcg', mode: 'solo', test: true, challenge: { create: true }, players: [{ name: settings.names[0] || 'Du', deck: dd }, { name: 'Übungsgegner', deck: dd }], human: [true, false], lp: settings.lp, tutor: false }); };
  const mine = ds.length ? ds : allDecks().filter((d) => d.status === 'ok').slice(0, 8);
  list.append(h('p', { class: 'small muted' }, 'Spiel deinen ersten Zug so gut du kannst. Danach bekommst du einen Link mit deiner Starthand und deiner Wertung – den schickst du weiter.'));
  mine.slice(0, 12).forEach((d) => list.append(h('button', { class: 'btn', onclick: () => pick(d) }, d.name)));
  const m = openModal({ title: 'Mit welchem Deck?', body: list, footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Abbrechen') });
}
export function acceptChallenge(c) {
  const d = withTutor({ ...c.deck, id: c.deck.id || 'ch-' + c.id, status: 'ok' });
  go('duel', { fmt: d.fmt, list: d.list || LIST_OF[d.fmt] || 'tcg', mode: 'solo', test: true, challenge: { target: c.score, id: c.id }, seed: c.seed, stack: [c.hand, []], players: [{ name: settings.names[1] || 'Du', deck: d }, { name: 'Übungsgegner', deck: d }], human: [true, false], lp: c.lp || 8000, tutor: false });
}
screens.challenges = () => {
  const CH = challenges();
  const row = (c) => h('div', { class: 'cl-r nx-pn' }, h('div', { class: 'cl-a' }, artEl(coverOfName(c.deck.name))), h('div', { class: 'cl-t' },
    h('b', null, c.inbox ? `Von ${c.from}` : 'Deine Herausforderung'), h('span', null, `${c.deck.name} · ${day(c.t)} · Vorgabe ${pts(c.score)}`),
    c.answer != null ? h('span', { class: c.won ? 'cl-w' : 'cl-l' }, c.won ? `🏆 Geschafft: ${pts(c.answer)}` : `Knapp daneben: ${pts(c.answer)}`) : null),
    h('div', { class: 'cl-b' }, c.inbox ? h('button', { class: 'nx-btn', onclick: () => acceptChallenge(c) }, c.answer != null ? 'Nochmal' : 'Annehmen') : h('button', { class: 'nx-btn ghost', onclick: () => shareChallenge(c) }, 'Teilen')));
  return h('div', { class: 'screen nx cl' }, h('div', { class: 'nx-bg' }), head('Herausforderungen', 'Gleiche Starthand – wer baut das bessere Board?'), h('button', { class: 'nx-x', onclick: () => back() }, '✕'),
    h('div', { class: 'cl-list nx-scroll' }, CH.length ? CH.map(row) : h('p', { class: 'muted' }, 'Noch keine Herausforderungen.')));
};
export async function shareChallenge(c) {
  const url = challengeLink({ ...c, inbox: undefined, answer: undefined, won: undefined, mine: undefined });
  const text = `${c.from} fordert dich heraus: Schaffst du mit meiner Starthand (${c.deck.name}) mehr als ${pts(c.score)} Punkte?`;
  try { if (navigator.share) { await navigator.share({ title: 'Duellraum-Herausforderung', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schick ihn per Nachricht.'); } catch (e) { prompt('Link zum Kopieren:', url); }
}
/** Am Ende des ersten Zugs (aus duel.js aufgerufen) */
export function challengeResult(D, score, board) {
  const c = D.conf.challenge; const deck = D.conf.players[0].deck;
  const rec = { id: Date.now().toString(36), t: Date.now(), from: settings.names[0] || 'Spieler 1', deck: { id: deck.id, name: deck.name, fmt: deck.fmt, list: deck.list, main: deck.main, extra: deck.extra || [] }, hand: (D.rec && D.rec.hand0) || [], seed: D.seedUsed, lp: D.conf.lp, score, board };
  let body, foot;
  if (c.create) {
    addChallenge(rec);
    body = h('div', { class: 'win-b' }, h('div', { class: 'win-ic' }, '🏆'), h('h2', { class: 'title-glow' }, `Wertung ${pts(score)}`), h('p', { class: 'muted' }, board), h('p', null, 'Schick die Herausforderung weiter – sie bekommt genau deine Starthand.'));
    foot = [h('button', { class: 'btn ghost', onclick: () => { m.close(); D.destroy(); go('book'); } }, 'Später'), h('button', { class: 'btn pri', onclick: () => shareChallenge(rec) }, 'Link teilen')];
  } else {
    const won = score > c.target; const L = challenges(); const e = L.find((x) => x.id === c.id); if (e) { e.answer = score; e.won = won; store.set('chal', L); }
    body = h('div', { class: 'win-b' }, h('div', { class: 'win-ic' }, won ? '🏆' : '💪'), h('h2', { class: 'title-glow' }, won ? 'Herausforderung geschafft!' : 'Knapp daneben'), h('p', null, `Du: ${pts(score)} · Vorgabe: ${pts(c.target)}`), h('p', { class: 'muted' }, board));
    foot = [h('button', { class: 'btn ghost', onclick: () => { m.close(); D.destroy(); go('book'); } }, 'Zum Duellbuch'), h('button', { class: 'btn pri', onclick: () => { m.close(); D.destroy(); const x = challenges().find((y) => y.id === c.id); if (x) acceptChallenge(x); } }, 'Nochmal')];
  }
  const m = openModal({ host: D.root, title: '', center: true, cls: 'win', body, footer: foot });
}

// ---- Karten-Album ---------------------------------------------------------------------------------------------------------
screens.album = ({ tab } = {}) => {
  const A = album(); const played = Object.keys(A).map(Number).filter((c) => A[c].n > 0);
  const codesOf = (d) => [...new Set([...(d.main || []), ...(d.extra || [])].map((e) => (Array.isArray(e) ? (e.length > 2 ? e[e.length - 1] : e[0]) : e)))];
  const B = store.get('book', { games: [] }); const usedNames = [...new Set(B.games.flatMap((g) => g.decks.filter((_, i) => g.human[i])))];
  const decks = [...customDecks(), ...usedNames.map((nm) => allDecks().find((d) => d.name === nm)).filter(Boolean)].filter((d, i, a) => a.findIndex((x) => x.name === d.name) === i).slice(0, 8);
  const tabs = [{ id: 'all', t: 'Gespielt', codes: played.sort((a, b) => A[b].n - A[a].n) }, { id: 'fav', t: '♥ Lieblinge', codes: played.filter((c) => A[c].fav).concat(Object.keys(A).map(Number).filter((c) => A[c].fav && !A[c].n)) },
    ...decks.map((d) => ({ id: 'd:' + d.name, t: d.name, codes: codesOf(d), deck: d }))];
  let cur = tabs.find((x) => x.id === tab) || tabs[0]; let sel = null;
  const tabBar = h('div', { class: 'al-tabs nx-scroll' }); const grid = h('div', { class: 'al-grid nx-scroll' }); const det = h('div', { class: 'al-det nx-pn' });
  const paintDet = () => {
    clear(det); const c = sel || cur.codes.find((x) => A[x] && A[x].n) || cur.codes[0];
    if (!c) { det.append(h('p', { class: 'bk-hint' }, 'Spiel ein Duell – jede Karte, die du ausspielst, bekommt hier ihren Platz.')); return; }
    const e = A[c] || { n: 0, w: 0 }; const hit = B.games.find((g) => g.maxHit && g.maxHit.code === c);
    const story = e.n ? (hit ? `„Mit ihr kam am ${day(hit.t)} euer größter Treffer: ${hit.maxHit.v.toLocaleString('de-DE')} Schaden.“` : `„Zum ersten Mal gespielt am ${day(e.first)} – seitdem ${e.n}-mal.“`) : 'Noch nicht gespielt – sie wartet auf ihren großen Auftritt.';
    const have = cur.codes.filter((x) => A[x] && A[x].n).length;
    det.append(...[h('div', { class: 'al-big' }, cardEl(c, { cls: 'md' }), h('div', null, e.fav ? h('div', { class: 'nx-lbl', style: 'color:var(--nx-pk)' }, '♥ Lieblingskarte') : null, h('h3', null, nameOf(c)), h('div', { class: 'al-meta' }, e.n ? `Zuerst gespielt ${day(e.first)}` : 'Noch nicht gespielt', h('br'), `${e.n}× gespielt · ${e.w || 0} Siege`),
      h('button', { class: 'al-heart' + (e.fav ? ' on' : ''), onclick: () => { albumFav(c, !e.fav); paint(); } }, e.fav ? '♥ Liebling' : '♡ Zum Liebling'))),
      h('div', { class: 'al-story' }, story),
      cur.deck ? h('div', null, h('div', { class: 'al-pg' }, h('span', null, `Album „${cur.t}“`), h('span', { class: 'gold' }, `${have} / ${cur.codes.length}`)), h('div', { class: 'al-bar' }, h('i', { style: `width:${Math.round((have / Math.max(1, cur.codes.length)) * 100)}%` }))) : null].filter(Boolean));
  };
  const paint = () => {
    clear(tabBar); tabs.forEach((t) => tabBar.append(h('button', { class: 'al-tab' + (t === cur ? ' on' : ''), onclick: () => { cur = t; sel = null; paint(); } }, t.t)));
    clear(grid); const A2 = album();
    if (!cur.codes.length) grid.append(h('p', { class: 'bk-hint' }, cur.id === 'fav' ? 'Tippe bei einer Karte auf ♡, dann erscheint sie hier.' : 'Noch keine Karten gespielt.'));
    for (const c of cur.codes.slice(0, 120)) {
      const e = A2[c]; const miss = !e || !e.n; const isNew = e && e.first && Date.now() - e.first < 3 * 864e5;
      grid.append(h('button', { class: 'al-s' + (miss ? ' miss' : '') + (sel === c ? ' sel' : ''), onclick: () => { sel = c; paint(); } }, cardEl(c, { cls: 'sm' }), isNew ? h('span', { class: 'al-new' }, 'NEU') : null, e && e.fav ? h('span', { class: 'al-hz' }, '♥') : null, e && e.n ? h('span', { class: 'al-n' }, e.n + '×') : null));
    }
    paintDet();
  };
  paint();
  return h('div', { class: 'screen nx al' }, h('div', { class: 'nx-bg' }), head('Karten-Album', 'Jede Karte, die ihr gespielt habt, bekommt ihren Platz'), h('button', { class: 'nx-x', onclick: () => back() }, '✕'), tabBar, h('div', { class: 'al-box nx-pn' }, grid), det);
};
