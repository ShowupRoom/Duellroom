// Online-Raum: Gastgeber eröffnet mit Code, Partnerin tritt an ihrem Handy bei, jeder wählt sein Deck.
import { h, clear, toast, rand32 } from './util.js';
import { App, FORMAT_INFO, allDecks, withTutor, ADV_LISTS, LIST_NAME } from './data.js';
import { openModal, confirmBox } from './ui.js';
import { go, back, root as navRoot, screens, setGuard } from './nav.js';
import { store } from './store.js';
import { session, startSession, endSession, myName, setMyName } from './net.js';
import { RemoteEngine, VERSION, prewarm } from './engine.js';
import { settings, deckArt } from './screens.js';
import { cardEl } from './cards.js';

const hdr = (title, sub, onBack) => h('div', { class: 'hd' }, h('button', { class: 'ibtn', onclick: onBack || (() => back()) }, '←'), h('h2', null, title, sub ? h('div', { class: 'sub' }, sub) : null));
const slim = (d) => (d ? { id: d.id, name: d.name, fmt: d.fmt, list: d.list, main: d.main, extra: d.extra, side: d.side || [], tutor: withTutor(d).tutor, custom: d.custom, sub: d.sub, grp: d.grp } : null);
const fmtTitle = (s) => (s.fmt ? FORMAT_INFO[s.fmt].title + (s.fmt === 'advanced' ? ' · ' + (s.list === 'none' ? 'ohne Banlist' : (s.list || 'tcg').toUpperCase()) : '') : '–');

