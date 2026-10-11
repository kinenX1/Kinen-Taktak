import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAVITY, wrapAngle, angleDiff, dirFromAngles, anglesFromDir, createWorldIndex, newUnitState, stepUnit,
  aimAngles, slewAim, eyePosition, muzzlePosition, raycast, segmentHitsWorld, lineOfSight, overlapsSolid,
  hitTestUnit, sphereTestUnit, groundHeightAt,
} from '../public/js/shared/physics.js';
import { UNITS, UNIT_TYPES, VIEW_MODES, U, FLAG, P, PROJ_KINDS, WEAPON_KINDS, HQ_SCORE, UNIT_LIMITS } from '../public/js/shared/units.js';
import { generateCity } from '../city.mjs';

const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A small test world: one building, one wall, the HQ cylinder.
function testWorld(extra = {}) {
  return {
    map: { w: 400, d: 300 },
    buildings: [{ x: 100, z: 100, w: 20, d: 20, h: 20 }],
    walls: [{ x: 200, z: 50, w: 1, d: 30, h: 1.2 }],
    hq: { x: 300, z: 150, r: 9, h: 12, hp: 5000 },
    ...extra,
  };
}

function run(s, input, seconds, index, def = UNITS[s.type]) {
  const results = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) results.push(stepUnit(s, input, DT, def, index));
  return results;
}

// --------------------------------------------------------------------------------------------
// units.js

test('units: every type is defined with the contract fields', () => {
  assert.deepEqual(UNIT_TYPES, ['soldier', 'jeep', 'tank', 'mlrs', 'drone', 'heli', 'jet']);
  for (const type of UNIT_TYPES) {
    const d = UNITS[type];
    assert.ok(d, type);
    for (const k of ['name', 'blurb', 'kind', 'hp', 'armor', 'blastArmor', 'radius', 'height', 'hit', 'aim', 'weapons']) {
      assert.ok(d[k] !== undefined, `${type}.${k}`);
    }
    assert.ok(VIEW_MODES[type].length >= 2);
    assert.equal(d.weapons.length, 2);
    for (const w of d.weapons) {
      assert.ok(WEAPON_KINDS.includes(w.kind), `${type} ${w.name}`);
      assert.equal(typeof w.sound, 'string');
      assert.ok(w.mag > 0 && w.reload > 0 && Number.isFinite(w.muzzle));
    }
    for (const k of ['height', 'pitchMin', 'pitchMax', 'rate', 'yawLimit']) assert.ok(Number.isFinite(d.aim[k]), `${type}.aim.${k}`);
  }
  assert.equal(UNITS.tank.blastArmor, 0.8);
  assert.equal(UNITS.soldier.grenade.sound, 'grenade');
  assert.equal(U.THROTTLE, 30);
  assert.equal(FLAG.BURNING, 512);
  assert.equal(P.VZ, 8);
  assert.equal(PROJ_KINDS.length, 6);
  assert.equal(HQ_SCORE.kill, 100);
  assert.equal(UNIT_LIMITS.maxPlayers, 16);
});

