// Bundles the production build into one self-contained HTML fragment (JS and CSS inlined) for single-file hosting.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const assets = readdirSync('dist/assets');
const js = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8');
const html = `<title>Ultimate Football Simulator</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>:root{color-scheme:dark}
${css}</style>
<canvas id="game"></canvas>
<div id="hud"></div>
<div id="ui"></div>
<script type="module">${js}</script>
`;
mkdirSync('single', { recursive: true });
writeFileSync('single/ultimate-football-simulator.html', html);
console.log('single/ultimate-football-simulator.html', (html.length / 1024).toFixed(0) + ' KB');
