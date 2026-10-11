// A small low-poly sailor in the player's colour, with a name tag.

import * as THREE from "three";
import type { AvatarMode } from "../../../shared/protocol";
import { textSprite } from "./world/props";

const skin = new THREE.MeshStandardMaterial({ color: "#f2c9a0", roughness: 0.7 });
const white = new THREE.MeshStandardMaterial({ color: "#f7f7f2", roughness: 0.6 });
const navy = new THREE.MeshStandardMaterial({ color: "#1d2b53", roughness: 0.6 });
const dark = new THREE.MeshStandardMaterial({ color: "#222222", roughness: 0.5 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(0.5, 14, 10);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);

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

function limb(material: THREE.Material, w: number, h: number, d: number, pivotY: number): { pivot: THREE.Object3D; mesh: THREE.Mesh } {
  const pivot = new THREE.Object3D();
  pivot.position.y = pivotY;
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.scale.set(w, h, d);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return { pivot, mesh };
}

export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly shirt: THREE.MeshStandardMaterial;
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private tag: THREE.Sprite;
  private readonly speaker: THREE.Sprite;
  private phase = Math.random() * 10;
  private name: string;
  private color: string;

  constructor(name: string, color: string) {
    this.name = name;
    this.color = color;
    this.shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
    const torso = new THREE.Mesh(cylGeo, this.shirt);
    torso.scale.set(0.56, 0.72, 0.42);
    torso.position.y = 1.12;
    torso.castShadow = true;
    const collar = new THREE.Mesh(boxGeo, white);
    collar.scale.set(0.5, 0.12, 0.3);
    collar.position.set(0, 1.44, -0.08);
    const head = new THREE.Mesh(sphereGeo, skin);
    head.scale.setScalar(0.46);
    head.position.y = 1.72;
    head.castShadow = true;
    const hat = new THREE.Mesh(cylGeo, white);
    hat.scale.set(0.5, 0.14, 0.5);
    hat.position.y = 1.96;
    const band = new THREE.Mesh(cylGeo, navy);
    band.scale.set(0.51, 0.05, 0.51);
    band.position.y = 1.91;
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(sphereGeo, dark);
      eye.scale.setScalar(0.06);
      eye.position.set(sx, 1.75, 0.21);
      this.body.add(eye);
    }
    for (const sx of [-0.13, 0.13]) {
      const leg = limb(navy, 0.18, 0.76, 0.2, 0.78);
      leg.pivot.position.x = sx;
      this.legs.push(leg.pivot);
      this.body.add(leg.pivot);
      const arm = limb(this.shirt, 0.14, 0.62, 0.14, 1.42);
      arm.pivot.position.x = sx * 2.75;
      this.arms.push(arm.pivot);
      this.body.add(arm.pivot);
    }
    this.body.add(torso, collar, head, hat, band);
    this.root.add(this.body);

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
    tag.position.y = 2.45;
    tag.renderOrder = 8;
    return tag;
  }

  setIdentity(name: string, color: string): void {
    if (name === this.name && color === this.color) return;
    this.name = name;
    this.color = color;
    this.shirt.color.set(color);
    this.root.remove(this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.tag = this.makeTag();
    this.root.add(this.tag);
  }

  setTagVisible(visible: boolean): void {
    this.tag.visible = visible;
  }

  /** Poses the limbs. `mode` changes the stance (swimming lies flat). */
  update(dt: number, moving: boolean, mode: AvatarMode, speaking: boolean): void {
    this.phase += dt * (moving ? 9 : 2);
    const swing = moving ? Math.sin(this.phase) * 0.7 : 0;
    const swimming = mode === "swim";
    this.body.rotation.x = swimming ? 1.25 : 0;
    this.body.position.y = swimming ? 0.25 : moving ? Math.abs(Math.sin(this.phase)) * 0.06 : 0;
    this.legs[0].rotation.x = swimming ? Math.sin(this.phase * 1.4) * 0.4 : swing;
    this.legs[1].rotation.x = swimming ? -Math.sin(this.phase * 1.4) * 0.4 : -swing;
    if (swimming) {
      this.arms[0].rotation.x = this.phase % (Math.PI * 2);
      this.arms[1].rotation.x = (this.phase + Math.PI) % (Math.PI * 2);
    } else if (mode === "helm") {
      this.arms[0].rotation.x = -1.1;
      this.arms[1].rotation.x = -1.1;
    } else {
      this.arms[0].rotation.x = -swing * 0.8 + Math.sin(this.phase * 0.5) * 0.04;
      this.arms[1].rotation.x = swing * 0.8 - Math.sin(this.phase * 0.5) * 0.04;
    }
    this.tag.position.y = swimming ? 1.3 : 2.45;
    this.speaker.visible = speaking;
    this.speaker.position.set(0, this.tag.position.y + 0.42, 0);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.shirt.dispose();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.speaker.material.dispose();
  }
}