test('units: hit volumes have realistic extents', () => {
  const extent = (type) => {
    const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const h of UNITS[type].hit) {
      box[0] = Math.min(box[0], h.x - h.r); box[1] = Math.max(box[1], h.x + h.r);
      box[2] = Math.min(box[2], h.y - h.r); box[3] = Math.max(box[3], h.y + h.r);
      box[4] = Math.min(box[4], h.z - h.r); box[5] = Math.max(box[5], h.z + h.r);
    }
    return { len: box[1] - box[0], top: box[3], width: box[5] - box[4], bottom: box[2] };
  };
  const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what} = ${v.toFixed(2)} not in [${lo}, ${hi}]`);
  const jeep = extent('jeep');
  within(jeep.len, 4.3, 5.2, 'jeep length'); within(jeep.width, 2.0, 2.4, 'jeep width'); within(jeep.top, 1.9, 2.3, 'jeep top');
  const tank = extent('tank');
  within(tank.len, 7.3, 8.2, 'tank length'); within(tank.width, 3.4, 3.9, 'tank width'); within(tank.top, 2.6, 3.6, 'tank top');
  const mlrs = extent('mlrs');
  within(mlrs.len, 7.8, 8.6, 'mlrs length'); within(mlrs.width, 2.5, 2.8, 'mlrs width'); within(mlrs.top, 3.0, 3.5, 'mlrs top');
  const heli = extent('heli');
  within(heli.len, 14, 16, 'heli length');
  const jet = extent('jet');
  within(jet.len, 15, 17, 'jet length'); within(jet.width, 9.5, 10.5, 'jet span');
  const drone = extent('drone');
  within(drone.len, 1.1, 1.6, 'drone size');
  for (const type of ['jeep', 'tank', 'mlrs', 'drone', 'heli', 'jet']) assert.ok(extent(type).bottom >= -0.25, `${type} below ground`);
});

// --------------------------------------------------------------------------------------------
// Angles

test('angles: wrap, diff, direction round trip and conventions', () => {
  assert.ok(near(wrapAngle(Math.PI * 3), Math.PI));
  assert.ok(near(wrapAngle(-Math.PI), Math.PI));
  assert.ok(near(wrapAngle(0.5 + Math.PI * 8), 0.5, 1e-9));
  assert.equal(wrapAngle(NaN), 0);
  assert.ok(near(angleDiff(3, -3), Math.PI * 2 - 6, 1e-9));
  assert.ok(near(angleDiff(-3, 3), 6 - Math.PI * 2, 1e-9));
  // yaw 0 = +x, yaw +pi/2 = +z (south, turning right from east), pitch up = +y.
  const d = dirFromAngles(0, 0);
  assert.deepEqual(d.map((v) => Math.round(v * 1e9) / 1e9), [1, 0, 0]);
  const s = dirFromAngles(Math.PI / 2, 0);
  assert.ok(near(s[2], 1) && near(s[0], 0));
  assert.ok(near(dirFromAngles(0, Math.PI / 2)[1], 1));
  for (const [yaw, pitch] of [[0.3, 0.2], [-2.5, -0.7], [3.0, 1.2]]) {
    const v = dirFromAngles(yaw, pitch);
    assert.ok(near(Math.hypot(...v), 1, 1e-12));
    const [y2, p2] = anglesFromDir(v[0] * 5, v[1] * 5, v[2] * 5);
    assert.ok(near(y2, yaw, 1e-9) && near(p2, pitch, 1e-9));
  }
});

// --------------------------------------------------------------------------------------------
// World queries

test('raycast: ground, building faces and roof, HQ side and top, with normals', () => {
  const index = createWorldIndex(testWorld());
  // Straight down onto open ground.
  let h = raycast(index, 50, 10, 50, 0, -1, 0, 100);
  assert.equal(h.surface, 'ground');
  assert.ok(near(h.dist, 10));
  assert.deepEqual([h.nx, h.ny, h.nz], [0, 1, 0]);
  // Into the west face of the building.
  h = raycast(index, 50, 5, 110, 1, 0, 0, 200);
  assert.equal(h.surface, 'building');
  assert.ok(near(h.dist, 50));
  assert.deepEqual([h.nx, h.ny, h.nz], [-1, 0, 0]);
  // Into the south face going north (-z).
  h = raycast(index, 110, 5, 160, 0, 0, -1, 200);
  assert.ok(near(h.dist, 40));
  assert.deepEqual([h.nx, h.ny, h.nz], [0, 0, 1]);
  // Onto the roof.
  h = raycast(index, 110, 50, 110, 0, -1, 0, 200);
  assert.equal(h.surface, 'building');
  assert.ok(near(h.dist, 30));
  assert.equal(h.ny, 1);
  // Over the roof: misses the building, reaches the ground behind it.
  const dir = [1, -0.05, 0];
  const l = Math.hypot(...dir);
  h = raycast(index, 50, 25, 110, dir[0] / l, dir[1] / l, dir[2] / l, 1000);
  assert.equal(h.surface, 'ground');
  // Max distance respected.
  assert.equal(raycast(index, 50, 5, 110, 1, 0, 0, 49), null);
  // HQ side: normal points back toward the shooter.
  h = raycast(index, 250, 5, 150, 1, 0, 0, 200);
  assert.equal(h.surface, 'hq');
  assert.ok(near(h.dist, 41));
  assert.ok(near(h.nx, -1) && near(h.nz, 0));
  // HQ roof.
  h = raycast(index, 300, 40, 150, 0, -1, 0, 200);
  assert.equal(h.surface, 'hq');
  assert.ok(near(h.dist, 28));
  assert.equal(h.ny, 1);
  // Low wall blocks a ray at waist height, not one above it.
  assert.equal(raycast(index, 190, 1, 60, 1, 0, 0, 30).surface, 'building');
  assert.equal(raycast(index, 190, 1.5, 60, 1, 0, 0, 30), null);
  // A ray along the sky never hits; a ray starting on the ground pointing up does not hit it.
  assert.equal(raycast(index, 50, 0, 50, 0, 1, 0, 1000), null);
  // Rays from outside the map still find the buildings.
  h = raycast(index, -100, 5, 110, 1, 0, 0, 1000);
  assert.ok(near(h.dist, 200));
});

test('raycast: agrees with brute force on a real city', () => {
  const world = generateCity(7);
  const index = createWorldIndex(world);
  const boxes = [...world.buildings, ...world.walls];
  let a = 12345;
  const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
  for (let k = 0; k < 400; k++) {
    const o = [rnd() * 640, 0.5 + rnd() * 60, rnd() * 480];
    const d = dirFromAngles(rnd() * 6.283, -0.6 + rnd() * 1.0);
    let best = d[1] < 0 ? -o[1] / d[1] : Infinity;
    for (const b of boxes) {
      let t0 = -Infinity;
      let t1 = Infinity;
      const lo = [b.x, 0, b.z];
      const hi = [b.x + b.w, b.h, b.z + b.d];
      let ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-12) { if (o[i] < lo[i] || o[i] > hi[i]) ok = false; continue; }
        let ta = (lo[i] - o[i]) / d[i];
        let tb = (hi[i] - o[i]) / d[i];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
      if (ok && t1 >= t0 && t1 >= 0) best = Math.min(best, Math.max(0, t0));
    }
    // Rays that end on the HQ cylinder are covered by the dedicated test above.
    const h = raycast(index, o[0], o[1], o[2], d[0], d[1], d[2], 2000);
    if (h && h.surface === 'hq') continue;
    if (best > 2000) assert.equal(h, null);
    else assert.ok(h && near(h.dist, best, 1e-6), `ray ${k}: ${h && h.dist} vs ${best}`);
  }
});

test('segmentHitsWorld / lineOfSight / overlapsSolid / groundHeightAt', () => {
  const index = createWorldIndex(testWorld());
  const t = segmentHitsWorld(index, 50, 5, 110, 150, 5, 110);
  assert.ok(near(t, 0.5));
  assert.equal(segmentHitsWorld(index, 50, 5, 50, 90, 5, 50), -1);
  assert.equal(lineOfSight(index, 50, 5, 110, 150, 5, 110), false);
  assert.equal(lineOfSight(index, 50, 25, 110, 150, 25, 110), true); // over the roof
  assert.equal(lineOfSight(index, 250, 5, 150, 350, 5, 150), false); // through the HQ
  assert.equal(lineOfSight(index, 250, 15, 150, 350, 15, 150), true); // above the HQ
  assert.equal(lineOfSight(index, 10, 2, 10, 10, 2, 10), true); // zero length
  assert.equal(overlapsSolid(index, 99.7, 110, 0.4, 0, 1.8), true);
  assert.equal(overlapsSolid(index, 99.5, 110, 0.4, 0, 1.8), false);
  assert.equal(overlapsSolid(index, 110, 110, 0.4, 21, 23), false); // above the roof
  assert.equal(overlapsSolid(index, 300 - 9.3, 150, 0.4, 0, 2), true); // HQ
  assert.equal(groundHeightAt(index, 110, 110), 20);
  assert.equal(groundHeightAt(index, 50, 50), 0);
  assert.equal(groundHeightAt(index, 300, 150), 12);
  assert.equal(groundHeightAt(index, 200.5, 60), 1.2);
});

// --------------------------------------------------------------------------------------------
// Soldier

test('soldier: walks at the right speeds (walk, sprint forward only, crouch, ADS)', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.soldier;
  const speedWith = (inp) => {
    const s = newUnitState('soldier');
    s.x = 30; s.z = 200;
    run(s, { look: [0, 0], ...inp }, 1, index);
    return Math.hypot(s.vx, s.vz);
  };
  assert.ok(near(speedWith({ mz: 1 }), def.speed, 1e-9));
  assert.ok(near(speedWith({ mz: 1, sprint: true }), def.sprint, 1e-9));
  assert.ok(near(speedWith({ mz: -1, sprint: true }), def.speed, 1e-9)); // no backward sprint
  assert.ok(near(speedWith({ mx: 1, sprint: true }), def.speed, 1e-9)); // no sideways sprint
  assert.ok(near(speedWith({ mz: 1, crouch: true, sprint: true }), def.crouchSpeed, 1e-9));
  assert.ok(near(speedWith({ mz: 1, ads: true }), def.adsSpeed, 1e-9));
  assert.ok(near(speedWith({ mz: 1, mx: 1 }), def.speed, 1e-9)); // diagonal is normalized
  // Strafe right (D) with yaw 0 moves +z, and body yaw follows the look.
  const s = newUnitState('soldier');
  s.x = 30; s.z = 30;
  run(s, { mx: 1, look: [0, 0.3] }, 0.5, index);
  assert.ok(s.z > 30 && near(s.x, 30, 1e-9));
  assert.equal(s.pitch, 0);
  assert.ok(near(s.aimPitch, 0.3));
  // Crouch / ADS / sprint flags come from the input.
  stepUnit(s, { crouch: true, mz: 1, sprint: true }, DT, def, index);
  assert.equal(s.crouch, true);
  assert.equal(s.sprint, false);
  // Acceleration takes a moment (no instant top speed).
  const a = newUnitState('soldier');
  a.x = 30; a.z = 200;
  stepUnit(a, { mz: 1, look: [0, 0] }, DT, def, index);
  assert.ok(a.vx > 0 && a.vx < def.speed);
});

test('soldier: jump arc and gravity', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.soldier;
  const s = newUnitState('soldier');
  s.x = 30; s.z = 30;
  let peak = 0;
  let airborne = 0;
  stepUnit(s, { up: true }, DT, def, index);
  assert.equal(s.onGround, false);
  for (let i = 0; i < 120; i++) {
    const r = stepUnit(s, {}, DT, def, index);
    peak = Math.max(peak, s.y);
    if (!s.onGround) airborne++;
    else { assert.ok(r.impact > 4, 'landing impact reported'); break; }
  }
  const expected = (def.jump * def.jump) / (2 * GRAVITY);
  assert.ok(Math.abs(peak - expected) < 0.06, `peak ${peak} vs ${expected}`);
  const flight = (airborne + 1) * DT;
  assert.ok(Math.abs(flight - (2 * def.jump) / GRAVITY) < 0.05, `flight ${flight}`);
  assert.equal(s.y, 0);
  // No double jump while in the air.
  stepUnit(s, { up: true }, DT, def, index);
  const vy = s.vy;
  stepUnit(s, { up: true }, DT, def, index);
  assert.ok(s.vy < vy);
});

test('soldier: slides along walls instead of sticking or passing through', () => {
  const index = createWorldIndex(testWorld());
  const s = newUnitState('soldier');
  // Walk diagonally (north-east) into the west face of the building at x = 100.
  s.x = 95; s.z = 112;
  const yaw = -Math.PI / 4;
  run(s, { mz: 1, look: [yaw, 0] }, 2, index);
  assert.ok(s.x <= 100 - UNITS.soldier.radius + 1e-6, `x = ${s.x}`);
  assert.ok(s.z < 112 - 5, `slid north along the wall, z = ${s.z}`);
  // Head-on into the low wall: stops, never tunnels even when sprinting.
  const t = newUnitState('soldier');
  t.x = 190; t.z = 60;
  run(t, { mz: 1, sprint: true, look: [0, 0] }, 3, index);
  assert.ok(t.x < 200 - 0.39, `x = ${t.x}`);
  assert.ok(Math.abs(t.vx) < 1e-6);
  // Around the corner: sliding continues past the building's end.
  const c = newUnitState('soldier');
  c.x = 98; c.z = 102;
  run(c, { mz: 1, look: [-Math.PI / 3, 0] }, 2, index);
  assert.ok(c.z < 100 && c.x > 100, `rounded the corner (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  // HQ cylinder and map bounds.
  const h = newUnitState('soldier');
  h.x = 280; h.z = 150;
  run(h, { mz: 1, look: [0, 0] }, 3, index);
  assert.ok(h.x <= 300 - 9 - 0.4 + 1e-6);
  const m = newUnitState('soldier');
  m.x = 2; m.z = 2;
  run(m, { mz: 1, look: [Math.PI * 0.75, 0] }, 2, index);
  assert.ok(m.x >= 0.4 - 1e-9 && m.z >= 0.4 - 1e-9);
  // Spawned inside a wall: pushed out.
  const w = newUnitState('soldier');
  w.x = 105; w.z = 110;
  stepUnit(w, {}, DT, UNITS.soldier, index);
  assert.ok(!overlapsSolid(index, w.x, w.z, 0.39, 0, 1.8));
});

