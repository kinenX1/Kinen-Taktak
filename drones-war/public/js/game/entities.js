// Entity manager: one UnitModel per unit in the match, posed every frame from the interpolated (or
// predicted, for the player's own unit) state; team nameplates with health bars; live projectiles with
// their models and smoke trails; burning wrecks and damaged vehicles; jet contrails; footsteps.
import * as THREE from 'three';
import { UNITS, UNIT_TYPES, TEAMS, TEAM_COLORS, PROJ_KINDS, P } from '../shared/units.js';
import { teamDefaultSuit } from '../shared/suit-options.js';
import { lineOfSight } from '../shared/physics.js';
import { createUnitModel, createProjectileModel } from '../models.js';
import { sampleUnit, sampleProj } from './net.js';

const PLATE_W = 256;
const PLATE_H = 64;
const ENEMY_PLATE_RANGE = 150;
const TRAIL_KIND = { rocket: 'rocket', missile: 'missile', artillery: 'artillery', shell: 'shell', grenade: 'grenade', bomb: null };
const _v = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion();
const _cam = new THREE.Vector3();

function plateTexture() {
  const cv = document.createElement('canvas');
  cv.width = PLATE_W;
  cv.height = PLATE_H;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { cv, ctx: cv.getContext('2d'), tex };
}

// Draws "NAME" in team color over a thin health bar.
function drawPlate(p, name, team, hpFrac, friendly) {
  const { ctx } = p;
  ctx.clearRect(0, 0, PLATE_W, PLATE_H);
  ctx.font = '600 26px Rajdhani, "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  const label = name.length > 16 ? name.slice(0, 15) + '…' : name;
  ctx.strokeText(label, PLATE_W / 2, 22);
  ctx.fillStyle = friendly ? '#9cc8ff' : '#ff8a7a';
  ctx.fillText(label, PLATE_W / 2, 22);
  const bw = 120;
  const x0 = (PLATE_W - bw) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0 - 2, 44, bw + 4, 10);
  ctx.fillStyle = hpFrac > 0.5 ? TEAM_COLORS[team] : hpFrac > 0.25 ? '#ffb030' : '#ff3a2a';
  ctx.fillRect(x0, 46, Math.max(0, bw * hpFrac), 6);
  p.tex.needsUpdate = true;
}

