import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COS_SLOTS, cosById, type Cosmetic, type CosSlot, type Look } from '../data/cosmetics';
import { faceTexture } from './faces';

// ---------- materials ----------

/**
 * How a surface reads. Lower tiers are matte cloth; better items add satin, polished metal and
 * gems; legendary items get `glow` trims that slowly breathe (see `pulse`). `wet` is a sea creature's glossy shell.
 */
type Finish = 'cloth' | 'satin' | 'metal' | 'gem' | 'glow' | 'wet';

const FINISH: Record<Finish, { rough: number; metal: number; glow: number }> = {
  cloth: { rough: 0.9, metal: 0, glow: 0 },
  satin: { rough: 0.5, metal: 0.05, glow: 0 },
  metal: { rough: 0.32, metal: 0.55, glow: 0.18 },
  gem: { rough: 0.15, metal: 0.1, glow: 0.45 },
  glow: { rough: 0.3, metal: 0, glow: 1 },
  wet: { rough: 0.18, metal: 0.12, glow: 0 },
};

/** Outfit materials are shared by every character wearing the item, so they are made once. */
const MATS = new Map<string, THREE.MeshStandardMaterial>();
/** Glowing materials, with their resting intensity, that `pulse` makes breathe. */
const PULSE = new Map<THREE.MeshStandardMaterial, number>();

/** `painted` meshes take their colours from the geometry (see `paint`), so parts in several colours can share one draw call. */
function mat(color: number, finish: Finish = 'cloth', side: THREE.Side = THREE.FrontSide, painted = false): THREE.MeshStandardMaterial {
  const key = `${color}:${finish}:${side}${painted ? ':painted' : ''}`;
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
      vertexColors: painted,
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

type Part = [THREE.BufferGeometry, At];

/** Bakes the parts into one geometry; a mix of indexed and non-indexed parts (octahedra) is de-indexed first. */
function merged(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(([geo, at]) => place(geo, at));
  const mixed = geos.some((x) => x.index) && geos.some((x) => !x.index);
  return mergeGeometries(mixed ? geos.map((x) => (x.index ? x.toNonIndexed() : x)) : geos)!;
}

/** Many small parts in one material become one mesh (one draw call). */
function addMany(g: THREE.Group, m: THREE.Material, parts: Part[]): THREE.Mesh {
  return add(g, merged(parts), m);
}

const H = Math.PI / 2;

/** A horizontal ring around the body at height y. */
const hoop = (r: number, tube: number, y: number, seg = 18): [THREE.BufferGeometry, At] => [new THREE.TorusGeometry(r, tube, 5, seg), { p: [0, y, 0], r: [H, 0, 0] }];

/** Legendary items get a few twinkling stars circling the wearer; `Character.tick` spins them. */
function sparkles(g: THREE.Group, color: number, y: number, radius: number, n = 5, speed = 0.9): THREE.Mesh {
  const parts: [THREE.BufferGeometry, At][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const size = i % 2 ? 0.022 : 0.032;
    parts.push([new THREE.OctahedronGeometry(size), { p: [Math.sin(a) * radius, y + Math.sin(a * 3) * 0.12, Math.cos(a) * radius], s: [0.7, 1.4, 0.7] }]);
  }
  const o = addMany(g, mat(color, 'glow'), parts);
  o.castShadow = false;
  o.userData.spin = speed;
  return o;
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
    case 'souwester': {
      // Oilskin Sou'wester: waxed yellow, a low round crown, a short front brim, a long back brim and a chin cord.
      add(g, new THREE.SphereGeometry(0.215, 12, 6, 0, Math.PI * 2, 0, H), m(1, 'satin'), { p: [0, 1.66, 0] });
      add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.02, 14, 1, false, -H, Math.PI), m(1, 'satin'), { p: [0, 1.665, 0], s: [1, 1, 0.95], r: [0.15, 0, 0] });
      add(g, new THREE.CylinderGeometry(0.27, 0.27, 0.02, 14, 1, false, H, Math.PI), m(1, 'satin'), { p: [0, 1.665, 0], s: [1.04, 1, 1.4], r: [-0.4, 0, 0] });
      add(g, new THREE.TorusGeometry(0.212, 0.012, 4, 16), m(0.8, 'satin'), { p: [0, 1.672, 0], r: [H, 0, 0] });
      const cord = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, 1.66, 0.02), new THREE.Vector3(-0.17, 1.5, 0.13), new THREE.Vector3(0, 1.43, 0.19), new THREE.Vector3(0.17, 1.5, 0.13), new THREE.Vector3(0.2, 1.66, 0.02)]);
      add(g, new THREE.TubeGeometry(cord, 14, 0.007, 4), a());
      break;
    }
    case 'bicorne': {
      // Admiral's Bicorne: a navy crescent worn side to side, gold braid, a rosette with a glowing star and a white plume.
      const hat = new THREE.Shape();
      hat.moveTo(-0.44, 1.9);
      hat.quadraticCurveTo(0, 2.12, 0.44, 1.9);
      hat.quadraticCurveTo(0, 1.58, -0.44, 1.9);
      add(g, new THREE.ExtrudeGeometry(hat, { depth: 0.34, bevelEnabled: false }), m(1, 'satin'), { p: [0, 0, -0.17] });
      const top = (z: number) => new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.44, 1.9, z), new THREE.Vector3(0, 2.12, z), new THREE.Vector3(0.44, 1.9, z));
      addMany(g, a('metal'), [
        [new THREE.TubeGeometry(top(0.172), 14, 0.012, 4), {}],
        [new THREE.TubeGeometry(top(-0.172), 14, 0.012, 4), {}],
        [new THREE.SphereGeometry(0.03, 6, 4), { p: [-0.44, 1.9, 0] }],
        [new THREE.SphereGeometry(0.03, 6, 4), { p: [0.44, 1.9, 0] }],
      ]);
      // A white plume lies along the crest.
      const crest = top(0);
      addMany(g, mat(WHITE, 'satin'), [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const t = 0.12 + i * 0.13;
        const at = crest.getPoint(t);
        return [new THREE.SphereGeometry(1, 6, 5), { p: [at.x, at.y + 0.03, 0], s: [0.075, 0.04, 0.09 - Math.abs(t - 0.5) * 0.1], r: [0, 0, (0.5 - t) * 0.9] }];
      }));
      // Gold rosette on the front, with a little glowing star.
      add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), a('metal'), { p: [0.27, 1.9, 0.175], r: [H, 0, 0] });
      add(g, new THREE.TorusGeometry(0.05, 0.01, 4, 12), a('metal'), { p: [0.27, 1.9, 0.18] });
      add(g, new THREE.OctahedronGeometry(0.03), a('glow'), { p: [0.27, 1.9, 0.195], s: [1, 1, 0.5] });
      sparkles(g, 0xfff1a8, 2.0, 0.5);
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
    case 'krakencrown':
      krakenCrown(c, g);
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
    case 'slicker': {
      // Storm Slicker: waxed yellow rain jacket with a rolled hood, three wooden toggles and a reflective band.
      torso(g, m(1, 'satin'));
      add(g, new THREE.TorusGeometry(0.2, 0.05, 5, 14), m(0.85, 'satin'), { p: [0, 1.42, -0.03], r: [H - 0.3, 0, 0] });
      add(g, new THREE.SphereGeometry(0.12, 7, 5), m(0.85, 'satin'), { p: [0, 1.38, -0.22], s: [1.3, 0.8, 0.7] });
      addMany(g, mat(0x7a4a24), [0.66, 0.81, 0.96].map((y) => [new THREE.CapsuleGeometry(0.014, 0.05, 2, 5), { p: [0, y, front(y) + 0.005], r: [0, 0, H] }]));
      addMany(g, a('satin'), [hoop(rAt(1.15) + 0.006, 0.03, 1.15)]);
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
    case 'krakenarmor':
      krakenArmor(c, g);
      break;
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
    case 'compass': {
      // Brass Compass: a round case with a pale glass face and a red needle that swings back and forth.
      chain(g, mat(c.color, 'metal'), 0.011);
      add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 14), mat(c.color, 'metal'), { p: [hx, hy - 0.02, hz], r: [H, 0, 0] });
      add(g, new THREE.TorusGeometry(0.08, 0.011, 4, 14), mat(shade(c.color, 1.2), 'metal'), { p: [hx, hy - 0.02, hz + 0.015] });
      add(g, new THREE.CylinderGeometry(0.065, 0.065, 0.01, 14), mat(0xdff3f2, 'gem'), { p: [hx, hy - 0.02, hz + 0.018], r: [H, 0, 0] });
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.04, 5), mat(c.color, 'metal'), { p: [hx, hy + 0.07, hz] });
      const needle = add(g, new THREE.OctahedronGeometry(0.05), mat(c.accent, 'glow'), { s: [0.2, 1, 0.1] });
      needle.position.set(hx, hy - 0.02, hz + 0.028);
      needle.castShadow = false;
      needle.userData.sway = 0.5;
      break;
    }
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
    case 'krakenbeak':
      krakenBeak(c, g);
      break;
  }
}

