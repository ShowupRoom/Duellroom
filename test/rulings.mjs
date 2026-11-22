// Schiedsrichter-Fälle: typische Turnier-Situationen im echten Kern nachstellen und prüfen, ob das Ergebnis dem Kartentext entspricht.
// Jeder Fall: feste Hand/Feld, Spieler-Politik (welche Karte aktiviert, wer angreift), Prüfung am Ende.
import { loadCore, Game, OcgDuelMode, OcgResponseType as R, SelectIdleCMDAction as IA, SelectBattleCMDAction as BA, OcgMessageType as MSG, MSG_NAME, LOC } from '../src/core.mjs';
import { passiveReply } from '../src/combo.mjs';
import { loadCards, scriptReader, mulberry } from './lib.mjs';

const cards = loadCards(); const lib = await loadCore();
const UP = 1, DEF = 4, SET = 8; // Positionen: offen Angriff, offen Verteidigung, verdeckt
const C = { rota: 32807846, ash: 14558127, celtic: 91152256, mirror: 44095762, luster: 11091375, gaia: 6368038, elf: 15025844, kuriboh: 40640057, bewd: 89631139, dmg: 38033121, pot: 55144522, reborn: 83764718, imperm: 10045474, grave: 32864, alex: 43096270, dm: 46986414, gamma: 38814750, lord: 17985575, betd: 53183600, tworld: 15259703, veiler: 97268402, tenma: 33837653 };
const FILL = Array(30).fill(C.grave); const deck = (...cs) => ({ main: [...cs, ...FILL], extra: [] });

async function run({ decks, field = [], stack = [[], []], policy = () => undefined, until = 3 }) {
  const g = await Game.create(lib, { flags: OcgDuelMode.MODE_MR5, decks, cards, readScript: scriptReader('official'), seed: [3n, 1n, 4n, 1n], field, stack, shuffle: true });
  const rnd = mulberry(9); const log = []; const prompts = [];
  for (let i = 0; i < 2500; i++) {
    const x = await g.next();
    for (const e of g.events) log.push({ t: MSG_NAME[e.type], ...e }); g.events.length = 0;
    if (x.kind === 'end') { log.push({ t: 'END', winner: x.winner }); break; }
    if (g.turn > until) break;
    const m = x.msg; prompts.push({ t: MSG_NAME[m.type], p: m.player, turn: g.turn, m });
    const r = policy(m, g) ?? passiveReply(m, rnd, cards); g.respond(r);
  }
  const s = g.snapshot(); lib.destroyDuel(g.handle); return { s, log, prompts };
}
const act = (m, code) => { const i = (m.activates || []).findIndex((c) => c.code === code); return i >= 0 ? { type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: i } : undefined; };
const chainWith = (m, code) => { const i = (m.selects || []).findIndex((c) => c.code === code); return i >= 0 ? { type: R.SELECT_CHAIN, index: i } : undefined; };
const summon = (m, code) => { const i = (m.summons || []).findIndex((c) => c.code === code); return i >= 0 ? { type: R.SELECT_IDLECMD, action: IA.SELECT_SUMMON, index: i } : undefined; };
const codesAt = (s, p, k) => s.players[p][k].filter(Boolean).map((c) => c.code);

const cases = [];
const T = (name, fn) => cases.push({ name, fn });

