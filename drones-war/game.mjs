// Server-side simulation for one Drones War match. The server owns the whole
// battle: clients only send their inputs and draw the snapshots they get back.

export const TICK_RATE = 30;

export const MAP = { w: 3200, h: 2000 };

export const HQ = { x: 2920, y: 1000, r: 70, hp: 1500 };

export const SPAWNS = {
  atk: { x: 70, y: 300, w: 230, h: 1400 },
  def: { x: 3010, y: 700, w: 150, h: 600 },
};

export const WALLS = [
  // Outskirts on the attackers' side
  { x: 560, y: 220, w: 220, h: 160 },
  { x: 600, y: 800, w: 150, h: 400 },
  { x: 560, y: 1620, w: 240, h: 160 },
  // The city in the middle
  { x: 1020, y: 480, w: 300, h: 120 },
  { x: 1060, y: 1380, w: 260, h: 140 },
  { x: 1440, y: 100, w: 160, h: 300 },
  { x: 1480, y: 890, w: 220, h: 220 },
  { x: 1440, y: 1600, w: 160, h: 300 },
  { x: 1860, y: 470, w: 260, h: 130 },
  { x: 1860, y: 1400, w: 260, h: 130 },
  { x: 2250, y: 180, w: 200, h: 240 },
  { x: 2250, y: 1580, w: 200, h: 240 },
  // The defenders' fort around the HQ
  { x: 2600, y: 620, w: 40, h: 260 },
  { x: 2600, y: 1120, w: 40, h: 260 },
  { x: 2700, y: 560, w: 320, h: 40 },
  { x: 2700, y: 1400, w: 320, h: 40 },
];

export const UNITS = {
  soldier: {
    name: 'Commando',
    blurb: 'Military suit. Assault rifle and a rocket launcher.',
    hp: 110, speed: 185, radius: 14, flying: false,
    primary: { kind: 'bullet', name: 'Rifle', dmg: 12, rate: 0.13, speed: 950, range: 750, spread: 0.04 },
    alt: { kind: 'rocket', name: 'Rocket launcher', dmg: 75, splash: 75, rate: 2.2, speed: 620, range: 900 },
  },
  car: {
    name: 'Jeep',
    blurb: 'Fast armored car. Machine gun and a 3-rocket pod.',
    hp: 200, speed: 300, radius: 20, flying: false,
    primary: { kind: 'bullet', name: 'Machine gun', dmg: 8, rate: 0.08, speed: 1000, range: 700, spread: 0.07 },
    alt: { kind: 'rocket', name: 'Rocket pod', dmg: 40, splash: 55, rate: 3.5, speed: 700, range: 850, count: 3, fan: 0.12 },
  },
  tank: {
    name: 'Tank',
    blurb: 'Heavy armor. Big cannon and a coaxial machine gun.',
    hp: 480, speed: 115, radius: 28, flying: false,
    primary: { kind: 'shell', name: 'Cannon', dmg: 65, splash: 60, rate: 1.1, speed: 760, range: 1000 },
    alt: { kind: 'bullet', name: 'Coax MG', dmg: 7, rate: 0.1, speed: 950, range: 650, spread: 0.06 },
  },
  drone: {
    name: 'Drone',
    blurb: 'Flies over walls. Minigun and dropped bombs.',
    hp: 75, speed: 270, radius: 16, flying: true,
    primary: { kind: 'bullet', name: 'Minigun', dmg: 6, rate: 0.1, speed: 900, range: 650, spread: 0.05 },
    alt: { kind: 'bomb', name: 'Bomb drop', dmg: 95, splash: 95, rate: 2.8, fall: 0.7 },
  },
};

export const UNIT_TYPES = Object.keys(UNITS);
export const TEAMS = ['def', 'atk'];
export const RESPAWN_SECONDS = 5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function circleHitsRect(x, y, r, w) {
  const cx = clamp(x, w.x, w.x + w.w);
  const cy = clamp(y, w.y, w.y + w.h);
  return dist2(x, y, cx, cy) < r * r;
}

function pointInRect(x, y, w) {
  return x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h;
}

// Liang–Barsky: does the segment (x1,y1)-(x2,y2) cross the rectangle?
function segmentHitsRect(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, x1 - w.x],
    [dx, w.x + w.w - x1],
    [-dy, y1 - w.y],
    [dy, w.y + w.h - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function lineOfSight(x1, y1, x2, y2) {
  return !WALLS.some((w) => segmentHitsRect(x1, y1, x2, y2, w));
}

function segmentPointDist2(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len, 0, 1);
  return dist2(x1 + t * dx, y1 + t * dy, px, py);
}