// ---------- sea legend pieces (the Kraken's set and pet) ----------

const KRAKEN = 0xa3203f;
const KRAKEN_DARK = 0x6e1430;
const SUCKER = 0xf4b8c4;
/** The soft halo round the Kraken's ruby eye, and its sparkles. */
const RUBY_HALO = 0xff4a6a;
const KRAKEN_SPARK = 0xff7a95;

/** Gives every vertex one colour, for parts merged under a `painted` material. */
function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(rgb, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return geo;
}

/**
 * A tentacle along a curve through `pts` (shifted by `off`), tapering from r0 to r1: a faceted tube with round ends,
 * and suckers on the `dir` side of every other ring. Pushed as painted parts so a whole tentacle is one mesh.
 */
function limb(out: Part[], pts: V3[], r0: number, r1: number, color: number, n = 12, radial = 6, suckers?: { color: number; dir: V3 }, off: V3 = [0, 0, 0]): void {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x + off[0], y + off[1], z + off[2])));
  // A unit tube, then each ring pulled in to its radius (TubeGeometry lays out n + 1 rings of radial + 1 vertices).
  const tube = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const pos = tube.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, c);
    const r = r0 + (r1 - r0) * (i / n);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  out.push([paint(tube, color), {}]);
  out.push([paint(new THREE.SphereGeometry(r0, radial, 4), color), { p: curve.getPointAt(0).toArray() as V3 }]);
  out.push([paint(new THREE.SphereGeometry(r1, radial, 4), color), { p: curve.getPointAt(1).toArray() as V3 }]);
  if (!suckers) return;
  const dir = new THREE.Vector3(...suckers.dir).normalize();
  for (let i = 2; i < n; i += 2) {
    const r = r0 + (r1 - r0) * (i / n);
    out.push([paint(new THREE.SphereGeometry(r * 0.42, 5, 3), suckers.color), { p: curve.getPointAt(i / n).addScaledVector(dir, r * 0.85).toArray() as V3 }]);
  }
}

/** How a part swings in `Character.tick`: about its own `axis`, `amp` radians either way. */
interface Sway {
  axis: 'x' | 'y' | 'z';
  amp: number;
  speed: number;
  phase: number;
}