// --------------------------------------------------------------------------------------------
// Ground vehicles

test('vehicles: throttle, reverse cap, steering sign and braking', () => {
  const index = createWorldIndex(testWorld());
  for (const type of ['jeep', 'tank', 'mlrs']) {
    const def = UNITS[type];
    const s = newUnitState(type);
    s.x = 40; s.z = 220;
    run(s, { mz: 1 }, 8, index);
    assert.ok(near(s.spd, def.speed, 1e-9), `${type} top speed`);
    assert.ok(s.x > 40 && near(s.z, 220, 1e-9));
    assert.equal(s.y, 0);
    // Steer right while driving forward: yaw increases.
    const y0 = s.yaw;
    run(s, { mz: 1, mx: 1 }, 0.3, index);
    assert.ok(s.yaw > y0, `${type} turns right`);
    // Braking is twice as strong as accelerating.
    const b = newUnitState(type);
    b.spd = def.speed;
    b.x = 40; b.z = 150;
    stepUnit(b, { mz: -1 }, DT, def, index);
    assert.ok(near(def.speed - b.spd, def.accel * 2 * DT, 1e-9));
    // Reverse speed is capped at 45 %; steering flips when reversing.
    const r = newUnitState(type);
    r.x = 300; r.z = 260;
    run(r, { mz: -1 }, 10, index);
    assert.ok(near(r.spd, -0.45 * def.speed, 1e-9), `${type} reverse ${r.spd}`);
    const ry = r.yaw;
    run(r, { mz: -1, mx: 1 }, 0.3, index);
    assert.ok(r.yaw < ry, `${type} reverse steering flips`);
    assert.equal(r.pitch, 0);
    assert.equal(r.roll, 0);
  }
});

