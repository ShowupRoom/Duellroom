// Speicher auf dem Gerät (localStorage, mit Rückfall auf den Arbeitsspeicher)
const mem = {};
// Speicher voll: einmal pro Sitzung deutlich warnen statt still zu verlieren (die Kombo-Bibliothek ist nur ein Vorteil)
let warned = false;
function full(k, e) { if (warned || /^clib\./.test(k)) return; warned = true; try { window.dispatchEvent(new CustomEvent('dr-full', { detail: k })); } catch (x) { /* */ } }
export const store = {
  get(k, d) { try { const v = localStorage.getItem('dr.' + k); if (v != null) return JSON.parse(v); } catch (e) { /* ignorieren */ } return k in mem ? mem[k] : d; },
  set(k, v) { mem[k] = v; try { localStorage.setItem('dr.' + k, JSON.stringify(v)); } catch (e) { full(k, e); } },
};