/** A group at `p` that sways in `Character.tick`, holding one painted mesh made of `parts` (given relative to `p`). */
function swaying(g: THREE.Object3D, p: V3, sway: Sway, parts: Part[], finish: Finish = 'satin'): THREE.Group {
  const o = new THREE.Group();
  o.position.set(...p);
  o.userData.sway = sway;
  add(o, merged(parts), mat(0xffffff, finish, THREE.FrontSide, true));
  g.add(o);
  return o;
}

/** A soft additive glow around a gem; one shared texture, and one material per colour. */
let haloTex: THREE.CanvasTexture | null = null;
const HALOS = new Map<number, THREE.SpriteMaterial>();
function halo(g: THREE.Group, p: V3, color: number, size: number): void {
  let m = HALOS.get(color);
  if (!m) {
    haloTex ??= canvasTex((x, s) => {
      const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, s, s);
    });
    m = new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 });
    HALOS.set(color, m);
  }
  const sp = new THREE.Sprite(m);
  sp.position.set(...p);
  sp.scale.setScalar(size);
  g.add(sp);
}

/**
 * Geometry every wearer shares, moved on the CPU once a frame (whoever ticks first): water dripping and ripples
 * spreading. One mesh each, however many drops, and no custom shaders.
 */
const SHARED_ANIM: ((t: number) => void)[] = [];
let animatedAt = -1;
/** Adds a shared animation and runs it once, so the template's resting shape (and its bounds) are real. */
function animated(f: (t: number) => void): void {
  SHARED_ANIM.push(f);
  f(0);
}
function animateShared(t: number): void {
  if (t === animatedAt) return;
  animatedAt = t;
  for (const f of SHARED_ANIM) f(t);
}

/** Sea water: drops, and the sheets that spiral round the Kraken Armor. */
const WATER = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1, emissive: 0x1a5a70, emissiveIntensity: 0.4, flatShading: true });
const WATER_SHEET = new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x2a9ab8, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, flatShading: true });
const PUDDLE = new THREE.MeshStandardMaterial({ color: 0x6fc4e0, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, depthWrite: false, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2 });
/** Ripples brighten the puddle and fade by colour, so all three rings share one additive mesh. */
const RIPPLES = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** Where water drips from: a point (in the piece's frame, or a swaying part's frame at `pivot`), how far it falls and how many drops. */
interface DripFrom {
  at: V3;
  len: number;
  n: number;
  pivot?: V3;
  sway?: Sway;
}

/**
 * Drops that fall from each source and stretch as they go. A drop leaves a swaying tentacle from where its tip was when
 * the drop let go, so all of them can live in one unmoving mesh. Drops stop short of the ground (local y 0).
 */
function drips(g: THREE.Group, from: DripFrom[]): void {
  const unit = new THREE.SphereGeometry(0.012, 6, 4);
  const shape = unit.attributes.position.array as Float32Array;
  const per = unit.attributes.position.count;
  const drops = from.flatMap((f) => {
    const top = (f.pivot?.[1] ?? 0) + f.at[1];
    return Array.from({ length: f.n }, (_, i) => ({ ...f, len: Math.min(f.len, top - 0.02), speed: 0.9 + i * 0.25, off: i / f.n }));
  });
  const geo = mergeGeometries(drops.map(() => unit.clone()))!;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const o = new THREE.Vector3();
  animated((t) => {
    drops.forEach((d, j) => {
      const k = (d.off + t * d.speed) % 1;
      o.set(...d.at);
      if (d.pivot && d.sway) {
        const letGo = t - k / d.speed;
        o.applyAxisAngle(AXES[d.sway.axis], Math.sin(letGo * d.sway.speed + d.sway.phase) * d.sway.amp).add(new THREE.Vector3(...d.pivot));
      }
      o.y -= k * k * d.len;
      const w = 1 - k * 0.5;
      for (let i = 0; i < per; i++) pos.setXYZ(j * per + i, o.x + shape[i * 3] * w, o.y + shape[i * 3 + 1] * w * 1.6, o.z + shape[i * 3 + 2] * w);
    });
    pos.needsUpdate = true;
  });
  const m = add(g, geo, WATER);
  m.castShadow = false;
}

/** A wet patch on the ground with three rings spreading out; `Character.tick` keeps it on the ground through a jump. */
function puddle(g: THREE.Group): void {
  const pg = new THREE.Group();
  pg.userData.ground = true;
  g.add(pg);
  add(pg, new THREE.CircleGeometry(0.55, 24), PUDDLE, { p: [0, 0.006, 0], r: [-H, 0, 0] }).castShadow = false;
  const ring = place(new THREE.TorusGeometry(0.5, 0.008, 3, 32), { p: [0, 0.01, 0], r: [H, 0, 0] });
  const shape = ring.attributes.position.array as Float32Array;
  const per = ring.attributes.position.count;
  const geo = mergeGeometries([ring, ring.clone(), ring.clone()])!;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(per * 9), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.6);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const tint = new THREE.Color(0xdff8ff);
  animated((t) => {
    for (let j = 0; j < 3; j++) {
      const k = (j / 3 + t * 0.35) % 1;
      const s = 0.15 + k;
      const fade = (1 - k) * 0.16;
      for (let i = 0; i < per; i++) {
        pos.setXYZ(j * per + i, shape[i * 3] * s, shape[i * 3 + 1], shape[i * 3 + 2] * s);
        col.setXYZ(j * per + i, tint.r * fade, tint.g * fade, tint.b * fade);
      }
    }
    pos.needsUpdate = col.needsUpdate = true;
  });
  add(pg, geo, RIPPLES).castShadow = false;
}