test('vehicles: tanks pivot in place, wheeled vehicles barely turn when stopped', () => {
  const index = createWorldIndex(testWorld());
  const tank = newUnitState('tank');
  tank.x = 40; tank.z = 220;
  run(tank, { mx: 1 }, 1, index);
  assert.ok(tank.yaw > UNITS.tank.turn * 0.55, `tank pivot ${tank.yaw}`);
  const jeep = newUnitState('jeep');
  jeep.x = 40; jeep.z = 220;
  run(jeep, { mx: 1 }, 1, index);
  assert.ok(jeep.yaw < UNITS.jeep.turn * 0.4);
});

test('vehicles: blocked by buildings with a bounce, never inside', () => {
  const index = createWorldIndex(testWorld());
  for (const type of ['jeep', 'tank', 'mlrs']) {
    const def = UNITS[type];
    const s = newUnitState(type);
    s.x = 60; s.z = 110;
    let bounced = false;
    let maxImpact = 0;
    for (let i = 0; i < 600; i++) {
      const r = stepUnit(s, { mz: 1 }, DT, def, index);
      maxImpact = Math.max(maxImpact, r.impact);
      if (s.spd < 0) bounced = true;
      // Every footprint disc stays outside the building.
      for (const ox of def.foot.xs) assert.ok(!overlapsSolid(index, s.x + Math.cos(s.yaw) * ox, s.z + Math.sin(s.yaw) * ox, def.foot.r - 0.01, 0, 2));
    }
    assert.ok(bounced, `${type} bounces back`);
    assert.ok(maxImpact > 3, `${type} reports the impact`);
    const front = s.x + def.foot.xs[def.foot.xs.length - 1] + def.foot.r;
    assert.ok(front <= 100 + 1e-6 && front > 99, `${type} stops at the wall (${front})`);
  }
  // Steering along a wall: scraping slows but doesn't stop the vehicle, and it stays outside.
  const s = newUnitState('jeep');
  s.x = 90; s.z = 130; s.yaw = -1.2;
  run(s, { mz: 1 }, 3, index);
  assert.ok(!overlapsSolid(index, s.x, s.z, 1.0, 0, 2));
});

