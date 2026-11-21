// Entpacken der eingebetteten Datenblöcke (gzip) – läuft im Browser und unter Node.
export function b64ToU8(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
export async function fetchBin(url) { const r = await fetch(url); if (!r.ok) throw new Error('Laden fehlgeschlagen: ' + url + ' (' + r.status + ')'); return new Uint8Array(await r.arrayBuffer()); }
export async function gunzip(u8) {
  if (!(u8[0] === 0x1f && u8[1] === 0x8b)) return u8; // schon entpackt (z. B. vom Server)
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function openScripts(gz) {
  const u8 = await gunzip(gz); const hl = Number(new TextDecoder('latin1').decode(u8.subarray(0, 10)));
  const index = JSON.parse(new TextDecoder('latin1').decode(u8.subarray(10, 10 + hl)));
  const body = new TextDecoder('latin1').decode(u8.subarray(10 + hl)); // reines ASCII → einbyte-String
  const get = (key) => { const e = index[key]; return e ? body.slice(e[0], e[0] + e[1]) : undefined; };
  const ORDER = { goat: ['g', 'e', 'o'], edison: ['e', 'o', 'p'], official: ['o', 'p', 'e'] };
  /** Skript-Leser für den Kern; mode: 'goat' | 'edison' | 'official' */
  return (mode) => (name) => {
    if (/^c\d+\.lua$/.test(name)) { for (const d of ORDER[mode] || ORDER.official) { const t = get(`${d}/${name}`); if (t !== undefined) return t; } return ''; }
    return get(name) ?? '';
  };
}
/** Karten-Zeilen → Map wie vom Kern erwartet */
export async function openCards(gz) {
  const rows = JSON.parse(new TextDecoder().decode(await gunzip(gz))); const m = new Map();
  for (const r of rows) m.set(r[0], { code: r[0], alias: r[1], setcodes: r[2], type: r[3], level: r[4], attribute: r[5], race: BigInt(r[6]), attack: r[7], defense: r[8], lscale: r[9], rscale: r[10], link_marker: (r[3] & 0x4000000) ? r[8] : 0, name: r[11], desc: r[12], strs: r[13] || [], ot: r[14] || 0 });
  return m;
}
export async function openData(gz) { return JSON.parse(new TextDecoder().decode(await gunzip(gz))); }
