import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../city.mjs';
import { createWorldIndex, newUnitState } from '../public/js/shared/physics.js';
import { UNITS, UNIT_TYPES, U, U_LEN, FLAG } from '../public/js/shared/units.js';
import {
  TICK_DT, spawnState, simulateUnit, loftPitch, aimFor, falloffFactor, splashFactor, hitscanDamage, blastDamage,
  impactDamage, currentSpread, primarySlot, altSlot, projectileLife, PROJ_GRAVITY,
} from '../public/js/shared/rules.js';
import {
  packUnit, decodeRow, rowToState, sanitizeInput, packProjectile, decodeProjectile, reloadProgress,
} from '../public/js/shared/net.js';

const world = generateCity(1);
const index = createWorldIndex(world);

function fakeUnit(type, extra = {}) {
  const def = UNITS[type];
  const sp = world.spawns.def;
  return {
    uid: 7, type, team: 'def', s: spawnState(type, sp.x + sp.w / 2, sp.z + sp.d / 2, 0.3), hp: def.hp, alive: true,
    respawnLeft: 0, kills: 2, deaths: 1, score: 150, sel: 0, grenades: 2, ack: 41, lockTarget: 0,
    weapons: [
      { mag: def.weapons[0].mag, reserve: def.weapons[0].reserve, reloadLeft: 0 },
      { mag: def.weapons[1].mag, reserve: def.weapons[1].reserve, reloadLeft: 0.4 },
    ],
    ...extra,
  };
}

const input = (seq, over = {}) => ({
  seq, mx: 0, mz: 1, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false, alt: false,
  reload: false, grenade: false, weapon: 0, look: [0.3, 0], aim: null, ...over,
});

test('U layout has RESERVE2 and 32 columns', () => {
  assert.equal(U_LEN, 32);
  assert.equal(U.RESERVE2, 31);
});

test('packUnit / decodeRow round trip keeps every field', () => {
  const u = fakeUnit('tank', { missileWarn: true, firing: true });
  const r = packUnit(u);
  assert.equal(r.length, U_LEN);
  const d = decodeRow(r);
  assert.equal(d.uid, 7);
  assert.equal(d.type, 'tank');
  assert.equal(d.team, 'def');
  assert.equal(d.hp, UNITS.tank.hp);
  assert.ok(d.alive && d.onGround && d.missileWarn && d.firing);
  assert.equal(d.reserve2, -1);
  assert.equal(d.ack, 41);
  assert.equal(d.reload2, 0.4);
  assert.equal(JSON.parse(JSON.stringify(r)).length, U_LEN);
});

test('flags and respawn: dead units carry the respawn countdown', () => {
  const u = fakeUnit('jeep', { alive: false, respawnLeft: 3.26 });
  const r = packUnit(u);
  assert.equal(r[U.FLAGS] & FLAG.ALIVE, 0);
  assert.equal(r[U.RESPAWN], 3.3);
});

test('all seven types: restoring from a quantised row and replaying inputs stays within 5 cm', () => {
  for (const type of UNIT_TYPES) {
    const a = spawnState(type, 100, 240, 0.4);
    const b = spawnState(type, 100, 240, 0.4);
    let seq = 0;
    for (let i = 0; i < 240; i++) {
      const inp = input(++seq, { mx: Math.sin(i / 20), mz: type === 'jet' ? 0.2 : 1, look: [0.4 + i * 0.002, 0.1], aim: [300, 5, 240] });
      simulateUnit(a, inp, TICK_DT, index);
    }
    const row = packUnit({ ...fakeUnit(type), s: a });
    // Restore the second copy from the row and play 120 more ticks on both.
    const restored = rowToState(JSON.parse(JSON.stringify(row)));
    for (let i = 0; i < 120; i++) {
      const inp = input(++seq, { mx: Math.cos(i / 15), mz: type === 'jet' ? 0.1 : 0.8, look: [0.8, -0.1], aim: [320, 4, 250] });
      simulateUnit(a, inp, TICK_DT, index);
      simulateUnit(restored, inp, TICK_DT, index);
    }
    const err = Math.hypot(a.x - restored.x, a.y - restored.y, a.z - restored.z);
    assert.ok(err < 0.05, `${type}: ${err}`);
  }
});

test('spawnState: a jet survives its first second, others start on the ground', () => {
  const s = spawnState('jet', 300, 240, 0);
  let crashed = false;
  for (let i = 0; i < 60; i++) crashed ||= simulateUnit(s, input(i, { mz: 0 }), TICK_DT, index).crashed;
  assert.equal(crashed, false);
  assert.ok(s.y > 30);
  assert.equal(spawnState('tank', 10, 10, 0).y, 0);
  assert.equal(spawnState('drone', 10, 10, 0).y, UNITS.drone.minAlt);
});

