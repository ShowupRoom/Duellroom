// Speicher auf dem Gerät (localStorage, mit Rückfall auf den Arbeitsspeicher)
const mem = {};
export const store = {
  get(k, d) { try { const v = localStorage.getItem('dr.' + k); if (v != null) return JSON.parse(v); } catch (e) { /* ignorieren */ } return k in mem ? mem[k] : d; },
  set(k, v) { mem[k] = v; try { localStorage.setItem('dr.' + k, JSON.stringify(v)); } catch (e) { /* ignorieren */ } },
};
