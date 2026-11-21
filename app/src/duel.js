// Duell-Oberfläche: Spielfeld, Hand, Ereignisse, Übergabe zwischen den Spielern
import { h, clear, sleep, toast, shuffled, beep, rand32, zkey as key } from './util.js';
import { App, MODES, fmtById, expand, nameOf, cardOf, cleanName, withTutor } from './data.js';
import { DuelAI } from '../../src/ai.mjs';
import { randomResponse, OcgResponseType as R, OcgMessageType as MSG, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, LOC, MSG_NAME } from '../../src/core.mjs';
import { cardEl, fieldEl } from './cards.js';
import { openModal, confirmBox, cardInfoBody } from './ui.js';
import { screens, back, root as navRoot, setGuard } from './nav.js';
import { store } from './store.js';
import { sys, descText, PHASE, PHASE_HELP, victoryText, typeText, levelText, attrName, statsText } from './strings.js';
import { idleTip, battleTip, introText } from './tips.js';
import { ask } from './prompts.js';
import { settings } from './screens.js';
import { LocalEngine, RemoteEngine, HostLink, maskEvents } from './engine.js';
import { session, keepAwake } from './net.js';
import { netRematch, netMenu } from './online.js';

const LK = { [LOC.HAND]: 'hand', [LOC.MZONE]: 'mzone', [LOC.SZONE]: 'szone', [LOC.GRAVE]: 'grave', [LOC.REMOVED]: 'banished', [LOC.EXTRA]: 'extra' };
const FACEUP = 5;

class Duel {
  constructor(conf) {
    this.conf = conf; this.mode = MODES[conf.fmt]; this.fmtDef = fmtById(conf.fmt, conf.list);
    this.net = conf.mode === 'net-host' || conf.mode === 'net-guest' ? session : null; this.viewer = this.net ? conf.seat : (conf.human[0] ? 0 : 1); this.snap = null; this.logLines = []; this.chain = []; this.stopped = false; this.turnNo = 0; this.phase = 0; this.turnPlayer = 0;
    this.actList = []; this.acts = new Map(); this.cand = new Map(); this.chosen = new Set(); this.zoneSel = null; this.tip = null; this.tipKeys = new Set(); this.pending = null; this.hintText = ''; this.introShown = [false, false];
    this.lpShown = [conf.lp, conf.lp]; this.floats = []; this.prevHand = [0, 0]; this.newHand = 0; this.anim = store.get('anim', true);
    this.build(); window.__duel = this;
  }
  deckOf(p) { return this.conf.players[p].deck; }
  pname(p) { return this.conf.players[p].name; }

  // ---------------------------------------------------------------- Aufbau
  build() {
    const r = this.root = h('div', { class: 'screen duel' + (this.mode.emz ? ' has-emz' : '') });
    this.turnEl = h('div', { class: 'd-turn' }); this.chainEl = h('button', { class: 'd-chainb', onclick: () => this.showChain() });
    this.tipBtn = h('button', { class: 'ibtn tipb', title: 'Tutor-Tipp', onclick: () => this.showTip() }, '💡');
    this.top = h('div', { class: 'd-top' }, h('button', { class: 'ibtn', onclick: () => this.menu() }, '☰'), h('button', { class: 'd-turnb', onclick: () => this.phaseHelp() }, this.turnEl), this.chainEl, this.tipBtn, h('button', { class: 'ibtn', onclick: () => this.showLog() }, '📜'));
    this.oppBar = h('div', { class: 'd-strip opp' }); this.meBar = h('div', { class: 'd-strip me' });
    this.boardWrap = h('div', { class: 'd-board' }); this.board = h('div', { class: 'bd' }); this.boardWrap.append(this.board);
    this.board.addEventListener('click', (e) => { const z = e.target.closest('[data-k]'); if (z) this.tapKey(z.dataset.k, z); });
    this.handEl = h('div', { class: 'd-hand' }); this.handEl.addEventListener('click', (e) => { const z = e.target.closest('[data-k]'); if (z) this.tapKey(z.dataset.k, z); }); this.bar = h('div', { class: 'd-bar' });
    this.sheet = h('div', { class: 'd-sheet' }); this.fx = h('div', { class: 'd-fx' });
    this.over = h('div', { class: 'd-over' });
    r.append(this.top, this.oppBar, this.boardWrap, this.meBar, this.handEl, this.bar, this.sheet, this.fx, this.over);
    this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(this.boardWrap); this.ro.observe(this.bar);
  }
  fit() {
    const b = this.boardWrap.getBoundingClientRect(); if (!b.width || !b.height) return;
    const rows = this.mode.emz ? 5 : 4.35; const cw = Math.max(30, Math.min(b.width / 7.25, b.height / (rows * 1.42 + 0.35), 96));
    this.root.style.setProperty('--cw', cw.toFixed(1) + 'px'); this.root.style.setProperty('--barh', this.bar.offsetHeight + 'px');
  }