// ---- Einstieg -------------------------------------------------------------------------------------------------
screens.online = (P = {}) => {
  const name = h('input', { class: 'input', value: myName() || settings.names?.[0] || '', placeholder: 'Dein Name', maxlength: 20, oninput: (e) => setMyName(e.target.value.trim()) });
  const code = h('input', { class: 'input code-in', placeholder: 'CODE', maxlength: 5, autocapitalize: 'characters', autocomplete: 'off', oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
  const need = () => { const n = name.value.trim(); if (!n) { toast('Bitte zuerst deinen Namen eintragen.'); name.focus(); return null; } setMyName(n); return n; };
  return h('div', { class: 'screen' }, hdr('Online spielen', 'Jeder an seinem eigenen Handy'),
    h('div', { class: 'body' }, h('div', { class: 'wrap col' },
      P.fmt ? h('div', { class: 'ban-pill' }, h('span', { class: 'muted small' }, 'Banlist'), h('b', null, fmtTitle({ fmt: P.fmt, list: P.list }))) : null,
      h('p', { class: 'muted' }, 'Ihr spielt gegeneinander, jeder sieht nur seine eigenen Handkarten. Am besten seid ihr im selben WLAN.'),
      h('label', { class: 'small muted' }, 'Dein Name'), name,
      h('div', { class: 'panel col' }, h('b', null, '1) Einer eröffnet den Raum'), h('p', { class: 'small muted' }, 'Du bekommst einen Code (z. B. K7P2Q), den du deiner Mitspielerin sagst oder per Link schickst.'),
        h('button', { class: 'btn pri lg', onclick: () => { if (need()) { if (P.fmt) store.set('online.host', { ...store.get('online.host', {}), fmt: P.fmt, list: P.list || (P.fmt === 'advanced' ? 'tcg' : P.fmt) }); hostRoom(); } } }, '🏠  Raum eröffnen')),
      h('div', { class: 'panel col' }, h('b', null, '2) Die andere tritt bei'), code,
        h('button', { class: 'btn lg', onclick: () => { if (!need()) return; const c = code.value.trim(); if (c.length !== 5) { toast('Der Code hat 5 Zeichen.'); return; } joinRoom(c); } }, '🔗  Raum beitreten')))));
};

// ---- Sitzung aufbauen -------------------------------------------------------------------------------------------------
export async function hostRoom() {
  const s = startSession('host'); const last = store.get('online.host', {});
  Object.assign(s, { fmt: last.fmt || 'advanced', list: last.list || 'tcg', myDeck: null, guestDeck: null, guestName: '', first: 'random', inDuel: false });
  s.myDeck = byIdIn(s.fmt, last.deck);
  wireHost(s); navRoot('lobby'); prewarm().catch(() => {});
  try { await s.open(); } catch (e) { s.error = e.message; s.emit('state'); }
}
export async function joinRoom(code) {
  const s = startSession('guest', code);
  Object.assign(s, { fmt: null, list: null, myDeck: null, hostName: '', hostDeckName: '', inDuel: false });
  wireGuest(s); navRoot('lobby');
  try { await s.open(); } catch (e) { s.error = e.message; s.emit('state'); }
}
const byIdIn = (fmt, id) => (id ? allDecks(fmt).find((d) => d.id === id && d.status !== 'entwurf') || null : null);
function saveHost(s) { store.set('online.host', { fmt: s.fmt, list: s.list, deck: s.myDeck && s.myDeck.id }); }
function pushSetup(s) { s.send({ t: 'setup', fmt: s.fmt, list: s.list, hostName: myName(), hostDeckName: s.myDeck ? s.myDeck.name : '' }); }

function wireHost(s) {
  s.handle('hello', (m) => {
    s.guestName = m.name || 'Gast'; if (m.v && m.v !== VERSION) toast('Hinweis: Ihr nutzt unterschiedliche App-Versionen – bitte beide neu laden.', 5000);
    if (s.inDuel && s.duelConf) { if (!m.inDuel) s.send({ t: 'start', conf: { ...s.guestConf, resume: true } }); }
    else pushSetup(s);
    s.emit('state');
  });
  s.handle('deck', (m) => { s.guestDeck = m.deck; s.emit('state'); });
  s.handle('rematch', () => { if (!s.inDuel) hostStart(s); });
  s.handle('bye', () => { toast(`${s.guestName || 'Dein Gegenüber'} hat den Raum verlassen.`, 4000); s.guestDeck = null; s.emit('state'); });
}
function wireGuest(s) {
  s.on((ev) => { if (ev === 'open') s.send({ t: 'hello', name: myName(), v: VERSION, inDuel: s.inDuel }); });
  s.handle('setup', (m) => {
    const changed = m.fmt !== s.fmt || m.list !== s.list; Object.assign(s, { fmt: m.fmt, list: m.list, hostName: m.hostName, hostDeckName: m.hostDeckName });
    if (changed) { const last = store.get('online.guest.' + m.fmt); s.myDeck = byIdIn(m.fmt, last) || null; if (s.myDeck && m.fmt === 'advanced' && m.list !== 'none' && s.myDeck.list !== m.list && !s.myDeck.custom) s.myDeck = null; if (s.myDeck) s.send({ t: 'deck', deck: slim(s.myDeck), name: myName() }); }
    s.emit('state');
  });
  s.handle('start', (m) => {
    const conf = { ...m.conf, mode: 'net-guest', tutor: settings.tutor, human: [true, true] };
    s.inDuel = true; conf.remote = new RemoteEngine(s); if (window.__duel && !window.__duel.ended) window.__duel.destroy();
    navRoot('duel', conf); setTimeout(() => conf.remote.sync(), 50);
  });
  s.handle('bye', () => { toast(`${s.hostName || 'Der Gastgeber'} hat den Raum geschlossen.`, 5000); s.emit('state'); });
}
export function hostStart(s = session) {
  if (!s || s.role !== 'host' || !s.myDeck || !s.guestDeck) return;
  const hostSeat = s.first === 'me' ? 0 : s.first === 'other' ? 1 : rand32() % 2;
  const players = []; players[hostSeat] = { name: myName() || 'Ich', deck: withTutor(s.myDeck) }; players[1 - hostSeat] = { name: s.guestName || 'Gast', deck: s.guestDeck };
  const base = { fmt: s.fmt, list: s.list, players, lp: 8000 };
  s.duelConf = { ...base, mode: 'net-host', seat: hostSeat, human: [true, true], tutor: settings.tutor };
  s.guestConf = { ...base, seat: 1 - hostSeat };
  s.inDuel = true; s.send({ t: 'start', conf: s.guestConf });
  if (window.__duel && !window.__duel.ended) window.__duel.destroy();
  navRoot('duel', s.duelConf);
}
/** vom Duell-Ende aus */
export function netRematch(duel) { const s = session; if (!s) return; s.inDuel = false; if (s.role === 'host') { duel.destroy(); hostStart(s); } else { s.send({ t: 'rematch' }); toast('Revanche angefragt – gleich geht’s los.'); } }
export function netMenu() { const s = session; if (s) s.inDuel = false; navRoot(s ? 'lobby' : 'home'); }

// ---- Raum ---------------------------------------------------------------------------------------------------
screens.lobby = () => {
  const s = session; if (!s) { queueMicrotask(() => navRoot('home')); return h('div', { class: 'screen' }); }
  s.inDuel = false;
  const leave = async () => { if (await confirmBox('Raum verlassen?', 'Die Verbindung zu deinem Gegenüber wird getrennt.', 'Verlassen', 'Bleiben', true)) { setGuard(null); endSession(); navRoot('home'); } };
  setGuard(async () => { await leave(); return false; });
  const body = h('div', { class: 'wrap col' });
  const root = h('div', { class: 'screen lobby' }, hdr('Online-Raum', s.role === 'host' ? 'Du bist Gastgeber' : 'Du bist Gast', leave), h('div', { class: 'body' }, body));
  const off = s.on(() => { if (!root.isConnected) { off(); return; } paint(); });
  const status = () => {
    if (s.error) return ['bad', '⚠ ' + s.error];
    const other = s.role === 'host' ? s.guestName : s.hostName;
    switch (s.state) {
      case 'server': return ['', '⏳ Verbinde mit dem Vermittlungsserver …'];
      case 'waiting': return ['', '⏳ Warte auf deine Mitspielerin …'];
      case 'connecting': return ['', '⏳ Verbinde mit dem Raum …'];
      case 'notfound': return ['warn', '🔎 Raum nicht gefunden – stimmt der Code? Ist der Gastgeber im Raum? Ich versuche es weiter …'];
      case 'connected': return ['ok', '✅ Verbunden' + (other ? ' mit ' + other : '')];
      case 'lost': return ['warn', '📡 Verbindung unterbrochen – verbinde neu …'];
      case 'offline': return ['warn', '📡 Kein Internet? Ich versuche es weiter …'];
      default: return ['', '…'];
    }
  };
  const deckBox = (label, d, pickable, onPick, placeholder) => h('div', { class: 'panel col' }, h('div', { class: 'small muted' }, label),
    d ? h('div', { class: 'deck-mini' }, d.main ? cardEl(deckArt(d), { cls: 'md' }) : null, h('div', { class: 'grow' }, h('div', { class: 'dm-n' }, d.name), d.tutor ? h('div', { class: 'muted small' }, d.tutor.style || '') : null)) : h('div', { class: 'muted' }, placeholder),
    pickable ? h('button', { class: 'btn' + (d ? '' : ' pri'), disabled: !s.fmt, onclick: () => { setGuard(null); go('decks', { fmt: s.fmt, list: s.list, title: 'Dein Deck für das Online-Duell', onPick }); } }, d ? 'Anderes Deck' : 'Deck wählen') : null);
  function paint() {
    clear(body); const [cls, txt] = status();
    body.append(h('div', { class: 'net-st ' + cls }, txt));
    if (s.role === 'host') {
      const link = location.origin + location.pathname + '?join=' + s.code;
      body.append(h('div', { class: 'panel col center' }, h('div', { class: 'small muted' }, 'Raum-Code'), h('div', { class: 'room-code' }, s.code.split('').map((c) => h('span', null, c))),
        h('button', { class: 'btn', onclick: async () => { const text = `Komm in meinen Duellraum! Code: ${s.code}`; try { if (navigator.share) await navigator.share({ title: 'Duellraum', text, url: link }); else { await navigator.clipboard.writeText(link); toast('Link kopiert'); } } catch (e) { /* abgebrochen */ } } }, '📤  Einladung teilen')));
      body.append(h('div', { class: 'panel col' }, h('div', { class: 'small muted' }, 'Format'), h('div', { class: 'tabs' }, ['goat', 'edison', 'advanced', 'genesys', 'speed'].map((f) => h('button', { class: 'chip' + (s.fmt === f ? ' on' : ''), onclick: () => { if (s.fmt === f) return; s.fmt = f; s.myDeck = null; s.guestDeck = null; saveHost(s); pushSetup(s); paint(); } }, FORMAT_INFO[f].icon + ' ' + FORMAT_INFO[f].title))),
        s.fmt === 'advanced' ? h('div', { class: 'tabs' }, ADV_LISTS.map((l) => h('button', { class: 'chip' + (s.list === l ? ' on' : ''), onclick: () => { s.list = l; s.myDeck = null; s.guestDeck = null; saveHost(s); pushSetup(s); paint(); } }, l === 'none' ? 'Keine Banlist' : 'Verbotsliste ' + LIST_NAME[l]))) : null));
      body.append(deckBox('Dein Deck', s.myDeck, true, (d) => { s.myDeck = d; saveHost(s); pushSetup(s); }, 'Noch kein Deck gewählt'));
      body.append(deckBox(`Deck von ${s.guestName || 'deiner Mitspielerin'}`, s.guestDeck, false, null, s.connected ? 'wählt gerade …' : 'noch nicht verbunden'));
      body.append(h('div', { class: 'panel row', style: 'flex-wrap:wrap' }, h('span', { class: 'small muted' }, 'Wer beginnt?'), [['random', 'Zufall'], ['me', 'Ich'], ['other', s.guestName || 'Gast']].map(([v, t]) => h('button', { class: 'chip' + (s.first === v ? ' on' : ''), onclick: () => { s.first = v; paint(); } }, t)),
        h('span', { class: 'grow' }), h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: settings.tutor, onchange: (e) => { settings.tutor = e.target.checked; } }), ' Tutor')));
      const ready = s.connected && s.myDeck && s.guestDeck;
      body.append(h('button', { class: 'btn pri lg', disabled: !ready, onclick: () => hostStart(s) }, ready ? '⚔  Duell starten' : !s.connected ? 'Warte auf Mitspielerin …' : !s.myDeck ? 'Wähle dein Deck' : 'Warte auf ihr Deck …'));
    } else {
      body.append(h('div', { class: 'panel col' }, h('div', { class: 'small muted' }, 'Raum'), h('div', { class: 'room-code sm' }, s.code), h('div', null, 'Format: ', h('b', null, fmtTitle(s))), s.hostName ? h('div', { class: 'small muted' }, `Gastgeber: ${s.hostName}${s.hostDeckName ? ' · spielt „' + s.hostDeckName + '“' : ''}`) : null));
      body.append(deckBox('Dein Deck', s.myDeck, s.connected && !!s.fmt, (d) => { s.myDeck = d; store.set('online.guest.' + s.fmt, d.id); s.send({ t: 'deck', deck: slim(d), name: myName() }); }, s.fmt ? 'Noch kein Deck gewählt' : 'Warte auf den Gastgeber …'));
      body.append(h('label', { class: 'chip', style: 'align-self:flex-start' }, h('input', { type: 'checkbox', checked: settings.tutor, onchange: (e) => { settings.tutor = e.target.checked; } }), ' Tutor-Tipps für mich'));
      body.append(h('div', { class: 'net-st' }, s.myDeck ? `✔ Bereit – ${s.hostName || 'der Gastgeber'} startet das Duell.` : 'Wähle dein Deck, dann kann es losgehen.'));
    }
  }
  paint(); return root;
};