test('vehicles: drive a real city street without getting stuck', () => {
  const world = generateCity(3);
  const index = createWorldIndex(world);
  const avenue = world.roads.find((r) => r.lanes === 4);
  const s = newUnitState('tank');
  s.x = 100; s.z = avenue.z + avenue.d / 2 - 6;
  run(s, { mz: 1 }, 30, index);
  assert.ok(s.x > 380, `tank drove down the avenue to x = ${s.x.toFixed(1)}`);
});

// --------------------------------------------------------------------------------------------
// Air

test('drone: climbs, flies, lands on a roof and reports the impact', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.drone;
  const s = newUnitState('drone');
  s.x = 110; s.z = 110; s.y = 40;
  // Descend onto the roof (h = 20).
  let impact = 0;
  for (let i = 0; i < 300; i++) impact = Math.max(impact, stepUnit(s, { down: true, look: [0, 0] }, DT, def, index).impact);
  assert.ok(near(s.y, 20, 0.01), `on the roof: y = ${s.y}`);
  assert.equal(s.onGround, true);
  assert.ok(impact >= def.climb * 0.9, `impact ${impact}`);
  // Take off again.
  run(s, { up: true, look: [0, 0] }, 1, index);
  assert.ok(s.y > 25 && s.onGround === false);
  // Forward flight tilts the nose down, strafing right banks right.
  run(s, { mz: 1, mx: 1, look: [0, 0] }, 2, index);
  assert.ok(s.pitch < 0 && s.roll > 0);
  assert.ok(Math.abs(s.pitch) <= def.tilt + 1e-9 && Math.abs(s.roll) <= def.tilt + 1e-9);
  // Yaw turns toward the look direction at yawRate.
  const d = newUnitState('drone');
  d.x = 30; d.z = 30; d.y = 10;
  stepUnit(d, { look: [2, 0] }, DT, def, index);
  assert.ok(near(d.yaw, def.yawRate * DT, 1e-9));
  // Ground is a floor at minAlt.
  run(d, { down: true }, 3, index);
  assert.ok(near(d.y, def.minAlt, 1e-9) && d.onGround);
  // maxAlt.
  run(d, { up: true }, 20, index);
  assert.ok(d.y <= def.maxAlt + 1e-9);
});

test('heli: slams into a wall at speed, slides along it, impact reported', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.heli;
  const s = newUnitState('heli');
  s.x = 40; s.z = 110; s.y = 10;
  let impact = 0;
  for (let i = 0; i < 300; i++) impact = Math.max(impact, stepUnit(s, { mz: 1, look: [0, 0] }, DT, def, index).impact);
  assert.ok(impact > 9, `impact ${impact}`);
  assert.ok(s.x + def.radius <= 100 + 1e-6, `stays outside, x = ${s.x}`);
  // HQ cylinder side and roof.
  const h = newUnitState('heli');
  h.x = 270; h.z = 150; h.y = 5;
  run(h, { mz: 1, look: [0, 0] }, 4, index);
  assert.ok(Math.hypot(h.x - 300, h.z - 150) >= 9 + def.radius - 1e-6);
  const r = newUnitState('heli');
  r.x = 300; r.z = 150; r.y = 30;
  run(r, { down: true, look: [0, 0] }, 5, index);
  assert.ok(near(r.y, 12, 0.01) && r.onGround, `landed on the HQ roof, y = ${r.y}`);
  // Landed on the ground at minAlt 0.
  const g = newUnitState('heli');
  g.x = 30; g.z = 30; g.y = 5;
  run(g, { down: true, look: [0, 0] }, 2, index);
  assert.equal(g.y, 0);
  assert.equal(g.onGround, true);
});

test('jet: throttle, turning, roll, auto pull-up', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.jet;
  const s = newUnitState('jet');
  s.x = 50; s.z = 150; s.y = 120; s.spd = def.speed;
  assert.equal(s.throttle, 0.5);
  run(s, { mz: 1, look: [0, 0] }, 1, index);
  assert.ok(near(s.throttle, 1, 1e-9));
  run(s, { look: [0, 0] }, 4, index);
  assert.ok(near(s.spd, def.speedMax, 1e-6));
  // Turning right banks right, at most `turn` rad/s.
  const j = newUnitState('jet');
  j.x = 200; j.z = 150; j.y = 150; j.spd = 80;
  run(j, { look: [2, 0] }, 0.5, index);
  assert.ok(near(j.yaw, def.turn * 0.5, 1e-6));
  assert.ok(j.roll > 0.5);
  // Rudder adds yaw.
  const k = newUnitState('jet');
  k.x = 200; k.z = 150; k.y = 150; k.spd = 80;
  run(k, { mx: 1, look: [0, 0] }, 0.5, index);
  assert.ok(k.yaw > 0);
  // Velocity follows the nose.
  const v = Math.hypot(k.vx, k.vy, k.vz);
  assert.ok(near(v, k.spd, 1e-9));
  // Auto pull-up: holding the stick hard down from various heights never hits the ground and
  // never chatters (pitch changes direction only a few times).
  for (const [y0, look] of [[26, -0.3], [80, -0.6], [150, -1.2], [10, -1]]) {
    const p = newUnitState('jet');
    p.x = 20; p.z = 150; p.y = y0; p.spd = 80;
    let crashed = false;
    let flips = 0;
    let prev = 0;
    for (let i = 0; i < 900 && !crashed; i++) {
      const p0 = p.pitch;
      crashed = stepUnit(p, { look: [0, look] }, DT, def, index).crashed;
      const d = p.pitch - p0;
      if (d * prev < 0) flips++;
      if (d) prev = d;
      if (p.x > 380) p.x = 20; // stay over open ground
    }
    assert.equal(crashed, false, `pull-up from ${y0}`);
    assert.ok(flips < 10, `pitch chatter (${flips} flips) from ${y0}`);
    assert.ok(p.y > 20);
  }
  // Below 25 m with the nose down: the nose comes up toward +0.25.
  const q = newUnitState('jet');
  q.x = 20; q.z = 150; q.y = 15; q.spd = 80; q.pitch = -0.1;
  let peak = q.pitch;
  for (let i = 0; i < 40; i++) { stepUnit(q, { look: [0, -0.1] }, DT, def, index); peak = Math.max(peak, q.pitch); }
  assert.ok(peak > 0.24 && q.y > 15, `pulled up to ${peak}`);
});

