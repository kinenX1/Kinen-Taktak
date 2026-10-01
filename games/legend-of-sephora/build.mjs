// Builds a standalone copy of the game for normal web hosting (Render, GitHub Pages, any static host).
// index.html is written for claude.ai artifacts, which add the <html>/<head> wrapper themselves,
// so this script adds that wrapper and copies the scripts into dist/.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
const page = readFileSync(join(here, 'index.html'), 'utf8');

const split = page.indexOf('<div id="app">');
if (split < 0) throw new Error('index.html: could not find <div id="app">');
const head = page.slice(0, split).trim();
const body = page.slice(split).trim();

const icon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>`
  + `<rect width='16' height='16' rx='3' fill='%231c6780'/><path fill='%23ffc83a' d='M3 6l3-3h4l3 3-5 8z'/>`
  + `<path fill='%23fff0a6' d='M6 4h2v2H5z'/><path fill='%23b97a0c' d='M8 6h5l-5 8z'/></svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="The Legend of Sephora: build your island, command your crew, and fight off pirates and tornadoes.">
<meta name="theme-color" content="#1c6780">
<meta property="og:title" content="The Legend of Sephora">
<meta property="og:description" content="A pixel-art island builder. Hire workers, farm wheat, build anything and survive the raids.">
<link rel="icon" href="data:image/svg+xml,${icon}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
cpSync(join(here, 'js'), join(out, 'js'), { recursive: true });
console.log('Built ' + join(out, 'index.html'));
