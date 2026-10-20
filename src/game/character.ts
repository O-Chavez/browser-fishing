import * as THREE from 'three';
import { cosById, type Cosmetic, type Look } from '../data/cosmetics';
import { faceTexture } from './faces';

const mat = (c: number, emissive = 0, flat = true) =>
  new THREE.MeshStandardMaterial({
    color: c,
    roughness: emissive ? 0.35 : 0.8,
    metalness: emissive ? 0.5 : 0,
    flatShading: flat,
    emissive: emissive ? c : 0x000000,
    emissiveIntensity: emissive ? 0.35 : 0,
  });

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};

const ring = (r: number, tube: number, m: THREE.Material, y: number, z = 0, tilt = 0): THREE.Mesh => {
  const o = mesh(new THREE.TorusGeometry(r, tube, 6, 18), m, 0, y, z);
  o.rotation.x = Math.PI / 2 - tilt;
  return o;
};

function hatModel(c: Cosmetic): THREE.Group {
  const g = new THREE.Group();
  const glow = c.tier >= 5 ? 1 : 0;
  const m = mat(c.color, glow);
  const a = mat(c.accent, glow);
  switch (c.id) {
    case 'cap':
      g.add(mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 1.66, 0));
      g.add(mesh(new THREE.BoxGeometry(0.28, 0.025, 0.2), a, 0, 1.69, 0.24));
      break;
    case 'straw':
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), m, 0, 1.74, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.2, 12), m, 0, 1.84, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 12), mat(0xb03a2e), 0, 1.79, 0));
      break;
    case 'bucket':
      g.add(mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.22, 12), m, 0, 1.82, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 14), a, 0, 1.72, 0));
      break;
    case 'captain':
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.2, 14), m, 0, 1.84, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.06, 14), a, 0, 1.76, 0));
      g.add(mesh(new THREE.BoxGeometry(0.32, 0.03, 0.22), a, 0, 1.74, 0.24));
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xd4af37, 1), 0, 1.86, 0.28));
      break;
    case 'horned':
      g.add(mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 1.66, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 12), mat(0xd4af37, 1), 0, 1.68, 0));
      for (const s of [-1, 1]) {
        const h = mesh(new THREE.ConeGeometry(0.06, 0.4, 8), a, s * 0.26, 1.9, 0);
        h.rotation.z = -s * 0.5;
        g.add(h);
      }
      break;
    default:
      // Golden crown: ring plus glowing points and jewels.
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.12, 12), m, 0, 1.8, 0));
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 6), m, Math.sin(t) * 0.2, 1.92, Math.cos(t) * 0.2));
        g.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), a, Math.sin(t) * 0.215, 1.83, Math.cos(t) * 0.215));
      }
  }
  return g;
}

function shirtModel(c: Cosmetic): THREE.Group {
  const g = new THREE.Group();
  const m = mat(c.color, c.tier >= 5 ? 0.6 : 0);
  const a = mat(c.accent, c.tier >= 5 ? 1 : 0);
  g.add(mesh(new THREE.CapsuleGeometry(0.3, c.id === 'coat' ? 0.5 : 0.36, 4, 10), m, 0, c.id === 'coat' ? 0.9 : 1.02, 0));
  switch (c.id) {
    case 'striped':
      for (let y = 0.8; y <= 1.25; y += 0.14) g.add(ring(0.3, 0.025, a, y));
      break;
    case 'vest':
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), a, -0.14, 0.95, 0.28));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), a, 0.14, 0.95, 0.28));
      break;
    case 'hawaiian':
      for (let i = 0; i < 9; i++) {
        const t = i * 0.9;
        g.add(mesh(new THREE.SphereGeometry(0.045, 6, 6), a, Math.sin(t) * 0.3, 0.8 + (i % 4) * 0.12, Math.cos(t) * 0.3));
      }
      break;
    case 'coat':
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), mat(0xd4af37, 1), 0, 0.75 + i * 0.16, 0.3));
      g.add(ring(0.3, 0.04, a, 1.3));
      break;
    case 'cloak': {
      const cape = mesh(new THREE.ConeGeometry(0.42, 1.1, 12, 1, true), m, 0, 0.9, -0.22);
      (cape.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      cape.scale.z = 0.6;
      g.add(cape, ring(0.33, 0.04, a, 1.3), ring(0.3, 0.03, a, 0.62));
      break;
    }
  }
  return g;
}