  // ---------------------------------------------------------------- Start & Schleife
  async start() {
    setGuard(async () => { const ok = await confirmBox('Duell verlassen?', this.net ? 'Das Online-Duell wird für beide beendet.' : 'Der Spielstand geht verloren.', 'Verlassen', 'Weiterspielen', true); if (ok) { if (this.net) this.net.send({ t: 'leave' }); this.destroy(); } return ok; });
    this.fit();
    const { conf } = this; const m = this.mode;
    if (conf.mode === 'ai' || conf.mode === 'bot') this.ai = new DuelAI(App.cards, conf.level || 'normal');
    if (this.net) this.netSetup();
    try {
      if (conf.mode === 'net-guest') this.eng = conf.remote;
      else {
        const mk = (i) => ({ main: expand(conf.players[i].deck.main), extra: expand(conf.players[i].deck.extra) });
        const seed = [BigInt(rand32()), BigInt(rand32()), BigInt(rand32()), BigInt(rand32())];
        this.eng = new LocalEngine(); await this.eng.create({ flags: m.flags, decks: [mk(0), mk(1)], scripts: m.scripts, seed, lp: conf.lp });
        if (conf.mode === 'net-host') this.host = new HostLink(this.net, 1 - this.viewer);
      }
    } catch (e) { this.fatal(e); return; }
    if (!conf.resume) await this.coin();
    this.loop().catch((e) => this.fatal(e));
  }
  netSetup() {
    const s = this.net; keepAwake(true); s.wantAwake = true;
    this.netEl = h('div', { class: 'd-net' }); this.root.append(this.netEl);
    const paint = () => { const ok = s.connected; this.netEl.className = 'd-net' + (ok ? '' : ' on'); this.netEl.textContent = ok ? '' : '📡 Verbindung unterbrochen – verbinde neu …'; };
    this.offNet = s.on((ev) => { if (ev === 'state' || ev === 'open' || ev === 'lost') paint(); });
    paint();
    s.handle('surrender', (msg) => this.remoteEnd(1 - msg.seat, 0, `${this.pname(msg.seat)} hat aufgegeben.`));
    s.handle('leave', () => this.remoteEnd(this.viewer, 0, `${this.pname(1 - this.viewer)} hat das Duell verlassen.`));
  }
  async remoteEnd(winner, reason, note) {
    if (this.stopped && this.ended) return; this.stopped = true; if (this.host) this.host.abort(); if (this.eng && this.eng.abort) this.eng.abort();
    if (this.pending) { this.pending.resolve(null); this.pending = null; }
    if (note) toast(note, 4000); await this.finish(winner, reason);
  }
  async coin() {
    const f = this.conf.human[0] && !this.conf.human[1] ? 0 : 0; void f;
    const n = this.pname(0); const el = h('div', { class: 'coin-ov' }, h('div', { class: 'coin' }, '☯'), h('div', { class: 'coin-t' }, 'Wer beginnt?'));
    this.root.append(el); await sleep(this.anim ? 700 : 100);
    el.querySelector('.coin-t').textContent = `${n} beginnt!`; beep('ok'); await sleep(this.anim ? 650 : 150); el.remove();
  }
  async loop() {
    let resp;
    while (!this.stopped) {
      const st = await this.eng.step(resp); resp = undefined;
      if (this.stopped || !st) return;
      if (st.errors && st.errors.length) console.warn('Lua', st.errors);
      const r = st.r; let evs = st.evs;
      if (this.host) this.host.forward(st);
      if (this.net) evs = maskEvents(evs, this.viewer);
      this.collectHints(evs);
      await this.present(evs);
      if (this.stopped) return;
      this.snap = st.snap;
      if (st.snap.turn && st.snap.turn !== this.turnNo) { this.turnNo = st.snap.turn; this.turnPlayer = st.snap.turnPlayer; if (st.snap.phase) this.phase = st.snap.phase; this.renderTop(); }
      if (r.kind === 'end') { this.render(); await this.finish(r.winner, r.reason); return; }
      if (r.kind === 'wait') { this.render(); this.setBar(`⏳ ${this.pname(r.player)} ist dran …`, [], 'Du kannst dir solange Karten ansehen.'); continue; }
      const msg = r.msg; const p = msg.player;
      if (this.host && p === this.host.gs) {
        this.render(); this.setBar(`⏳ Warte auf ${this.pname(p)} …`, [], 'Du kannst dir solange Karten ansehen.');
        resp = await this.host.waitResp(); if (this.stopped) return; continue;
      }
      if (this.conf.human[p]) {
        if (this.viewer !== p) await this.handover(p);
        this.render();
        if (r.retry) toast('Das ist nicht erlaubt – bitte noch einmal wählen.');
        if (!this.introShown[p]) { this.introShown[p] = true; if (this.conf.tutor) await this.intro(p); }
        resp = await ask(this, msg);
        if (this.stopped) return;
      } else {
        this.render();
        resp = this.botResponse(msg, st.evs, r.retry); if (this.ai && this.anim && (msg.type === MSG.SELECT_IDLECMD || msg.type === MSG.SELECT_BATTLECMD)) await sleep(240);
      }
    }
  }
  botResponse(msg, evs, retry) {
    if (this.conf.mode === 'solo') {
      if (msg.type === MSG.SELECT_IDLECMD) return { type: R.SELECT_IDLECMD, action: msg.to_ep ? IA.TO_EP : IA.TO_BP, index: null };
      if (msg.type === MSG.SELECT_BATTLECMD) return { type: R.SELECT_BATTLECMD, action: msg.to_ep ? BA.TO_EP : BA.TO_M2, index: null };
      if (msg.type === MSG.SELECT_CHAIN) return msg.forced ? { type: R.SELECT_CHAIN, index: 0 } : { type: R.SELECT_CHAIN, index: null };
    }
    if (this.ai) return this.ai.respond(msg, { snap: this.snap, evs, retry });
    return randomResponse(msg, Math.random, { cards: App.cards });
  }
  collectHints(evs) {
    this.hintText = ''; this.msgHints = [];
    for (const m of evs) {
      if (m.type === MSG.HINT) { if (m.hint_type === 3) this.hintText = descText(m.hint); else if (m.hint_type === 2) this.msgHints.push(descText(m.hint)); }
      else if (m.type === MSG.SHOW_HINT) this.msgHints.push(m.hint);
    }
    for (const t of this.msgHints) if (t && this.conf.human[this.viewer]) toast(t);
  }
  fatal(e) {
    console.error(e); this.stopped = true; if (this.net) this.net.send({ t: 'leave' });
    openModal({ host: this.root, title: 'Hoppla – ein Fehler', center: true, body: h('div', null, h('p', null, 'Das Duell konnte nicht weiterlaufen. Das tut mir leid! Du kannst ein neues Duell starten.'), h('pre', { class: 'small muted', style: 'white-space:pre-wrap;max-height:30vh;overflow:auto' }, String(e && e.message || e))), footer: h('button', { class: 'btn pri', onclick: () => { this.destroy(); if (this.net) netMenu(); else navRoot('home'); } }, 'Zum Menü') });
  }
  destroy() { this.stopped = true; setGuard(null); try { this.ro.disconnect(); } catch (e) { /* */ } try { if (this.eng && this.eng.destroy) this.eng.destroy(); if (this.eng && this.eng.abort) this.eng.abort(); if (this.host) this.host.abort(); } catch (e) { /* */ } this.eng = null; if (this.offNet) this.offNet(); if (this.net) { this.net.wantAwake = false; keepAwake(false); } if (this.pending) { this.pending.resolve(null); this.pending = null; } }