/** An upright band along a curve through `pts`, `width(t)` tall: the water streams. */
function ribbon(pts: V3[], width: (t: number) => number, n: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
    const w = width(i / n) / 2;
    pos.push(p.x, p.y + w, p.z, p.x, p.y - w, p.z);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Kraken Crown: six tentacles rise from a gold band set with the ruby eye. */
function krakenCrown(c: Cosmetic, g: THREE.Group): void {
  add(g, new THREE.SphereGeometry(0.19, 10, 5, 0, Math.PI * 2, 0, H), mat(KRAKEN_DARK, 'satin'), { p: [0, 1.78, 0] });
  addMany(g, mat(GOLD, 'metal'), [[new THREE.CylinderGeometry(0.228, 0.21, 0.11, 16), { p: [0, 1.79, 0] }], hoop(0.23, 0.014, 1.735)]);
  // Opposite tentacles share a mesh that twists about the crown's middle, so the six sway in three draw calls.
  for (let k = 0; k < 3; k++) {
    const parts: Part[] = [];
    for (const i of [k, k + 3]) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const pts: V3[] = [[0, 0, 0], [sx * 0.03, 0.14, sz * 0.03], [sx * 0.08, 0.26, sz * 0.08], [sx * 0.17, 0.3, sz * 0.17], [sx * 0.2, 0.23, sz * 0.2], [sx * 0.16, 0.18, sz * 0.16]];
      limb(parts, pts, 0.042, 0.009, c.color, 14, 6, { color: SUCKER, dir: [-sx, 0.3, -sz] }, [sx * 0.2, 0, sz * 0.2]);
    }
    swaying(g, [0, 1.83, 0], { axis: 'y', amp: 0.08, speed: 1.2, phase: k * 2.1 }, parts);
  }
  add(g, new THREE.SphereGeometry(0.045, 10, 8), mat(c.accent, 'glow'), { p: [0, 1.79, 0.228], s: [1.3, 1, 0.6] });
  add(g, new THREE.SphereGeometry(0.02, 6, 4), mat(INK, 'gem'), { p: [0, 1.79, 0.256], s: [0.5, 1.4, 0.4] });
  halo(g, [0, 1.79, 0.27], RUBY_HALO, 0.26);
  sparkles(g, KRAKEN_SPARK, 2.02, 0.46, 5, 0.9);
}

/**
 * Kraken Armor, a wet carapace: a glossy shell whose front plate narrows to the collar, a pale ridged belly, ridged
 * bands with a spine of bone spikes round the back, barnacled pauldrons and two squid fins flaring behind the
 * shoulders. Tentacles curl off the shoulders and trail behind like a cape; water spirals round the body, foams at
 * the hem, drips off the tentacle tips and spreads in rings at the feet.
 */