function jewelryModel(c: Cosmetic): THREE.Group {
  const g = new THREE.Group();
  const glow = c.tier >= 4 ? 1 : 0;
  const m = mat(c.color, glow);
  const a = mat(c.accent, glow);
  g.add(ring(0.2, c.id === 'pearl' ? 0.035 : 0.014, m, 1.42, 0.02, 0.35));
  const gem = (geo: THREE.BufferGeometry, mm: THREE.Material) => g.add(mesh(geo, mm, 0, 1.3, 0.24));
  if (c.id === 'shell') gem(new THREE.ConeGeometry(0.06, 0.1, 6), m);
  else if (c.id === 'pendant') gem(new THREE.OctahedronGeometry(0.07), a);
  else if (c.id === 'amulet') gem(new THREE.OctahedronGeometry(0.09), a);
  else if (c.id === 'diamond') {
    gem(new THREE.OctahedronGeometry(0.11), a);
    g.add(ring(0.21, 0.01, a, 1.41, 0.02, 0.35));
  }
  return g;
}

const MODELS = { hat: hatModel, shirt: shirtModel, jewelry: jewelryModel };

/** A character facing +z, about 1.9 tall, without held items. `set` swaps the body color and outfit. */
export class Character {
  readonly group = new THREE.Group();
  private body = mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), mat(0xffffff), 0, 0.85, 0);
  /** Skin and face come from the face texture, so the material stays white. */
  private head = mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(0xffffff), 0, 1.62, 0);
  private outfit = new THREE.Group();
  private key = '';

  constructor(look: Look) {
    this.group.add(this.body, this.head, this.outfit);
    this.set(look);
  }

  set(look: Look): void {
    const key = JSON.stringify(look);
    if (key === this.key) return;
    this.key = key;
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(look.color);
    const head = this.head.material as THREE.MeshStandardMaterial;
    head.map = faceTexture(look.face);
    head.needsUpdate = true;
    this.outfit.clear();
    for (const slot of ['hat', 'shirt', 'jewelry'] as const) {
      const c = cosById(look[slot]);
      if (c) this.outfit.add(MODELS[slot](c));
    }
  }
}

/** Auto-spin speed (radians per second), and how long it waits after a drag before resuming. */
const SPIN_SPEED = 0.7;
const SPIN_RESUME_MS = 3000;
/** Radians of turn per pixel dragged. */
const DRAG_TURN = 0.012;

/**
 * One shared WebGL canvas showing a slowly spinning character; moved into whichever menu tab
 * needs it. Click and drag to turn it by hand.
 */
export class CharacterPreview {
  readonly canvas = document.createElement('canvas');
  private renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 0.8, 0.1, 20);
  private char: Character;
  private raf = 0;
  private spin = 0.6;
  private drag: { x: number; spin: number } | null = null;
  private idleAt = 0;

  constructor(look: Look) {
    this.canvas.className = 'preview';
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(240, 300, false);
    this.cam.position.set(0, 1.25, 5.2);
    this.cam.lookAt(0, 1.0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.char = new Character(look);
    this.scene.add(this.char.group);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, spin: this.spin };
      this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) this.spin = this.drag.spin + (e.clientX - this.drag.x) * DRAG_TURN;
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.idleAt = performance.now() + SPIN_RESUME_MS;
      this.canvas.classList.remove('dragging');
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  set(look: Look): void {
    this.char.set(look);
  }

  start(): void {
    if (this.raf) return;
    let last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.drag && t >= this.idleAt) this.spin += ((t - last) / 1000) * SPIN_SPEED;
      last = t;
      this.char.group.rotation.y = this.spin;
      this.renderer.render(this.scene, this.cam);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
