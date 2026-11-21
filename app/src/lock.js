// App-Sperre: Vor dem Start muss ein Passwort eingegeben werden.
// Im App-Code steht nur ein Prüfcode (PBKDF2-SHA256, Salz, viele Runden) – nie das Passwort selbst. Ein freigeschaltetes Gerät merkt sich das.
import { h } from './util.js';

const CFG = typeof __LOCK__ !== 'undefined' ? String(__LOCK__ || '').trim() : '';
const KEY = 'duellraum-unlock';
export const lockOn = () => !!CFG;
const tag = () => CFG.split('.')[3].slice(0, 24);
const get = (st) => { try { return st.getItem(KEY); } catch (e) { return null; } };
const put = (st, v) => { try { v == null ? st.removeItem(KEY) : st.setItem(KEY, v); } catch (e) { /* privater Modus: dann nur bis zum Schließen */ } };
export const isUnlocked = () => !CFG || get(localStorage) === tag() || get(sessionStorage) === tag();

const ub64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function check(pw) {
  const [v, it, salt, hash] = CFG.split('.'); if (v !== 'v1') throw new Error('Unbekanntes Code-Format');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ub64(salt), iterations: +it }, key, 256));
  const want = ub64(hash); if (bits.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ want[i]; return diff === 0;
}

/** Gibt ein Versprechen zurück, das erst erfüllt ist, wenn die App freigeschaltet ist */
export function gate() {
  if (isUnlocked()) return Promise.resolve();
  return new Promise((resolve) => {
    let fails = 0;
    const pw = h('input', { type: 'password', class: 'lock-in', id: 'lock-pw', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Passwort', 'aria-label': 'Passwort' });
    const keep = h('input', { type: 'checkbox', checked: true, id: 'lock-keep' });
    const err = h('div', { class: 'lock-err', role: 'alert' });
    const go = h('button', { class: 'lock-go', type: 'submit' }, 'Öffnen');
    const box = h('form', { class: 'lock-box', autocomplete: 'off' },
      h('div', { class: 'lock-logo' }, '⚔'), h('div', { class: 'lock-t' }, 'Duellraum'), h('div', { class: 'lock-s' }, 'Privat – bitte Passwort eingeben'),
      pw, h('label', { class: 'lock-keep', for: 'lock-keep' }, keep, h('span', null, 'Auf diesem Gerät merken')), err, go);
    const el = h('div', { class: 'lock' }, box); document.body.append(el);
    setTimeout(() => { try { pw.focus(); } catch (e) { /* egal */ } }, 80);
    box.addEventListener('submit', async (e) => {
      e.preventDefault(); const val = pw.value; if (!val || go.disabled) return;
      go.disabled = true; err.textContent = ''; let ok = false;
      try { if (!(window.crypto && crypto.subtle)) throw new Error('nocrypto'); ok = await check(val); }
      catch (x) { err.textContent = x && x.message === 'nocrypto' ? 'Dieser Browser kann das Passwort nicht prüfen. Bitte die App über https öffnen.' : 'Prüfung fehlgeschlagen.'; go.disabled = false; return; }
      if (ok) { put(keep.checked ? localStorage : sessionStorage, tag()); if (!keep.checked) put(localStorage, null); el.classList.add('out'); setTimeout(() => el.remove(), 250); resolve(); return; }
      fails++; pw.value = ''; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); err.textContent = 'Falsches Passwort.';
      const wait = Math.min(8000, 500 * fails * fails); if (fails >= 3) err.textContent = `Falsches Passwort. Nächster Versuch in ${Math.ceil(wait / 1000)} s.`;
      setTimeout(() => { go.disabled = false; try { pw.focus(); } catch (x) { /* egal */ } }, wait);
    });
  });
}

/** Dieses Gerät wieder sperren (Einstellungen) */
export function relock() { put(localStorage, null); put(sessionStorage, null); location.reload(); }
