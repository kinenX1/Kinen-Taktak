// Unit definitions and snapshot layout for Drones War 3D. Pure data: the server imports this
// file too, so no DOM and no three.js here.
//
// Model space for hit spheres and collision footprints: x forward (nose), y up, z right,
// relative to the unit root (base of the wheels / tracks / skids / landing gear, at y = 0).

export const TEAMS = ['def', 'atk'];
export const TEAM_COLORS = { def: '#3d8bff', atk: '#ff4d3d' };
export const TEAM_NAMES = { def: 'Defenders', atk: 'Attackers' };
export const UNIT_TYPES = ['soldier', 'jeep', 'tank', 'mlrs', 'drone', 'heli', 'jet'];
export const WEAPON_KINDS = ['hitscan', 'rocket', 'shell', 'artillery', 'bomb', 'missile', 'grenade'];
// Live projectiles sent in snapshots.
export const PROJ_KINDS = ['rocket', 'shell', 'artillery', 'bomb', 'missile', 'grenade'];

export const VIEW_MODES = {
  soldier: ['first', 'third'],
  jeep: ['third', 'first'], // first = driver seat
  tank: ['third', 'first', 'gunner'], // first = inside the tank, gunner = gunner's sight
  mlrs: ['third', 'first'],
  drone: ['third', 'first'], // first = drone camera feed
  heli: ['third', 'first'], // cockpit
  jet: ['third', 'first'], // cockpit
};

