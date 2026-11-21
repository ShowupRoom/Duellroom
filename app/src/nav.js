// Bildschirm-Wechsel mit Zurück-Taste
import { $, clear } from './util.js';
export const screens = {}; const stack = []; let guard = null;
export const setGuard = (fn) => { guard = fn; };
export const setParams = (p) => { stack[stack.length - 1].params = p; };
function show(name, params) {
  const app = $('#app'); clear(app); const el = screens[name](params); app.append(el); stack[stack.length - 1].el = el; return el;
}
export function go(name, params = {}) {
  stack.push({ name, params }); try { history.pushState({ n: stack.length }, ''); } catch (e) { /* ignorieren */ }
  return show(name, params);
}
export function replace(name, params = {}) { stack[stack.length - 1] = { name, params }; return show(name, params); }
export async function back() {
  if (stack.length < 2) return;
  if (guard && !(await guard())) { try { history.pushState({ n: stack.length }, ''); } catch (e) { /* ignorieren */ } return; }
  guard = null; stack.pop(); const t = stack[stack.length - 1]; show(t.name, t.params);
}
export const depth = () => stack.length;
export function initNav() { window.addEventListener('popstate', () => { back(); }); }
export function root(name, params = {}) { stack.length = 0; stack.push({ name, params }); show(name, params); }
