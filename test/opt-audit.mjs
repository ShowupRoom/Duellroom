// Abgleich Kartentext ↔ Skript für ALLE Karten: Nennt der Text eine harte Sperre („You can only use … once per turn“,
// „You can only activate 1 … per turn“, „You can only Special Summon … once per turn“), muss das Skript eine passende Sperre haben –
// und umgekehrt darf ein Skript keine harte Sperre setzen, wenn der Text nur „Once per turn“ (pro Kopie) sagt.
import { writeFileSync } from 'node:fs';
import { loadCards, scriptReader } from './lib.mjs';
const cards = loadCards(); const read = scriptReader('official'); const OUT = process.env.OUT || '.';
const TOKEN = 0x4000, SKILL = 0x8000000, NORMAL = 0x10;
const HARD_TXT = /You can only (use|activate|Special Summon|apply|Normal Summon|Set|conduct|control)[^.]*?(once per (turn|Duel|Chain)|1 [^.]*? per (turn|Duel)|per turn)/i;
const SOFT_TXT = /(^|[.:;)\]\n]\s*)Once per (turn|Chain)/i;
// Sperr-Signale im Skript (harte Sperre auf den Kartennamen oder eine eigene Merkmalsprüfung)
const HARD_SCR = /SetCountLimit\(\s*\d\s*,\s*\{?\s*id\b|\(c,\s*id\b|CreateMysteruneQPEffect|aux\.GlobalCheck|EFFECT_CANNOT_SPECIAL_SUMMON|SetCountLimit\(\s*1\s*,\s*\{?\s*(id|\d{5,})|SetSPSummonOnce|EFFECT_COUNT_CODE|RegisterFlagEffect\(\s*(tp|1-tp|rp|p|ep|c:GetControler\(\)|e:GetHandlerPlayer\(\))?\s*,?\s*id|GetFlagEffect\([^)]*id|AddCustomActivityCounter|HasFlagEffect\([^)]*id|Duel\.GetActivityCount|SetCountLimit\(\s*1\s*,\s*\{?\s*\w+id|SetCountLimit\(\s*1\s*,\s*s\.|aux\.CreateUrsarcticSpsummon|Pendulum\.AddProcedure[^\n]*id|IsHasEffect\(id\)|aux\.RegisterClientHint|FLAG_EFFECT|Duel\.RegisterFlagEffect/;
const SOFT_SCR = /SetCountLimit\(\s*1\s*\)|SetCountLimit\(\s*1\s*,\s*0\s*,|EFFECT_FLAG_NO_TURN_RESET|SetCountLimit\(1,0/;
const res = { checked: 0, noScript: [], hardMissing: [], softButHard: [] };
for (const c of cards.values()) {
  if (c.alias || (c.type & (TOKEN | SKILL)) || c.code >= 500000000 || c.code < 100) continue;
  const nm = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const t = (c.desc || '').split(c.name).join('NAME').replace(/\b(?:[A-Z]\.){1,4}(?=[A-Z ])/g, (m) => m.replace(/\./g, '')); const src = read(`c${c.code}.lua`);
  if (!src) { if (c.ot & 0x100) continue; /* Rush-Duel-Karten: hier nicht spielbar */ if (!(c.type & NORMAL) || (c.type & 0x1000000)) res.noScript.push(c.code); continue; }
  res.checked++;
  const hardT = HARD_TXT.test(t); const softT = SOFT_TXT.test(t);
  const hardS = HARD_SCR.test(src); const softS = SOFT_SCR.test(src) || /SetCountLimit\(\s*1\s*[,)]/.test(src);
  if (hardT && !hardS) res.hardMissing.push(c.code);
  if (!hardT && softT && /SetCountLimit\(\s*1\s*,\s*\{?\s*id\b/.test(src) && !/once per (Duel|Chain)/i.test(t)) res.softButHard.push(c.code);
}
// Geprüft und in Ordnung (alter Wortlaut „You can only use this effect once per turn“ = je Kopie, oder „once per Chain“):
const OK = new Set([12183332, 42541548, 50593156, 50675040]);
res.hardMissing = res.hardMissing.filter((k) => !OK.has(k)); res.softButHard = res.softButHard; // Triple Burst Dragon wird per sources/script-fixes.mjs korrigiert
writeFileSync(`${OUT}/opt-audit.json`, JSON.stringify(res));
console.log(`geprüft ${res.checked}; ohne Skript ${res.noScript.length}; Text harte Sperre, Skript ohne: ${res.hardMissing.length}; Text „Once per turn“, Skript hart: ${res.softButHard.length}`);
const show = (L, n = 15) => L.slice(0, n).map((k) => `  ${k} ${cards.get(k).name}`).join('\n');
console.log('Harte Sperre fehlt?\n' + res.hardMissing.map((k) => `  ${k} ${cards.get(k).name} | ${(cards.get(k).desc.match(/You can only[^.]*\./) || [''])[0]}`).join('\n')); console.log('Zu streng?\n' + show(res.softButHard));
if (res.hardMissing.length || res.softButHard.length) { console.log('→ neue Abweichungen Text/Skript, bitte prüfen'); process.exit(1); }
console.log('Kartentext und Skript-Sperren stimmen überein');
