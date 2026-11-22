// Deck teilen: als Link (…?deck=…) über das Teilen-Menü des Handys – die andere öffnet den Link und übernimmt das Deck.
import { h, toast, uid } from './util.js';
import { confirmBox } from './ui.js';
import { saveCustom, count } from './data.js';
import { settings } from './screens.js';
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
// kompakt: Abschnitte als „Code*Anzahl“ – hält den Link kurz
const pack = (L) => (L || []).map(([c, n]) => (n > 1 ? `${c}*${n}` : String(c))).join('.');
const unpack = (s) => (s ? s.split('.').filter(Boolean).map((x) => { const [c, n] = x.split('*'); return [+c, +(n || 1)]; }).filter(([c, n]) => c > 0 && n > 0 && n <= 3) : []);
export function deckLink(d) {
  const o = { n: d.name || 'Deck', f: d.fmt, l: d.list, m: pack(d.main), e: pack(d.extra), s: pack(d.side), by: /^Spieler \d$/.test(settings.names[0] || '') ? '' : (settings.names[0] || '') };
  const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('deck', b64(JSON.stringify(o))); return u.toString();
}
export async function shareDeck(d) {
  const url = deckLink(d); const text = `Mein Deck „${d.name}“ für den Duellraum`;
  try { if (navigator.share) { await navigator.share({ title: d.name, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Link kopiert – schick ihn einfach weiter.'); } catch (e) { toast('Teilen nicht möglich.'); }
}
/** beim Start: …?deck=… lesen und nach Rückfrage als eigenes Deck speichern */
export async function readDeckFromUrl(open) {
  let o; try { const q = new URLSearchParams(location.search).get('deck'); if (!q) return false; o = JSON.parse(unb64(q)); } catch (e) { return false; }
  history.replaceState(null, '', location.pathname);
  const d = { name: String(o.n || 'Geteiltes Deck').slice(0, 40), fmt: o.f || 'advanced', list: o.l || (o.f === 'advanced' ? 'tcg' : o.f), main: unpack(o.m), extra: unpack(o.e), side: unpack(o.s) };
  if (!count(d.main)) { toast('Der Deck-Link ist leer oder beschädigt.'); return false; }
  const from = o.by ? ` von ${String(o.by).slice(0, 20)}` : '';
  if (!(await confirmBox(`Deck „${d.name}“${from} übernehmen?`, `${count(d.main)} Karten im Hauptdeck, ${count(d.extra)} im Extradeck. Es wird bei „Meine Decks“ gespeichert.`, 'Übernehmen', 'Nein'))) return false;
  const rec = saveCustom({ ...d, id: uid() }); toast(`„${d.name}“ gespeichert`); if (open) open(rec || d); return true;
}
export const shareBtn = (getDeck, cls = 'btn') => h('button', { class: cls, onclick: () => { const d = getDeck(); if (!d || !count(d.main)) { toast('Das Deck ist noch leer.'); return; } shareDeck(d); } }, '📤 Deck teilen');
