import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, TICK_RATE, UNITS, WALLS, MAP } from '../game.mjs';

test('a bots-only battle plays out: units fight, die, respawn and hit the HQ', () => {
  const m = new Match({ players: [], botsPerTeam: 8, minutes: 3 });
  const dt = 1 / TICK_RATE;
  let kills = 0;
  for (let i = 0; i < TICK_RATE * 185 && !m.winner; i++) {
    m.step(dt);
    kills += m.snapshot().events.filter((e) => e[0] === 'k').length;
  }
  assert.ok(kills > 0, 'someone should get destroyed');
  assert.ok(m.winner === 'atk' || m.winner === 'def');
  for (const u of m.units.values()) {
    assert.ok(u.x >= 0 && u.x <= MAP.w && u.y >= 0 && u.y <= MAP.h, `${u.id} stays on the map`);
    if (!UNITS[u.type].flying && u.alive) {
      const inside = WALLS.some((w) => u.x > w.x && u.x < w.x + w.w && u.y > w.y && u.y < w.y + w.h);
      assert.ok(!inside, `${u.id} is not inside a wall`);
    }
  }
});

test('players move, shoot and can switch units on respawn', () => {
  const m = new Match({ players: [{ id: 'p1', name: 'A', team: 'atk', unit: 'soldier' }], botsPerTeam: 0, minutes: 5 });
  const p = m.units.get('p1');
  const x0 = p.x;
  m.setInput('p1', { right: true, fire: true, aim: 0 });
  for (let i = 0; i < 15; i++) m.step(1 / TICK_RATE);
  assert.ok(p.x > x0, 'moved right');
  assert.ok(m.projectiles.length > 0, 'fired bullets');
  m.setNextType('p1', 'drone');
  m.damage(p, 9999, 'nobody', 'test');
  assert.equal(p.alive, false);
  for (let i = 0; i < TICK_RATE * 6; i++) m.step(1 / TICK_RATE);
  assert.equal(p.alive, true);
  assert.equal(p.type, 'drone');
});

test('the attackers win when the HQ falls and the defenders win on time', () => {
  const a = new Match({ players: [], botsPerTeam: 0, minutes: 3 });
  a.damageHq(1e9);
  a.step(1 / TICK_RATE);
  assert.equal(a.winner, 'atk');
  const d = new Match({ players: [], botsPerTeam: 0, minutes: 3 });
  for (let i = 0; i < TICK_RATE * 181; i++) d.step(1 / TICK_RATE);
  assert.equal(d.winner, 'def');
});

test('a full army of AI tankers has a unique name for every bot', () => {
  const m = new Match({ players: [], botsPerTeam: 15, minutes: 5 });
  const names = [...m.units.values()].map((u) => u.name);
  assert.equal(names.length, 30);
  assert.equal(new Set(names).size, 30);
  assert.ok(names.every(Boolean));
});
