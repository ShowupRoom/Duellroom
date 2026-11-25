import { App, boot } from './data.js';
import * as TXT from './strings.js';
import { toast } from './util.js';
import { store } from './store.js';
// Wischleisten (Reiter, Banlisten, Formate): den gewählten Eintrag ins Bild holen, sobald er wechselt
let scT = 0; new MutationObserver(() => { clearTimeout(scT); scT = setTimeout(() => { for (const on of document.querySelectorAll('.screen:not(.duel) .on')) { const row = on.parentElement; if (!row || row.scrollWidth <= row.clientWidth + 4) continue; const ox = getComputedStyle(row).overflowX; if (ox !== 'auto' && ox !== 'scroll') continue; const key = on.textContent; if (row.dataset.scOn === key) continue; row.dataset.scOn = key; const l = on.offsetLeft - row.offsetLeft, r = l + on.offsetWidth; if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, l - (row.clientWidth - on.offsetWidth) / 2); } }, 60); }).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('dr-full', () => toast('⚠️ Der Speicher dieses Geräts ist voll – Neues wird evtl. nicht gespeichert. Einstellungen → Daten: Sicherung speichern, alte Duelle oder Bilder löschen.', 7000));
import * as EFX from './effecttext.js';
import { screens, root, go, back, initNav } from './nav.js';
import './screens.js';
import './duel.js';
import './editor.js';
import './online.js';
import './md.js';
import './home.js';
import './onboard.js';
import './book.js';
import './academy.js';
import { readChallengeFromUrl } from './record.js';
import { readDeckFromUrl } from './deckshare.js';
import { libLoop } from './combolib.js';
import './match.js';
import { applyLook } from './look.js';
import { joinRoom } from './online.js';
import { prewarm } from './engine.js';
import { myName } from './net.js';
import { expand, MODES } from './data.js';
import * as fx from './effecttext.js';

const set = (t, p) => { const s = document.getElementById('boot-s'), i = document.getElementById('boot-i'); if (s) s.textContent = t; if (i) i.style.width = Math.round(p * 100) + '%'; };
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__bip = e; });
(async () => {
  try {
    await boot(set);
    window.__app = App; window.__fx = fx; window.__txt = TXT; window.__efx = EFX; window.__nav = { root, go, back, screens }; // (Prüfhaken für Tests)
    applyLook(true); initNav(); root('home'); document.body.dataset.done = 'ready';
    const upd = () => { if (document.querySelector('.upd') || (window.__duel && !window.__duel.stopped)) return; const b = document.createElement('div'); b.className = 'upd'; b.innerHTML = '<span style="flex:1">✨ Neue Version verfügbar</span><button class="btn pri sm">Jetzt laden</button><button class="btn ghost sm">Später</button>'; b.children[1].onclick = () => { window.__swReload = true; window.__swWaiting && window.__swWaiting.postMessage('skip'); }; b.children[2].onclick = () => b.remove(); document.body.append(b); };
    document.addEventListener('sw-update', upd); if (window.__swWaiting) upd();
    // Spielkern im Hintergrund vorwärmen, sobald das Menü steht
    setTimeout(() => prewarm().then(() => { document.body.dataset.core = 'ready'; }).catch((e) => console.warn('Kern', e)), 300);
    const j = new URLSearchParams(location.search).get('join');
    if (j && /^[A-Z0-9]{5}$/i.test(j)) { history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).get('peer') ? '?peer=' + new URLSearchParams(location.search).get('peer') : '')); if (myName()) joinRoom(j.toUpperCase()); else { go('online'); setTimeout(() => { const c = document.querySelector('.code-in'); if (c) c.value = j.toUpperCase(); }, 50); } }
  } catch (e) { document.body.dataset.error = String((e && e.stack) || e); console.error(e); const s = document.getElementById('boot-s'); if (s) s.textContent = 'Fehler beim Start: ' + (e && e.message || e); }
})();

// Starts zählen (für den einmaligen Installations-Hinweis)
try { const k = 'dr.starts'; localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + 1)); } catch (e) { /* */ }

// Kombo-Bibliothek: eigene Decks im Hintergrund durchsuchen (pausiert während eines Duells)
setTimeout(() => { libLoop().catch(() => {}); }, 6000);

// Deck per Link (…?deck=…): nach Rückfrage bei „Meine Decks“ speichern und im Editor öffnen
if (new URLSearchParams(location.search).get('deck')) { const t0 = Date.now(); const w = setInterval(() => { if (document.body.dataset.done || Date.now() - t0 > 60000) { clearInterval(w); readDeckFromUrl((d) => import('./nav.js').then((n) => n.go('editor', { deck: d }))).catch(() => {}); } }, 300); }

// Unterbrochenes Online-Duell (App neu geladen, z. B. nach App-Wechsel auf dem iPhone): Rückkehr anbieten
{ const rec = store.get('online.last', null);
  if (rec && rec.code && Date.now() - rec.t < 3 * 3600e3 && !new URLSearchParams(location.search).get('join')) {
    const t0 = Date.now(); const w = setInterval(async () => { if (!document.body.dataset.done && Date.now() - t0 < 60000) return; clearInterval(w);
      const { confirmBox } = await import('./ui.js'); const { resumeOnline } = await import('./online.js');
      const yes = await confirmBox('Zurück ins Online-Duell?', `Dein Duell${rec.partner ? ' gegen ' + rec.partner : ''} (Raum ${rec.code}) wurde unterbrochen. ${rec.role === 'host' ? 'Der Raum wird wieder eröffnet und das Duell geht beim letzten Stand weiter.' : 'Du trittst dem Raum wieder bei und spielst weiter.'}`, 'Zurück ins Duell', 'Nein');
      if (yes) resumeOnline(rec); else store.set('online.last', null);
    }, 300); } }

// Herausforderung per Link (…?ch=…): ins Duellbuch übernehmen
try { const ch = readChallengeFromUrl(); if (ch) setTimeout(() => { import('./nav.js').then((n) => n.go('book')); }, 1500); } catch (e) { /* */ }
