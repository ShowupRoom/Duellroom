// Zwei-Handy-Test fürs Online-Duell. Voraussetzung: App unter http://localhost:8080 und ein PeerJS-Server auf 127.0.0.1:9000 (npm i peer; PeerServer({port:9000, host:'127.0.0.1', path:'/'})).
// Aufruf: node test/online-ui.cjs  (Bilder-Pfade erwarten art-small.jpg im selben Ordner)
const { chromium } = require('playwright'); const S = __dirname; const URL = 'http://localhost:8080/?peer=127.0.0.1:9000';
const log = (...a) => console.log(...a);
(async () => { const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
  const mk = async (nm) => { const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); await ctx.addInitScript((nm) => { localStorage.setItem('dr.onb.done', '"pro"'); localStorage.setItem('dr.ins.seen', 'true'); localStorage.setItem('dr.net.name', JSON.stringify(nm)); }, nm);
    await ctx.route('**/images.ygoprodeck.com/**', (r) => r.fulfill({ path: S + '/art-small.jpg', contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } })); await ctx.route('**/wsrv.nl/**', (r) => r.fulfill({ path: S + '/art-small.jpg', contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } }));
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push('K: ' + m.text().slice(0, 160)); });
    await p.goto(URL); await p.waitForFunction(() => document.body.dataset.done, null, { timeout: 90000 }); return p; };
  const A = await mk('Dennis'), B = await mk('Schatz');
  const shot = (p, n) => p.screenshot({ path: S + `/look/on-${n}.png` });
  // 1) Gastgeber eröffnet
  await A.evaluate(() => window.__nav.go('online')); await A.waitForTimeout(600); await A.locator('input.input').first().fill('Dennis'); await A.locator('button', { hasText: 'Raum eröffnen' }).click();
  let code = null; for (let i = 0; i < 40 && !code; i++) { await A.waitForTimeout(400); code = await A.evaluate(() => { const e = document.querySelector('.room-code'); return e ? e.innerText.replace(/\s/g, '') : null; }); }
  log('1) Raum-Code:', code, '| Status Gastgeber:', await A.evaluate(() => document.querySelector('.screen:last-of-type')?.innerText.match(/(Warte[^\n]*|verbunden[^\n]*|Verbindung[^\n]*)/i)?.[0])); await shot(A, '1-host');
  // 2) Gast tritt bei
  await B.evaluate(() => window.__nav.go('online')); await B.waitForTimeout(600); await B.locator('input.input').first().fill('Schatz'); await B.locator('input.code-in').fill(code); await B.locator('button', { hasText: 'Raum beitreten' }).click();
  let joined = false; for (let i = 0; i < 40 && !joined; i++) { await B.waitForTimeout(500); joined = await A.evaluate(() => /Schatz/.test(document.querySelector('.screen:last-of-type')?.innerText || '')); }
  log('2) Gast verbunden (Gastgeber sieht „Schatz“):', joined); await shot(A, '2-host'); await shot(B, '2-guest');
  // 3) Decks wählen
  const pick = async (p, n) => { await p.locator('.screen:last-of-type button', { hasText: /Deck wählen|Anderes Deck/ }).first().click(); await p.waitForTimeout(900); await shot(p, '3-pick-' + n);
    const ok = await p.evaluate(() => { const t = [...document.querySelectorAll('.screen:last-of-type *')].find((e) => e.children.length === 0 && /ABC|Drachen|Blau/.test(e.textContent) && e.getBoundingClientRect().width); if (!t) return false; let el = t; while (el && !(el.onclick || el.tagName === 'BUTTON' || /item|row|deck|dk/.test(el.className))) el = el.parentElement; (el || t).click(); return (el || t).className + ' ← ' + t.textContent.slice(0, 30); });
    await p.waitForTimeout(900); const sel = p.locator('.modal .btn.pri, .screen:last-of-type .btn.pri', { hasText: /Wählen|Nehmen|Dieses Deck|Übernehmen/ }); if (await sel.count()) { await sel.first().click(); await p.waitForTimeout(800); } return ok; };
  log('3) Deckwahl Gastgeber:', await pick(A, 'host'), '| Gast:', await pick(B, 'guest'));
  await A.waitForTimeout(1500); await shot(A, '3-host'); await shot(B, '3-guest');
  log('   Gastgeber-Lobby:', (await A.evaluate(() => document.querySelector('.screen:last-of-type')?.innerText.replace(/\n+/g, ' | ').slice(0, 300))));
  // 4) Start
  const st = A.locator('.screen:last-of-type button', { hasText: /starten|Start|Los/ }).first(); log('4) Start-Knopf aktiv:', await st.isEnabled().catch(() => 'fehlt')); await st.click().catch(() => {});
  let both = false; for (let i = 0; i < 60 && !both; i++) { await A.waitForTimeout(500); both = await Promise.all([A, B].map((p) => p.evaluate(() => !!(window.__duel && window.__duel.snap)))).then((r) => r.every(Boolean)); }
  log('   Duell läuft auf beiden:', both);
  if (both) { await A.waitForTimeout(2500); for (const p of [A, B]) await p.locator('.modal .btn', { hasText: /Los geht/ }).first().click({ timeout: 3000 }).catch(() => {}); await shot(A, '4-host'); await shot(B, '4-guest');
    const view = (p) => p.evaluate(() => { const D = window.__duel; const s = D.snap; return { viewer: D.viewer, turn: s.turn, lp: s.lp, hand: [s.players[0].hand.length, s.players[1].hand.length], meineHandSichtbar: s.players[D.viewer].hand.filter((c) => c && c.code).length, gegnerHandSichtbar: s.players[1 - D.viewer].hand.filter((c) => c && c.code).length, pend: D.pending && D.pending.kind }; });
    log('   Gastgeber sieht:', JSON.stringify(await view(A))); log('   Gast sieht:     ', JSON.stringify(await view(B)));
    // 5) ein paar Züge: wer dran ist, spielt die erste mögliche Aktion bzw. beendet den Zug
    for (let r = 0; r < 30; r++) { for (const p of [A, B]) { await p.locator('.modal .btn', { hasText: /Los geht|Weiter|OK/ }).first().click({ timeout: 200 }).catch(() => {}); const done = await p.evaluate(() => { const D = window.__duel; if (!D.pending) return null; const k = D.pending.kind;
        if (k === 'idle') { const l = [...D.acts.values()].flat().find((a) => a.kind === 'summon'); if (l && !D._did) { D._did = D.snap.turn; D.answer(l.resp); return 'beschwört'; } D._did = null; if (D.phaseOpts.EP) { D.answer(D.phaseOpts.EP); return 'Zugende'; } }
        if (k === 'battle') { if (D.phaseOpts.EP) { D.answer(D.phaseOpts.EP); return 'Zugende'; } }
        return k; });
        if (done === 'place' || done === 'chain' || done === 'yesno' || done === 'option') { await p.locator('.screen.duel .zn.cand, .screen.duel .zn.zsel').first().tap({ force: true }).catch(() => {}); await p.locator('.modal .btn').last().click({ force: true, timeout: 300 }).catch(() => {}); }
        await p.waitForTimeout(400); } }
    await A.waitForTimeout(1500);
    const sa = await A.evaluate(() => { const s = window.__duel.snap; return JSON.stringify({ turn: s.turn, lp: s.lp, mz: s.players.map((P) => P.mzone.filter(Boolean).length), deck: s.players.map((P) => P.deck.length) }); });
    const sb = await B.evaluate(() => { const s = window.__duel.snap; return JSON.stringify({ turn: s.turn, lp: s.lp, mz: s.players.map((P) => P.mzone.filter(Boolean).length), deck: s.players.map((P) => P.deck.length) }); });
    log('5) nach einigen Zügen – Gastgeber:', sa); log('                         Gast:      ', sb, '→ gleich:', sa === sb);
    await shot(A, '5-host'); await shot(B, '5-guest');
    // 6) Verbindung kurz weg (Gast) und zurück
    await B.context().setOffline(true); await B.waitForTimeout(6000); await B.context().setOffline(false);
    let back = false; for (let i = 0; i < 40 && !back; i++) { await B.waitForTimeout(500); back = await A.evaluate(() => !/getrennt|verloren|wartet auf/i.test(document.querySelector('.screen.duel .net-st, .screen.duel .d-net')?.innerText || '')); }
    log('6) nach 6 s Funkloch beim Gast – Verbindung wieder da:', back, '| Status-Hinweise:', await A.evaluate(() => [...document.querySelectorAll('.toast, .net-st, .d-net')].map((e) => e.innerText).join(' / ').slice(0, 200)));
  }
  if (both) {
    // 7) Gast lädt die App neu (iPhone: App-Wechsel)
    await B.reload(); await B.waitForFunction(() => document.body.dataset.done, null, { timeout: 90000 }); await B.waitForTimeout(3000);
    const scr = await B.evaluate(() => (document.querySelector('.screen:last-of-type')?.className || '') + ' | ' + (document.querySelector('.modal')?.innerText || '').replace(/\n+/g, ' ').slice(0, 160));
    log('7) Gast nach Neuladen:', scr); await shot(B, '7-guest-reload');
    const rej = B.locator('.modal button', { hasText: /Zurück ins Duell/ }); if (await rej.count()) { log('   Rückkehr-Frage erscheint ✔'); await rej.first().click(); }
    else { log('   keine Rückkehr-Frage → manuell neu beitreten'); await B.evaluate(() => window.__nav.go('online')); await B.waitForTimeout(600); await B.locator('input.code-in').fill(code); await B.locator('button', { hasText: 'Raum beitreten' }).click(); }
    for (let i = 0; i < 30; i++) { if (await B.evaluate(() => !!(window.__duel && window.__duel.snap))) break; await B.waitForTimeout(500); }
    const inDuel = await B.evaluate(() => !!(window.__duel && window.__duel.snap)); const tb = inDuel ? await B.evaluate(() => window.__duel.snap.turn) : null;
    log('   wieder im Duell:', inDuel, 'Zug', tb, '| Gastgeber-Hinweis:', await A.evaluate(() => [...document.querySelectorAll('.toast, .modal')].map((e) => e.innerText.replace(/\n+/g, ' ')).join(' / ').slice(0, 200)));
  }
  if (both) {
    const before = await A.evaluate(() => { const s = window.__duel.snap; return JSON.stringify({ turn: s.turn, lp: s.lp, mz: s.players.map((P) => P.mzone.filter(Boolean).map((c) => c.code)), gy: s.players.map((P) => P.grave.length) }); });
    await A.waitForTimeout(2000); await A.reload(); await A.waitForFunction(() => document.body.dataset.done, null, { timeout: 90000 }); await A.waitForTimeout(1500);
    const q = A.locator('.modal button', { hasText: /Zurück ins Duell/ }); log('8) Gastgeber nach Neuladen – Rückkehr-Frage:', await q.count() > 0); if (await q.count()) await q.first().click();
    let ok = false; for (let i = 0; i < 60 && !ok; i++) { await A.waitForTimeout(500); ok = await A.evaluate(() => !!(window.__duel && window.__duel.snap && !(window.__duel.resumeQ && window.__duel.resumeQ.length))); }
    const after = ok ? await A.evaluate(() => { const s = window.__duel.snap; return JSON.stringify({ turn: s.turn, lp: s.lp, mz: s.players.map((P) => P.mzone.filter(Boolean).map((c) => c.code)), gy: s.players.map((P) => P.grave.length) }); }) : null;
    log('   Stand vorher :', before); log('   Stand nachher:', after, '→ gleich:', before === after);
    let gsync = false; for (let i = 0; i < 40 && !gsync; i++) { await B.waitForTimeout(500); gsync = await B.evaluate((a) => { const s = window.__duel && window.__duel.snap; return !!s && JSON.stringify({ turn: s.turn, lp: s.lp, mz: s.players.map((P) => P.mzone.filter(Boolean).map((c) => c.code)), gy: s.players.map((P) => P.grave.length) }) === a; }, after); }
    log('   Gast wieder verbunden und gleicher Stand:', gsync);
    // weiterspielen nach der Wiederaufnahme: Kettenfragen mit „Nein“, sonst Zug beenden
    const h0 = await A.evaluate(() => window.__duel.hist.length); const t0 = await A.evaluate(() => window.__duel.snap.turn);
    for (let r = 0; r < 40; r++) { for (const p of [A, B]) {
      const no = p.locator('.modal .btn', { hasText: /^(Nein, weiter|Nein|Weiter|OK|Los geht’s!|Los geht's!)$/ }); if (await no.count()) { await no.first().click({ force: true, timeout: 300 }).catch(() => {}); await p.waitForTimeout(250); continue; }
      const d = await p.evaluate(() => { const D = window.__duel; if (!D || !D.pending) return null; const k = D.pending.kind; if ((k === 'idle' || k === 'battle') && D.phaseOpts.EP) { D.answer(D.phaseOpts.EP); return 'EP'; } return k; });
      if (d && !['EP', 'idle', 'battle'].includes(d)) { await p.locator('.screen.duel .zn.cand').first().tap({ force: true }).catch(() => {}); await p.locator('.screen.duel .d-bar .btn.pri').first().tap({ force: true, timeout: 300 }).catch(() => {}); }
      await p.waitForTimeout(300); } if (await A.evaluate(() => window.__duel.snap.turn) >= t0 + 2) break; }
    log('   Diagnose:', JSON.stringify(await A.evaluate(() => { const D = window.__duel; return { stopped: D.stopped, ended: D.ended, resumeQ: D.resumeQ && D.resumeQ.length, modals: [...document.querySelectorAll('.modal')].map((m) => m.innerText.slice(0, 60)), turnNo: D.turnNo, pend: D.pending && D.pending.kind, hostSeq: D.host && D.host.seq, wartetAufGast: !!(D.host && D.host.waiter), last: D.host && D.host.last && D.host.last.seq, verbunden: window.__net() && window.__net().connected, bar: D.root.querySelector('.d-bar')?.innerText.slice(0, 60) }; })), JSON.stringify(await B.evaluate(() => { const D = window.__duel; return { pend: D && D.pending && D.pending.kind, lastSeq: D && D.eng && D.eng.lastSeq, inbox: D && D.eng && D.eng.inbox && D.eng.inbox.length, verbunden: window.__net() && window.__net().connected, bar: D && D.root.querySelector('.d-bar')?.innerText.slice(0, 60) }; })));
    log('   Antworten seit Wiederaufnahme:', (await A.evaluate(() => window.__duel.hist.length)) - h0);
    const ta = await A.evaluate(() => window.__duel.snap.turn), tb = await B.evaluate(() => window.__duel.snap.turn); log('   weitergespielt bis Zug – Gastgeber', ta, 'Gast', tb);
  }
  log('Fehler Gastgeber:', JSON.stringify(A.errs.slice(0, 5))); log('Fehler Gast:', JSON.stringify(B.errs.slice(0, 5)));
  await b.close(); })();
