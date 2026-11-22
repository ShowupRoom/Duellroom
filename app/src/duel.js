// Duell-Oberfläche: Spielfeld, Hand, Ereignisse, Übergabe zwischen den Spielern
import { applyLook } from './look.js';
import { matchModal } from './match.js';
import { h, clear, sleep, toast, shuffled, beep, rand32, zkey as key } from './util.js';
import { App, MODES, FORMATS, fmtById, expand, nameOf, cardOf, cleanName, withTutor, descOf } from './data.js';
import { DuelAI } from '../../src/ai.mjs';
import { randomResponse, OcgResponseType as R, OcgMessageType as MSG, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, LOC, MSG_NAME } from '../../src/core.mjs';
import { cardEl, fieldEl, fieldCfg, setFieldFull } from './cards.js';
import { openModal, confirmBox, cardInfoBody } from './ui.js';
import { effectView, mergeViews, markNode, revealMark } from './effecttext.js';
import { screens, back, replace, root as navRoot, setGuard } from './nav.js';
import { store } from './store.js';
import { sys, descText, PHASE, PHASE_HELP, victoryText, typeText, levelText, attrName, statsText } from './strings.js';
import { idleTip, battleTip, introText } from './tips.js';
import { explain, readMs, boardText, ReplayBot, endBoard } from './demo.js';
import { ask, autoAnswer } from './prompts.js';
import { settings, handComment } from './screens.js';
import { LocalEngine, RemoteEngine, HostLink, maskEvents, searchCombo, stopSearch } from './engine.js';
import { passiveReply, passiveRng, GOALS } from '../../src/combo.mjs';
import { scanDeck, scanLines } from '../../src/deckscan.mjs';
import { session, keepAwake } from './net.js';
import { netRematch, netMenu } from './online.js';

// KI-Tempo: Pause nach einer Entscheidung der KI in ms [Hauptbefehl (Beschwören, Aktivieren, Angriff …), Auswahlfenster] und Faktor für ihre Einblendungen
const AIP = { relaxed: { name: 'Entspannt', pause: [1500, 400], fx: 1.35, rd: 1 }, normal: { name: 'Normal', pause: [650, 150], fx: 0.8, rd: 0.7 }, fast: { name: 'Schnell', pause: [120, 0], fx: 0, rd: 0.35 } };
const PH_PILLS = [['DP', 'Ziehphase', [1]], ['SP', 'Standby-Phase', [2]], ['M1', 'Main Phase 1', [4]], ['BP', 'Kampfphase', [8, 16, 32, 64, 128]], ['M2', 'Main Phase 2', [256]], ['EP', 'End Phase', [512]]];
const LK = { [LOC.HAND]: 'hand', [LOC.MZONE]: 'mzone', [LOC.SZONE]: 'szone', [LOC.GRAVE]: 'grave', [LOC.REMOVED]: 'banished', [LOC.EXTRA]: 'extra' };
const FACEUP = 5;

class Duel {
  constructor(conf) {
    applyLook(true); this.conf = conf; this.mode = MODES[conf.fmt]; if (this.mode.lp) conf.lp = this.mode.lp; // Speed Duell: fest 4000 LP this.fmtDef = fmtById(conf.fmt, conf.list);
    this.net = conf.mode === 'net-host' || conf.mode === 'net-guest' ? session : null; this.viewer = this.net ? conf.seat : conf.mode === 'demo' ? 0 : (conf.human[0] ? 0 : 1); this.snap = null; this.logLines = []; this.chain = []; this.stopped = false; this.turnNo = 0; this.phase = 0; this.turnPlayer = 0;
    this.actList = []; this.acts = new Map(); this.cand = new Map(); this.chosen = new Set(); this.zoneSel = null; this.tip = null; this.tipKeys = new Set(); this.pending = null; this.hintText = ''; this.introShown = [false, false];
    this.lpShown = [conf.lp, conf.lp]; this.floats = []; this.prevHand = [0, 0]; this.newHand = 0; this.anim = store.get('anim', true); this.tempo = store.get('tempo', 'fast'); this.aiPace = AIP[store.get('aipace', 'relaxed')] ? store.get('aipace', 'relaxed') : 'relaxed'; this.ff = false; this.naps = new Set(); this.aiBusy = false; // Effekt-Tempo: schnell (Standard) oder normal
    this.demo = conf.mode === 'demo' ? { auto: true, step: 0, wake: null, timer: null, arm: null, skipFrom: 0, notes: [], anim: 900 } : null; this.pasRnd = passiveRng(); // Kombo-Vorführung: die KI spielt, du schaust zu
    this.build(); window.__duel = this; this.ask = (m) => ask(this, m); // (Prüfhaken für Tests)
  }
  deckOf(p) { return this.conf.players[p].deck; }
  pname(p) { return this.conf.players[p].name; }

  // ---------------------------------------------------------------- Aufbau
  build() {
    const r = this.root = h('div', { 'data-v': this.viewer, class: 'screen duel' + (this.demo ? ' demo' : '') + (this.mode.emz ? ' has-emz' : '') + (this.tempo === 'fast' ? ' fxfast' : '') });
    this.turnEl = h('div', { class: 'd-turn' }); this.chainEl = h('button', { class: 'd-chainb', onclick: () => this.showChain() });
    this.tipBtn = h('button', { class: 'ibtn tipb', title: 'Tutor-Tipp', onclick: () => this.showTip() }, '💡');
    this.ffBtn = h('button', { class: 'ibtn ffb', title: 'Vorspulen bis zu deiner nächsten Entscheidung', onclick: () => this.setFF(!this.ff) }, '⏩'); this.ffBtn.style.display = 'none';
    this.top = h('div', { class: 'd-top' }, h('button', { class: 'ibtn', onclick: () => this.menu() }, '☰'), this.turnb = h('button', { class: 'd-turnb', onclick: () => this.phaseHelp() }, this.turnEl), this.chainEl, this.tipBtn, h('button', { class: 'ibtn', onclick: () => this.showLog() }, '📜'), this.ffBtn);
    this.oppBar = h('div', { class: 'd-strip opp' }); this.meBar = h('div', { class: 'd-strip me' });
    this.boardWrap = h('div', { class: 'd-board' }); this.board = h('div', { class: 'bd' }); this.ohand = h('div', { class: 'd-ohand' }); this.boardWrap.append(this.board, this.ohand);
    this.wheel = h('button', { class: 'ph-wheel', title: 'Phase wählen', onclick: () => this.phaseTap() }, h('b', null, '–'), h('small', null, ''));
    this.phaseEl = h('div', { class: 'd-phases' }, this.wheel, h('div', { class: 'ph-pills' }, PH_PILLS.filter((x) => !(this.mode.noM2 && x[0] === 'M2')).map((x) => h('button', { class: 'ph', 'data-ph': x[0], title: x[1], onclick: () => this.phasePick(x[0]) }, x[0]))));
    this.board.addEventListener('click', (e) => { const z = e.target.closest('[data-k]'); if (z) this.tapKey(z.dataset.k, z); });
    this.handEl = h('div', { class: 'd-hand' }); this.handEl.addEventListener('click', (e) => { const z = e.target.closest('[data-k]'); if (z) this.tapKey(z.dataset.k, z); }); this.bar = h('div', { class: 'd-bar' });
    this.sheet = h('div', { class: 'd-sheet' }); this.actsEl = h('div', { class: 'd-acts' }); this.fx = h('div', { class: 'd-fx' });
    this.over = h('div', { class: 'd-over' });
    this.demoEl = this.demo ? this.buildDemo() : null;
    this.testBar = this.conf.test ? this.buildTestBar() : null;
    // Hochformat: Spalten lösen sich auf (display:contents) und werden untereinander gestapelt.
    // Querformat (wie Master Duel): links Gegner/Karteninfo/Du, Mitte Feld mit Hand unten, rechts Phasen und Aktionen.
    const col = (c, ...kids) => h('div', { class: 'd-col ' + c }, ...kids);
    this.colR = col('d-r', this.top, this.testBar, this.phaseEl, this.actsEl, this.bar);
    r.append(col('d-l', this.oppBar, this.demoEl, this.sheet, this.meBar), col('d-c', this.boardWrap, this.handEl), this.colR, this.fx, this.over);
    this.probe = h('div', { class: 'd-probe' }); r.append(this.probe);
    this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(this.boardWrap); this.ro.observe(this.bar); this.ro.observe(r);
  }
  /** Sicherheitsabstände (Notch, Dynamic Island, Home-Balken) in Pixeln */
  safe() { const cs = getComputedStyle(this.probe); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; }
  /** Wo Phasenrad und Zugschild stehen: Querformat mit Extra-Monsterzonen = Rad mittig im Feld zwischen den beiden Link-Feldern,
   *  sonst über den Aktionen rechts; Zugschild immer über den Aktionen. Hochformat: beides in der Kopfzeile. */
  place(land) {
    const inBoard = land && !!this.mode.emz;
    if (land) { if (this.turnb.parentNode !== this.colR) this.colR.insertBefore(this.turnb, this.actsEl); } else if (this.turnb.parentNode !== this.top) this.top.insertBefore(this.turnb, this.chainEl);
    const want = inBoard ? this.board : land ? this.colR : this.top;
    if (this.phaseEl.parentNode !== want) { if (want === this.colR) this.colR.insertBefore(this.phaseEl, this.actsEl); else if (want === this.top) this.top.insertBefore(this.phaseEl, this.top.children[1] || null); else want.append(this.phaseEl); }
  }
  fit() {
    const R = this.root; const W = R.clientWidth, H = R.clientHeight; if (!W || !H) return;
    const land = W / H >= 1.3; R.classList.toggle('land', land);
    this.place(land);
    if (land) {
      // Querformat: die Kartengröße richtet sich nach der Höhe (5 Reihen + herausschauende Hand + Gegnerhand)
      const sp = this.safe(); const RH = 1.1; // Querformat: Zonen fast quadratisch (Kartenausschnitt) – so wird das Feld größer
      const rowsH = this.mode.emz ? 5 * RH : 4 * RH + 0.32; const gaps = 4 * 3 + 6; R.style.setProperty('--rh', RH);
      const SIDER = this.demo ? (this.mode.emz ? 64 : 132) : 156, MINL = this.demo ? 240 : 176; // rechts: senkrechte Symbolleiste + Aktionen, links bekommt den Rest für die Karteninfo
      const cwH = (H - sp.t - sp.b - gaps - 4) / (rowsH + 0.34 + 1.0); const cwW = (W - sp.l - sp.r - SIDER - MINL - 18 - 12 - 16) / (this.mode.cols3 ? 5 : 7);
      const cw = Math.max(30, Math.min(cwH, cwW, 112)); const boardW = cw * (this.mode.cols3 ? 5 : 7) + 18 + 12;
      const st = R.style; st.setProperty('--cw', cw.toFixed(1) + 'px'); st.setProperty('--hpk', (cw * 1.0).toFixed(1) + 'px'); st.setProperty('--opk', (cw * 0.34).toFixed(1) + 'px');
      const sidel = Math.max(MINL, W - sp.l - sp.r - boardW - SIDER - 16); st.setProperty('--sidel', sidel.toFixed(0) + 'px'); st.setProperty('--sider', SIDER + 'px'); st.setProperty('--sidew', sidel.toFixed(0) + 'px'); st.setProperty('--barh', '0px');
      if (this._land !== true) { this._land = true; this.sheet.classList.remove('open'); this._sheetSig = null; this.renderSheet(true); } return;
    }
    R.style.setProperty('--rh', '1.42');
    if (this._land !== false) { this._land = false; clear(this.actsEl); clear(this.sheet); this.sheet.classList.remove('open'); this._sheetSig = null; }
    const b = this.boardWrap.getBoundingClientRect(); if (!b.width || !b.height) return;
    const rows = this.mode.emz ? 5 : 4.35; const cw = Math.max(30, Math.min((b.width - 22) / (this.mode.cols3 ? 5 : 7), b.height / (rows * 1.42 + 0.35), 96));
    R.style.setProperty('--cw', cw.toFixed(1) + 'px'); R.style.setProperty('--barh', this.bar.offsetHeight + 'px'); R.style.setProperty('--sidew', '100%');
  }

