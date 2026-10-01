'use strict';
/* Draws the world into a small low-res buffer, then scales it up crisp. */
function nightAmount(t) {
  if (t < 0.62) return 0;
  if (t < 0.72) return (t - 0.62) / 0.1;
  if (t < 0.93) return 1;
  return 1 - (t - 0.93) / 0.07;
}
const RING = (() => { const pts = []; for (let a = 0; a < Math.PI * 2; a += 0.18) { const p = [Math.round(Math.cos(a) * 7), Math.round(Math.sin(a) * 3)]; if (!pts.some(q => q[0] === p[0] && q[1] === p[1])) pts.push(p); } return pts; })();

const Render = {
  view: null, vctx: null, buf: null, bctx: null, scale: 3, dpr: 1, W: 0, H: 0, zoomAdj: 0,
  cam: { x: 0, y: 0 }, vx: 0, vy: 0, t: 0, last: 0, snap: true,
  init(canvas) {
    this.view = canvas; this.vctx = canvas.getContext('2d');
    const b = mkCanvas(10, 10); this.buf = b.c; this.bctx = b.x;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = this.view.clientWidth || window.innerWidth, ch = this.view.clientHeight || window.innerHeight;
    const pw = Math.max(1, Math.round(cw * dpr)), ph = Math.max(1, Math.round(ch * dpr));
    this.dpr = dpr;
    this.view.width = pw; this.view.height = ph;
    const target = clamp(cw / 2.3, 240, 700);
    this.scale = clamp(Math.round(pw / target) + this.zoomAdj, 1, 16);
    this.W = Math.ceil(pw / this.scale); this.H = Math.ceil(ph / this.scale);
    this.buf.width = this.W; this.buf.height = this.H;
    this.bctx.imageSmoothingEnabled = false;
    this.vctx.imageSmoothingEnabled = false;
  },
  zoom(d) {
    const before = this.scale;
    this.zoomAdj += d; this.resize();
    if (this.scale === before) this.zoomAdj -= d;
  },
  worldToBuf(x, y, z = 0) { return [Math.round((x - y) * HW - this.vx), Math.round((x + y) * HH - z - this.vy)]; },
  clientToBuf(cx, cy) { const r = this.view.getBoundingClientRect(); return [(cx - r.left) * this.dpr / this.scale, (cy - r.top) * this.dpr / this.scale]; },
  clientToWorld(cx, cy) {
    const [bx, by] = this.clientToBuf(cx, cy), X = bx + this.vx, Y = by + this.vy;
    return { x: (Y / HH + X / HW) / 2, y: (Y / HH - X / HW) / 2 };
  },
  bufToClient(bx, by) { return [bx * this.scale / this.dpr, by * this.scale / this.dpr]; },

  pickCrew(cx, cy) {
    if (!S) return null;
    const [bx, by] = this.clientToBuf(cx, cy);
    let best = null, bd = -1e9;
    for (const e of allCrew()) {
      if (e.hidden) continue;
      const [sx, sy] = this.worldToBuf(e.x, e.y);
      if (Math.abs(bx - sx) <= 8 && by >= sy - 23 && by <= sy + 3 && e.x + e.y > bd) { bd = e.x + e.y; best = e; }
    }
    return best;
  },
  pickBuilding(cx, cy) {
    if (!S) return null;
    const [bx, by] = this.clientToBuf(cx, cy), w = this.clientToWorld(cx, cy);
    const list = S.buildings.slice().sort((A, B) => (B.x + B.y + (B.w + B.h) / 2) - (A.x + A.y + (A.w + A.h) / 2));
    for (const b of list) {
      if (w.x >= b.x && w.x < b.x + b.w && w.y >= b.y && w.y < b.y + b.h) return b;
      if (b.type === 'farm' || b.type === 'tree') continue;
      const spr = Art.building(b), [sx, sy] = this.worldToBuf(b.x, b.y);
      const lx = Math.floor(bx - (sx - spr.X0)), ly = Math.floor(by - (sy - spr.Y0));
      if (lx < 0 || ly < 0 || lx >= spr.c.width || ly >= spr.c.height) continue;
      if (spr.c.getContext('2d').getImageData(lx, ly, 1, 1).data[3] > 200) return b;
    }
    return null;
  },

  draw(now) {
    const t = now / 1000, dt = Math.min(0.1, t - (this.last || t));
    this.last = t; this.t = t;
    const b = this.bctx, W = this.W, H = this.H;
    if (!RT.world || !RT.isle) { b.fillStyle = PAL.water.base; b.fillRect(0, 0, W, H); return this.present(); }
    let tx, ty;
    if (RT.running && S && RT.placement) { const p = RT.placement, x = p.i + p.def.w / 2, y = p.j + p.def.h / 2; tx = (x - y) * HW; ty = (x + y) * HH - 10; }
    else if (RT.running && S) { const P = S.player; tx = (P.x - P.y) * HW; ty = (P.x + P.y) * HH - 12; }
    else { const c = RT.world.centroid, a = t * 0.07, x = c.x + Math.cos(a) * 3.5, y = c.y + Math.sin(a) * 3.5; tx = (x - y) * HW; ty = (x + y) * HH + 10; }
    if (this.snap) { this.cam.x = tx; this.cam.y = ty; this.snap = false; }
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.vx = Math.round(this.cam.x - W / 2); this.vy = Math.round(this.cam.y - H / 2);

    // sea
    const wf = Art.water[Math.floor(t * 1.5) % Art.water.length], drift = Math.floor(t * 2);
    const x0 = -mod(this.vx + drift, 128), y0 = -mod(this.vy, 64);
    for (let y = y0; y < H; y += 64) for (let x = x0; x < W; x += 128) b.drawImage(wf, x, y);
    for (let i = 0; i < 14; i++) {
      const lx = mod(hash2(i, 1, 5) * 44 + t * 0.12 * (0.6 + hash2(i, 2, 5)), 44) - 7, ly = hash2(i, 3, 5) * 44 - 7;
      const [sx, sy] = this.worldToBuf(lx, ly, -CH);
      b.fillStyle = ['#ea7a2a', '#ffb24a', '#c4481e'][i % 3]; b.fillRect(sx, sy, 2, 1); b.fillRect(sx + 1, sy - 1, 1, 1);
    }
    // the merchant boat sails in water that is in front of the island only near the pier; draw it with the objects
    const isle = RT.isle;
    b.drawImage(isle.canvas, -this.vx - isle.ox, -this.vy - isle.oy);
    b.globalAlpha = 0.9; b.drawImage(isle.foam[Math.floor(t * 1.8) % 2], -this.vx - isle.ox, -this.vy - isle.oy); b.globalAlpha = 1;
    if (!S) return this.present();

    // placement ghost tiles
    const pl = RT.placement;
    if (pl) {
      b.fillStyle = pl.ok ? 'rgba(120,255,120,0.35)' : 'rgba(255,80,70,0.4)';
      for (let j = pl.j; j < pl.j + pl.def.h; j++) for (let i = pl.i; i < pl.i + pl.def.w; i++) {
        const [sx, sy] = this.worldToBuf(i, j);
        b.beginPath(); b.moveTo(sx, sy); b.lineTo(sx + 16, sy + 8); b.lineTo(sx, sy + 16); b.lineTo(sx - 16, sy + 8); b.closePath(); b.fill();
      }
    }

    const items = [];
    for (const bd of S.buildings) items.push([bd.x + bd.y + (bd.w + bd.h) / 2, () => this.drawBuilding(bd)]);
    for (const tr of S.trees) items.push([tr.x + tr.y + 1, () => this.drawTree(tr)]);
    for (const g of S.graves) items.push([g.x + g.y, () => { const [sx, sy] = this.worldToBuf(g.x, g.y); b.drawImage(Art.grave, sx - 7, sy - 14); }]);
    for (const w of S.workers) if (!w.hidden) items.push([w.x + w.y, () => this.drawChar(w)]);
    for (const f of S.fighters) items.push([f.x + f.y, () => this.drawChar(f)]);
    for (const p of RT.pirates) items.push([p.x + p.y, () => this.drawChar(p)]);
    if (RT.deadT <= 0) items.push([S.player.x + S.player.y, () => this.drawChar(S.player, true)]);
    const M = S.merchant, Wd = RT.world;
    if (M.state !== 'away') {
      const e = smooth(clamp(M.p, 0, 1)), x = lerp(Wd.boatFar.x, Wd.dock.x, e), y = lerp(Wd.boatFar.y, Wd.dock.y, e);
      items.push([x + y, () => this.drawBoat(Art.boatM, x, y, Wd.boatFar.x - Wd.dock.x, Wd.boatFar.y - Wd.dock.y, M.state)]);
    }
    for (const ship of [RT.raid && RT.raid.ship, RT.leavingShip]) {
      if (!ship) continue;
      items.push([ship.x + ship.y, () => this.drawBoat(Art.boatP, ship.x, ship.y, ship.fx - ship.sx, ship.fy - ship.sy, ship.state === 'leaving' ? 'leaving' : ship.p < 1 ? 'arriving' : 'docked')]);
    }
    if (RT.raid && RT.raid.tornado) { const T = RT.raid.tornado; items.push([T.x + T.y + 0.5, () => this.drawTornado(T)]); }
    for (const p of RT.projectiles) items.push([p.x + p.y, () => this.drawArrow(p)]);
    items.sort((A, B) => A[0] - B[0]);
    for (const it of items) it[1]();

    if (pl) {
      const spr = pl.type === 'farm' ? null : pl.type === 'tree' ? Art.tree('green', 1) : Art.building({ type: pl.type, custom: pl.custom, variant: 0 });
      b.globalAlpha = 0.6;
      if (pl.type === 'farm') this.drawFarm({ x: pl.i, y: pl.j, crops: Array(9).fill({ stage: 3 }), progress: 1 });
      else if (pl.type === 'tree') { const [sx, sy] = this.worldToBuf(pl.i + 0.5, pl.j + 0.5); b.drawImage(spr.c, sx - spr.ax, sy + 2 - spr.ay); }
      else { const [sx, sy] = this.worldToBuf(pl.i, pl.j); b.drawImage(spr.c, sx - spr.X0, sy - spr.Y0); }
      b.globalAlpha = 1;
    }

    // particles and floating numbers
    for (const p of RT.particles) {
      const [sx, sy] = this.worldToBuf(p.x, p.y, p.z);
      const a = 1 - p.t / p.life;
      b.globalAlpha = p.smoke ? a * 0.8 : Math.min(1, a * 2);
      b.fillStyle = p.col; const s = p.size || 1; b.fillRect(sx, sy, s, s);
    }
    b.globalAlpha = 1;
    for (const f of RT.floaters) {
      const [sx, sy] = this.worldToBuf(f.x, f.y, f.z);
      b.globalAlpha = Math.min(1, (1.1 - f.t) * 3);
      drawPText(b, f.text, sx - (pTextWidth(f.text) >> 1), sy, f.col, PAL.ink);
    }
    b.globalAlpha = 1;

    // night
    const n = nightAmount(S.dayT);
    if (n > 0) {
      if (S.dayT < 0.72 || S.dayT > 0.93) { b.fillStyle = `rgba(255,120,50,${0.1 * Math.sin(n * Math.PI)})`; b.fillRect(0, 0, W, H); }
      b.fillStyle = `rgba(14,22,70,${0.52 * n})`; b.fillRect(0, 0, W, H);
      b.globalAlpha = n;
      for (const bd of S.buildings) {
        if (bd.progress < 1 || bd.ruined || bd.type === 'farm' || bd.type === 'tree') continue;
        const spr = Art.building(bd), [sx, sy] = this.worldToBuf(bd.x, bd.y), dx = sx - spr.X0, dy = sy - spr.Y0;
        b.fillStyle = '#ffd36b';
        for (const [lx, ly] of spr.lights) b.fillRect(dx + lx, dy + ly, 1, 1);
        if (spr.lamp) {
          const [lx, ly] = spr.lamp, g = b.createRadialGradient(dx + lx, dy + ly, 1, dx + lx, dy + ly, 40);
          g.addColorStop(0, 'rgba(255,220,120,0.55)'); g.addColorStop(1, 'rgba(255,220,120,0)');
          b.fillStyle = g; b.fillRect(dx + lx - 40, dy + ly - 40, 80, 80);
        }
      }
      b.globalAlpha = 1;
    }
    this.present();
  },
  present() {
    const v = this.vctx;
    v.imageSmoothingEnabled = false;
    v.drawImage(this.buf, 0, 0, this.W * this.scale, this.H * this.scale);
  },

  drawBuilding(bd) {
    const b = this.bctx;
    if (bd.type === 'farm') return this.drawFarm(bd);
    const [sx, sy] = this.worldToBuf(bd.x, bd.y);
    if (bd.type === 'tree') {
      const tr = Art.tree('green', 3), s = 0.25 + bd.progress * 0.25, [cx, cy] = this.worldToBuf(bd.x + 0.5, bd.y + 0.5);
      b.drawImage(tr.c, Math.round(cx - tr.ax * s), Math.round(cy + 2 - tr.ay * s), Math.round(tr.c.width * s), Math.round(tr.c.height * s));
      return;
    }
    const spr = bd.ruined ? Art.ruined(bd) : Art.building(bd), dx = sx - spr.X0, dy = sy - spr.Y0, c = spr.c;
    if (bd.progress < 1) {
      const vis = Math.max(6, Math.round(c.height * (0.12 + 0.88 * bd.progress))), cut = c.height - vis;
      b.drawImage(c, 0, cut, c.width, vis, dx, dy + cut, c.width, vis);
      b.fillStyle = '#8f6034';
      const top = dy + cut - 3;
      for (const [a, bb] of [[0, 0], [bd.w, 0], [bd.w, bd.h], [0, bd.h]]) {
        const [px, py] = this.worldToBuf(bd.x + a, bd.y + bb);
        const h = Math.max(4, py - top); b.fillRect(px - (a ? 1 : 0), py - h, 1, h);
      }
      const [lx, ly] = this.worldToBuf(bd.x, bd.y + bd.h), [rx, ry] = this.worldToBuf(bd.x + bd.w, bd.y);
      b.fillRect(lx, Math.max(top, ly - 14), rx - lx, 1);
      this.bar(sx + (bd.w - bd.h) * 8, Math.min(top, sy) - 6, 20, bd.progress, '#ffd23f');
      return;
    }
    b.drawImage(c, dx, dy);
    if (bd.type === 'windmill' && !bd.ruined) {
      const [hx, hy] = spr.hub, cx = dx + hx, cy = dy + hy, a0 = this.t * 1.6;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 2, ex = Math.cos(a), ey = Math.sin(a);
        for (let r = 2; r <= 19; r++) {
          const px = Math.round(cx + ex * r), py = Math.round(cy + ey * r);
          b.fillStyle = '#4f321b'; b.fillRect(px, py, 1, 1);
          if (r > 6) { const ox = Math.round(-ey * 2), oy = Math.round(ex * 2); b.fillStyle = r % 3 ? '#efe6d2' : '#cfc4ad'; b.fillRect(px + ox, py + oy, 1, 1); b.fillRect(Math.round(cx + ex * r - ey), Math.round(cy + ey * r + ex), 1, 1); }
        }
      }
      b.fillStyle = '#311e10'; b.fillRect(cx - 1, cy - 1, 3, 3);
    }
    if (bd.hitT > 0 && bd.hp < bd.maxHp) { bd.hitT -= 1 / 60; this.bar(sx + (bd.w - bd.h) * 8, dy + 4, 20, bd.hp / bd.maxHp, '#e2343f'); }
    if (bd.ruined) { const [cx, cy] = this.worldToBuf(bd.x + bd.w / 2, bd.y + bd.h / 2); drawPText(b, '!', cx - 1, cy - 30 + Math.round(Math.sin(this.t * 4)), '#ff5a4a', PAL.ink); }
    // sleeping workers show Zzz over their bed
    if (S.workers.some(w => w.hidden && w.cur && w.cur.type === 'sleep' && w.cur.bed === bd.id)) {
      const [cx, cy] = this.worldToBuf(bd.x + bd.w / 2, bd.y + bd.h / 2), ph = (this.t * 0.8) % 1;
      b.globalAlpha = 1 - ph; drawPText(b, 'z', cx + 6 + Math.round(ph * 6), cy - 40 - Math.round(ph * 12), '#e8eeff', PAL.ink); b.globalAlpha = 1;
    }
  },
  drawFarm(f) {
    const b = this.bctx, F = Art.farm, [sx, sy] = this.worldToBuf(f.x, f.y);
    const dx = sx - F.soil.X0, dy = sy - F.soil.Y0;
    b.drawImage(F.back.c, dx, dy);
    b.drawImage(F.soil.c, dx, dy);
    if (f.progress >= 1) {
      for (let s = 0; s <= 4; s++) for (let j = 0; j < 3; j++) { const i = s - j; if (i < 0 || i > 2) continue; const c = f.crops[j * 3 + i]; const [cx, cy] = this.worldToBuf(f.x + i, f.y + j); b.drawImage(Art.crops[f.ruined ? 0 : c.stage], cx - 16, cy - 10); }
    }
    b.drawImage(F.front.c, dx, dy);
    if (f.progress < 1) this.bar(sx, sy - 4, 20, f.progress, '#ffd23f');
    if (f.hitT > 0 && f.hp < f.maxHp) { f.hitT -= 1 / 60; this.bar(sx, sy - 4, 20, f.hp / f.maxHp, '#e2343f'); }
  },
  drawTree(tr) {
    const b = this.bctx, [sx, sy] = this.worldToBuf(tr.x + 0.5, tr.y + 0.5);
    if (tr.stump) { b.drawImage(Art.stump.c, sx - Art.stump.ax, sy + 2 - Art.stump.ay); return; }
    const t = Art.tree(tr.kind, tr.seed), g = tr.grow;
    const sway = Math.round(Math.sin(this.t * 1.3 + tr.x) * 0.6);
    if (g >= 1) { b.drawImage(t.c, sx - t.ax + sway * 0, sy + 2 - t.ay); return; }
    const s = 0.35 + 0.65 * g;
    b.drawImage(t.c, Math.round(sx - t.ax * s), Math.round(sy + 2 - t.ay * s), Math.round(t.c.width * s), Math.round(t.c.height * s));
  },
  bar(cx, y, w, v, col) {
    const b = this.bctx, x = Math.round(cx - w / 2);
    b.fillStyle = PAL.ink; b.fillRect(x - 1, y - 1, w + 2, 4);
    b.fillStyle = '#3a2a2a'; b.fillRect(x, y, w, 2);
    b.fillStyle = col; b.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), 2);
  },
  drawChar(e, isPlayer) {
    const b = this.bctx, [sx, sy] = this.worldToBuf(e.x, e.y);
    b.fillStyle = 'rgba(10,25,10,0.32)'; b.fillRect(sx - 4, sy - 1, 9, 2); b.fillRect(sx - 3, sy + 1, 7, 1);
    if (RT.selected && RT.selected === e.id) { b.fillStyle = (Math.floor(this.t * 4) % 2) ? '#ffe27a' : '#ffc83a'; for (const [ox, oy] of RING) b.fillRect(sx + ox, sy + oy, 1, 1); }
    const look = isPlayer ? S.look : e.look;
    let frame = e.moving ? Math.floor((e.anim || 0) * 9) % 4 : 0, hop = 0, flip = e.flip;
    if (e.emote) {
      const et = e.emoteT || 0;
      if (e.emote === 'dance') { flip = Math.floor(et * 4) % 2 === 0; hop = Math.abs(Math.sin(et * 8)) * 3; frame = Math.floor(et * 8) % 4; }
      else if (e.emote === 'jump') hop = Math.abs(Math.sin(et * 5)) * 7;
      else hop = Math.floor(et * 6) % 2;
    }
    if (e.moving && frame % 2 === 1) hop += 1;
    const spr = Art.char(look, !!e.back, frame), oy = Math.round(sy - 20 - hop);
    let tool = null, angle = 0.55;
    if (isPlayer) { const wp = S.weapons[S.equipped]; tool = Art.weapon(wp.type, wp.tier); }
    else if (e.kind === 'pirate') tool = Art.weapon('cutlass', 2);
    else if (e.kind === 'fighter') tool = Art.weapon('spear', 2);
    else if (e.working && e.cur && e.cur.phase === 'work') { tool = Art.weapon(e.working, e.working === 'axe' ? 2 : 1); angle = Math.sin(this.t * 13) * 0.9 + 0.1; }
    if (e.swing > 0) { const q = 1 - e.swing / 0.25; angle = -1.3 + q * 2.9; }
    const hx = sx + (flip ? -4 : 4), hy = oy + 15;
    const drawTool = () => { if (!tool) return; b.save(); b.translate(hx, hy); b.scale(flip ? -1 : 1, 1); b.rotate(angle); b.drawImage(tool, -4, -12); b.restore(); };
    if (e.back) drawTool();
    if (e.flash > 0 && Math.floor(this.t * 30) % 2) b.globalAlpha = 0.45;
    if (flip) { b.save(); b.translate(sx, 0); b.scale(-1, 1); b.drawImage(spr, -8, oy); b.restore(); } else b.drawImage(spr, sx - 8, oy);
    b.globalAlpha = 1;
    if (!e.back) drawTool();
    if (e.swing > 0 && (isPlayer || e.kind === 'fighter')) {
      b.fillStyle = 'rgba(255,255,255,0.85)';
      const q = 1 - e.swing / 0.25, dir = flip ? -1 : 1;
      for (let a = -1.2; a < -1.2 + q * 2.4; a += 0.18) b.fillRect(Math.round(sx + dir * Math.cos(a) * 11), Math.round(oy + 12 + Math.sin(a) * 8), 1, 1);
    }
    if (e.carry > 0) b.drawImage(Art.sheaf, sx - 4 + (flip ? 3 : -3), oy - 7);
    const top = oy - (e.carry > 0 ? 10 : 3);
    if (e.kind === 'pirate' || ((e.kind === 'fighter' || isPlayer) && e.hp < e.maxHp) || (e.kind === 'worker' && e.hp < 100)) {
      this.bar(sx, top - 2, 14, e.hp / (e.maxHp || 100), e.kind === 'pirate' ? '#e2343f' : '#6fd23c');
    }
    if (e.kind === 'worker') {
      const blink = Math.floor(this.t * 2) % 2;
      if (e.hunger < 25 && blink) { b.fillStyle = PAL.ink; b.fillRect(sx - 9, top - 7, 6, 4); b.fillStyle = '#cf8436'; b.fillRect(sx - 8, top - 6, 4, 2); b.fillStyle = '#eab25c'; b.fillRect(sx - 8, top - 6, 4, 1); }
      if (e.energy < 25 && !blink) drawPText(b, 'z', sx + 4, top - 8, '#e8eeff', PAL.ink);
    }
    if (e.thinking) {
      const k = Math.floor(this.t * 4) % 4;
      for (let d = 0; d < 3; d++) { b.fillStyle = PAL.ink; b.fillRect(sx - 5 + d * 4, top - 7, 3, 3); b.fillStyle = d < k ? '#ffffff' : '#9aa3ad'; b.fillRect(sx - 4 + d * 4, top - 6, 1, 1); }
    }
  },
  drawBoat(boat, x, y, fdx, fdy, state) {
    const b = this.bctx, [sx, sy] = this.worldToBuf(x, y, -CH);
    const awayScreen = fdx - fdy, faceRight = state === 'leaving' ? awayScreen > 0 : awayScreen < 0;
    const bob = Math.round(Math.sin(this.t * 2.2 + x) * 1);
    if (state !== 'docked') {
      b.fillStyle = 'rgba(240,255,250,0.7)';
      for (let k = 0; k < 6; k++) b.fillRect(sx + (faceRight ? -1 : 1) * (12 + k * 3), sy + 2 + (k % 2), 2, 1);
    }
    b.fillStyle = 'rgba(8,40,52,0.35)'; b.fillRect(sx - boat.ax + 4, sy + 1, boat.c.width - 8, 2);
    if (!faceRight) { b.save(); b.translate(sx, 0); b.scale(-1, 1); b.drawImage(boat.c, -boat.ax, sy - boat.ay + bob); b.restore(); }
    else b.drawImage(boat.c, sx - boat.ax, sy - boat.ay + bob);
  },
  drawTornado(T) {
    const b = this.bctx, [sx, sy] = this.worldToBuf(T.x, T.y), t = this.t;
    b.fillStyle = 'rgba(30,30,40,0.35)'; b.beginPath(); b.ellipse(sx, sy, 14, 5, 0, 0, Math.PI * 2); b.fill();
    for (let k = 0; k < 18; k++) {
      const cy = sy - k * 4, r = 2.5 + k * 1.45, ox = Math.sin(t * 4 + k * 0.45) * k * 0.5;
      b.globalAlpha = 0.55; b.fillStyle = k % 2 ? '#8d98a4' : '#a7b1bb';
      b.beginPath(); b.ellipse(Math.round(sx + ox), cy, r, Math.max(1.5, r * 0.32), 0, 0, Math.PI * 2); b.fill();
      for (let a = 0; a < Math.PI * 2; a += 0.7 / r) {
        const ang = a + t * 10 + k, front = Math.sin(ang) > 0;
        const px = Math.round(sx + ox + Math.cos(ang) * r), py = Math.round(cy + Math.sin(ang) * r * 0.32);
        b.globalAlpha = front ? 1 : 0.7;
        b.fillStyle = T.flash > 0 ? '#ffffff' : front ? ((Math.floor(ang * 3) % 2) ? '#f2f5f7' : '#c9d1d8') : '#6b7682';
        b.fillRect(px, py, front ? 2 : 1, 1);
      }
    }
    b.globalAlpha = 1;
    for (let k = 0; k < 10; k++) {
      const a = t * 6 + k * 0.63, h = (k * 7 + t * 20) % 60, r = 4 + h * 0.3;
      b.fillStyle = ['#6e4826', '#58a544', '#8a633d'][k % 3];
      b.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy - h + Math.sin(a) * r * 0.3), 2, 2);
    }
    this.bar(sx, sy - 80, 26, T.hp / T.maxHp, '#b8c2cc');
  },
  drawArrow(p) {
    const b = this.bctx, [sx, sy] = this.worldToBuf(p.x, p.y, p.z);
    const dx = p.vx - p.vy, dy = (p.vx + p.vy) / 2, l = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 5; k++) { b.fillStyle = k === 0 ? '#ffffff' : k === 4 ? '#e2343f' : '#8f6034'; b.fillRect(Math.round(sx - dx / l * k), Math.round(sy - dy / l * k), 1, 1); }
  },
};
