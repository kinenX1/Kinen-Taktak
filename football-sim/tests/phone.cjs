// Phone check: emulates a landscape phone with touch and plays via the on-screen controls.
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(2500); await page.screenshot({ path: 'tests/shots/p0-splash.png' });
  await page.locator('.splash').tap(); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/shots/p1-menu.png' });
  await page.locator('button', { hasText: 'Play' }).first().tap(); await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/shots/p2-setup.png' });
  await page.locator('button', { hasText: 'Kick Off' }).tap(); await page.waitForTimeout(2000);
  const G = (js) => page.evaluate(`(() => { const g = window.__game, m = g.match; return ${js}; })()`);
  for (let i = 0; i < 60 && (await G('m.phase')) !== 'play'; i++) { await page.locator('.b-pass').tap(); await page.waitForTimeout(400); }
  console.log('phase', await G('m.phase'), 'touch visible', await page.locator('.touch').isVisible(), 'quality', await G('g.settings.quality'));
  await page.screenshot({ path: 'tests/shots/p3-play.png' });
  console.log('errors', errors.slice(0, 5));
  await browser.close();
})();
