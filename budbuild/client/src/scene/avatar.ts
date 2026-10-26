// A cartoon sailor in the player's colour: a jointed body (hips, knees,
// shoulders, elbows, head) with walk, run, jump, swim, steering and idle
// animations, a face that blinks, and a name tag.

import * as THREE from "three";
import { clamp, hashString, lerp } from "../../../shared/math";
import type { AvatarMode } from "../../../shared/protocol";
import { textSprite } from "./world/props";

const SKIN_TONES = ["#f6d2b4", "#eac09c", "#d9a47e", "#b97f5a", "#8d5a3b", "#5e3b26"];
const HAIR_COLORS = ["#2b1d14", "#4a2f1d", "#7a4b2a", "#c58b4b", "#e6c47a", "#1d1d22", "#a33b25"];

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
const sphere = new THREE.SphereGeometry(1, 24, 16);
const geo = {
  thigh: capsule(0.085, 0.3).translate(0, -0.23, 0),
  shin: capsule(0.072, 0.3).translate(0, -0.22, 0),
  upperArm: capsule(0.068, 0.2).translate(0, -0.16, 0),
  forearm: capsule(0.058, 0.18).translate(0, -0.14, 0),
  torso: capsule(0.19, 0.26),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12),
  shoe: new THREE.CapsuleGeometry(0.075, 0.12, 4, 12).rotateX(Math.PI / 2),
  hatTop: new THREE.CylinderGeometry(0.2, 0.215, 0.13, 28),
  hatBand: new THREE.CylinderGeometry(0.218, 0.218, 0.045, 28),
  visor: new THREE.CylinderGeometry(0.2, 0.2, 0.025, 28, 1, false, -Math.PI / 2.4, Math.PI / 1.2),
  belt: new THREE.TorusGeometry(0.175, 0.03, 8, 28).rotateX(Math.PI / 2),
  mouth: new THREE.TorusGeometry(0.045, 0.011, 6, 16, Math.PI).rotateZ(Math.PI),
  brow: new THREE.CapsuleGeometry(0.012, 0.045, 3, 6).rotateZ(Math.PI / 2),
  collar: new THREE.BoxGeometry(0.34, 0.2, 0.03),
  tie: new THREE.ConeGeometry(0.05, 0.12, 4).rotateX(Math.PI),
};

let stripeTex: THREE.CanvasTexture | null = null;
/** White shirt texture with horizontal stripes (tinted by the material colour). */
function stripes(): THREE.CanvasTexture {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 8, 64);
  g.fillStyle = "#c9ccd6";
  for (let y = 4; y < 64; y += 12) g.fillRect(0, y, 8, 5);
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  return stripeTex;
}

const shared = {
  white: new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: "#1f1f24", roughness: 0.4 }),
  shoe: new THREE.MeshStandardMaterial({ color: "#3b2a20", roughness: 0.55 }),
  belt: new THREE.MeshStandardMaterial({ color: "#3b2a20", roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: "#e8b923", roughness: 0.3, metalness: 0.8 }),
  navy: new THREE.MeshStandardMaterial({ color: "#1d2b53", roughness: 0.6 }),
  mouth: new THREE.MeshStandardMaterial({ color: "#7a2b2b", roughness: 0.6 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25 }),
};