function krakenArmor(c: Cosmetic, g: THREE.Group): void {
  const SHELL = 0xb02a48;
  const UNDER = 0x5e1228;
  const painted = (f: Finish) => mat(0xffffff, f, THREE.FrontSide, true);
  const plate = SHIRT.slice(0, 5).map(([r, y]) => new THREE.Vector2(r + 0.025, y));
  const shell: Part[] = [
    [paint(new THREE.LatheGeometry(SHIRT.map(([r, y]) => new THREE.Vector2(r, y)), 14), UNDER), {}],
    [paint(new THREE.LatheGeometry(plate, 10, -0.95, 1.9), SHELL), {}],
    ...[0.66, 0.84, 1.02].map((y): Part => [paint(new THREE.TorusGeometry(rAt(y) + 0.012, 0.022, 4, 16, Math.PI * 1.15), SHELL), { p: [0, y, 0], r: [H, 0, H + 0.52] }]),
    ...[-1, 1].map((s): Part => [paint(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, H), SHELL), { p: [s * 0.27, 1.34, 0], s: [1.1, 0.85, 1.15], r: [0, 0, -s * 0.45] }]),
  ];
  addMany(g, painted('wet'), shell);
  const bone: Part[] = [
    [paint(new THREE.LatheGeometry([[0.345, 0.6], [0.345, 1.05], [0.33, 1.2]].map(([r, y]) => new THREE.Vector2(r, y)), 6, -0.32, 0.64), 0xf2b8c2), {}],
    ...[0.7, 0.82, 0.94, 1.06].map((y): Part => [paint(new THREE.TorusGeometry(0.346, 0.008, 3, 10, 0.64), 0xd88a9a), { p: [0, y, 0], r: [H, 0, H - 0.32] }]),
  ];
  // A spine of short spikes on each back band.
  for (const y of [0.66, 0.84, 1.02])
    for (let i = -2; i <= 2; i++) {
      const a = Math.PI + i * 0.35;
      const r = rAt(y) + 0.03;
      bone.push([paint(new THREE.ConeGeometry(0.018, 0.06, 4), 0xe8d8c0), { p: [Math.sin(a) * r, y + 0.01, Math.cos(a) * r], r: [Math.cos(a) * -1.2, 0, Math.sin(a) * 1.2] }]);
    }
  // Barnacles on the pauldrons.
  for (const s of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + s;
      const r = 0.06 + (i % 3) * 0.025;
      const p: V3 = [s * 0.27 + Math.cos(a) * r, 1.43 - (i % 3) * 0.02, Math.sin(a) * r];
      bone.push([paint(new THREE.CylinderGeometry(0.014, 0.022, 0.03, 6), 0xe8e0d0), { p }]);
      bone.push([paint(new THREE.CircleGeometry(0.012, 6), 0x2a2a30), { p: [p[0], p[1] + 0.016, p[2]], r: [-H, 0, 0] }]);
    }
  addMany(g, painted('satin'), bone);
  addMany(g, mat(GOLD, 'metal'), [hoop(0.2, 0.03, 1.43), [new THREE.TorusGeometry(0.06, 0.012, 4, 12), { p: [0, 1.22, front(1.22) + 0.02] }]]);
  add(g, new THREE.OctahedronGeometry(0.06), mat(c.accent, 'glow'), { p: [0, 1.22, front(1.22) + 0.03], s: [1, 1.3, 0.55] });
  halo(g, [0, 1.22, front(1.22) + 0.07], RUBY_HALO, 0.3);
  // Squid fins flaring up behind the shoulders, rimmed dark, swaying gently outward and back.
  for (const s of [-1, 1]) {
    const fin = new THREE.Shape();
    fin.moveTo(0, -0.2);
    fin.lineTo(s * 0.2, 0.62);
    fin.quadraticCurveTo(s * 0.5, 0.3, s * 0.56, -0.08);
    fin.lineTo(0, -0.2);
    const rim = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 0.2, 0.62, 0.02), new THREE.Vector3(s * 0.5, 0.3, 0.02), new THREE.Vector3(s * 0.56, -0.08, 0.02));
    swaying(g, [s * 0.14, 1.3, -0.26], { axis: 'z', amp: s * 0.08, speed: 1.2, phase: 0 }, [
      [paint(new THREE.ExtrudeGeometry(fin, { depth: 0.018, bevelEnabled: false }), SHELL), { r: [0, s * 0.35, 0] }],
      [paint(new THREE.TubeGeometry(rim, 10, 0.01, 4), UNDER), { r: [0, s * 0.35, 0] }],
    ], 'wet');
  }
  // Two tentacles curl off each shoulder, one forward and one back; they swing about the same axis, so they share a mesh.
  const wet: DripFrom[] = [];
  for (const s of [-1, 1]) {
    const parts: Part[] = [];
    const pivot: V3 = [s * 0.33, 1.44, 0];
    const sway: Sway = { axis: 'z', amp: 0.12, speed: 1.3, phase: s };
    for (const [k, dz] of [[0, 0.06], [1, -0.07]]) {
      const h = k ? 0.85 : 1;
      const pts: V3[] = [[0, 0, 0], [s * 0.06, 0.18 * h, 0], [s * 0.17, 0.32 * h, dz * 0.5], [s * 0.28, 0.32 * h, dz], [s * 0.31, 0.22 * h, dz], [s * 0.26, 0.16 * h, dz]];
      limb(parts, pts, 0.045, 0.01, KRAKEN, 16, 6, { color: SUCKER, dir: [-s, 0.4, 0] }, [0, 0, dz]);
      wet.push({ at: [s * 0.26, 0.16 * h, dz * 2], len: 0.5, n: 2, pivot, sway });
    }
    swaying(g, pivot, sway, parts);
  }
  [-0.13, 0, 0.13].forEach((x, i) => {
    const parts: Part[] = [];
    const pivot: V3 = [x, 1.25, -0.27];
    const sway: Sway = { axis: 'y', amp: 0.15, speed: 0.9, phase: i * 1.3 };
    const pts: V3[] = [[0, 0, 0], [x * 0.5, -0.4, -0.13], [x * 1.5, -0.8, -0.2], [x * 2.4, -1.0, -0.38], [x * 2.8, -0.95, -0.55], [x * 2.6, -0.85, -0.58]];
    limb(parts, pts, 0.055, 0.012, KRAKEN, 18, 6, { color: SUCKER, dir: [0, -0.3, 1] });
    swaying(g, pivot, sway, parts);
    wet.push({ at: pts[pts.length - 1], len: 0.5, n: 2, pivot, sway });
  });
  for (const x of [-0.2, 0.05, 0.22]) wet.push({ at: [x, 0.5, 0.3], len: 0.28, n: 1 });
  drips(g, wet);
  // Two streams of water spiral up round the body, and foam rides the hem; both turn slowly.
  const streams = [0, 1].map((k): Part => {
    const pts: V3[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const a = k * Math.PI + t * Math.PI * 4;
      const r = 0.46 - t * 0.06;
      pts.push([Math.sin(a) * r, 0.32 + t * 1.12, Math.cos(a) * r]);
    }
    return [ribbon(pts, (t) => 0.08 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)), 80), {}];
  });
  const water = add(g, merged(streams), WATER_SHEET);
  water.castShadow = false;
  water.userData.spin = 1.5;
  const foam = addMany(g, mat(0xf4fbff, 'satin'), Array.from({ length: 22 }, (_, i): Part => {
    const a = (i / 22) * Math.PI * 2;
    const r = 0.315 + (i % 3) * 0.015;
    return [new THREE.SphereGeometry(0.02 + (i % 3) * 0.007, 6, 4), { p: [Math.sin(a) * r, 0.54 + (i % 2) * 0.02, Math.cos(a) * r] }];
  }));
  foam.castShadow = false;
  foam.userData.spin = -0.6;
  puddle(g);
  sparkles(g, KRAKEN_SPARK, 1.0, 0.6, 6, 0.7);
}

/** Kraken Beak: the beak on a cord of suckers, set with the glowing ruby eye. */
function krakenBeak(c: Cosmetic, g: THREE.Group): void {
  const top = beadAt(0, 14);
  addMany(g, mat(0x3a0f20, 'satin'), [
    [new THREE.TorusGeometry(NECK.r, 0.01, 4, 22), { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] }],
    // A short drop from the cord to the setting.
    [new THREE.CylinderGeometry(0.008, 0.008, top[1] - 1.17, 4), { p: [0, (top[1] + 1.17) / 2, (top[2] + 0.35) / 2], r: [0.35, 0, 0] }],
  ]);
  addMany(g, mat(SUCKER, 'satin'), Array.from({ length: 7 }, (_, i): Part => [new THREE.SphereGeometry(0.02, 6, 4), { p: beadAt(i * 2 + 1, 14, 0.008) }]));
  addMany(g, mat(c.color, 'gem'), [
    [new THREE.ConeGeometry(0.05, 0.13, 6), { p: [-0.025, 1.1, 0.36], r: [0, 0, 0.55] }],
    [new THREE.ConeGeometry(0.045, 0.11, 6), { p: [0.025, 1.1, 0.36], r: [0, 0, -0.55] }],
  ]);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), mat(GOLD, 'metal'), { p: [0, 1.17, 0.355], r: [H, 0, 0] });
  add(g, new THREE.SphereGeometry(0.028, 10, 8), mat(c.accent, 'glow'), { p: [0, 1.17, 0.375] });
  halo(g, [0, 1.17, 0.4], RUBY_HALO, 0.2);
  sparkles(g, KRAKEN_SPARK, 1.2, 0.48, 5, 1.2);
}

