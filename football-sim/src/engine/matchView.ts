/** MatchView: mirrors the simulation into the 3D scene (players, ball, markers) and records/plays replays. */
import * as THREE from 'three';
import { BALL_R, HL, lerp } from '../core/math';
import type { MatchManager } from '../match/match';
import type { Player } from '../match/player';
import { Animator, AnimCtx, POSE_N, applyPose } from './animation';
import { PlayerModel } from './playerModel';
import { ballTexture, blobTexture } from './textures';

const FRAME_HZ = 30, REPLAY_SECONDS = 12, SLOTS = 22, PER = 5 + POSE_N, FRAME_LEN = 7 + SLOTS * PER;
interface Entry { player: Player; model: PlayerModel; anim: Animator; blob: THREE.Mesh | null; slot: number }

export class MatchView {
  group = new THREE.Group();
  ball: THREE.Mesh;
  ballPos = new THREE.Vector3();
  private entries = new Map<Player, Entry>();
  private bySlot: (Entry | null)[] = new Array(SLOTS).fill(null);
  private rings: THREE.Mesh[] = [];
  private arrows: THREE.Mesh[] = [];
  private targetRing: THREE.Mesh;
  private aim: THREE.Mesh;
  private ballBlob: THREE.Mesh;
  private blobTex = blobTexture();
  private frames: Float32Array[] = [];
  private head = 0; private count = 0; private recT = 0;
  replaying = false; private repT = 0; private repEnd = 0; private repSpeed = 0.5; private repDone: (() => void) | null = null;
  private tmpQ = new THREE.Quaternion(); private axis = new THREE.Vector3();
  private trail: THREE.Line; private trailPos = new Float32Array(28 * 3); private trailN = 0;
  private ctx: AnimCtx = { ballX: 0, ballZ: 0, time: 0, hasBall: false, ready: false, lost: false };