let speakerTexture: THREE.CanvasTexture | null = null;
function getSpeakerTexture(): THREE.CanvasTexture {
  if (speakerTexture) return speakerTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(20,40,60,0.75)";
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#7cff9b";
  g.beginPath();
  g.moveTo(14, 26);
  g.lineTo(24, 26);
  g.lineTo(36, 15);
  g.lineTo(36, 49);
  g.lineTo(24, 38);
  g.lineTo(14, 38);
  g.closePath();
  g.fill();
  g.strokeStyle = "#7cff9b";
  g.lineWidth = 4;
  for (const r of [8, 15]) {
    g.beginPath();
    g.arc(38, 32, r, -0.9, 0.9);
    g.stroke();
  }
  speakerTexture = new THREE.CanvasTexture(c);
  speakerTexture.colorSpace = THREE.SRGBColorSpace;
  return speakerTexture;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

interface Limb {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
}

export class Avatar {
  readonly root = new THREE.Group();
  /** Everything that tilts when swimming. */
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Limb[] = [];
  private readonly arms: Limb[] = [];
  private readonly eyes: THREE.Object3D[] = [];
  private readonly shirt: THREE.MeshStandardMaterial;
  private readonly shorts: THREE.MeshStandardMaterial;
  private readonly skin: THREE.MeshStandardMaterial;
  private readonly hair: THREE.MeshStandardMaterial;
  private tag: THREE.Sprite;
  private readonly speaker: THREE.Sprite;
  private name: string;
  private color: string;

  private phase = Math.random() * 10;
  private time = Math.random() * 100;
  private speed = 0;
  private vy = 0;
  private readonly lastPos = new THREE.Vector3();
  private hasLast = false;
  private nextBlink = 2 + Math.random() * 3;
  private swimBlend = 0;

  constructor(name: string, color: string, seedId = name) {
    this.name = name;
    this.color = color;
    const seed = hashString(seedId);
    this.skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[seed % SKIN_TONES.length], roughness: 0.62 });
    this.hair = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[(seed >>> 4) % HAIR_COLORS.length], roughness: 0.75 });
    this.shirt = new THREE.MeshStandardMaterial({ color, map: stripes(), roughness: 0.7 });
    this.shorts = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.75 });

    // Hips sit at leg length above the feet.
    this.hips.position.y = 0.9;
    this.body.add(this.hips);
    this.root.add(this.body);

    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.1, 0, 0);
      upper.add(mesh(geo.thigh, this.shorts));
      const lower = new THREE.Group();
      lower.position.y = -0.44;
      lower.add(mesh(geo.shin, this.skin));
      const shoe = mesh(geo.shoe, shared.shoe);
      shoe.position.set(0, -0.4, 0.05);
      lower.add(shoe);
      upper.add(lower);
      this.hips.add(upper);
      this.legs.push({ upper, lower });
    }

    this.torso.position.y = 0.02;
    this.hips.add(this.torso);
    const chest = mesh(geo.torso, this.shirt);
    chest.position.y = 0.3;
    chest.scale.set(1, 1, 0.78);
    this.torso.add(chest);
    const belt = mesh(geo.belt, shared.belt);
    belt.position.y = 0.1;
    belt.scale.set(1, 1, 0.8);
    this.torso.add(belt);
    const buckle = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), shared.gold, false);
    buckle.position.set(0, 0.1, 0.145);
    this.torso.add(buckle);
    const collar = mesh(geo.collar, shared.navy);
    collar.position.set(0, 0.5, -0.12);
    collar.rotation.x = -0.25;
    this.torso.add(collar);
    const tie = mesh(geo.tie, new THREE.MeshStandardMaterial({ color: "#d62828", roughness: 0.6 }), false);
    tie.position.set(0, 0.5, 0.14);
    this.torso.add(tie);
    const neck = mesh(geo.neck, this.skin);
    neck.position.y = 0.6;
    this.torso.add(neck);

    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.235, 0.52, 0);
      upper.rotation.z = side * 0.12;
      const sleeve = mesh(geo.upperArm, this.shirt);
      upper.add(sleeve);
      const lower = new THREE.Group();
      lower.position.y = -0.3;
      lower.add(mesh(geo.forearm, this.skin));
      const hand = mesh(sphere, this.skin);
      hand.scale.setScalar(0.065);
      hand.position.y = -0.3;
      lower.add(hand);
      upper.add(lower);
      this.torso.add(upper);
      this.arms.push({ upper, lower });
    }

    // Head.
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    const skull = mesh(sphere, this.skin);
    skull.scale.set(0.2, 0.215, 0.195);
    skull.position.y = 0.17;
    this.head.add(skull);
    const hairCap = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), this.hair);
    hairCap.scale.set(0.212, 0.222, 0.207);
    hairCap.position.set(0, 0.185, -0.012);
    hairCap.rotation.x = -0.35;
    this.head.add(hairCap);
    for (const side of [-1, 1]) {
      const ear = mesh(sphere, this.skin);
      ear.scale.set(0.035, 0.05, 0.03);
      ear.position.set(side * 0.198, 0.16, -0.01);
      this.head.add(ear);
      const eye = new THREE.Group();
      eye.position.set(side * 0.072, 0.19, 0.168);
      const white = mesh(sphere, shared.eyeWhite, false);
      white.scale.set(0.036, 0.042, 0.02);
      const pupil = mesh(sphere, shared.dark, false);
      pupil.scale.set(0.021, 0.026, 0.012);
      pupil.position.z = 0.012;
      const shine = mesh(sphere, shared.eyeWhite, false);
      shine.scale.setScalar(0.007);
      shine.position.set(0.008, 0.01, 0.022);
      eye.add(white, pupil, shine);
      this.head.add(eye);
      this.eyes.push(eye);
      const brow = mesh(geo.brow, this.hair, false);
      brow.position.set(side * 0.075, 0.245, 0.175);
      brow.rotation.z = side * -0.12;
      this.head.add(brow);
    }
    const nose = mesh(sphere, this.skin, false);
    nose.scale.set(0.028, 0.026, 0.028);
    nose.position.set(0, 0.145, 0.19);
    this.head.add(nose);
    const mouth = mesh(geo.mouth, shared.mouth, false);
    mouth.position.set(0, 0.095, 0.172);
    mouth.rotation.x = -0.25;
    this.head.add(mouth);
    // Captain's hat.
    const hat = new THREE.Group();
    hat.position.set(0, 0.33, -0.01);
    hat.rotation.x = -0.12;
    const top = mesh(geo.hatTop, shared.white);
    top.position.y = 0.05;
    const band = mesh(geo.hatBand, shared.navy);
    band.position.y = 0.0;
    const visor = mesh(geo.visor, shared.dark);
    visor.position.set(0, -0.02, 0.04);
    visor.scale.set(1.05, 1, 1.15);
    const badge = mesh(sphere, shared.gold, false);
    badge.scale.set(0.035, 0.03, 0.012);
    badge.position.set(0, 0.0, 0.215);
    hat.add(top, band, visor, badge);
    this.head.add(hat);

    this.tag = this.makeTag();
    this.root.add(this.tag);
    this.speaker = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSpeakerTexture(), depthWrite: false, fog: false }));
    this.speaker.scale.set(0.4, 0.4, 1);
    this.speaker.visible = false;
    this.root.add(this.speaker);
  }

  private makeTag(): THREE.Sprite {
    const tag = textSprite(this.name, { size: 44, background: "rgba(16,32,48,0.62)", color: this.color });
    tag.scale.set(0.42 * tag.userData.aspect, 0.42, 1);
    tag.position.y = 2.35;
    tag.renderOrder = 8;
    return tag;
  }

  setIdentity(name: string, color: string): void {
    if (name === this.name && color === this.color) return;
    this.name = name;
    this.color = color;
    this.shirt.color.set(color);
    this.shorts.color.set(color).multiplyScalar(0.55);
    this.root.remove(this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.tag = this.makeTag();
    this.root.add(this.tag);
  }

  setTagVisible(visible: boolean): void {
    this.tag.visible = visible;
  }

  /** Call after the root has been positioned for this frame. */
  update(dt: number, _moving: boolean, mode: AvatarMode, speaking: boolean): void {
    this.time += dt;
    // Speed from how far the avatar moved in its own space (boat-local when aboard).
    const p = this.root.position;
    if (this.hasLast && dt > 0) {
      const dx = p.x - this.lastPos.x;
      const dz = p.z - this.lastPos.z;
      const dy = p.y - this.lastPos.y;
      const jump = Math.hypot(dx, dz) > 4 || Math.abs(dy) > 4;
      const s = jump ? 0 : Math.hypot(dx, dz) / dt;
      this.speed = lerp(this.speed, Math.min(12, s), 1 - Math.exp(-dt * 10));
      this.vy = jump ? 0 : lerp(this.vy, dy / dt, 1 - Math.exp(-dt * 12));
    }
    this.lastPos.copy(p);
    this.hasLast = true;

    const swimming = mode === "swim";
    this.swimBlend = lerp(this.swimBlend, swimming ? 1 : 0, 1 - Math.exp(-dt * 6));
    const speed = mode === "helm" || mode === "build" ? 0 : this.speed;
    const amp = clamp(speed / 6, 0, 1.25);
    const running = speed > 7.5;
    this.phase += dt * (swimming ? 4.5 : 2.2 + speed * 1.15);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    // Body: swimming lies flat, running leans in.
    this.body.rotation.x = this.swimBlend * 1.35;
    this.body.position.y = this.swimBlend * 0.55;
    const airborne = mode === "walk" && Math.abs(this.vy) > 1.4;

    if (swimming) {
      this.hips.position.y = 0.9;
      this.legs[0].upper.rotation.x = Math.sin(this.phase * 2) * 0.35;
      this.legs[1].upper.rotation.x = -Math.sin(this.phase * 2) * 0.35;
      this.legs.forEach((l) => (l.lower.rotation.x = 0.2));
      this.arms[0].upper.rotation.x = -this.phase % (Math.PI * 2);
      this.arms[1].upper.rotation.x = -(this.phase + Math.PI) % (Math.PI * 2);
      this.arms.forEach((a) => (a.lower.rotation.x = -0.3));
      this.torso.rotation.set(0, s * 0.25, 0);
      this.head.rotation.x = -0.9;
    } else if (airborne) {
      this.hips.position.y = 0.9;
      const tuck = this.vy > 0 ? 1 : 0.6;
      this.legs[0].upper.rotation.x = -0.9 * tuck;
      this.legs[1].upper.rotation.x = -0.3 * tuck;
      this.legs[0].lower.rotation.x = 1.3 * tuck;
      this.legs[1].lower.rotation.x = 0.7 * tuck;
      this.arms[0].upper.rotation.x = -2.4;
      this.arms[1].upper.rotation.x = -2.1;
      this.arms.forEach((a) => (a.lower.rotation.x = -0.4));
      this.torso.rotation.set(0.1, 0, 0);
      this.head.rotation.x = -0.1;
    } else if (mode === "helm") {
      this.hips.position.y = 0.9 + Math.sin(this.time * 1.5) * 0.01;
      this.legs.forEach((l, i) => {
        l.upper.rotation.x = i ? -0.1 : 0.12;
        l.lower.rotation.x = 0.15;
      });
      this.arms.forEach((a) => {
        a.upper.rotation.x = -1.05;
        a.lower.rotation.x = -0.55;
      });
      this.torso.rotation.set(0.05, Math.sin(this.time * 0.7) * 0.08, 0);
      this.head.rotation.set(-0.05, Math.sin(this.time * 0.5) * 0.25, 0);
    } else {
      // Walk / run cycle, blending into idle when standing still.
      const legSwing = (running ? 0.85 : 0.62) * amp;
      this.legs[0].upper.rotation.x = s * legSwing;
      this.legs[1].upper.rotation.x = -s * legSwing;
      this.legs[0].lower.rotation.x = Math.max(0, -Math.sin(this.phase - 1.1)) * (running ? 1.5 : 1.0) * amp + 0.05;
      this.legs[1].lower.rotation.x = Math.max(0, Math.sin(this.phase - 1.1)) * (running ? 1.5 : 1.0) * amp + 0.05;
      const armSwing = (running ? 0.9 : 0.55) * amp;
      const idle = 1 - Math.min(1, amp * 2);
      this.arms[0].upper.rotation.x = -s * armSwing + idle * Math.sin(this.time * 1.7) * 0.04;
      this.arms[1].upper.rotation.x = s * armSwing - idle * Math.sin(this.time * 1.7) * 0.04;
      this.arms.forEach((a) => (a.lower.rotation.x = -0.25 - (running ? 0.9 : 0.35) * amp));
      this.hips.position.y = 0.9 + Math.abs(c) * 0.06 * amp - (running ? 0.04 : 0) + idle * Math.sin(this.time * 2) * 0.006;
      this.torso.rotation.set((running ? 0.22 : 0.05) * amp, s * 0.1 * amp, 0);
      this.torso.scale.y = 1 + idle * Math.sin(this.time * 2) * 0.012;
      // Idle: glance around now and then.
      this.head.rotation.set(-0.03 * amp, idle * Math.sin(this.time * 0.45) * 0.35, 0);
    }

    // Blink.
    this.nextBlink -= dt;
    const blink = this.nextBlink < 0.12 ? 0.12 : 1;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blink;

    this.tag.position.y = swimming ? 1.25 : 2.35;
    this.speaker.visible = speaking;
    this.speaker.position.set(0, this.tag.position.y + 0.42, 0);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.shirt.dispose();
    this.shorts.dispose();
    this.skin.dispose();
    this.hair.dispose();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.speaker.material.dispose();
  }
}