// ---------- pets ----------

/**
 * Where a pet floats, in body coordinates: beside the head on the +x side and a little behind. In the world it eases
 * after this spot (see `Character.follow`), never closer to the body's axis than `PET_CLEAR`, so it can't touch the
 * outfit.
 */
const PET_SPOT: V3 = [0.8, 1.85, -0.5];
/** How fast a pet eases toward its spot (per second). */
const PET_RATE = 5;
const PET_CLEAR = 0.9;
/**
 * In the Wardrobe preview the pet floats still, closer in and in front of the +x shoulder, so wearing one changes the
 * preview's scale by under 10%. Behind the shoulder there's no room between the armor's fins, the crown's tentacles
 * and the frame's edge; here it clears every hat and shirt (the straw hat's brim by the least, ~3 cm). Templates are
 * built here, so the preview's framing (`boundsOf`) measures this spot; live characters move the pet to `PET_SPOT` on
 * their first tick.
 */
const PREVIEW_PET_SPOT: V3 = [0.44, 1.8, 0.47];

function petModel(c: Cosmetic, g: THREE.Group): void {
  const float = new THREE.Group();
  float.position.set(...PREVIEW_PET_SPOT);
  float.userData.follow = true;
  g.add(float);
  switch (c.id) {
    case 'krakenpet': {
      // Kraken Hatchling: a round pink baby with big eyes, bobbing as it floats; its six little tentacles hang and sway.
      const pet = new THREE.Group();
      pet.scale.setScalar(1.35);
      pet.userData.bob = { base: 0, amp: 0.05, smooth: true };
      float.add(pet);
      const skin = mat(0xffffff, 'satin', THREE.FrontSide, true);
      addMany(pet, skin, [
        [paint(new THREE.SphereGeometry(0.1, 12, 9), c.color), { p: [0, 0.13, 0], s: [1, 1.2, 1] }],
        ...([[0.05, 0.22, 0.05], [-0.04, 0.2, -0.06], [0.07, 0.15, -0.06]] as V3[]).map((p): Part => [paint(new THREE.SphereGeometry(0.016, 5, 3), c.accent), { p, s: [1, 0.6, 1] }]),
        ...[-1, 1].map((s): Part => [paint(new THREE.SphereGeometry(0.036, 10, 8), WHITE), { p: [s * 0.045, 0.1, 0.075] }]),
      ]);
      addMany(pet, mat(INK, 'gem'), [-1, 1].map((s): Part => [new THREE.SphereGeometry(0.021, 8, 6), { p: [s * 0.047, 0.1, 0.104] }]));
      addMany(pet, mat(WHITE, 'glow'), [-1, 1].map((s): Part => [new THREE.SphereGeometry(0.007, 5, 3), { p: [s * 0.04, 0.11, 0.122] }]));
      // Alternate tentacles share a mesh, swinging about the body's middle.
      for (let k = 0; k < 2; k++) {
        const parts: Part[] = [];
        for (let i = k; i < 6; i += 2) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const sx = Math.sin(a);
          const sz = Math.cos(a);
          limb(parts, [[0, 0, 0], [sx * 0.06, -0.06, sz * 0.06], [sx * 0.1, -0.13, sz * 0.09], [sx * 0.08, -0.17, sz * 0.13]], 0.022, 0.006, c.color, 8, 5, undefined, [sx * 0.06, 0, sz * 0.06]);
        }
        swaying(pet, [0, 0.05, 0], { axis: 'x', amp: 0.15, speed: 2, phase: k * Math.PI }, parts);
      }
      // Its stars may clip at the preview's edge rather than shrink the character to fit them.
      sparkles(pet, KRAKEN_SPARK, 0.2, 0.19, 3, 1.4).userData.unframed = true;
      break;
    }
  }
}

const MODELS: Record<CosSlot, (c: Cosmetic, g: THREE.Group) => void> = { hat: hatModel, shirt: shirtModel, jewelry: jewelryModel, pet: petModel };

/** The room an outfit takes at rest: how far it reaches out from the body's axis, its top and its lowest point. */
interface Bounds {
  reach: number;
  /** The highest and lowest points, each pushed out by how much bigger it looks turned toward the preview's camera. */
  top: number;
  low: number;
}
const NO_BOUNDS: Bounds = { reach: 0, top: 0, low: 2 };

/** The Wardrobe preview's vertical field of view (degrees). */
const PREVIEW_FOV = 32;
/** Spare room round the outfit in the preview, for swaying tentacles. */
const FRAME_SWAY = 0.06;
/** The preview's camera sits this far above FRAME.y per unit of distance, looking slightly down. */
const FRAME_RISE = 0.05;
/** Slopes from the preview's camera to the top and bottom edges of its view. */
const FRAME_UP = Math.tan(THREE.MathUtils.degToRad(PREVIEW_FOV / 2) - Math.atan(FRAME_RISE));
const FRAME_DOWN = Math.tan(THREE.MathUtils.degToRad(PREVIEW_FOV / 2) + Math.atan(FRAME_RISE));