  constructor(public match: MatchManager, scene: THREE.Scene, private blobShadows: boolean) {
    scene.add(this.group);
    const bt = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.42, metalness: 0.02 }));
    this.ball.castShadow = true; this.group.add(this.ball);
    const blobMat = () => new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.8 });
    const flat = (w: number, mat: THREE.Material) => { const g = new THREE.PlaneGeometry(w, w); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.y = 0.02; m.renderOrder = 2; this.group.add(m); return m; };
    this.ballBlob = flat(0.5, blobMat());
    const cols = ['#35e0ff', '#ff4fd8'];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 3; ring.visible = false; this.group.add(ring); this.rings.push(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 4), new THREE.MeshBasicMaterial({ color: cols[i] }));
      arrow.rotation.x = Math.PI; arrow.visible = false; this.group.add(arrow); this.arrows.push(arrow);
    }
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.targetRing.rotation.x = -Math.PI / 2; this.targetRing.position.y = 0.03; this.targetRing.visible = false; this.group.add(this.targetRing);
    const ag = new THREE.PlaneGeometry(1, 0.35); ag.rotateX(-Math.PI / 2); ag.translate(0.5, 0, 0);
    this.aim = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.75, depthWrite: false }));
    this.aim.position.y = 0.04; this.aim.visible = false; this.group.add(this.aim);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false })); this.trail.frustumCulled = false; this.group.add(this.trail);
    for (let i = 0; i < FRAME_HZ * REPLAY_SECONDS; i++) this.frames.push(new Float32Array(FRAME_LEN));
    this.sync();
  }

  /** Creates models for new players (kick-off and substitutions) and removes departed ones. */
  private sync() {
    const m = this.match;
    for (const t of m.teams) t.players.forEach((p, i) => {
      if (this.entries.has(p)) return;
      const slot = t.idx * 11 + i;
      const old = this.bySlot[slot];
      if (old) { this.group.remove(old.model.group); if (old.blob) this.group.remove(old.blob); old.model.dispose(); this.entries.delete(old.player); }
      const model = new PlayerModel(p.data, p.isGK ? t.gkKit : t.kit, p.isGK);
      let blob: THREE.Mesh | null = null;
      if (this.blobShadows) { const g = new THREE.PlaneGeometry(1.5, 1.5); g.rotateX(-Math.PI / 2); blob = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.7 })); blob.position.y = 0.015; this.group.add(blob); }
      this.group.add(model.group);
      const e: Entry = { player: p, model, anim: new Animator(), blob, slot };
      this.entries.set(p, e); this.bySlot[slot] = e;
    });
  }

  update(dt: number, time: number) {
    const m = this.match;
    this.sync();
    if (this.replaying) { this.playback(dt); return; }
    const b = m.ball.pos, c = this.ctx;
    c.ballX = b.x; c.ballZ = b.z; c.time = time;
    for (const e of this.entries.values()) {
      const p = e.player, g = e.model.group;
      g.visible = p.active;
      if (!p.active) { if (e.blob) e.blob.visible = false; continue; }
      c.hasBall = m.ball.owner === p;
      c.ready = p.isGK && p.team.u(b.x) < 5;
      c.lost = (m.phase === 'fulltime' || m.phase === 'done') && m.winner >= 0 && m.winner !== p.team.idx;
      e.anim.update(p, c, dt);
      applyPose(e.model, e.anim.cur);
      g.position.set(p.x, p.y * (p.state === 'dive' ? 0.75 : 1), p.z);
      g.rotation.y = -p.facing;
      if (e.blob) { e.blob.visible = true; e.blob.position.x = p.x; e.blob.position.z = p.z; }
    }
    // Ball: position, rolling/spinning orientation and contact shadow
    this.ball.position.copy(b); this.ballPos.copy(b);
    const v = m.ball.vel, sp = Math.hypot(v.x, v.z);
    if (sp > 0.05) { this.axis.set(v.z, 0, -v.x).normalize(); this.tmpQ.setFromAxisAngle(this.axis, (sp / BALL_R) * dt); this.ball.quaternion.premultiply(this.tmpQ); }
    const s = m.ball.spin; const sl = s.length();
    if (sl > 0.5 && b.y > 0.2) { this.axis.copy(s).normalize(); this.tmpQ.setFromAxisAngle(this.axis, sl * dt * 0.4); this.ball.quaternion.premultiply(this.tmpQ); }
    this.markers(time);
    // Shot trail, coloured by kick style
    const fast = !m.ball.owner && m.ball.style && m.ball.speed > 11;
    if (fast) { this.trailPos.copyWithin(3, 0, 27 * 3); this.trailPos[0] = b.x; this.trailPos[1] = b.y; this.trailPos[2] = b.z; this.trailN = Math.min(28, this.trailN + 1); } else this.trailN = Math.max(0, this.trailN - 2);
    this.trail.geometry.setDrawRange(0, this.trailN); this.trail.geometry.attributes.position.needsUpdate = true;
    (this.trail.material as THREE.LineBasicMaterial).color.set(({ power: '#ffffff', finesse: '#35e0ff', chip: '#c6ff3d', driven: '#ff5a3d', knuckle: '#ffcf5a', trivela: '#ff4fd8' } as Record<string, string>)[m.ball.style] ?? '#ffffff');
    // Record a replay frame
    this.recT += dt;
    if (this.recT >= 1 / FRAME_HZ && (m.phase === 'play' || m.phase === 'goal' || m.phase === 'dead' || m.phase === 'pk' || m.phase === 'setpiece')) { this.recT = 0; this.record(); }
  }

  private markers(time: number) {
    const m = this.match, b = this.ball.position;
    this.ballBlob.position.set(b.x, 0.02, b.z); const k = 1 + b.y * 0.5; this.ballBlob.scale.set(k, 1, k); (this.ballBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.8 - b.y * 0.12);
    this.rings.forEach((r) => (r.visible = false)); this.arrows.forEach((a) => (a.visible = false));
    const live = m.phase === 'play' || m.phase === 'setpiece' || m.phase === 'dead' || m.phase === 'pk';
    for (const t of m.teams) {
      if (!t.human || !t.selected || !live || !t.selected.active) continue;
      const p = t.selected, i = Math.max(0, t.inputIdx), r = this.rings[i], a = this.arrows[i];
      r.visible = true; r.position.set(p.x, 0.03, p.z); const s = 1 + Math.sin(time * 6) * 0.05; r.scale.set(s, s, s);
      a.visible = true; a.position.set(p.x, 2.25 + p.y + Math.sin(time * 5) * 0.05, p.z); a.rotation.y = time * 2;
    }
    const pt = m.passTarget;
    this.targetRing.visible = !!pt && pt.team.human && live && pt !== pt.team.selected;
    if (pt) this.targetRing.position.set(pt.x, 0.03, pt.z);
    const sp = m.sp;
    this.aim.visible = !!sp && sp.team.human && !sp.kicked && (sp.type === 'penalty' || (sp.type === 'freekick' && sp.direct)) && (!sp.team.locked || sp.team.locked === sp.taker);
    if (this.aim.visible && sp) {
      const gx = sp.team.goalX, tz = sp.aim * 3.2;
      this.aim.position.set(b.x, 0.04, b.z); this.aim.rotation.y = -Math.atan2(tz - b.z, gx - b.x);
      this.aim.scale.set(Math.min(9, Math.hypot(gx - b.x, tz - b.z) * 0.5) * (0.5 + sp.power * 0.5), 1, 1);
    }
  }

  private record() {
    const f = this.frames[this.head];
    const b = this.ball; f[0] = b.position.x; f[1] = b.position.y; f[2] = b.position.z; f[3] = b.quaternion.x; f[4] = b.quaternion.y; f[5] = b.quaternion.z; f[6] = b.quaternion.w;
    for (let s = 0; s < SLOTS; s++) {
      const e = this.bySlot[s], o = 7 + s * PER;
      if (!e || !e.player.active) { f[o] = 0; continue; }
      const g = e.model.group;
      f[o] = 1; f[o + 1] = g.position.x; f[o + 2] = g.position.y; f[o + 3] = g.position.z; f[o + 4] = g.rotation.y;
      f.set(e.anim.cur, o + 5);
    }
    this.head = (this.head + 1) % this.frames.length; this.count = Math.min(this.count + 1, this.frames.length);
  }

  /** Plays the last `back` seconds (ending `skip` seconds ago) in slow motion. */
  startReplay(back: number, skip: number, speed: number, done: () => void) {
    const avail = this.count / FRAME_HZ;
    if (avail < 1.5) { done(); return; }
    this.replaying = true; this.repSpeed = speed; this.repDone = done;
    this.repT = Math.max(0, avail - back); this.repEnd = Math.max(this.repT + 0.5, avail - skip);
    this.rings.forEach((r) => (r.visible = false)); this.arrows.forEach((a) => (a.visible = false)); this.targetRing.visible = false; this.aim.visible = false;
  }
  stopReplay() { if (!this.replaying) return; this.replaying = false; const d = this.repDone; this.repDone = null; d?.(); }
  get replayProgress() { return this.replaying ? this.repT / this.repEnd : 0; }

  private playback(dt: number) {
    this.repT += dt * this.repSpeed;
    if (this.repT >= this.repEnd) { this.stopReplay(); return; }
    const fi = this.repT * FRAME_HZ, i0 = Math.floor(fi), k = fi - i0;
    const start = (this.head - this.count + this.frames.length) % this.frames.length;
    const A = this.frames[(start + Math.min(i0, this.count - 1)) % this.frames.length], Bf = this.frames[(start + Math.min(i0 + 1, this.count - 1)) % this.frames.length];
    this.ball.position.set(lerp(A[0], Bf[0], k), lerp(A[1], Bf[1], k), lerp(A[2], Bf[2], k));
    this.ball.quaternion.set(A[3], A[4], A[5], A[6]).slerp(this.tmpQ.set(Bf[3], Bf[4], Bf[5], Bf[6]), k);
    this.ballPos.copy(this.ball.position);
    this.ballBlob.position.set(this.ballPos.x, 0.02, this.ballPos.z);
    const pose = new Float32Array(POSE_N);
    for (let s = 0; s < SLOTS; s++) {
      const e = this.bySlot[s]; if (!e) continue;
      const o = 7 + s * PER, g = e.model.group;
      g.visible = A[o] > 0.5 && Bf[o] > 0.5;
      if (!g.visible) { if (e.blob) e.blob.visible = false; continue; }
      g.position.set(lerp(A[o + 1], Bf[o + 1], k), lerp(A[o + 2], Bf[o + 2], k), lerp(A[o + 3], Bf[o + 3], k));
      let ra = A[o + 4], rb = Bf[o + 4]; let d = rb - ra; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y = ra + d * k;
      for (let j = 0; j < POSE_N; j++) pose[j] = lerp(A[o + 5 + j], Bf[o + 5 + j], k);
      applyPose(e.model, pose);
      if (e.blob) { e.blob.visible = true; e.blob.position.x = g.position.x; e.blob.position.z = g.position.z; }
    }
  }

  /** World position of a player's head, for HUD name tags. */
  headPos(p: Player, out: THREE.Vector3) { return out.set(p.x, 2.0 + p.y, p.z); }
  dispose() {
    for (const e of this.entries.values()) e.model.dispose();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as any).isSkinnedMesh) { m.geometry.dispose(); const mat = m.material as THREE.Material; mat.dispose(); } });
    this.blobTex.dispose();
    this.group.removeFromParent();
    void HL;
  }
}
