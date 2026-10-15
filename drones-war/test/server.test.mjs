// server.mjs end to end against a stub Match: static and vendor routes, hardening (oversized frames,
// prototype keys, rate limits, Origin, heartbeat), the lobby protocol and the match lifecycle
// (start -> loaded -> go -> snap -> over -> lobby). Real sockets on free ports; every handle is
// closed so `node --test` exits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createServer } from '../server.mjs';
import { UNIT_TYPES, TEAMS, U } from '../public/js/shared/units.js';

const WS = globalThis.WebSocket ?? (await import('ws')).WebSocket;
const TIMES = ['overcast', 'day', 'sunset', 'night'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Stub Match: the seam from spec §2.3, with knobs the tests turn.

function makeStub() {
  const instances = [];
  class StubMatch {
    constructor(opts) {
      instances.push(this);
      this.opts = opts;
      this.world = { seed: opts.seed, timeOfDay: opts.timeOfDay, size: 1200, buildings: [[1, 2, 3]] };
      this.phase = 'warmup';
      this.cd = 0;
      this.winner = null;
      this.reason = null;
      this.score = { def: 0, atk: 0 };
      this.hq = { hp: 5000, max: 5000 };
      this.steps = 0;
      this.inputs = [];
      this.nextTypes = [];
      this.removed = [];
      this.endAfter = 0; // steps until the attackers win (0 = never)
      this.throwOnStep = opts.players.some((p) => p.name === 'Crash');
      this.units = new Map();
      this.nextUid = 1;
      for (const p of opts.players) this.addPlayer(p);
      const botNames = ['Viper', 'Hammer', 'Rhino'];
      for (const team of ['def', 'atk']) {
        for (let i = 0; i < opts.botsPerTeam; i++) {
          const id = `bot-${team}-${i}`;
          this.units.set(id, { uid: this.nextUid++, id, name: botNames[i % 3], team, isBot: true, suit: null });
        }
      }
    }

    addPlayer(p) {
      const u = { uid: this.nextUid++, id: p.id, name: p.name, team: p.team, type: p.unit, isBot: false, suit: p.suit };
      this.units.set(p.id, u);
      return u;
    }

    byId(id) {
      return this.units.get(id) ?? null;
    }

    removeUnit(id) {
      this.removed.push(id);
      return this.units.delete(id);
    }

    setInput(id, list) {
      if (list.some((r) => r && r.boom === true)) throw new Error('handler boom');
      this.inputs.push([id, list]);
      return list.length;
    }

    setNextType(id, type) {
      this.nextTypes.push([id, type]);
      return true;
    }

    begin() {
      this.phase = 'countdown';
      this.cd = 3;
    }

    step(dt) {
      if (this.throwOnStep) throw new Error('tick boom');
      if (this.phase === 'warmup' || this.phase === 'over') return;
      this.steps++;
      this.cd = Math.max(0, this.cd - dt);
      if (this.endAfter && this.steps >= this.endAfter) this.end('atk', 'destroyed');
    }

    end(winner, reason) {
      this.winner = winner;
      this.reason = reason;
      this.phase = 'over';
    }

    snapshot(n) {
      return { t: 'snap', n, time: this.steps / 60, left: 300, cd: this.cd, hq: 5000, hqMax: 5000, score: this.score, u: [], p: [], ev: [] };
    }

    roster() {
      return [...this.units.values()].map((u) => ({ id: u.id, uid: u.uid, name: u.name, team: u.team, bot: u.isBot, suit: u.suit }));
    }

    board() {
      return [...this.units.values()].map((u) => ({ id: u.id, uid: u.uid, name: u.name, team: u.team, bot: u.isBot, kills: 0, deaths: 0, score: 0 }));
    }

    overMessage() {
      return { t: 'over', winner: this.winner, reason: this.reason, score: this.score, hq: 0, hqMax: 5000, board: this.board() };
    }
  }
  return { StubMatch, instances };
}

// ---------------------------------------------------------------------------------------------
// Harness

class Client {
  constructor(url) {
    this.ws = new WS(url);
    this.queue = []; // unconsumed messages
    this.all = []; // every message, for negative assertions
    this.waiters = new Set();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.closed = new Promise((resolve) => {
      this.ws.addEventListener('close', (e) => resolve(e.code), { once: true });
    });
    this.ws.addEventListener('message', (e) => this.onMessage(JSON.parse(String(e.data))));
  }

  onMessage(m) {
    this.all.push(m);
    for (const w of this.waiters) {
      if (w.pred(m)) {
        clearTimeout(w.timer);
        this.waiters.delete(w);
        w.resolve(m);
        return;
      }
    }
    this.queue.push(m);
  }

  send(msg) {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Resolves with (and consumes) the first message, queued or future, that matches `pred`. */
  next(pred, ms = 3000) {
    const i = this.queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = {
        pred,
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(w);
          reject(new Error(`timed out; received: ${this.all.map((m) => m.t).join(',')}`));
        }, ms),
      };
      this.waiters.add(w);
    });
  }

  /** Forgets the unconsumed messages (they stay in `all`). */
  drain() {
    this.queue.length = 0;
  }

  count(pred) {
    return this.all.filter(pred).length;
  }

  close() {
    for (const w of this.waiters) clearTimeout(w.timer);
    this.waiters.clear();
    if (this.ws.readyState <= 1) this.ws.close();
  }
}