  // ---------------------------------------------------------------- Übergabe & Einführung
  handover(p) {
    return new Promise((res) => {
      const last = this.logLines.slice(-3).map((l) => h('div', { class: 'small muted' }, l));
      clear(this.over); this.over.classList.add('on'); this.closeSheet();
      this.over.append(h('div', { class: 'ov-box' }, h('div', { class: 'ov-ic' }, '📱'), h('h2', null, `Gerät an ${this.pname(p)} übergeben`), h('p', { class: 'muted' }, 'Die Handkarten bleiben geheim, bis du bereit bist.'), last.length ? h('div', { class: 'ov-log' }, last) : null,
        h('button', { class: 'btn pri lg', onclick: () => { this.over.classList.remove('on'); clear(this.over); this.viewer = p; beep('tap'); res(); } }, `Ich bin ${this.pname(p)} – bereit`)));
    });
  }
  intro(p) {
    return new Promise((res) => {
      const t = introText(this.deckOf(p)); const m = openModal({ host: this.root, title: '🎓 ' + t.title, center: true, body: h('div', null, h('p', { class: 'tut-g' }, t.goal), t.plan.length ? h('ol', { class: 'tut-p' }, t.plan.map((s) => h('li', null, s))) : null, h('p', { class: 'small muted' }, 'Tipp: Mit dem 💡-Knopf oben fragst du den Tutor jederzeit um Rat.')), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'Los geht’s!'), onClose: () => res() });
    });
  }

  // ---------------------------------------------------------------- Ereignisse
  txt(p) { return this.conf.human[p] || this.conf.mode !== 'hot' ? this.pname(p) : this.pname(p); }
  addLog(s) { this.logLines.push(s); if (this.logLines.length > 400) this.logLines.shift(); }
  async banner(o) {
    if (!this.anim) return;
    const el = h('div', { class: 'fx-b ' + (o.cls || '') }, o.code ? cardEl(o.code, { cls: 'md' }) : null, o.back ? cardEl(0, { back: true, cls: 'md' }) : null, h('div', { class: 'fx-bt' }, h('div', { class: 'fx-h' }, o.title), o.sub ? h('div', { class: 'fx-s' }, o.sub) : null));
    this.fx.append(el); let done; const p = new Promise((r) => { done = r; }); el.addEventListener('pointerdown', () => done());
    await Promise.race([sleep((o.ms || 750) * 0.7), p]); el.classList.add('out'); setTimeout(() => el.remove(), 200);
  }
  seeCard(code, ctrl, pos) { return ctrl === this.viewer || (pos & FACEUP) || pos === undefined; }
  async present(evs) {
    for (const m of evs) {
      const t = m.type;
      switch (t) {
        case MSG.NEW_TURN: this.turnNo++; this.turnPlayer = m.player; this.phase = 1; this.addLog(`── Zug ${this.turnNo}: ${this.pname(m.player)}`); this.renderTop(); beep('chain'); await this.banner({ title: `Zug ${this.turnNo}`, sub: this.pname(m.player), cls: 'turn', ms: 800 }); break;
        case MSG.NEW_PHASE: this.phase = m.phase; this.renderTop(); if (m.phase === 8) { this.addLog('Kampfphase'); await this.banner({ title: 'Kampfphase', cls: 'phase', ms: 550 }); } break;
        case MSG.DRAW: this.addLog(`${this.pname(m.player)} zieht ${m.drawn.length} Karte${m.drawn.length === 1 ? '' : 'n'}`); if (m.player === this.viewer) { this.newHand += m.drawn.length; beep('tap'); } break;
        case MSG.SUMMONING: case MSG.SPSUMMONING: case MSG.FLIPSUMMONING: {
          const k = t === MSG.SUMMONING ? 'Normalbeschwörung' : t === MSG.SPSUMMONING ? 'Spezialbeschwörung' : 'Flipp-Beschwörung';
          this.addLog(`${this.pname(m.controller)}: ${k} – «${nameOf(m.code)}»`); beep('summon'); await this.banner({ title: k, sub: nameOf(m.code), code: m.code, cls: 'summon', ms: 850 }); break; }
        case MSG.SET: this.addLog(`${this.pname(m.controller)} setzt eine Karte`); beep('tap'); break;
        case MSG.CHAINING: {
          this.chain.push({ code: m.code, p: m.controller }); this.addLog(`Kette ${this.chain.length}: «${nameOf(m.code)}» (${this.pname(m.controller)})`); this.renderTop(); beep('chain');
          await this.banner({ title: `Kette ${this.chain.length}`, sub: nameOf(m.code), code: m.code, cls: 'chain', ms: 800 }); break; }
        case MSG.CHAIN_NEGATED: case MSG.CHAIN_DISABLED: this.addLog('Der Effekt wurde negiert'); await this.banner({ title: 'Negiert!', cls: 'neg', ms: 500 }); break;
        case MSG.CHAIN_END: this.chain = []; this.renderTop(); break;
        case MSG.ATTACK: {
          const ac = this.cardAt(m.card.controller, m.card.location, m.card.sequence); const an = ac && this.visible(ac) ? nameOf(ac.code) : 'Ein Monster'; const tc = m.target ? this.cardAt(m.target.controller, m.target.location, m.target.sequence) : null; const tg = m.target ? (tc && this.visible(tc) ? nameOf(tc.code) : 'ein verdecktes Monster') : null;
          this.addLog(`${an} greift ${tg ? '«' + tg + '»' : 'direkt'} an`); beep('hit'); await this.banner({ title: '⚔ Angriff', sub: `${an} → ${tg ? tg : 'direkt'}`, cls: 'atk', ms: 700 }); break; }
        case MSG.DAMAGE: this.addLog(`${this.pname(m.player)} erleidet ${m.amount} Schaden`); this.floats.push({ p: m.player, d: -m.amount }); beep('hit'); break;
        case MSG.RECOVER: this.addLog(`${this.pname(m.player)} erhält ${m.amount} LP`); this.floats.push({ p: m.player, d: m.amount }); break;
        case MSG.PAY_LPCOST: this.addLog(`${this.pname(m.player)} zahlt ${m.amount} LP`); this.floats.push({ p: m.player, d: -m.amount }); break;
        case MSG.TOSS_COIN: this.addLog(`Münzwurf: ${m.results.map((x) => (x ? 'Kopf' : 'Zahl')).join(', ')}`); await this.banner({ title: '🪙 Münzwurf', sub: m.results.map((x) => (x ? 'Kopf' : 'Zahl')).join(' · '), ms: 900 }); break;
        case MSG.TOSS_DICE: this.addLog(`Würfel: ${m.results.join(', ')}`); await this.banner({ title: '🎲 Würfel', sub: m.results.join(' · '), ms: 900 }); break;
        case MSG.MOVE: this.logMove(m); break;
        case MSG.CONFIRM_CARDS: case MSG.CONFIRM_DECKTOP: case MSG.CONFIRM_EXTRATOP: await this.confirmShow(m); break;
        default: break;
      }
    }
  }
  attackerName(c, tgt) { return nameOf(c.code) + (tgt ? '' : ''); }
  logMove(m) {
    const to = m.to.location, from = m.from.location; if (from === to && m.from.controller === m.to.controller) return;
    const n = this.seeCard(m.card, m.to.controller, m.to.position) || to === LOC.GRAVE || to === LOC.REMOVED ? `«${nameOf(m.card)}»` : 'Eine Karte';
    if (to === LOC.GRAVE && from !== LOC.GRAVE) this.addLog(`${n} → Friedhof (${m.reason & 1 ? 'zerstört' : m.reason & 0x4000 ? 'abgeworfen' : 'geschickt'})`);
    else if (to === LOC.REMOVED) this.addLog(`${n} wird verbannt`);
    else if (to === LOC.HAND && (from & (LOC.MZONE | LOC.SZONE | LOC.GRAVE | LOC.REMOVED))) this.addLog(`${n} kehrt auf die Hand zurück`);
    else if ((to === LOC.DECK || to === LOC.EXTRA) && (from & (LOC.MZONE | LOC.SZONE | LOC.GRAVE | LOC.REMOVED))) this.addLog(`${n} geht zurück ins Deck`);
    else if (to === LOC.HAND && from === LOC.DECK) this.addLog(`${this.pname(m.to.controller)} fügt eine Karte aus dem Deck der Hand hinzu`);
  }
  confirmShow(m) {
    if (!m.cards || !m.cards.length) return Promise.resolve();
    return new Promise((res) => {
      const mo = openModal({ host: this.root, title: m.type === MSG.CONFIRM_CARDS ? 'Karten werden gezeigt' : 'Oberste Karte(n)', center: true, body: h('div', { class: 'cgrid' }, m.cards.map((c) => h('button', { class: 'cg', onclick: () => this.info(c.code) }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'small' }, nameOf(c.code))))), footer: h('button', { class: 'btn pri', onclick: () => mo.close() }, 'OK'), onClose: () => res() });
      this.addLog('Karten wurden gezeigt: ' + m.cards.map((c) => '«' + nameOf(c.code) + '»').join(', '));
    });
  }
  async finish(winner, reason) {
    this.ended = true; this.stopped = true; if (this.net) { this.net.inDuel = false; this.net.wantAwake = false; keepAwake(false); }
    const draw = winner == null || winner > 1; const stats = store.get('stats', {});
    if (!draw) for (let p = 0; p < 2; p++) { if (!this.conf.human[p] || (this.net && p !== this.viewer)) continue; const id = this.deckOf(p).id; if (!id) continue; const s = stats[id] || { w: 0, l: 0 }; if (p === winner) s.w++; else s.l++; stats[id] = s; }
    store.set('stats', stats); beep('win');
    const name = draw ? 'Unentschieden' : `${this.pname(winner)} gewinnt!`;
    this.closeSheet(); this.clearBar();
    openModal({ host: this.root, title: '', center: true, cls: 'win', body: h('div', { class: 'win-b' }, h('div', { class: 'win-ic' }, draw ? '🤝' : '🏆'), h('h2', { class: 'title-glow' }, name), h('p', { class: 'muted' }, victoryText(reason)), h('p', { class: 'small muted' }, `Das Duell dauerte ${this.turnNo} Züge. Endstand: ${this.pname(0)} ${this.snap.lp[0]} · ${this.pname(1)} ${this.snap.lp[1]}`)),
      footer: this.net ? [h('button', { class: 'btn ghost', onclick: () => { this.destroy(); netMenu(); } }, 'Zum Raum'), h('button', { class: 'btn pri', onclick: (e) => { e.target.disabled = true; e.target.textContent = 'Warte …'; netRematch(this); } }, '↻ Revanche')]
        : [h('button', { class: 'btn ghost', onclick: () => { this.destroy(); navRoot('home'); } }, 'Zum Menü'), h('button', { class: 'btn', onclick: () => { this.destroy(); back(); } }, 'Neue Decks'), h('button', { class: 'btn pri', onclick: () => { this.destroy(); navRoot('duel', this.conf); } }, '↻ Revanche')] });
  }

  // ---------------------------------------------------------------- Darstellung
  cardAt(p, l, s) { const a = this.snap && this.snap.players[p][LK[l]]; return a ? a[s] || null : null; }
  visible(c) { return c && (c.controller === this.viewer || (c.position & FACEUP) > 0); }
  /** Ist eine in einer Auswahl genannte Karte für den Betrachter sichtbar? */
  selVisible(s) { if (s.controller === this.viewer) return true; const c = this.cardAt(s.controller, s.location, s.sequence); if (c) return (c.position & FACEUP) > 0; return s.position !== undefined ? (s.position & FACEUP) > 0 : false; }
  render() { if (!this.snap) return; this.renderTop(); this.renderStrips(); this.renderBoard(); this.renderHand(); }
  renderTop() {
    const tp = this.turnPlayer;
    this.turnEl.textContent = this.turnNo ? `Zug ${this.turnNo} · ${PHASE[this.phase] || ''} · ${this.pname(tp)}` : 'Duell beginnt …';
    this.chainEl.textContent = this.chain.length ? `⛓ ${this.chain.length}` : ''; this.chainEl.style.display = this.chain.length ? '' : 'none';
    this.tipBtn.style.display = this.conf.tutor && this.conf.human[this.viewer] ? '' : 'none';
  }
  renderStrips() {
    const s = this.snap; const v = this.viewer, o = 1 - v;
    for (const [bar, p] of [[this.oppBar, o], [this.meBar, v]]) {
      const lp = s.lp[p]; const pl = s.players[p]; const max = Math.max(this.conf.lp, lp);
      const cur = this.lpShown[p]; const fl = this.floats.filter((f) => f.p === p); this.floats = this.floats.filter((f) => f.p !== p);
      clear(bar); const hb = h('div', { class: 'lpbar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (lp / max) * 100))}%` }));
      const num = h('div', { class: 'lpn' }, String(cur)); bar.append(h('div', { class: 'st-n' + (this.turnPlayer === p ? ' act' : '') }, this.pname(p)), h('div', { class: 'lpw' }, hb, num),
        h('div', { class: 'st-c' }, p === o ? h('span', { class: 'hbacks' }, Array.from({ length: Math.min(pl.hand.length, 12) }, () => h('i'))) : null, h('span', { class: 'chip' }, `🂠 ${pl.deck}`), p === o ? h('span', { class: 'chip' }, `✋ ${pl.hand.length}`) : null));
      this.tweenLp(p, num, cur, lp); this.lpShown[p] = lp;
      for (const f of fl) { const e = h('div', { class: 'lpf ' + (f.d < 0 ? 'neg' : 'pos') }, (f.d > 0 ? '+' : '') + f.d); bar.append(e); setTimeout(() => e.remove(), 1600); }
    }
  }
  tweenLp(p, el, from, to) { if (from === to || !this.anim) { el.textContent = String(to); return; } const t0 = performance.now(); const dur = 700; const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = String(Math.round(from + (to - from) * k)); if (k < 1 && el.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }

  zone(p, l, s, row, col, opt = {}) {
    const k = key(p, l, s); const c = this.cardAt(p, l, s);
    const z = h('div', { class: 'zn' + (opt.cls ? ' ' + opt.cls : ''), style: `grid-row:${row};grid-column:${col}`, 'data-k': k });
    if (opt.label) z.append(h('span', { class: 'zl' }, opt.label));
    if (c) z.append(this.cardNode(c)); this.mark(z, k); return z;
  }
  mark(z, k) {
    if (this.acts.has(k)) z.classList.add('hl'); if (this.cand.has(k)) z.classList.add('cand'); if (this.chosen.has(k)) z.classList.add('chosen'); if (this.tipKeys.has(k)) z.classList.add('tip');
    if (this.zoneSel && this.zoneSel.allowed.has(k)) z.classList.add('zsel'); if (this.zoneSel && this.zoneSel.chosen.has(k)) z.classList.add('zchosen');
  }
  cardNode(c) {
    const vis = this.visible(c); const own = c.controller === this.viewer; const def = !!(c.position & 12);
    const ctr = Object.values(c.counters || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    return fieldEl(c.code, { back: !vis, peek: own && !(c.position & FACEUP), def, atk: c.attack, defv: c.defense, over: (c.overlayCards || []).length, counters: ctr });
  }
  pile(p, l, row, col, label) {
    const pl = this.snap.players[p]; const arr = l === LOC.GRAVE ? pl.grave : l === LOC.EXTRA ? pl.extra : l === LOC.REMOVED ? pl.banished : null;
    const n = l === LOC.DECK ? pl.deck : arr.length; const k = key(p, l, 0);
    const z = h('div', { class: 'zn pile', style: `grid-row:${row};grid-column:${col}`, 'data-k': k }, h('span', { class: 'zl' }, label));
    if (n) {
      let top = null;
      if (l === LOC.GRAVE) top = arr[arr.length - 1];
      else if (l === LOC.EXTRA) top = null;
      if (top) z.append(this.cardNode({ ...top, position: top.position | 1 })); else z.append(h('div', { class: 'fwrap' }, h('div', { class: 'fcard back' })));
      z.append(h('span', { class: 'pn' }, n));
    }
    if (l === LOC.GRAVE && pl.banished.length) z.append(h('button', { class: 'bchip', 'data-k': key(p, LOC.REMOVED, 0) }, '⊘' + pl.banished.length));
    // Aktionen in Stapeln (Extradeck, Friedhof, Verbannt)
    if ([...this.acts.keys()].some((x) => x.startsWith(`${p}:${l}:`)) || (l === LOC.GRAVE && [...this.acts.keys()].some((x) => x.startsWith(`${p}:${LOC.REMOVED}:`)))) z.classList.add('hl');
    if ([...this.cand.keys()].some((x) => x.startsWith(`${p}:${l}:`))) z.classList.add('cand');
    return z;
  }
  renderBoard() {
    const v = this.viewer, o = 1 - v; const b = this.board; clear(b); b.className = 'bd' + (this.mode.emz ? ' emz' : ' noemz');
    const colMe = (s) => s + 2, colOp = (s) => 6 - s;
    for (const [p, rowM, rowS, col, mir] of [[o, 2, 1, colOp, true], [v, 4, 5, colMe, false]]) {
      for (let s = 0; s < 5; s++) {
        b.append(this.zone(p, LOC.MZONE, s, rowM, col(s)));
        const pz = this.mode.pzone && (s === 0 || s === 4) ? (s === 0 ? 'pz pz-l' : 'pz pz-r') : '';
        b.append(this.zone(p, LOC.SZONE, s, rowS, col(s), { cls: pz }));
      }
      b.append(this.zone(p, LOC.SZONE, 5, rowS, mir ? 7 : 1, { cls: 'fz', label: 'Feld' }));
      b.append(this.pile(p, LOC.EXTRA, rowM, mir ? 7 : 1, 'Extra'));
      b.append(this.pile(p, LOC.GRAVE, rowM, mir ? 1 : 7, 'Friedhof'));
      b.append(this.pile(p, LOC.DECK, rowS, mir ? 1 : 7, 'Deck'));
    }
    if (this.mode.emz) { // gemeinsame Extra-Monsterzonen: links = eigene 5 / gegnerische 6
      for (const [col, ms, mo] of [[3, 5, 6], [5, 6, 5]]) {
        const own = this.cardAt(v, LOC.MZONE, ms), opp = this.cardAt(o, LOC.MZONE, mo); const k1 = key(v, LOC.MZONE, ms), k2 = key(o, LOC.MZONE, mo);
        const kk = !own && opp ? k2 : k1;
        const z = h('div', { class: 'zn emzn', style: `grid-row:3;grid-column:${col}`, 'data-k': kk, 'data-k2': kk === k1 ? k2 : k1 });
        const c = own || opp; if (c) z.append(this.cardNode(c)); else z.append(h('span', { class: 'zl' }, 'EMZ'));
        this.mark(z, kk);
        if (this.zoneSel) { if (this.zoneSel.allowed.has(k1) || this.zoneSel.allowed.has(k2)) z.classList.add('zsel'); if (this.zoneSel.chosen.has(k1) || this.zoneSel.chosen.has(k2)) z.classList.add('zchosen'); }
        b.append(z);
      }
    }
    b.append(h('div', { class: 'midinfo', style: 'grid-row:3;grid-column:' + (this.mode.emz ? '1 / 3' : '1 / 8') }, this.mode.emz ? '' : this.phaseLine()));
  }
  phaseLine() { return this.turnNo ? `${PHASE[this.phase] || ''}` : ''; }
  renderHand() {
    const v = this.viewer; const hand = this.snap.players[v].hand; clear(this.handEl);
    const n = this.newHand; this.newHand = 0;
    hand.forEach((c, i) => {
      if (!c) return; const k = key(v, LOC.HAND, c.sequence); const el = h('div', { class: 'hc', 'data-k': k, style: hand.length > 6 ? 'margin-left:-14px' : '' }, cardEl(c.code, { cls: 'hcard' }));
      if (i >= hand.length - n) el.classList.add('new'); this.mark(el, k); this.handEl.append(el);
    });
  }

  // ---------------------------------------------------------------- Berührungen
  tapKey(k, el) {
    if (this.zoneSel) { const kk = [k, el && el.dataset.k2].find((x) => x && this.zoneSel.allowed.has(x)); if (kk) { this.zoneSel.toggle(kk); return; } }
    const [p, l, s] = k.split(':').map(Number);
    if (el && (el.classList.contains('pile') || el.classList.contains('bchip'))) { this.pileView(p, l); return; }
    if (this.cand.has(k)) { this.cand.get(k)(k); return; }
    const c = this.cardAt(p, l, s); if (c) this.openSheet(c, k);
  }
  pileView(p, l) {
    const pl = this.snap.players[p]; const own = p === this.viewer;
    if (l === LOC.DECK) { toast(`${own ? 'Dein' : 'Gegnerisches'} Deck: ${pl.deck} Karten`); return; }
    let arr = l === LOC.GRAVE ? pl.grave : l === LOC.REMOVED ? pl.banished : pl.extra; arr = arr.filter(Boolean);
    const shown = arr.filter((c) => own || (c.position & FACEUP)); const hiddenN = arr.length - shown.length;
    const title = `${p === this.viewer ? 'Dein' : this.pname(p) + 's'} ${l === LOC.GRAVE ? 'Friedhof' : l === LOC.REMOVED ? 'verbannte Karten' : 'Extradeck'} (${arr.length})`;
    const body = h('div', null, hiddenN ? h('p', { class: 'small muted' }, `${hiddenN} verdeckte Karte(n) nicht sichtbar.`) : null, shown.length ? h('div', { class: 'cgrid' }, [...(l === LOC.GRAVE ? [...shown].reverse() : shown)].map((c) => { const k = key(c.controller, c.location, c.sequence); const e = h('button', { class: 'cg' + (this.acts.has(k) ? ' hl' : '') + (this.cand.has(k) ? ' cand' : '') + (this.chosen.has(k) ? ' chosen' : ''), onclick: () => { m.close(); if (this.cand.has(k)) this.cand.get(k)(k); else this.openSheet(c, k); } }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'small' }, cleanName(c.name))); return e; })) : h('p', { class: 'muted' }, 'Leer.'));
    const m = openModal({ host: this.root, title, body, footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen') });
  }
  info(code) { const m = openModal({ host: this.root, title: null, body: cardInfoBody(code), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen') }); return m; }
  openSheet(c, k) {
    const vis = this.visible(c); clear(this.sheet); this.sheet.classList.add('open');
    const acts = this.acts.get(k) || [];
    const own = c.controller === this.viewer; const card = cardOf(c.code);
    const head = vis ? h('div', { class: 'sh-top' }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, cleanName(c.name)), h('div', { class: 'small muted' }, typeText(card)), (card.type & 1) ? h('div', { class: 'small' }, [attrName(card.attribute), levelText(card)].filter(Boolean).join(' · ')) : null, (card.type & 1) ? h('div', { class: 'small gold' }, statsText({ ...card, attack: c.attack, defense: c.defense }) + (c.attack !== card.attack || c.defense !== card.defense ? ' (aktuell)' : '')) : null))
      : h('div', { class: 'sh-top' }, cardEl(0, { back: true, cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, 'Verdeckte Karte'), h('div', { class: 'small muted' }, `von ${this.pname(c.controller)}`)));
    this.sheet.append(h('button', { class: 'sh-x', onclick: () => this.closeSheet() }, '✕'), head, vis ? h('div', { class: 'sh-t' }, (card.desc || '').replace(/\r/g, '')) : null);
    if (acts.length) this.sheet.append(h('div', { class: 'sh-acts' }, acts.map((a) => h('button', { class: 'btn ' + (a.pri ? 'pri' : ''), onclick: () => { this.closeSheet(); this.answer(a.resp); } }, a.label))));
    else if (own && this.pending && this.pending.kind === 'idle') this.sheet.append(h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Mit dieser Karte ist gerade keine Aktion möglich.'));
    this.sheet.append(h('button', { class: 'btn ghost sm', style: 'margin-top:8px', onclick: () => this.info(c.code) }, 'Ganzen Text'));
    if (!vis) this.sheet.lastChild.remove();
  }
  closeSheet() { this.sheet.classList.remove('open'); clear(this.sheet); }
  phaseHelp() { const t = PHASE_HELP[this.phase === 16 || this.phase === 32 || this.phase === 64 || this.phase === 128 ? 8 : this.phase]; if (t) toast(t, 5000); }
  showChain() {
    if (!this.chain.length) return;
    const m = openModal({ host: this.root, title: 'Aktuelle Kette', body: h('div', { class: 'col' }, [...this.chain].reverse().map((c, i) => h('div', { class: 'row' }, h('div', { class: 'pl-num' }, this.chain.length - i), cardEl(c.code, { cls: 'sm' }), h('div', { class: 'grow' }, h('b', null, nameOf(c.code)), h('div', { class: 'small muted' }, this.pname(c.p)))))), footer: [h('div', { class: 'small muted grow' }, 'Das oberste Kettenglied wird zuerst ausgeführt.'), h('button', { class: 'btn', onclick: () => m.close() }, 'OK')] });
  }
  showLog() { const m = openModal({ host: this.root, title: 'Verlauf', body: h('div', { class: 'logl' }, [...this.logLines].reverse().map((l) => h('div', { class: l.startsWith('──') ? 'lg-t' : 'lg' }, l))), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen') }); }
  menu() {
    const m = openModal({ host: this.root, title: 'Duell', center: true, body: h('div', { class: 'col' },
      h('button', { class: 'btn', onclick: () => { m.close(); this.showLog(); } }, '📜 Verlauf'),
      h('button', { class: 'btn', onclick: () => { this.anim = !this.anim; store.set('anim', this.anim); toast(this.anim ? 'Animationen an' : 'Animationen aus (schneller)'); m.close(); } }, `✨ Animationen: ${this.anim ? 'an' : 'aus'}`),
      h('button', { class: 'btn', onclick: () => { m.close(); this.surrender(); } }, '🏳 Aufgeben'),
      h('button', { class: 'btn red', onclick: async () => { m.close(); if (this.net) { if (await confirmBox('Duell verlassen?', 'Das Online-Duell wird für beide beendet.', 'Verlassen', 'Weiterspielen', true)) { this.net.send({ t: 'leave' }); this.destroy(); netMenu(); } } else back(); } }, '⟵ Duell verlassen')), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Weiterspielen') });
  }
  async surrender() {
    if (!this.conf.human[this.viewer] || !(await confirmBox('Aufgeben?', `${this.pname(this.viewer)} gibt auf.`, 'Aufgeben', 'Weiter', true))) return;
    const w = 1 - this.viewer; if (this.net) this.net.send({ t: 'surrender', seat: this.viewer }); if (this.host) this.host.abort(); if (this.eng && this.eng.abort) this.eng.abort(); if (this.pending) { this.pending.resolve(null); this.pending = null; } this.stopped = true; await this.finish(w, 0);
  }

  // ---------------------------------------------------------------- Prompt-Bereich & Antworten
  setBar(text, buttons = [], sub) {
    clear(this.bar); this.bar.append(h('div', { class: 'bar-t' }, h('div', { class: 'bar-m' }, text), sub ? h('div', { class: 'bar-s' }, sub) : null), h('div', { class: 'bar-b' }, buttons.map((b) => h('button', { class: 'btn ' + (b.cls || ''), disabled: b.disabled, onclick: b.onclick }, b.label))));
  }
  clearBar() { clear(this.bar); this.bar.append(h('div', { class: 'bar-t' }, h('div', { class: 'bar-m muted' }, ''))); }
  /** wartet auf eine Antwort der Oberfläche */
  wait(kind) { return new Promise((resolve) => { this.pending = { resolve, kind }; }); }
  answer(resp) { const p = this.pending; if (!p) return; this.pending = null; this.cand = new Map(); this.chosen = new Set(); this.zoneSel = null; this.acts = new Map(); this.tipKeys = new Set(); this.tip = null; this.closeSheet(); this.clearBar(); if (this.snap) this.render(); p.resolve(resp); }
  setTip(t) { this.tip = t; }
  showTip() {
    this.tipBtn.classList.remove('pulse'); const t = this.tip; if (!t) { toast('Gerade gibt es nichts zu raten.'); return; }
    this.tipKeys = new Set(t.keys || []); this.render();
    const m = openModal({ host: this.root, title: '💡 Tipp vom Tutor', center: true, cls: 'peek', body: h('p', { class: 'tut-g' }, t.text), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'Verstanden') });
  }
}

screens.duel = (conf) => { const d = new Duel(conf); queueMicrotask(() => d.start()); return d.root; };
export { Duel };
