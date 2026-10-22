// Spartans V1 game client (contract §9.8): renderer + post chain, snapshot interpolation, own-unit
// prediction and reconciliation, entities, projectiles, events → effects/audio/HUD, camera views,
// first-person viewmodel, aim raycast, 30 Hz input, HUD, minimap, death cam, scoreboard, pause menu,
// game over, engine sound and footsteps.
//
// Smoothness rules: the own unit is simulated at a fixed 60 Hz with the shared physics and drawn
// between its last two ticks; mouse look is applied to the camera every frame (never smoothed);
// everybody else is drawn 100 ms in the past between two snapshots on a smoothed server clock.
import * as THREE from 'three';
import { UNITS, UNIT_TYPES, TEAMS, TEAM_COLORS, WEAPON_KINDS, PROJ_KINDS, U, FLAG } from './shared/units.js';
import { createWorldIndex, raycast, hitTestUnit, angleDiff, wrapAngle } from './shared/physics.js';
import { teamDefaultSuit } from './shared/suit-options.js';
import { buildWorld } from './world.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { createViewModel } from './viewmodels.js';
import { Renderer, qualityOf } from './game/post.js';
import { SnapBuffer } from './game/net.js';
import { Predictor, TICK } from './game/predict.js';
import { Entities } from './game/entities.js';
import { createUnitModel, createProjectileModel } from './models.js';
import { PauseMenu } from './game/menu.js';

// main.js records this at page load, before the lobby rewrites the URL to ?room=CODE.
const DEBUG = !!window.__dwDebugFlag;