const is = (t, f = () => true) => (m) => m.t === t && f(m);
const roomWhere = (f) => is('room', (m) => f(m.room));
const isChat = (text) => is('chat', (m) => m.text === text);

async function setup(t, opts = {}) {
  const { StubMatch, instances } = makeStub();
  const logs = [];
  const app = createServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log: (l) => logs.push(l), ...opts });
  const { port } = await app.ready;
  const clients = [];
  const env = {
    app, port, logs, instances,
    async client() {
      const c = new Client(`ws://127.0.0.1:${port}/ws`);
      clients.push(c);
      await c.opened;
      c.hello = await c.next(is('hello'));
      return c;
    },
    /** Creates a room; returns { host, code }. */
    async room(name = 'Alpha', extra = {}) {
      const host = await env.client();
      host.send({ t: 'create', name, ...extra });
      const m = await host.next(is('room'));
      return { host, code: m.room.code };
    },
    async join(code, name) {
      const c = await env.client();
      c.send({ t: 'join', code, name });
      await c.next(is('room'));
      return c;
    },
  };
  t.after(async () => {
    for (const c of clients) c.close();
    await app.close();
  });
  return env;
}

function request(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** A hand-made upgrade request: resolves { status, socket } (socket only on 101). */
function rawUpgrade(port, path = '/ws', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path, agent: false,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...headers,
      },
    });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode, socket }));
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode, socket: null });
    });
    req.on('error', reject);
    req.end();
  });
}

const input = (seq, extra = {}) => ({ seq, mx: 0, mz: 1, look: [0, 0], aim: null, ...extra });

/** Host starts, everyone loads, everyone gets `go`. Returns the stub Match. */
async function startAndGo(env, host, others = []) {
  host.send({ t: 'start' });
  const starts = [];
  for (const c of [host, ...others]) starts.push(await c.next(is('start')));
  for (const c of [host, ...others]) c.send({ t: 'loaded' });
  for (const c of [host, ...others]) await c.next(is('go'));
  return { match: env.instances.at(-1), starts };
}

// ---------------------------------------------------------------------------------------------
// HTTP

