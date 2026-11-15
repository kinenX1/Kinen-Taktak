/** Game shell: owns the renderer, world, current match and the frame loop, and connects simulation events to sight and sound. */
import * as THREE from 'three';
import { Input } from './core/input';
import { Settings, loadSettings, saveSettings } from './core/settings';
import { RNG } from './core/rng';
import { DB } from './data/database';
import { STADIUMS, WEATHERS, stadiumById } from './data/stadiums';
import { AudioManager } from './audio/audio';
import { CameraManager } from './engine/camera';
import { Environment } from './engine/environment';
import { MatchView } from './engine/matchView';
import { GameRenderer } from './engine/renderer';
import { StadiumManager } from './engine/stadium';
import { MatchConfig, MatchManager, Phase } from './match/match';
import { DrillKind, TrainingManager } from './modes/training';
import { Hud } from './ui/hud';
import { clear, div, setSfx } from './ui/dom';
import { TouchControls, isTouchDevice } from './ui/touch';

export interface PlayOpts { onEnd: (m: MatchManager, quit: boolean) => void; drill?: DrillKind }

export class Game {
  settings: Settings = loadSettings();
  input = new Input(() => this.settings);
  audio = new AudioManager(() => this.settings);
  R: GameRenderer; env: Environment; cam: CameraManager;
  stadium: StadiumManager | null = null; match: MatchManager | null = null; view: MatchView | null = null; hud: Hud | null = null;
  training: TrainingManager | null = null;
  paused = false; backdrop = true; time = 0;
  private opts: PlayOpts | null = null;
  private last = performance.now();
  private goalCam = false; private introDone = false;
  private cones: THREE.Mesh[] = [];
  private rng = new RNG(Date.now() & 0xffff);
  fps = 60;
  touch: TouchControls | null = null;

