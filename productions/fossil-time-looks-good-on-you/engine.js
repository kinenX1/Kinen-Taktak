/* FOSSIL — "Time Looks Good On You" · 20 s motion ad engine.
   Deterministic: render(t) draws the exact frame for time t (seconds), so the same code
   plays live and exports frame-accurate masters. Formats: 916 (1080×1920), 11 (1080×1080), 169 (1920×1080). */
(function () {
  'use strict';
  var CFG = window.FILM || {};
  var FORMATS = { '916': [1080, 1920], '11': [1080, 1080], '169': [1920, 1080] };
  var DUR = 20;
  var ASSET = CFG.assets || { plate: 'assets/plate.jpg', watch: 'assets/watch.png', marble: 'assets/marble.jpg' };
  var META = CFG.meta;

  // ---------- tokens (mirrors tokens.json)
  var C = { charcoal: '#1a1b1e', graphite: '#2b2d31', steel: '#c9ccd1', white: '#ffffff', sparkle: '#eef4ff', hairline: 'rgba(255,255,255,.6)' };

  // ---------- math
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function X(t) { return ((ax * t + bx) * t + cx) * t; }
    function Y(t) { return ((ay * t + by) * t + cy) * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var a = 0, b = 1, t = x;
      for (var i = 0; i < 40; i++) { if (X(t) < x) a = t; else b = t; t = (a + b) / 2; }
      return Y(t);
    };
  }
  var EO = bezier(0.16, 1, 0.3, 1); // --ease-out
  function clamp(v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v)); }
  function seg(t, a, b) { return clamp((t - a) / (b - a)); }
  function eo(t, a, b) { return EO(seg(t, a, b)); }
  function ss(t, a, b) { var x = seg(t, a, b); return x * x * (3 - 2 * x); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function inOut(t, a, b, c, d) { return Math.min(eo(t, a, b), 1 - ss(t, c, d)); }
  var RAD = Math.PI / 180;
  function track(keys) { // monotone cubic (no overshoot) over [[t, v], ...]
    var n = keys.length, T = [], V = [], d = [], m = [], i;
    for (i = 0; i < n; i++) { T.push(keys[i][0]); V.push(keys[i][1]); }
    for (i = 0; i < n - 1; i++) d[i] = (V[i + 1] - V[i]) / (T[i + 1] - T[i]);
    m[0] = 0; m[n - 1] = 0;
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
    }
    return function (t) {
      if (t <= T[0]) return V[0]; if (t >= T[n - 1]) return V[n - 1];
      var k = 0; while (t > T[k + 1]) k++;
      var h = T[k + 1] - T[k], u = (t - T[k]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * V[k] + (u3 - 2 * u2 + u) * h * m[k] + (-2 * u3 + 3 * u2) * V[k + 1] + (u3 - u2) * h * m[k + 1];
    };
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---------- state
  var W, H, U, FK, L, stage, cv, ctx, svg, ui, IMG = {}, SPR = {}, E = {}, K = {};

  // Per-format layout. Screen fractions unless noted; s* are dial scales (px per dial unit, ×U).
  var LAYOUTS = {
    '916': { s1: 2.8, s2: 2.45, sFull: 0.80, sPush: 0.98, c3: [0.5, 0.57], c2: [0.5, 0.52],
      rows: [0.135, 0.17, 0.205], dotX: 0.555, leader: 'vh', counterY: 0.16, counterMode: 'dials',
      z4: 2.05, hero: [820, 520, 1.25], head: [108, 0.105], pave: { lines: 'PAVÉ\nCRYSTAL\nLINKS', side: 'below' },
      wrist: [0.5, 0.42, 1.49], pill: [0.9, 0.80], end: { logo: 0.17, tag: 0.225, watch: [0.5, 0.555, 0.91], cta: 0.845 } },
    '11': { s1: 2.8, s2: 2.4, sFull: 0.62, sPush: 0.66, c3: [0.5, 0.64], c2: [0.5, 0.5],
      rows: [0.13, 0.18, 0.23], dotX: 0.56, leader: 'vh', counterY: 0.2, counterMode: 'dials',
      z4: 2.05, hero: [540, 650, 0.86], head: [108, 0.11], p4dx: 160, pave: { lines: 'PAVÉ\nCRYSTAL\nLINKS', side: 'stack' },
      wrist: [0.5, 0.44, 1.1], pill: [0.9, 0.845], end: { logo: 0.14, tag: 0.215, watch: [0.5, 0.565, 0.54], cta: 0.87 } },
    '169': { s1: 3.4, s2: 2.7, sFull: 0.66, sPush: 0.74, c3: [0.36, 0.5], c2: [0.5, 0.5],
      rows: null, dotX: 0.64, leader: 'h', counterY: 0.5, counterMode: 'column',
      z4: 2.0, hero: [560, 627, 0.861], head: [192, 0.18], pave: { lines: 'PAVÉ CRYSTAL LINKS', side: 'left' },
      wrist: [0.42, 0.5, 1.25], pill: [0.9, 0.80], end: { logo: 0.14, tag: 0.215, watch: [0.5, 0.565, 0.54], cta: 0.87 } }
  };

  // Dial geometry (units; dial radius 490)
  var SUB = { s9: [-232, -4], s3: [236, -2], s6: [0, 250] }, SUBR = 128;
  var DATE = [256, 256];
  var FEAT = { chrono: SUB.s3, date: DATE, caseEdge: [410, -410] };
  var P0 = [830, 640]; // watch pivot in photo pixels

  // ---------- setup
  function load(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
  function el(tag, cls, parent, ns) {
    var e = ns ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (cls) e.setAttribute('class', cls); (parent || ui).appendChild(e); return e;
  }

  function init(root, fk, scale) {
    var sc = scale > 0 ? scale : 1;
    FK = FORMATS[fk] ? fk : '916'; W = FORMATS[FK][0] * sc; H = FORMATS[FK][1] * sc; U = Math.min(W, H) / 1080; L = LAYOUTS[FK];
    stage = root; stage.innerHTML = ''; stage.style.width = W + 'px'; stage.style.height = H + 'px'; stage.style.setProperty('--sw', Math.max(1, U) + 'px');
    cv = canvas(W, H); cv.className = 'fm-cv'; stage.appendChild(cv); ctx = cv.getContext('2d');
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'fm-lines');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H); stage.appendChild(svg);
    ui = document.createElement('div'); ui.className = 'fm-ui'; stage.appendChild(ui);
    return Promise.all([load(ASSET.plate), load(ASSET.watch), load(ASSET.marble),
      document.fonts.load('300 40px Montserrat'), document.fonts.load('600 40px Montserrat'), document.fonts.load('200 40px Montserrat')])
      .then(function (r) { IMG.plate = r[0]; IMG.watch = r[1]; IMG.marble = r[2]; buildSprites(); buildUI(); buildTracks(); });
  }

  // ---------- sprites
  function crystalSprite(bright, seed) { // round brilliant cut seen from above: hard light/dark facets
    var n = 96, c = canvas(n, n), g = c.getContext('2d'), r = n / 2 - 2, o = n / 2, rnd = rng(seed || 1), i, k;
    var tone = function (v) { v = clamp(v); var d = bright ? v : v * 0.32 + 0.04; var x = Math.round(24 + d * 231); return 'rgb(' + x + ',' + x + ',' + Math.min(255, x + 4) + ')'; };
    g.fillStyle = bright ? '#15161a' : '#111215'; g.beginPath(); g.arc(o, o, r, 0, 7); g.fill();
    var tb = r * 0.52, L = -2.3; // light from the top-left
    for (i = 0; i < 16; i++) { // girdle + crown facets
      var a0 = i * Math.PI / 8, a1 = (i + 1) * Math.PI / 8, am = (a0 + a1) / 2;
      var v = 0.5 + 0.45 * Math.cos(am - L) + (rnd() - 0.5) * 0.9; if (i % 2) v = 1 - v * 0.8;
      g.fillStyle = tone(v); g.beginPath();
      g.moveTo(o + Math.cos(a0) * r, o + Math.sin(a0) * r); g.arc(o, o, r, a0, a1);
      g.lineTo(o + Math.cos(am) * tb, o + Math.sin(am) * tb); g.closePath(); g.fill();
      var ta = (i % 2 ? a1 : a0), tv = 0.5 + 0.5 * Math.cos(ta - L + 1) + (rnd() - 0.5) * 0.8;
      g.fillStyle = tone(tv); g.beginPath(); g.moveTo(o + Math.cos(am) * tb, o + Math.sin(am) * tb);
      g.lineTo(o + Math.cos(ta) * r * 0.97, o + Math.sin(ta) * r * 0.97); g.lineTo(o + Math.cos(i % 2 ? a1 + Math.PI / 16 : a0 - Math.PI / 16) * tb, o + Math.sin(i % 2 ? a1 + Math.PI / 16 : a0 - Math.PI / 16) * tb); g.closePath(); g.fill();
    }
    for (i = 0; i < 8; i++) { // table with the pavilion star showing through
      var b0 = i * Math.PI / 4 + Math.PI / 8, b1 = b0 + Math.PI / 4;
      k = (i % 2 ? 0.25 : 0.85) + (rnd() - 0.5) * 0.3;
      g.fillStyle = tone(k); g.beginPath(); g.moveTo(o, o);
      g.lineTo(o + Math.cos(b0) * tb, o + Math.sin(b0) * tb); g.lineTo(o + Math.cos(b1) * tb, o + Math.sin(b1) * tb); g.closePath(); g.fill();
    }
    g.strokeStyle = bright ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath();
    for (i = 0; i <= 8; i++) { var q = i * Math.PI / 4 + Math.PI / 8; g[i ? 'lineTo' : 'moveTo'](o + Math.cos(q) * tb, o + Math.sin(q) * tb); } g.stroke();
    if (bright) {
      var hs = g.createRadialGradient(o - r * 0.32, o - r * 0.34, 0, o - r * 0.32, o - r * 0.34, r * 0.34);
      hs.addColorStop(0, 'rgba(255,255,255,.95)'); hs.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hs; g.fillRect(0, 0, n, n);
    }
    g.strokeStyle = bright ? 'rgba(235,238,242,.7)' : 'rgba(120,124,130,.5)'; g.lineWidth = 2.2; g.beginPath(); g.arc(o, o, r - 1, 0, 7); g.stroke();
    return c;
  }
  function glintSprite() {
    var n = 160, c = canvas(n, n), g = c.getContext('2d'), o = n / 2;
    function ray(ang, len, wid, alpha) {
      g.save(); g.translate(o, o); g.rotate(ang);
      var gr = g.createLinearGradient(-len, 0, len, 0);
      gr.addColorStop(0, 'rgba(238,244,255,0)'); gr.addColorStop(0.5, 'rgba(238,244,255,' + alpha + ')'); gr.addColorStop(1, 'rgba(238,244,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.closePath(); g.fill(); g.restore();
    }
    ray(0, 78, 2.2, 1); ray(Math.PI / 2, 78, 2.2, 1); ray(Math.PI / 4, 34, 1.4, 0.5); ray(-Math.PI / 4, 34, 1.4, 0.5);
    var gr = g.createRadialGradient(o, o, 0, o, o, 22);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(238,244,255,.55)'); gr.addColorStop(1, 'rgba(238,244,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(o, o, 22, 0, 7); g.fill();
    return c;
  }
  function trackText(g, str, x, y, trackPx, align) { // manual letter-spacing, centred
    var w = 0, ws = [];
    for (var i = 0; i < str.length; i++) { var m = g.measureText(str[i]).width; ws.push(m); w += m + (i < str.length - 1 ? trackPx : 0); }
    var cx = align === 'center' ? x - w / 2 : x;
    for (i = 0; i < str.length; i++) { g.fillText(str[i], cx, y); cx += ws[i] + trackPx; }
  }
  function dialSprite() { // static print + indices + sub-dial faces, in units at k px/unit
    var k = 2, R = 500, n = R * 2 * k, c = canvas(n, n), g = c.getContext('2d');
    g.translate(n / 2, n / 2); g.scale(k, k);
    // sunray fine lines
    for (var i = 0; i < 360; i++) {
      var a = i * RAD; g.strokeStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.035)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); g.lineTo(Math.cos(a) * 490, Math.sin(a) * 490); g.stroke();
    }
    // edge shading
    var sh = g.createRadialGradient(0, 0, 380, 0, 0, 490); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.2)');
    g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 490, 0, 7); g.fill();
    // minute track
    for (i = 0; i < 60; i++) {
      var b = i * 6 * RAD - Math.PI / 2, major = i % 5 === 0;
      g.strokeStyle = major ? '#5d6168' : '#80858c'; g.lineWidth = major ? 3 : 1.6;
      g.beginPath(); g.moveTo(Math.cos(b) * (major ? 446 : 458), Math.sin(b) * (major ? 446 : 458)); g.lineTo(Math.cos(b) * 474, Math.sin(b) * 474); g.stroke();
    }
    // crystal hour indices (pairs; singles at 3, 6, 9)
    for (var h = 0; h < 12; h++) {
      var ang = h * 30 * RAD - Math.PI / 2, single = h === 3 || h === 6 || h === 9;
      var rs = single ? [412] : [396, 428];
      g.save(); g.rotate(ang + Math.PI / 2);
      g.fillStyle = '#e1e3e6'; g.strokeStyle = '#8e9399'; g.lineWidth = 2;
      var top = -(rs[rs.length - 1] + 17), hgt = (rs[rs.length - 1] - rs[0]) + 34;
      rr(g, -17, top, 34, hgt, 6); g.fill(); g.stroke();
      rs.forEach(function (r, q) { g.drawImage(SPR.cB[(h + q) % 4], -14, -r - 14, 28, 28); });
      g.restore();
    }
    // sub-dials
    [['s9', ['60', '20', '40'], [0, 120, 240]], ['s3', ['24', '6', '12', '18'], [0, 90, 180, 270]], ['s6', ['60', '15', '30', '45'], [0, 90, 180, 270]]].forEach(function (d) {
      var p = SUB[d[0]]; g.save(); g.translate(p[0], p[1]);
      var sg = g.createRadialGradient(-30, -40, 10, 0, 0, SUBR); sg.addColorStop(0, '#dfe1e4'); sg.addColorStop(1, '#b3b7bd');
      g.fillStyle = sg; g.beginPath(); g.arc(0, 0, SUBR, 0, 7); g.fill();
      for (var r = 12; r < SUBR; r += 8) { g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
      g.strokeStyle = '#8b9097'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, SUBR, 0, 7); g.stroke();
      for (var j = 0; j < 60; j++) {
        var q = j * 6 * RAD - Math.PI / 2, mj = j % 5 === 0; g.strokeStyle = mj ? '#4b4f56' : '#6f747b'; g.lineWidth = mj ? 2.4 : 1.2;
        g.beginPath(); g.moveTo(Math.cos(q) * (mj ? 104 : 112), Math.sin(q) * (mj ? 104 : 112)); g.lineTo(Math.cos(q) * 122, Math.sin(q) * 122); g.stroke();
      }
      g.fillStyle = '#3c4046'; g.font = '500 24px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle';
      d[1].forEach(function (s, idx) { var q = d[2][idx] * RAD - Math.PI / 2; g.fillText(s, Math.cos(q) * 78, Math.sin(q) * 78 + 1); });
      g.restore();
    });
    return c;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function watchFade() { // the cut-out with its bracelet ends feathered into darkness
    var w = IMG.watch.width, h = IMG.watch.height, c = canvas(w, h), g = c.getContext('2d');
    g.drawImage(IMG.watch, 0, 0); g.globalCompositeOperation = 'destination-in';
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.13, 'rgba(0,0,0,1)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); gr.addColorStop(0.98, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); return c;
  }
  function grainTiles() {
    var out = [], r = rng(11);
    for (var k = 0; k < 6; k++) {
      var c = canvas(256, 256), g = c.getContext('2d'), d = g.createImageData(256, 256);
      for (var i = 0; i < d.data.length; i += 4) { var v = 128 + (r() + r() + r() - 1.5) * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0); out.push(ctx.createPattern(c, 'repeat'));
    }
    return out;
  }
  function endBg() {
    var c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = C.charcoal; g.fillRect(0, 0, W, H);
    var m = IMG.marble, sc = Math.max(W / m.width, (H * 0.6) / m.height);
    var mc = canvas(W, H), mg = mc.getContext('2d');
    mg.filter = 'blur(' + 3 * U + 'px) grayscale(1)';
    mg.drawImage(m, (W - m.width * sc) / 2, H - m.height * sc, m.width * sc, m.height * sc); mg.filter = 'none';
    mg.globalCompositeOperation = 'destination-in';
    var gr = mg.createLinearGradient(0, H * 0.4, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    mg.fillStyle = gr; mg.fillRect(0, 0, W, H);
    g.globalAlpha = 0.2; g.drawImage(mc, 0, 0); g.globalAlpha = 1;
    var key = g.createRadialGradient(W * 0.3, H * 0.15, 0, W * 0.3, H * 0.15, Math.max(W, H) * 0.7);
    key.addColorStop(0, 'rgba(255,255,255,.06)'); key.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = key; g.fillRect(0, 0, W, H);
    return c;
  }
  function buildSprites() {
    SPR.cB = [3, 7, 11, 19].map(function (k) { return crystalSprite(true, k); }); SPR.cD = [3, 7, 11, 19].map(function (k) { return crystalSprite(false, k); }); SPR.cBright = SPR.cB[0]; SPR.glint = glintSprite();
    SPR.dial = dialSprite(); SPR.watch = watchFade(); SPR.grain = grainTiles(); SPR.end = endBg();
    SPR.off = canvas(W, H);
    var bz = META.bezel; SPR.bezelPick = [bz[0], bz[3], bz[7], bz[12], bz[18], bz[25], bz[31], bz[40]];
    SPR.pave = META.pave.slice().sort(function (a, b) { return a[1] - b[1]; }).filter(function (p, i) { return i % 2 === 0; });
  }

  // ---------- the vector watch face (macro shots)
  function drawVW(t, cam, alpha) {
    var g = ctx, s = cam.s * U;
    g.save(); g.globalAlpha = alpha; g.translate(cam.x, cam.y); g.rotate(cam.r * RAD); g.scale(s, s);
    var light = -50 + 60 * ss(t, 2.3, 4.4) + 4 * t; // the light travelling over steel
    // crown + pushers
    [[-33, 1], [33, 1]].forEach(function (p) {
      g.save(); g.rotate(p[0] * RAD); var pg = g.createLinearGradient(0, -20, 0, 20);
      pg.addColorStop(0, '#6f747b'); pg.addColorStop(0.45, '#f1f2f4'); pg.addColorStop(1, '#6a6f76');
      g.fillStyle = pg; rr(g, 585, -19, 62, 38, 8); g.fill(); g.restore();
    });
    var cg = g.createLinearGradient(0, -42, 0, 42); cg.addColorStop(0, '#6b7077'); cg.addColorStop(0.4, '#f3f4f6'); cg.addColorStop(1, '#666b72');
    g.fillStyle = cg; rr(g, 592, -42, 78, 84, 12); g.fill();
    g.strokeStyle = 'rgba(40,42,46,.55)'; g.lineWidth = 2;
    for (var i = 0; i < 12; i++) { var yy = -36 + i * 6.5; g.beginPath(); g.moveTo(608, yy); g.lineTo(666, yy); g.stroke(); }
    // case ring
    var ring = g.createConicGradient((light - 20) * RAD, 0, 0);
    ['#e9ebee', '#8d9197', '#cfd2d6', '#6a6e75', '#f4f5f7', '#9a9ea5', '#e9ebee'].forEach(function (c, k, a) { ring.addColorStop(k / (a.length - 1), c); });
    g.fillStyle = ring; g.beginPath(); g.arc(0, 0, 600, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 599, 0, 7); g.stroke();
    // bezel seat
    var bs = g.createRadialGradient(0, 0, 495, 0, 0, 565); bs.addColorStop(0, '#3a3d42'); bs.addColorStop(0.5, '#72767d'); bs.addColorStop(1, '#2c2e33');
    g.fillStyle = bs; g.beginPath(); g.arc(0, 0, 564, 0, 7); g.fill();
    // crystals — ignite clockwise in a wave (like seconds passing)
    for (i = 0; i < 64; i++) {
      var th = i * 360 / 64, a = th * RAD - Math.PI / 2, x = Math.cos(a) * 531, y = Math.sin(a) * 531;
      var t0 = 0.95 + (((th + 55) % 360) / 360) * 3.6, k = eo(t, t0, t0 + 0.4);
      g.drawImage(SPR.cD[i % 4], x - 25, y - 25, 50, 50);
      if (k > 0) { g.globalAlpha = alpha * k; g.drawImage(SPR.cB[i % 4], x - 25, y - 25, 50, 50); g.globalAlpha = alpha; }
    }
    // polished inner lip
    g.strokeStyle = '#eef0f2'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 499, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 494, 0, 7); g.stroke();
    // sunray dial (bow-tie reflection follows the light)
    var cg2 = g.createConicGradient(light * RAD, 0, 0);
    [['#f1f2f4', 0], ['#d0d3d8', 0.12], ['#a6aab0', 0.25], ['#d0d3d8', 0.38], ['#eef0f3', 0.5], ['#cdd0d5', 0.62], ['#a2a6ac', 0.75], ['#cdd0d5', 0.88], ['#f1f2f4', 1]]
      .forEach(function (p) { cg2.addColorStop(p[1], p[0]); });
    g.fillStyle = cg2; g.beginPath(); g.arc(0, 0, 491, 0, 7); g.fill();
    // print + indices + sub-dials, with rack focus
    var bD = rackDial(t), bM = rackMark(t);
    if (bD > 0.05) g.filter = 'blur(' + (bD * s).toFixed(2) + 'px)';
    g.drawImage(SPR.dial, -500, -500, 1000, 1000); g.filter = 'none';
    // date window 17 → 18
    g.save(); g.translate(DATE[0], DATE[1]);
    g.fillStyle = '#8f949a'; rr(g, -37, -29, 74, 58, 6); g.fill();
    g.fillStyle = '#f6f6f3'; rr(g, -33, -25, 66, 50, 4); g.fill(); g.save(); rr(g, -33, -25, 66, 50, 4); g.clip();
    var fl = eo(t, 5.9, 6.4); g.fillStyle = '#1b1c1f'; g.font = '600 34px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('17', 0, 2 - fl * 54); g.fillText('18', 0, 56 - fl * 54);
    var ish = g.createLinearGradient(0, -25, 0, 25); ish.addColorStop(0, 'rgba(0,0,0,.18)'); ish.addColorStop(0.3, 'rgba(0,0,0,0)'); g.fillStyle = ish; g.fillRect(-33, -25, 66, 50);
    g.restore(); g.restore();
    // wordmark on the dial
    if (bM > 0.05) g.filter = 'blur(' + (bM * s).toFixed(2) + 'px)';
    g.fillStyle = '#1f2124'; g.font = '600 46px Montserrat'; g.textBaseline = 'middle'; g.textAlign = 'left';
    trackText(g, 'FOSSIL', 0, -226, 4.6, 'center'); g.filter = 'none';
    // sub-dial hands — rotate in sync
    var spin = 360 * ss(t, 5.4, 7.6);
    [[SUB.s9, 205], [SUB.s3, 330], [SUB.s6, 95]].forEach(function (h) {
      g.save(); g.translate(h[0][0], h[0][1]); g.rotate((h[1] + spin) * RAD);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-1, -106, 5, 132);
      g.fillStyle = '#f4f5f7'; g.strokeStyle = '#4a4e55'; g.lineWidth = 1; g.beginPath(); g.moveTo(-2.2, 24); g.lineTo(-1.4, -110); g.lineTo(1.4, -110); g.lineTo(2.2, 24); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#d9dce0'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke();
      g.restore();
    });
    // hands 10:10, seconds sweeping
    var hands = [[305, 250, 18, 10, 'h'], [60, 405, 15, 7, 'm']];
    g.save(); g.translate(8, 11); g.filter = 'blur(' + (5 * s).toFixed(1) + 'px)'; g.fillStyle = 'rgba(0,0,0,.28)';
    hands.forEach(function (hd) { g.save(); g.rotate(hd[0] * RAD); handPath(g, hd); g.fill(); g.restore(); });
    g.restore(); g.filter = 'none';
    hands.forEach(function (hd) {
      g.save(); g.rotate(hd[0] * RAD);
      var hg = g.createLinearGradient(-hd[2] / 2, 0, hd[2] / 2, 0);
      hg.addColorStop(0, '#7d8288'); hg.addColorStop(0.46, '#fbfbfc'); hg.addColorStop(0.54, '#aeb2b8'); hg.addColorStop(1, '#5f646b');
      g.fillStyle = hg; handPath(g, hd); g.fill(); g.strokeStyle = 'rgba(40,42,46,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fafafa'; g.fillRect(-2.6, -hd[1] + 40, 5.2, hd[1] - 120);
      g.restore();
    });
    var sec = (12 + t) * 6;
    g.save(); g.rotate(sec * RAD); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(3, -452, 2.5, 560);
    g.fillStyle = '#e7e9ec'; g.strokeStyle = 'rgba(40,42,46,.6)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-1.6, 100); g.lineTo(-1, -456); g.lineTo(1, -456); g.lineTo(1.6, 100); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 72, 10, 0, 7); g.fill(); g.stroke(); g.restore();
    var cap = g.createRadialGradient(-5, -6, 1, 0, 0, 17); cap.addColorStop(0, '#ffffff'); cap.addColorStop(1, '#80858c');
    g.fillStyle = cap; g.beginPath(); g.arc(0, 0, 17, 0, 7); g.fill(); g.fillStyle = '#50545a'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
    // crystal glass reflection
    g.save(); g.beginPath(); g.arc(0, 0, 499, 0, 7); g.clip();
    var gl = g.createLinearGradient(-500, -500, 500, 500);
    gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.32, 'rgba(255,255,255,.07)'); gl.addColorStop(0.46, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(-500, -500, 1000, 1000); g.restore();
    g.restore();
    // ignition glints (every 3rd crystal)
    for (i = 0; i < 64; i += 3) {
      var th2 = i * 360 / 64, t1 = 0.95 + (((th2 + 55) % 360) / 360) * 3.6 + 0.1, kk = seg(t, t1, t1 + 0.45);
      if (kk > 0 && kk < 1) {
        var a2 = th2 * RAD - Math.PI / 2, p = vwToScreen(cam, Math.cos(a2) * 520 - 7, Math.sin(a2) * 520 - 8);
        glint(p[0], p[1], 70 * s, kk, alpha * 0.9);
      }
    }
  }
  function handPath(g, hd) {
    var len = hd[1], wb = hd[2] / 2, wt = hd[3] / 2;
    g.beginPath(); g.moveTo(-wb, 46); g.lineTo(-wt, -len + 12); g.lineTo(0, -len); g.lineTo(wt, -len + 12); g.lineTo(wb, 46); g.closePath();
  }
  function rackDial(t) { return 3.5 * (1 - ss(t, 2.1, 2.8)) + 4.5 * ss(t, 3.05, 3.7) * (1 - ss(t, 4.0, 4.5)); }
  function rackMark(t) { return 7 * (1 - ss(t, 3.05, 3.7)); }
  function vwToScreen(cam, x, y) {
    var s = cam.s * U, c = Math.cos(cam.r * RAD), sn = Math.sin(cam.r * RAD);
    return [cam.x + (x * c - y * sn) * s, cam.y + (x * sn + y * c) * s];
  }

  // ---------- glints
  function glint(x, y, size, k, alpha) {
    var e = Math.pow(Math.sin(Math.PI * clamp(k)), 1.4) * (alpha === undefined ? 1 : alpha); if (e <= 0.001) return;
    var sz = size * (0.45 + 0.55 * Math.sin(Math.PI * clamp(k)));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e; ctx.translate(x, y); ctx.rotate((10 + 25 * k) * RAD);
    ctx.drawImage(SPR.glint, -sz / 2, -sz / 2, sz, sz); ctx.restore();
  }

  // ---------- photo plate + cut-out
  function drawPlate(cam, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2 + (cam.ox || 0), H / 2); ctx.rotate(cam.r * RAD); ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x - META.plate.padL, -cam.y - META.plate.padT); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(IMG.plate, 0, 0); ctx.restore();
  }
  function imgToScreen(cam, px, py) {
    var dx = (px - cam.x) * cam.z, dy = (py - cam.y) * cam.z, c = Math.cos(cam.r * RAD), s = Math.sin(cam.r * RAD);
    return [W / 2 + (cam.ox || 0) + dx * c - dy * s, H / 2 + dx * s + dy * c];
  }
  function poseToScreen(p, px, py) {
    var dx = (px - P0[0]) * p.z * p.sx, dy = (py - P0[1]) * p.z, c = Math.cos(p.r * RAD), s = Math.sin(p.r * RAD);
    return [p.x + dx * c - dy * s, p.y + dx * s + dy * c];
  }
  function applyPose(g, p) { g.translate(p.x, p.y); g.rotate(p.r * RAD); g.scale(p.z * p.sx, p.z); g.translate(-(P0[0] - META.watch.x), -(P0[1] - META.watch.y)); }
  function drawCutout(p, alpha) { ctx.save(); ctx.globalAlpha = alpha; applyPose(ctx, p); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(SPR.watch, 0, 0); ctx.restore(); }
  function sheen(p, k, strength, angle, width) { // light sweep over the metal only
    if (k <= 0 || k >= 1) return;
    var o = SPR.off, g = o.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); applyPose(g, p); g.drawImage(SPR.watch, 0, 0); g.restore();
    g.globalCompositeOperation = 'source-in';
    var a = (angle || 20) * RAD, span = Math.hypot(W, H), cx = lerp(-0.25, 1.25, k) * W, cy = H / 2;
    var dx = Math.cos(a) * width * U, dy = Math.sin(a) * width * U;
    var gr = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength; ctx.drawImage(o, 0, 0); ctx.restore();
  }
  function sheenBand(p, y0, y1, k, strength) { // a band of light travelling down the bracelet
    if (k <= 0 || k >= 1) return;
    var o = SPR.off, g = o.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); applyPose(g, p); g.drawImage(SPR.watch, 0, 0); g.globalCompositeOperation = 'source-in';
    var yy = lerp(y0, y1, k) - META.watch.y, gr = g.createLinearGradient(0, yy - 70, 0, yy + 70);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, META.watch.w, META.watch.h); g.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength; ctx.drawImage(o, 0, 0); ctx.restore();
  }
  function silk(t, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = C.charcoal; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.rotate(-28 * RAD);
    var D = Math.hypot(W, H);
    for (var i = 0; i < 5; i++) {
      var off = (-0.5 + i * 0.26 + 0.015 * Math.sin(t * 0.5 + i)) * D, wd = (0.1 + 0.05 * (i % 3)) * D;
      var gr = ctx.createLinearGradient(0, off - wd, 0, off + wd);
      gr.addColorStop(0, 'rgba(58,60,66,0)'); gr.addColorStop(0.5, 'rgba(58,60,66,' + (0.55 - 0.08 * (i % 2)) + ')'); gr.addColorStop(1, 'rgba(58,60,66,0)');
      ctx.fillStyle = gr; ctx.fillRect(-D, off - wd, 2 * D, 2 * wd);
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = alpha * 0.5;
    var key = ctx.createRadialGradient(W * 0.25, H * 0.2, 0, W * 0.25, H * 0.2, Math.max(W, H) * 0.8);
    key.addColorStop(0, 'rgba(255,255,255,.07)'); key.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = key; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function bokeh(t, camY, alpha) { // soft anamorphic highlights in the foreground (parallax)
    var pts = [[0.06, 0.2, 260], [0.95, 0.35, 320], [0.1, 0.78, 220], [0.9, 0.9, 280], [0.02, 1.25, 300]];
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    pts.forEach(function (p, i) {
      var y = p[1] * H - (camY - 740) * 3.4 * U, x = p[0] * W, r = p[2] * U;
      ctx.save(); ctx.translate(x, y); ctx.scale(0.62, 1);
      var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(238,244,255,' + (0.1 * alpha) + ')'); gr.addColorStop(0.7, 'rgba(238,244,255,' + (0.06 * alpha) + ')'); gr.addColorStop(1, 'rgba(238,244,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
    });
    ctx.restore();
  }

  // ---------- camera tracks
  function buildTracks() {
    var s1 = L.s1, s2 = L.s2;
    function kc(t, s, dx, dy, r) { return [t, s, W / 2 + dx * s * U, H / 2 + dy * s * U, r]; }
    var keys = [kc(0, s1 * 0.97, 0, 530, -4), kc(2.5, s1 * 1.03, -40, 470, -1.2), kc(3.15, s2, -150, 330, 0), kc(3.85, s2 * 0.94, 0, 245, 0),
      [4.95, L.sFull, W * L.c2[0], H * L.c2[1], 0], [5.2, L.sFull, W * L.c2[0], H * L.c2[1], 0], [8.4, L.sPush, W * L.c3[0], H * L.c3[1], 0]];
    K.vs = track(keys.map(function (k) { return [k[0], Math.log(k[1])]; }));
    K.vx = track(keys.map(function (k) { return [k[0], k[2]]; }));
    K.vy = track(keys.map(function (k) { return [k[0], k[3]]; }));
    K.vr = track(keys.map(function (k) { return [k[0], k[4]]; }));
    var h = L.hero, z4 = L.z4;
    var pk = [[7.8, 826, 800, z4 * 1.12, 2.5], [11.0, 842, 1012, z4 * 1.2, -0.5], [12.5, h[0], h[1], h[2], 0], [14.4, h[0] - 18, h[1] + 4, h[2] * 1.035, 0]];
    K.px = track(pk.map(function (k) { return [k[0], k[1]]; }));
    K.py = track(pk.map(function (k) { return [k[0], k[2]]; }));
    K.pz = track(pk.map(function (k) { return [k[0], Math.log(k[3])]; }));
    K.pr = track(pk.map(function (k) { return [k[0], k[4]]; }));
    var dx = (L.p4dx || 0) * U; K.pdx = track([[7.8, dx], [11.0, dx], [12.5, 0]]);
    var hp = heroPose(14.0), wr = L.wrist, en = L.end.watch;
    var ck = [[14.0, hp.x, hp.y, hp.z, 0], [15.8, W * wr[0], H * wr[1], wr[2] * U, -68], [16.9, W * wr[0] + 10 * U, H * wr[1], wr[2] * 1.03 * U, -66],
      [17.9, W * en[0], H * en[1], en[2] * U, -1.5], [20, W * en[0], H * en[1] - 8 * U, en[2] * 1.025 * U, 1.5]];
    K.cx = track(ck.map(function (k) { return [k[0], k[1]]; }));
    K.cy = track(ck.map(function (k) { return [k[0], k[2]]; }));
    K.cz = track(ck.map(function (k) { return [k[0], Math.log(k[3])]; }));
    K.cr = track(ck.map(function (k) { return [k[0], k[4]]; }));
  }
  function vcam(t) { return { s: Math.exp(K.vs(t)), x: K.vx(t), y: K.vy(t), r: K.vr(t) }; }
  function pcam(t) { return { x: K.px(t), y: K.py(t), z: Math.exp(K.pz(t)) * U, r: K.pr(t), ox: K.pdx(t) }; }
  function heroPose(t) { var c = pcam(t), p = imgToScreen(c, P0[0], P0[1]); return { x: p[0], y: p[1], z: c.z, r: c.r, sx: 1 }; }
  function cpose(t) {
    if (t <= 14.0) return heroPose(t);
    var sx = 1 - 0.16 * Math.sin(Math.PI * ss(t, 14.0, 16.4)) - 0.03 * Math.sin(Math.PI * ss(t, 17.9, 20));
    return { x: K.cx(t), y: K.cy(t), z: Math.exp(K.cz(t)), r: K.cr(t), sx: sx };
  }

  // ---------- UI (DOM + SVG), updated per frame
  function txt(cls, str, px, track, weight, color) {
    var d = el('div', 'fm-t ' + (cls || '')); d.textContent = str;
    d.style.fontSize = px * U + 'px'; d.style.fontWeight = weight || 300; d.style.color = color || C.white;
    d._track = track; d.style.letterSpacing = track + 'em'; return d;
  }
  function reveal(d, t, t0, x, y, align) { // rise 12px, fade, tracking settles (+0.06em → rest)
    var p = eo(t, t0, t0 + 0.75);
    d.style.opacity = p; d.style.letterSpacing = (d._track + 0.06 * (1 - p)) + 'em';
    var w = d.offsetWidth, ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    d.style.transform = 'translate(' + (x + ox) + 'px,' + (y + 12 * U * (1 - p)) + 'px)';
    return p;
  }
  function path(cls) { var p = el('path', cls, svg, true); return p; }
  function drawLine(p, pts, k) {
    var d = 'M' + pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L');
    var len = 0; for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    p.setAttribute('d', d); p.setAttribute('stroke-dasharray', len + ' ' + (len + 1)); p.setAttribute('stroke-dashoffset', len * (1 - k));
  }
  function circ(cls, r) { var c = el('circle', cls, svg, true); c.setAttribute('r', r * U); return c; }
  function place(c, x, y, o) { c.setAttribute('cx', x); c.setAttribute('cy', y); c.style.opacity = o; }

  function buildUI() {
    svg.innerHTML = ''; ui.innerHTML = '';
    E.slit = el('div', 'fm-slit');
    E.trace = el('circle', 'fm-hl', svg, true); E.ticks = [0, 1, 2, 3].map(function () { return path('fm-hl'); });
    E.counters = ['60', '24', '60'].map(function (v) { return counter(v); });
    E.call = [['caseEdge', 'STAINLESS STEEL CASE'], ['date', 'DATE WINDOW'], ['chrono', 'CHRONOGRAPH MOVEMENT']].map(function (c, i) {
      var label = FK === '169' && false ? c[1] : c[1];
      return { feat: c[0], line: path('fm-hl'), ring: circ('fm-ring', 5), dot: circ('fm-dot', 3), label: txt('fm-label', label, 24, 0.24, 300, C.white) };
    });
    E.pave = { line: path('fm-hl'), dot: circ('fm-dot', 3), labels: L.pave.lines.split('\n').map(function (s) { return txt('fm-label', s, 24, 0.24, 300, C.white); }) };
    E.hero = { mark: txt('fm-mark', 'FOSSIL', 96, 0.16, 300), tag: txt('fm-tagline', 'TIME LOOKS GOOD ON YOU', 24, 0.42, 300, C.white), rule: el('div', 'fm-rule') };
    E.hero.rule.style.width = 60 * U + 'px'; E.hero.rule.style.height = Math.max(1, U) + 'px';
    var pill = el('div', 'fm-pill'); pill.style.height = 64 * U + 'px'; pill.style.borderWidth = Math.max(1, U) + 'px'; pill.style.padding = '0 ' + 32 * U + 'px'; pill.style.fontSize = 22 * U + 'px';
    pill.innerHTML = 'Stainless Steel<i>·</i>Crystal Bezel<i>·</i>Chronograph';
    pill.querySelectorAll('i').forEach(function (i) { i.style.margin = '0 ' + 14 * U + 'px'; });
    E.pill = pill;
    E.end = { mark: txt('fm-mark', 'FOSSIL', 120, 0.18, 300), tag: txt('fm-tagline', 'TIME LOOKS GOOD ON YOU', 24, 0.42, 300, C.white), cta: el('div', 'fm-cta') };
    E.end.cta.innerHTML = '<span>SHOP THE COLLECTION</span><b></b>';
    var cta = E.end.cta; cta.style.height = 64 * U + 'px'; cta.style.padding = '0 ' + 48 * U + 'px'; cta.style.fontSize = 20 * U + 'px'; cta.style.borderWidth = Math.max(1, U) + 'px';
    E.safe = el('div', 'fm-safe');
    E.black = el('div', 'fm-black');
  }
  function counter(v) {
    var d = el('div', 'fm-counter'); d.style.fontSize = 64 * U + 'px';
    d._cols = v.split('').map(function (ch) {
      var col = el('span', 'fm-col', d), strip = el('span', 'fm-strip', col);
      strip.textContent = '01234567890123456789'.split('').join('\n'); strip._to = 10 + (+ch); return strip;
    });
    return d;
  }

  function updateUI(t) {
    var i, vc = vcam(t);
    // shot 1: the line of light, then the slit opening
    var lw = eo(t, 0.15, 1.1), open = eo(t, 0.85, 2.3);
    E.slit.style.width = lw * 0.9 * W + 'px'; E.slit.style.left = (W - lw * 0.9 * W) / 2 + 'px';
    E.slit.style.top = (H / 2 - Math.max(1, U) / 2) + 'px'; E.slit.style.height = Math.max(1, U) * 1.5 + 'px';
    E.slit.style.opacity = t < 0.15 ? 0 : (1 - ss(t, 1.0, 1.9));
    // shot 2: dial trace + ticks
    var tr = eo(t, 3.95, 5.45), trO = 1 - ss(t, 6.0, 6.4), R = 610 * vc.s * U;
    E.trace.setAttribute('cx', vc.x); E.trace.setAttribute('cy', vc.y); E.trace.setAttribute('r', R);
    var circum = 2 * Math.PI * R; E.trace.setAttribute('stroke-dasharray', circum + ' ' + circum); E.trace.setAttribute('stroke-dashoffset', circum * (1 - tr));
    E.trace.setAttribute('transform', 'rotate(-90 ' + vc.x + ' ' + vc.y + ')'); E.trace.style.opacity = t < 3.9 ? 0 : trO;
    E.ticks.forEach(function (p, q) {
      var k = eo(t, 3.95 + q * 0.3, 3.95 + q * 0.3 + 0.5), a = q * Math.PI / 2 - Math.PI / 2;
      var p1 = [vc.x + Math.cos(a) * R, vc.y + Math.sin(a) * R], p2 = [vc.x + Math.cos(a) * (R + 18 * U), vc.y + Math.sin(a) * (R + 18 * U)];
      drawLine(p, [p1, p2], k); p.style.opacity = trO;
    });
    // shot 3: counters roll in, then fade
    var cO = 1 - ss(t, 5.95, 6.3);
    var cpos = L.counterMode === 'dials'
      ? [SUB.s9, SUB.s3, SUB.s6].map(function (s) { return [vwToScreen(vc, s[0], s[1])[0], H * L.counterY]; })
      : [0, 1, 2].map(function (q) { return [W * L.dotX + (60 + q * 150) * U, H * L.counterY]; });
    E.counters.forEach(function (d, q) {
      var t0 = 5.1 + q * 0.12; d.style.opacity = t < t0 ? 0 : eo(t, t0, t0 + 0.4) * cO;
      d.style.transform = 'translate(' + (cpos[q][0] - d.offsetWidth / 2) + 'px,' + (cpos[q][1] - d.offsetHeight / 2) + 'px)';
      d._cols.forEach(function (s, j) { var k = eo(t, t0 + j * 0.08, t0 + j * 0.08 + 0.75); s.style.transform = 'translateY(' + (-k * s._to) + 'em)'; });
    });
    // shot 3: callouts
    var callO = 1 - ss(t, 7.85, 8.2);
    E.call.forEach(function (c, q) {
      var t0 = 6.15 + q * 0.25, f = FEAT[c.feat], A = vwToScreen(vc, f[0], f[1]), pts, D, side;
      var lab = c.label, w = lab.offsetWidth;
      if (L.leader === 'vh') { var y = H * L.rows[q]; D = [W * L.dotX, y]; pts = [A, [A[0], y], D]; side = 'left'; }
      else { D = [W * L.dotX, A[1]]; pts = [A, D]; side = 'right'; }
      var k = eo(t, t0, t0 + 0.75), vis = t >= t0 ? callO : 0;
      drawLine(c.line, pts, k); c.line.style.opacity = vis;
      place(c.ring, A[0], A[1], vis * eo(t, t0 - 0.1, t0 + 0.3)); place(c.dot, D[0], D[1], vis * eo(t, t0 + 0.6, t0 + 0.9));
      var lx = side === 'left' ? D[0] - 18 * U : D[0] + 18 * U, ly = D[1] - lab.offsetHeight / 2;
      reveal(lab, t, t0 + 0.55, lx, ly, side === 'left' ? 'right' : 'left'); lab.style.opacity = +lab.style.opacity * (t >= t0 ? callO : 0);
    });
    // shot 4: pavé crystal links
    var pc = pcam(t), pO = 1 - ss(t, 10.7, 11.1);
    var a = imgToScreen(pc, 672, 858), b = imgToScreen(pc, 702, 1070);
    var pk = eo(t, 8.6, 9.6); drawLine(E.pave.line, [a, b], pk); E.pave.line.style.opacity = t >= 8.5 ? pO : 0;
    place(E.pave.dot, b[0], b[1], (t >= 8.5 ? pO : 0) * eo(t, 9.5, 9.8));
    E.pave.labels.forEach(function (d, q) {
      var t0 = 9.6 + q * 0.2, x, y;
      if (L.pave.side === 'below') { x = b[0] - 6 * U; x = Math.max(x, 108 * U); y = b[1] + (22 + q * 34) * U; reveal(d, t, t0, Math.min(x, b[0]), y, 'left'); }
      else if (L.pave.side === 'stack') { var nl = E.pave.labels.length; y = b[1] + (q - nl / 2) * 34 * U; reveal(d, t, t0, b[0] - 18 * U, y, 'right'); }
      else { reveal(d, t, t0, b[0] - 18 * U, b[1] - d.offsetHeight / 2, 'right'); }
      d.style.opacity = +d.style.opacity * (t >= t0 ? pO : 0);
    });
    // shot 5: headline
    var hO = 1 - ss(t, 13.6, 13.95), hx = L.head[0] * U, hy = L.head[1] * H;
    var m = E.hero.mark; reveal(m, t, 11.9, hx - 0.012 * 96 * U, hy, 'left'); m.style.opacity *= hO;
    var tg = E.hero.tag; reveal(tg, t, 12.15, hx, hy + 128 * U, 'left'); tg.style.opacity *= hO;
    var rk = eo(t, 12.45, 13.2); E.hero.rule.style.transform = 'translate(' + hx + 'px,' + (hy + 196 * U) + 'px) scaleX(' + rk + ')'; E.hero.rule.style.opacity = t > 12.45 ? hO : 0;
    // shot 6: frosted pill
    var pl = E.pill, pp = eo(t, 14.9, 15.65), plO = pp * (1 - ss(t, 16.6, 16.95));
    pl.style.opacity = plO; pl.style.transform = 'translate(' + (L.pill[0] * W - pl.offsetWidth + 48 * U * (1 - pp)) + 'px,' + (L.pill[1] * H - pl.offsetHeight / 2) + 'px)';
    // shot 7: end card
    var e = L.end, fb = 1;
    reveal(E.end.mark, t, 17.25, W / 2 + 0.09 * 120 * U, H * e.logo - 60 * U, 'center');
    reveal(E.end.tag, t, 17.5, W / 2 + 0.21 * 24 * U, H * e.tag, 'center');
    var ct = E.end.cta, cp = eo(t, 18.0, 18.75);
    ct.style.opacity = cp; ct.style.transform = 'translate(' + (W / 2 - ct.offsetWidth / 2) + 'px,' + (H * e.cta - ct.offsetHeight / 2 + 12 * U * (1 - cp)) + 'px)';
    var sh = seg(t, 18.4, 19.4); ct.lastChild.style.transform = 'translateX(' + lerp(-120, 320, sh) + '%) skewX(-20deg)'; ct.lastChild.style.opacity = sh > 0 && sh < 1 ? 1 : 0;
    // fade to black on the beat
    E.black.style.opacity = ss(t, 19.5, 19.92);
  }

  // ---------- frame
  var gi = 0;
  function render(t) {
    t = clamp(t, 0, DUR);
    var g = ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // shots 1–3 · vector macro of the dial
    var vA = 1 - ss(t, 7.8, 8.35);
    if (vA > 0) {
      var vc = vcam(t);
      g.save();
      if (t < 2.3) { // the slit of light opening
        var open = eo(t, 0.85, 2.3), hh = Math.max(0, open * H), feather = 60 * U;
        g.beginPath(); g.rect(0, H / 2 - hh / 2 - feather, W, hh + 2 * feather); g.clip();
      }
      g.fillStyle = C.charcoal; g.globalAlpha = ss(t, 0.9, 2.3); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      drawVW(t, vc, vA * (t < 2.3 ? eo(t, 0.85, 1.6) : 1));
      g.restore();
      if (t < 2.3) { // feathered slit edges
        var open2 = eo(t, 0.85, 2.3), hh2 = open2 * H, f2 = 60 * U;
        var gt = g.createLinearGradient(0, H / 2 - hh2 / 2 - f2, 0, H / 2 - hh2 / 2 + f2);
        gt.addColorStop(0, 'rgba(0,0,0,1)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gt; g.fillRect(0, H / 2 - hh2 / 2 - f2, W, 2 * f2);
        var gb = g.createLinearGradient(0, H / 2 + hh2 / 2 - f2, 0, H / 2 + hh2 / 2 + f2);
        gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gb; g.fillRect(0, H / 2 + hh2 / 2 - f2, W, 2 * f2);
      }
    }
    // shots 4–5 · the photographic plate
    var pA = ss(t, 7.8, 8.35) * (1 - ss(t, 13.85, 14.35));
    if (pA > 0) {
      var pc = pcam(t); drawPlate(pc, pA);
      if (t < 11.2) bokeh(t, pc.y, pA * (1 - ss(t, 10.8, 11.4)));
      // light flowing link by link along the pavé
      var hp = heroPose(t);
      sheenBand(hp, 830, 1110, seg(t, 8.5, 10.6), 0.35 * pA);
      SPR.pave.forEach(function (q, i) { var t0 = 8.55 + (i / SPR.pave.length) * 1.9, p = imgToScreen(pc, q[0], q[1]); glint(p[0], p[1], 64 * U, seg(t, t0, t0 + 0.5), 0.8 * pA); });
      // hero light sweep
      sheen(hp, seg(t, 11.9, 13.5), 0.45 * pA, 18, 90);
      [[12.6, 0], [13.05, 3], [13.45, 5]].forEach(function (q) { var b = SPR.bezelPick[q[1]], p = imgToScreen(pc, b[0], b[1]); glint(p[0], p[1], 90 * pc.z / 1.25, seg(t, q[0], q[0] + 0.55), pA); });
    }
    // shots 6–7 · silk, then the end card
    if (t > 13.85) {
      var sA = ss(t, 13.85, 14.35) * (1 - ss(t, 16.9, 17.8)), eA = ss(t, 16.9, 17.8);
      if (sA > 0) silk(t, sA);
      if (eA > 0) { g.save(); g.globalAlpha = eA; g.drawImage(SPR.end, 0, 0); g.restore(); }
      var cp = cpose(t); drawCutout(cp, 1);
      sheen(cp, seg(t, 14.9, 16.3), 0.4, 24, 110);
      [[15.2, 1], [15.75, 4], [16.25, 6], [19.0, 2]].forEach(function (q) { var b = SPR.bezelPick[q[1]], p = poseToScreen(cp, b[0], b[1]); glint(p[0], p[1], 100 * cp.z, seg(t, q[0], q[0] + 0.6), 1); });
    }
    // lens: vignette + grain
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    var fr = Math.floor(t * 24), pat = SPR.grain[fr % SPR.grain.length], r = rng(fr + 3);
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.07; g.translate(-r() * 256, -r() * 256); g.fillStyle = pat; g.fillRect(0, 0, W + 256, H + 256); g.restore();
    updateUI(t);
  }

  window.FossilFilm = { init: init, render: render, duration: DUR, formats: FORMATS, size: function () { return [W, H]; },
    shots: [[0, 'Darkness → first light'], [2.5, 'The dial'], [5, 'Chronograph comes alive'], [8, 'Crystal bracelet'], [11, 'Hero reveal'], [14, 'On you'], [17, 'End card']],
    safe: function (on) { E.safe.style.display = on ? 'block' : 'none'; } };
})();