test('simulateUnit is deterministic', () => {
  const run = () => {
    const s = spawnState('heli', 200, 200, 1);
    for (let i = 0; i < 300; i++) simulateUnit(s, input(i, { mx: Math.sin(i / 30), up: i < 100, aim: [250, 10, 210] }), TICK_DT, index);
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});

test('ground turret slews toward the aim point, soldier aim follows look', () => {
  const t = spawnState('tank', 200, 240, 0);
  for (let i = 0; i < 300; i++) simulateUnit(t, input(i, { mz: 0, aim: [200, 2, 340] }), TICK_DT, index);
  assert.ok(Math.abs(t.aimYaw - Math.PI / 2) < 0.05, `aimYaw ${t.aimYaw}`);
  const sd = spawnState('soldier', 200, 240, 0);
  simulateUnit(sd, input(1, { mz: 0, look: [1.0, 0.2] }), TICK_DT, index);
  assert.ok(Math.abs(sd.aimYaw - 1.0) < 1e-6 && Math.abs(sd.aimPitch - 0.2) < 1e-6);
});

test('loftPitch: low arc lands on the target, out of range falls back to 45 degrees', () => {
  const v = 120;
  const g = PROJ_GRAVITY.artillery;
  const d = 400;
  const th = loftPitch(d, 0, v, g, 0.2, 1.2);
  const range = (v * v * Math.sin(2 * th)) / g;
  assert.ok(Math.abs(range - d) < 1, `range ${range}`);
  assert.ok(Math.abs(loftPitch(5000, 0, v, g, 0.2, 1.2) - Math.PI / 4) < 1e-9);
  const s = spawnState('mlrs', 100, 240, 0);
  const [yaw, pitch] = aimFor(s, UNITS.mlrs, [500, 0, 240]);
  assert.ok(Math.abs(yaw) < 1e-6 && pitch >= 0.2 && pitch <= 1.2);
});

test('damage model: falloff, splash, armor, impact thresholds', () => {
  const m4 = UNITS.soldier.weapons[0];
  assert.equal(falloffFactor(m4, 30), 1);
  assert.ok(Math.abs(falloffFactor(m4, m4.range) - 0.7) < 1e-9);
  assert.ok(falloffFactor(m4, 190) < 1 && falloffFactor(m4, 190) > 0.7);
  assert.equal(splashFactor(0, 6), 1);
  assert.ok(Math.abs(splashFactor(6, 6)) === 0);
  assert.ok(Math.abs(splashFactor(3, 6) - 0.7) < 1e-9);
  // rifles are useless against a tank, strong against a soldier headshot
  assert.ok(hitscanDamage(m4, 10, false, 'tank') < 3);
  assert.ok(hitscanDamage(m4, 10, true, 'soldier') > 50);
  assert.equal(blastDamage(230, 7, 0, 'tank'), 230 * UNITS.tank.blastArmor);
  assert.equal(blastDamage(230, 7, 8, 'tank'), 0);
  assert.equal(impactDamage('soldier', 5), 0);
  assert.ok(impactDamage('soldier', 15) > 0);
  assert.equal(impactDamage('heli', 14), 0);
  assert.equal(impactDamage('drone', 12), 0);
  assert.equal(impactDamage('jet', 100), 0);
});

test('spread and slot helpers', () => {
  const m4 = UNITS.soldier.weapons[0];
  assert.ok(currentSpread(m4, { ads: true }) < currentSpread(m4, {}));
  assert.ok(currentSpread(m4, { moving: 1 }) > currentSpread(m4, {}));
  assert.ok(currentSpread(m4, { onGround: false }) > currentSpread(m4, { onGround: true }));
  assert.equal(primarySlot('soldier', 1), 1);
  assert.equal(primarySlot('tank', 1), 0);
  assert.equal(altSlot('tank'), 1);
  assert.equal(altSlot('soldier'), -1);
  assert.ok(Math.abs(projectileLife(UNITS.tank.weapons[0]) - 650 / 320) < 1e-9);
});

test('sanitizeInput accepts good input and rejects or clamps bad input', () => {
  assert.equal(sanitizeInput(null), null);
  assert.equal(sanitizeInput({ seq: 1.5, look: [0, 0] }), null);
  assert.equal(sanitizeInput({ seq: 1, look: [NaN, 0] }), null);
  assert.equal(sanitizeInput({ seq: 1, look: 'x' }), null);
  const ok = sanitizeInput({ seq: 5, mx: 9, mz: -9, fire: 1, ads: 'yes', look: [10, 9], aim: [1, 2, 3], weapon: 1 });
  assert.equal(ok.mx, 1);
  assert.equal(ok.mz, -1);
  assert.equal(ok.fire, true);
  assert.equal(ok.ads, false);
  assert.equal(ok.look[1], 1.5);
  assert.ok(Math.abs(ok.look[0]) <= Math.PI * 2);
  assert.deepEqual(ok.aim, [1, 2, 3]);
  assert.equal(ok.weapon, 1);
  assert.equal(sanitizeInput({ seq: 5, look: [0, 0], aim: [1e9, 0, 0] }).aim, null);
  assert.equal(sanitizeInput({ seq: 5, look: [0, 0], aim: [1, 2] }).aim, null);
});

test('projectile rows round trip', () => {
  const p = { id: 12, kind: 'missile', team: 'atk', x: 1.234, y: 5.678, z: 9.1011, vx: 1, vy: 2, vz: 3 };
  const r = packProjectile(p);
  assert.equal(r.length, 9);
  const d = decodeProjectile(r);
  assert.equal(d.kind, 'missile');
  assert.equal(d.team, 'atk');
  assert.equal(d.x, 1.23);
});

test('reloadProgress', () => {
  const w = UNITS.soldier.weapons[0];
  assert.equal(reloadProgress(0, w), null);
  assert.ok(Math.abs(reloadProgress(w.reload / 2, w) - 0.5) < 1e-9);
});

test('newUnitState alone still crashes a jet (why spawnState exists)', () => {
  const s = newUnitState('jet');
  assert.equal(simulateUnit(s, input(1), TICK_DT, index).crashed, true);
});