test('jet: crashes into buildings, the HQ and the ground', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.jet;
  const b = newUnitState('jet');
  b.x = 88; b.z = 110; b.y = 14; b.spd = 80; b.pitch = 0;
  let r;
  for (let i = 0; i < 120; i++) { r = stepUnit(b, { look: [0, 0] }, DT, def, index); if (r.crashed) break; }
  assert.equal(r.crashed, true);
  assert.ok(near(b.x, 100, 0.01), `crash point at the facade, x = ${b.x}`);
  const h = newUnitState('jet');
  h.x = 275; h.z = 150; h.y = 7; h.spd = 80;
  for (let i = 0; i < 120; i++) { r = stepUnit(h, { look: [0, 0] }, DT, def, index); if (r.crashed) break; }
  assert.equal(r.crashed, true);
  assert.ok(near(Math.hypot(h.x - 300, h.z - 150), 9, 0.05));
  // Steep dive starting too low to recover.
  const g = newUnitState('jet');
  g.x = 20; g.z = 250; g.y = 30; g.spd = 115; g.pitch = -1.2; g.vy = -110;
  for (let i = 0; i < 120; i++) { r = stepUnit(g, { look: [0, -1.2] }, DT, def, index); if (r.crashed) break; }
  assert.equal(r.crashed, true);
  assert.ok(r.impact > 50);
  // Altitude ceiling.
  const c = newUnitState('jet');
  c.x = 50; c.z = 250; c.y = def.maxAlt - 5; c.spd = 100;
  run(c, { look: [0, 1] }, 3, index);
  assert.ok(c.y <= def.maxAlt);
});

test('jet: leaving the battlefield steers back toward the map', () => {
  const index = createWorldIndex(testWorld());
  const def = UNITS.jet;
  const s = newUnitState('jet');
  s.x = -140; s.z = 150; s.y = 120; s.spd = 80; s.yaw = Math.PI; // flying west, away from the map
  let wasOut = false;
  for (let i = 0; i < 60 * 30; i++) {
    stepUnit(s, { look: [Math.PI, 0], mx: -1 }, DT, def, index); // the player insists on going west
    if (s.out) wasOut = true;
    if (wasOut && !s.out) break;
  }
  assert.ok(wasOut, 'flagged as out');
  assert.equal(s.out, false);
  assert.ok(s.x > -250 && s.x < -40, `came back, x = ${s.x}`);
  assert.ok(Math.abs(angleDiff(s.yaw, 0)) < 1.2, 'heading back east');
});

// --------------------------------------------------------------------------------------------
// Aiming

test('aim: eye, aimAngles clamp, yawLimit, slew rate and muzzle', () => {
  const tank = newUnitState('tank');
  tank.x = 10; tank.z = 10;
  const e = eyePosition(tank, UNITS.tank);
  assert.deepEqual(e, [10, UNITS.tank.aim.height, 10]);
  // Aim at a point below the gun's depression limit.
  let [yaw, pitch] = aimAngles(tank, UNITS.tank, [20, -50, 10]);
  assert.ok(near(yaw, 0) && near(pitch, UNITS.tank.aim.pitchMin));
  [yaw, pitch] = aimAngles(tank, UNITS.tank, [10, 2.45, 30]);
  assert.ok(near(yaw, Math.PI / 2) && near(pitch, 0));
  // Slew limited by the turret rate.
  slewAim(tank, UNITS.tank, Math.PI / 2, 0.3, 0.5);
  assert.ok(near(tank.aimYaw, UNITS.tank.aim.rate * 0.5));
  assert.ok(near(tank.aimPitch, 0.3));
  // Heli chin gun can't look backwards.
  const heli = newUnitState('heli');
  heli.x = 50; heli.z = 50; heli.y = 20;
  [yaw] = aimAngles(heli, UNITS.heli, [0, 20, 50]);
  assert.ok(near(Math.abs(yaw), UNITS.heli.aim.yawLimit));
  heli.aimYaw = 1.6;
  heli.yaw = -0.5;
  slewAim(heli, UNITS.heli, 1.6, 0, DT);
  assert.ok(near(heli.aimYaw, -0.5 + 1.6));
  // Jets fire along the nose.
  const jet = newUnitState('jet');
  jet.yaw = 0.4; jet.pitch = -0.2;
  assert.deepEqual(aimAngles(jet, UNITS.jet, [0, 0, 0]), [0.4, -0.2]);
  // Soldier eye drops when crouched; muzzle sits ahead of and right of the eye.
  const sol = newUnitState('soldier');
  sol.x = 5; sol.z = 5;
  assert.equal(eyePosition(sol, UNITS.soldier)[1], UNITS.soldier.eye);
  sol.crouch = true;
  assert.equal(eyePosition(sol, UNITS.soldier)[1], UNITS.soldier.crouchEye);
  sol.crouch = false;
  const m = muzzlePosition(sol, UNITS.soldier, 0);
  assert.ok(m[0] > 5.5 && m[2] > 5 && m[1] < UNITS.soldier.eye);
  const tm = muzzlePosition(tank, UNITS.tank, 0);
  assert.ok(near(Math.hypot(tm[0] - 10, tm[1] - 2.45, tm[2] - 10), UNITS.tank.weapons[0].muzzle, 1e-9));
  // Bad aim points don't throw.
  assert.deepEqual(aimAngles(tank, UNITS.tank, [NaN, 0, 0]), [tank.aimYaw, tank.aimPitch]);
});