/** A piece's `Bounds`, so the preview can keep it in view at any turn. */
function boundsOf(t: THREE.Group): Bounds {
  t.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const b = { ...NO_BOUNDS };
  // Ground effects (a puddle) are hidden in the preview, and a pet's stars may clip, so they don't count.
  const walk = (o: THREE.Object3D): void => {
    if (o.userData.ground || o.userData.unframed) return;
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const r = Math.hypot(v.x, v.z);
        b.reach = Math.max(b.reach, r);
        b.top = Math.max(b.top, v.y + (r + FRAME_SWAY) * FRAME_UP);
        b.low = Math.min(b.low, v.y - (r + FRAME_SWAY) * FRAME_DOWN);
      }
    }
    o.children.forEach(walk);
  };
  walk(t);
  return b;
}

/** One built model per item; every wearer gets a clone sharing its geometry and materials. */
const TEMPLATES = new Map<string, THREE.Group>();
function outfitPiece(c: Cosmetic): THREE.Group {
  let t = TEMPLATES.get(c.id);
  if (!t) {
    t = new THREE.Group();
    t.name = c.id;
    MODELS[c.slot](c, t);
    t.userData.bounds = boundsOf(t);
    TEMPLATES.set(c.id, t);
  }
  return t.clone();
}

const PET_GOAL = new THREE.Vector3();

/** A character facing +z, about 1.9 tall, without held items. `set` swaps the body color and outfit. */
export class Character {
  readonly group = new THREE.Group();
  private body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }));
  /** Skin and face come from the face texture, so the material stays white. */
  private head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }));
  private outfit = new THREE.Group();
  /** Legendary sparkles that turn in `tick`. */
  private spinners: THREE.Object3D[] = [];
  /** Things that swing back and forth in `tick`, like a compass needle or a tentacle. */
  private swayers: THREE.Object3D[] = [];
  /** Pets that bob as they float in `tick`. */
  private bobbers: THREE.Object3D[] = [];
  /** Ground effects (a puddle) that `tick` keeps on the ground while the character jumps. */
  private grounded: THREE.Object3D[] = [];
  /** The worn pet's float, and where it is in the world and which way it faces while it trails the character. */
  private pet: { o: THREE.Object3D; at: THREE.Vector3; yaw: number; placed: boolean } | null = null;
  private lastT = -1;
  private key = '';
  /** The room the outfit takes (see `boundsOf`). */
  bounds: Bounds = NO_BOUNDS;

  /**
   * `live` characters stand in the world: the pet trails them and ground effects show. The Wardrobe preview's isn't
   * live: its pet floats at its spot and ground effects hide.
   */
  constructor(
    look: Look,
    private live = true,
  ) {
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
    this.swayers = [];
    this.bobbers = [];
    this.grounded = [];
    this.pet = null;
    const b = { ...NO_BOUNDS };
    for (const slot of COS_SLOTS) {
      const c = cosById(look[slot]);
      if (!c) continue;
      const piece = outfitPiece(c);
      piece.traverse((o) => {
        if (o.userData.spin) this.spinners.push(o);
        if (o.userData.sway) this.swayers.push(o);
        if (o.userData.bob) this.bobbers.push(o);
        if (o.userData.ground) {
          if (this.live) this.grounded.push(o);
          else o.visible = false;
        }
        if (o.userData.follow) this.pet = { o, at: new THREE.Vector3(), yaw: 0, placed: false };
      });
      const pb = piece.userData.bounds as Bounds;
      b.reach = Math.max(b.reach, pb.reach);
      b.top = Math.max(b.top, pb.top);
      b.low = Math.min(b.low, pb.low);
      this.outfit.add(piece);
    }
    this.bounds = b;
  }

  /** Frees the body and head geometry; materials and outfit pieces are left for reuse (see `disposeTree`). */
  dispose(): void {
    this.body.geometry.dispose();
    this.head.geometry.dispose();
  }

  /**
   * Animates legendary pieces (time in seconds): stars circle, glows breathe, tentacles sway, water drips and pets
   * float after the character. `ground` is the ground's height in the character's frame (below 0 mid-jump).
   */
  tick(t: number, ground = 0): void {
    const dt = this.lastT < 0 ? Infinity : t - this.lastT;
    this.lastT = t;
    pulse(t);
    animateShared(t);
    for (const o of this.spinners) {
      o.rotation.y = t * (o.userData.spin as number);
      o.position.y = Math.sin(t * 1.7) * 0.03;
    }
    for (const o of this.swayers) {
      // A number swings about z (the compass needle); a `Sway` says its own axis, speed and phase.
      const s = o.userData.sway as number | Sway;
      if (typeof s === 'number') o.rotation.z = Math.sin(t * 1.3) * s;
      else o.rotation[s.axis] = Math.sin(t * s.speed + s.phase) * s.amp;
    }
    for (const o of this.bobbers) {
      const b = o.userData.bob as { base: number; amp: number; smooth?: boolean };
      o.position.y = b.base + (b.smooth ? Math.sin(t * 1.8) : Math.abs(Math.sin(t * 2.2))) * b.amp;
    }
    for (const o of this.grounded) o.position.y = ground;
    if (this.pet && this.live) this.follow(this.pet, dt);
  }

  /**
   * Eases the pet in world space toward its spot beside the character and turns it the way the character faces. It
   * snaps there on the first frame, after a pause (a hidden avatar) or when it falls far behind (a teleport or a map
   * change), and is kept `PET_CLEAR` out from the body's axis so a fast turn can't swing it through the outfit.
   */
  private follow(pet: NonNullable<Character['pet']>, dt: number): void {
    const parent = pet.o.parent!;
    parent.updateWorldMatrix(true, false);
    const m = this.group.matrixWorld.elements;
    const goal = PET_GOAL.set(...PET_SPOT).applyMatrix4(this.group.matrixWorld);
    const yaw = Math.atan2(m[8], m[10]);
    if (!pet.placed || !(dt >= 0 && dt < 0.5) || pet.at.distanceTo(goal) > 3) {
      pet.at.copy(goal);
      pet.yaw = yaw;
      pet.placed = true;
    } else {
      // Rate 5 a second: about a metre behind at a walk (Oscar's play test: at 2.5 it hung back 2-3 m and looked lost).
      pet.at.lerp(goal, 1 - Math.exp(-dt * PET_RATE));
      // Out from the axis, or toward its spot if it is right on the axis.
      const on = Math.hypot(pet.at.x - m[12], pet.at.z - m[14]) < 1e-4;
      const dx = (on ? goal.x : pet.at.x) - m[12];
      const dz = (on ? goal.z : pet.at.z) - m[14];
      const d = Math.hypot(dx, dz);
      if (d < PET_CLEAR) {
        pet.at.x = m[12] + (dx / d) * PET_CLEAR;
        pet.at.z = m[14] + (dz / d) * PET_CLEAR;
      }
      pet.yaw += Math.atan2(Math.sin(yaw - pet.yaw), Math.cos(yaw - pet.yaw)) * (1 - Math.exp(-dt * 3));
    }
    parent.worldToLocal(pet.o.position.copy(pet.at));
    pet.o.rotation.y = pet.yaw - yaw;
  }
}