export class Entities {
  constructor({ scene, effects, audio, index, quality, roster, myId }) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.index = index;
    this.quality = quality;
    this.roster = roster || new Map();
    this.myId = myId;
    this.map = new Map(); // id → entity
    this.proj = new Map(); // id → { obj, kind }
    this.group = new THREE.Group();
    this.group.name = 'entities';
    scene.add(this.group);
    this._s = {};
    this._p = {};
    this._losT = 0;
  }

  setRoster(map) {
    this.roster = map || new Map();
    for (const e of this.map.values()) e.plateKey = '';
  }

  // Makes sure an entity exists with a model of the right type.
  ensure(id, row) {
    const type = UNIT_TYPES[row[1]] || 'soldier';
    const team = TEAMS[row[2]] || 'def';
    let e = this.map.get(id);
    if (e && e.type === type && e.team === team) return e;
    if (e) this._disposeModel(e);
    else {
      e = {
        id, type, team, model: null, state: {}, alive: false, wrecked: false, hp: 0, maxHp: 1,
        plate: null, plateKey: '', plateVis: false, los: true, view: 'third', stepAcc: 0, lastFire: -1e9,
        visible: true, pos: new THREE.Vector3(),
      };
      this.map.set(id, e);
    }
    e.type = type;
    e.team = team;
    const info = this.roster.get(id);
    const suit = info?.suit || teamDefaultSuit(team);
    e.model = createUnitModel(type, { team, suit, quality: this.quality });
    e.model.object.userData.unitId = id;
    this.group.add(e.model.object);
    e.wrecked = false;
    e.view = 'third';
    e.plateKey = '';
    return e;
  }

  _disposeModel(e) {
    if (!e.model) return;
    e.model.object.removeFromParent();
    e.model.dispose();
    e.model = null;
    if (e.plate) e.plate.sprite.visible = false;
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this._disposeModel(e);
    if (e.plate) {
      e.plate.sprite.removeFromParent();
      e.plate.tex.dispose();
      e.plate.sprite.material.dispose();
    }
    this.effects.endTrail('jetL' + id);
    this.effects.endTrail('jetR' + id);
    this.map.delete(id);
  }

  // Poses every unit for this frame. own = predicted render state of the player's unit (or null).
  update(dt, time, br, latest, own, camera, myTeam) {
    if (!latest) return;
    // Units that left the match.
    for (const id of this.map.keys()) if (!latest.units.has(id)) this.remove(id);
    camera.getWorldPosition(_cam);
    this._losT -= dt;
    const checkLos = this._losT <= 0;
    if (checkLos) this._losT = 0.2;
    for (const [id, row] of latest.units) {
      const e = this.ensure(id, row);
      const st = e.state;
      if (id === this.myId && own) {
        Object.assign(st, own);
        st.alive = !!(row[16] & 1);
        st.firing = own.firing;
        st.weapon = row[21];
      } else if (!sampleUnit(br, id, st)) {
        sampleUnit({ a: latest, b: null, k: 0 }, id, st);
      }
      e.hp = row[15];
      e.maxHp = UNITS[e.type].hp;
      e.alive = st.alive;
      e.pos.set(st.x, st.y, st.z);
      const m = e.model;
      if (e.wrecked !== !st.alive) {
        e.wrecked = !st.alive;
        m.setWrecked(e.wrecked);
      }
      m.update(st, dt, time);
      this._fx(e, st, dt, time);
      this._plate(e, myTeam, checkLos);
    }
    this._projectiles(br, latest);
  }

  // Burning damaged vehicles / wrecks, jet contrails, footsteps of nearby soldiers, rotor dust.
  _fx(e, st, dt) {
    const fx = this.effects;
    const def = UNITS[e.type];
    if (def.kind !== 'soldier' && (st.flags & 512)) {
      const intensity = st.alive ? 0.45 + 0.5 * (1 - e.hp / e.maxHp) : 1;
      _v.set(st.x, st.y + def.height * 0.6, st.z);
      fx.burning(e.id, _v, intensity);
    }
    if (e.type === 'jet' && st.alive && st.y > 30) {
      // Wingtip contrails at speed.
      const c = Math.cos(st.yaw);
      const s = Math.sin(st.yaw);
      const back = -3.2;
      const span = 4.6;
      _v.set(st.x + c * back - s * span, st.y + 0.6, st.z + s * back + c * span);
      fx.trail('jetR' + e.id, _v, 'jet');
      _v.set(st.x + c * back + s * span, st.y + 0.6, st.z + s * back - c * span);
      fx.trail('jetL' + e.id, _v, 'jet');
      e.contrail = true;
    } else if (e.contrail) {
      fx.endTrail('jetR' + e.id);
      fx.endTrail('jetL' + e.id);
      e.contrail = false;
    }
    if (!st.alive) return;
    const d2 = (st.x - _cam.x) ** 2 + (st.z - _cam.z) ** 2;
    if ((e.type === 'heli' || e.type === 'drone') && st.y < (e.type === 'heli' ? 14 : 4) && d2 < 200 * 200) {
      e.dustT = (e.dustT || 0) - dt;
      if (e.dustT <= 0) {
        e.dustT = 0.12;
        _v.set(st.x, 0.2, st.z);
        fx.dust(_v, (e.type === 'heli' ? 1.2 : 0.4) * (1 - st.y / 15));
      }
    }
    if ((e.type === 'tank' || e.type === 'jeep' || e.type === 'mlrs') && Math.abs(st.spd) > 4 && d2 < 160 * 160) {
      e.dustT = (e.dustT || 0) - dt;
      if (e.dustT <= 0) {
        e.dustT = 0.25;
        _v.set(st.x - Math.cos(st.yaw) * def.radius, 0.3, st.z - Math.sin(st.yaw) * def.radius);
        fx.dust(_v, e.type === 'tank' ? 0.6 : 0.3);
      }
    }
    // Footsteps of other soldiers within earshot (own footsteps are handled by the game).
    if (e.type === 'soldier' && e.id !== this.myId && st.onGround && d2 < 35 * 35) {
      const sp = Math.hypot(st.vx, st.vz);
      if (sp > 1) {
        e.stepAcc += sp * dt;
        const stride = st.sprint ? 2.6 : 2.1;
        if (e.stepAcc > stride) {
          e.stepAcc = 0;
          _v.set(st.x, st.y, st.z);
          this.audio.play('footstep', _v, { volume: st.crouch ? 0.25 : st.sprint ? 0.7 : 0.5, rate: 0.9 + Math.random() * 0.2 });
        }
      }
    }
  }

  _plate(e, myTeam, checkLos) {
    const st = e.state;
    const friendly = e.team === myTeam;
    const isMe = e.id === this.myId;
    let show = st.alive && !isMe && e.view === 'third';
    if (show && !friendly) {
      const d = Math.hypot(st.x - _cam.x, st.y - _cam.y, st.z - _cam.z);
      if (d > ENEMY_PLATE_RANGE) show = false;
      else {
        if (checkLos) e.los = lineOfSight(this.index, _cam.x, _cam.y, _cam.z, st.x, st.y + UNITS[e.type].height * 0.7, st.z);
        show = e.los;
      }
    }
    if (!show) {
      if (e.plate) e.plate.sprite.visible = false;
      return;
    }
    if (!e.plate) {
      const p = plateTexture();
      const mat = new THREE.SpriteMaterial({ map: p.tex, depthTest: false, depthWrite: false, transparent: true, fog: false, sizeAttenuation: false });
      p.sprite = new THREE.Sprite(mat);
      p.sprite.renderOrder = 50;
      p.sprite.scale.set(0.16, 0.04, 1);
      this.group.add(p.sprite);
      e.plate = p;
    }
    const name = this.roster.get(e.id)?.name || 'Unknown';
    const frac = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const key = `${name}|${e.team}|${friendly}|${Math.round(frac * 40)}`;
    if (key !== e.plateKey) {
      e.plateKey = key;
      drawPlate(e.plate, name, e.team, frac, friendly);
    }
    const a = e.model.anchors.nameplate;
    a.getWorldPosition(e.plate.sprite.position);
    e.plate.sprite.visible = true;
  }

  _projectiles(br, latest) {
    const live = br && br.b ? br.b.proj : latest.proj;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const add = (id, row) => {
      if (seen.has(id)) return;
      seen.add(id);
      const out = this._p;
      if (!sampleProj(br, id, out)) return;
      let p = this.proj.get(id);
      const kind = PROJ_KINDS[row[P.KIND]] || 'rocket';
      if (!p) {
        const team = TEAMS[row[P.TEAM]] || 'def';
        const obj = createProjectileModel(kind, team);
        this.group.add(obj);
        p = { obj, kind };
        this.proj.set(id, p);
      }
      p.obj.position.set(out.x, out.y, out.z);
      _v.set(out.vx, out.vy, out.vz);
      if (_v.lengthSq() > 1e-4) {
        _v.normalize();
        _q.setFromUnitVectors(_x, _v);
        p.obj.quaternion.copy(_q);
      }
      if (kind === 'grenade') p.obj.rotation.z += 0.3;
      const trail = TRAIL_KIND[kind];
      if (trail) this.effects.trail('p' + id, p.obj.position, trail);
    };
    if (br) for (const [id, row] of br.a.proj) add(id, row);
    for (const [id, row] of live) add(id, row);
    for (const [id, p] of this.proj) {
      if (seen.has(id) && (live.has(id) || (br && br.a.proj.has(id)))) continue;
      p.obj.removeFromParent();
      this.effects.endTrail('p' + id);
      this.proj.delete(id);
    }
  }

  // Ray against every live unit except `skipId` → { dist, id, head } | null (aim assist for the crosshair).
  raycastUnits(hitTest, o, d, maxDist, skipId) {
    let best = null;
    for (const e of this.map.values()) {
      if (e.id === skipId || !e.alive) continue;
      const h = hitTest(e.state, UNITS[e.type], o.x, o.y, o.z, d.x, d.y, d.z, best ? best.dist : maxDist);
      if (h && (!best || h.dist < best.dist)) best = { dist: h.dist, id: e.id, head: h.head };
    }
    return best;
  }

  dispose() {
    for (const id of [...this.map.keys()]) this.remove(id);
    for (const [id, p] of this.proj) {
      p.obj.removeFromParent();
      this.effects.endTrail('p' + id);
    }
    this.proj.clear();
    this.group.removeFromParent();
  }
}
