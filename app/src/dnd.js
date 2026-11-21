// Ziehen & Ablegen für Maus und Touch (langes Drücken startet das Ziehen, damit Scrollen weiter geht)
import { h } from './util.js';

/**
 * opts: root, itemSel, zoneSel, getData(itemEl) → Daten | null, onDrop(data, zoneEl, itemEl), onTap(itemEl), ghost(itemEl) → Element, scrollers: [Elemente]
 */
export function enableDnd(o) {
  let s = null; let ghost = null; let over = null; const HOLD = 230;
  const mark = (z) => { if (over === z) return; if (over) over.classList.remove('dz-over'); over = z; if (z) z.classList.add('dz-over'); };
  const zoneAt = (x, y) => { const e = document.elementFromPoint(x, y); return e ? e.closest(o.zoneSel) : null; };
  const begin = () => {
    if (!s || s.started) return; const data = o.getData(s.el); if (!data) { s = null; return; }
    s.started = true; s.data = data; const g = o.ghost ? o.ghost(s.el) : s.el.cloneNode(true);
    ghost = h('div', { class: 'dnd-ghost' }, g); document.body.append(ghost); place(s.x, s.y); document.body.classList.add('dragging'); s.el.classList.add('drag-src');
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* */ } }
  };
  const place = (x, y) => { if (ghost) ghost.style.transform = `translate(${x - 28}px,${y - 60}px)`; };
  const autoscroll = (y) => { for (const sc of o.scrollers ? o.scrollers() : []) { const r = sc.getBoundingClientRect(); if (y > r.top && y < r.bottom) { if (y < r.top + 36) sc.scrollTop -= 10; else if (y > r.bottom - 36) sc.scrollTop += 10; } } };
  const down = (x, y, el, touch) => { s = { el, x0: x, y0: y, x, y, touch, started: false, moved: false }; if (touch) s.timer = setTimeout(begin, HOLD); };
  const move = (x, y, e) => {
    if (!s) return; s.x = x; s.y = y; const d = Math.hypot(x - s.x0, y - s.y0);
    if (!s.started) { if (d > (s.touch ? 10 : 5)) { s.moved = true; if (s.touch) { clearTimeout(s.timer); s = null; } else begin(); } return; }
    if (e && e.cancelable) e.preventDefault(); place(x, y); mark(zoneAt(x, y)); autoscroll(y);
  };
  const up = (x, y) => {
    if (!s) return; clearTimeout(s.timer); const st = s; s = null;
    if (st.started) { const z = zoneAt(x, y); st.el.classList.remove('drag-src'); if (z) o.onDrop(st.data, z, st.el); }
    else if (!st.moved) o.onTap && o.onTap(st.el);
    if (ghost) { ghost.remove(); ghost = null; } mark(null); document.body.classList.remove('dragging');
  };
  const cancel = () => { if (!s) return; clearTimeout(s.timer); if (s.started && s.el) s.el.classList.remove('drag-src'); s = null; if (ghost) { ghost.remove(); ghost = null; } mark(null); document.body.classList.remove('dragging'); };
  const r = o.root;
  r.addEventListener('mousedown', (e) => { if (e.button !== 0) return; const it = e.target.closest(o.itemSel); if (it && !e.target.closest('[data-nodrag]')) { down(e.clientX, e.clientY, it, false); e.preventDefault(); } });
  const mm = (e) => move(e.clientX, e.clientY, e), mu = (e) => up(e.clientX, e.clientY);
  window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  r.addEventListener('touchstart', (e) => { const it = e.target.closest(o.itemSel); if (!it || e.touches.length !== 1 || e.target.closest('[data-nodrag]')) return; const t = e.touches[0]; down(t.clientX, t.clientY, it, true); }, { passive: true });
  r.addEventListener('touchmove', (e) => { if (!s) return; const t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
  r.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (s) e.preventDefault(); up(t.clientX, t.clientY); }, { passive: false });
  r.addEventListener('touchcancel', cancel);
  r.addEventListener('contextmenu', (e) => { if (s && s.touch) e.preventDefault(); });
  return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
}