function blocked(x, y, r, flying) {
  if (x < r || y < r || x > MAP.w - r || y > MAP.h - r) return true;
  if (flying) return false;
  if (dist2(x, y, HQ.x, HQ.y) < (HQ.r + r) ** 2) return true;
  return WALLS.some((w) => circleHitsRect(x, y, r, w));
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const BOT_NAMES = [
  'Viper', 'Hammer', 'Rhino', 'Bison', 'Grizzly', 'Titan', 'Anvil', 'Boulder', 'Mammoth', 'Ironside',
  'Brute', 'Juggernaut', 'Goliath', 'Bulldog', 'Warthog', 'Cobra', 'Panther', 'Rampart', 'Thunder', 'Havoc',
  'Sentinel', 'Bastion', 'Crusher', 'Grinder', 'Tusk', 'Wolverine', 'Scorpion', 'Basilisk', 'Kodiak', 'Onslaught',
];

export class Match {
  constructor({ players, botsPerTeam, minutes }) {
    this.units = new Map();
    this.projectiles = [];
    this.events = [];
    this.nextProjectileId = 1;
    this.time = 0;
    this.duration = minutes * 60;
    this.hqHp = HQ.hp;
    this.score = { def: 0, atk: 0 };
    this.winner = null;

    for (const p of players) this.addPlayer(p);
    for (const team of TEAMS) {
      for (let i = 0; i < botsPerTeam; i++) {
        // Mostly tanks, with a jeep and a drone mixed in every few slots.
        const type = i % 5 === 3 ? 'car' : i % 5 === 4 ? 'drone' : 'tank';
        // Each team draws from its own end of the list, so names never clash.
        const name = BOT_NAMES[team === 'def' ? i : BOT_NAMES.length - 1 - i];
        this.addUnit({ id: `bot-${team}-${i}`, name, team, type, isBot: true });
      }
    }
  }

  addPlayer(p) {
    this.addUnit({ id: p.id, name: p.name, team: p.team, type: p.unit, isBot: false });
  }

  addUnit({ id, name, team, type, isBot }) {
    const u = {
      id, name, team, type, isBot,
      nextType: type,
      x: 0, y: 0, aim: team === 'atk' ? 0 : Math.PI, hull: team === 'atk' ? 0 : Math.PI,
      hp: 0, alive: false, respawnAt: 0,
      cdPrimary: 0, cdAlt: 0,
      input: { up: false, down: false, left: false, right: false, aim: 0, fire: false, alt: false },
      kills: 0, deaths: 0,
      // bot brain
      target: null, thinkIn: 0, detour: 0, detourAngle: 0, lastX: 0, lastY: 0, stuckCheck: 0,
      guard: null,
    };
    this.units.set(id, u);
    this.spawn(u);
    return u;
  }

  removeUnit(id) {
    this.units.delete(id);
  }

  setInput(id, input) {
    const u = this.units.get(id);
    if (!u || u.isBot) return;
    u.input = {
      up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right,
      aim: Number.isFinite(input.aim) ? input.aim : u.input.aim,
      fire: !!input.fire, alt: !!input.alt,
    };
  }

  setNextType(id, type) {
    const u = this.units.get(id);
    if (u && UNITS[type]) u.nextType = type;
  }

  spawn(u) {
    u.type = u.nextType;
    const def = UNITS[u.type];
    const zone = SPAWNS[u.team];
    for (let tries = 0; tries < 40; tries++) {
      const x = zone.x + Math.random() * zone.w;
      const y = zone.y + Math.random() * zone.h;
      if (!blocked(x, y, def.radius, def.flying)) {
        u.x = x;
        u.y = y;
        break;
      }
    }
    u.hp = def.hp;
    u.alive = true;
    u.cdPrimary = 0;
    u.cdAlt = 0.5;
    u.aim = u.hull = u.team === 'atk' ? 0 : Math.PI;
    u.target = null;
    u.guard = null;
  }

  step(dt) {
    if (this.winner) return;
    this.time += dt;

    for (const u of this.units.values()) {
      if (!u.alive) {
        if (this.time >= u.respawnAt) this.spawn(u);
        continue;
      }
      if (u.isBot) this.think(u, dt);
      this.move(u, dt);
      this.shoot(u, dt);
    }

    this.updateProjectiles(dt);

    if (this.hqHp <= 0) this.winner = 'atk';
    else if (this.time >= this.duration) this.winner = 'def';
  }

  move(u, dt) {
    const def = UNITS[u.type];
    const i = u.input;
    let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    let dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * def.speed * dt;
      dy = (dy / len) * def.speed * dt;
      // Move one axis at a time so units slide along walls instead of sticking.
      if (!blocked(u.x + dx, u.y, def.radius, def.flying)) u.x += dx;
      if (!blocked(u.x, u.y + dy, def.radius, def.flying)) u.y += dy;
      u.hull = angleLerp(u.hull, Math.atan2(dy, dx), Math.min(1, dt * (u.type === 'tank' ? 5 : 12)));
    }
    u.aim = i.aim;
  }

  shoot(u, dt) {
    const def = UNITS[u.type];
    u.cdPrimary -= dt;
    u.cdAlt -= dt;
    if (u.input.fire && u.cdPrimary <= 0) {
      u.cdPrimary = def.primary.rate;
      this.fire(u, def.primary);
    }
    if (u.input.alt && u.cdAlt <= 0) {
      u.cdAlt = def.alt.rate;
      this.fire(u, def.alt);
    }
  }

  fire(u, w) {
    const def = UNITS[u.type];
    if (w.kind === 'bomb') {
      this.projectiles.push({
        id: this.nextProjectileId++, kind: 'bomb', team: u.team, owner: u.id,
        x: u.x, y: u.y, vx: 0, vy: 0, dmg: w.dmg, splash: w.splash,
        life: w.fall, fall: w.fall, weapon: w.name,
      });
      return;
    }
    const count = w.count ?? 1;
    for (let n = 0; n < count; n++) {
      const fan = count > 1 ? (n - (count - 1) / 2) * w.fan : 0;
      const a = u.aim + fan + (Math.random() - 0.5) * (w.spread ?? 0) * 2;
      const muzzle = def.radius + 6;
      this.projectiles.push({
        id: this.nextProjectileId++, kind: w.kind, team: u.team, owner: u.id,
        x: u.x + Math.cos(a) * muzzle, y: u.y + Math.sin(a) * muzzle,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        dmg: w.dmg, splash: w.splash ?? 0, life: w.range / w.speed, weapon: w.name,
      });
    }
    this.events.push(['f', w.kind, Math.round(u.x), Math.round(u.y)]);
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.kind === 'bomb') {
        if (p.life <= 0) this.explode(p, p.x, p.y);
        else keep.push(p);
        continue;
      }
      const ox = p.x;
      const oy = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      let hit = false;
      for (const u of this.units.values()) {
        if (!u.alive || u.team === p.team) continue;
        const r = UNITS[u.type].radius + 3;
        if (segmentPointDist2(ox, oy, p.x, p.y, u.x, u.y) < r * r) {
          if (p.splash) this.explode(p, p.x, p.y);
          else this.damage(u, p.dmg, p.owner, p.weapon);
          hit = true;
          break;
        }
      }
      if (!hit && p.team === 'atk' && segmentPointDist2(ox, oy, p.x, p.y, HQ.x, HQ.y) < HQ.r * HQ.r) {
        if (p.splash) this.explode(p, p.x, p.y);
        else this.damageHq(p.dmg);
        hit = true;
      }
      if (!hit && (WALLS.some((w) => pointInRect(p.x, p.y, w)) || p.x < 0 || p.y < 0 || p.x > MAP.w || p.y > MAP.h)) {
        if (p.splash) this.explode(p, p.x, p.y);
        else this.events.push(['s', Math.round(p.x), Math.round(p.y)]);
        hit = true;
      }
      if (!hit && p.life <= 0) {
        if (p.splash) this.explode(p, p.x, p.y);
        hit = true;
      }
      if (!hit) keep.push(p);
    }
    this.projectiles = keep;
  }

  explode(p, x, y) {
    this.events.push(['x', Math.round(x), Math.round(y), p.splash]);
    for (const u of this.units.values()) {
      if (!u.alive || u.team === p.team) continue;
      const d = Math.sqrt(dist2(x, y, u.x, u.y)) - UNITS[u.type].radius;
      if (d < p.splash) {
        const falloff = 1 - Math.max(0, d) / p.splash * 0.6;
        this.damage(u, p.dmg * falloff, p.owner, p.weapon);
      }
    }
    if (p.team === 'atk') {
      const d = Math.sqrt(dist2(x, y, HQ.x, HQ.y)) - HQ.r;
      if (d < p.splash) this.damageHq(p.dmg * (1 - Math.max(0, d) / p.splash * 0.6));
    }
  }

  damage(u, amount, ownerId, weapon) {
    u.hp -= amount;
    if (u.hp > 0) return;
    u.hp = 0;
    u.alive = false;
    u.deaths++;
    u.respawnAt = this.time + RESPAWN_SECONDS;
    const killer = this.units.get(ownerId);
    if (killer) {
      killer.kills++;
      this.score[killer.team]++;
    }
    this.events.push(['x', Math.round(u.x), Math.round(u.y), UNITS[u.type].radius * 2.5]);
    this.events.push(['k', ownerId, u.id, weapon]);
  }

  damageHq(amount) {
    this.hqHp = Math.max(0, this.hqHp - amount);
  }

  // ---- AI for the bot tankers -------------------------------------------

  think(b, dt) {
    const def = UNITS[b.type];
    const i = b.input;
    const range = def.primary.range ?? 700;

    b.thinkIn -= dt;
    if (b.thinkIn <= 0) {
      b.thinkIn = 0.35 + Math.random() * 0.2;
      let best = null;
      let bestD = (b.team === 'def' ? 900 : 750) ** 2;
      for (const u of this.units.values()) {
        if (!u.alive || u.team === b.team) continue;
        const d = dist2(b.x, b.y, u.x, u.y);
        if (d < bestD) {
          best = u;
          bestD = d;
        }
      }
      b.target = best ? best.id : null;
    }

    const target = b.target ? this.units.get(b.target) : null;
    let aimX = null;
    let aimY = null;
    let goalX;
    let goalY;
    let holdAt = 0;

    if (target && target.alive) {
      aimX = target.x;
      aimY = target.y;
      goalX = target.x;
      goalY = target.y;
      holdAt = range * 0.55;
    } else if (b.team === 'atk') {
      goalX = HQ.x;
      goalY = HQ.y;
      holdAt = range * 0.6;
      if (dist2(b.x, b.y, HQ.x, HQ.y) < range * range) {
        aimX = HQ.x;
        aimY = HQ.y;
      }
    } else {
      if (!b.guard || Math.random() < 0.003) {
        b.guard = { x: 2300 + Math.random() * 550, y: 450 + Math.random() * 1100 };
      }
      goalX = b.guard.x;
      goalY = b.guard.y;
      holdAt = 30;
    }

    const canSee = aimX !== null && lineOfSight(b.x, b.y, aimX, aimY);
    const goalDist = Math.sqrt(dist2(b.x, b.y, goalX, goalY));
    let moveAngle = Math.atan2(goalY - b.y, goalX - b.x);
    let moving = goalDist > holdAt || (aimX !== null && !canSee);

    // Notice when we are wedged against a wall and steer around it for a bit.
    b.stuckCheck -= dt;
    if (b.stuckCheck <= 0) {
      const travelled = Math.sqrt(dist2(b.x, b.y, b.lastX, b.lastY));
      if (moving && travelled < def.speed * 0.15 && b.detour <= 0) {
        b.detour = 0.8 + Math.random() * 0.8;
        b.detourAngle = moveAngle + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
      }
      b.lastX = b.x;
      b.lastY = b.y;
      b.stuckCheck = 0.5;
    }
    if (b.detour > 0) {
      b.detour -= dt;
      moveAngle = b.detourAngle;
      moving = true;
    }

    const mx = Math.cos(moveAngle);
    const my = Math.sin(moveAngle);
    i.right = moving && mx > 0.38;
    i.left = moving && mx < -0.38;
    i.down = moving && my > 0.38;
    i.up = moving && my < -0.38;

    if (aimX !== null) {
      const want = Math.atan2(aimY - b.y, aimX - b.x);
      i.aim = angleLerp(b.aim, want, Math.min(1, dt * 6)) + (Math.random() - 0.5) * 0.04;
      const inRange = dist2(b.x, b.y, aimX, aimY) < (range * 0.95) ** 2;
      i.fire = canSee && inRange;
      i.alt = canSee && inRange && Math.random() < 0.02;
    } else {
      i.aim = angleLerp(b.aim, b.hull, Math.min(1, dt * 3));
      i.fire = false;
      i.alt = false;
    }
  }

  // ---- Network snapshot -------------------------------------------------

  snapshot() {
    const units = [];
    for (const u of this.units.values()) {
      units.push([
        u.id, UNIT_TYPES.indexOf(u.type), u.team === 'def' ? 0 : 1,
        Math.round(u.x), Math.round(u.y),
        Math.round(u.aim * 100), Math.round(u.hull * 100),
        Math.ceil(u.hp), u.alive ? 1 : Math.max(0, Math.ceil(u.respawnAt - this.time)),
        u.alive ? 1 : 0, u.kills, u.deaths,
        Math.max(0, Math.round(u.cdAlt * 10)),
      ]);
    }
    const projectiles = this.projectiles.map((p) => [
      p.id, p.kind, Math.round(p.x), Math.round(p.y),
      p.kind === 'bomb' ? Math.round((1 - p.life / p.fall) * 100) : Math.round(Math.atan2(p.vy, p.vx) * 100),
      p.team === 'def' ? 0 : 1,
    ]);
    const events = this.events;
    this.events = [];
    return {
      t: 'state',
      time: Math.round(this.time * 1000),
      left: Math.max(0, Math.ceil(this.duration - this.time)),
      hq: Math.ceil(this.hqHp),
      score: this.score,
      units,
      projectiles,
      events,
    };
  }
}
