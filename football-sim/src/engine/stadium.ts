/** StadiumManager: builds a complete procedural stadium (pitch, stands, roof, crowd, floodlights, goals, boards, dugouts, tunnel). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GOAL_H, GOAL_HW, HL, HW } from '../core/math';
import { RNG, hashStr } from '../core/rng';
import type { Quality } from '../core/settings';
import type { StadiumConfig } from '../data/stadiums';
import { PITCH_MX, PITCH_MZ, SKIN, grassBump, ledTexture, lightPanelTexture, netTexture, pitchTexture, seatTexture } from './textures';

interface PathPt { x: number; z: number; nx: number; nz: number; s: number; side: number }
interface ProfPt { r: number; y: number; kind: 'seat' | 'wall' | 'fascia'; rows: number }
const CROWD_MAX: Record<Quality, number> = { low: 5000, medium: 14000, high: 26000, ultra: 42000 };

export class StadiumManager {
  group = new THREE.Group();
  pitchMat!: THREE.MeshStandardMaterial;
  private crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0.08 } };
  private leds: THREE.Texture[] = [];
  private lightMats: THREE.MeshStandardMaterial[] = [];
  private flags: THREE.Mesh[] = [];
  private nets: THREE.Mesh[] = [];
  private netKick = [0, 0];
  private disposables: { dispose(): void }[] = [];
  excite = 0.08; private exciteTarget = 0.08;
  lightPositions: THREE.Vector3[] = [];
  crowdCount = 0;

  constructor(public cfg: StadiumConfig, quality: Quality, homeColors: [string, string], awayColor: string, private crowdScale = 1) {
    this.buildPitch(quality);
    this.buildGoals();
    this.buildStands(quality, homeColors, awayColor);
    this.buildBoards();
    this.buildDugouts();
    this.buildFlags();
  }
  private track<T extends { dispose(): void }>(o: T) { this.disposables.push(o); return o; }
  private mat(p: THREE.MeshStandardMaterialParameters) { return this.track(new THREE.MeshStandardMaterial(p)); }
  private add(geo: THREE.BufferGeometry, mat: THREE.Material, cast = false, recv = true) {
    const m = new THREE.Mesh(this.track(geo), mat); m.castShadow = cast; m.receiveShadow = recv; this.group.add(m); return m;
  }

  private buildPitch(q: Quality) {
    const map = this.track(pitchTexture(q !== 'low')), bump = this.track(grassBump());
    bump.repeat.set(230, 150);
    this.pitchMat = this.mat({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.92, metalness: 0 });
    const g = new THREE.PlaneGeometry(2 * (HL + PITCH_MX), 2 * (HW + PITCH_MZ)); g.rotateX(-Math.PI / 2);
    this.add(g, this.pitchMat);
    // Surrounding apron: running track / concrete
    const ap = new THREE.PlaneGeometry(400, 400); ap.rotateX(-Math.PI / 2); ap.translate(0, -0.03, 0);
    this.add(ap, this.mat({ color: this.cfg.layout === 'oval' ? '#8a4b3a' : '#4b4f57', roughness: 0.95 }));
  }

  private buildGoals() {
    const white = this.mat({ color: '#f5f5f5', roughness: 0.35, metalness: 0.1 });
    const netT = this.track(netTexture());
    const parts: THREE.BufferGeometry[] = [];
    const cyl = (len: number) => new THREE.CylinderGeometry(0.06, 0.06, len, 10);
    for (const s of [-1, 1]) {
      for (const z of [-GOAL_HW, GOAL_HW]) {
        parts.push(cyl(GOAL_H).translate(s * HL, GOAL_H / 2, z));
        const st = new THREE.CylinderGeometry(0.03, 0.03, 2.9, 6); st.rotateZ(s * 0.76); st.translate(s * (HL + 1.0), 1.22, z); parts.push(st);
      }
      const bar = cyl(GOAL_HW * 2 + 0.12); bar.rotateX(Math.PI / 2); bar.translate(s * HL, GOAL_H, 0); parts.push(bar);
      const back = new THREE.CylinderGeometry(0.03, 0.03, GOAL_HW * 2, 6); back.rotateX(Math.PI / 2); back.translate(s * (HL + 2), 0.05, 0); parts.push(back);
      // Nets: sloped back, sides and roof
      const mk = (w: number, h: number, rep: [number, number]) => { const t = netT.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); this.track(t); return [new THREE.PlaneGeometry(w, h, 8, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 })] as const; };
      const [bg, bm] = mk(GOAL_HW * 2, 2.9, [50, 18]);
      const backNet = new THREE.Mesh(this.track(bg), this.track(bm)); backNet.position.set(s * (HL + 1.25), 1.2, 0); backNet.rotation.set(0, Math.PI / 2, 0); backNet.rotateX(s * -0.66); this.group.add(backNet);
      this.nets.push(backNet); backNet.userData.side = s;
      const [tg, tm] = mk(GOAL_HW * 2, 0.6, [50, 4]);
      const top = new THREE.Mesh(this.track(tg), this.track(tm)); top.position.set(s * (HL + 0.3), GOAL_H, 0); top.rotation.set(-Math.PI / 2, 0, Math.PI / 2); this.group.add(top);
      for (const z of [-GOAL_HW, GOAL_HW]) {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(2, 0); shape.lineTo(0.55, GOAL_H); shape.lineTo(0, GOAL_H);
        const sg = this.track(new THREE.ShapeGeometry(shape));
        const uv = sg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);
        const sm = new THREE.Mesh(sg, this.track(new THREE.MeshBasicMaterial({ map: netT, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 })));
        sm.position.set(s * HL, 0, z); sm.scale.x = s; this.group.add(sm);
      }
    }
    netT.repeat.set(1, 1);
    this.add(mergeGeometries(parts)!, white, true);
  }

  private path(): PathPt[][] {
    const c = this.cfg, hx = HL + c.endMargin, hz = HW + c.sideMargin;
    const mk = (x: number, z: number, nx: number, nz: number, side: number): PathPt => ({ x, z, nx, nz, s: 0, side });
    const out: PathPt[][] = [];
    if (c.layout === 'stands') {
      const seg = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, side: number) => { const pts: PathPt[] = []; const n = 14; for (let i = 0; i <= n; i++) pts.push(mk(ax + (bx - ax) * i / n, az + (bz - az) * i / n, nx, nz, side)); out.push(pts); };
      seg(HL + 3, -hz, -HL - 3, -hz, 0, -1, 0); seg(-HL - 3, hz, HL + 3, hz, 0, 1, 1);
      seg(hx, HW - 1, hx, -HW + 1, 1, 0, 2); seg(-hx, -HW + 1, -hx, HW - 1, -1, 0, 3);
    } else if (c.layout === 'oval') {
      const pts: PathPt[] = []; const n = 120, e = 2.7;
      const P = (t: number) => { const cs = Math.cos(t), sn = Math.sin(t); return [hx * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / e), hz * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e)]; };
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2, [x, z] = P(t), [x1, z1] = P(t + 0.01), [x0, z0] = P(t - 0.01);
        const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
        pts.push(mk(x, z, tz / l, -tx / l, Math.abs(z) > Math.abs(x) * 0.6 ? (z < 0 ? 0 : 1) : (x > 0 ? 2 : 3)));
      }
      out.push(pts);
    } else {
      const pts: PathPt[] = []; const R = Math.min(c.cornerRadius, hz - 2);
      const line = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, side: number, n: number) => { for (let i = 0; i < n; i++) pts.push(mk(ax + (bx - ax) * i / n, az + (bz - az) * i / n, nx, nz, side)); };
      const arc = (cx: number, cz: number, a0: number, side: number) => { const n = 10; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push(mk(cx + Math.cos(a) * R, cz + Math.sin(a) * R, Math.cos(a), Math.sin(a), side)); } };
      line(hx - R, -hz, -hx + R, -hz, 0, -1, 0, 16); arc(-hx + R, -hz + R, -Math.PI / 2 - Math.PI / 2 + 0, 3);
      // rebuild with consistent winding: go around clockwise seen from above
      pts.length = 0;
      line(-hx + R, -hz, hx - R, -hz, 0, -1, 0, 16); arc(hx - R, -hz + R, -Math.PI / 2, 2);
      line(hx, -hz + R, hx, hz - R, 1, 0, 2, 10); arc(hx - R, hz - R, 0, 1);
      line(hx - R, hz, -hx + R, hz, 0, 1, 1, 16); arc(-hx + R, hz - R, Math.PI / 2, 3);
      line(-hx, hz - R, -hx, -hz + R, -1, 0, 3, 10); arc(-hx + R, -hz + R, Math.PI, 0);
      pts.push({ ...pts[0] });
      out.push(pts);
    }
    for (const pts of out) { let s = 0; for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = s; } }
    return out;
  }

  private profile(scale: number): ProfPt[] {
    const pts: ProfPt[] = [{ r: 0, y: 0, kind: 'wall', rows: 0 }, { r: 0, y: 1.1, kind: 'wall', rows: 0 }];
    let r = 0.2, y = 1.1;
    this.cfg.tiers.forEach((t, i) => {
      const rows = Math.max(4, Math.round(t.rows * scale));
      if (i > 0) { pts.push({ r, y: y + 2.4, kind: 'fascia', rows: 0 }); y += 2.4; r += 0.4; pts.push({ r, y, kind: 'wall', rows: 0 }); }
      const depth = rows * 0.8, rise = depth * Math.tan((t.rake * Math.PI) / 180);
      r += depth; y += rise;
      pts.push({ r, y, kind: 'seat', rows });
    });
    return pts;
  }

  private buildStands(q: Quality, home: [string, string], away: string) {
    const c = this.cfg, rng = new RNG(hashStr(c.id));
    const seatT = this.track(seatTexture(c.seat));
    const seatMat = this.mat({ map: seatT, roughness: 0.85 });
    const concrete = this.mat({ color: c.structure, roughness: 0.9 });
    const fascia = this.mat({ color: '#10131c', emissive: new THREE.Color(c.accent), emissiveIntensity: 0.9, roughness: 0.6 });
    const roofMat = c.roof === 'glass'
      ? this.mat({ color: '#bfe3f2', transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false })
      : this.mat({ color: '#e8ebf0', roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
    const dark = this.mat({ color: '#23262d', roughness: 0.9, side: THREE.DoubleSide });
    const lightTex = this.track(lightPanelTexture());
    const seatG: number[] = [], seatUV: number[] = [], wallG: number[] = [], fasG: number[] = [], roofG: number[] = [], darkG: number[] = [];
    const quad = (arr: number[], a: number[], b: number[], c2: number[], d: number[]) => arr.push(...a, ...b, ...c2, ...a, ...c2, ...d);
    const seats: { x: number; y: number; z: number; rot: number; side: number; s: number }[] = [];
    const sections = this.path();
    let maxTop = 0;
    for (const pts of sections) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const scale = c.layout === 'stands' ? c.sideScale[a.side] : 1;
        const prof = this.profile(scale);
        const P = (p: PathPt, f: ProfPt) => [p.x + p.nx * f.r, f.y, p.z + p.nz * f.r];
        for (let k = 0; k < prof.length - 1; k++) {
          const f0 = prof[k], f1 = prof[k + 1];
          const A = P(a, f0), Bq = P(b, f0), Cq = P(b, f1), D = P(a, f1);
          if (f1.kind === 'seat') {
            quad(seatG, A, Bq, Cq, D);
            const u0 = a.s / 0.55, u1 = b.s / 0.55;
            seatUV.push(u0, 0, u1, 0, u1, f1.rows, u0, 0, u1, f1.rows, u0, f1.rows);
            // crowd seats
            const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.floor(len / 0.56));
            for (let row = 0; row < f1.rows; row++) {
              const t = (row + 0.5) / f1.rows;
              for (let j = 0; j < n; j++) {
                const u = (j + 0.5) / n;
                const x = a.x + (b.x - a.x) * u + (a.nx + (b.nx - a.nx) * u) * (f0.r + (f1.r - f0.r) * t);
                const z = a.z + (b.z - a.z) * u + (a.nz + (b.nz - a.nz) * u) * (f0.r + (f1.r - f0.r) * t);
                seats.push({ x, y: f0.y + (f1.y - f0.y) * t, z, rot: Math.atan2(-(a.nx + (b.nx - a.nx) * u), -(a.nz + (b.nz - a.nz) * u)), side: a.side, s: a.s + len * u });
              }
            }
          } else quad(f1.kind === 'fascia' ? fasG : wallG, A, Bq, Cq, D);
        }
        const top = prof[prof.length - 1]; maxTop = Math.max(maxTop, top.y);
        // back parapet and outer wall
        const t0 = P(a, top), t1 = P(b, top);
        const o0 = [a.x + a.nx * (top.r + 1.2), top.y + 1.4, a.z + a.nz * (top.r + 1.2)], o1 = [b.x + b.nx * (top.r + 1.2), top.y + 1.4, b.z + b.nz * (top.r + 1.2)];
        quad(wallG, t0, t1, [t1[0], top.y + 1.4, t1[2]], [t0[0], top.y + 1.4, t0[2]]);
        quad(wallG, [t0[0], top.y + 1.4, t0[2]], [t1[0], top.y + 1.4, t1[2]], o1, o0);
        quad(darkG, o0, o1, [o1[0], 0, o1[2]], [o0[0], 0, o0[2]]);
        // roof
        const roofed = c.roof === 'full' || c.roof === 'glass' || (c.roof === 'main' && a.side === 0);
        if (roofed) {
          const rd = Math.min(c.roofDepth, top.r + 1) * (c.layout === 'stands' ? Math.min(1, scale + 0.2) : 1), ry = top.y + 8.5;
          const i0 = [a.x + a.nx * (top.r + 1.2 - rd), ry + 2.5, a.z + a.nz * (top.r + 1.2 - rd)], i1 = [b.x + b.nx * (top.r + 1.2 - rd), ry + 2.5, b.z + b.nz * (top.r + 1.2 - rd)];
          const r0 = [o0[0], ry, o0[2]], r1 = [o1[0], ry, o1[2]];
          quad(roofG, r0, r1, i1, i0);
          quad(darkG, o0, o1, r1, r0);
          // inner fascia carrying the roof floodlights
          quad(c.lights === 'roof' ? fasG : darkG, i0, i1, [i1[0], i1[1] - 1.1, i1[2]], [i0[0], i0[1] - 1.1, i0[2]]);
          if (c.lights === 'roof' && i % 6 === 3) this.lightPositions.push(new THREE.Vector3((i0[0] + i1[0]) / 2, i0[1] - 0.6, (i0[2] + i1[2]) / 2));
          if (i % 3 === 0) { // truss
            const w = 0.25, tx = (b.x - a.x), tz = (b.z - a.z), l = Math.hypot(tx, tz) || 1, ox = (tx / l) * w, oz = (tz / l) * w;
            quad(darkG, [r0[0], r0[1] - 0.05, r0[2]], [r0[0] + ox, r0[1] - 0.05, r0[2] + oz], [i0[0] + ox, i0[1] - 0.05, i0[2] + oz], [i0[0], i0[1] - 0.05, i0[2]]);
            quad(darkG, [r0[0], r0[1] - 1.6, r0[2]], [r0[0], r0[1], r0[2]], [i0[0], i0[1], i0[2]], [i0[0], i0[1] - 0.3, i0[2]]);
          }
        }
      }
      // end caps for open stands
      if (c.layout === 'stands') for (const e of [pts[0], pts[pts.length - 1]]) {
        const prof = this.profile(c.sideScale[e.side]); const top = prof[prof.length - 1];
        for (let k = 1; k < prof.length - 1; k++) {
          const f0 = prof[k], f1 = prof[k + 1];
          quad(wallG, [e.x + e.nx * f0.r, 0, e.z + e.nz * f0.r], [e.x + e.nx * f1.r, 0, e.z + e.nz * f1.r], [e.x + e.nx * f1.r, f1.y, e.z + e.nz * f1.r], [e.x + e.nx * f0.r, f0.y, e.z + e.nz * f0.r]);
        }
        quad(wallG, [e.x + e.nx * top.r, 0, e.z + e.nz * top.r], [e.x + e.nx * (top.r + 1.2), 0, e.z + e.nz * (top.r + 1.2)], [e.x + e.nx * (top.r + 1.2), top.y + 1.4, e.z + e.nz * (top.r + 1.2)], [e.x + e.nx * top.r, top.y + 1.4, e.z + e.nz * top.r]);
      }
    }
    const geo = (arr: number[], uv?: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; };
    const ds = (m: THREE.MeshStandardMaterial) => { m.side = THREE.DoubleSide; return m; };
    if (seatG.length) this.add(geo(seatG, seatUV), ds(seatMat));
    if (wallG.length) this.add(geo(wallG), ds(concrete));
    if (fasG.length) this.add(geo(fasG), ds(fascia), false, false);
    if (roofG.length) this.add(geo(roofG), roofMat, false, false);
    if (darkG.length) this.add(geo(darkG), dark, false, false);
    this.lightMats.push(fascia);

    // Floodlight pylons
    if (c.lights === 'pylons') {
      const hx = HL + c.endMargin + 26, hz = HW + c.sideMargin + 24, h = Math.max(34, maxTop + 16);
      const pole = this.mat({ color: '#9aa0a8', roughness: 0.5, metalness: 0.6 });
      const panel = this.mat({ color: '#30333a', emissive: new THREE.Color('#fff6e0'), emissiveMap: lightTex, emissiveIntensity: 2.2, map: lightTex });
      this.lightMats.push(panel);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * hx * 0.86, z = sz * hz * 0.86;
        this.add(new THREE.CylinderGeometry(0.5, 0.9, h, 8).translate(x, h / 2, z), pole, true);
        const pg = new THREE.BoxGeometry(10, 6.5, 0.6);
        const pm = new THREE.Mesh(this.track(pg), panel); pm.position.set(x, h + 2, z); pm.lookAt(0, 0, 0); this.group.add(pm);
        this.lightPositions.push(new THREE.Vector3(x, h + 2, z));
      }
    }

    // Tunnel in the middle of the far stand
    const hzT = -(HW + c.sideMargin);
    this.add(new THREE.BoxGeometry(6, 3.2, 3).translate(0, 1.6, hzT - 1.2), this.mat({ color: '#07080b', roughness: 1 }), false, false);
    this.add(new THREE.BoxGeometry(7, 0.35, 4.2).translate(0, 3.35, hzT + 0.3), this.mat({ color: c.accent, roughness: 0.5, emissive: new THREE.Color(c.accent), emissiveIntensity: 0.25 }), true);

    // Crowd: two instanced meshes (bodies, heads) animated in the vertex shader.
    const max = Math.round(CROWD_MAX[q] * this.crowdScale);
    const keep = Math.min(1, max / Math.max(1, seats.length * c.attendance)) * c.attendance;
    const chosen = seats.filter(() => rng.next() < keep);
    this.crowdCount = chosen.length;
    const body = new THREE.BoxGeometry(0.46, 0.62, 0.3); body.translate(0, 0.42, 0);
    const bodyGeo = this.track(body);
    const headGeo = this.track(new THREE.SphereGeometry(0.125, 5, 4).translate(0, 0.9, 0));
    const phase = new Float32Array(chosen.length);
    for (let i = 0; i < phase.length; i++) phase[i] = rng.next();
    const mk = (g: THREE.BufferGeometry) => {
      g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
      const m = this.track(new THREE.MeshLambertMaterial());
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdUniforms.uTime; sh.uniforms.uExcite = this.crowdUniforms.uExcite;
        sh.vertexShader = 'attribute float aPhase;\nuniform float uTime;\nuniform float uExcite;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
          float jmp = max(0.0, sin(uTime * (5.0 + aPhase * 3.0) + aPhase * 40.0));
          float part = step(1.0 - uExcite * 1.15, fract(aPhase * 7.31));
          transformed.y += jmp * jmp * part * 0.5 + sin(uTime * 1.3 + aPhase * 30.0) * 0.012;
          transformed.y += part * 0.18;`);
      };
      const im = new THREE.InstancedMesh(g, m, chosen.length); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
      return im;
    };
    const bodies = mk(bodyGeo), heads = mk(headGeo);
    const neutrals = ['#2b2f3a', '#e8e8ea', '#5b6475', '#8a3b3b', '#3b5d8a', '#d9c9a8', '#1c1c1f', '#6d7a52'];
    const o = new THREE.Object3D(), col = new THREE.Color();
    // Away supporters occupy one block of the near/right corner.
    const sLen = sections[0][sections[0].length - 1].s;
    chosen.forEach((s, i) => {
      o.position.set(s.x, s.y + 0.05, s.z); o.rotation.set(0, s.rot, 0); o.scale.setScalar(0.9 + rng.next() * 0.2); o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix);
      const awayBlock = c.layout === 'stands' ? s.side === 3 && s.z > 0 : s.s / sLen > 0.44 && s.s / sLen < 0.5;
      const r = rng.next();
      col.set(awayBlock ? (r < 0.8 ? away : '#e8e8ea') : r < 0.55 ? home[0] : r < 0.7 ? home[1] : neutrals[Math.floor(rng.next() * neutrals.length)]);
      col.offsetHSL(0, 0, (rng.next() - 0.5) * 0.12);
      bodies.setColorAt(i, col);
      col.set(SKIN[Math.floor(rng.next() * SKIN.length)]); heads.setColorAt(i, col);
    });
    this.group.add(bodies, heads);
    this.disposables.push(bodies, heads);
  }

  private buildBoards() {
    const t = this.track(ledTexture(this.cfg.accent)); this.leds.push(t);
    const mat = this.mat({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.4 });
    const dark = this.mat({ color: '#15171c', roughness: 0.8 });
    const board = (x: number, z: number, len: number, rotY: number, rep: number) => {
      const g = new THREE.PlaneGeometry(len, 0.95);
      const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
      const m = new THREE.Mesh(this.track(g), mat); m.position.set(x, 0.52, z); m.rotation.y = rotY; this.group.add(m);
      const b = new THREE.Mesh(this.track(new THREE.BoxGeometry(len, 1.0, 0.25)), dark); b.position.set(x - Math.sin(rotY) * 0.14, 0.5, z - Math.cos(rotY) * 0.14); b.rotation.y = rotY; b.castShadow = true; this.group.add(b);
    };
    const zf = HW + 3.6, xe = HL + 4.4;
    board(0, -zf, 2 * HL + 4, 0, 6); board(0, zf, 2 * HL + 4, Math.PI, 6);
    for (const s of [-1, 1]) for (const zs of [-1, 1]) board(s * xe, zs * (GOAL_HW + 4 + (HW - GOAL_HW - 2) / 2), HW - GOAL_HW - 6, -s * Math.PI / 2, 1.6);
  }

  private buildDugouts() {
    const frame = this.mat({ color: '#2a2d34', roughness: 0.6, metalness: 0.4 });
    const glass = this.mat({ color: '#cfe8f5', transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const seat = this.mat({ color: this.cfg.seat, roughness: 0.7 });
    const sub = this.mat({ color: '#d7d7dc', roughness: 0.8 });
    for (const s of [-1, 1]) {
      const x = s * 9, z = -(HW + 5.8);
      this.add(new THREE.BoxGeometry(9, 0.45, 0.9).translate(x, 0.35, z), seat, true);
      this.add(new THREE.BoxGeometry(9.4, 0.12, 0.2).translate(x, 0.05, z + 1.2), frame);
      const roof = new THREE.CylinderGeometry(1.7, 1.7, 9.4, 12, 1, true, Math.PI * 0.5, Math.PI * 0.62); roof.rotateZ(Math.PI / 2); roof.translate(x, 0.5, z + 0.5);
      this.add(roof, glass, false, false);
      for (const e of [-4.7, 4.7]) this.add(new THREE.BoxGeometry(0.1, 2.1, 1.9).translate(x + e, 1.05, z - 0.1), frame, true);
      // substitutes on the bench and a standing coach in the technical area
      for (let i = 0; i < 7; i++) {
        this.add(new THREE.BoxGeometry(0.45, 0.6, 0.3).translate(x - 3.6 + i * 1.2, 0.9, z), sub, true);
        this.add(new THREE.SphereGeometry(0.12, 8, 6).translate(x - 3.6 + i * 1.2, 1.36, z), this.mat({ color: SKIN[(i * 2 + (s > 0 ? 1 : 0)) % 6] }));
      }
      this.add(new THREE.CapsuleGeometry(0.2, 1.1, 3, 8).translate(x + s * 2, 0.85, z + 3.4), this.mat({ color: '#1b1d24', roughness: 0.8 }), true);
      this.add(new THREE.SphereGeometry(0.12, 8, 6).translate(x + s * 2, 1.72, z + 3.4), this.mat({ color: SKIN[1] }));
    }
  }

  private buildFlags() {
    const pole = this.mat({ color: '#f5f5f5', roughness: 0.5 });
    const cloth = this.mat({ color: '#ffd400', roughness: 0.8, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.add(new THREE.CylinderGeometry(0.02, 0.02, 1.55, 6).translate(sx * HL, 0.775, sz * HW), pole, true);
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.42, 0.14); shape.lineTo(0, 0.3);
      const f = new THREE.Mesh(this.track(new THREE.ShapeGeometry(shape)), cloth); f.position.set(sx * HL, 1.22, sz * HW); f.castShadow = true;
      this.group.add(f); this.flags.push(f);
    }
  }

  /** Crowd reaction: 0.08 calm .. 1 everyone on their feet. */
  cheer(level: number) { this.exciteTarget = Math.max(this.exciteTarget, level); this.excite = Math.max(this.excite, level * 0.7); }
  netHit(side: number) { this.netKick[side > 0 ? 1 : 0] = 1; }
  setNight(night: number) { for (const m of this.lightMats) m.emissiveIntensity = (m.emissiveMap ? 0.9 : 0.5) + night * (m.emissiveMap ? 3.2 : 1.2); }

  update(dt: number, time: number) {
    this.exciteTarget = Math.max(0.08, this.exciteTarget - dt * 0.14);
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * 3);
    this.crowdUniforms.uTime.value = time; this.crowdUniforms.uExcite.value = this.excite;
    for (const t of this.leds) t.offset.x = (time * 0.012) % 1;
    this.flags.forEach((f, i) => { f.rotation.y = Math.sin(time * 2.3 + i) * 0.5 + 0.6; });
    this.nets.forEach((n) => {
      const i = n.userData.side > 0 ? 1 : 0; this.netKick[i] = Math.max(0, this.netKick[i] - dt * 1.6);
      const k = this.netKick[i]; n.position.x = n.userData.side * (HL + 1.25 + 0.35 * k * Math.abs(Math.sin(time * 18)));
    });
  }
  dispose() { for (const d of this.disposables) d.dispose(); this.group.removeFromParent(); }
}
