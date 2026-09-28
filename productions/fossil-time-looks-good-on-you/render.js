// node render.js <format> <out.mp4> [fps] [from] [to] [stills]
// Needs: a static server on :8765 (or PORT) serving this folder, playwright, and FFMPEG pointing at an ffmpeg with libx264.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { spawn } = require('child_process');
const FF = process.env.FFMPEG;
(async () => {
  const [fk, out, fps = '24', from = '0', to = '20', stills] = process.argv.slice(2);
  const scale = +(process.env.SCALE || 1); // 2 → 4K masters (2160×3840, 2160×2160, 3840×2160)
  const size = { '916': [1080, 1920], '11': [1080, 1080], '169': [1920, 1080] }[fk];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size[0] * scale, height: size[1] * scale }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8765}/film.html?f=${fk}&s=${scale}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  if (stills) { // comma list of times → jpgs
    for (const t of stills.split(',')) { await page.evaluate(x => window.__seek(x), +t); await page.screenshot({ path: `${out}-${t}.jpg`, type: 'jpeg', quality: 88 }); }
    await browser.close(); return;
  }
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', fps, '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n0 = Math.round(+from * +fps), n1 = Math.round(+to * +fps);
  for (let i = n0; i < n1; i++) {
    await page.evaluate(x => window.__seek(x), i / +fps);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 48 === 0) process.stdout.write(`${fk} ${(i / +fps).toFixed(1)}s\n`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
})();