export const UNITS = {
  soldier: {
    name: 'Operator',
    blurb: 'Your custom military suit. M4 carbine, RPG and frag grenades. Sprint, jump, crouch.',
    kind: 'soldier', hp: 100, armor: 1, blastArmor: 1, regen: { delay: 4.5, rate: 30 },
    speed: 5.4, sprint: 8.4, crouchSpeed: 2.6, adsSpeed: 3.2, jump: 5.6, accel: 50, airAccel: 8,
    radius: 0.4, height: 1.8, crouchHeight: 1.25, eye: 1.62, crouchEye: 1.12,
    // Head sphere + body cylinder; both scaled by crouchHeight / height when crouched.
    hit: { head: { y: 1.62, r: 0.17 }, body: { y0: 0.05, y1: 1.45, r: 0.34 } },
    aim: { height: 1.62, pitchMin: -1.45, pitchMax: 1.45, rate: 0, yawLimit: 0 }, // rate 0 = instant, yawLimit 0 = none
    weapons: [
      { name: 'M4 Carbine', kind: 'hitscan', dmg: 28, headMult: 1.8, rate: 0.09, range: 320, falloff: [60, 0.7],
        spread: { hip: 0.03, ads: 0.003, move: 0.025, air: 0.06 }, recoil: 0.011, mag: 30, reserve: 210, reload: 2.1,
        muzzle: 0.7, sound: 'rifle', tracer: 3 }, // tracer: every Nth shot shows a tracer
      { name: 'RPG-7', kind: 'rocket', dmg: 170, splash: 6.5, rate: 0.8, speed: 95, range: 400, mag: 1, reserve: 3,
        reload: 2.6, muzzle: 0.8, sound: 'rpg' },
    ],
    grenade: { name: 'Frag grenade', count: 2, fuse: 2.4, dmg: 150, splash: 7, speed: 17, sound: 'grenade' },
  },

  jeep: {
    name: 'Jeep',
    blurb: 'Fast armored 4x4. Roof-mounted .50 cal and a 3-rocket pod. Hit and run.',
    kind: 'ground', hp: 300, armor: 0.45, blastArmor: 1, speed: 24, accel: 14, turn: 2.0,
    radius: 1.7, height: 2.1,
    // 4.6 m long, 2.1 m wide, 2 m tall.
    hit: [
      { x: 1.45, y: 0.85, z: 0, r: 1.05 },
      { x: 0, y: 1.0, z: 0, r: 1.12 },
      { x: -1.45, y: 0.95, z: 0, r: 1.05 },
    ],
    // Collision footprint: discs along the body axis (x offsets), see physics.js.
    foot: { r: 1.05, xs: [-1.25, 1.25] },
    aim: { height: 2.3, pitchMin: -0.35, pitchMax: 0.8, rate: 3.5, yawLimit: 0 },
    weapons: [
      { name: '.50 cal', kind: 'hitscan', dmg: 24, rate: 0.1, range: 320, falloff: [80, 0.7],
        spread: { hip: 0.02, ads: 0.008 }, mag: 100, reserve: -1, reload: 3.5, muzzle: 1.4, sound: 'hmg', tracer: 2 },
      { name: 'Rocket pod', kind: 'rocket', count: 3, fan: 0.035, dmg: 75, splash: 5, rate: 0.2, speed: 110,
        range: 380, mag: 3, reserve: -1, reload: 6, muzzle: 1.2, sound: 'rocket' },
    ],
  },

  tank: {
    name: 'Tank',
    blurb: 'Main battle tank. 120 mm cannon and a coaxial MG. Slow, heavy armor, pivots in place.',
    kind: 'ground', hp: 800, armor: 0.08, blastArmor: 0.8, speed: 10.5, accel: 5, turn: 0.95,
    pivot: 0.6, // minimum steering factor at low speed, so tracks can turn on the spot (default 0.35)
    radius: 2.8, height: 2.7,
    // 7.5 m hull, 3.6 m wide, hull top 1.9 m, turret to 2.7 m. Turret spheres rotate with aimYaw.
    hit: [
      { x: 2.7, y: 1.0, z: -0.85, r: 1.0 }, { x: 2.7, y: 1.0, z: 0.85, r: 1.0 },
      { x: 0.9, y: 1.0, z: -0.85, r: 1.0 }, { x: 0.9, y: 1.0, z: 0.85, r: 1.0 },
      { x: -0.9, y: 1.0, z: -0.85, r: 1.0 }, { x: -0.9, y: 1.0, z: 0.85, r: 1.0 },
      { x: -2.7, y: 1.0, z: -0.85, r: 1.0 }, { x: -2.7, y: 1.0, z: 0.85, r: 1.0 },
      { x: -0.3, y: 2.1, z: 0, r: 1.4, turret: true },
      { x: 1.3, y: 2.15, z: 0, r: 0.75, turret: true },
    ],
    foot: { r: 1.8, xs: [-1.95, 1.95] },
    aim: { height: 2.45, pitchMin: -0.15, pitchMax: 0.35, rate: 1.3, yawLimit: 0 },
    weapons: [
      { name: '120mm cannon', kind: 'shell', dmg: 230, splash: 7, rate: 0, speed: 320, gravity: 4, range: 650,
        mag: 1, reserve: -1, reload: 3.2, muzzle: 5.6, sound: 'cannon' },
      { name: 'Coax MG', kind: 'hitscan', dmg: 16, rate: 0.08, range: 300, falloff: [80, 0.7],
        spread: { hip: 0.012, ads: 0.006 }, mag: 150, reserve: -1, reload: 4, muzzle: 2.0, sound: 'mg', tracer: 2 },
    ],
  },

  mlrs: {
    name: 'Rocket Truck',
    blurb: '6x6 MLRS artillery. Guided rockets and a 10-rocket salvo. Indirect fire, no line of sight needed.',
    kind: 'ground', hp: 360, armor: 0.35, blastArmor: 1, speed: 17, accel: 9, turn: 1.5,
    radius: 2.3, height: 3.2,
    // 8 m long, 2.6 m wide, 3.2 m tall: cab at the front, launcher pod on the rear bed.
    hit: [
      { x: 2.75, y: 1.45, z: 0, r: 1.3 },
      { x: 0.9, y: 1.3, z: 0, r: 1.3 },
      { x: -0.9, y: 1.3, z: 0, r: 1.3 },
      { x: -2.75, y: 1.3, z: 0, r: 1.3 },
      { x: -1.6, y: 2.45, z: 0, r: 1.0, turret: true },
      { x: -0.2, y: 2.45, z: 0, r: 0.8, turret: true },
    ],
    foot: { r: 1.3, xs: [-2.7, 0, 2.7] },
    aim: { height: 2.8, pitchMin: 0.2, pitchMax: 1.2, rate: 1.4, yawLimit: 0 },
    weapons: [
      { name: 'Guided rocket', kind: 'artillery', dmg: 125, splash: 8, rate: 0.6, speed: 120, range: 520,
        mag: 4, reserve: -1, reload: 5, muzzle: 2.5, sound: 'artillery' },
      { name: 'Rocket salvo', kind: 'artillery', count: 10, spreadRadius: 14, dmg: 95, splash: 8, rate: 0, speed: 120,
        range: 520, mag: 1, reserve: -1, reload: 15, muzzle: 2.5, sound: 'salvo' },
    ],
  },

  drone: {
    name: 'Drone',
    blurb: 'Armed quadcopter. Minigun and dropped bombs. Flies over everything, lands on roofs.',
    kind: 'air', hp: 90, armor: 1, blastArmor: 1, speed: 22, climb: 12, accel: 35, yawRate: 6, tilt: 0.35,
    minAlt: 0.3, maxAlt: 140, radius: 0.9, height: 0.5,
    // 1.2 m across.
    hit: [{ x: 0, y: 0.25, z: 0, r: 0.72 }],
    aim: { height: 0, pitchMin: -1.5, pitchMax: 0.5, rate: 0, yawLimit: 0 },
    weapons: [
      { name: 'Minigun', kind: 'hitscan', dmg: 12, rate: 0.06, range: 240, falloff: [60, 0.6],
        spread: { hip: 0.02, ads: 0.01 }, mag: 200, reserve: -1, reload: 4, muzzle: 0.6, sound: 'minigun', tracer: 2 },
      { name: 'Bomb drop', kind: 'bomb', dmg: 180, splash: 8.5, rate: 0.5, mag: 2, reserve: -1, reload: 6, muzzle: 0,
        sound: 'bomb' },
    ],
  },

  heli: {
    name: 'Attack Helicopter',
    blurb: 'Gunship with a 30 mm chin gun and Hydra rocket pods. Hover, strafe, rain fire.',
    kind: 'air', hp: 520, armor: 0.3, blastArmor: 1, speed: 32, climb: 14, accel: 14, yawRate: 1.8, tilt: 0.25,
    minAlt: 0, maxAlt: 170, radius: 3.5, height: 3.8,
    // 15 m long (nose x = 6.5, tail x = -8.5), 14 m rotor at y = 3.8.
    hit: [
      { x: 5.3, y: 1.55, z: 0, r: 1.0 }, // nose + chin gun
      { x: 3.5, y: 1.75, z: 0, r: 1.3 }, // tandem cockpit
      { x: 1.4, y: 1.9, z: 0, r: 1.5 }, // main fuselage / engines
      { x: -0.6, y: 1.95, z: 0, r: 1.3 },
      { x: 0.9, y: 1.6, z: -2.0, r: 0.85 }, { x: 0.9, y: 1.6, z: 2.0, r: 0.85 }, // stub wings + pods
      { x: -2.6, y: 2.1, z: 0, r: 0.8 }, // tail boom
      { x: -4.6, y: 2.25, z: 0, r: 0.65 },
      { x: -6.6, y: 2.4, z: 0, r: 0.65 },
      { x: -8.0, y: 2.9, z: 0, r: 0.9 }, // tail fin + tail rotor
      { x: 1.0, y: 3.75, z: 0, r: 0.7 }, // rotor mast
    ],
    aim: { height: 0.9, pitchMin: -1.2, pitchMax: 0.35, rate: 2.5, yawLimit: 1.6 }, // chin gun, ±1.6 rad from body yaw
    weapons: [
      { name: '30mm chain gun', kind: 'hitscan', dmg: 30, rate: 0.11, range: 380, falloff: [100, 0.7],
        spread: { hip: 0.012, ads: 0.006 }, mag: 120, reserve: -1, reload: 4, muzzle: 1.5, sound: 'chaingun', tracer: 1 },
      { name: 'Hydra rockets', kind: 'rocket', count: 4, fan: 0.025, dmg: 85, splash: 6, rate: 0.35, speed: 150,
        range: 450, mag: 4, reserve: -1, reload: 7, muzzle: 2, sound: 'rocket' },
    ],
  },

  jet: {
    name: 'Fighter Jet',
    blurb: 'Multirole fighter. 20 mm cannon and heat-seeking missiles. Lock on, fire, pull up.',
    kind: 'jet', hp: 340, armor: 0.35, blastArmor: 1, speedMin: 45, speedMax: 115, speed: 80, turn: 1.15,
    accel: 22, minAlt: 0, maxAlt: 320, radius: 4.5, height: 2.6,
    // 16 m long (nose x = 8, tail x = -8), 10 m wing span.
    hit: [
      { x: 6.9, y: 1.35, z: 0, r: 0.6 }, // radome
      { x: 5.0, y: 1.45, z: 0, r: 0.95 }, // cockpit
      { x: 2.8, y: 1.4, z: 0, r: 1.2 },
      { x: 0.4, y: 1.35, z: 0, r: 1.3 },
      { x: -2.1, y: 1.35, z: 0, r: 1.3 },
      { x: -4.6, y: 1.3, z: 0, r: 1.15 },
      { x: -6.9, y: 1.3, z: 0, r: 0.9 }, // nozzles
      { x: -0.6, y: 1.2, z: -2.6, r: 1.1 }, { x: -0.6, y: 1.2, z: 2.6, r: 1.1 }, // wings
      { x: -1.8, y: 1.2, z: -4.1, r: 0.8 }, { x: -1.8, y: 1.2, z: 4.1, r: 0.8 },
      { x: -6.0, y: 2.55, z: -1.3, r: 0.8 }, { x: -6.0, y: 2.55, z: 1.3, r: 0.8 }, // twin tails
    ],
    aim: { height: 1, pitchMin: -1.2, pitchMax: 1.2, rate: 0, yawLimit: 0, fixed: true }, // guns fire along the nose
    weapons: [
      { name: '20mm cannon', kind: 'hitscan', dmg: 22, rate: 0.05, range: 650, falloff: [200, 0.7],
        spread: { hip: 0.008, ads: 0.006 }, mag: 300, reserve: -1, reload: 5, muzzle: 7, sound: 'jetcannon', tracer: 1 },
      { name: 'Heat-seeker', kind: 'missile', dmg: 280, splash: 8, rate: 0.6, speed: 170, turn: 2.6, range: 750,
        lockCone: 0.3, lockRange: 700, lockTime: 1.0, mag: 2, reserve: -1, reload: 8, muzzle: 3, sound: 'missile' },
    ],
  },
};

