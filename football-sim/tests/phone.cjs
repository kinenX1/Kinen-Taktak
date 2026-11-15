// Phone check: emulated landscape phone, plays with the on-screen buttons. Needs `npm run preview` on :4173.
const { chromium, devices } = require('playwright');
let failed = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); if (!ok) failed++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('ufs.settings.v1')) localStorage.setItem('ufs.settings.v1', JSON.stringify({ quality: 'low', postfx: false, shadows: false })); });
  await page.goto('http://localhost:4173/?nosplash'); await page.waitForSelector('.menu .btn');
  const G = (js) => page.evaluate(`(() => { const g = window.__game, m = g.match; return ${js}; })()`);
  await page.locator('button', { hasText: 'Quick Match' }).tap(); await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Kick Off' }).tap(); await page.waitForTimeout(2000);
  for (let i = 0; i < 80 && (await G('m.phase')) !== 'play'; i++) { await page.locator('.b-pass').tap(); await page.waitForTimeout(400); }
  check('match in play via touch', (await G('m.phase')) === 'play');
  check('exactly five action buttons', (await page.locator('.pad .tb').count()) === 5, (await page.locator('.pad .tb').allTextContents()).join(', '));
  // opponent has the ball far away: LOW PASS must switch player
  await G(`(() => { const o = m.teams[1].players[8]; o.x = 20; o.z = 10; o.setState('play'); m.ball.place(20.4, 10); m.ball.owner = o; m.teams[0].selected = m.teams[0].players[1]; m.sp = null; m.setPhase('play'); return 1; })()`);
  await page.waitForTimeout(500);
  const before = await G('m.teams[0].selected.uid');
  await page.locator('.b-pass').tap(); await page.waitForTimeout(1500);
  const after = await G('m.teams[0].selected.uid');
  check('LOW PASS switches player when the ball is not ours', before !== after, `${before} -> ${after}`);
  await page.screenshot({ path: 'tests/shots/p3-play.png' });
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close(); process.exit(failed ? 1 : 0);
})();
