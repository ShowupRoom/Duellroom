// Korrekturen an Karten-Skripten (ProjectIgnis), wo das Skript vom offiziellen Kartentext abweicht.
// Jede Korrektur ersetzt eine exakte Textstelle. Ändert ProjectIgnis das Skript, passt die Stelle nicht mehr → die Korrektur
// wird übersprungen und test/script-fixes.mjs meldet das (dann prüfen, ob die Korrektur noch nötig ist).
// Gefunden mit test/opt-audit.mjs (Kartentext nennt harte Sperre „You can only use this effect of … once per turn“, Skript hatte keine).
const after = (desc, add) => [desc, desc + '\n\t' + add];
export const FIXES = {
  37910722: { why: 'Ascension Sky Dragon: Spezialbeschwörung der Materialien nur 1× pro Zug', rep: [after('e2:SetDescription(aux.Stringid(id,1))', 'e2:SetCountLimit(1,id)')] },
  47172959: { why: 'Yubel – The Loving Defender Forever: Schaden bei Fusionsbeschwörung nur 1× pro Zug', rep: [after('e1:SetDescription(aux.Stringid(id,0))', 'e1:SetCountLimit(1,id)')] },
  42899204: { why: 'Evil Eye Mesmerism: nur 1 Aktivierung pro Zug', rep: [after('e1:SetDescription(aux.Stringid(id,1))', 'e1:SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)')] },
  95816395: { why: 'Dogu: Suche nur 1× pro Zug (nicht je Kopie)', rep: [['e1:SetCountLimit(1)', 'e1:SetCountLimit(1,id)']] },
  33837653: { why: 'Tenma the Sky Star: Spezialbeschwörung aus der Hand nur 1× pro Zug', rep: [after('e2:SetDescription(aux.Stringid(id,1))', 'e2:SetCountLimit(1,id)')] },
  47219274: { why: 'Freki the Runick Fangs: Zurückholen nur 1× pro Zug', rep: [after('e4:SetDescription(aux.Stringid(id,1))', 'e4:SetCountLimit(1,id)')] },
  74715061: { why: 'Striping Partner: Wiederbelebung nur 1× pro Zug', rep: [after('e3:SetDescription(aux.Stringid(id,1))', 'e3:SetCountLimit(1,id)')] },
  32036866: { why: 'F.A. Overheat: Friedhofs-Effekt nur 1× pro Zug', rep: [after('e2:SetDescription(aux.Stringid(id,1))', 'e2:SetCountLimit(1,id)')] },
  49725936: { why: 'Triple Burst Dragon: Opfer-Effekt hat laut Text keine Sperre (Skript sperrte ihn je Name)', rep: [['\te3:SetCountLimit(1,id)\n', '']] },
};
/** Korrektur auf ein Skript anwenden (Dateiname cNNN.lua). Gibt den Text zurück; ok=false, wenn eine Stelle nicht (genau einmal) passt. */
export function applyFix(file, text) {
  const m = /^c(\d+)\.lua$/.exec(file.split('/').pop()); const f = !globalThis.process?.env?.NOFIX && m && FIXES[m[1]]; if (!f || !text) return { text, ok: true, fixed: false };
  let t = text.replace(/\r/g, ''); let ok = true;
  for (const [a, b] of f.rep) { const n = t.split(a).length - 1; if (n !== 1) { ok = false; continue; } t = t.replace(a, b); }
  return { text: ok ? t : text, ok, fixed: ok };
}