test('static files: types, caching, methods, health and the path jail', async (t) => {
  const { port } = await setup(t);
  const index = await request(port, '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /^text\/html/);
  assert.equal(index.headers['x-content-type-options'], 'nosniff');
  assert.equal(index.headers['cache-control'], 'no-cache');
  assert.ok(index.headers.etag);
  assert.match(index.body, /<html/i);

  const again = await request(port, '/index.html', { headers: { 'If-None-Match': index.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal(again.body, '');

  const js = await request(port, '/js/shared/units.js');
  assert.equal(js.status, 200);
  assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await request(port, '/css/hud.css')).headers['content-type'], 'text/css; charset=utf-8');
  assert.equal((await request(port, '/icon.svg')).headers['content-type'], 'image/svg+xml');

  const head = await request(port, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(index.body));

  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const r = await request(port, '/', { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.allow, 'GET, HEAD');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }

  const health = await request(port, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body, 'ok 0 rooms');

  for (const p of [
    '/js', '/js/', '/nope.html', '/../server.mjs', '/%2e%2e/server.mjs', '/..%2fserver.mjs', '/js/..%2f..%2fserver.mjs',
    '/js/%2e%2e%2f%2e%2e%2fserver.mjs', '/js/..%5c..%5cserver.mjs', '/%00', '/index.html%00.js', '/.gitignore',
    '/js/.hidden.js', '/%E0%A4%A', '/js//shared/units.js', '/../package.json', '/..%2fpackage.json', '/ws',
  ]) {
    const r = await request(port, p);
    assert.equal(r.status, 404, p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
  }
});

test('vendor routes serve three.js with ETag caching and jail traversal (also encoded)', async (t) => {
  const { port } = await setup(t);
  const mod = await request(port, '/vendor/three/three.module.js');
  assert.equal(mod.status, 200);
  assert.equal(mod.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(mod.headers['cache-control'], 'public, max-age=3600');
  assert.equal(mod.headers['x-content-type-options'], 'nosniff');
  assert.ok(mod.headers.etag);
  assert.match(mod.body, /from '\.\/three\.core\.js'/);
  const cached = await request(port, '/vendor/three/three.module.js', { headers: { 'If-None-Match': mod.headers.etag } });
  assert.equal(cached.status, 304);

  assert.equal((await request(port, '/vendor/three/three.core.js')).status, 200);
  const addon = await request(port, '/vendor/three-addons/geometries/RoundedBoxGeometry.js');
  assert.equal(addon.status, 200);
  assert.equal(addon.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await request(port, '/vendor/three-addons/utils/BufferGeometryUtils.js', { method: 'HEAD' })).status, 200);

  for (const p of [
    '/vendor/three/', '/vendor/three', '/vendor/three/nope.js', '/vendor/three/three.cjs',
    '/vendor/three/../package.json', '/vendor/three/..%2fpackage.json', '/vendor/three/%2e%2e/package.json',
    '/vendor/three/%2e%2e%2fpackage.json', '/vendor/three/..%5cpackage.json', '/vendor/three/%2E%2E%2F%2E%2E%2Fserver.mjs',
    '/vendor/three-addons/..%2f..%2fpackage.json', '/vendor/three-addons/..%2f..%2f..%2f..%2fserver.mjs',
    '/vendor/three-addons/%2e%2e%2f%2e%2e%2fsrc%2fThree.js', '/vendor/three-addons/%00.js', '/vendor/three-addons/.x.js',
    '/vendor/three/..%252fpackage.json', '/vendor/package.json', '/vendor/three-addons//utils/BufferGeometryUtils.js',
  ]) {
    assert.equal((await request(port, p)).status, 404, p);
  }
});

// ---------------------------------------------------------------------------------------------
// WebSocket hardening

test('hello, then garbage frames are ignored without closing the socket', async (t) => {
  const env = await setup(t);
  const c = await env.client();
  assert.match(c.hello.id, /^p\d+$/);
  assert.deepEqual(c.hello.unitTypes, UNIT_TYPES);
  assert.equal(c.hello.units, undefined);
  for (const f of ['not json', 'null', '[1,2]', '"str"', '{"t":5}', '{"t":"__proto__"}', '{"t":"constructor"}', '{"t":"toString"}', '{}']) {
    c.send(f);
  }
  c.ws.send(new Uint8Array([1, 2, 3]));
  c.send({ t: 'create', name: 'Alpha' });
  const m = await c.next(is('room'));
  assert.equal(m.room.players[0].name, 'Alpha');
  assert.equal(c.ws.readyState, 1);
});

test('a 5 KB frame closes only the sender; the server keeps serving everyone else', async (t) => {
  const env = await setup(t);
  const { host, code } = await env.room('Alpha');
  const bad = await env.join(code, 'Mallory');
  await host.next(roomWhere((r) => r.players.length === 2));
  bad.send({ t: 'chat', text: 'x'.repeat(5000) });
  assert.equal(await bad.closed, 1009);
  await host.next(isChat('Mallory left the battle.'));
  assert.equal((await request(env.port, '/health')).status, 200);
  await sleep(450);
  host.send({ t: 'chat', text: 'still here' });
  await host.next(isChat('still here'));
  const fresh = await env.client();
  assert.ok(fresh.hello.id);
});

test('prototype keys and bad enums are rejected (unit, team, suit, settings)', async (t) => {
  const env = await setup(t);
  const { host } = await env.room('Alpha');
  for (const unit of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 7, null, ['tank']]) {
    host.send({ t: 'unit', unit });
  }
  host.send({ t: 'team', team: 'constructor' });
  host.send({ t: 'team', team: '__proto__' });
  host.send({ t: 'suit', suit: 'constructor' });
  host.send({ t: 'settings', botsPerTeam: '__proto__', minutes: 'constructor' });
  host.send({ t: 'unit', unit: 'jeep' });
  const m = await host.next(roomWhere((r) => r.players[0].unit === 'jeep'));
  assert.equal(m.room.botsPerTeam, 4);
  assert.equal(m.room.minutes, 5);
  for (const r of host.all.filter(is('room'))) {
    for (const p of r.room.players) {
      assert.ok(UNIT_TYPES.includes(p.unit), p.unit);
      assert.ok(TEAMS.includes(p.team), p.team);
    }
  }
  // In a battle the unit goes to setNextType only when it is a real unit type.
  host.send({ t: 'settings', botsPerTeam: 0 });
  await host.next(roomWhere((r) => r.botsPerTeam === 0));
  const { match } = await startAndGo(env, host);
  assert.equal(match.opts.players[0].unit, 'jeep');
  host.send({ t: 'unit', unit: 'constructor' });
  host.send({ t: 'unit', unit: 'heli' });
  await host.next(roomWhere((r) => r.players[0].unit === 'heli'));
  assert.deepEqual(match.nextTypes, [[host.hello.id, 'heli']]);
  assert.equal(env.logs.length, 0, env.logs.join('\n'));
});

test('token buckets close floods with 1008 (messages and inputs separately)', async (t) => {
  const env = await setup(t);
  const chatty = await env.client();
  for (let i = 0; i < 40; i++) chatty.send({ t: 'ready', ready: i % 2 === 0 });
  assert.equal(await chatty.closed, 1008);

  const flooder = await env.client();
  for (let i = 0; i < 300; i++) flooder.send({ t: 'input', inputs: [] });
  assert.equal(await flooder.closed, 1008);

  // 100 inputs fit in the input burst and do not touch the message bucket.
  const fine = await env.client();
  for (let i = 0; i < 100; i++) fine.send({ t: 'input', inputs: [] });
  fine.send({ t: 'create', name: 'Fine' });
  await fine.next(is('room'));
  assert.equal(fine.ws.readyState, 1);
  assert.equal((await request(env.port, '/health')).status, 200);
});

test('Origin must match the Host when present; other upgrade paths are refused', async (t) => {
  const env = await setup(t, { allowedOrigins: ['https://game.example'] });
  const evil = await rawUpgrade(env.port, '/ws', { Origin: 'http://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal((await rawUpgrade(env.port, '/ws', { Origin: 'null' })).status, 403);
  assert.equal((await rawUpgrade(env.port, '/other')).status, 404);
  for (const headers of [{ Origin: `http://127.0.0.1:${env.port}` }, {}, { Origin: 'https://game.example' }]) {
    const ok = await rawUpgrade(env.port, '/ws', headers);
    assert.equal(ok.status, 101, JSON.stringify(headers));
    ok.socket.destroy();
  }
});

test('connections per IP are capped (X-Forwarded-For only when trusted)', async (t) => {
  const env = await setup(t, { maxPerIp: 2, trustProxy: false });
  const a = await rawUpgrade(env.port);
  const b = await rawUpgrade(env.port, '/ws', { 'X-Forwarded-For': '10.0.0.1' }); // spoofed: ignored
  assert.equal(a.status, 101);
  assert.equal(b.status, 101);
  assert.equal((await rawUpgrade(env.port)).status, 429);
  a.socket.destroy();
  await sleep(50);
  const c = await rawUpgrade(env.port);
  assert.equal(c.status, 101);
  b.socket.destroy();
  c.socket.destroy();

  // 'auto' (the default off Render): a loopback peer is a local proxy, so its header counts.
  const proxied = await setup(t, { maxPerIp: 1 });
  const p1 = await rawUpgrade(proxied.port, '/ws', { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' });
  const p2 = await rawUpgrade(proxied.port, '/ws', { 'X-Forwarded-For': '1.2.3.4' });
  const p3 = await rawUpgrade(proxied.port, '/ws', { 'X-Forwarded-For': '5.6.7.8' });
  assert.deepEqual([p1.status, p2.status, p3.status], [101, 429, 101]);
  for (const x of [p1, p3]) x.socket.destroy();
});

test('heartbeat terminates a socket that never answers pings', async (t) => {
  const env = await setup(t, { heartbeatMs: 60 });
  const { status, socket } = await rawUpgrade(env.port);
  assert.equal(status, 101);
  socket.on('error', () => {});
  socket.resume();
  await new Promise((resolve) => socket.once('close', resolve));
  // A real client answers pings automatically and stays connected.
  const c = await env.client();
  await sleep(250);
  assert.equal(c.ws.readyState, 1);
});

// ---------------------------------------------------------------------------------------------
// Lobby

test('lobby flow: create, join, teams, ready, settings, suit, chat, names, leave', async (t) => {
  const env = await setup(t);
  const a = await env.client();
  a.send({ t: 'create', name: '  Alpha  ', suit: { camo: 'desert', skin: '#123456', evil: '<x>' } });
  const first = (await a.next(is('room'))).room;
  assert.match(first.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(first.hostId, a.hello.id);
  assert.equal(first.phase, 'lobby');
  assert.equal(first.botsPerTeam, 4);
  assert.equal(first.minutes, 5);
  assert.equal(first.winner, null);
  assert.deepEqual(first.roster, []);
  const me = first.players[0];
  assert.deepEqual([me.id, me.name, me.team, me.unit, me.ready], [a.hello.id, 'Alpha', 'def', 'tank', false]);
  assert.equal(me.suit.camo, 'desert');
  assert.equal(me.suit.skin, '#123456');
  assert.equal(me.suit.evil, undefined);

  const lost = await env.client();
  lost.send({ t: 'join', code: 'ZZZZZ', name: 'Lost' });
  assert.match((await lost.next(is('error'))).msg, /No lobby/);

  // Lower case and spaces in the code are fine; a duplicate name gets a suffix; teams balance.
  const b = await env.client();
  b.send({ t: 'join', code: ` ${first.code.toLowerCase()} `, name: 'alpha' });
  const joined = (await b.next(is('room'))).room;
  const bp = joined.players.find((p) => p.id === b.hello.id);
  assert.equal(bp.name, 'alpha 2');
  assert.equal(bp.team, 'atk');
  assert.equal(bp.suit, null);
  await a.next(isChat('alpha 2 joined the Attackers.'));

  // Names: allow-list, 16 code points, trimmed after the cut; empty falls back.
  const c = await env.client();
  c.send({ t: 'join', code: first.code, name: '<script>x</script>  \u202eabc' });
  assert.equal((await c.next(is('room'))).room.players.at(-1).name, 'scriptxscript ab');
  const d = await env.client();
  d.send({ t: 'join', code: first.code, name: '\u{1F600}\u{1F600}' });
  assert.match((await d.next(is('room'))).room.players.at(-1).name, /^Soldier\d{3}$/);
  d.send({ t: 'leave' });
  c.send({ t: 'leave' });
  await a.next(roomWhere((r) => r.players.length === 2));

  b.send({ t: 'ready', ready: true });
  await a.next(roomWhere((r) => r.players[1].ready === true));
  b.send({ t: 'team', team: 'def' });
  const switched = await a.next(roomWhere((r) => r.players[1].team === 'def'));
  assert.equal(switched.room.players[1].ready, false, 'switching team clears ready');

  b.send({ t: 'settings', botsPerTeam: 1, minutes: 3 }); // not the host
  b.send({ t: 'start' });
  a.send({ t: 'settings', botsPerTeam: 2, minutes: 3 });
  let r = (await a.next(roomWhere((x) => x.botsPerTeam === 2))).room;
  assert.equal(r.minutes, 3);
  a.send({ t: 'settings', botsPerTeam: 99, minutes: 4 });
  r = (await a.next(roomWhere((x) => x.botsPerTeam === 15))).room;
  assert.equal(r.minutes, 3);
  a.send({ t: 'settings', botsPerTeam: 1.5, minutes: '8' });
  a.send({ t: 'suit', suit: { camo: 'urban', paintVehicles: true, patch: 'red' } });
  const suited = (await a.next(roomWhere((x) => x.players[0].suit.camo === 'urban'))).room;
  assert.equal(suited.botsPerTeam, 15);
  assert.equal(suited.minutes, 3);
  assert.equal(suited.players[0].suit.paintVehicles, true);
  assert.equal(suited.players[0].suit.patch, '#3d8bff');
  assert.equal(env.instances.length, 0, 'non-host start ignored');

  a.send({ t: 'chat', text: '  hi <b>\u0007there\u202e  ' });
  for (const cl of [a, b]) {
    const m = await cl.next(is('chat', (x) => x.from === 'Alpha'));
    assert.deepEqual(m, { t: 'chat', from: 'Alpha', team: 'def', text: 'hi <b> there' });
  }
  a.send({ t: 'chat', text: 'too fast' });
  a.send({ t: 'chat', text: '   ' });
  await sleep(450);
  a.send({ t: 'chat', text: 'y'.repeat(300) });
  const long = await b.next(is('chat', (x) => x.from === 'Alpha'));
  assert.equal(long.text, 'y'.repeat(140));
  assert.equal(b.count(isChat('too fast')), 0);

  b.send({ t: 'leave' });
  await a.next(isChat('alpha 2 left the battle.'));
  assert.equal((await a.next(roomWhere((x) => x.players.length === 1))).room.hostId, a.hello.id);
  b.send({ t: 'create', name: 'Bravo' });
  const own = (await b.next(roomWhere((x) => x.players[0].name === 'Bravo'))).room;
  assert.notEqual(own.code, first.code);
  assert.equal((await request(env.port, '/health')).body, 'ok 2 rooms');
});

test('host migration: the oldest remaining player becomes host', async (t) => {
  const env = await setup(t);
  const { host: a, code } = await env.room('Alpha');
  const b = await env.join(code, 'Bravo');
  const c = await env.join(code, 'Charlie');
  a.ws.close();
  await c.next(isChat('Alpha left the battle.'));
  await c.next(isChat('Bravo is now the host.'));
  const r = (await c.next(roomWhere((x) => x.players.length === 2))).room;
  assert.equal(r.hostId, b.hello.id);
  c.send({ t: 'settings', minutes: 12 });
  b.send({ t: 'settings', minutes: 8 });
  assert.equal((await c.next(roomWhere((x) => x.minutes !== 5))).room.minutes, 8);
  b.ws.close();
  await c.next(isChat('Charlie is now the host.'));
  assert.equal((await c.next(roomWhere((x) => x.players.length === 1))).room.hostId, c.hello.id);
  c.ws.close();
  await c.closed;
  await sleep(50);
  assert.equal((await request(env.port, '/health')).body, 'ok 0 rooms');
});

// ---------------------------------------------------------------------------------------------
// Match lifecycle

test('start / loaded / go / input / snap gating', async (t) => {
  const env = await setup(t, { loadTimeoutSeconds: 10 });
  const { host: a, code } = await env.room('Alpha');
  const b = await env.join(code, 'Bravo');
  a.send({ t: 'settings', botsPerTeam: 1 });
  await b.next(roomWhere((r) => r.botsPerTeam === 1));

  a.send({ t: 'start' });
  const sa = await a.next(is('start'));
  const sb = await b.next(is('start'));
  const match = env.instances[0];
  assert.equal(env.instances.length, 1);
  assert.deepEqual(match.opts.players.map((p) => [p.id, p.team, p.unit]), [[a.hello.id, 'def', 'tank'], [b.hello.id, 'atk', 'tank']]);
  assert.equal(match.opts.botsPerTeam, 1);
  assert.equal(match.opts.minutes, 5);
  assert.ok(Number.isInteger(sa.seed) && sa.seed > 0);
  assert.equal(match.opts.seed, sa.seed);
  assert.equal(sa.timeOfDay, TIMES[sa.seed % 4]);
  assert.equal(match.opts.timeOfDay, sa.timeOfDay);
  assert.deepEqual(sa.world, match.world);
  assert.equal(sa.minutes, 5);
  assert.ok(Number.isInteger(sa.matchId));
  assert.equal(sb.matchId, sa.matchId);
  assert.equal(sa.you, match.byId(a.hello.id).uid);
  assert.equal(sb.you, match.byId(b.hello.id).uid);
  assert.notEqual(sa.you, sb.you);

  const playing = (await b.next(roomWhere((r) => r.phase === 'playing'))).room;
  assert.equal(playing.roster.length, 4);
  assert.deepEqual(playing.roster.find((x) => x.id === b.hello.id), { id: b.hello.id, uid: sb.you, name: 'Bravo', team: 'atk', bot: false, suit: null });

  // Lobby-only messages are ignored now; a second start does nothing.
  a.send({ t: 'start' });
  a.send({ t: 'team', team: 'atk' });
  a.send({ t: 'input', inputs: [input(1)] });
  a.send({ t: 'loaded' });
  await sleep(200);
  assert.equal(match.phase, 'warmup', 'go waits for every human');
  assert.equal(a.count(is('go')), 0);
  assert.equal(a.count(is('snap')), 0);
  assert.equal(match.inputs.length, 0, 'inputs before go are dropped');
  assert.equal(env.instances.length, 1);

  b.send({ t: 'loaded' });
  assert.deepEqual(await a.next(is('go')), { t: 'go', countdown: 3 });
  assert.deepEqual(await b.next(is('go')), { t: 'go', countdown: 3 });
  assert.equal(match.phase, 'countdown');
  const s1 = await a.next(is('snap'));
  const s2 = await a.next(is('snap'));
  assert.ok(s2.n > s1.n && s2.n % 2 === 0, `${s1.n} ${s2.n}`);
  await b.next(is('snap'));

  a.send({ t: 'input', inputs: [input(1), input(2)] });
  a.send({ t: 'input', inputs: Array.from({ length: 20 }, (_, i) => input(10 + i)) });
  a.send({ t: 'input', inputs: 'nope' });
  a.send({ t: 'input', inputs: [] });
  a.send({ t: 'input', inputs: { length: 3 } });
  b.send({ t: 'loaded' }); // a second `loaded` must not resend `go`
  await sleep(150);
  assert.equal(match.inputs.length, 2);
  assert.deepEqual(match.inputs[0], [a.hello.id, [input(1), input(2)]]);
  assert.deepEqual(match.inputs[1][1].map((x) => x.seq), [22, 23, 24, 25, 26, 27, 28, 29], 'newest 8 kept');
  assert.equal(b.count(is('go')), 1);
  const rooms = a.all.filter(is('room'));
  assert.equal(rooms.at(-1).room.players[0].team, 'def');
  assert.ok(match.steps > 10);
  assert.equal(env.logs.length, 0, env.logs.join('\n'));
});

test('load timeout: the battle starts without a slow client, who gets go and snaps once loaded', async (t) => {
  const env = await setup(t, { loadTimeoutSeconds: 0.3 });
  const { host: a, code } = await env.room('Alpha');
  const b = await env.join(code, 'Bravo');
  a.send({ t: 'start' });
  const sa = await a.next(is('start'));
  await b.next(is('start'));
  a.send({ t: 'loaded' });
  b.send({ t: 'loaded', matchId: sa.matchId + 100 }); // stale: ignored
  await a.next(is('go'), 2000);
  await a.next(is('snap'));
  await sleep(200);
  assert.equal(b.count(is('go')), 0);
  assert.equal(b.count(is('snap')), 0, 'no snapshots before loaded');
  b.send({ t: 'input', inputs: [input(1)] });
  await sleep(50);
  assert.equal(env.instances[0].inputs.length, 0, 'inputs need loaded');
  b.send({ t: 'loaded', matchId: sa.matchId });
  const go = await b.next(is('go'));
  assert.ok(go.countdown >= 0 && go.countdown < 3, String(go.countdown));
  await b.next(is('snap'));
});

test('late join during a battle and during the results; over is sent once; back to the lobby', async (t) => {
  const env = await setup(t, { resultsSeconds: 0.4 });
  const { host: a, code } = await env.room('Alpha');
  a.send({ t: 'ready', ready: true });
  a.send({ t: 'settings', botsPerTeam: 0 });
  await a.next(roomWhere((r) => r.botsPerTeam === 0 && r.players[0].ready));
  const { match } = await startAndGo(env, a);
  a.drain();

  const c = await env.client();
  c.send({ t: 'join', code, name: 'Charlie' });
  const r = (await c.next(is('room'))).room;
  assert.equal(r.phase, 'playing');
  assert.ok(r.roster.some((x) => x.id === c.hello.id));
  await a.next(isChat('Charlie joined the Attackers.'));
  const start = await c.next(is('start'));
  assert.equal(start.you, match.byId(c.hello.id).uid);
  assert.deepEqual(start.world, match.world);
  await sleep(100);
  assert.equal(c.count(is('snap')), 0);
  c.send({ t: 'loaded' });
  await c.next(is('go'));
  await c.next(is('snap'));

  match.end('def', 'timeout');
  const over = await a.next(is('over'));
  assert.equal(over.winner, 'def');
  assert.equal(over.reason, 'timeout');
  assert.equal(over.board.length, 2);
  await c.next(is('over'));
  assert.equal((await a.next(roomWhere((x) => x.phase === 'over'))).room.winner, 'def');

  const d = await env.client();
  d.send({ t: 'join', code, name: 'Delta' });
  assert.equal((await d.next(is('room'))).room.phase, 'over');
  assert.equal((await d.next(is('over'))).winner, 'def');
  assert.equal(d.count(is('start')), 0);
  assert.equal(match.byId(d.hello.id), null, 'no unit for a results-screen joiner');

  const lobby = (await a.next(roomWhere((x) => x.phase === 'lobby'), 2000)).room;
  assert.equal(lobby.winner, null);
  assert.deepEqual(lobby.roster, []);
  assert.ok(lobby.players.every((p) => p.ready === false));
  assert.equal(a.count(is('over')), 1);
  assert.equal(c.count(is('over')), 1);
  const steps = match.steps;
  await sleep(100);
  assert.equal(match.steps, steps, 'the loop stopped');
});

test('a stub that ends itself: final snap, over once, then two sequential matches', async (t) => {
  const env = await setup(t, { resultsSeconds: 0.2 });
  const { host: a, code } = await env.room('Alpha');
  const b = await env.join(code, 'Bravo');
  for (let round = 1; round <= 2; round++) {
    a.drain();
    b.drain();
    a.send({ t: 'start' });
    const sa = await a.next(is('start'));
    const match = env.instances.at(-1);
    match.endAfter = 25;
    await b.next(is('start'));
    a.send({ t: 'loaded' });
    b.send({ t: 'loaded' });
    await a.next(is('go'));
    const over = await b.next(is('over'));
    assert.equal(over.winner, 'atk');
    assert.equal(over.reason, 'destroyed');
    assert.ok(b.all.some(is('snap', (s) => s.n === 25)), 'final snapshot before over');
    await a.next(roomWhere((r) => r.phase === 'over' && r.winner === 'atk'));
    await a.next(roomWhere((r) => r.phase === 'lobby' && r.winner === null));
    assert.equal(env.instances.length, round);
    assert.equal(sa.matchId, round);
    assert.equal(a.count(is('over')), round);
  }
  assert.equal(env.logs.length, 0, env.logs.join('\n'));
});

test('leaving mid-battle removes the unit and can unblock the go', async (t) => {
  const env = await setup(t, { loadTimeoutSeconds: 10 });
  const { host: a, code } = await env.room('Alpha');
  const b = await env.join(code, 'Bravo');
  a.send({ t: 'start' });
  await a.next(is('start'));
  a.send({ t: 'loaded' });
  await sleep(50);
  b.send({ t: 'leave' });
  await a.next(is('go'));
  assert.deepEqual(env.instances[0].removed, [b.hello.id]);
  await a.next(is('snap'));
});

test('bots never share a name with a human', async (t) => {
  const env = await setup(t);
  const { host: a } = await env.room('Viper');
  a.send({ t: 'settings', botsPerTeam: 1 });
  await a.next(roomWhere((r) => r.botsPerTeam === 1));
  a.send({ t: 'start' });
  const r = (await a.next(roomWhere((x) => x.phase === 'playing'))).room;
  const names = r.roster.map((x) => x.name).sort();
  assert.deepEqual(names, ['Viper', 'Viper 2', 'Viper 3']);
  assert.equal(r.roster.find((x) => x.id === a.hello.id).name, 'Viper');
});

test('a tick exception ends only that room; other rooms keep playing', async (t) => {
  const env = await setup(t);
  const { host: ok } = await env.room('Okay');
  ok.send({ t: 'settings', botsPerTeam: 0 });
  await ok.next(roomWhere((r) => r.botsPerTeam === 0));
  await startAndGo(env, ok);
  const mark = ok.all.length;

  const { host: crash } = await env.room('Crash');
  crash.send({ t: 'start' });
  await crash.next(is('start'));
  crash.send({ t: 'loaded' });
  await crash.next(is('go'));
  await crash.next(isChat('The battle ended unexpectedly.'));
  const back = (await crash.next(roomWhere((r) => r.phase === 'lobby'))).room;
  assert.deepEqual(back.roster, []);
  assert.ok(env.logs.some((l) => l.includes('tick boom')));

  const before = ok.count(is('snap'));
  await sleep(150);
  assert.ok(ok.count(is('snap')) > before, 'the healthy room still streams');
  assert.equal(ok.all.slice(mark).filter(is('room', (m) => m.room.phase === 'lobby')).length, 0);
  assert.equal((await request(env.port, '/health')).status, 200);
});

test('the real Match: start carries the city, go, then snapshots with our unit', async (t) => {
  const app = createServer({ port: 0, host: '127.0.0.1', log: false });
  t.after(() => app.close());
  const { port } = await app.ready;
  const c = new Client(`ws://127.0.0.1:${port}/ws`);
  t.after(() => c.close());
  await c.opened;
  c.send({ t: 'create', name: 'Solo', suit: { camo: 'urban' } });
  await c.next(is('room'));
  c.send({ t: 'settings', botsPerTeam: 0 });
  c.send({ t: 'unit', unit: 'jeep' });
  await c.next(roomWhere((r) => r.botsPerTeam === 0 && r.players[0].unit === 'jeep'));
  c.send({ t: 'start' });
  const start = await c.next(is('start'), 10000);
  assert.ok(start.world && start.world.hq && Array.isArray(start.world.buildings));
  assert.equal(start.world.timeOfDay, start.timeOfDay);
  assert.equal(start.you, 1);
  const r = (await c.next(roomWhere((x) => x.phase === 'playing'))).room;
  assert.deepEqual(r.roster.map((x) => [x.uid, x.name, x.bot, x.suit.camo]), [[1, 'Solo', false, 'urban']]);
  c.send({ t: 'loaded', matchId: start.matchId });
  assert.deepEqual(await c.next(is('go')), { t: 'go', countdown: 3 });
  c.send({ t: 'input', inputs: [input(1), input(2)] });
  const snap = await c.next(is('snap', (s) => s.u.length === 1 && s.u[0][U.ACK] === 2), 3000);
  assert.equal(snap.u[0][U.ID], 1);
  assert.ok(snap.cd > 0 && snap.cd <= 3);
  assert.equal(snap.hqMax, start.world.hq.hp);
});

test('a handler exception ends only that room', async (t) => {
  const env = await setup(t);
  const { host: a } = await env.room('Alpha');
  a.send({ t: 'settings', botsPerTeam: 0 });
  await a.next(roomWhere((r) => r.botsPerTeam === 0));
  await startAndGo(env, a);
  a.send({ t: 'input', inputs: [input(1, { boom: true })] });
  await a.next(isChat('The battle ended unexpectedly.'));
  await a.next(roomWhere((r) => r.phase === 'lobby'));
  assert.ok(env.logs.some((l) => l.includes('handler boom')));
  // The room is usable again.
  a.send({ t: 'start' });
  await a.next(is('start'));
  assert.equal(env.instances.length, 2);
});

test('matchSeconds (battle length) is a test-only knob: ignored unless NODE_ENV=test', async (t) => {
  const env = await setup(t, { matchSeconds: 7 });
  const { host } = await env.room('Alpha');
  host.send({ t: 'start' });
  await host.next(is('start'));
  const match = env.instances.at(-1);
  if (process.env.NODE_ENV === 'test') assert.equal(match.duration, 7);
  else assert.equal(match.duration, undefined, 'a production server must never shorten battles');
  assert.equal(env.logs.length, 0, env.logs.join('\n'));
});
