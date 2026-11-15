// Dev helper: screenshots the running preview build. usage: node tests/shot.mjs "<query>" name [waitMs] [evalJs]
const { chromium } = require('playwright');
(async () => {
const [query = '', name = 'shot', wait = '2500', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto((process.env.BASE || 'http://localhost:4173/') + query);
await page.waitForTimeout(Number(wait));
if (js) console.log('eval:', JSON.stringify(await page.evaluate(js)));
await page.screenshot({ path: `tests/shots/${name}.png` });
console.log('frames', await page.evaluate('window.frames'), 'errors', errors.slice(0, 6));
await browser.close();
})();
