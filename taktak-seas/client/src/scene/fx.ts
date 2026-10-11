// Short-lived visual effects: cannon shots (ball, flash, smoke) and splashes.

import * as THREE from "three";
import { waveHeight } from "../../../shared/world";

interface Ball {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  grow: number;
  rise: number;
}

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  private readonly group = new THREE.Group();
  private readonly balls: Ball[] = [];
  private readonly puffs: Puff[] = [];
  private readonly ballGeo = new THREE.SphereGeometry(0.22, 10, 8);
  private readonly ballMat = new THREE.MeshStandardMaterial({ color: "#1d1d22", metalness: 0.6, roughness: 0.4 });
  private readonly tex = puffTexture();
  /** Called when something hits the water (for sound). */
  onSplash: ((x: number, z: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private puff(pos: THREE.Vector3, color: string, size: number, life: number, grow: number, rise: number, additive = false): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        color,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    sprite.position.copy(pos);
    sprite.scale.setScalar(size);
    this.group.add(sprite);
    this.puffs.push({ sprite, life, max: life, grow, rise });
  }

  cannon(origin: THREE.Vector3, dir: THREE.Vector3): void {
    const d = dir.clone().normalize();
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.copy(origin);
    this.group.add(mesh);
    this.balls.push({ mesh, vel: d.multiplyScalar(48).add(new THREE.Vector3(0, 7, 0)), life: 6 });
    this.puff(origin, "#ffcf6b", 1.6, 0.18, 6, 0, true);
    for (let i = 0; i < 4; i++) {
      const p = origin.clone().addScaledVector(dir, 0.4 + i * 0.5);
      this.puff(p, "#d9d9d9", 1 + i * 0.3, 1.4 + i * 0.2, 2.2, 1.2);
    }
  }

  splash(x: number, z: number, t: number, size = 1): void {
    const y = waveHeight(x, z, t);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Vector3(x + (Math.random() - 0.5) * size, y + 0.3, z + (Math.random() - 0.5) * size);
      this.puff(p, "#e9f7ff", 0.8 * size + Math.random() * 0.6, 0.9 + Math.random() * 0.4, 2.5 * size, 2.5 * size);
    }
    this.onSplash?.(x, z);
  }

  update(dt: number, time: number): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const p = b.mesh.position;
      if (p.y < waveHeight(p.x, p.z, time) || b.life <= 0) {
        if (b.life > 0) this.splash(p.x, p.z, time, 1.6);
        b.mesh.removeFromParent();
        this.balls.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const f = this.puffs[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.removeFromParent();
        f.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      const k = f.life / f.max;
      f.sprite.scale.multiplyScalar(1 + f.grow * dt * 0.5);
      f.sprite.position.y += f.rise * dt;
      f.sprite.material.opacity = k;
    }
  }
}