// --------------------------------------------------------------------------------------------
// Hit volumes

test('hitTestUnit: soldier head, body, crouch and misses', () => {
  const def = UNITS.soldier;
  const s = newUnitState('soldier');
  s.x = 50; s.z = 50;
  // Ray from the west at head height.
  let h = hitTestUnit(s, def, 0, def.hit.head.y, 50, 1, 0, 0, 100);
  assert.ok(h && h.head);
  assert.ok(near(h.dist, 50 - def.hit.head.r, 1e-9));
  // Chest.
  h = hitTestUnit(s, def, 0, 1.2, 50, 1, 0, 0, 100);
  assert.ok(h && !h.head);
  assert.ok(near(h.dist, 50 - def.hit.body.r, 1e-9));
  // Legs.
  assert.ok(hitTestUnit(s, def, 0, 0.3, 50, 1, 0, 0, 100));
  // Over the head, beside the body, too short.
  assert.equal(hitTestUnit(s, def, 0, 2.0, 50, 1, 0, 0, 100), null);
  assert.equal(hitTestUnit(s, def, 0, 1.2, 50.5, 1, 0, 0, 100), null);
  assert.equal(hitTestUnit(s, def, 0, 1.2, 50, 1, 0, 0, 40), null);
  // Crouched: a shot at standing head height flies over, the lowered head is hit.
  s.crouch = true;
  assert.equal(hitTestUnit(s, def, 0, def.hit.head.y, 50, 1, 0, 0, 100), null);
  const k = def.crouchHeight / def.height;
  h = hitTestUnit(s, def, 0, def.hit.head.y * k, 50, 1, 0, 0, 100);
  assert.ok(h && h.head);
  // Headshot from above (drone): the head is hit before the body.
  s.crouch = false;
  h = hitTestUnit(s, def, 50, 20, 50, 0, -1, 0, 100);
  assert.ok(h && h.head && near(h.dist, 20 - def.hit.head.y - def.hit.head.r, 1e-9));
});

test('hitTestUnit: vehicle spheres follow yaw, pitch, roll and the turret', () => {
  const def = UNITS.jet;
  const s = newUnitState('jet');
  s.x = 100; s.y = 50; s.z = 100;
  const nose = def.hit[0];
  // Yaw 0: the nose is at +x.
  assert.ok(hitTestUnit(s, def, 100 + nose.x, 80, 100, 0, -1, 0, 100));
  assert.equal(hitTestUnit(s, def, 100, 80, 100 + nose.x, 0, -1, 0, 100), null);
  // Yaw +pi/2: the nose turns to +z (south).
  s.yaw = Math.PI / 2;
  assert.ok(hitTestUnit(s, def, 100, 80, 100 + nose.x, 0, -1, 0, 100));
  assert.equal(hitTestUnit(s, def, 100 + nose.x, 80, 100, 0, -1, 0, 100), null);
  // Pitch up: the nose rises.
  s.yaw = 0;
  s.pitch = 0.5;
  const nx = nose.x * Math.cos(0.5) - nose.y * Math.sin(0.5);
  const ny = nose.x * Math.sin(0.5) + nose.y * Math.cos(0.5);
  let h = hitTestUnit(s, def, 100 + nx, 80, 100, 0, -1, 0, 100);
  assert.ok(h && near(h.dist, 80 - (50 + ny) - nose.r, 1e-9));
  // Roll right: the right wingtip (+z) drops.
  s.pitch = 0;
  s.roll = 0.6;
  const tip = def.hit.find((q) => q.z > 4);
  const ty = tip.y * Math.cos(0.6) - tip.z * Math.sin(0.6);
  const tz = tip.y * Math.sin(0.6) + tip.z * Math.cos(0.6);
  h = hitTestUnit(s, def, 100 + tip.x, 80, 100 + tz, 0, -1, 0, 100);
  assert.ok(h && near(h.dist, 80 - (50 + ty) - tip.r, 1e-9));
  assert.ok(ty < tip.y);
  // Tank turret spheres rotate with aimYaw, the hull with yaw.
  const tank = newUnitState('tank');
  tank.x = 0; tank.z = 0;
  tank.aimYaw = Math.PI / 2;
  const mantlet = UNITS.tank.hit.find((q) => q.turret && q.x > 1);
  assert.ok(hitTestUnit(tank, UNITS.tank, 0, 10, mantlet.x, 0, -1, 0, 100));
  assert.ok(hitTestUnit(tank, UNITS.tank, 3.4, 10, 0, 0, -1, 0, 100)); // hull front
  assert.equal(hitTestUnit(tank, UNITS.tank, 0, 10, 4.5, 0, -1, 0, 100), null);
  // Vehicles never report headshots.
  h = hitTestUnit(tank, UNITS.tank, -20, 1, 0, 1, 0, 0, 100);
  assert.ok(h && h.head === false);
});

