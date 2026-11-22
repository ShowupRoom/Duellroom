// Datensicherung: alle eigenen Daten (Decks, Duellbuch, Album, Akademie, Einstellungen) als eine Datei – zum Aufheben oder
// zum Übertragen aufs andere Handy. Bilder (IndexedDB) gehören nicht dazu, die lädt die App neu.
import { h, toast } from './util.js';
import { confirmBox } from './ui.js';
const SKIP = /^dr\.clib\./; // Kombo-Bibliothek wird auf jedem Gerät neu berechnet
export function backupData() {
  const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('dr.') && !SKIP.test(k)) data[k] = localStorage.getItem(k); }
  return { app: 'duellraum', v: 1, t: Date.now(), data };
}
export async function saveBackup() {
  const b = backupData(); const name = `duellraum-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Duellraum-Sicherung' }); return true; } } catch (e) { if (e && e.name === 'AbortError') return false; }
  const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Sicherung gespeichert: ' + name); return true;
}
export function loadBackup() {
  const inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' }); document.body.append(inp);
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    let b; try { b = JSON.parse(await f.text()); } catch (e) { toast('Die Datei ist keine Duellraum-Sicherung.'); return; }
    if (!b || b.app !== 'duellraum' || !b.data) { toast('Die Datei ist keine Duellraum-Sicherung.'); return; }
    const decks = (() => { try { return JSON.parse(b.data['dr.decks'] || '[]').length; } catch (e) { return 0; } })();
    const when = new Date(b.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    if (!(await confirmBox('Sicherung laden?', `Stand ${when} · ${decks} eigene Decks. Die Daten auf diesem Gerät werden dadurch ersetzt.`, 'Laden', 'Abbrechen', true))) return;
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('dr.') && !SKIP.test(k)) localStorage.removeItem(k); for (const [k, v] of Object.entries(b.data)) if (k.startsWith('dr.')) localStorage.setItem(k, v); }
    catch (e) { toast('Nicht genug Speicherplatz für die Sicherung.'); return; }
    toast('Sicherung geladen – die App startet neu …'); setTimeout(() => location.reload(), 900);
  };
  inp.click();
}
export const backupPanel = () => h('div', { class: 'panel col' }, h('b', null, '💾 Sicherung'),
  h('div', { class: 'muted small' }, 'Deine Decks, das Duellbuch, Album, Akademie-Sterne und Einstellungen liegen nur auf diesem Gerät. Speichere ab und zu eine Sicherung – oder schick sie an das andere Handy und lade sie dort.'),
  h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn pri', onclick: () => saveBackup() }, '⬇ Sicherung speichern'), h('button', { class: 'btn', onclick: () => loadBackup() }, '⬆ Sicherung laden')));