// Snapshot row indices.
export const U = {
  ID: 0, TYPE: 1, TEAM: 2, X: 3, Y: 4, Z: 5, YAW: 6, PITCH: 7, ROLL: 8, AIMYAW: 9, AIMPITCH: 10,
  SPD: 11, VX: 12, VY: 13, VZ: 14, HP: 15, FLAGS: 16, RESPAWN: 17, KILLS: 18, DEATHS: 19, SCORE: 20,
  WEAPON: 21, MAG: 22, RESERVE: 23, RELOAD: 24, MAG2: 25, RELOAD2: 26, GRENADES: 27, ACK: 28, LOCK: 29, THROTTLE: 30,
};
export const FLAG = {
  ALIVE: 1, GROUND: 2, CROUCH: 4, SPRINT: 8, ADS: 16, OUT: 32, MISSILE: 64, LOCKED_ON: 128, FIRING: 256, BURNING: 512,
};
export const P = { ID: 0, KIND: 1, TEAM: 2, X: 3, Y: 4, Z: 5, VX: 6, VY: 7, VZ: 8 };

export const UNIT_LIMITS = { maxPlayers: 16, maxBotsPerTeam: 15 };
export const HQ_SCORE = { kill: 100, headshot: 50, assist: 50, hqPer100: 10 };
