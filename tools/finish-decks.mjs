// Ergänzt jedes Deck um den Tutor (Stil, Ziel, Plan, Schlüsselkarten) und schreibt data/decks.json
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCards } from '../test/lib.mjs';
import { analyze } from '../src/tutor.mjs';
const cards = loadCards();
const setnames = JSON.parse(readFileSync(new URL('../data/strings.json', import.meta.url), 'utf-8')).setname;
const goals = JSON.parse(readFileSync(new URL('../data/goals.json', import.meta.url), 'utf-8'));
const GRP = { Archetypes: 'Archetypen', Mechanics: 'Mechaniken', 'World Championship': 'Weltmeisterschaft' };
const raw = JSON.parse(readFileSync(new URL('../data/decks-raw.json', import.meta.url), 'utf-8'));
const out = []; const seen = new Set();
for (const d of raw) {
  let id = d.id; for (let i = 2; seen.has(id); i++) id = d.id + '-' + i; seen.add(id);
  const a = analyze(d, cards, setnames);
  const g = goals[`${d.fmt}:${d.name}`];
  const draft = d.status === 'offen';
  out.push({
    id, name: d.name, fmt: d.fmt, list: d.list, grp: draft ? 'Entwürfe' : (GRP[d.grp] || d.grp), sub: d.sub || '', src: d.src,
    status: draft ? 'entwurf' : d.status, repairs: d.repairs, issues: d.issues,
    main: d.main, extra: d.extra, side: d.side,
    tutor: { style: d.handmade?.style || a.style, goal: g || d.handmade?.goal || a.goal, plan: a.plan, hint: d.handmade?.plan || '', weak: d.handmade?.weak || '', keys: a.keys, engines: a.engines, bridges: a.bridges, handmade: !!(g || d.handmade) },
  });
}
writeFileSync(new URL('../data/decks.json', import.meta.url), JSON.stringify(out));
const by = {}; for (const d of out) { const k = `${d.fmt} / ${d.grp}`; by[k] = (by[k] || 0) + 1; }
console.log(out.length, 'Decks,', out.filter((x) => x.tutor.handmade).length, 'mit handgeschriebenem Ziel,', Math.round(JSON.stringify(out).length / 1024), 'KB');
console.log(by);
console.log(out.filter((x) => x.fmt === 'advanced' && x.grp === 'Archetypen').slice(5, 7).map((x) => `${x.name} [${x.tutor.style}]: ${x.tutor.goal}`).join('\n'));