T('Kette: «Aschenblüte» negiert «Verstärkung für die Armee» (Kettenglied 2 löst zuerst auf)', async () => {
  const { s, log } = await run({ decks: [deck(C.rota, C.celtic, C.celtic), deck(C.ash)], stack: [[C.rota], [C.ash]], until: 1,
    policy: (m) => (m.type === MSG.SELECT_IDLECMD && m.player === 0 ? act(m, C.rota) : m.type === MSG.SELECT_CHAIN && m.player === 1 ? chainWith(m, C.ash) : undefined) });
  const neg = log.some((e) => e.t === 'CHAIN_NEGATED' || e.t === 'CHAIN_DISABLED'); const celticInHand = codesAt(s, 0, 'hand').includes(C.celtic) && !codesAt(s, 0, 'grave').includes(C.celtic);
  return [neg && codesAt(s, 1, 'grave').includes(C.ash), `negiert: ${neg}, Ash im Friedhof: ${codesAt(s, 1, 'grave').includes(C.ash)}`];
});
T('Harte Sperre: nur EINE «Aschenblüte» pro Spielzug, auch mit zwei Kopien', async () => {
  const st = { used: 0, offeredAfter: null, rota: 0 };
  await run({ decks: [deck(C.rota, C.rota, C.celtic, C.celtic), deck(C.ash, C.ash)], stack: [[C.rota, C.rota], [C.ash, C.ash]], until: 1,
    policy: (m) => {
      if (m.type === MSG.SELECT_IDLECMD && m.player === 0) { const r = act(m, C.rota); if (r) st.rota++; return r ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; }
      if (m.type === MSG.SELECT_CHAIN && m.player === 1) { const has = (m.selects || []).some((c) => c.code === C.ash); if (st.used) { if (st.rota >= 2 && st.offeredAfter === null) st.offeredAfter = has; return; } const r = chainWith(m, C.ash); if (r) st.used++; return r; }
    } });
  return [st.used === 1 && st.rota >= 2 && st.offeredAfter === false, `erste Ash benutzt: ${st.used}, zweite «Verstärkung» aktiviert: ${st.rota >= 2}, zweite Ash angeboten: ${st.offeredAfter}`];
});
const log2 = {};
T('«Spiegelkraft» zerstört nur Monster in Angriffsposition', async () => {
  const { s } = await run({ decks: [deck(C.grave), deck(C.grave)], until: 2,
    field: [[1, C.mirror, LOC.SZONE, 2, SET], [0, C.luster, LOC.MZONE, 1, UP], [0, C.gaia, LOC.MZONE, 2, UP], [0, C.elf, LOC.MZONE, 3, DEF]],
    stack: [[], []],
    policy: (m, g) => {
      if (g.turn === 1 && m.type === MSG.SELECT_IDLECMD) return { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null };
      if (m.type === MSG.SELECT_IDLECMD && m.player === 1 && m.to_bp) return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
      if (m.type === MSG.SELECT_BATTLECMD && m.player === 1) { const i = (m.attacks || []).findIndex((a) => a.code === C.luster); if (i >= 0) return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i }; }
      if (m.type === MSG.SELECT_CHAIN && m.player === 0) return chainWith(m, C.mirror);
    } });
  // Spieler 0 beginnt – deshalb greift hier Spieler 1 an? Nein: Felder sind so gesetzt, dass Spieler 0 die Monster hat und im Zug 2 … (siehe unten)
  return [true, 'siehe Fall 3b'];
});
cases.pop(); // durch 3b ersetzt (Spieler 1 greift in Zug 2 an)
T('«Spiegelkraft» zerstört nur Monster in Angriffsposition (Verteidiger bleibt)', async () => {
  const { s, log } = await run({ decks: [deck(C.grave), deck(C.grave)], until: 2,
    field: [[0, C.mirror, LOC.SZONE, 2, SET], [1, C.luster, LOC.MZONE, 1, UP], [1, C.gaia, LOC.MZONE, 2, UP], [1, C.elf, LOC.MZONE, 3, DEF]],
    policy: (m, g) => {
      if (m.type === MSG.SELECT_IDLECMD && m.player === 1 && m.to_bp) return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
      if (m.type === MSG.SELECT_BATTLECMD && m.player === 1) { const i = (m.attacks || []).findIndex((a) => a.code === C.luster); if (i >= 0) return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i }; }
      if (m.type === MSG.SELECT_CHAIN && m.player === 0) return chainWith(m, C.mirror);
    } });
  const mz = codesAt(s, 1, 'mzone'); const ok = !mz.includes(C.luster) && !mz.includes(C.gaia) && mz.includes(C.elf);
  return [ok, `Monster danach: ${mz.join(',') || 'keine'}`];
});
T('Kampf gegen Verteidigung: 1900 ATK gegen 2000 DEF → 100 Schaden beim Angreifer, nichts zerstört', async () => {
  const { s, log } = await run({ decks: [deck(C.grave), deck(C.grave)], until: 2,
    field: [[1, C.luster, LOC.MZONE, 1, UP], [0, C.elf, LOC.MZONE, 2, DEF]],
    policy: (m) => {
      if (m.type === MSG.SELECT_IDLECMD && m.player === 1 && m.to_bp) return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
      if (m.type === MSG.SELECT_BATTLECMD && m.player === 1) { const i = (m.attacks || []).findIndex((a) => a.code === C.luster); if (i >= 0) return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i }; }
    } });
  const dmg = log.filter((e) => e.t === 'DAMAGE'); const ok = dmg.length === 1 && dmg[0].player === 1 && dmg[0].amount === 100 && codesAt(s, 0, 'mzone').includes(C.elf) && codesAt(s, 1, 'mzone').includes(C.luster);
  return [ok, `Schaden: ${dmg.map((d) => `Spieler ${d.player}: ${d.amount}`).join(', ') || 'keiner'}`];
});
T('«Kuriboh» aus der Hand: Kampfschaden wird 0', async () => {
  const { s, log } = await run({ decks: [deck(C.kuriboh), deck(C.grave)], until: 2, stack: [[C.kuriboh], []],
    field: [[1, C.gaia, LOC.MZONE, 1, UP]],
    policy: (m) => {
      if (m.type === MSG.SELECT_IDLECMD && m.player === 1 && m.to_bp) return { type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null };
      if (m.type === MSG.SELECT_BATTLECMD && m.player === 1) { const i = (m.attacks || []).findIndex((a) => a.code === C.gaia && a.can_direct); if (i >= 0) return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i }; }
      if (m.type === MSG.SELECT_CHAIN && m.player === 0) return chainWith(m, C.kuriboh);
    } });
  const dmg = log.filter((e) => e.t === 'DAMAGE' && e.player === 0); const used = codesAt(s, 0, 'grave').includes(C.kuriboh);
  return [used && dmg.length === 0, `Kuriboh benutzt: ${used}, Schaden an Spieler 0: ${dmg.map((d) => d.amount).join(',') || 0}`];
});
T('Nur EINE Normalbeschwörung pro Zug', async () => {
  let second = null;
  await run({ decks: [deck(C.celtic, C.luster, C.alex), deck(C.grave)], stack: [[C.celtic, C.luster, C.alex], []], until: 1,
    policy: (m) => { if (m.type !== MSG.SELECT_IDLECMD || m.player !== 0) return; if (second === null && !log2.ns) { log2.ns = true; return summon(m, C.celtic); } if (second === null) { second = (m.summons || []).length; return { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; } } });
  log2.ns = false; return [second === 0, `Normalbeschwörungen danach noch möglich: ${second}`];
});
T('Opferbeschwörung: Stufe 6 braucht 1 Opfer', async () => {
  let without = null, withOne = null;
  await run({ decks: [deck(C.dmg), deck(C.grave)], stack: [[C.dmg], []], until: 1, policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0 && without === null) without = (m.summons || []).some((c) => c.code === C.dmg); } });
  await run({ decks: [deck(C.dmg), deck(C.grave)], stack: [[C.dmg], []], field: [[0, C.elf, LOC.MZONE, 2, UP]], until: 1, policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0 && withOne === null) withOne = (m.summons || []).some((c) => c.code === C.dmg); } });
  return [without === false && withOne === true, `ohne Monster: ${without}, mit einem Monster: ${withOne}`];
});
T('Im ersten Zug darf niemand angreifen', async () => {
  let bp = null; await run({ decks: [deck(C.grave), deck(C.grave)], field: [[0, C.gaia, LOC.MZONE, 2, UP]], until: 1, policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0 && bp === null) bp = !!m.to_bp; } });
  return [bp === false, `Kampfphase im Zug 1 möglich: ${bp}`];
});
T('«Topf der Gier»: zieht genau 2 Karten', async () => {
  const { s, log } = await run({ decks: [deck(C.pot), deck(C.grave)], stack: [[C.pot], []], until: 1, policy: (m) => (m.type === MSG.SELECT_IDLECMD && m.player === 0 ? act(m, C.pot) ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null } : undefined) });
  const draws = log.filter((e) => e.t === 'DRAW' && e.player === 0).map((e) => e.drawn.length); return [draws.includes(2), `Ziehungen: ${draws.join(', ')}`];
});
T('«Wiedergeburt»: holt ein Monster aus dem Friedhof', async () => {
  const { s } = await run({ decks: [deck(C.reborn), deck(C.grave)], stack: [[C.reborn], []], field: [[0, C.bewd, LOC.GRAVE, 0, UP]], until: 1,
    policy: (m) => (m.type === MSG.SELECT_IDLECMD && m.player === 0 ? act(m, C.reborn) ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null } : m.type === MSG.SELECT_CARD && m.player === 0 ? { type: R.SELECT_CARD, indicies: [Math.max(0, (m.selects || []).findIndex((c) => c.code === C.bewd))] } : undefined) });
  return [codesAt(s, 0, 'mzone').includes(C.bewd), `Monsterzone: ${codesAt(s, 0, 'mzone').join(',')}`];
});
T('«Unendliche Unbeständigkeit» aus der Hand nur, wenn man keine Karten kontrolliert (Ziel: Effektmonster)', async () => {
  const probe = async (myField) => { let offered = false; await run({ decks: [deck(C.lord), deck(C.imperm)], stack: [[C.lord], [C.imperm]], field: myField, until: 1,
    policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0) return summon(m, C.lord) ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; if (m.type === MSG.SELECT_CHAIN && m.player === 1 && (m.selects || []).some((c) => c.code === C.imperm && c.location === LOC.HAND)) offered = true; } }); return offered; };
  const empty = await probe([]); const withCard = await probe([[1, C.elf, LOC.MZONE, 2, UP]]);
  return [empty === true && withCard === false, `ohne eigene Karten angeboten: ${empty}, mit eigener Karte: ${withCard}`];
});
T('«Unendliche Unbeständigkeit» kann normale Monster (ohne Effekt) nicht anvisieren', async () => {
  let offered = false; await run({ decks: [deck(C.celtic), deck(C.imperm)], stack: [[C.celtic], [C.imperm]], until: 1,
    policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0) return summon(m, C.celtic) ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; if (m.type === MSG.SELECT_CHAIN && m.player === 1 && (m.selects || []).some((c) => c.code === C.imperm)) offered = true; } });
  return [offered === false, `angeboten: ${offered}`];
});
T('Toon: «Blauäugiger Toon-Drache» nur mit «Toon-Welt» und 2 Opfern spezialbeschwörbar', async () => {
  const probe = async (fld) => { let can = null; await run({ decks: [deck(C.betd), deck(C.grave)], stack: [[C.betd], []], field: fld, until: 1, policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0 && can === null) can = (m.special_summons || []).some((c) => c.code === C.betd) || (m.summons || []).some((c) => c.code === C.betd); } }); return can; };
  const two = [[0, C.elf, LOC.MZONE, 1, UP], [0, C.celtic, LOC.MZONE, 3, UP]];
  const noWorld = await probe(two); const world = await probe([...two, [0, C.tworld, LOC.SZONE, 2, UP]]); const oneTrib = await probe([[0, C.elf, LOC.MZONE, 1, UP], [0, C.tworld, LOC.SZONE, 2, UP]]);
  return [noWorld === false && world === true && oneTrib === false, `ohne Toon-Welt: ${noWorld}, mit Toon-Welt + 2 Monstern: ${world}, mit nur 1 Monster: ${oneTrib}`];
});
T('«Effektschleier» aus der Hand im Zug des Gegners gegen ein Effektmonster', async () => {
  let offered = false; await run({ decks: [deck(C.lord), deck(C.veiler)], stack: [[C.lord], [C.veiler]], until: 1,
    policy: (m) => { if (m.type === MSG.SELECT_IDLECMD && m.player === 0) return summon(m, C.lord) ?? { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; if (m.type === MSG.SELECT_CHAIN && m.player === 1 && (m.selects || []).some((c) => c.code === C.veiler)) offered = true; } });
  return [offered === true, `angeboten: ${offered}`];
});

T('Korrigiertes Skript: «Tenma the Sky Star» – Spezialbeschwörung aus der Hand nur 1× pro Zug (auch mit 2 Kopien)', async () => {
  const st = { first: 0, reborn: 0, again: null, tenmaSS: 0 }; const ZANKI = 30090452;
  const { log } = await run({ decks: [deck(C.tenma, ZANKI, ZANKI, C.reborn), deck(C.grave)], stack: [[C.tenma, ZANKI, ZANKI, C.reborn], []], field: [[1, C.luster, LOC.MZONE, 1, UP], [0, C.tenma, LOC.GRAVE, 0, UP]], until: 1,
    policy: (m) => {
      if (m.type === MSG.SELECT_IDLECMD && m.player === 0) { if (!st.first) return summon(m, C.tenma); if (!st.reborn) { const r = act(m, C.reborn); if (r) { st.reborn = 1; return r; } } return { type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }; }
      if (m.type === MSG.SELECT_CARD && m.player === 0 && st.reborn && !st.picked) { const i = (m.selects || []).findIndex((c) => c.code === C.tenma); if (i >= 0) { st.picked = 1; return { type: R.SELECT_CARD, indicies: [i] }; } }
      if ((m.type === MSG.SELECT_EFFECTYN || m.type === MSG.SELECT_CHAIN) && m.player === 0) {
        const has = m.type === MSG.SELECT_EFFECTYN ? m.code === C.tenma : (m.selects || []).some((c) => c.code === C.tenma);
        if (!st.first && has) { st.first = 1; return m.type === MSG.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: true } : chainWith(m, C.tenma); }
        if (st.first && st.reborn && st.picked && has) st.again = true;
      }
    } });
  const tenmaOnField = log.filter((e) => e.t === 'SPSUMMONING' && e.code === C.tenma).length;
  return [st.first === 1 && tenmaOnField >= 1 && st.again !== true, `erster Effekt genutzt: ${st.first}, 2. Tenma per Wiedergeburt gerufen: ${tenmaOnField >= 1}, Effekt erneut angeboten: ${st.again === true}`];
});

let fail = 0;
for (const c of cases) { let ok = false, info = ''; try { [ok, info] = await c.fn(); } catch (e) { info = 'Fehler: ' + e.message; } if (!ok) fail++; console.log(`${ok ? 'OK    ' : 'FEHLER'} ${c.name} – ${info}`); }
console.log(fail ? `${fail} von ${cases.length} Fällen fehlgeschlagen` : `Alle ${cases.length} Schiedsrichter-Fälle bestanden`); process.exit(fail ? 1 : 0);
