// Baut die installierbare App (PWA) nach app/www: kleiner Start, Kern im Worker, Offline-Cache.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = 'app/www'; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT + '/data', { recursive: true }); mkdirSync(OUT + '/icons', { recursive: true });
const stub = (re) => ({ name: 'stub', setup(b) { b.onResolve({ filter: re }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default function(){throw new Error("nicht im Hauptthread")}', loader: 'js' })); } });
// Datenblöcke
for (const [a, b] of [['scripts.gz', 'scripts.dat'], ['cards.gz', 'cards.dat'], ['data.gz', 'decks.dat'], ['de.gz', 'de.dat']]) copyFileSync('app/dist/' + a, OUT + '/data/' + b);
const hash = createHash('sha1');  for (const f of readdirSync('app/src')) if (f.endsWith('.js')) hash.update(readFileSync('app/src/' + f)); for (const d of ['src', 'app/src/css']) for (const f of readdirSync(d)) if (/\.(mjs|css)$/.test(f)) hash.update(readFileSync(d + '/' + f)); for (const f of readdirSync(OUT + '/data')) hash.update(readFileSync(OUT + '/data/' + f));
for (const f of readdirSync('app/src/css')) hash.update(readFileSync('app/src/css/' + f)); for (const f of readdirSync('app/icons')) hash.update(readFileSync('app/icons/' + f));
const V = hash.digest('hex').slice(0, 10);
const common = { bundle: true, write: true, format: 'iife', platform: 'browser', target: ['es2020', 'safari15'], minify: !process.env.DEV, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"', __VERSION__: JSON.stringify(V) }, logLevel: 'warning' };
await build({ ...common, entryPoints: ['app/src/main.js'], outfile: OUT + '/app.js', plugins: [stub(/ocgcore\.(sync|jspi)-/)] });
await build({ ...common, entryPoints: ['app/src/worker.js'], outfile: OUT + '/worker.js', plugins: [stub(/ocgcore\.jspi-/)] });
const css = readdirSync('app/src/css').filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync('app/src/css/' + f, 'utf-8')).join('\n');
const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#050b1c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Duellraum">
<title>Duellraum</title>
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="preload" href="data/cards.dat?v=${V}" as="fetch" crossorigin="anonymous"><link rel="preload" href="data/decks.dat?v=${V}" as="fetch" crossorigin="anonymous"><link rel="preload" href="data/de.dat?v=${V}" as="fetch" crossorigin="anonymous">
<style>${css}</style></head>
<body><div id="app"><div class="boot"><div class="boot-logo">⚔</div><div class="boot-t">Duellraum</div><div class="boot-s" id="boot-s">Wird geladen …</div><div class="boot-bar"><i id="boot-i"></i></div></div></div>
<script src="app.js?v=${V}" defer></script>
<script>if('serviceWorker' in navigator&&location.protocol!=='file:'){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').then(r=>{const ask=w=>{window.__swWaiting=w;document.dispatchEvent(new Event('sw-update'))};if(r.waiting&&navigator.serviceWorker.controller)ask(r.waiting);r.addEventListener('updatefound',()=>{const w=r.installing;w&&w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)ask(w)})})}).catch(()=>{}));let rl=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(window.__swReload&&!rl){rl=true;location.reload()}})}</script>
</body></html>`;
writeFileSync(OUT + '/index.html', html);
const files = ['./', 'index.html', `app.js?v=${V}`, `worker.js?v=${V}`, `data/cards.dat?v=${V}`, `data/decks.dat?v=${V}`, `data/scripts.dat?v=${V}`, `data/de.dat?v=${V}`, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/maskable-512.png'];
writeFileSync(OUT + '/sw.js', `// Offline-Cache der App (Version ${V})
const C = 'duellraum-${V}'; const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('duellraum-') && k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') { e.respondWith(caches.match('index.html', { cacheName: C }).then((m) => m || fetch(r))); return; }
  e.respondWith(caches.match(r, { cacheName: C }).then((m) => m || fetch(r).then((res) => { if (res.ok && u.search.includes('v=')) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); } return res; })));
});
`);
writeFileSync(OUT + '/manifest.webmanifest', JSON.stringify({ name: 'Duellraum – Yu-Gi-Oh! zu zweit', short_name: 'Duellraum', start_url: './', scope: './', display: 'standalone', orientation: 'portrait', background_color: '#050b1c', theme_color: '#050b1c', lang: 'de', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 1));
if (existsSync('app/icons')) for (const f of readdirSync('app/icons')) copyFileSync('app/icons/' + f, OUT + '/icons/' + f);
writeFileSync(OUT + '/_headers', `/*\n  X-Content-Type-Options: nosniff\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n`);
writeFileSync(OUT + '/.nojekyll', '');
const sz = (f) => (readFileSync(OUT + '/' + f).length / 1e6).toFixed(2) + ' MB';
console.log('Version', V, '| app.js', sz('app.js'), '| worker.js', sz('worker.js'), '| index.html', sz('index.html'));