  constructor(canvas: HTMLCanvasElement, public uiRoot: HTMLElement, public hudRoot: HTMLElement) {
    this.R = new GameRenderer(canvas);
    this.R.configure(this.settings);
    this.env = new Environment(this.R.scene, this.R.renderer);
    this.cam = new CameraManager(this.R.camera);
    setSfx(this.audio);
    if (isTouchDevice()) {
      this.touch = new TouchControls(this.input, document.body);
      // Phones default to lighter graphics the first time the game runs.
      let saved = false; try { saved = localStorage.getItem('ufs.settings.v1') !== null; } catch { /* ignore */ }
      if (!saved) { this.settings.quality = 'medium'; this.settings.postfx = false; this.R.configure(this.settings); }
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- UI plumbing ----------
  screen(node: Node | null) { clear(this.uiRoot); if (node) this.uiRoot.appendChild(node); }
  toast(msg: string) { const t = div('toast', msg); this.uiRoot.appendChild(t); setTimeout(() => t.remove(), 2700); }
  saveSettings() { saveSettings(this.settings); this.audio.applyVolumes(); this.cam.mode = this.settings.camera; this.cam.zoom = this.settings.cameraZoom; }
  applyGraphics() {
    this.R.configure(this.settings);
    if (this.match && this.stadium) {
      const cfg = this.match.cfg;
      this.env.apply(cfg.weather, this.stadium, this.R.shadowSize, this.R.rainCount);
    }
  }

  // ---------- world ----------
  private teardown() {
    this.hud?.dispose(); this.hud = null;
    this.view?.dispose(); this.view = null;
    this.stadium?.dispose(); this.stadium = null;
    for (const c of this.cones) { c.removeFromParent(); c.geometry.dispose(); }
    this.cones = [];
    this.match?.events.clear(); this.match = null; this.training = null;
  }
  private build(cfg: MatchConfig) {
    this.teardown();
    const st = stadiumById(cfg.stadium);
    this.stadium = new StadiumManager(st, this.settings.quality, [cfg.home.kits[0].primary, cfg.home.kits[0].secondary], cfg.away.kits[0].primary);
    this.R.scene.add(this.stadium.group);
    this.env.apply(cfg.weather, this.stadium, this.R.shadowSize, this.R.rainCount);
    this.R.setBloom(cfg.weather === 'night' ? 0.5 : 0.22);
    this.match = new MatchManager(cfg);
    this.view = new MatchView(this.match, this.R.scene, this.R.shadowSize === 0);
    this.paused = false; this.goalCam = false; this.introDone = false;
  }

  /** Cinematic attract mode behind the menus: an AI match in a random stadium. */
  showBackdrop() {
    const ids = [...DB.teams.keys()];
    const a = this.rng.pick(ids); let b = this.rng.pick(ids); while (b === a) b = this.rng.pick(ids);
    const cfg: MatchConfig = { home: DB.cloneTeam(a), away: DB.cloneTeam(b), stadium: this.rng.pick(STADIUMS).id, weather: this.rng.pick(['night', 'night', 'sunny', 'cloudy'] as const), minutes: 6, difficulty: 3, control: ['ai', 'ai'], auto: true, skipIntro: true };
    this.build(cfg);
    this.backdrop = true; this.opts = null;
    this.input.twoPlayers = false;
    this.cam.setShot({ kind: 'orbit', radius: 62, height: 20, speed: 0.045, look: new THREE.Vector3(0, 2, 0) });
    this.audio.setMatch(false, false, true);
    for (let i = 0; i < 600; i++) this.match!.tick(1 / 60); // start mid-action
  }

  play(cfg: MatchConfig, opts: PlayOpts) {
    if (opts.drill) cfg.drill = true;
    this.build(cfg);
    const m = this.match!;
    this.backdrop = false; this.opts = opts;
    this.screen(null);
    this.input.twoPlayers = cfg.control.includes('p1') && cfg.control.includes('p2');
    m.useReplays = this.settings.replays && !opts.drill;
    this.cam.mode = this.input.twoPlayers && this.settings.camera === 'endtoend' ? 'broadcast' : this.settings.camera; this.cam.zoom = this.settings.cameraZoom;
    if (opts.drill) { this.training = new TrainingManager(m, opts.drill); this.cam.setShot({ kind: 'match' }); this.introDone = true; this.buildCones(); }
    else this.cam.setShot({ kind: 'intro' });
    this.hud = new Hud(this, m, this.hudRoot);
    this.audio.setMatch(true, cfg.weather === 'rainy');
    this.wire(m);
  }
  private buildCones() {
    const t = this.training; if (!t) return;
    for (const c of t.cones) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 }));
      mesh.position.set(c.x, 0.3, c.z); mesh.castShadow = true; this.R.scene.add(mesh); this.cones.push(mesh);
    }
  }

  private wire(m: MatchManager) {
    const a = this.audio, st = this.stadium!, e = m.events;
    e.on('kick', (k) => { a.kick(k.power); });
    e.on('bounce', (b) => a.bounce(b.speed));
    e.on('post', (p) => { a.post(p.speed); a.crowd('ooh'); st.cheer(0.6); this.cam.kick(0.5); });
    e.on('net', () => { a.net(); st.netHit(Math.sign(m.ball.pos.x)); });
    e.on('whistle', (w) => a.whistle(w.kind));
    e.on('tackle', () => { a.tackle(); st.cheer(0.25); });
    e.on('shot', () => st.cheer(0.4));
    e.on('save', () => { a.crowd('ooh'); st.cheer(0.65); });
    e.on('nearmiss', () => { a.crowd('ooh'); st.cheer(0.55); });
    e.on('foul', (f) => { a.crowd('boo'); this.hud?.banner(f.penalty ? 'Penalty!' : f.card === 2 ? 'Red card' : f.card === 1 ? 'Yellow card' : 'Foul', `${f.by.data.short} (${f.by.team.data.short})`, f.card === 2 || f.penalty ? 'bad' : '', 2.2); });
    e.on('offside', (o) => this.hud?.banner('Offside', o.player.data.short, '', 1.8));
    e.on('goal', (g) => { a.crowd('goal'); a.net(); st.cheer(1); st.netHit(Math.sign(m.ball.pos.x)); this.cam.kick(1); this.goalCam = false; this.hud?.banner('GOAL!', `${g.scorer.data.name}${g.own ? ' (OG)' : ''}  ${g.minute}'${g.assist ? `   Assist: ${g.assist.data.short}` : ''}`, 'goal', 4); });
    e.on('sub', (s) => this.hud?.banner('Substitution', `${s.on.short} ON · ${s.off.data.short} OFF  (${s.team.data.short})`, '', 2.6));
    e.on('shootout', (s) => { if (s.scored) { a.crowd('goal'); st.cheer(0.9); } else { a.crowd('ooh'); st.cheer(0.5); } });
    e.on('setpiece', (s) => { if (s.type !== 'kickoff' || m.clock > 1) this.hud?.blink(); this.onSetPiece(); });
    e.on('phase', (p) => this.onPhase(p.phase));
  }
  private onSetPiece() {
    const m = this.match!, sp = m.sp; if (!sp || this.backdrop) return;
    const gx = sp.team.goalX;
    if (sp.type === 'penalty') this.cam.setShot({ kind: 'behind', from: new THREE.Vector3(sp.x, 0, sp.z), to: new THREE.Vector3(gx, 0, 0), dist: 9, height: 3.4, fov: 38 });
    else if (sp.type === 'freekick' && sp.direct && sp.team.human) this.cam.setShot({ kind: 'behind', from: new THREE.Vector3(sp.x, 0, sp.z), to: new THREE.Vector3(gx, 0, 0), dist: 12, height: 4, fov: 38 });
    else this.cam.setShot({ kind: 'match' }, false);
  }
  private onPhase(p: Phase) {
    const m = this.match!; if (this.backdrop) return;
    if (p === 'play' && this.cam.shot.kind !== 'match' && this.cam.shot.kind !== 'behind') this.cam.setShot({ kind: 'match' });
    if (p === 'dead' || (p === 'play' && this.cam.shot.kind === 'behind' && !m.so)) { if (p === 'dead') this.cam.setShot({ kind: 'match' }, false); }
    if (p === 'replay') {
      if (m.useReplays && this.view) {
        this.cam.setShot({ kind: 'replay', variant: this.rng.int(0, 2) });
        this.view.startReplay(9.6, 3.2, 0.5, () => { m.endReplay(); });
      }
    }
    if (p === 'halftime' || p === 'fulltime') { this.cam.setShot({ kind: 'orbit', radius: 58, height: 16, speed: 0.06, look: new THREE.Vector3(0, 2, 0) }); if (p === 'fulltime') this.stadium?.cheer(0.9); }
  }

  /** Called by the HUD when the full-time (or drill result) screen is dismissed, or the user quits from pause. */
  finish(quit: boolean) {
    const m = this.match, o = this.opts; if (!m || !o) return;
    if (!quit) m.complete();
    this.opts = null;
    this.hud?.dispose(); this.hud = null;
    this.audio.setMatch(false);
    o.onEnd(m, quit);
  }
  togglePause(force?: boolean) {
    const m = this.match; if (!m || this.backdrop) return;
    if (m.phase === 'halftime' || m.phase === 'fulltime' || m.phase === 'done') return;
    this.paused = force ?? !this.paused;
    this.hud?.setPaused(this.paused);
  }

  // ---------- frame loop ----------
  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    const raw = (now - this.last) / 1000; this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    this.fps += (1 / Math.max(raw, 1e-3) - this.fps) * 0.05;
    this.time += dt;
    this.input.update(dt);
    this.padNav();
    const m = this.match, v = this.view;
    if (m && v) {
      if (!this.backdrop) {
        if (this.input.pausePressed) this.togglePause();
        m.inputs[0] = this.input.players[0]; m.inputs[1] = this.input.players[1];
        m.basis = this.cam.basis;
        const hum = m.teams.find((t) => t.human); if (hum) this.cam.dir = hum.dir;
        if (m.phase === 'intro' && !this.introDone && (this.cam.shotT > 8 || (this.cam.shotT > 1.2 && this.input.anyAction))) { this.introDone = true; m.begin(); this.cam.setShot({ kind: 'match' }); }
        if (m.phase === 'goal' && !this.goalCam && m.phaseT > 0.9 && m.celebrant) {
          this.goalCam = true; const c = m.celebrant;
          this.cam.setShot({ kind: 'follow', target: () => new THREE.Vector3(c.x, 0, c.z), facing: () => c.facing, dist: 6.5, height: 1.9, fov: 30 });
        }
        if (v.replaying && ((this.input.anyAction && v.replayProgress > 0.12) || m.phase !== 'replay')) v.stopReplay();
      } else if (m.phase === 'fulltime' && m.phaseT > 6) { this.showBackdrop(); return; }
      if (!this.paused) {
        m.update(dt);
        v.update(dt, this.time);
        if (m.phase === 'play' && Math.abs(m.ball.pos.x) > 34 && m.ball.owner) this.stadium!.cheer(0.22);
        const sel = m.teams[0].selected; if (sel && !this.backdrop) this.audio.step(sel.speed, dt);
      }
      this.stadium!.update(dt, this.time);
      if (this.training) this.cones.forEach((c, i) => { c.visible = !this.training!.cones[i]?.done; });
      this.audio.setExcitement(this.stadium!.excite);
      this.cam.update(dt, v.ballPos, this.time);
      this.env.update(dt, this.time, v.ballPos, this.R.camera);
      this.hud?.update(dt);
    }
    if (this.touch) { const live = !!m && !this.backdrop && !this.paused && m.phase !== 'halftime' && m.phase !== 'fulltime' && m.phase !== 'done'; this.touch.show(live); }
    this.audio.update(dt);
    this.R.render();
  }

  /** Gamepad focus navigation across whatever buttons are currently on screen. */
  private padFocus: HTMLElement | null = null;
  private padNav() {
    const inp = this.input;
    if (!inp.navX && !inp.navY && !inp.confirm && !inp.back) return;
    const root = this.uiRoot.childElementCount ? this.uiRoot : this.hudRoot;
    const els = [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter((e) => e.offsetParent !== null && getComputedStyle(e).pointerEvents !== 'none');
    if (inp.back) { const b = els.find((e) => e.dataset.back !== undefined); if (b) b.click(); return; }
    if (!els.length) return;
    let cur = this.padFocus && els.includes(this.padFocus) ? this.padFocus : null;
    if (inp.confirm) {
      const usedPad = !!cur;
      if (usedPad && document.activeElement !== cur) cur!.click();
      else if (!cur && !(document.activeElement instanceof HTMLButtonElement)) els.find((e) => e.classList.contains('primary'))?.click();
      return;
    }
    if (!cur) { cur = els[0]; }
    else {
      const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best: HTMLElement | null = null, bs = 1e9;
      for (const e of els) {
        if (e === cur) continue;
        const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
        const along = dx * inp.navX + dy * inp.navY; if (along < 4) continue;
        const across = Math.abs(dx * inp.navY) + Math.abs(dy * inp.navX);
        const s = along + across * 2.5; if (s < bs) { bs = s; best = e; }
      }
      if (best) cur = best;
    }
    this.padFocus?.classList.remove('pad-focus');
    this.padFocus = cur; cur.classList.add('pad-focus'); cur.scrollIntoView({ block: 'nearest' }); this.audio.uiMove();
  }
}
export { WEATHERS };
