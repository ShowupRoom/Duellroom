// Baut die Einzel-HTML: Programmcode (esbuild) + Stil + eingebettete Datenblöcke (gzip → base64).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const stubJspi = {
  name: 'stub-jspi',
  setup(b) {
    b.onResolve({ filter: /ocgcore\.jspi/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default function(){throw new Error("JSPI nicht enthalten")}', loader: 'js' }));
  },
};
const res = await build({
  entryPoints: ['app/src/main.js'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020',
  minify: !process.env.DEV, legalComments: 'none', plugins: [stubJspi], define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
import { readdirSync } from 'node:fs';
const css = readdirSync('app/src/css').filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync('app/src/css/' + f, 'utf-8')).join('\n');
const b64 = (f) => readFileSync('app/dist/' + f).toString('base64');
const blocks = ['scripts', 'cards', 'data'].map((k) => `<script type="application/octet-stream" id="blk-${k}">${b64(k + '.gz')}</script>`).join('\n');
const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#050b1c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<title>Duellraum</title>
<style>${css}</style></head>
<body><div id="app"><div class="boot"><div class="boot-logo">⚔</div><div class="boot-t">Duellraum</div><div class="boot-s" id="boot-s">Wird geladen …</div><div class="boot-bar"><i id="boot-i"></i></div></div></div>
${blocks}
<script>${js}</script></body></html>`;
writeFileSync('app/dist/duellraum.html', html);
console.log('duellraum.html', (html.length / 1e6).toFixed(2), 'MB; Programm', (js.length / 1e3).toFixed(0), 'kB');
