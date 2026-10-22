import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cosById, type Cosmetic, type Look } from '../data/cosmetics';
import { faceTexture } from './faces';

// ---------- materials ----------

/**
 * How a surface reads. Lower tiers are matte cloth; better items add satin, polished metal and
 * gems; legendary items get `glow` trims that slowly breathe (see `pulse`).
 */
type Finish = 'cloth' | 'satin' | 'metal' | 'gem' | 'glow';

const FINISH: Record<Finish, { rough: number; metal: number; glow: number }> = {
  cloth: { rough: 0.9, metal: 0, glow: 0 },
  satin: { rough: 0.5, metal: 0.05, glow: 0 },
  metal: { rough: 0.32, metal: 0.55, glow: 0.18 },
  gem: { rough: 0.15, metal: 0.1, glow: 0.45 },
  glow: { rough: 0.3, metal: 0, glow: 1 },
};

/** Outfit materials are shared by every character wearing the item, so they are made once. */
const MATS = new Map<string, THREE.MeshStandardMaterial>();
/** Glowing materials, with their resting intensity, that `pulse` makes breathe. */
const PULSE = new Map<THREE.MeshStandardMaterial, number>();

function mat(color: number, finish: Finish = 'cloth', side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${color}:${finish}:${side}`;
  let m = MATS.get(key);
  if (!m) {
    const f = FINISH[finish];
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: f.rough,
      metalness: f.metal,
      flatShading: true,
      side,
      emissive: f.glow ? color : 0x000000,
      emissiveIntensity: f.glow,
    });
    MATS.set(key, m);
    if (finish === 'glow') PULSE.set(m, f.glow);
  }
  return m;
}

let pulsedAt = -1;
/** Breathes every legendary glow together; cheap enough to call from each character's tick. */
function pulse(t: number): void {
  if (t === pulsedAt) return;
  pulsedAt = t;
  const k = 0.8 + 0.35 * Math.sin(t * 2.6);
  for (const [m, base] of PULSE) m.emissiveIntensity = base * k;
}

/** Scales a colour toward black (k < 1) or white (k > 1). */
const shade = (c: number, k: number): number => {
  const col = new THREE.Color(c);
  return (k < 1 ? col.multiplyScalar(k) : col.lerp(new THREE.Color(0xffffff), k - 1)).getHex();
};

const GOLD = 0xe0b441;
const BRASS = 0xc99a3c;
const SILVER = 0xd0d6dc;
const INK = 0x1b1b24;
const WHITE = 0xf6f2e8;
const PINK = 0xff4f9a;

// ---------- geometry helpers ----------

type V3 = [number, number, number];
/** Where a part goes: position, rotation (radians) and scale. Baked into the geometry. */
interface At {
  p?: V3;
  r?: V3;
  s?: V3 | number;
}

const tmp = new THREE.Object3D();
function place(geo: THREE.BufferGeometry, at: At = {}): THREE.BufferGeometry {
  tmp.position.set(...(at.p ?? [0, 0, 0]));
  tmp.rotation.set(...(at.r ?? [0, 0, 0]));
  if (typeof at.s === 'number') tmp.scale.setScalar(at.s);
  else tmp.scale.set(...(at.s ?? [1, 1, 1]));
  tmp.updateMatrix();
  return geo.applyMatrix4(tmp.matrix);
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, at: At = {}): THREE.Mesh {
  const o = new THREE.Mesh(place(geo, at), m);
  o.castShadow = true;
  g.add(o);
  return o;
}

/** Many small parts in one material become one mesh (one draw call). */
function addMany(g: THREE.Group, m: THREE.Material, parts: [THREE.BufferGeometry, At][]): THREE.Mesh {
  return add(g, mergeGeometries(parts.map(([geo, at]) => place(geo, at)))!, m);
}

const H = Math.PI / 2;

/** A horizontal ring around the body at height y. */
const hoop = (r: number, tube: number, y: number, seg = 18): [THREE.BufferGeometry, At] => [new THREE.TorusGeometry(r, tube, 5, seg), { p: [0, y, 0], r: [H, 0, 0] }];

/** Legendary items get a few twinkling stars circling the wearer; `Character.tick` spins them. */
function sparkles(g: THREE.Group, color: number, y: number, radius: number, n = 5, speed = 0.9): void {
  const parts: [THREE.BufferGeometry, At][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const size = i % 2 ? 0.022 : 0.032;
    parts.push([new THREE.OctahedronGeometry(size), { p: [Math.sin(a) * radius, y + Math.sin(a * 3) * 0.12, Math.cos(a) * radius], s: [0.7, 1.4, 0.7] }]);
  }
  const o = addMany(g, mat(color, 'glow'), parts);
  o.castShadow = false;
  o.userData.spin = speed;
}

// ---------- torso and neck ----------

/** Shirt profile (radius, height) from hem to neckline; the body capsule is 0.28 wide. */
const SHIRT: [number, number][] = [
  [0.305, 0.55],
  [0.315, 0.62],
  [0.315, 1.12],
  [0.29, 1.3],
  [0.22, 1.42],
  [0.14, 1.47],
];
/** A long coat flares out to below the hips. */
const COAT: [number, number][] = [[0.35, 0.36], [0.33, 0.5], ...SHIRT.slice(1)];

/** Radius of the shirt at height y, for placing buttons and pockets on its front. */
function rAt(y: number, prof = SHIRT): number {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1];
    const [r1, y1] = prof[i];
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / (y1 - y0);
  }
  return prof[prof.length - 1][0];
}
const front = (y: number, lift = 0.008): number => rAt(y) + lift;

function torso(g: THREE.Group, m: THREE.Material, prof = SHIRT): void {
  add(g, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), m);
}

/** Necklaces drape over the collarbone, lower at the front; the pendant hangs from `HANG`. */
const NECK = { r: 0.235, y: 1.37, z: 0.115, tilt: 0.5 };
const HANG: V3 = [0, 1.18, 0.345];
function chain(g: THREE.Group, m: THREE.Material, tube: number, grow = 0): void {
  add(g, new THREE.TorusGeometry(NECK.r + grow, tube, 5, 22), m, { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] });
}
/** Point i of n beads along the necklace, front first. */
function beadAt(i: number, n: number, grow = 0): V3 {
  const a = (i / n) * Math.PI * 2;
  const r = NECK.r + grow;
  const x = Math.sin(a) * r;
  const fz = Math.cos(a) * r;
  return [x, NECK.y - fz * Math.sin(NECK.tilt), NECK.z + fz * Math.cos(NECK.tilt)];
}

// ---------- canvas textures (dice faces, casino chip) ----------

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};
let diceMats: THREE.MeshStandardMaterial[] | null = null;
/** Six faces for a red die, ordered +x, -x, +y, -y, +z, -z so the front shows 3 and the top 4 (and the twin turned shows 4 and 3: seven). */
function diceMaterials(color: number): THREE.MeshStandardMaterial[] {
  if (diceMats) return diceMats;
  const face = (n: number) =>
    new THREE.MeshStandardMaterial({
      roughness: 0.35,
      flatShading: true,
      map: canvasTex((g, s) => {
        g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#fff6e8';
        for (const [x, y] of PIPS[n]) {
          g.beginPath();
          g.arc(x * s, y * s, s * 0.09, 0, Math.PI * 2);
          g.fill();
        }
      }),
    });
  diceMats = [2, 5, 4, 3, 3, 1].map(face);
  return diceMats;
}

let chipMats: THREE.MeshStandardMaterial[] | null = null;
/** A casino chip face: pink and gold edge stripes, a gold star in the middle. Glows with the legendary pulse. */
function chipMaterials(): THREE.MeshStandardMaterial[] {
  if (chipMats) return chipMats;
  const tex = canvasTex((g, s) => {
    const c = s / 2;
    g.fillStyle = '#ff4f9a';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffe9a8';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, c, a - 0.18, a + 0.18);
      g.fill();
    }
    g.fillStyle = '#1b1b24';
    g.beginPath();
    g.arc(c, c, s * 0.33, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd24a';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? s * 0.11 : s * 0.25;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.fill();
  }, 128);
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.3, flatShading: true });
  PULSE.set(face, 0.45);
  chipMats = [mat(GOLD, 'metal'), face, face];
  return chipMats;
}

// ---------- hats (head: centre y 1.62, radius 0.2, face toward +z) ----------

function hatModel(c: Cosmetic, g: THREE.Group): void {
  const m = (k = 1, f: Finish = 'cloth') => mat(k === 1 ? c.color : shade(c.color, k), f);
  const a = (f: Finish = 'cloth') => mat(c.accent, f);
  switch (c.id) {
    case 'cap':
      add(g, new THREE.SphereGeometry(0.215, 12, 6, 0, Math.PI * 2, 0, H), m(), { p: [0, 1.66, 0] });
      add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.022, 12, 1, false, -H, Math.PI), a(), { p: [0, 1.69, 0.1], s: [0.9, 1, 1.05], r: [0.12, 0, 0] });
      add(g, new THREE.SphereGeometry(0.03, 6, 4), a(), { p: [0, 1.875, 0] });
      break;
    case 'straw':
      add(g, new THREE.CylinderGeometry(0.43, 0.45, 0.03, 16), m(), { p: [0, 1.74, 0] });
      add(g, new THREE.CylinderGeometry(0.19, 0.23, 0.19, 12), m(1.08), { p: [0, 1.84, 0] });
      add(g, new THREE.CylinderGeometry(0.234, 0.236, 0.05, 12), a(), { p: [0, 1.785, 0] });
      // A little daisy tucked in the band.
      addMany(g, mat(WHITE), [0, 1, 2, 3, 4].map((i) => [new THREE.SphereGeometry(0.025, 5, 4), { p: [0.2 + Math.cos(i * 1.257) * 0.03, 1.79 + Math.sin(i * 1.257) * 0.03, 0.12], s: [1, 1, 0.5] }]));
      break;
    case 'bucket':
      add(g, new THREE.CylinderGeometry(0.235, 0.265, 0.2, 12), m(), { p: [0, 1.82, 0] });
      add(g, new THREE.CylinderGeometry(0.27, 0.37, 0.07, 14, 1, true), mat(c.color, 'cloth', THREE.DoubleSide), { p: [0, 1.705, 0] });
      add(g, new THREE.CylinderGeometry(0.255, 0.262, 0.045, 12), m(0.7), { p: [0, 1.76, 0] });
      // Hand-tied fly hooked in the band: orange body and a yellow hackle.
      add(g, new THREE.ConeGeometry(0.022, 0.09, 5), a(), { p: [0.235, 1.77, 0.09], r: [0, 0, 1.2] });
      add(g, new THREE.SphereGeometry(0.026, 5, 4), mat(0xffd84a), { p: [0.265, 1.79, 0.09] });
      break;
    case 'captain':
      add(g, new THREE.CylinderGeometry(0.3, 0.26, 0.13, 14), m(), { p: [0, 1.87, 0] });
      add(g, new THREE.CylinderGeometry(0.262, 0.262, 0.07, 14), a(), { p: [0, 1.785, 0] });
      add(g, new THREE.CylinderGeometry(0.21, 0.21, 0.02, 12, 1, false, -H, Math.PI), mat(INK, 'satin'), { p: [0, 1.75, 0.12], s: [0.85, 1, 0.9], r: [0.3, 0, 0] });
      // Brass anchor badge.
      addMany(g, mat(BRASS, 'metal'), [
        [new THREE.TorusGeometry(0.03, 0.009, 4, 10, Math.PI), { p: [0, 1.875, 0.285], r: [0, 0, Math.PI] }],
        [new THREE.BoxGeometry(0.012, 0.07, 0.012), { p: [0, 1.89, 0.285] }],
        [new THREE.BoxGeometry(0.045, 0.01, 0.012), { p: [0, 1.91, 0.285] }],
      ]);
      break;
    case 'horned': {
      // Heron Plume Hat: a felt fedora with a long silver feather and a brass buckle.
      add(g, new THREE.CylinderGeometry(0.36, 0.38, 0.028, 16), m(1, 'satin'), { p: [0, 1.74, 0] });
      add(g, new THREE.CylinderGeometry(0.17, 0.23, 0.21, 10), m(1, 'satin'), { p: [0, 1.86, 0], s: [1, 1, 0.9] });
      add(g, new THREE.CylinderGeometry(0.233, 0.236, 0.05, 12), m(0.45, 'satin'), { p: [0, 1.785, 0] });
      add(g, new THREE.BoxGeometry(0.06, 0.05, 0.02), mat(BRASS, 'metal'), { p: [0, 1.785, 0.235] });
      add(g, new THREE.SphereGeometry(1, 6, 8), a('satin'), { p: [-0.21, 1.9, -0.08], s: [0.045, 0.17, 0.012], r: [-0.6, 0.3, 0.75] });
      add(g, new THREE.SphereGeometry(1, 5, 6), mat(0x50606e, 'satin'), { p: [-0.29, 1.99, -0.17], s: [0.03, 0.06, 0.01], r: [-0.6, 0.3, 0.75] });
      break;
    }
    case 'crown': {
      // Lake King's Crown: gold waves, pearl tips, a velvet cap and a glowing sapphire.
      add(g, new THREE.SphereGeometry(0.19, 10, 5, 0, Math.PI * 2, 0, H), mat(0x7a1f3f), { p: [0, 1.79, 0] });
      add(g, new THREE.CylinderGeometry(0.225, 0.205, 0.12, 14), m(1, 'metal'), { p: [0, 1.8, 0] });
      add(g, new THREE.TorusGeometry(0.218, 0.014, 4, 18), m(1, 'metal'), { p: [0, 1.745, 0], r: [H, 0, 0] });
      const tips: [THREE.BufferGeometry, At][] = [];
      const pearls: [THREE.BufferGeometry, At][] = [];
      for (let i = 0; i < 7; i++) {
        const t = (i / 7) * Math.PI * 2;
        const x = Math.sin(t) * 0.205;
        const z = Math.cos(t) * 0.205;
        tips.push([new THREE.ConeGeometry(0.06, 0.19, 4), { p: [x, 1.94, z], r: [Math.cos(t) * 0.18, 0, -Math.sin(t) * 0.18] }]);
        pearls.push([new THREE.SphereGeometry(0.025, 6, 4), { p: [Math.sin(t) * 0.232, 2.045, Math.cos(t) * 0.232] }]);
      }
      addMany(g, m(1, 'metal'), tips);
      addMany(g, mat(0xfff5ee, 'gem'), pearls);
      add(g, new THREE.OctahedronGeometry(0.055), mat(c.accent, 'glow'), { p: [0, 1.81, 0.225], s: [1, 1.25, 0.6] });
      sparkles(g, 0xfff1a8, 1.95, 0.42);
      break;
    }
    case 'visor':
      // Dealer's Visor: an open felt band, a gold rim and a green brim.
      add(g, new THREE.CylinderGeometry(0.205, 0.215, 0.08, 14, 1, true), mat(c.color, 'satin', THREE.DoubleSide), { p: [0, 1.72, 0] });
      add(g, new THREE.TorusGeometry(0.207, 0.011, 4, 18), mat(GOLD, 'metal'), { p: [0, 1.76, 0], r: [H, 0, 0] });
      add(g, new THREE.CylinderGeometry(0.24, 0.24, 0.015, 14, 1, false, -H, Math.PI), mat(shade(c.color, 1.25), 'satin'), { p: [0, 1.7, 0.07], s: [0.95, 1, 1.15], r: [0.32, 0, 0] });
      add(g, new THREE.TorusGeometry(0.235, 0.008, 4, 12, Math.PI), mat(GOLD, 'metal'), { p: [0, 1.7, 0.07], s: [0.95, 1.15, 1], r: [H + 0.32, 0, 0] });
      break;
    case 'tophat':
      // High Roller Top Hat: black silk, curled brim, neon band and a golden spade.
      add(g, new THREE.CylinderGeometry(0.19, 0.175, 0.28, 14), mat(c.color, 'satin'), { p: [0, 1.91, 0] });
      add(g, new THREE.CylinderGeometry(0.31, 0.31, 0.025, 16), mat(c.color, 'satin'), { p: [0, 1.765, 0], s: [1, 1, 0.88] });
      add(g, new THREE.TorusGeometry(0.31, 0.02, 4, 18), mat(c.color, 'satin'), { p: [0, 1.775, 0], r: [H, 0, 0], s: [1, 0.88, 1] });
      add(g, new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14), mat(c.accent, 'glow'), { p: [0, 1.81, 0] });
      addMany(g, mat(GOLD, 'metal'), [
        [new THREE.SphereGeometry(0.03, 6, 4), { p: [-0.022, 1.86, 0.185], s: [1, 1, 0.5] }],
        [new THREE.SphereGeometry(0.03, 6, 4), { p: [0.022, 1.86, 0.185], s: [1, 1, 0.5] }],
        [new THREE.ConeGeometry(0.042, 0.06, 4), { p: [0, 1.895, 0.185], s: [1, 1, 0.5] }],
        [new THREE.ConeGeometry(0.018, 0.04, 4), { p: [0, 1.835, 0.185] }],
      ]);
      // A playing card tucked in the band.
      add(g, new THREE.BoxGeometry(0.07, 0.1, 0.006), mat(WHITE), { p: [0.14, 1.85, 0.12], r: [0, 0.85, 0.25] });
      break;
  }
}

// ---------- shirts ----------

function shirtModel(c: Cosmetic, g: THREE.Group): void {
  const m = (k = 1, f: Finish = 'cloth') => mat(k === 1 ? c.color : shade(c.color, k), f);
  const a = (f: Finish = 'cloth') => mat(c.accent, f);
  switch (c.id) {
    case 'tee':
      torso(g, m());
      addMany(g, a(), [hoop(0.215, 0.022, 1.42), hoop(0.31, 0.016, 0.57)]);
      break;
    case 'striped':
      torso(g, m());
      addMany(g, a(), [0.7, 0.86, 1.02, 1.18].map((y) => hoop(rAt(y) + 0.004, 0.03, y)));
      addMany(g, a(), [hoop(0.215, 0.026, 1.42)]);
      break;
    case 'vest': {
      // Angler Vest over a cream shirt: open front, four pockets and two lucky flies.
      torso(g, m());
      add(g, new THREE.BoxGeometry(0.11, 0.62, 0.04), mat(0xece4d0), { p: [0, 1.0, front(1.0) - 0.008], r: [-0.05, 0, 0] });
      const pockets: [THREE.BufferGeometry, At][] = [];
      for (const s of [-1, 1])
        for (const y of [0.78, 1.04]) pockets.push([new THREE.BoxGeometry(0.11, 0.11, 0.04), { p: [s * 0.15, y, front(y) - 0.03], r: [0, s * 0.5, 0] }]);
      addMany(g, a(), pockets);
      add(g, new THREE.ConeGeometry(0.018, 0.07, 5), mat(0xff6a3d), { p: [-0.165, 1.15, front(1.15) - 0.03], r: [0, 0, 0.6] });
      add(g, new THREE.ConeGeometry(0.018, 0.07, 5), mat(0x4fc3f7), { p: [-0.115, 1.15, front(1.15) + 0.005], r: [0, 0, -0.5] });
      break;
    }
    case 'hawaiian': {
      // Lily Pad Shirt: teal with pink lilies and a white open collar.
      torso(g, m());
      const petals: [THREE.BufferGeometry, At][] = [];
      const hearts: [THREE.BufferGeometry, At][] = [];
      for (let i = 0; i < 9; i++) {
        const t = i * 2.4 + 0.3;
        const y = 0.7 + ((i * 0.37) % 1) * 0.5;
        const r = rAt(y) + 0.005;
        petals.push([new THREE.SphereGeometry(0.055, 6, 3), { p: [Math.sin(t) * r, y, Math.cos(t) * r], r: [0, t, 0], s: [1, 1, 0.3] }]);
        hearts.push([new THREE.SphereGeometry(0.018, 4, 3), { p: [Math.sin(t) * (r + 0.015), y, Math.cos(t) * (r + 0.015)] }]);
      }
      addMany(g, a(), petals);
      addMany(g, mat(0xffd84a), hearts);
      addMany(g, mat(WHITE), [
        [new THREE.BoxGeometry(0.1, 0.13, 0.02), { p: [-0.07, 1.37, 0.2], r: [-0.6, -0.4, 0.5] }],
        [new THREE.BoxGeometry(0.1, 0.13, 0.02), { p: [0.07, 1.37, 0.2], r: [-0.6, 0.4, -0.5] }],
      ]);
      break;
    }
    case 'coat': {
      // Harbor Peacoat: long navy wool, wide collar and two rows of brass buttons.
      torso(g, m(1, 'satin'), COAT);
      add(g, new THREE.TorusGeometry(0.21, 0.05, 5, 16), m(0.7, 'satin'), { p: [0, 1.4, 0.01], r: [H + 0.3, 0, 0] });
      const btn: [THREE.BufferGeometry, At][] = [];
      for (const s of [-1, 1]) for (const y of [0.72, 0.9, 1.08]) btn.push([new THREE.SphereGeometry(0.028, 6, 4), { p: [s * 0.09, y, front(y) - 0.005], s: [1, 1, 0.6] }]);
      addMany(g, a('metal'), btn);
      addMany(g, m(0.7, 'satin'), [hoop(0.335, 0.02, 0.5)]);
      break;
    }
    case 'cloak': {
      // Aurora Mantle: midnight satin, a cape with glowing aurora trims, a star clasp and drifting stars.
      torso(g, m(1, 'satin'));
      // The cape is the back half of a flared tube hanging from the shoulders.
      const cape = mat(0x3d2a8f, 'satin', THREE.DoubleSide);
      add(g, new THREE.CylinderGeometry(0.34, 0.47, 1.05, 12, 1, true, H, Math.PI), cape, { p: [0, 0.88, -0.03], s: [1, 1, 0.8] });
      add(g, new THREE.TorusGeometry(0.47, 0.028, 4, 14, Math.PI), mat(c.accent, 'glow'), { p: [0, 0.355, -0.03], r: [-H, 0, 0], s: [1, 0.8, 1] });
      add(g, new THREE.TorusGeometry(0.215, 0.035, 5, 16), mat(0xff7ad9, 'glow'), { p: [0, 1.42, 0], r: [H, 0, 0] });
      add(g, new THREE.OctahedronGeometry(0.06), mat(0xfff1a8, 'glow'), { p: [0, 1.32, front(1.32) + 0.02], s: [1, 1, 0.5] });
      addMany(g, mat(c.accent, 'glow'), [hoop(0.31, 0.014, 0.57)]);
      sparkles(g, 0xb8fff0, 1.05, 0.5, 6, -0.7);
      break;
    }
    case 'dealer': {
      // Croupier's Waistcoat: red with a white shirt front, black bow tie and gold buttons.
      torso(g, m(1, 'satin'));
      add(g, new THREE.BoxGeometry(0.13, 0.36, 0.04), mat(WHITE), { p: [0, 1.22, front(1.22) - 0.012], r: [-0.3, 0, 0] });
      addMany(g, mat(INK, 'satin'), [
        [new THREE.ConeGeometry(0.045, 0.07, 4), { p: [-0.04, 1.37, 0.235], r: [0, 0, -H] }],
        [new THREE.ConeGeometry(0.045, 0.07, 4), { p: [0.04, 1.37, 0.235], r: [0, 0, H] }],
        [new THREE.SphereGeometry(0.02, 5, 4), { p: [0, 1.37, 0.24] }],
        hoop(0.31, 0.02, 0.57),
      ]);
      addMany(g, mat(GOLD, 'metal'), [0.72, 0.86, 1.0].map((y) => [new THREE.SphereGeometry(0.022, 6, 4), { p: [0, y, front(y)], s: [1, 1, 0.6] }]));
      break;
    }
    case 'tux': {
      // Jackpot Tuxedo: black satin, gold lapels, glowing pink bow tie and pocket square, drifting stars.
      torso(g, m(1, 'satin'), COAT);
      add(g, new THREE.BoxGeometry(0.15, 0.4, 0.04), mat(WHITE), { p: [0, 1.2, front(1.2) - 0.012], r: [-0.3, 0, 0] });
      addMany(g, a('metal'), [
        [new THREE.BoxGeometry(0.05, 0.42, 0.03), { p: [-0.1, 1.15, front(1.15) - 0.005], r: [-0.25, -0.25, -0.32] }],
        [new THREE.BoxGeometry(0.05, 0.42, 0.03), { p: [0.1, 1.15, front(1.15) - 0.005], r: [-0.25, 0.25, 0.32] }],
        [new THREE.SphereGeometry(0.025, 6, 4), { p: [0, 0.85, front(0.85)], s: [1, 1, 0.6] }],
        hoop(0.335, 0.016, 0.38),
      ]);
      addMany(g, mat(PINK, 'glow'), [
        [new THREE.ConeGeometry(0.05, 0.08, 4), { p: [-0.045, 1.37, 0.24], r: [0, 0, -H] }],
        [new THREE.ConeGeometry(0.05, 0.08, 4), { p: [0.045, 1.37, 0.24], r: [0, 0, H] }],
        [new THREE.SphereGeometry(0.022, 5, 4), { p: [0, 1.37, 0.25] }],
        [new THREE.ConeGeometry(0.035, 0.06, 4), { p: [0.17, 1.13, front(1.13) - 0.01], r: [0, 0.5, 0] }],
      ]);
      break;
    }
  }
}

// ---------- jewelry ----------

function jewelryModel(c: Cosmetic, g: THREE.Group): void {
  const [hx, hy, hz] = HANG;
  switch (c.id) {
    case 'shell':
      chain(g, mat(c.color), 0.011);
      add(g, new THREE.ConeGeometry(0.06, 0.075, 7), mat(c.accent, 'satin'), { p: [hx, hy + 0.01, hz], r: [Math.PI, 0, 0], s: [1, 1, 0.45] });
      break;
    case 'chain':
      chain(g, mat(c.color, 'metal'), 0.012);
      // A silver fish hook with an eye.
      addMany(g, mat(SILVER, 'metal'), [
        [new THREE.TorusGeometry(0.014, 0.006, 4, 8), { p: [hx, hy + 0.05, hz] }],
        [new THREE.CylinderGeometry(0.007, 0.007, 0.08, 5), { p: [hx, hy, hz] }],
        [new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI * 1.2), { p: [hx + 0.03, hy - 0.04, hz], r: [0, 0, Math.PI * 0.95] }],
      ]);
      break;
    case 'pendant':
      chain(g, mat(c.color, 'metal'), 0.011);
      add(g, new THREE.SphereGeometry(1, 8, 6), mat(c.color, 'metal'), { p: [hx, hy, hz], s: [0.06, 0.035, 0.02] });
      add(g, new THREE.ConeGeometry(0.03, 0.04, 4), mat(c.color, 'metal'), { p: [hx - 0.07, hy, hz], r: [0, 0, H], s: [1, 1, 0.5] });
      add(g, new THREE.SphereGeometry(0.012, 5, 4), mat(c.accent, 'gem'), { p: [hx + 0.03, hy + 0.008, hz + 0.017] });
      break;
    case 'pearl': {
      // Pearl Strand: a full ring of pearls with a larger drop at the front.
      const n = 18;
      addMany(g, mat(c.color, 'gem'), [...Array.from({ length: n }, (_, i): [THREE.BufferGeometry, At] => [new THREE.SphereGeometry(0.024, 6, 4), { p: beadAt(i, n, 0.01) }]), [new THREE.SphereGeometry(0.04, 7, 5), { p: [hx, hy + 0.02, hz] }]]);
      add(g, new THREE.ConeGeometry(0.02, 0.03, 5), mat(c.accent, 'metal'), { p: [hx, hy + 0.065, hz] });
      break;
    }
    case 'amulet':
      chain(g, mat(c.color, 'metal'), 0.013);
      add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), mat(c.color, 'metal'), { p: [hx, hy, hz - 0.005], r: [H, 0, 0] });
      add(g, new THREE.TorusGeometry(0.075, 0.01, 4, 12), mat(shade(c.color, 1.2), 'metal'), { p: [hx, hy, hz + 0.005] });
      add(g, new THREE.OctahedronGeometry(0.055), mat(c.accent, 'gem'), { p: [hx, hy, hz + 0.02], s: [1, 1.2, 0.55] });
      break;
    case 'diamond':
      // Starfall Diamond: double gold chain, a large glowing diamond and stars that circle it.
      chain(g, mat(c.color, 'metal'), 0.013);
      chain(g, mat(c.accent, 'glow'), 0.008, 0.02);
      add(g, new THREE.ConeGeometry(0.03, 0.035, 6), mat(c.color, 'metal'), { p: [hx, hy + 0.08, hz] });
      add(g, new THREE.OctahedronGeometry(0.1), mat(c.accent, 'glow'), { p: [hx, hy - 0.03, hz + 0.02], s: [0.85, 1.25, 0.55] });
      sparkles(g, 0xffffff, 1.2, 0.48, 5, 1.2);
      break;
    case 'dice': {
      // Lucky Dice Chain: gold links and a pair of red dice showing seven.
      chain(g, mat(c.color, 'metal'), 0.014);
      const dice = diceMaterials(c.accent);
      const die = (x: number, ry: number, rz: number) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), dice);
        o.position.set(hx + x, hy - 0.01, hz + 0.01);
        o.rotation.set(0.15, ry, rz);
        o.castShadow = true;
        g.add(o);
      };
      die(-0.048, 0.25, 0.1);
      die(0.05, -H + 0.2, -0.12);
      break;
    }
    case 'jackpot': {
      // Jackpot Medallion: a heavy gold chain and a giant glowing casino chip.
      chain(g, mat(c.color, 'metal'), 0.02);
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 18), chipMaterials());
      chip.position.set(hx, hy - 0.04, hz + 0.02);
      chip.rotation.x = H;
      chip.castShadow = true;
      g.add(chip);
      add(g, new THREE.TorusGeometry(0.118, 0.012, 4, 20), mat(c.accent, 'glow'), { p: [hx, hy - 0.04, hz + 0.02] });
      add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), mat(c.color, 'metal'), { p: [hx, hy + 0.09, hz] });
      sparkles(g, 0xffd24a, 1.15, 0.5, 6, -1.1);
      break;
    }
  }
}

const MODELS = { hat: hatModel, shirt: shirtModel, jewelry: jewelryModel };

/** One built model per item; every wearer gets a clone sharing its geometry and materials. */
const TEMPLATES = new Map<string, THREE.Group>();
function outfitPiece(c: Cosmetic): THREE.Group {
  let t = TEMPLATES.get(c.id);
  if (!t) {
    t = new THREE.Group();
    t.name = c.id;
    MODELS[c.slot](c, t);
    TEMPLATES.set(c.id, t);
  }
  return t.clone();
}

/** A character facing +z, about 1.9 tall, without held items. `set` swaps the body color and outfit. */
export class Character {
  readonly group = new THREE.Group();
  private body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }));
  /** Skin and face come from the face texture, so the material stays white. */
  private head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }));
  private outfit = new THREE.Group();
  /** Legendary sparkles that turn in `tick`. */
  private spinners: THREE.Object3D[] = [];
  private key = '';

  constructor(look: Look) {
    this.body.position.y = 0.85;
    this.head.position.y = 1.62;
    this.body.castShadow = this.head.castShadow = true;
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
    // Pieces are clones of shared templates, so there is nothing to dispose.
    this.outfit.clear();
    this.spinners = [];
    for (const slot of ['hat', 'shirt', 'jewelry'] as const) {
      const c = cosById(look[slot]);
      if (!c) continue;
      const piece = outfitPiece(c);
      piece.traverse((o) => {
        if (o.userData.spin) this.spinners.push(o);
      });
      this.outfit.add(piece);
    }
  }

  /** Frees the body and head geometry; materials and outfit pieces are left for reuse (see `disposeTree`). */
  dispose(): void {
    this.body.geometry.dispose();
    this.head.geometry.dispose();
  }

  /** Animates legendary pieces (time in seconds): stars circle and glows breathe. */
  tick(t: number): void {
    pulse(t);
    for (const o of this.spinners) {
      o.rotation.y = t * (o.userData.spin as number);
      o.position.y = Math.sin(t * 1.7) * 0.03;
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
/** The box the preview keeps in view: hem to the tallest hat, and wide enough for a spinning cloak. */
const FRAME = { y: 1.2, h: 2.2, w: 1.4 };

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
    this.fit();
    // The menu's CSS sets the canvas size; follow it so the render stays sharp and unstretched.
    new ResizeObserver(() => this.raf && this.fit()).observe(this.canvas);
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

  /** Matches the render to the canvas's on-screen size and moves the camera so a dressed character fills it. */
  private fit(): void {
    const w = this.canvas.clientWidth || 240;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const dist = Math.max(FRAME.h / (2 * tan), FRAME.w / (2 * tan * this.cam.aspect));
    this.cam.position.set(0, FRAME.y + dist * 0.05, dist);
    this.cam.lookAt(0, FRAME.y, 0);
    this.cam.updateProjectionMatrix();
  }

  set(look: Look): void {
    this.char.set(look);
  }

  start(): void {
    if (this.raf) return;
    this.fit();
    let last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.drag && t >= this.idleAt) this.spin += ((t - last) / 1000) * SPIN_SPEED;
      last = t;
      this.char.group.rotation.y = this.spin;
      this.char.tick(t / 1000);
      this.renderer.render(this.scene, this.cam);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stops spinning and shrinks the drawing buffer, so a hidden preview holds almost no GPU memory. */
  stop(): void {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.renderer.setSize(1, 1, false);
  }
}