const SURFACES = ['ground', 'building', 'metal', 'flesh', 'hq'];
const SEND_EVERY = 2; // fixed ticks per input message → 30 Hz
const MAX_TICKS = 8; // per frame; longer stalls resync from the server instead of fast-forwarding
const AIM_RANGE = 1000;
const VM_FOV = 78; // viewmodel camera FOV at hip (the model was framed for it)
const DEFAULT_SETTINGS = { quality: 'high', sensitivity: 1, adsSensitivity: 0.8, invertY: false, fov: 78, volume: 0.8 };
const MEDALS = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Fury Kill', 5: 'Frenzy Kill' };
const STREAKS = { 5: 'Killstreak 5', 10: 'Killstreak 10', 15: 'Killstreak 15', 20: 'Unstoppable' };
const ZOOM_FOV = { jeep: 42, tank: 36, mlrs: 40, drone: 34, heli: 38, jet: 48 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Game {
  constructor({ canvas, hudRoot, touchRoot, overlayRoot, send, myId, units, unitTypes, settings, touch,
    roster, onLeave, onPickUnit, onSettings } = {}) {
    this.canvas = canvas;
    this.hudRoot = hudRoot;
    this.touchRoot = touchRoot;
    this.overlayRoot = overlayRoot || hudRoot;
    this.send = send || (() => {});
    this.myId = myId;
    this.unitDefs = units || UNITS;
    this.unitTypes = unitTypes || UNIT_TYPES;
    this.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    this.touch = !!touch;
    this.roster = roster instanceof Map ? roster : new Map();
    this.onLeave = onLeave || (() => {});
    this.onPickUnit = onPickUnit || (() => {});
    this.onSettings = onSettings || (() => {});

    this.buffer = new SnapBuffer();
    this.running = false;
    this.ready = false;
    this.over = false;
    this.paused = false;
    this.selectedUnit = null;
    this.myTeam = 'def';
    this.myRow = null;
    this.alive = false;
    this.type = null;
    this.timeLeft = 0;
    this.hq = 1;
    this.hqMax = 1;
    this.score = { def: 0, atk: 0 };

    // Input / fixed-step state.
    this.seq = 0;
    this.tick = 0;
    this.acc = 0;
    this.input = null;
    this.cur = null; // input message used for the current pair of ticks
    this.slot = 0;
    this.reloadN = 0;
    this.grenadeN = 0;
    this.debugKeys = {};
    this.aimPoint = [0, 0, 0];
    this.aimDist = AIM_RANGE;
    this.aimUnit = null;

    // Local weapon feel.
    this.cool = 0;
    this.lastShot = -1e9;
    this.shots = 0;
    this.localMag = 0;
    this.reloadProg = -1;
    this.swapT = 0;
    this.lastSprint = -1e9;

    // Feedback bookkeeping.
    this.killTimes = [];
    this.streak = 0;
    this.pendingKillScore = 0;
    this.lastScore = null;
    this.killedBy = null;
    this.respawnLeft = 0;
    this.lockId = '';
    this.lockT = 0;
    this.lockBeep = 0;
    this.warnBeep = 0;
    this.stepAcc = 0;
    this.wasGround = true;
    this.lastVy = 0;
    this.mmT = 0;
    this.sbT = 0;
    this.showScores = false;
    this.chatWasOpen = false;
    this._viewedModel = null;

    // Diagnostics for headless tests.
    this.frameTimes = [];
    this.ownDeltas = [];
    this._lastOwn = null;
  }

  // ------------------------------------------------------------------ setup

  async start(world) {
    this.world = world;
    this.index = createWorldIndex(world);
    const quality = qualityOf(this.settings.quality);
    this.quality = quality;
    this.r = new Renderer(this.canvas, quality);
    const scene = new THREE.Scene();
    this.scene = scene;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, w / h, 0.1, 2600);
    this.camera.position.set(world.map.w / 2, 30, world.map.d / 2);
    scene.add(this.camera);
    this.worldView = buildWorld({ renderer: this.r.renderer, scene, world, quality });
    this.vmScene = new THREE.Scene();
    this.vmScene.environment = scene.environment;
    this.vmCamera = new THREE.PerspectiveCamera(VM_FOV, w / h, 0.01, 20);
    this.r.setup(scene, this.camera, this.vmScene, this.vmCamera, world.timeOfDay);

    this.effects = new Effects(scene, { quality });
    this.rig = new CameraRig(this.camera);
    this.input = new Input({ canvas: this.canvas, touchRoot: this.touchRoot, touch: this.touch });
    this.hud = new Hud(this.hudRoot, { touch: this.touch });
    this.hud.setDefs(this.unitDefs, this.unitTypes);
    this.hud.setMyId?.(this.myId);
    this.hud.show(true);
    this.entities = new Entities({ scene, effects: this.effects, audio, index: this.index, quality, roster: this.roster, myId: this.myId });
    this.predictor = new Predictor(this.index);
    this.menu = new PauseMenu(this.overlayRoot, {
      team: this.myTeam,
      onResume: () => this._resume(),
      onLeave: () => this.onLeave(),
      onChange: (s) => {
        this.setSettings(s);
        this.onSettings({ ...this.settings });
      },
    });
    this.setSettings(this.settings);
    this._wireInput();
    audio.unlock().catch(() => {});
    this.cur = this._neutralInput();

    // Compile every shader the match can need before the first frame, so shooting, explosions,
    // wrecks and new vehicle types never freeze the game mid-fight.
    this._warmup();

    if (DEBUG) this._installDebug();
    this.ready = true;
    this.running = true;
    const latest = this.buffer.latest;
    if (latest) this._onMyRow(latest.units.get(this.myId));
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  // Builds one of everything (each unit for both teams, intact and wrecked, every projectile, the
  // first-person weapons mid-shot, every effect pool), makes it all visible and renders it once.
  // The models are kept (not disposed) so three.js keeps their compiled programs cached.
  _warmup() {
    const { scene, camera } = this;
    const group = new THREE.Group();
    this._warm = [];
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    group.position.copy(camera.position).addScaledVector(fwd, 30);
    for (const team of TEAMS) {
      for (const type of UNIT_TYPES) {
        for (const wrecked of [false, true]) {
          try {
            const m = createUnitModel(type, { team, suit: teamDefaultSuit(team), quality: this.quality });
            if (wrecked) {
              m.setWrecked(true);
              // Vehicles swap to the burnt material on their next update, so apply it now.
              if (m.applyWreck) m.applyWreck(true);
            }
            m.flash?.(0);
            m.flash?.(1);
            group.add(m.object);
            this._warm.push(m);
          } catch { /* a model that fails here would fail in play too; skip it */ }
        }
      }
      for (const kind of PROJ_KINDS) {
        try { group.add(createProjectileModel(kind, team)); } catch { /* ignore */ }
      }
    }
    let vm = null;
    try {
      vm = createViewModel({ suit: teamDefaultSuit(this.myTeam), team: this.myTeam, quality: this.quality });
      vm.fire(0);
      this.vmScene.add(vm.object);
      this._warm.push(vm);
    } catch { vm = null; }

    const shown = [];
    const reveal = (root) => root?.traverse((o) => {
      if (!o.visible) { o.visible = true; shown.push(o); }
    });
    scene.add(group);
    reveal(group);
    reveal(this.effects.group);
    reveal(vm?.object);
    const r = this.r.renderer;
    try {
      r.compile(scene, camera);
      r.compile(this.vmScene, this.vmCamera);
      this.r.render(0, true); // also builds shadow and post-processing programs
    } catch { /* warm-up is best effort */ }
    for (const o of shown) o.visible = false;
    scene.remove(group);
    if (vm) this.vmScene.remove(vm.object);
  }

  _wireInput() {
    const inp = this.input;
    this._handlers = {
      view: () => this._cycleView(),
      weapon: (v) => this._selectWeapon(v),
      reload: () => {
        if (this.alive) this.reloadN++;
      },
      grenade: () => this._throwGrenade(),
      unit: (i) => {
        const type = this.unitTypes[i];
        if (type && !this.alive) this._pickUnit(type);
      },
      scores: (on) => {
        this.showScores = !!on;
        this.sbT = 0;
        if (!on) this.hud.scoreboard(false);
      },
      chat: () => this._openChat(),
      mute: () => {
        audio.setMuted(!audio.muted);
        this.hud.toast(audio.muted ? 'SOUND OFF' : 'SOUND ON', 1400);
      },
      pause: (on) => {
        if (on) this._pause();
        else if (this.paused) this._resume();
      },
      jump: () => {},
    };
    for (const [name, fn] of Object.entries(this._handlers)) inp.on(name, fn);
  }

  // ------------------------------------------------------------------ public API

  handleState(msg) {
    if (!msg || !Array.isArray(msg.units)) return;
    const now = performance.now();
    const snap = this.buffer.push(msg, now);
    this.timeLeft = msg.left;
    this.hq = msg.hq;
    this.hqMax = msg.hqMax || 1;
    if (msg.score) this.score = msg.score;
    if (!this.ready) return;
    this.worldView.setHqDamage(clamp(1 - this.hq / this.hqMax, 0, 1));
    // Events first: a kill event must be known before the death transition below.
    if (Array.isArray(msg.ev)) for (const ev of msg.ev) this._event(ev);
    this._onMyRow(snap.units.get(this.myId));
  }

  handleOver(msg) {
    if (!msg) return;
    this.over = true;
    this.paused = false;
    this.menu?.hide();
    if (!this.ready) return;
    this.input.enabled = false;
    this.input.releasePointerLock();
    this.hud.hideDeath();
    this.hud.scoreboard(false);
    this.hud.over({ winner: msg.winner, myTeam: this.myTeam, reason: msg.reason, score: msg.score, hq: msg.hq, hqMax: msg.hqMax, board: msg.board });
    audio.engine(null);
    audio.play(msg.winner === this.myTeam ? 'win' : 'lose');
  }

  handleChat(msg) {
    if (this.ready && msg) this.hud.chatLine({ from: msg.from, team: msg.team, text: msg.text });
  }

  setRoster(map) {
    this.roster = map instanceof Map ? map : new Map();
    this.entities?.setRoster(this.roster);
  }

  setSelectedUnit(type) {
    if (UNITS[type]) this.selectedUnit = type;
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...(settings || {}) };
    const s = this.settings;
    if (this.input) {
      this.input.sensitivity = +s.sensitivity || 1;
      this.input.adsSensitivity = +s.adsSensitivity || 0.8;
      this.input.invertY = !!s.invertY;
    }
    audio.setVolume(clamp(+s.volume, 0, 1));
  }

  stop() {
    if (!this.running && !this.ready) return;
    this.running = false;
    this.ready = false;
    cancelAnimationFrame(this._raf);
    audio.engine(null);
    try {
      this.input?.releasePointerLock();
      this.input?.dispose();
      this.hud?.dispose();
      this.menu?.dispose();
      this.vm?.dispose();
      for (const m of this._warm || []) m.dispose?.();
      this._warm = null;
      this.entities?.dispose();
      this.effects?.dispose();
      this.worldView?.dispose();
      this.r?.dispose();
    } finally {
      if (window.__dwGame === this) delete window.__dwGame;
    }
  }

  // ------------------------------------------------------------------ own unit lifecycle

  _onMyRow(row) {
    if (!row) return;
    this.myRow = row;
    this.myTeam = TEAMS[row[U.TEAM]] || 'def';
    const alive = !!(row[U.FLAGS] & FLAG.ALIVE);
    const type = UNIT_TYPES[row[U.TYPE]];
    if (alive) {
      if (!this.alive || !this.predictor.active || type !== this.type) this._spawn(row);
      else this.predictor.reconcile(row);
    } else {
      this.respawnLeft = row[U.RESPAWN];
      if (!this.over && (this.alive || !this.deathShown)) this._die(row);
    }
    // Local magazine follows the server whenever we are not mid-burst.
    if (performance.now() - this.lastShot > 250) this.localMag = row[U.MAG];
    else this.localMag = Math.min(this.localMag, row[U.MAG]);
    this._scoreDelta(row[U.SCORE]);
  }

  _spawn(row) {
    const type = UNIT_TYPES[row[U.TYPE]];
    const sameType = type === this.type;
    this.type = type;
    this.def = UNITS[type];
    this.alive = true;
    this.deathShown = false;
    this.predictor.reset(row);
    this.rig.setUnit(type, { keepMode: sameType });
    // Face the middle of the map (where the fight is) rather than whatever the spawn row says.
    const map = this.world.map;
    this.rig.yaw = Math.atan2(map.d / 2 - row[U.Z], map.w / 2 - row[U.X]);
    if (this.def.kind === 'jet' || this.def.kind === 'air') this.rig.yaw = row[U.YAW] || this.rig.yaw;
    this.rig.pitch = 0;
    this.input.setUnitKind(type, type);
    this.input.alive = true;
    this.slot = 0;
    this.cool = 0;
    this.shots = 0;
    this.streak = 0;
    this.localMag = row[U.MAG];
    this.reloadProg = -1;
    this.lockId = '';
    this.lockT = 0;
    this.acc = 0;
    this.hud.hideDeath();
    if (!this.selectedUnit) this.selectedUnit = type;
    if (type === 'soldier' && !this.vm) {
      const info = this.roster.get(this.myId);
      this.vm = createViewModel({ suit: info?.suit || teamDefaultSuit(this.myTeam), team: this.myTeam, quality: this.quality });
      this.vmScene.add(this.vm.object);
    }
    this._viewedModel = null; // re-apply setView on the (possibly new) model
    this.hud.setViewOverlay(type, this.rig.mode);
    this.menu.el.style.setProperty('--dw-team', TEAM_COLORS[this.myTeam]);
    audio.play('spawn');
  }

  _die(row) {
    this.alive = false;
    this.predictor.clear();
    this.input.alive = false;
    this.respawnLeft = row[U.RESPAWN];
    this.hud.setViewOverlay(null, 'third');
    audio.engine(null);
    if (this.over || !this.ready) return;
    this.deathShown = true;
    const k = this.killedBy;
    const killer = k && k.killerId !== this.myId ? this.roster.get(k.killerId)?.name || 'Enemy' : null;
    this.hud.deathScreen({
      killer, weapon: k?.weapon, respawnIn: this.respawnLeft || 5, units: this.unitDefs, unitTypes: this.unitTypes,
      selected: this.selectedUnit || this.type || 'soldier', onPick: (t) => this._pickUnit(t),
    });
  }

  _pickUnit(type) {
    if (!UNITS[type]) return;
    this.selectedUnit = type;
    this.send({ t: 'unit', unit: type });
    this.onPickUnit(type);
    if (!this.alive && this.deathShown) this.hud._selectDeathCard?.(type);
  }

  _cycleView() {
    if (!this.alive) return;
    const mode = this.rig.cycleMode();
    const e = this.entities.map.get(this.myId);
    if (e?.model) {
      e.model.setView(mode);
      e.view = mode;
    }
    this._viewedModel = e?.model || null;
    this.hud.setViewOverlay(this.type, mode);
    this.camera.near = mode === 'third' ? 0.1 : 0.05;
    this.camera.updateProjectionMatrix();
  }

  _selectWeapon(v) {
    if (!this.alive || this.type !== 'soldier') return;
    const next = v === 'next' ? 1 - this.slot : v === 1 ? 1 : 0;
    if (next === this.slot) return;
    this.slot = next;
    this.swapT = 0.45;
    this.reloadProg = -1;
    audio.play('swap');
  }

  _throwGrenade() {
    if (!this.alive || this.type !== 'soldier' || !this.myRow || this.myRow[U.GRENADES] <= 0 || this.swapT > 0) return;
    if (performance.now() - (this._lastNade || 0) < 1200) return;
    this._lastNade = performance.now();
    this.grenadeN++;
    this.vm?.throwGrenade();
  }

  _openChat() {
    if (this.hud.chatOpen || this.over) return;
    this.input.enabled = false;
    this.hud.openChat((text) => {
      text = String(text || '').trim().slice(0, 140);
      if (text) this.send({ t: 'chat', text });
    });
    this.chatWasOpen = true;
  }

  _pause() {
    if (this.paused || this.over) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.releasePointerLock();
    this.menu.show(this.settings);
  }

  _resume() {
    if (!this.paused) return;
    this.paused = false;
    this.menu.hide();
    this.input.enabled = true;
    if (!this.touch) this.input.requestPointerLock();
  }

  // ------------------------------------------------------------------ input

  _neutralInput() {
    return {
      t: 'input', seq: this.seq, rt: Math.round(this.buffer.rt), mx: 0, mz: 0, up: false, down: false, crouch: false,
      sprint: false, ads: false, fire: false, alt: false, weapon: this.slot, reloadN: this.reloadN, grenadeN: this.grenadeN,
      look: [this.rig ? this.rig.yaw : 0, this.rig ? this.rig.pitch : 0], aim: null,
    };
  }

  _sampleInput() {
    this.seq++;
    const st = { ...this.input.state, ...this.debugKeys };
    const msg = this._neutralInput();
    msg.seq = this.seq;
    if (this.alive && !this.paused && !this.over) {
      const soldier = this.type === 'soldier';
      msg.mx = clamp(+st.mx || 0, -1, 1);
      msg.mz = clamp(+st.mz || 0, -1, 1);
      msg.up = !!st.up;
      msg.down = !!st.down;
      msg.crouch = soldier && !!st.crouch;
      msg.ads = soldier ? !!st.ads : !!(st.zoom || st.ads);
      msg.fire = !!st.fire;
      // Firing (or aiming) breaks a sprint, like CoD: the server refuses to shoot while sprinting.
      msg.sprint = soldier && !!st.sprint && !msg.fire && !msg.ads;
      msg.alt = !soldier && !!st.alt;
      msg.aim = [+this.aimPoint[0].toFixed(2), +this.aimPoint[1].toFixed(2), +this.aimPoint[2].toFixed(2)];
    }
    msg.look = [+this.rig.yaw.toFixed(4), +this.rig.pitch.toFixed(4)];
    this.send(msg);
    return msg;
  }

  // ------------------------------------------------------------------ frame

  _frame(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame((t) => this._frame(t));
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt > 0)) dt = 0.001;
    const rawDt = dt;
    dt = Math.min(dt, 0.1);
    this.time = now / 1000;
    try {
      this._update(dt, now, rawDt);
    } catch (e) {
      // Never let one bad frame kill the loop; surface it for tests.
      console.error(e);
      this.lastError = String(e && e.stack || e);
    }
  }

  _update(dt, now, rawDt) {
    const rt = this.buffer.advance(now, dt);
    const latest = this.buffer.latest;
    const br = this.buffer.bracket(rt);
    if (this.chatWasOpen && !this.hud.chatOpen) {
      this.chatWasOpen = false;
      if (!this.paused && !this.over) this.input.enabled = true;
    }

    // Mouse look straight into the camera angles.
    const look = this.input.takeLook();
    const wheel = this.input.takeWheel();
    if (this.alive && !this.paused) {
      this.rig.addLook(look.dx, look.dy);
      if (wheel && this.rig.mode === 'third') this.rig.zoomDistance(wheel);
    }

    // Fixed-step prediction; inputs go out every SEND_EVERY ticks.
    this.swapT = Math.max(0, this.swapT - dt);
    if (rawDt > 0.5 && this.alive && this.myRow) {
      // Returning from a background tab: resync instead of replaying seconds of input.
      this.predictor.reset(this.myRow);
      this.acc = 0;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n < MAX_TICKS) {
      if (this.tick % SEND_EVERY === 0) this.cur = this._sampleInput();
      if (this.alive) {
        const res = this.predictor.step(this.cur, this.cur.seq, this.cur.aim || this.aimPoint);
        if (res.impact > 9) this.rig.shake(Math.min(0.6, res.impact / 30));
      }
      this.tick++;
      this.acc -= TICK;
      n++;
    }
    if (n === MAX_TICKS) this.acc = 0;
    const own = this.alive ? this.predictor.renderState(this.acc / TICK, dt) : null;
    if (own && this.type === 'soldier') {
      // The body faces the live look direction (prediction only samples it at 30 Hz).
      own.yaw = this.rig.yaw;
      own.aimYaw = this.rig.yaw;
      own.aimPitch = clamp(this.rig.pitch, this.def.aim.pitchMin, this.def.aim.pitchMax);
    }
    if (own) own.firing = now - this.lastShot < 150;

    const prof = this.prof;
    let t0 = prof ? performance.now() : 0;
    const mark = prof ? (k) => { const t = performance.now(); prof[k] = (prof[k] || 0) * 0.9 + (t - t0) * 0.1; t0 = t; } : () => {};
    mark('tick');
    this.entities.update(dt, this.time, br, latest, own, this.camera, this.myTeam);
    mark('entities');
    const me = this.entities.map.get(this.myId);
    if (me?.model && me.model !== this._viewedModel) {
      const mode = this.alive ? this.rig.mode : 'third';
      me.model.setView(mode);
      me.view = mode;
      this._viewedModel = me.model;
    }

    this._camera(dt, own, me);
    this._aim(own);
    this._weapon(dt, now, own, me);
    this._viewmodel(dt, look, own);
    this._sounds(dt, own);
    mark('local');
    this.worldView.update(dt, this.time, this.camera);
    mark('world');
    this.effects.update(dt, this.camera);
    mark('effects');
    this._hud(dt, own, me);
    mark('hud');
    this.r.render(this.time, this._vmVisible);
    mark('render');
    this.r.adapt(dt);
    this._stats(dt, own);
  }

  _camera(dt, own, me) {
    const cam = this.camera;
    const raycastFn = (o, d, max) => {
      const h = raycast(this.index, o.x, o.y, o.z, d.x, d.y, d.z, max);
      return h ? h.dist : max;
    };
    if (own) {
      const mode = this.rig.mode;
      const anchors = me?.model?.anchors;
      let anchor = null;
      if (mode === 'first' && this.type !== 'soldier') anchor = anchors?.first || null;
      else if (mode === 'gunner') anchor = anchors?.gunner || anchors?.first || null;
      let zoomFov = null;
      const st = { ...this.input.state, ...this.debugKeys };
      if (this.type === 'soldier') {
        if (st.ads && !own.sprint) zoomFov = mode === 'first' && this.vm ? this.vm.adsFov(this.slot) : this.settings.fov * 0.8;
      } else if (st.zoom || st.ads) {
        zoomFov = mode === 'gunner' ? 22 : ZOOM_FOV[this.type] || 45;
      }
      _pos.set(own.x, own.y, own.z);
      this.rig.update(dt, {
        position: _pos, yaw: own.yaw, pitch: own.pitch, roll: own.roll, type: this.type, anchor, alive: true,
        spd: own.spd, crouch: own.crouch, sprint: own.sprint,
      }, { raycast: raycastFn, zoomFov, baseFov: this.settings.fov, dt });
      const near = mode === 'third' ? 0.1 : 0.05;
      if (cam.near !== near) {
        cam.near = near;
        cam.updateProjectionMatrix();
      }
    } else if (this.myRow) {
      // Death cam: orbit the killer while they live, else our own wreck.
      const k = this.killedBy && this.entities.map.get(this.killedBy.killerId);
      const center = k && k.alive && k.id !== this.myId && k.pos.distanceTo(me ? me.pos : k.pos) < 400 ? k.pos : me ? me.pos : _pos.set(this.myRow[U.X], this.myRow[U.Y], this.myRow[U.Z]);
      this.rig._raycast = raycastFn;
      this.rig.deathCam(center, dt);
    }
    cam.updateMatrixWorld();
  }

  // Crosshair ray against the world and every other unit: the server aims there.
  _aim(own) {
    const cam = this.camera;
    cam.getWorldPosition(_v);
    this.rig.forward(_dir);
    let dist = AIM_RANGE;
    const h = raycast(this.index, _v.x, _v.y, _v.z, _dir.x, _dir.y, _dir.z, AIM_RANGE);
    if (h) dist = h.dist;
    const u = this.entities.raycastUnits(hitTestUnit, _v, _dir, dist, this.myId);
    this.aimUnit = u;
    if (u) dist = u.dist;
    // A ray that starts behind the own unit (third person) must not aim at ourselves or the dirt next to us.
    if (own && this.rig.mode === 'third') dist = Math.max(dist, this.rig.chaseDistance + 2);
    this.aimDist = dist;
    this.aimPoint[0] = _v.x + _dir.x * dist;
    this.aimPoint[1] = _v.y + _dir.y * dist;
    this.aimPoint[2] = _v.z + _dir.z * dist;
  }

  // Local weapon feel: hitscan shots are shown and heard the moment the trigger allows (the server
  // confirms hits); projectile weapons wait for the server's 'f' event.
  _weapon(dt, now, own, me) {
    const row = this.myRow;
    if (!own || !row) return;
    const soldier = this.type === 'soldier';
    const slot = soldier ? this.slot : 0;
    const w = this.def.weapons[slot];
    // Reload progress, advanced locally between snapshots so the animation is smooth.
    const srv = soldier && row[U.WEAPON] !== this.slot ? -1 : row[U.RELOAD];
    if (srv >= 0) {
      if (this.reloadProg < 0 || Math.abs(this.reloadProg - srv) > 0.15) this.reloadProg = srv;
      else this.reloadProg = Math.min(1, this.reloadProg + dt / w.reload);
    } else this.reloadProg = -1;
    this.cool -= dt;
    const st = { ...this.input.state, ...this.debugKeys };
    if (!st.fire || this.paused || this.over || w.kind !== 'hitscan') return;
    if (soldier && (this.swapT > 0 || (row[U.WEAPON] !== this.slot))) return;
    if (this.reloadProg >= 0 || this.localMag <= 0 || this.cool > 0) return;
    this.cool = Math.max(this.cool + (w.rate || 0.1), 0);
    this.localMag--;
    this.lastShot = now;
    this.shots++;
    const first = this.rig.mode !== 'third';
    if (soldier && first && this.vm) this.vm.fire(slot);
    me?.model?.flash(slot);
    audio.play(w.sound, null, { volume: 0.9, rate: 0.97 + Math.random() * 0.06 });
    const kick = soldier ? (w.recoil || 0.01) * (st.ads ? 0.55 : 1) : 0.0035;
    this.rig.kick(kick, (Math.random() - 0.5) * kick * 0.6);
    // Muzzle point: the model's muzzle anchor in third person, a spot right of and below the eye in first.
    const cam = this.camera;
    if (first && soldier) {
      _v.set(0.12, -0.12, -0.7).applyMatrix4(cam.matrixWorld);
    } else if (me?.model?.anchors?.muzzle?.[slot]) {
      me.model.anchors.muzzle[slot].getWorldPosition(_v);
    } else cam.getWorldPosition(_v);
    if (!(soldier && first)) {
      this.rig.forward(_dir);
      this.effects.muzzleFlash(_v, _dir, soldier ? 0.6 : 1);
    }
    if (w.tracer && this.shots % w.tracer === 0) {
      _v2.set(this.aimPoint[0], this.aimPoint[1], this.aimPoint[2]);
      this.effects.tracer(_v, _v2, this.myTeam);
    }
    if (soldier && !first) {
      this.rig.forward(_dir);
      this.effects.shellCasing(_v, _dir);
    }
    if (!soldier) this.rig.shake(0.05);
  }

  _viewmodel(dt, look, own) {
    const vm = this.vm;
    const show = !!(vm && own && this.type === 'soldier' && this.rig.mode === 'first' && !this.over);
    this._vmVisible = show;
    if (!vm) return;
    vm.object.visible = show;
    if (!show) return;
    const st = { ...this.input.state, ...this.debugKeys };
    const speed = Math.hypot(own.vx, own.vz);
    vm.update(dt, {
      weapon: this.slot, ads: st.ads && !own.sprint ? 1 : 0, sprint: own.sprint, moving: clamp(speed / this.def.speed, 0, 1),
      lookDx: look.dx, lookDy: look.dy, grounded: own.onGround, crouch: own.crouch, reloading: this.reloadProg,
      aspect: this.camera.aspect,
    });
    // The viewmodel keeps its own FOV at hip and follows the world camera into ADS.
    const fov = Math.min(this.camera.fov, VM_FOV);
    if (Math.abs(this.vmCamera.fov - fov) > 0.01) {
      this.vmCamera.fov = fov;
      this.vmCamera.updateProjectionMatrix();
    }
  }

  _sounds(dt, own) {
    const cam = this.camera;
    cam.getWorldPosition(_v);
    this.rig.forward(_dir);
    audio.setListener(_v, _dir, _up);
    if (!own) return;
    const def = this.def;
    if (this.type === 'soldier') {
      audio.engine(null);
      const ground = own.onGround;
      if (ground && !this.wasGround && this.lastVy < -4) audio.play('land', null, { volume: clamp(-this.lastVy / 10, 0.3, 1) });
      if (!ground && this.wasGround && own.vy > 2) audio.play('jump', null, { volume: 0.6 });
      this.wasGround = ground;
      this.lastVy = own.vy;
      if (ground) {
        const sp = Math.hypot(own.vx, own.vz);
        this.stepAcc += sp * dt;
        const stride = own.sprint ? 2.7 : own.crouch ? 1.5 : 2.15;
        if (sp > 0.8 && this.stepAcc > stride) {
          this.stepAcc = 0;
          audio.play('footstep', null, { volume: own.crouch ? 0.25 : own.sprint ? 0.75 : 0.5, rate: 0.92 + Math.random() * 0.16 });
        }
      }
    } else {
      const max = def.kind === 'jet' ? def.speedMax : def.speed;
      const st = { ...this.input.state, ...this.debugKeys };
      const throttle = def.kind === 'jet' ? own.throttle : Math.max(Math.abs(st.mz || 0), Math.abs(st.mx || 0) * 0.6, st.up || st.down ? 0.7 : 0);
      audio.engine(this.type, { speed01: clamp(Math.abs(own.spd || Math.hypot(own.vx, own.vy, own.vz)) / max, 0, 1), throttle01: throttle });
    }
  }

  // ------------------------------------------------------------------ events

  _event(ev) {
    const type = ev[0];
    switch (type) {
      case 'f': return this._shot(ev);
      case 'h': {
        _v.set(ev[1], ev[2], ev[3]);
        const surface = SURFACES[ev[4]] || 'ground';
        this.effects.impact(_v, null, surface);
        const d = _v.distanceTo(this.camera.position);
        if (d < 40 && Math.random() < 0.35) audio.play(surface === 'metal' ? 'ricochet' : 'impact', _v, { volume: 0.5 });
        return;
      }
      case 'x': {
        _v.set(ev[1], ev[2], ev[3]);
        const r = ev[4] || 6;
        const big = !!ev[5];
        this.effects.explosion(_v, r, big);
        audio.play(big ? 'explosion_big' : 'explosion', _v);
        const d = _v.distanceTo(this.camera.position);
        const amt = (big ? 1 : 0.7) * clamp(1 - d / (r * 9 + 30), 0, 1);
        if (amt > 0.02) this.rig.shake(amt * 0.8);
        return;
      }
      case 'd': return this._damage(ev);
      case 'k': return this._kill(ev);
      case 'g': {
        if (ev[1] === this.myId) return;
        const e = this.entities.map.get(ev[1]);
        if (e) audio.play('grenade', e.pos, { volume: 0.6 });
        return;
      }
      case 'r': {
        if (ev[1] === this.myId) audio.play('reload', null, { volume: 0.8 });
        else {
          const e = this.entities.map.get(ev[1]);
          if (e && e.type === 'soldier') audio.play('reload', e.pos, { volume: 0.4 });
        }
        return;
      }
      default:
    }
  }

  _shot(ev) {
    const [, id, slot, kindIdx, ox, oy, oz, dx, dy, dz, range, tracer] = ev;
    const e = this.entities.map.get(id);
    const kind = WEAPON_KINDS[kindIdx] || 'hitscan';
    const mine = id === this.myId;
    if (e) e.lastFire = performance.now();
    if (mine && kind === 'hitscan') return; // already shown locally
    const unitType = e ? e.type : 'soldier';
    const w = UNITS[unitType]?.weapons[slot] || null;
    _dir.set(dx, dy, dz);
    _v.set(ox, oy, oz);
    const firstSoldier = mine && this.type === 'soldier' && this.rig.mode === 'first';
    if (e?.model && !firstSoldier) {
      e.model.flash(slot);
      const m = e.model.anchors.muzzle?.[slot];
      if (m && _v2.copy(e.pos).distanceToSquared(this.camera.position) < 300 * 300) m.getWorldPosition(_v);
    }
    const size = kind === 'shell' ? 2.4 : kind === 'artillery' ? 1.8 : kind === 'hitscan' ? (unitType === 'soldier' ? 0.6 : 1) : 1.3;
    if (!firstSoldier && kind !== 'bomb') this.effects.muzzleFlash(_v, _dir, size);
    if (w) audio.play(w.sound, mine ? null : _v2.set(ox, oy, oz), { volume: mine ? 1 : 0.9 });
    if (kind === 'hitscan' && tracer) {
      _v2.set(ox + dx * range, oy + dy * range, oz + dz * range);
      this.effects.tracer(_v, _v2, e ? e.team : undefined);
    }
    if ((kind === 'shell' || kind === 'artillery') && e && e.pos.distanceTo(this.camera.position) < 120) {
      _v2.set(e.pos.x, 0.3, e.pos.z);
      this.effects.dust(_v2, kind === 'shell' ? 1.2 : 0.8);
    }
    if (mine) {
      if (this.type === 'soldier') {
        if (firstSoldier) this.vm?.fire(slot);
        this.rig.kick(0.05, 0);
        this.rig.shake(0.25);
      } else {
        this.rig.shake(kind === 'shell' ? 0.45 : 0.2);
        this.rig.kick(kind === 'shell' ? 0.03 : 0.01, 0);
      }
    }
  }

  _damage(ev) {
    const [, victim, attacker, amount, ax, az, head] = ev;
    if (attacker === this.myId && victim !== this.myId) {
      this.hud.hitMarker({ kill: false, headshot: !!head });
      audio.play(head ? 'headshot' : 'hitmarker', null, { volume: 0.7 });
    }
    if (victim === this.myId && this.myRow) {
      const x = this.myRow[U.X];
      const z = this.myRow[U.Z];
      if (Math.abs(ax - x) + Math.abs(az - z) > 0.5) {
        const bearing = Math.atan2(az - z, ax - x);
        this.hud.damageFrom(angleDiff(this.rig.yaw, bearing));
      }
      this.rig.shake(clamp(amount / 120, 0.08, 0.5));
    }
  }

  _kill(ev) {
    const [, killerId, victimId, weapon, head] = ev;
    const kInfo = this.roster.get(killerId);
    const vInfo = this.roster.get(victimId);
    const kEnt = this.entities.map.get(killerId);
    const vEnt = this.entities.map.get(victimId);
    const killerTeam = kEnt?.team || kInfo?.team || 'def';
    const victimTeam = vEnt?.team || vInfo?.team || 'def';
    const self = killerId === victimId;
    this.hud.killfeed({
      killer: self ? '' : kInfo?.name || 'Unknown', killerTeam, victim: vInfo?.name || 'Unknown', victimTeam, weapon,
      mine: killerId === this.myId || victimId === this.myId, headshot: !!head,
    });
    if (victimId === this.myId) this.killedBy = { killerId, weapon };
    if (killerId === this.myId && !self) {
      this.hud.hitMarker({ kill: true, headshot: !!head });
      audio.play('kill', null, { volume: 0.8 });
      this.hud.scorePopup('+100 Kill');
      this.pendingKillScore += 100;
      if (head) {
        this.hud.scorePopup('+50 Headshot');
        this.pendingKillScore += 50;
      }
      const t = performance.now();
      this.killTimes = this.killTimes.filter((k) => t - k < 4500);
      this.killTimes.push(t);
      this.streak++;
      const multi = MEDALS[Math.min(this.killTimes.length, 5)];
      if (this.killTimes.length >= 2 && multi) this.hud.medal(multi);
      if (STREAKS[this.streak]) this.hud.medal(STREAKS[this.streak]);
    }
  }

  // Score the server credited beyond the kills we already announced (assists, HQ damage).
  _scoreDelta(score) {
    if (this.lastScore === null || score < this.lastScore) {
      this.lastScore = score;
      this.pendingKillScore = 0;
      return;
    }
    let d = score - this.lastScore;
    this.lastScore = score;
    if (d <= 0) return;
    const fromKills = Math.min(d, this.pendingKillScore);
    this.pendingKillScore -= fromKills;
    d -= fromKills;
    if (d <= 0) return;
    this.hud.scorePopup(d === 50 ? '+50 Assist' : `+${d} HQ Damage`);
  }

  // ------------------------------------------------------------------ HUD

  _hud(dt, own, me) {
    const hud = this.hud;
    const row = this.myRow;
    const cam = this.camera;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const st = { ...this.input.state, ...this.debugKeys };
    let meInfo = null;
    let spread = 0;
    let warning = null;
    let lock = null;
    let lowHealth = 0;
    if (row) {
      const type = UNIT_TYPES[row[U.TYPE]];
      const def = UNITS[type];
      const soldier = type === 'soldier';
      const slot = soldier ? row[U.WEAPON] : 0;
      const w0 = def.weapons[soldier ? this.slot : 0];
      const w1 = soldier ? (this.slot === 0 ? def.weapons[1] : null) : def.weapons[1];
      const firingRecently = performance.now() - this.lastShot < 250;
      const sameSlot = !soldier || slot === this.slot;
      const s = own || { x: row[U.X], y: row[U.Y], z: row[U.Z], vx: row[U.VX], vy: row[U.VY], vz: row[U.VZ], spd: row[U.SPD], yaw: row[U.YAW], pitch: row[U.PITCH], roll: row[U.ROLL], throttle: row[U.THROTTLE] };
      const flags = row[U.FLAGS];
      const hp = row[U.HP];
      meInfo = {
        type, alive: this.alive, hp, maxHp: def.hp,
        weaponName: w0.name, mag: sameSlot ? (firingRecently ? this.localMag : row[U.MAG]) : soldier && this.slot === 1 ? row[U.MAG2] : row[U.MAG],
        magSize: w0.mag, reserve: sameSlot ? row[U.RESERVE] : -1,
        reloading: sameSlot ? this.reloadProg : -1,
        altName: w1 ? w1.name : null, altMag: row[U.MAG2], altMagSize: w1 ? w1.mag : 0, altReloading: row[U.RELOAD2],
        grenades: soldier ? row[U.GRENADES] : 0,
        spd: soldier ? Math.hypot(s.vx, s.vz) : def.kind === 'air' ? Math.hypot(s.vx, s.vy, s.vz) : s.spd,
        alt: s.y, throttle: def.kind === 'jet' ? s.throttle : null,
        kills: row[U.KILLS], deaths: row[U.DEATHS], score: row[U.SCORE],
        ads: !!(soldier ? st.ads : st.zoom || st.ads), crouch: !!s.crouch, sprint: !!s.sprint,
        pitch: s.pitch, roll: s.roll, heading: s.yaw, yaw: s.yaw, x: s.x, z: s.z,
      };
      if (this.alive) {
        const sp = w0.spread || { hip: 0.01 };
        spread = meInfo.ads && sp.ads != null ? sp.ads : sp.hip || 0.01;
        if (soldier) {
          spread += (sp.move || 0) * clamp(meInfo.spd / def.speed, 0, 1);
          if (own && !own.onGround) spread += sp.air || 0;
          if (s.crouch) spread *= 0.7;
        }
        if (soldier) lowHealth = hp < def.hp * 0.75 ? clamp(1 - hp / (def.hp * 0.75), 0, 1) : 0;
        // Warnings, most urgent first.
        if (flags & FLAG.MISSILE) warning = 'MISSILE INCOMING';
        else if (def.kind === 'jet' && s.y < 45 && s.pitch < -0.12) warning = 'PULL UP';
        else if (flags & FLAG.OUT || (own && own.out)) warning = 'RETURN TO THE BATTLEFIELD';
        else if (flags & FLAG.LOCKED_ON) warning = 'ENEMY LOCK';
        this.warnBeep -= dt;
        if ((flags & (FLAG.MISSILE | FLAG.LOCKED_ON)) && this.warnBeep <= 0) {
          this.warnBeep = flags & FLAG.MISSILE ? 0.55 : 0.9;
          audio.play(flags & FLAG.MISSILE ? 'missile_warning' : 'lock', null, { volume: 0.6 });
        }
        lock = this._lock(dt, row, def, w, h);
      }
    }
    const markers = [];
    const hq = this.world.hq;
    if (hq) {
      _v.set(hq.x, (hq.h || 12) + 6, hq.z);
      const m = this._project(_v, w, h);
      m.label = this.myTeam === 'def' ? 'DEFEND' : 'ATTACK';
      m.color = this.myTeam === 'def' ? '#7fb6ff' : '#ff8a7a';
      m.dist = Math.hypot(hq.x - cam.position.x, hq.z - cam.position.z);
      markers.push(m);
    }
    hud.frame({
      timeLeft: this.timeLeft, hq: this.hq, hqMax: this.hqMax, score: this.score, myTeam: this.myTeam,
      me: meInfo, view: this.rig.mode, spread, fov: cam.fov, lock, markers, warning, lowHealth, range: this.aimDist,
    });
    if (!this.alive && this.deathShown) {
      this.respawnLeft = Math.max(0, this.respawnLeft - dt);
      hud.updateRespawn(this.respawnLeft);
    }
    // Minimap at ~15 Hz.
    this.mmT -= dt;
    if (this.mmT <= 0) {
      this.mmT = 1 / 15;
      this._minimap();
    }
    if (this.showScores) {
      this.sbT -= dt;
      if (this.sbT <= 0) {
        this.sbT = 0.25;
        hud.scoreboard(true, this._board());
      }
    }
  }

  // Jet lock-on box: the server reports the id being locked; progress is timed locally.
  _lock(dt, row, def, w, h) {
    if (def.kind !== 'jet') return null;
    const id = row[U.LOCK];
    if (!id) {
      this.lockId = '';
      this.lockT = 0;
      return null;
    }
    if (id !== this.lockId) {
      this.lockId = id;
      this.lockT = 0;
      this._lockedSound = false;
    }
    const lt = def.weapons[1].lockTime || 1;
    this.lockT += dt;
    const progress = clamp(this.lockT / lt, 0, 1);
    const locked = progress >= 1;
    this.lockBeep -= dt;
    if (!locked && this.lockBeep <= 0) {
      this.lockBeep = 0.16;
      audio.play('lock', null, { volume: 0.5 });
    }
    if (locked && !this._lockedSound) {
      this._lockedSound = true;
      audio.play('locked', null, { volume: 0.7 });
    }
    const e = this.entities.map.get(id);
    if (!e) return null;
    const m = this._project(_v.copy(e.pos).setY(e.pos.y + UNITS[e.type].height * 0.5), w, h);
    if (!m.onScreen) return null;
    return { x: m.x, y: m.y, progress, locked };
  }

  // World point → screen marker fields { x, y, onScreen, angle }.
  _project(p, w, h) {
    const cam = this.camera;
    _v2.copy(p).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v2.z > 0;
    // Bearing in the view plane (0 ahead, + right); behind the camera it points to the lower edge.
    const angle = Math.atan2(_v2.x, -_v2.z) || 0;
    _v2.copy(p).project(cam);
    const onScreen = !behind && Math.abs(_v2.x) <= 1 && Math.abs(_v2.y) <= 1;
    return { x: (_v2.x + 1) * 0.5 * w, y: (1 - _v2.y) * 0.5 * h, onScreen, angle };
  }

  _minimap() {
    const list = [];
    const now = performance.now();
    for (const e of this.entities.map.values()) {
      const mine = e.id === this.myId;
      const friendly = e.team === this.myTeam;
      // Enemies show up only while firing (CoD red dots), teammates always.
      if (!mine && !friendly && now - e.lastFire > 2500) continue;
      if (!e.alive && !mine) continue;
      list.push({ x: e.state.x, z: e.state.z, yaw: e.state.yaw, team: e.team, type: e.type, me: mine, alive: e.alive });
    }
    const meE = this.entities.map.get(this.myId);
    const me = meE ? { x: meE.state.x, z: meE.state.z, yaw: meE.state.yaw } : null;
    this.hud.minimap(list, this.world, me, this.rig.yaw);
  }

  _board() {
    const rows = { def: [], atk: [] };
    const latest = this.buffer.latest;
    if (latest) {
      for (const [id, r] of latest.units) {
        const info = this.roster.get(id);
        const team = TEAMS[r[U.TEAM]] || 'def';
        rows[team].push({ id, name: info?.name || id, bot: !!info?.bot, kills: r[U.KILLS], deaths: r[U.DEATHS], score: r[U.SCORE] });
      }
    }
    for (const t of ['def', 'atk']) rows[t].sort((a, b) => b.score - a.score || b.kills - a.kills);
    return { def: rows.def, atk: rows.atk, myId: this.myId };
  }

  // ------------------------------------------------------------------ debug / stats

  _stats(dt, own) {
    const ft = this.frameTimes;
    ft.push(dt * 1000);
    if (ft.length > 240) ft.shift();
    if (own) {
      if (this._lastOwn) {
        const d = Math.hypot(own.x - this._lastOwn.x, own.z - this._lastOwn.z);
        this.ownDeltas.push(+(d / Math.max(dt, 1e-4)).toFixed(3));
        if (this.ownDeltas.length > 600) this.ownDeltas.shift();
      }
      this._lastOwn = { x: own.x, z: own.z };
    } else this._lastOwn = null;
  }

  _installDebug() {
    window.__dwGame = this;
    this.prof = {};
    const game = this;
    this.debug = {
      setLook(yaw, pitch) {
        game.rig.yaw = wrapAngle(+yaw || 0);
        game.rig.pitch = +pitch || 0;
        game.rig.addLook(0, 0);
      },
      setKeys(partial) {
        Object.assign(game.debugKeys, partial || {});
      },
      emit(name, value) {
        game._handlers[name]?.(value);
      },
      stats() {
        const ft = game.frameTimes;
        const info = game.r.renderer.info;
        const sorted = [...ft].sort((a, b) => a - b);
        return {
          alive: game.alive, type: game.type, mode: game.rig.mode, team: game.myTeam, slot: game.slot,
          frames: ft.length, avgMs: ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
          ratio: game.r.ratio, calls: info.render.calls, triangles: info.render.triangles, entities: game.entities.map.size,
          projectiles: game.entities.proj.size, corrections: game.predictor.corrections, resets: game.predictor.snaps,
          own: game.predictor.s ? { x: game.predictor.s.x, y: game.predictor.s.y, z: game.predictor.s.z, yaw: game.predictor.s.yaw } : null,
          server: game.myRow ? { x: game.myRow[U.X], y: game.myRow[U.Y], z: game.myRow[U.Z], hp: game.myRow[U.HP], mag: game.myRow[U.MAG] } : null,
          speeds: game.ownDeltas.slice(-120), seq: game.seq, rt: game.buffer.rt, offset: game.buffer.offset,
          aim: game.aimPoint.slice(), aimDist: game.aimDist, aimUnit: game.aimUnit, lastError: game.lastError || null,
          effects: game.effects.stats, fov: game.camera.fov, prof: game.prof,
        };
      },
    };
  }
}