test('sphereTestUnit: signed distance to the hit volumes', () => {
  const def = UNITS.soldier;
  const s = newUnitState('soldier');
  s.x = 10; s.z = 10;
  assert.ok(near(sphereTestUnit(s, def, 15, 1, 10, 0), 5 - def.hit.body.r, 1e-9));
  assert.ok(near(sphereTestUnit(s, def, 15, 1, 10, 2), 3 - def.hit.body.r, 1e-9));
  assert.ok(sphereTestUnit(s, def, 10, 1, 10, 0) < 0); // inside
  assert.ok(near(sphereTestUnit(s, def, 10, 3, 10, 0), 3 - def.hit.head.y - def.hit.head.r, 1e-9));
  const tank = newUnitState('tank');
  tank.x = 100; tank.z = 100;
  assert.ok(sphereTestUnit(tank, UNITS.tank, 100, 1, 100, 0) < 0);
  const far = sphereTestUnit(tank, UNITS.tank, 130, 1, 100, 0);
  assert.ok(far > 22 && far < 27);
  // A splash radius of 7 touches a tank 8 m away from its side.
  assert.ok(sphereTestUnit(tank, UNITS.tank, 100, 1, 108, 7) < 0);
  tank.yaw = Math.PI / 2; // now the tank is long along z
  assert.ok(sphereTestUnit(tank, UNITS.tank, 100, 1, 103.3, 0) < 0);
  assert.ok(sphereTestUnit(tank, UNITS.tank, 103.3, 1, 100, 0) > 1);
});

// --------------------------------------------------------------------------------------------
// Robustness, determinism and speed

test('stepUnit: garbage inputs never produce NaN', () => {
  const index = createWorldIndex(testWorld());
  for (const type of UNIT_TYPES) {
    const s = newUnitState(type);
    s.x = 30; s.z = 30; s.y = type === 'jet' ? 100 : type === 'drone' || type === 'heli' ? 10 : 0;
    for (const inp of [null, {}, { mx: NaN, mz: Infinity, look: ['a', null] }, { mx: 5, mz: -9, look: [1e9, -1e9] }, { look: 'x' }]) {
      stepUnit(s, inp, DT, UNITS[type], index);
      stepUnit(s, inp, NaN, UNITS[type], index);
      stepUnit(s, inp, 5, UNITS[type], index);
    }
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'roll', 'spd', 'throttle', 'aimYaw', 'aimPitch']) {
      assert.ok(Number.isFinite(s[k]), `${type}.${k} = ${s[k]}`);
    }
  }
});

function simulate(world, seconds) {
  const index = createWorldIndex(world);
  const units = [];
  for (let i = 0; i < 46; i++) {
    const type = UNIT_TYPES[i % UNIT_TYPES.length];
    const s = newUnitState(type);
    s.x = 20 + (i % 10) * 60;
    s.z = 30 + Math.floor(i / 10) * 100;
    s.y = type === 'jet' ? 150 : type === 'heli' || type === 'drone' ? 30 : 0;
    s.spd = type === 'jet' ? 80 : 0;
    units.push(s);
  }
  const n = Math.round(seconds * 60);
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < units.length; i++) {
      const s = units[i];
      const ph = t * 0.013 + i;
      const input = {
        mx: Math.sin(ph * 1.7), mz: Math.cos(ph * 0.9), up: (t + i) % 97 < 30, down: (t + i) % 89 < 20,
        crouch: (t + i) % 300 < 60, sprint: i % 2 === 0, ads: (t + i) % 120 < 30,
        look: [Math.sin(ph * 0.5) * 3, Math.sin(ph * 0.3) * 0.5],
      };
      const r = stepUnit(s, input, DT, UNITS[s.type], index);
      if (r.crashed) { s.x = 320; s.y = 150; s.z = 240; s.pitch = 0; }
      const a = aimAngles(s, UNITS[s.type], [320, 10, 240]);
      slewAim(s, UNITS[s.type], a[0], a[1], DT);
    }
  }
  return units;
}

test('determinism: identical inputs give bit-identical states', () => {
  const world = generateCity(11);
  const a = simulate(world, 4);
  const b = simulate(world, 4);
  assert.deepEqual(a, b);
});

test('performance: 46 units at 60 ticks/s plus rays use a small slice of a tick', () => {
  const world = generateCity(5);
  const index = createWorldIndex(world);
  simulate(world, 1); // warm-up
  const t0 = performance.now();
  simulate(world, 5);
  const perTick = (performance.now() - t0) / 300;
  assert.ok(perTick < 2, `stepping 46 units takes ${perTick.toFixed(3)} ms per tick`);
  let a = 99;
  const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
  const t1 = performance.now();
  for (let i = 0; i < 20000; i++) {
    const d = dirFromAngles(rnd() * 6.28, -0.4 + rnd() * 0.6);
    raycast(index, rnd() * 640, 1 + rnd() * 30, rnd() * 480, d[0], d[1], d[2], 400);
  }
  const perRay = (performance.now() - t1) / 20000;
  assert.ok(perRay < 0.02, `raycast ${(perRay * 1000).toFixed(2)} us`);
});
