// Dev helper: clicks through a list of button labels, then screenshots. usage: node tests/snap.cjs name "Label1|Label2"
const { chromium } = require('playwright');
(async () => {
  const [name, path = ''] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('ufs.settings.v1')) localStorage.setItem('ufs.settings.v1', JSON.stringify({ quality: 'low', postfx: false, shadows: false })); });
  await p.goto((process.env.BASE || 'http://localhost:4173/') + '?nosplash'); await p.waitForSelector('.menu .btn');
  for (const l of path.split('|').filter(Boolean)) { await p.locator('button', { hasText: l }).first().click(); await p.waitForTimeout(700); }
  await p.waitForTimeout(2500); await p.screenshot({ path: `tests/shots/${name}.png` }); console.log('errors', errs); await b.close();
})();
