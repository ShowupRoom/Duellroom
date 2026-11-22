import { App, boot } from './data.js';
import * as TXT from './strings.js';
import * as EFX from './effecttext.js';
import { screens, root, go, back, initNav } from './nav.js';
import './screens.js';
import './duel.js';
import './editor.js';
import './online.js';
import './md.js';
import './home.js';
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
