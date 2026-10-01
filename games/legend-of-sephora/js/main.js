'use strict';
/* Boot: build art, start the loop, resume a hot-reloaded game or show the menu. */
(function boot() {
  Art.init();
  Render.init(document.getElementById('view'));
  UI.init();
  Brain.init();
  Save.initCloud();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (RT.running && !RT.paused && S) {
      try { Game.update(dt); } catch (e) { console.error(e); }
    }
    Render.draw(now);
    UI.frame(dt, now);
    requestAnimationFrame(loop);
  }
  const start = data => {
    if (data && typeof data.save === 'string') {
      try { Game.load(JSON.parse(data.save)); UI.enterGame(false); return; } catch (e) { /* fall back to the menu */ }
    }
    UI.showMenu();
  };
  try {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => (RT.running && S ? { save: Game.serialize() } : {}));
    if (hot && typeof hot.ready === 'function') hot.ready(start);
    else start((hot && hot.data) || {});
  } catch (e) { start({}); }
  requestAnimationFrame(loop);
})();