  // ---------------------------------------------------------------- Start & Schleife
  async start() {
    setGuard(async () => { const ok = await confirmBox('Duell verlassen?', this.net ? 'Das Online-Duell wird für beide beendet.' : 'Der Spielstand geht verloren.', 'Verlassen', 'Weiterspielen', true); if (ok) { if (this.net) this.net.send({ t: 'leave' }); this.destroy(); } return ok; });
    this.fit();
    const { conf } = this; const m = this.mode;
    if (conf.mode === 'ai' || conf.mode === 'bot') this.ai = new DuelAI(App.cards, conf.level || 'normal');
    if (this.demo) { this.bots = [new DuelAI(App.cards, 'stark'), conf.demoOpp === 'ai' ? new DuelAI(App.cards, 'stark') : null]; this.ai = this.bots[0]; }
    if (this.net) this.netSetup();
    try {
      if (conf.mode === 'net-guest') this.eng = conf.remote;
      else {
        const mk = (i) => ({ main: expand(conf.players[i].deck.main), extra: expand(conf.players[i].deck.extra) });
        const seed = conf.seed ? conf.seed.map((x) => BigInt(x)) : [BigInt(rand32()), BigInt(rand32()), BigInt(rand32()), BigInt(rand32())]; this.seedUsed = seed.map(Number);
        const copts = this.copts = { flags: m.flags, decks: [mk(0), mk(1)], scripts: m.scripts, seed, lp: conf.lp, hand: m.hand, stack: conf.stack, field: conf.field };
        if (this.demo && conf.demoOpp !== 'ai' && conf.demoMs > 0) { // Kombo-Suche: erst die beste Variante für diese Starthand finden, dann vorspielen
          const found = await this.searchOverlay(copts); if (this.stopped) return;
          if (found) { this.bots[0] = this.ai = new ReplayBot(found.rec, this.bots[0]); this.found = found; }
        }
        this.eng = new LocalEngine(); await this.eng.create(copts);
        if (this.found) this.demoIntro();
        if (conf.mode === 'net-host') this.host = new HostLink(this.net, 1 - this.viewer);
      }
    } catch (e) { this.fatal(e); return; }
    if (!conf.resume && !conf.test) await this.coin();
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
    this.root.append(el); await sleep(this.anim ? 700 * this.fxs() : 100);
    el.querySelector('.coin-t').textContent = `${n} beginnt!`; beep('ok'); await sleep(this.anim ? 650 * this.fxs() : 150); el.remove();
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
      const ta = performance.now(); await this.present(evs); if (this.demo) this.demo.anim = performance.now() - ta;
      if (this.stopped) return;
      this.snap = st.snap;
      if (this.demo && this.found && st.snap.turn % 2 === 0 && this.demo.res !== st.snap.turn) { this.demo.res = st.snap.turn; this.demoNote('Endboard bei der Übergabe: ' + endBoard(this, 0).replace(/^Feld am Zugende: /, '')); } // nach der End Phase (Endphasen-Effekte sind durch)
      if (st.snap.turn && st.snap.turn !== this.turnNo) { this.turnNo = st.snap.turn; this.turnPlayer = st.snap.turnPlayer; if (st.snap.phase) this.phase = st.snap.phase; this.renderTop(); }
      if (r.kind === 'end') { this.render(); await this.finish(r.winner, r.reason); return; }
      if (r.kind === 'wait') { this.render(); this.setBar(`⏳ ${this.pname(r.player)} ist dran …`, [], 'Du kannst dir solange Karten ansehen.'); continue; }
      const msg = r.msg; const p = msg.player;
      if (this.host && p === this.host.gs) {
        this.render(); this.setBar(`⏳ Warte auf ${this.pname(p)} …`, [], 'Du kannst dir solange Karten ansehen.');
        resp = await this.host.waitResp(); if (this.stopped) return; continue;
      }
      if (this.conf.human[p]) {
        const auto = autoAnswer(msg); if (auto) { resp = auto; continue; } // nichts zu entscheiden → kein Fenster, keine Geräteübergabe
        if ((this.aiBusy || this.ff) && !this.watching()) { this.aiBusy = false; this.ff = false; this.renderFF(); } // dein eigener Zug: Vorspulen endet (Rückfragen in Zug der KI unterbrechen es nicht)
        if (this.viewer !== p) await this.handover(p);
        this.render();
        if (r.retry) toast('Das ist nicht erlaubt – bitte noch einmal wählen.');
        if (!this.introShown[p]) { this.introShown[p] = true; if (this.conf.tutor && !this.conf.test) await this.intro(p); }
        resp = await ask(this, msg);
        if (this.stopped) return;
      } else {
        this.render(); if (this.ai && !this.aiBusy) { this.aiBusy = true; this.renderFF(); }
        if (this.demo && p === 0 && this.ai instanceof ReplayBot && this.turnPlayer === 0 && this.turnNo >= 3 && this.demo.searched !== this.turnNo && this.conf.demoMs > 0) { // jeder eigene Zug: neu suchen, wie weit die Hand (und das Feld) reicht
          this.demo.searched = this.turnNo; const found = await this.searchOverlay({ ...this.copts, base: this.ai.hist.slice(), endTurn: this.turnNo + 1 }, this.turnNo); if (this.stopped) return;
          if (found) { this.ai.extend(found.rec); this.found = found; this.demoIntro(this.turnNo); }
        }
        resp = this.botResponse(msg, st.evs, r.retry);
        if (this.demo) await this.demoStep(msg, resp, p); else if (this.ai && this.anim) await this.nap(this.botPause(msg));
      }
    }
  }
  botResponse(msg, evs, retry) {
    if (this.demo && this.bots[msg.player]) return this.bots[msg.player].respond(msg, { snap: this.snap, evs, retry });
    if (this.demo) return passiveReply(msg, this.pasRnd, App.cards); // gleiche Regel wie in der Suche → gleicher Spielverlauf
    if (this.conf.mode === 'solo') { // Übungsgegner: steht still
      if (msg.type === MSG.SELECT_IDLECMD) return { type: R.SELECT_IDLECMD, action: msg.to_ep ? IA.TO_EP : IA.TO_BP, index: null };
      if (msg.type === MSG.SELECT_BATTLECMD) return { type: R.SELECT_BATTLECMD, action: msg.to_ep ? BA.TO_EP : BA.TO_M2, index: null };
      if (msg.type === MSG.SELECT_CHAIN) return msg.forced ? { type: R.SELECT_CHAIN, index: 0 } : { type: R.SELECT_CHAIN, index: null };
    }
    if (this.ai && !this.demo) return this.ai.respond(msg, { snap: this.snap, evs, retry });
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
  destroy() { this.stopped = true; if (this.csEl) { stopSearch(); this.csEl.remove(); this.csEl = null; } this.ff = true; for (const f of [...this.naps]) f(); setGuard(null); try { this.ro.disconnect(); } catch (e) { /* */ } try { if (this.eng && this.eng.destroy) this.eng.destroy(); if (this.eng && this.eng.abort) this.eng.abort(); if (this.host) this.host.abort(); } catch (e) { /* */ } this.eng = null; if (this.offNet) this.offNet(); if (this.net) { this.net.wantAwake = false; keepAwake(false); } if (this.pending) { this.pending.resolve(null); this.pending = null; } }

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
  /** Faktor für alle Wartezeiten der Effekte: schnell = knapp die Hälfte */
  fxs() {
    if (this.ff) return 0.1;
    if (this.demo) return 0.8; // Vorführung: Animationen eher knapp, die Zeit gehört der Erklärung
    const f = AIP[this.aiPace].fx; if (f && this.watching()) return f; // am Zug der KI: eigenes Tempo (entspannt = ruhiger als „normal“)
    return this.tempo === 'fast' ? 0.42 : 1;
  }
  /** Die KI ist am Zug (und ein Mensch schaut zu) */
  watching() { return !!this.ai && !this.conf.human[this.turnPlayer]; }
  /** Pause, die das Vorspulen sofort beendet */
  nap(ms) {
    if (this.ff || !(ms > 0)) return Promise.resolve();
    return new Promise((res) => { const done = () => { clearTimeout(t); this.naps.delete(done); res(); }; const t = setTimeout(done, ms); this.naps.add(done); });
  }
  /** Vorspulen an/aus: überspringt alle Pausen und Einblendungen, bis du wieder etwas entscheiden musst */
  setFF(on) { this.ff = !!on; if (this.ff) for (const f of [...this.naps]) f(); this.renderFF(); }
  renderFF() { this.ffBtn.style.display = this.aiBusy && this.anim && this.ai ? '' : 'none'; this.ffBtn.classList.toggle('on', this.ff); this.root.classList.toggle('ffing', this.ff); }
  /** Wie lange die Entscheidung der KI sichtbar stehen bleibt */
  botPause(msg) { if (this.demo) return 150; return AIP[this.aiPace].pause[msg.type === MSG.SELECT_IDLECMD || msg.type === MSG.SELECT_BATTLECMD ? 0 : 1]; }
  async banner(o) {
    if (!this.anim || this.ff) return;
    let pair = null; // Kette ab 2: vorige und neue Karte nebeneinander – je nach Besitzer links (du) oder rechts (Gegner), mit großer Kettennummer (Vorbild MDPro3)
    if (o.pair) { const mk = (c) => h('div', { class: 'cp-c ' + (c.p === this.viewer ? 'me' : 'op') }, h('div', { class: 'cp-n' }, c.n), cardEl(c.code, { cls: 'md' })); const [a, b] = o.pair; pair = h('div', { class: 'cp' + (a.p === b.p ? ' same' : '') }, ...[a, b].sort((x, y) => (x.p === this.viewer ? 0 : 1) - (y.p === this.viewer ? 0 : 1) || x.n - y.n).map(mk)); }
    const el = h('div', { class: 'fx-b ' + (o.cls || '') + (pair ? ' pairb' : '') + (o.side ? ' ' + o.side : '') }, pair || (o.code ? cardEl(o.code, { cls: 'md' }) : null), o.back ? cardEl(0, { back: true, cls: 'md' }) : null, h('div', { class: 'fx-bt' }, h('div', { class: 'fx-h' }, o.title), o.sub ? h('div', { class: 'fx-s' }, o.sub) : null, o.mark ? h('div', { class: 'fx-tx' }, o.mark) : null));
    this.fx.append(el); if (o.mark) revealMark(el.querySelector('.fx-tx')); let done; const p = new Promise((r) => { done = r; }); el.addEventListener('pointerdown', () => done());
    await Promise.race([this.nap((o.ms || 750) * 0.7 * (o.mark && this.tempo === 'fast' && !(AIP[this.aiPace].fx && this.watching()) ? 0.6 : this.fxs())), p]); el.classList.add('out'); setTimeout(() => el.remove(), this.tempo === 'fast' ? 110 : 200);
  }
  /** Banner-Platz wie in MDPro3: Zug/Phase des eigenen Spielers unten (nah), die des Gegners oben (fern) */
  sideOf(p) { return p === this.viewer ? 'near' : 'far'; }
  seeCard(code, ctrl, pos) { return ctrl === this.viewer || (pos & FACEUP) || pos === undefined; }
  async present(evs) {
    for (const m of evs) {
      const t = m.type;
      switch (t) {
        case MSG.NEW_TURN: this.spCount = [0, 0]; this.turnNo++; this.turnPlayer = m.player; this.phase = 1; this.addLog(`── Zug ${this.turnNo}: ${this.pname(m.player)}`); this.renderTop(); if (this.demo && this.ff && m.player === 0 && this.turnNo > this.demo.skipFrom) this.setFF(false); beep('chain'); await this.banner({ title: `Zug ${this.turnNo}`, sub: this.pname(m.player), cls: 'turn', side: this.sideOf(m.player), ms: 800 }); break;
        case MSG.NEW_PHASE: this.phase = m.phase; this.renderTop(); if (m.phase === 8) { this.addLog('Kampfphase'); await this.banner({ title: 'Kampfphase', cls: 'phase', side: this.sideOf(this.turnPlayer), ms: 550 }); } else if ((m.phase === 0x100 || m.phase === 0x200) && !this.demo) await this.banner({ title: m.phase === 0x100 ? 'Main Phase 2' : 'Endphase', cls: 'phase', side: this.sideOf(this.turnPlayer), ms: 450 }); break;
        case MSG.DRAW: this.addLog(`${this.pname(m.player)} zieht ${m.drawn.length} Karte${m.drawn.length === 1 ? '' : 'n'}`); if (m.player === this.viewer) { this.newHand += m.drawn.length; beep('tap'); } break;
        case MSG.SUMMONING: case MSG.SPSUMMONING: case MSG.FLIPSUMMONING: {
          if (!this.spCount) this.spCount = [0, 0]; if (t === MSG.SPSUMMONING) this.spCount[m.controller]++;
          const k = t === MSG.SUMMONING ? 'Normalbeschwörung' : t === MSG.SPSUMMONING ? 'Spezialbeschwörung' : 'Flipp-Beschwörung';
          this.addLog(`${this.pname(m.controller)}: ${k} – «${nameOf(m.code)}»`); beep('summon'); await this.banner({ title: k, sub: nameOf(m.code), code: m.code, cls: 'summon', ms: 850 }); break; }
        case MSG.SET: this.addLog(`${this.pname(m.controller)} setzt eine Karte`); beep('tap'); break;
        case MSG.CHAINING: {
          this.chain.push({ code: m.code, p: m.controller }); const lbl = descText(m.description, m.code, m.triggering_location != null ? m.triggering_location : m.location); const BT = { 16: 'Battle Step', 32: 'Battle Step', 64: 'Damage Step', 128: 'Schadensberechnung' };
          this.addLog(`Kette ${this.chain.length}: «${nameOf(m.code)}»${lbl && lbl.length < 60 ? ' – ' + lbl : ''} (${this.pname(m.controller)})${BT[this.phase] ? ' · ' + BT[this.phase] : ''}`); this.renderTop(); beep('chain');
          const vw = effectView(m.code, m.description, m.triggering_location != null ? m.triggering_location : m.location); const has = !!(vw.ranges && vw.ranges.length);
          await this.banner({ title: `Kette ${this.chain.length}`, sub: nameOf(m.code), code: m.code, cls: 'chain', pair: this.chain.length > 1 ? this.chain.slice(-2).map((c, i, arr) => ({ ...c, n: this.chain.length - arr.length + i + 1 })) : null, ms: has ? 1100 + Math.min(2400, vw.text.length * 8) : 800, // (Tippen überspringt)
             mark: has ? markNode(vw) : null }); break; }
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
    else if (from === LOC.REMOVED && (to & (LOC.MZONE | LOC.SZONE))) this.addLog(`${n} kehrt aufs Spielfeld zurück`);
    else if (to === LOC.HAND && from === LOC.DECK) this.addLog(`${this.pname(m.to.controller)} fügt eine Karte aus dem Deck der Hand hinzu`);
  }
  /** Offene Hand des Gegners (z. B. unter „Gedankenlesen“) ansehen */
  showHand(p) {
    const pl = this.snap.players[p]; const mo = openModal({ host: this.root, title: `Offene Hand von ${this.pname(p)}`, center: true, body: h('div', { class: 'cgrid' }, pl.hand.map((c) => (c && c.isPublic && c.code ? h('button', { class: 'cg', onclick: () => this.info(c.code) }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'small' }, nameOf(c.code))) : h('div', { class: 'cg' }, cardEl(0, { back: true, cls: 'md' }), h('div', { class: 'small muted' }, 'verdeckt'))))), footer: h('button', { class: 'btn pri', onclick: () => mo.close() }, 'Schließen') });
  }
  confirmShow(m) {
    if (!m.cards || !m.cards.length) return Promise.resolve();
    if (this.demo) { const t = m.cards.map((c) => '«' + nameOf(c.code) + '»').join(', '); this.addLog('Karten wurden gezeigt: ' + t); this.demoNote('Gezeigt: ' + t); return this.demoWait(1300 * AIP[this.aiPace].rd); } // Vorführung: kein Fenster, nur ein Hinweis im Erklärfeld
    return new Promise((res) => {
      const mo = openModal({ host: this.root, title: m.type === MSG.CONFIRM_CARDS ? 'Karten werden gezeigt' : 'Oberste Karte(n)', center: true, body: h('div', { class: 'cgrid' }, m.cards.map((c) => h('button', { class: 'cg', onclick: () => this.info(c.code) }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'small' }, nameOf(c.code))))), footer: h('button', { class: 'btn pri', onclick: () => mo.close() }, 'OK'), onClose: () => res() });
      this.addLog('Karten wurden gezeigt: ' + m.cards.map((c) => '«' + nameOf(c.code) + '»').join(', '));
    });
  }
  async finish(winner, reason) {
    this.aiBusy = false; this.ff = false; this.renderFF();
    this.ended = true; this.stopped = true; if (this.net) { this.net.inDuel = false; this.net.wantAwake = false; keepAwake(false); }
    const draw = winner == null || winner > 1; const stats = store.get('stats', {});
    if (!draw && !this.conf.test) for (let p = 0; p < 2; p++) { if (!this.conf.human[p] || (this.net && p !== this.viewer)) continue; const id = this.deckOf(p).id; if (!id) continue; const s = stats[id] || { w: 0, l: 0 }; if (p === winner) s.w++; else s.l++; stats[id] = s; }
    store.set('stats', stats); beep('win');
    const name = draw ? 'Unentschieden' : `${this.pname(winner)} gewinnt!`;
    this.closeSheet(); this.clearBar();
    if (this.conf.match) { matchModal(this, winner, victoryText(reason)); return; } // Match (Best of 3): Spielstand, Side Decking, nächstes Spiel
    openModal({ host: this.root, title: '', center: true, cls: 'win', body: h('div', { class: 'win-b' }, h('div', { class: 'win-ic' }, draw ? '🤝' : '🏆'), h('h2', { class: 'title-glow' }, name), h('p', { class: 'muted' }, victoryText(reason)), h('p', { class: 'small muted' }, `Das Duell dauerte ${this.turnNo} Züge. Endstand: ${this.pname(0)} ${this.snap.lp[0]} · ${this.pname(1)} ${this.snap.lp[1]}`)),
      footer: this.net ? [h('button', { class: 'btn ghost', onclick: () => { this.destroy(); netMenu(); } }, 'Zum Raum'), h('button', { class: 'btn pri', onclick: (e) => { e.target.disabled = true; e.target.textContent = 'Warte …'; netRematch(this); } }, '↻ Revanche')]
        : [h('button', { class: 'btn ghost', onclick: () => { this.destroy(); navRoot('home'); } }, 'Zum Menü'), h('button', { class: 'btn', onclick: () => { this.destroy(); back(); } }, 'Neue Decks'), h('button', { class: 'btn pri', onclick: () => { this.destroy(); navRoot('duel', this.conf); } }, '↻ Revanche')] });
  }

  // ---------------------------------------------------------------- Darstellung
  cardAt(p, l, s) { const a = this.snap && this.snap.players[p][LK[l]]; return a ? a[s] || null : null; }
  visible(c) { return c && (c.controller === this.viewer || (c.position & FACEUP) > 0 || !!c.isPublic); }
  /** Ist eine in einer Auswahl genannte Karte für den Betrachter sichtbar? */
  selVisible(s) { if (s.controller === this.viewer) return true; const c = this.cardAt(s.controller, s.location, s.sequence); if (c) return (c.position & FACEUP) > 0; return s.position !== undefined ? (s.position & FACEUP) > 0 : false; }
  render() { if (!this.snap) return; this.renderTop(); this.renderStrips(); this.renderBoard(); this.renderHand(); this.renderSheet(); this.renderFloat(); this.renderActs(); }
  renderTop() {
    const tp = this.turnPlayer;
    const mineT = tp === this.viewer; clear(this.turnEl); this.turnEl.className = 'd-turn' + (this.turnNo ? (mineT ? ' mine' : ' theirs') : '');
    if (this.turnNo) this.turnEl.append(h('b', { class: 'tn-w' }, mineT ? '▶ DEIN ZUG' : `▶ ${this.pname(tp).toUpperCase()} AM ZUG`), h('span', { class: 'tn-p' }, `Zug ${this.turnNo}`)); else this.turnEl.textContent = 'Duell beginnt …';
    this.chainEl.textContent = this.chain.length ? `⛓ ${this.chain.length}` : ''; this.chainEl.style.display = this.chain.length ? '' : 'none';
    this.tipBtn.style.display = this.conf.tutor && this.conf.human[this.viewer] ? '' : 'none';
    const cur = PH_PILLS.find((x) => x[2].includes(this.phase)); const po = this.phaseOpts || {}; const can = PH_PILLS.some((x) => po[x[0]]); if (!can) this.closePhMenu();
    this.phaseEl.className = 'd-phases ' + (tp === this.viewer ? 'mine' : 'theirs') + (this.turnNo ? '' : ' idle'); this.wheel.classList.toggle('go', can);
    this.wheel.firstChild.textContent = this.turnNo && cur ? cur[0] : '–'; this.wheel.lastChild.textContent = this.turnNo ? `Zug ${this.turnNo}${can ? ' ▾' : ''}` : '';
    for (const el of this.phaseEl.querySelectorAll('.ph')) { el.classList.toggle('on', !!cur && el.dataset.ph === cur[0]); el.classList.toggle('go', !!po[el.dataset.ph]); }
  }
  /** Phasen, in die der aktive Spieler jetzt wechseln darf: { BP, M2, EP } → Antwort für den Kern */
  setPhaseOpts(o) { this.phaseOpts = o; this.renderTop(); }
  phasePick(id) { const o = this.phaseOpts; if (o && o[id]) { this.answer(o[id]); return; } this.phaseHelp(); }
  /** Antippen des Rads: Aufklappmenü direkt am Rad mit den nächsten möglichen Phasen (Kampf, Main Phase 2, Zugende) */
  closePhMenu() { if (!this.phMenu) return; this.phMenu.remove(); this.phScrim.remove(); this.phMenu = this.phScrim = null; this.wheel.classList.remove('open'); }
  /** Warum fehlt die Kampfphase im Menü? (nur der Kern entscheidet: erster Zug, Karteneffekte) */
  bpWhy() { return this.turnNo === 1 ? 'Im ersten Zug darf niemand angreifen.' : 'Der Kern erlaubt gerade keine Kampfphase (z. B. durch einen Karteneffekt).'; }
  phaseTap() {
    if (this.phMenu) { this.closePhMenu(); return; }
    const o = this.phaseOpts; const list = o ? PH_PILLS.filter((x) => o[x[0]]) : []; if (!list.length) { this.phaseHelp(); return; }
    const lab = { BP: ['⚔ Kampfphase', 'gold'], M2: ['Main Phase 2', 'gold'], EP: ['⏭ Zug beenden', 'red'] };
    const rr = this.root.getBoundingClientRect(); const land = this.root.classList.contains('land');
    const noBP = !o.BP && this.phase === 4 && this.turnPlayer === this.viewer; // Main Phase 1, aber der Kern erlaubt keine Kampfphase → ausgegraut mit Begründung
    const items = list.map((x) => { const b = h('button', { class: 'btn ' + lab[x[0]][1], onclick: () => { this.closePhMenu(); this.answer(o[x[0]]); } }, lab[x[0]][0]); return x[0] === 'BP' && this.bpNoHit ? h('div', { class: 'ph-dis on' }, b, h('small', null, 'Kein Monster in Angriffsposition – es kann nichts angreifen.')) : b; });
    if (noBP) items.unshift(h('div', { class: 'ph-dis' }, h('button', { class: 'btn ghost', disabled: true }, '⚔ Kampfphase'), h('small', null, this.bpWhy())));
    const menu = h('div', { class: 'ph-menu' + (land ? ' land' : '') }, h('div', { class: 'ph-menu-t' }, 'Phase wählen'), ...items);
    const w = land ? 220 : 250;
    menu.style.cssText = `width:${w}px;left:${Math.max(4, (rr.width - w) / 2)}px;top:0;visibility:hidden`;
    this.phScrim = h('div', { class: 'ph-scrim', onclick: () => this.closePhMenu() }); this.root.append(this.phScrim, menu); this.phMenu = menu; this.wheel.classList.add('open');
    // Auswahl-Fenster mittig über dem Feld (Vorbild MDPro3: Phasenliste als Popup) – ist das Rad nicht verdeckt genug, bleibt es als Anker sichtbar
    const mh = menu.offsetHeight; menu.style.top = Math.max(4, (rr.height - mh) / 2) + 'px'; menu.style.visibility = '';
  }
  renderStrips() {
    const s = this.snap; const v = this.viewer, o = 1 - v;
    for (const [bar, p] of [[this.oppBar, o], [this.meBar, v]]) {
      const lp = s.lp[p]; const pl = s.players[p]; const max = Math.max(this.conf.lp, lp);
      const cur = this.lpShown[p]; const fl = this.floats.filter((f) => f.p === p); this.floats = this.floats.filter((f) => f.p !== p);
      clear(bar); bar.classList.toggle('turn', !!this.turnNo && this.turnPlayer === p); const hb = h('div', { class: 'lpbar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (lp / max) * 100))}%` }));
      const num = h('div', { class: 'lpn' }, String(cur)); bar.append(h('div', { class: 'st-n' + (this.turnPlayer === p ? ' act' : '') }, this.pname(p)), h('div', { class: 'lpw' }, hb, num),
        h('div', { class: 'st-c' }, p === o ? h('span', { class: 'hbacks' }, Array.from({ length: Math.min(pl.hand.length, 12) }, () => h('i'))) : null, h('span', { class: 'chip' }, `🂠 ${pl.deck}`), p === o ? h('span', { class: 'chip' }, `✋ ${pl.hand.length}`) : null, p === o && pl.hand.some((c) => c && c.isPublic) ? h('button', { class: 'chip pubh', onclick: () => this.showHand(o) }, '👁 Hand offen') : null));
      if (p === o) { clear(this.ohand); for (let i = 0; i < Math.min(pl.hand.length, 14); i++) this.ohand.append(h('i')); }
      this.tweenLp(p, num, cur, lp); this.lpShown[p] = lp;
      for (const f of fl) { const e = h('div', { class: 'lpf ' + (f.d < 0 ? 'neg' : 'pos') }, (f.d > 0 ? '+' : '') + f.d); bar.append(e); setTimeout(() => e.remove(), this.tempo === 'fast' ? 900 : 1600); }
    }
  }
  tweenLp(p, el, from, to) { if (from === to || !this.anim) { el.textContent = String(to); return; } const t0 = performance.now(); const dur = 700 * this.fxs(); const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = String(Math.round(from + (to - from) * k)); if (k < 1 && el.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }

  zone(p, l, s, row, col, opt = {}) {
    const k = key(p, l, s); const c = this.cardAt(p, l, s);
    const z = h('div', { class: 'zn' + (opt.cls ? ' ' + opt.cls : ''), style: `grid-row:${row};grid-column:${col}`, 'data-k': k });
    if (opt.label) z.append(h('span', { class: 'zl' }, opt.label));
    if (c) z.append(this.cardNode(c)); this.mark(z, k); return z;
  }
  mark(z, k) {
    if (this.selKey === k) z.classList.add('sel'); if (this.acts.has(k)) z.classList.add('hl'); if (this.cand.has(k)) z.classList.add('cand'); if (this.chosen.has(k)) z.classList.add('chosen'); if (this.tipKeys.has(k)) z.classList.add('tip');
    if (this.zoneSel && this.zoneSel.allowed.has(k)) z.classList.add('zsel'); if (this.zoneSel && this.zoneSel.chosen.has(k)) z.classList.add('zchosen');
  }
  cardNode(c) {
    const vis = this.visible(c); const own = c.controller === this.viewer; const def = c.location === LOC.MZONE && !!(c.position & 12); // nur Monster haben eine Kampfposition – verdeckte Zauber/Fallen (Kern: „verdeckt, Verteidigung“) bleiben aufrecht
    const ctr = Object.values(c.counters || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    return fieldEl(c.code, { back: !vis, peek: own && !(c.position & FACEUP), def, atk: c.attack, defv: c.defense, over: (c.overlayCards || []).length, counters: ctr, lk: c.location === LOC.MZONE, flip: !own });
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
    const v = this.viewer, o = 1 - v; const b = this.board; clear(b); const c3 = !!this.mode.cols3, NC = c3 ? 5 : 7; b.className = 'bd' + (this.mode.emz ? ' emz' : ' noemz') + (c3 ? ' c3' : ''); // Speed Duell: nur 3 Spalten (Zonen 1–3)
    const colMe = (s) => s + (c3 ? 1 : 2), colOp = (s) => (c3 ? 5 : 6) - s; const cells = new Map(); // Monsterzonen nach (Zeile,Spalte) – für die Link-Pfeile
    for (const [p, rowM, rowS, col, mir] of [[o, 2, 1, colOp, true], [v, 4, 5, colMe, false]]) {
      for (let s = 0; s < 5; s++) {
        if (c3 && (s === 0 || s === 4)) continue;
        const mz = this.zone(p, LOC.MZONE, s, rowM, col(s)); cells.set(`${rowM},${col(s)}`, mz); b.append(mz);
        const pz = this.mode.pzone && (s === 0 || s === 4) ? (s === 0 ? 'pz pz-l' : 'pz pz-r') : '';
        b.append(this.zone(p, LOC.SZONE, s, rowS, col(s), { cls: pz }));
      }
      b.append(this.zone(p, LOC.SZONE, 5, rowM, mir ? NC : 1, { cls: 'fz', label: 'Feld' }));
      b.append(this.pile(p, LOC.EXTRA, rowS, mir ? NC : 1, 'Extra'));
      b.append(this.pile(p, LOC.GRAVE, rowM, mir ? 1 : NC, 'Friedhof'));
      b.append(this.pile(p, LOC.DECK, rowS, mir ? 1 : NC, 'Deck'));
    }
    if (this.mode.emz) { // gemeinsame Extra-Monsterzonen: links = eigene 5 / gegnerische 6
      for (const [col, ms, mo] of [[3, 5, 6], [5, 6, 5]]) {
        const own = this.cardAt(v, LOC.MZONE, ms), opp = this.cardAt(o, LOC.MZONE, mo); const k1 = key(v, LOC.MZONE, ms), k2 = key(o, LOC.MZONE, mo);
        const kk = !own && opp ? k2 : k1;
        const z = h('div', { class: 'zn emzn', style: `grid-row:3;grid-column:${col}`, 'data-k': kk, 'data-k2': kk === k1 ? k2 : k1 });
        const c = own || opp; if (c) z.append(this.cardNode(c)); else z.append(h('span', { class: 'zl' }, 'EMZ'));
        this.mark(z, kk);
        if (this.zoneSel) { if (this.zoneSel.allowed.has(k1) || this.zoneSel.allowed.has(k2)) z.classList.add('zsel'); if (this.zoneSel.chosen.has(k1) || this.zoneSel.chosen.has(k2)) z.classList.add('zchosen'); }
        b.append(z); cells.set(`3,${col}`, z);
      }
    }
    this.linkPass(cells); this.place(this.root.classList.contains('land'));
    b.append(h('div', { class: 'midinfo', style: 'grid-row:3;grid-column:' + (this.mode.emz ? '1 / 3' : '1 / ' + (NC + 1)) }, this.mode.emz ? '' : this.phaseLine()));
  }
  /** Link-Pfeile auswerten: Zielzonen einfärben, gegenseitige Verbindung (Co-Link) golden, Pfeile ins Leere blass */
  linkPass(cells) {
    const lkOf = (z) => z.querySelector('.lk');
    for (const [pos, z] of cells) {
      const lk = lkOf(z); if (!lk) continue; const [r, c] = pos.split(',').map(Number); const mine = lk.classList.contains('me');
      for (const i of lk.children) {
        const [dr, dc] = i.dataset.v.split(',').map(Number); const t = cells.get(`${r + dr},${c + dc}`);
        if (!t) continue;
        t.classList.add(mine ? 'lkz-me' : 'lkz-op');
        const tl = lkOf(t); if (tl && [...tl.children].some((j) => j.dataset.v === `${-dr},${-dc}`)) i.classList.add('co');
      }
    }
  }
  phaseLine() { return this.turnNo ? `${PHASE[this.phase] || ''}` : ''; }
  renderHand() {
    const v = this.viewer; const hand = this.snap.players[v].hand; clear(this.handEl);
    const n = this.newHand; this.newHand = 0;
    if (this.root.classList.contains('land')) { const cw = parseFloat(this.root.style.getPropertyValue('--cw')) || 40; const w = cw * 1.35, maxW = cw * (this.mode.cols3 ? 5.4 : 7.4), cnt = hand.filter(Boolean).length; this.handEl.style.setProperty('--hov', cnt > 1 ? -Math.max(-4, (cnt * w - maxW) / (cnt - 1)).toFixed(1) + 'px' : '0px'); }
    hand.forEach((c, i) => {
      if (!c) return; const k = key(v, LOC.HAND, c.sequence); const el = h('div', { class: 'hc', 'data-k': k, style: hand.length > 6 ? 'margin-left:-14px' : '' }, cardEl(c.code, { cls: 'hcard' }));
      if (i >= hand.length - n) el.classList.add('new'); this.mark(el, k); this.handEl.append(el);
    });
  }

  // ---------------------------------------------------------------- Berührungen
  tapKey(k, el) {
    if (this.zoneSel) { const kk = [k, el && el.dataset.k2].find((x) => x && this.zoneSel.allowed.has(x)); if (kk) { this.zoneSel.toggle(kk); return; } }
    const [p, l, s] = k.split(':').map(Number);
    if (this.demo) { const c = this.cardAt(p, l, s); if (el && (el.classList.contains('pile') || el.classList.contains('bchip'))) this.pileView(p, l); else if (c && this.visible(c)) this.info(c.code); return; }
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
  info(code, mk) { const m = openModal({ host: this.root, title: null, body: cardInfoBody(code, null, mk), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen') }); const t = mk && mk.ranges && mk.ranges.length ? m.el.querySelector('mark.fx-mark') : null; if (t && t.scrollIntoView) setTimeout(() => t.scrollIntoView({ block: 'center' }), 30); return m; }
  /** Karte antippen: Hochformat = Blatt von unten; Querformat = Karteninfo links bleibt stehen (zuletzt gewählte Karte), Aktionen rechts unter dem Phasenrad */
  openSheet(c, k) {
    this.selKey = k; this.lastSel = { c: { ...c }, k }; this._sheetSig = null;
    if (!this.root.classList.contains('land')) this.sheet.classList.add('open');
    this.render(); this.renderSheet(true);
  }
  renderSheet(reveal = false) {
    const ls = this.lastSel; if (!ls) return; const land = this.root.classList.contains('land');
    if (!land && !this.sheet.classList.contains('open')) return;
    const cur = this.cardAt(ls.c.controller, ls.c.location, ls.c.sequence); const same = !!cur && cur.code === ls.c.code; if (same) ls.c = cur;
    const c = ls.c; const k = ls.k; const acts = this.selKey === k && same ? (this.acts.get(k) || []) : [];
    const sig = [k, c.code, c.attack, c.defense, c.position, acts.map((a) => a.label).join('|'), this.pending && this.pending.kind, land ? 'L' : 'P', this.selKey === k].join('~');
    if (!reveal && sig === this._sheetSig) return; this._sheetSig = sig;
    const keepTop = (this.sheet.querySelector('.sh-t') || {}).scrollTop || 0;
    const vis = this.visible(c); const own = c.controller === this.viewer; const card = cardOf(c.code);
    clear(this.sheet);
    const head = vis ? h('div', { class: 'sh-top' }, cardEl(c.code, { cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, cleanName(c.name)), h('div', { class: 'small muted' }, typeText(card)), (card.type & 1) ? h('div', { class: 'small' }, [attrName(card.attribute), levelText(card)].filter(Boolean).join(' · ')) : null, (card.type & 1) ? h('div', { class: 'small gold' }, statsText({ ...card, attack: c.attack, defense: c.defense }) + (c.attack !== card.attack || c.defense !== card.defense ? ' (aktuell)' : '')) : null))
      : h('div', { class: 'sh-top' }, cardEl(0, { back: true, cls: 'md' }), h('div', { class: 'grow' }, h('div', { class: 'sh-n' }, 'Verdeckte Karte'), h('div', { class: 'small muted' }, `von ${this.pname(c.controller)}`)));
    const txt = vis ? h('div', { class: 'sh-t' }, (() => { const mv = mergeViews(acts.filter((a) => a.kind === 'activate' && a.c).map((a) => effectView(a.code, a.c.description, a.c.location))); return mv && mv.ranges.length ? markNode(mv) : descOf(card).replace(/\r/g, ''); })()) : null;
    const actBtns = acts.map((a) => h('button', { class: 'btn ' + (a.pri ? 'pri' : ''), onclick: () => { this.closeSheet(); this.answer(a.resp); } }, a.label));
    const none = !acts.length && own && this.selKey === k && this.pending && this.pending.kind === 'idle' ? h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Mit dieser Karte ist gerade keine Aktion möglich.') : null;
    if (land) {
      this.sheet.append(head, txt || h('div', { class: 'sh-t muted' }, 'Der Gegner hat diese Karte verdeckt gelegt.'));
    } else {
      this.sheet.append(h('button', { class: 'sh-x', onclick: () => this.closeSheet() }, '✕'), head, txt);
      if (actBtns.length) this.sheet.append(h('div', { class: 'sh-acts' }, actBtns)); else if (none) this.sheet.append(none);
      if (vis) this.sheet.append(h('button', { class: 'btn ghost sm', style: 'margin-top:8px', onclick: () => this.info(c.code) }, 'Ganzen Text'));
    }
    const box = this.sheet.querySelector('.sh-t');
    if (box) { if (reveal) setTimeout(() => revealMark(box), 40); else box.scrollTop = keepTop; }
  }
  /** Runde Aktions-Knöpfe schweben über der angetippten Karte (Vorbild: MDPro3 / Master Duel). Nur im Querformat; die Liste rechts bleibt als Rückfall, falls kein Platz ist. */
  dropFloat() { if (this.floatEl) { this.floatEl.remove(); this.floatEl = null; } this._floatShown = false; }
  renderFloat() {
    this.dropFloat(); const ls = this.lastSel;
    if (!ls || !this.selKey || ls.k !== this.selKey || !this.snap || !this.root.classList.contains('land')) return;
    const acts = this.acts.get(ls.k) || []; if (!acts.length || ls.c.controller !== this.viewer || !this.pending || (this.pending.kind !== 'idle' && this.pending.kind !== 'battle')) return;
    const el = this.root.querySelector(`[data-k="${ls.k}"]`) || this.root.querySelector(`[data-k2="${ls.k}"]`); if (!el) return;
    const FB = { summon: ['⇧', 'Beschwören', 'sum'], special: ['✦', 'Spezial', 'sp'], set: ['▣', 'Setzen', 'set'], spellset: ['▣', 'Setzen', 'set'], pos: ['⟳', 'Position', 'pos'], activate: ['⚡', 'Aktivieren', 'act'], attack: ['⚔', 'Angriff', 'atk'] };
    const nAct = acts.filter((a) => a.kind === 'activate').length; let ai = 0, btns0 = 0;
    const btns = acts.map((a) => {
      const f = FB[a.kind] || ['●', a.label, 'act']; let lab = f[1]; if (a.kind === 'activate') { ai++; if (nAct > 1) lab = `Effekt ${ai}`; } else if (a.kind === 'pos' && /Flip/.test(a.label)) lab = 'Flip';
      return h('button', { class: 'fb fb-' + f[2] + (a.pri ? ' pri' : ''), title: a.label, 'aria-label': a.label, style: `animation-delay:${(ai + btns0++) * 25}ms`, onclick: (e) => { e.stopPropagation(); this.closeSheet(); this.answer(a.resp); } }, h('span', { class: 'fb-i' }, f[0]), h('span', { class: 'fb-l' }, lab));
    });
    const fl = h('div', { class: 'fl-act' }, btns); const rr = this.root.getBoundingClientRect(); const r = el.getBoundingClientRect();
    this.root.append(fl); const w = fl.offsetWidth, hh = fl.offsetHeight; const below = r.top - rr.top < hh + 14;
    const left = Math.max(6, Math.min(rr.width - w - 6, r.left - rr.left + r.width / 2 - w / 2)); const top = below ? r.bottom - rr.top + 6 : r.top - rr.top - hh - 6;
    fl.style.left = left.toFixed(0) + 'px'; fl.style.top = Math.max(4, Math.min(rr.height - hh - 4, top)).toFixed(0) + 'px'; fl.classList.toggle('below', below);
    this.floatEl = fl; this._floatShown = true;
  }
  /** Querformat, rechte Spalte: Aktionen der gewählten Karte – ohne Auswahl eine Übersicht, was in dieser Phase möglich ist */
  renderActs() {
    const el = this.actsEl; clear(el); if (!this.root.classList.contains('land') || !this.snap) return;
    const ls = this.lastSel; const cur = ls && this.cardAt(ls.c.controller, ls.c.location, ls.c.sequence);
    if (this.selKey && ls && ls.k === this.selKey && cur && cur.code === ls.c.code) {
      const acts = this.acts.get(ls.k) || []; const own = ls.c.controller === this.viewer;
      el.append(h('div', { class: 'ac-h' }, 'Aktionen'));
      if (acts.length && this._floatShown) el.append(h('div', { class: 'small muted ac-none' }, `${acts.length === 1 ? 'Ein Knopf' : acts.length + ' Knöpfe'} schweben über der Karte – tippe darauf.`), h('div', { class: 'ac-list' }, acts.map((a) => h('div', { class: 'ac-li' }, '• ' + a.label.replace(/^Aktivieren: ?/, 'Aktivieren – ')))));
      else if (acts.length) el.append(...acts.map((a) => h('button', { class: 'btn ' + (a.pri ? 'pri' : ''), onclick: () => { this.closeSheet(); this.answer(a.resp); } }, a.label)));
      else el.append(h('div', { class: 'small muted ac-none' }, own && this.pending && this.pending.kind === 'idle' ? 'Mit dieser Karte ist gerade keine Aktion möglich.' : 'Hier gibt es gerade nichts zu tun.'));
      return;
    }
    if (this.pending && this.pending.kind === 'idle' && this.actList && this.actList.length) {
      const LBL = { summon: 'Normal beschwören', special: 'Spezial beschwören', pos: 'Position ändern', set: 'Setzen', spellset: 'Setzen', activate: 'Aktivieren' }; const n = {};
      for (const a of this.actList) { if (!LBL[a.kind] || !a.c) continue; (n[LBL[a.kind]] = n[LBL[a.kind]] || new Set()).add(a.c.location + ':' + a.c.sequence); }
      const rows = Object.entries(n); if (!rows.length) return;
      el.append(h('div', { class: 'ac-h' }, 'Jetzt möglich'), ...rows.map(([l, s]) => h('div', { class: 'ac-r' }, h('b', null, String(s.size)), h('span', null, l))), h('div', { class: 'small muted ac-none' }, 'Karte antippen für Text und Aktionen.'));
    }
  }
  closeSheet() {
    const had = this.selKey; this.selKey = null; this.dropFloat();
    if (this.root.classList.contains('land')) { this._sheetSig = null; if (this.snap) this.render(); else clear(this.actsEl); return; } // Querformat: die Karteninfo bleibt stehen
    this.sheet.classList.remove('open'); clear(this.sheet); if (had && this.snap) this.render();
  }
  phaseHelp() { const t = PHASE_HELP[this.phase === 16 || this.phase === 32 || this.phase === 64 || this.phase === 128 ? 8 : this.phase]; if (t) toast(t, 5000); }
  showChain() {
    if (!this.chain.length) return;
    const m = openModal({ host: this.root, title: 'Aktuelle Kette', body: h('div', { class: 'col' }, [...this.chain].reverse().map((c, i) => h('div', { class: 'row' }, h('div', { class: 'pl-num' }, this.chain.length - i), cardEl(c.code, { cls: 'sm' }), h('div', { class: 'grow' }, h('b', null, nameOf(c.code)), h('div', { class: 'small muted' }, this.pname(c.p)))))), footer: [h('div', { class: 'small muted grow' }, 'Das oberste Kettenglied wird zuerst ausgeführt.'), h('button', { class: 'btn', onclick: () => m.close() }, 'OK')] });
  }
  showLog() { const copy = async () => { const txt = this.logLines.join('\n'); try { await navigator.clipboard.writeText(txt); toast('Verlauf kopiert'); } catch (e) { toast('Kopieren nicht möglich'); } }; const m = openModal({ host: this.root, title: 'Verlauf', body: h('div', { class: 'logl' }, [...this.logLines].reverse().map((l) => h('div', { class: l.startsWith('──') ? 'lg-t' : 'lg' }, l))), footer: [h('button', { class: 'btn', onclick: copy }, '📋 Kopieren'), h('button', { class: 'btn', onclick: () => m.close() }, 'Schließen')] }); }
  menu() {
    const m = openModal({ host: this.root, title: 'Duell', center: true, body: h('div', { class: 'col' },
      h('button', { class: 'btn', onclick: () => { m.close(); this.showLog(); } }, '📜 Verlauf'),
      h('button', { class: 'btn', onclick: () => { const nx = !this.anim ? 'fast' : this.tempo === 'fast' ? 'normal' : 'off'; this.anim = nx !== 'off'; if (nx !== 'off') this.tempo = nx; store.set('anim', this.anim); store.set('tempo', this.tempo); this.root.classList.toggle('fxfast', this.tempo === 'fast'); toast({ fast: 'Effekte: schnell', normal: 'Effekte: normal', off: 'Effekte: aus' }[nx]); m.close(); } }, `✨ Effekte: ${!this.anim ? 'aus' : this.tempo === 'fast' ? 'schnell' : 'normal'}`),
      this.ai ? h('button', { class: 'btn', onclick: () => { const ks = Object.keys(AIP); this.aiPace = ks[(ks.indexOf(this.aiPace) + 1) % ks.length]; store.set('aipace', this.aiPace); toast(`KI-Tempo: ${AIP[this.aiPace].name}`); m.close(); this.menu(); } }, `🐢 KI-Tempo: ${AIP[this.aiPace].name}`) : null,
      h('button', { class: 'btn', onclick: () => { setFieldFull(!fieldCfg.full); m.close(); this.render(); toast(fieldCfg.full ? 'Feldkarten: ganzes Kartenbild' : 'Feldkarten: Kunst mit Rahmen'); } }, `🃏 Feldkarten: ${fieldCfg.full ? 'ganze Karte' : 'Kunst + Rahmen'}`),
      this.demo ? h('button', { class: 'btn', onclick: () => { m.close(); this.demoRestart(); } }, '🔁 Neue Starthand') : h('button', { class: 'btn', onclick: () => { m.close(); this.surrender(); } }, '🏳 Aufgeben'),
      h('button', { class: 'btn red', onclick: async () => { m.close(); if (this.net) { if (await confirmBox('Duell verlassen?', 'Das Online-Duell wird für beide beendet.', 'Verlassen', 'Weiterspielen', true)) { this.net.send({ t: 'leave' }); this.destroy(); netMenu(); } } else back(); } }, '⟵ Duell verlassen')), footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Weiterspielen') });
  }
  // ---------------------------------------------------------------- Kombo-Vorführung
  buildDemo() {
    const d = this.demo;
    this.dmBody = h('div', { class: 'dm-b' }, h('div', { class: 'dm-hint' }, 'Gleich geht es los: Die KI spielt dein Deck und erklärt jeden Schritt.'));
    this.dmPlay = h('button', { class: 'btn', onclick: () => { d.auto = !d.auto; if (d.arm) d.arm(); this.renderDemoCtl(); } });
    const next = h('button', { class: 'btn', title: 'Nächster Schritt', onclick: () => { if (d.wake) d.wake(); } }, '⏭ Schritt');
    const skip = h('button', { class: 'btn', title: 'Schnell bis zum nächsten Zug', onclick: () => { d.skipFrom = this.turnNo; this.setFF(true); } }, '⏩ Zug');
    this.dmCtl = h('div', { class: 'dm-ctl' }, this.dmPlay, next, skip); this.renderDemoCtl();
    return h('div', { class: 'd-demo' }, this.dmBody, this.dmCtl);
  }
  renderDemoCtl() { this.dmPlay.textContent = this.demo.auto ? '⏸ Pause' : '▶ Weiter'; this.dmPlay.classList.toggle('pri', !this.demo.auto); }
  /** Wartet, bis die Erklärung gelesen ist: Zeit läuft ab (Auto), „Schritt“ tippt weiter, Vorspulen überspringt */
  demoWait(ms) {
    const d = this.demo; if (this.ff) return Promise.resolve();
    return new Promise((res) => {
      const done = () => { clearTimeout(d.timer); d.timer = null; d.arm = null; d.wake = null; this.naps.delete(done); res(); };
      d.wake = done; this.naps.add(done);
      d.arm = () => { clearTimeout(d.timer); d.timer = d.auto ? setTimeout(done, ms) : null; }; d.arm();
    });
  }
  /** Ein Entscheidungspunkt der KI: erklären, Karte hervorheben, warten */
  async demoStep(msg, resp, p) {
    const d = this.demo; const ex = explain(this, msg, resp);
    if (!ex || (p !== 0 && this.conf.demoOpp !== 'ai')) { await this.nap(this.botPause(msg)); return; }
    if (ex.kind === 'note') { this.demoNote(ex.text); await this.nap(Math.min(700, 200 + ex.text.length * 6) * AIP[this.aiPace].rd * (this.ff ? 0 : 1)); return; }
    const rd = AIP[this.aiPace].rd;
    if (d.auto && d.shownAt) { const rest = d.T - (performance.now() - d.shownAt); if (rest > 60) await this.demoWait(rest); } // Taktung: jede Karte bleibt ≈ 4 s – Animation und Zwischenschritte laufen in dieser Zeit mit
    d.step++; d.notes = []; this.showDemo(ex); d.shownAt = performance.now(); d.T = readMs(ex) * rd;
    if (ex.end && p === 0 && (this.turnNo === 1 || this.ai instanceof ReplayBot)) { d.auto = false; this.renderDemoCtl(); } // nach dem ersten Zug anhalten: Feld in Ruhe ansehen
    await this.demoWait(Math.min(1200 * rd, d.T * 0.4)); // kurz ansehen, dann wird die Aktion ausgeführt
    this.selKey = null; this.render();
  }
  showDemo(ex) {
    clear(this.dmBody); const k = ex.code ? cardOf(ex.code) : null;
    if (ex.loc && ex.loc.controller != null) { this.selKey = key(ex.loc.controller, ex.loc.location, ex.loc.sequence); this.render(); } // Karte auf dem Feld / in der Hand leuchtet
    this.dmBody.append(...[
      h('div', { class: 'dm-h' }, h('b', null, `Schritt ${this.demo.step}`), h('span', { class: 'muted' }, ` · Zug ${this.turnNo}`), this.conf.demoOpp === 'ai' ? h('span', { class: 'chip' }, ex.who) : null, ex.role ? h('span', { class: 'chip role' }, ex.role[0]) : null),
      h('div', { class: 'dm-top' }, ex.code ? h('button', { class: 'dm-card', onclick: () => this.info(ex.code) }, cardEl(ex.code, { cls: 'md' })) : null, h('div', { class: 'grow' }, h('div', { class: 'dm-ti' }, ex.title), h('div', { class: 'dm-li' }, ex.line))),
      ex.text ? h('div', { class: 'dm-tx' }, ex.text) : null, ex.role && ex.role[1] ? h('div', { class: 'dm-ro' }, ex.role[1]) : null, h('div', { class: 'dm-notes' })].filter(Boolean));
    this.dmBody.scrollTop = 0; void k;
  }
  demoNote(t) { const box = this.dmBody.querySelector('.dm-notes'); if (!box) return; this.demo.notes.push(t); box.append(h('div', { class: 'dm-n' }, '↳ ' + t)); }
  /** Such-Fenster: zeigt Starthand, Fortschritt und das beste bisher gefundene Board; „Jetzt vorspielen“ nimmt den Zwischenstand */
  async searchOverlay(opts, turn = 1) {
    const ms = this.conf.demoMs, goal = this.conf.demoGoal || 'balance'; const G = GOALS[goal] || GOALS.balance;
    const bar = h('i'); const head = h('div', { class: 'cs-h' }, turn > 1 ? `🔎 Suche den besten Zug ${turn} …` : '🔎 Suche die beste Kombo für diese Starthand …');
    const hand = h('div', { class: 'cs-hand muted small' }, turn > 1 ? 'Hand wird geladen …' : 'Starthand wird gemischt …'); const topEl = h('div', { class: 'cs-top muted small' });
    let scan = null; if (turn === 1) { try { scan = scanLines(scanDeck(this.deckOf(0), App.cards), nameOf); } catch (e) { scan = null; } } // Deckliste zuerst lesen: Starter, Handtraps, Fallen als Störer, mehrfach nutzbare Karten
    const scanEl = scan ? h('details', { class: 'cs-scan small' }, h('summary', null, '📋 Deck-Analyse'), scan.map((t) => h('div', null, '· ' + t))) : null; if (scanEl && window.innerHeight > 620) scanEl.open = true; /* auf flachen Querformat-Fenstern bleibt die Analyse eingeklappt */ const best = h('div', { class: 'cs-best' }, 'Erste Versuche laufen …'); const meta = h('div', { class: 'cs-meta muted small' });
    let discard = false;
    const go = h('button', { class: 'btn pri', onclick: () => stopSearch() }, '▶ Jetzt vorspielen'); const no = h('button', { class: 'btn', onclick: () => { discard = true; stopSearch(); } }, 'Ohne Suche');
    const box = h('div', { class: 'cs-box' }, head, h('div', { class: 'muted small' }, `Ziel: ${G.name}`), scanEl, hand, topEl, h('div', { class: 'cs-bar' }, bar), best, meta, h('div', { class: 'cs-btn' }, go, no));
    const el = this.csEl = h('div', { class: 'cs-ov' }, box); this.root.append(el);
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2; const helpers = Math.max(0, Math.min(2, cores - 2));
    let res = null;
    try {
      res = await searchCombo({ ...opts, goal }, { ms, helpers, onProgress: (p) => {
        bar.style.width = Math.min(100, Math.round((1 - p.left / p.total) * 100)) + '%';
        if (p.hand && !hand.dataset.set) { hand.dataset.set = 1; hand.textContent = (turn > 1 ? 'Hand: ' : 'Starthand: ') + p.hand.map((c) => nameOf(c)).join(' · '); }
        if (p.top && !topEl.dataset.set) { topEl.dataset.set = 1; topEl.textContent = 'Als Nächstes im Deck (Ziehreihenfolge steht fest): ' + p.top.slice(0, 6).map((c) => nameOf(c)).join(' · '); this.drawPreview = p.top.slice(); }
        if (p.board) best.textContent = 'Bestes Board bisher: ' + boardText(p.board);
        meta.textContent = `${p.sims} Varianten geprüft${p.workers > 1 ? ` · ${p.workers} Rechenkerne` : ''} · Wertung ${Math.round(p.score)} (Standard-KI: ${Math.round(p.base)})`;
      } });
    } catch (e) { console.warn('Kombo-Suche', e); res = null; }
    if (this.stopped) return null;
    if (res && !discard) { head.textContent = '✅ Beste Variante gefunden'; bar.style.width = '100%'; best.textContent = boardText(res.board); go.style.display = no.style.display = 'none'; meta.textContent = `${res.sims} Varianten geprüft · Wertung ${Math.round(res.board.score)} statt ${Math.round(res.base)} bei der Standard-KI`; await sleep(this.anim ? 1600 : 300); }
    el.remove(); this.csEl = null;
    if (discard) { toast('Ohne Suche: Die KI spielt nach Spielwert.'); return null; }
    if (!res) toast('Die Suche hat nichts gefunden – die KI spielt nach Spielwert.', 3500);
    return res;
  }
  /** Erster Text im Erklärfeld nach der Suche */
  demoIntro(turn = 1) {
    const f = this.found; if (!f || !this.dmBody) return; const G = GOALS[this.conf.demoGoal || 'balance'] || GOALS.balance;
    clear(this.dmBody); this.dmBody.append(h('div', { class: 'dm-hint' }, `${turn > 1 ? `Zug ${turn}: ` : ''}Ziel „${G.name}“: Aus ${f.sims} geprüften Varianten spielt die KI gleich die beste vor – ${boardText(f.board)}.`));
  }
  /** Neue Starthand: dasselbe Deck noch einmal anspielen */
  demoRestart() { const conf = { ...this.conf, seed: undefined }; this.destroy(); replace('duel', conf); }

  // ---------------------------------------------------------------- Starthand-Test
  buildTestBar() {
    const b = (t, fn) => h('button', { class: 'chip', onclick: fn }, t);
    return h('div', { class: 'd-test' }, h('span', { class: 'd-test-t', title: 'Starthand-Test' }, '🧪'),
      b('↻ Neue Hand', () => this.testRestart({})), b('⟲ Gleiche', () => this.testRestart({ same: true })), b('✋ Wählen', () => this.testPick()), b('🎓 Check', () => this.testCheck()));
  }
  testRestart({ same, stack }) {
    const conf = { ...this.conf, seed: same ? (this.conf.seed || this.seedUsed) : undefined, stack: stack !== undefined ? stack : (same ? this.conf.stack : undefined) };
    this.destroy(); replace('duel', conf);
  }
  testCheck() {
    const hand = ((this.snap && this.snap.players[0].hand) || []).map((c) => c.code).filter(Boolean);
    const d = this.deckOf(0); const body = h('div', null, h('div', { class: 'hand-row' }, hand.map((c) => cardEl(c, { cls: 'md' }))), h('div', { class: 'tutor panel', style: 'margin-top:12px' }, h('div', { class: 'tut-h' }, h('span', { class: 'tut-ic' }, '🎓'), h('b', null, 'Was sagt der Tutor?')), hand.length ? handComment(hand, d).map((t) => h('p', { class: 'small' }, t)) : h('p', { class: 'small' }, 'Keine Karten auf der Hand.')));
    const m = openModal({ host: this.root, title: 'Hand-Check', body, footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'OK') });
  }
  testPick() {
    const d = this.deckOf(0); const chosen = []; const maxN = 5;
    const body = h('div'); const info = h('p', { class: 'small muted' }); const go = h('button', { class: 'btn pri' }, '▶ Zufällige Hand');
    const paint = () => {
      go.textContent = chosen.length ? `▶ Mit dieser Hand starten (${chosen.length})` : '▶ Zufällige Hand'; clear(body); info.textContent = `Gewählt: ${chosen.length} / ${maxN} – tippe Karten an, die du auf der Starthand haben willst. Der Rest wird gemischt.`;
      body.append(info, h('div', { class: 'hand-row' }, chosen.map((c, i) => h('button', { onclick: () => { chosen.splice(i, 1); paint(); } }, cardEl(c, { cls: 'md' })))),
        h('div', { class: 'dgrid', style: 'margin-top:8px' }, d.main.map(([c, n]) => { const k = chosen.filter((x) => x === c).length; return h('button', { class: 'dg-c' + (k ? ' sel' : ''), style: k ? 'outline:2px solid var(--gold);border-radius:6px' : '', onclick: () => { if (chosen.length >= maxN) { toast('Mehr als 5 Karten passen nicht auf die Hand.'); return; } if (k >= n) { toast(`Nur ${n}× im Deck.`); return; } chosen.push(c); paint(); } }, cardEl(c, { cls: 'sm' }), h('span', { class: 'inn', style: 'position:absolute;right:0;bottom:0;background:#000b;color:var(--gold);border-radius:6px;padding:0 4px;font-size:11px' }, k ? `${k}/${n}` : `×${n}`)); })));
    };
    paint();
    const m = openModal({ host: this.root, title: 'Starthand wählen', cls: 'tall', body, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Abbrechen'), go] });
    go.onclick = () => { m.close(); this.testRestart({ stack: [chosen.slice(), []] }); };
  }
  async surrender() {
    if (!this.conf.human[this.viewer] || !(await confirmBox('Aufgeben?', `${this.pname(this.viewer)} gibt auf.`, 'Aufgeben', 'Weiter', true))) return;
    const w = 1 - this.viewer; if (this.net) this.net.send({ t: 'surrender', seat: this.viewer }); if (this.host) this.host.abort(); if (this.eng && this.eng.abort) this.eng.abort(); if (this.pending) { this.pending.resolve(null); this.pending = null; } this.stopped = true; await this.finish(w, 0);
  }

  // ---------------------------------------------------------------- Prompt-Bereich & Antworten
  setBar(text, buttons = [], sub) {
    const round = this.root.classList.contains('land') && buttons.length > 0 && buttons.length <= 2 && buttons.every((b) => !b.cls || /^(pri|ghost)$/.test(b.cls)) && buttons.some((b) => /^(Bestätigen|Abbrechen|Fertig|Ja|Nein|OK|Weiter|Zurück)/i.test(b.label) || b.cls === 'pri' && buttons.length === 1);
    this.bar.classList.remove('off'); this.root.classList.add('baron'); clear(this.bar); this.bar.append(h('div', { class: 'bar-t' }, h('div', { class: 'bar-m' }, text), sub ? h('div', { class: 'bar-s' }, sub) : null), h('div', { class: 'bar-b' + (round ? ' rd' : '') }, buttons.map((b) => (round ? h('button', { class: 'rb ' + (/ghost/.test(b.cls || '') ? 'rb-no' : 'rb-ok'), disabled: b.disabled, onclick: b.onclick }, h('span', { class: 'rb-i' }, /ghost/.test(b.cls || '') ? '✕' : '✔'), h('span', { class: 'rb-l' }, b.label)) : h('button', { class: 'btn ' + (b.cls || ''), disabled: b.disabled, onclick: b.onclick }, b.label)))));
  }
  /** Leiste ausblenden – im Zug steuert das Phasenrad Kampf und Zugende */
  hideBar() { clear(this.bar); this.bar.classList.add('off'); this.root.classList.remove('baron'); }
  clearBar() { this.hideBar(); }
  /** wartet auf eine Antwort der Oberfläche */
  wait(kind) { return new Promise((resolve) => { this.pending = { resolve, kind }; }); }
  answer(resp) { const p = this.pending; if (!p) return; this.closePhMenu(); this.pending = null; this.phaseOpts = null; this.cand = new Map(); this.chosen = new Set(); this.zoneSel = null; this.acts = new Map(); this.tipKeys = new Set(); this.tip = null; this.dropFloat(); this.closeSheet(); this.clearBar(); if (this.snap) this.render(); p.resolve(resp); }
  setTip(t) { this.tip = t; }
  showTip() {
    this.tipBtn.classList.remove('pulse'); const t = this.tip; if (!t) { toast('Gerade gibt es nichts zu raten.'); return; }
    this.tipKeys = new Set(t.keys || []); this.render();
    const m = openModal({ host: this.root, title: '💡 Tipp vom Tutor', center: true, cls: 'peek', body: h('p', { class: 'tut-g' }, t.text), footer: h('button', { class: 'btn pri', onclick: () => m.close() }, 'Verstanden') });
  }
}

screens.duel = (conf) => { const d = new Duel(conf); queueMicrotask(() => d.start()); return d.root; };
export { Duel };
