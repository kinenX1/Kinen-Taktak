/** Online test: two browser pages (host + guest) connect through server.js and play the same match. Needs `npm start` on :8080. */
const { chromium } = require('playwright');
let failed = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); if (!ok) failed++; };
(async () => {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ args }), browser2 = await chromium.launch({ args });
  const errors = [];
  const mk = async (br) => { const p = await br.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(120000); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.addInitScript(() => { if (!localStorage.getItem('ufs.settings.v1')) localStorage.setItem('ufs.settings.v1', JSON.stringify({ quality: 'low', postfx: false, shadows: false })); });
    await p.goto('http://localhost:8080/?nosplash'); await p.waitForSelector('.menu .btn'); return p; };
  const A = await mk(browser), B = await mk(browser2);
  const click = async (p, t) => { await p.locator('button', { hasText: t }).first().click(); await p.waitForTimeout(500); };
  const G = (p, js) => p.evaluate(`(() => { const g = window.__game, m = g.match; return ${js}; })()`);
  const H = (p, js) => p.evaluate(`(() => { const hub = window.__game.__hub; return ${js}; })()`);
  // both open the club hub and connect to the server
  await A.locator('.menu button', { hasText: 'Play' }).first().click(); await B.locator('.menu button', { hasText: 'Play' }).first().click();
  await A.waitForTimeout(2500);
  check('both players are online with 6-digit IDs', (await H(A, 'hub.online')) && (await H(B, 'hub.online')) && /^\d{6}$/.test(await H(A, 'hub.club.s.id')));
  // friends: B searches A's ID, sends a request, A accepts
  const idA = await H(A, 'hub.club.s.id');
  await click(B, 'Friends'); await B.locator('input[aria-label="Friend ID"]').fill(idA); await click(B, 'Search'); await B.waitForTimeout(1200);
  await click(B, 'Send friend request'); await A.waitForTimeout(1500);
  await click(A, 'Friends'); await A.screenshot({ path: 'tests/shots/o1-friends.png' });
  await click(A, 'Accept'); await A.waitForTimeout(1500);
  check('friend request accepted on both sides', (await H(A, 'hub.club.s.friends.length')) === 1 && (await H(B, 'hub.club.s.friends.length')) === 1 && (await H(B, 'hub.club.s.friends[0].online')) === true);
  // A hosts a lobby and invites B, who accepts the invite popup
  await click(A, '‹ Back'); await click(A, 'Play Lobby'); await A.waitForTimeout(1200);
  const code = await A.evaluate(() => window.__game.__hub.net.code);
  check('host gets a 4-letter lobby ID', /^[A-Z]{4}$/.test(code), code);
  await A.locator('.panel button', { hasText: 'Invite' }).first().click(); await B.waitForTimeout(1500);
  check('friend receives the lobby invite', (await B.locator('.modal', { hasText: 'invites you' }).count()) === 1);
  await click(B, 'Join lobby'); await B.waitForTimeout(1500); await A.waitForTimeout(1000);
  await A.screenshot({ path: 'tests/shots/o2-lobby.png' });
  check('host can start once the friend joined', await A.locator('button', { hasText: /^Match$/ }).isEnabled());
  await A.locator('button', { hasText: /^Match$/ }).click(); await A.waitForTimeout(2500); await B.waitForTimeout(500);
  check('both sides are in the match', (await G(A, '!!m && !g.backdrop')) && (await G(B, '!!m && !g.backdrop && m.remote')));
  // guest skips the intro and the host kicks off
  for (let i = 0; i < 300 && (await G(A, 'm.phase')) !== 'play'; i++) { await B.keyboard.press('KeyJ'); await A.keyboard.press('KeyJ'); await A.waitForTimeout(400); }
  check('host match is in play', (await G(A, 'm.phase')) === 'play', await G(A, 'm.phase'));
  await B.waitForTimeout(1500);
  check('guest mirrors the phase and clock', (await G(B, 'm.phase')) === (await G(A, 'm.phase')) && (await G(B, 'm.clock')) > 0, `${await G(B, 'm.phase')} ${await G(B, 'm.clock')}`);
  const d = await Promise.all([G(A, '[m.ball.pos.x, m.ball.pos.z]'), G(B, '[m.ball.pos.x, m.ball.pos.z]')]);
  check('guest ball position tracks the host', Math.hypot(d[0][0] - d[1][0], d[0][1] - d[1][1]) < 12, JSON.stringify(d));
  // guest input drives a player on the host
  const sel0 = await G(A, '(() => { const p = m.teams[1].selected; return p ? [p.uid, p.x] : null; })()');
  await B.keyboard.down('KeyA'); await B.waitForTimeout(9000);
  const rem = await G(A, 'g.input.remote');
  const sel1 = await G(A, '(() => { const p = m.teams[1].selected; return p ? [p.uid, p.x] : null; })()');
  await B.keyboard.up('KeyA');
  check('guest input reaches the host', !!rem && rem.x < -0.5, JSON.stringify(rem));
  check('guest-controlled player moves on the host', !!sel0 && !!sel1 && (sel0[0] !== sel1[0] || sel1[1] < sel0[1] - 0.5), JSON.stringify([sel0, sel1]));
  // a goal on the host shows on the guest scoreboard
  await G(A, `(() => { const p = m.teams[0].players[9]; m.ball.owner = null; m.ball.lastTouch = p; m.ball.pos.set(51.5, 0.5, 0); m.ball.vel.set(20, 0, 0); for (const q of m.all) if (q.isGK && q.team.idx === 1) { q.x = 40; q.z = 20; } m.sp = null; m.setPhase('play'); return 1; })()`);
  await A.waitForTimeout(3000); await B.waitForTimeout(1500);
  check('goal on host updates guest scoreboard', (await B.locator('.score .num').first().textContent()) === '1', await B.locator('.score .num').first().textContent());
  await A.screenshot({ path: 'tests/shots/o3-host.png' }); await B.screenshot({ path: 'tests/shots/o4-guest.png' });
  // disconnect handling
  await A.close(); await B.waitForTimeout(4000);
  check('guest returns to the hub when the host leaves', (await B.locator('h1', { hasText: 'Club' }).count()) === 1);
  check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await browser.close(); await browser2.close(); console.log(failed ? `\n${failed} check(s) failed` : '\nAll online checks passed'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
