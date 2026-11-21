import { loadCards, SCRIPTS } from './lib.mjs';
import { existsSync } from 'node:fs';
const cards = loadCards();
for (const c of process.argv.slice(2).map(Number)) {
  const f = ['official','pre-release','pre-errata','goat'].map((d) => `${d}:${existsSync(`${SCRIPTS}/${d}/c${c}.lua`)}`).join(' ');
  console.log(c, cards.get(c)?.name, f);
}
