import * as THREE from 'three';
import { waveHeight } from './env';

const MAX = 240;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  max: number;
  delay: number;
  active: boolean;
}

/** Water splash particles and expanding ripple rings. */
export class FX {
  readonly group = new THREE.Group();
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private alpha = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private age = new Float32Array(MAX).fill(99);
  private life = new Float32Array(MAX).fill(1);
  private color = new Float32Array(MAX * 3).fill(1);
  /** Gravity scale: 1 for water droplets, low for floating sparkles. */
  private grav = new Float32Array(MAX).fill(1);
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private rings: Ring[] = [];
  private ringNext = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aAlpha; attribute float aSize; attribute vec3 aColor; varying float vA; varying vec3 vC;
        void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (700.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vC, smoothstep(0.5,0.15,d) * vA); }`,
    });
    const pts = new THREE.Points(this.geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.group.add(pts);

    const ringGeo = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeo, m);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.rings.push({ mesh, mat: m, age: 0, life: 1, max: 1, delay: 0, active: false });
    }
  }

  splash(p: THREE.Vector3, n = 24, power = 1): void {
    for (let k = 0; k < n; k++) {
      const i = this.next++ % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 1.4) * power;
      this.pos.set([p.x + Math.cos(a) * 0.05, p.y, p.z + Math.sin(a) * 0.05], i * 3);
      this.vel.set([Math.cos(a) * sp * 0.6, (2 + Math.random() * 3.2) * power, Math.sin(a) * sp * 0.6], i * 3);
      this.life[i] = 0.55 + Math.random() * 0.5;
      this.age[i] = 0;
      this.size[i] = 0.05 + Math.random() * 0.07;
      this.color.set([0.93, 0.98, 1], i * 3);
      this.grav[i] = 1;
    }
  }

  /** A burst of floating coloured sparkles in every direction, for landing a jewel or spirit fish. */
  burst(p: THREE.Vector3, color: THREE.Color, n = 60, power = 1, radius = 0.3): void {
    const white = new THREE.Color(1, 1, 1);
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = this.next++ % MAX;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dir = [Math.cos(a) * r, u, Math.sin(a) * r];
      const sp = (1.2 + Math.random() * 2.2) * power;
      this.pos.set(dir.map((d, j) => [p.x, p.y, p.z][j] + d * radius * Math.random()), i * 3);
      this.vel.set([dir[0] * sp, dir[1] * sp + 0.8 * power, dir[2] * sp], i * 3);
      this.life[i] = 0.9 + Math.random() * 0.9;
      this.age[i] = 0;
      this.size[i] = 0.04 + Math.random() * 0.06;
      c.copy(color).lerp(white, Math.random() < 0.3 ? 0.8 : Math.random() * 0.3);
      this.color.set([c.r, c.g, c.b], i * 3);
      this.grav[i] = 0.12;
    }
  }

  ripple(p: THREE.Vector3, max = 1.6, delay = 0, life = 1.6): void {
    const r = this.rings[this.ringNext++ % this.rings.length];
    r.mesh.position.set(p.x, 0, p.z);
    Object.assign(r, { age: 0, life, max, delay, active: true });
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= 9.8 * this.grav[i] * dt;
      if (this.grav[i] < 1) for (let a = 0; a < 3; a++) this.vel[i * 3 + a] *= 1 - 2.2 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.alpha[i] = Math.max(0, 1 - this.age[i] / this.life[i]) * 0.9;
      const surface = waveHeight(this.pos[i * 3], this.pos[i * 3 + 2], time);
      if (this.grav[i] === 1 && this.pos[i * 3 + 1] < surface - 0.05 && this.vel[i * 3 + 1] < 0) this.age[i] = this.life[i];
    }
    for (const attr of ['position', 'aAlpha', 'aSize', 'aColor'] as const) this.geo.getAttribute(attr).needsUpdate = true;

    for (const r of this.rings) {
      if (!r.active) continue;
      if (r.delay > 0) {
        r.delay -= dt;
        r.mesh.visible = false;
        continue;
      }
      r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      r.mesh.scale.setScalar(0.12 + u * r.max);
      r.mat.opacity = (1 - u) * (1 - u) * 0.6;
      r.mesh.position.y = waveHeight(r.mesh.position.x, r.mesh.position.z, time) + 0.05;
    }
  }
}
