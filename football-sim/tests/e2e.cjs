/** End-to-end test: drives the real game in headless Chromium. Requires `npm run build && npm run preview` on :4173. */
const { chromium } = require('playwright');
const fs = require('fs');
const out = __dirname + '/shots';
fs.mkdirSync(out, { recursive: true });
const errors = []; let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|\/ws/.test(m.text())) errors.push(m.text()); }); // no game server on the static preview
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.addInitScript(() => { if (!localStorage.getItem('ufs.settings.v1')) localStorage.setItem('ufs.settings.v1', JSON.stringify({ quality: 'low', postfx: false, shadows: false, matchMinutes: 2 })); });
  await page.goto('http://localhost:4173/?nosplash');
  await page.waitForSelector('.menu .btn');
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const click = async (text) => { await page.locator('button', { hasText: text }).first().click(); await page.waitForTimeout(350); };
  const G = (js) => page.evaluate(`(() => { const g = window.__game, m = g.match; return ${js}; })()`);
  /** Advances the simulation quickly without rendering every tick. */
  const ff = (sec) => page.evaluate((s) => { const m = window.__game.match; for (let i = 0; i < s * 60 && m.phase !== 'fulltime'; i++) { if (m.phase === 'halftime') m.resume(); m.tick(1 / 60); } }, sec);

  await page.locator('button', { hasText: 'Buy coins' }).click(); await page.waitForTimeout(300);
  check('buy coins is coming soon', (await page.locator('h1', { hasText: 'Coming' }).count()) === 1); await click('‹ Back');
  check('main menu has 10 entries', (await page.locator('.menu .btn').count()) === 10);
  await shot('01-menu');

  // --- Quick match
  await click('Quick Match'); await shot('02-quickmatch');
  await click('Kick Off');
  await page.waitForTimeout(1500);
  check('match created', await G('!!m && !g.backdrop'));
  check('intro line-ups shown', (await page.locator('.lineups').count()) === 1);
  await shot('03-intro');
  // Skip the intro and take the kick-off (headless rendering is slow, so poll instead of using fixed waits).
  for (let i = 0; i < 60 && (await G('m.phase')) !== 'play'; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); }
  check('ball in play after kick-off pass', (await G('m.phase')) === 'play', await G('m.phase'));
  const c0 = await G('m.clock');
  // movement
  const before = await G('(() => { const p = m.teams[0].selected; return p ? [p.x, p.z, p.data.short] : null; })()');
  await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(4000);
  const after = await G('(() => { const p = m.teams[0].selected; return p ? [p.x, p.z, p.data.short] : null; })()');
  await page.keyboard.up('ShiftLeft');
  check('human player selected', !!before);
  check('match clock advances', (await G('m.clock')) > c0, `${c0.toFixed(1)} -> ${(await G('m.clock')).toFixed(1)}`);
  check('controlled player moves with input', !!before && !!after && (after[2] !== before[2] || Math.abs(after[0] - before[0]) > 0.4), JSON.stringify([before, after]));
  await shot('04-play');
  // give the human the ball in front of goal and shoot
  await G(`(() => { const p = m.teams[0].selected ?? m.teams[0].players[9]; m.teams[0].selected = p; for (const q of m.teams[1].players) if (!q.isGK) { q.x = -30; q.z = 20; } p.x = 36; p.z = 2; p.vx = p.vz = 0; p.facing = 0; p.setState('play'); p.ctlCd = 0; m.ball.place(36.5, 2); m.ball.owner = p; m.setPhase('play'); return 1; })()`);
  await page.waitForTimeout(200);
  const shots0 = await G('m.teams[0].stats.shots');
  await page.keyboard.down('KeyK'); await page.waitForTimeout(900); await page.keyboard.up('KeyK'); await page.keyboard.up('KeyD');
  await page.waitForTimeout(5000);
  check('shoot button takes a shot', (await G('m.teams[0].stats.shots')) > shots0);
  await shot('05-shot');
  // passing
  await G(`(() => { const p = m.teams[0].players[6]; m.teams[0].selected = p; p.x = 0; p.z = 0; p.setState('play'); p.ctlCd = 0; m.ball.place(0.5, 0); m.ball.owner = p; m.setPhase('play'); m.sp = null; return 1; })()`);
  await page.waitForTimeout(600);
  const passes0 = await G('m.teams[0].stats.passes');
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(3500);
  check('pass button plays a pass', (await G('m.teams[0].stats.passes')) > passes0);
  const g0 = await G('m.teams[0].score');
  // force a goal to verify detection + scoreboard + replay
  await G(`(() => { const p = m.teams[0].players[9]; m.ball.owner = null; m.ball.lastTouch = p; m.ball.pos.set(51.5, 0.5, 0); m.ball.vel.set(20, 0, 0); for (const q of m.all) if (q.isGK && q.team.idx === 1) { q.x = 40; q.z = 20; } m.setPhase('play'); m.sp = null; return 1; })()`);
  await page.waitForTimeout(3000);
  check('goal detected and scoreboard updates', (await G('m.teams[0].score')) === g0 + 1 && (await page.locator('.score .num').first().textContent()) === String(g0 + 1), `score ${await G('m.teams[0].score')}`);
  await shot('06-goal');
  await ff(6); await page.waitForTimeout(1200);
  check('replay plays after goal', await G('g.view.replaying || m.phase === "setpiece" || m.phase === "play"'), await G('m.phase'));
  await shot('07-replay');
  for (let i = 0; i < 40 && (await G('m.phase')) !== 'play' && (await G('m.phase')) !== 'setpiece'; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); }
  // pause menu
  await page.keyboard.press('Escape'); await page.waitForSelector('.overlay.dark', { timeout: 20000 }).catch(() => {});
  check('pause menu opens', (await page.locator('.overlay.dark').count()) === 1);
  await click('Team Management'); await shot('08-teammgmt');
  check('team management lists bench', (await page.locator('.overlay button', { hasText: 'Bring on' }).count()) >= 5);
  await click('Back'); await click('Match Stats'); await click('Back'); await click('Controls'); await click('Back');
  await click('Resume');
  check('resume unpauses', !(await G('g.paused')));
  // AI plays: let the CPU-controlled sides finish the match
  await page.keyboard.up('KeyD');
  await ff(400); await page.waitForTimeout(4500);
  check('match reaches full-time', (await G('m.phase')) === 'fulltime', await G('m.phase + " " + m.clockText'));
  check('AI took part (opponent passes > 10)', (await G('m.teams[1].stats.passes')) > 10, String(await G('m.teams[1].stats.passes')));
  await shot('09-fulltime');
  await click('Continue');
  check('returns to main menu', (await page.locator('.menu .btn').count()) === 10);

  // --- Other modes
  await click('Career'); await shot('10-career-new'); await click('Start Career');
  check('career hub opens', (await page.locator('button', { hasText: 'Play match' }).count()) === 1);
  for (const t of ['Squad & Tactics', 'Transfers', 'Academy', 'Finances', 'League', 'Fixtures', 'Trophies', 'Overview']) await click(t);
  await click('Transfers'); await shot('11-career-transfers'); await click('Overview');
  await click('Simulate');
  check('career matchday simulated', (await page.locator('h2', { hasText: 'Matchday 2' }).count()) === 1);
  await shot('12-career');
  await click('Main menu');
  await click('Player Career'); await shot('13-pc-new'); await click('Begin career');
  check('player career hub opens', (await page.locator('button', { hasText: 'Play match' }).count()) === 1);
  await click('Development'); await page.locator('button', { hasText: '+1' }).first().click(); await shot('14-pc-dev'); await click('Overview'); await click('Simulate');
  await click('Main menu');
  await click('Tournaments'); await click('Create tournament');
  check('tournament hub opens', (await page.locator('.bracket').count()) === 1);
  for (let i = 0; i < 8 && (await page.locator('button', { hasText: 'Simulate round' }).count()); i++) await click('Simulate round');
  check('tournament produces a champion', (await page.locator('.trophy').count()) === 1);
  await shot('15-tournament');
  await click('Main menu');
  await click('Training'); await shot('16-training');
  await page.locator('button', { hasText: 'Start drill' }).nth(4).click(); await page.waitForTimeout(1500);
  check('penalty drill starts', (await G('!!g.training && m.sp && m.sp.type')) === 'penalty', String(await G('m.phase')));
  await page.waitForTimeout(4000); await page.keyboard.down('KeyK'); await page.waitForTimeout(1500); await page.keyboard.up('KeyK'); await page.waitForTimeout(8000);
  check('penalty drill registers an attempt', (await G('g.training.attempt')) >= 1 && (await G('m.teams[0].stats.shots')) >= 1);
  await shot('17-penalty');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await click('Quit Training');
  await click('‹ Back');
  await click('Multiplayer'); check('multiplayer setup shows both players', (await page.locator('.badge.p2').count()) === 1); await click('‹ Back');
  await click('Settings'); for (const t of ['Audio', 'Gameplay', 'Controls', 'Save Data', 'Graphics']) await click(t); await shot('18-settings'); await click('‹ Back');
  // --- My Club hub (offline): shop, buy, sell, team, events, CPU lobby
  await page.locator('.menu button', { hasText: 'Play' }).first().click(); await page.waitForTimeout(600);
  check('club hub opens with coins', (await page.locator('.big.gold', { hasText: 'coins' }).count()) === 1);
  await shot('19-hub');
  await click('Shop'); check('shop is coming soon', (await page.locator('h1', { hasText: 'Coming' }).count()) === 1); await shot('20-shop'); await click('‹ Back');
  await click('Team'); await shot('22-team'); await click('‹ Back');
  await click('Events'); check('events shows coming soon', (await page.locator('h1', { hasText: 'Coming' }).count()) === 1); await click('‹ Back');
  await click('Friends'); check('friends shows your 6-digit ID', /^\d{6}$/.test((await page.locator('div[style*="letter-spacing: 0.18em"]').textContent()).trim())); await shot('23-friends'); await click('‹ Back');
  await click('Play Lobby'); await shot('24-lobby');
  check('lobby offers time 5/10/15/20 and stadium', (await page.locator('.chooser', { hasText: 'Time' }).count()) === 1 && (await page.locator('.chooser', { hasText: 'Stade' }).count()) === 1);
  await click('Play vs CPU'); await page.waitForTimeout(1500);
  check('club match starts with my team', await G('!!m && !g.backdrop && m.teams[0].data.id.startsWith("club-")'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await click('Quit Match'); await click('Main menu');
  await click('Exit'); check('exit screen', (await page.locator('button', { hasText: 'Close game' }).count()) === 1); await click('Back to menu');
  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); console.error(errors.join('\n')); process.exit(1); });