/**
 * The preview faces the viewer and sways this far to either side (radians), there and back once every
 * `SWAY_PERIOD_MS`; after a drag it waits `SWAY_RESUME_MS`, then sways about where the drag left it.
 */
const SWAY = Math.PI / 4;
const SWAY_PERIOD_MS = 7000;
const SWAY_RESUME_MS = 3000;
/** Radians of turn per pixel dragged. */
const DRAG_TURN = 0.012;

/**
 * One shared WebGL canvas showing a character that faces the viewer and sways slowly from side to side; moved
 * into whichever menu tab needs it. Click and drag to turn it by hand, right round to the back.
 */
/**
 * The box the preview keeps in view: hem to the tallest hat, and wide enough for a cloak at any turn. An outfit that
 * reaches further (the Kraken Armor's tentacle cape) moves the camera back until it fits at any turn, with
 * `FRAME_SWAY` spare for swaying tentacles.
 */
const FRAME = { y: 1.2, h: 2.2, w: 1.4 };

export class CharacterPreview {
  readonly canvas = document.createElement('canvas');
  private renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(PREVIEW_FOV, 0.8, 0.1, 20);
  private char: Character;
  private raf = 0;
  /** The turn it sways about: 0 faces the viewer, a drag moves it. */
  private turn = 0;
  /** Milliseconds into the sway; it starts over after a drag, from the middle, so the model never jumps. */
  private swayMs = 0;
  private drag: { x: number; turn: number } | null = null;
  private idleAt = 0;

  constructor(look: Look) {
    this.canvas.className = 'preview';
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.char = new Character(look, false);
    this.fit();
    // The menu's CSS sets the canvas size; follow it so the render stays sharp and unstretched.
    new ResizeObserver(() => this.raf && this.fit()).observe(this.canvas);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.scene.add(this.char.group);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      // Pick the model up at the turn it is showing, mid-sway.
      this.turn = this.char.group.rotation.y;
      this.swayMs = 0;
      this.drag = { x: e.clientX, turn: this.turn };
      this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) this.turn = this.drag.turn + (e.clientX - this.drag.x) * DRAG_TURN;
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.idleAt = performance.now() + SWAY_RESUME_MS;
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
    const tan = Math.tan(THREE.MathUtils.degToRad(PREVIEW_FOV / 2));
    // A point `r` out from the axis can turn toward the camera, so it also needs room when it's nearer and looks bigger
    // (`boundsOf` folds that into `top` and `low`).
    const { reach, top, low } = this.char.bounds;
    const r = reach + FRAME_SWAY;
    const side = tan * this.cam.aspect;
    const dist = Math.max(
      FRAME.h / (2 * tan),
      FRAME.w / (2 * side),
      r * Math.sqrt(1 + 1 / (side * side)),
      (top + FRAME_SWAY / 2 - FRAME.y) / (FRAME_UP + FRAME_RISE),
      (FRAME.y - low + FRAME_SWAY / 2) / (FRAME_DOWN - FRAME_RISE),
    );
    this.cam.position.set(0, FRAME.y + dist * FRAME_RISE, dist);
    this.cam.lookAt(0, FRAME.y, 0);
    this.cam.updateProjectionMatrix();
  }

  set(look: Look): void {
    const was = this.char.bounds;
    this.char.set(look);
    const now = this.char.bounds;
    if (this.raf && (now.reach !== was.reach || now.top !== was.top || now.low !== was.low)) this.fit();
  }

  start(): void {
    if (this.raf) return;
    this.fit();
    // Each time it is shown, it starts facing the viewer.
    this.turn = 0;
    this.swayMs = 0;
    let last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.drag && t >= this.idleAt) this.swayMs += t - last;
      last = t;
      this.char.group.rotation.y = this.turn + SWAY * Math.sin((this.swayMs / SWAY_PERIOD_MS) * Math.PI * 2);
      this.char.tick(t / 1000);
      this.renderer.render(this.scene, this.cam);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stops drawing and shrinks the drawing buffer, so a hidden preview holds almost no GPU memory. */
  stop(): void {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.renderer.setSize(1, 1, false);
  }
}
