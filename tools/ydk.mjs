// Gemeinsame Helfer: .ydk lesen, Kartenlisten (lflist) lesen, Decks prüfen.
import { readFileSync, existsSync } from 'node:fs';

export function parseYdk(text) {
  const out = { main: [], extra: [], side: [], created: '' };
  let sec = 'main';
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('#created')) { out.created = l.slice(8).trim(); continue; }
    if (l === '#main') { sec = 'main'; continue; }
    if (l === '#extra') { sec = 'extra'; continue; }
    if (l === '!side') { sec = 'side'; continue; }
    if (l[0] === '#' || l[0] === '!') continue;
    const n = Number(l); if (Number.isInteger(n) && n > 0) out[sec].push(n);
  }
  return out;
}

/** lflist.conf: erste Liste (neueste). Rückgabe { name, whitelist, map: code→erlaubte Anzahl } */
export function parseLflist(path, which = 0) {
  const lists = []; let cur = null;
  for (const raw of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('!')) { cur = { name: l.slice(1), whitelist: false, map: new Map() }; lists.push(cur); continue; }
    if (!cur || !l || l[0] === '#') continue;
    if (l === '$whitelist') { cur.whitelist = true; continue; }
    const m = l.match(/^(\d+)\s+(\d)/); if (m) cur.map.set(Number(m[1]), Number(m[2]));
  }
  return lists[which];
}

export const needsScript = (t) => !!(t & (0x2 | 0x4 | 0x20 | 0x40 | 0x80 | 0x2000 | 0x800000 | 0x1000000 | 0x4000000));
export const typeLetter = (t) => (t & 1 ? 'M' : t & 2 ? 'S' : 'T');

/** alt. Artworks (alias dicht am Code) auf die Originalkarte zurückführen */
export function canon(code, cards) {
  const c = cards.get(code); if (!c) return code;
  return c.alias && Math.abs(c.alias - code) <= 10 ? c.alias : code;
}

export function group(list, cards) {
  const m = new Map(); for (const c of list) { const k = canon(c, cards); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([code, n]) => [code, n]);
}

export function checkAgainstList(deck, lf, cards) {
  if (!lf) return null;
  const used = new Map();
  for (const sec of ['main', 'extra', 'side']) for (const [c, n] of deck[sec]) used.set(c, (used.get(c) || 0) + n);
  const bad = [];
  for (const [c, n] of used) {
    const lim = lf.map.has(c) ? lf.map.get(c) : (lf.whitelist ? 0 : 3);
    if (n > lim) bad.push([c, n, lim]);
  }
  return bad;
}
