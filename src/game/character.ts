import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COS_SLOTS, cosById, type Cosmetic, type CosSlot, type Look } from '../data/cosmetics';
import { applyPose, restPose, type EmotePose } from './emotes/types';
import { faceTexture } from './faces';
import { haloTexture } from './textures';

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
      // A painted material's colour is white, so it can't glow its parts' own colours: it doesn't glow.
      emissive: f.glow && !painted ? color : 0x000000,
      emissiveIntensity: painted ? 0 : f.glow,
      vertexColors: painted,
    });
    MATS.set(key, m);
    if (finish === 'glow' && !painted) PULSE.set(m, f.glow);
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
    case 'leviathanjaw':
      leviathanJaw(c, g);
      break;
    case 'dreamercap':
      dreamerCap(c, g);
      break;
    case 'kelpcap':
      kelpCap(c, g);
      break;
    case 'anemonecrown':
      anemoneCrown(c, g);
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
    case 'leviathancoil':
      leviathanCoil(c, g);
      break;
    case 'dreamerrobe':
      dreamRobe(c, g);
      break;
    case 'kelpwrap':
      kelpWrap(c, g);
      break;
    case 'drifttunic':
      driftTunic(c, g);
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
    case 'leviathanfangs':
      leviathanFangs(c, g);
      break;
    case 'dreamcatcher':
      dreamcatcher(c, g);
      break;
    case 'holdfast':
      holdfast(c, g);
      break;
    case 'jellylocket':
      jellyLocket(c, g);
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

/** The material for parts merged with their colours painted on (see `paint`). */
const painted = (f: Finish, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial => mat(0xffffff, f, side, true);

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
  add(o, merged(parts), painted(finish));
  g.add(o);
  return o;
}

/** A soft additive glow around a gem; one shared texture (`haloTexture`), and one material per colour. */
const HALOS = new Map<number, THREE.SpriteMaterial>();
function halo(g: THREE.Group, p: V3, color: number, size: number): void {
  let m = HALOS.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: haloTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 });
    HALOS.set(color, m);
  }
  const sp = new THREE.Sprite(m);
  sp.position.set(...p);
  sp.scale.setScalar(size);
  g.add(sp);
}

/**
 * Geometry every wearer shares, moved on the CPU once a frame (by whoever ticks first): water dripping, ripples
 * spreading, bubbles rising. One mesh each, however many drops, and no custom shaders. Each is filed under the item
 * whose model made it, and a frame moves only the items a ticking character wears, so pieces nobody has on (like the
 * hidden stand-ins `Avatars.warmLegends` builds) cost nothing.
 */
const SHARED_ANIM = new Map<string, ((t: number) => void)[]>();
/** The item `outfitPiece` is building, whose shared animations `animated` files. */
let building = '';
let animatedAt = -1;
const animatedNow = new Set<string>();
/** Adds a shared animation and runs it once, so the template's resting shape (and its bounds) are real. */
function animated(f: (t: number) => void): void {
  let list = SHARED_ANIM.get(building);
  if (!list) SHARED_ANIM.set(building, (list = []));
  list.push(f);
  f(0);
}
/** Moves the shared animations of the items in `ids`, each once a frame however many wear it. */
function animateShared(t: number, ids: readonly string[]): void {
  if (t !== animatedAt) {
    animatedAt = t;
    animatedNow.clear();
  }
  for (const id of ids) {
    if (animatedNow.has(id)) continue;
    animatedNow.add(id);
    for (const f of SHARED_ANIM.get(id)!) f(t);
  }
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

/** A band along a curve through `pts`, `width(t)` wide `across` it (upright by default): the water streams, the dreamcatcher's feathers. */
function ribbon(pts: V3[], width: (t: number) => number, n: number, across: V3 = [0, 1, 0]): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const [ax, ay, az] = across;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
    const w = width(i / n) / 2;
    pos.push(p.x + ax * w, p.y + ay * w, p.z + az * w, p.x - ax * w, p.y - ay * w, p.z - az * w);
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

// ---------- sea legend pieces (the Leviathan's and the Drowned Dreamer's sets) ----------

const LEV_LIGHT = 0x3e3a56;
const LEV_BELLY = 0x4c3c44;
const LEV_BEARD = 0x9a86c0;
const EMBER = 0xffb02e;
const BONE = 0xf4e8cc;
const DRE_LIGHT = 0x4a9a7c;
const DRE_BELLY = 0x9ad8b8;
const DRE_GLOW = 0x9affd0;
const MOON = 0xfff1c8;
const FLUFF = 0xf4f0ff;

/** Bubbles off the Leviathan Coil; the Dream Robe's dream bubbles; the dreamcatcher's glowing feathers. */
const BUBBLE = new THREE.MeshStandardMaterial({ color: 0xbff8ee, transparent: true, opacity: 0.5, roughness: 0.1, flatShading: true });
const DREAM_BUBBLE = new THREE.MeshStandardMaterial({ color: 0xd8fff4, emissive: 0x3a8a7a, emissiveIntensity: 0.3, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false, flatShading: true });
const STRAND = new THREE.MeshStandardMaterial({ color: DRE_GLOW, emissive: DRE_GLOW, emissiveIntensity: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, flatShading: true });

const UP = new THREE.Vector3(0, 1, 0);
const TO_Z = new THREE.Vector3(0, 0, 1);
const v3 = ([x, y, z]: V3) => new THREE.Vector3(x, y, z);

/** A part whose +y axis points along `dir`, at `pos` (spines standing off a curve). */
function alongAt(pos: THREE.Vector3, dir: THREE.Vector3): At {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return { p: pos.toArray() as V3, r: [e.x, e.y, e.z] };
}

/** Bakes a part placed in a frame (at `p`, turned by `q`) into the piece's own coordinates: an eye's parts, a lash line. */
function framed(geo: THREE.BufferGeometry, at: At, p: V3, q: THREE.Quaternion): THREE.BufferGeometry {
  return place(geo, at).applyMatrix4(new THREE.Matrix4().compose(v3(p), q, new THREE.Vector3(1, 1, 1)));
}
const turnY = (ry: number) => new THREE.Quaternion().setFromAxisAngle(UP, ry);

/** A copy of a small shape that `move` places each frame (its matrix, written into `m`). */
interface Mover {
  geo: THREE.BufferGeometry;
  move: (t: number, m: THREE.Matrix4) => void;
}

/**
 * Small parts that move every frame (rising bubbles and Zs, sliding seams, a wyrmling's segments) as one shared mesh:
 * each mover's vertices are placed on the CPU once a frame (see `animated`), after any `still` parts, which never move.
 * `bound` covers everywhere they go, in the parent's frame; a number instead pads the bounds of where they rest by that much.
 */
function movers(g: THREE.Object3D, m: THREE.Material, list: Mover[], bound: THREE.Sphere | number, still: Part[] = []): THREE.Mesh {
  const all = [...still.map(([geo, at]) => place(geo, at)), ...list.map((x) => x.geo)];
  const mixed = all.some((x) => x.index) && all.some((x) => !x.index);
  const geos = mixed ? all.map((x) => (x.index ? x.toNonIndexed() : x)) : all;
  const geo = mergeGeometries(geos)!;
  if (typeof bound !== 'number') geo.boundingSphere = bound;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const out = pos.array as Float32Array;
  let at = 0;
  for (let i = 0; i < still.length; i++) at += geos[i].attributes.position.count * 3;
  const src = geos.slice(still.length).map((x) => {
    const shape = (x.attributes.position.array as Float32Array).slice();
    const start = at;
    at += shape.length;
    return { shape, start };
  });
  const mtx = new THREE.Matrix4();
  animated((t) => {
    for (let j = 0; j < list.length; j++) {
      list[j].move(t, mtx);
      const e = mtx.elements;
      const { shape, start } = src[j];
      for (let i = 0; i < shape.length; i += 3) {
        const x = shape[i];
        const y = shape[i + 1];
        const z = shape[i + 2];
        out[start + i] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[start + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[start + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
    }
    pos.needsUpdate = true;
  });
  if (typeof bound === 'number') {
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += bound;
  }
  const o = new THREE.Mesh(geo, m);
  g.add(o);
  return o;
}

const SCALE = new THREE.Vector3();
/**
 * Rises from `base` through `span` once every 1/`speed` seconds (starting `off` of the way up), swelling in and
 * shrinking away to nothing at the top, turned `rz` about z: bubbles and Zs.
 */
function rising(x: number, z: number, base: number, span: number, speed: number, off: number, rz = 0): Mover['move'] {
  return (t, m) => {
    const k = (off + t * speed) % 1;
    m.makeRotationZ(rz).scale(SCALE.setScalar(Math.sin(k * Math.PI) + 0.05)).setPosition(x, base + k * span, z);
  };
}

/** A 'Z' for sleepers, from three bars, centred on the origin. */
function zee(size: number): THREE.BufferGeometry {
  return merged([
    [new THREE.BoxGeometry(size, size * 0.2, size * 0.12), { p: [0, size * 0.5, 0] }],
    [new THREE.BoxGeometry(size, size * 0.2, size * 0.12), { p: [0, -size * 0.5, 0] }],
    [new THREE.BoxGeometry(size * 1.38, size * 0.2, size * 0.12), { r: [0, 0, 0.785] }],
  ]);
}

/** A sleeping eye drawn as a glowing lash line (a closed lid) with three lashes, at `p` turned `ry` about y. */
function lashes(out: Part[], p: V3, ry: number, r: number): void {
  const q = turnY(ry);
  out.push([framed(new THREE.TorusGeometry(r, r * 0.22, 4, 10, Math.PI), { r: [0, 0, Math.PI] }, p, q), {}]);
  for (const a of [-0.7, 0, 0.7]) out.push([framed(new THREE.ConeGeometry(r * 0.16, r * 0.6, 3), { p: [Math.sin(a) * r * 1.25, -Math.cos(a) * r * 1.25, 0], r: [0, 0, a + Math.PI] }, p, q), {}]);
}

/** Leviathan's Jaw: the Leviathan's long skull over your head, fangs over your brow, its jaw under your chin, bone horns and a row of burning eyes. */
function leviathanJaw(c: Cosmetic, g: THREE.Group): void {
  // The skull's dome over your head, its snout out over your face (centre z 0.07, 0.4 deep), a lower jaw under your chin.
  const C: V3 = [0, 1.7, 0.07];
  const R: V3 = [0.25, 0.19, 0.4];
  const plate: Part[] = [
    [paint(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, H), c.color), { p: C, s: R }],
    [paint(new THREE.TorusGeometry(0.26, 0.036, 5, 18, 2.6), c.color), { p: [0, 1.45, 0.03], r: [H, 0, H - 1.3], s: [1, 1.35, 1] }],
    ...[-1, 1].map((s): Part => [paint(new THREE.CylinderGeometry(0.032, 0.04, 0.26, 6), c.color), { p: [s * 0.25, 1.58, -0.04] }]),
  ];
  // A raised ridge down the snout.
  limb(plate, [[0, 1.86, -0.05], [0, 1.865, 0.15], [0, 1.8, 0.33], [0, 1.74, 0.44]], 0.035, 0.022, LEV_LIGHT, 10, 6);
  addMany(g, painted('metal'), plate);
  // The roof of its mouth over your face, fangs all round the jaw's front edge and up from the lower jaw, horns and back spines.
  const bone: Part[] = [[paint(new THREE.CircleGeometry(1, 18), 0x7a2434), { p: [C[0], C[1] - 0.001, C[2]], r: [H, 0, 0], s: [R[0] - 0.005, R[2] - 0.005, 1] }]];
  for (let i = -5; i <= 5; i++) {
    const a = i * 0.2;
    const len = 0.075 - Math.abs(i) * 0.005;
    bone.push([paint(new THREE.ConeGeometry(0.014, len, 4), BONE), { p: [Math.sin(a) * (R[0] - 0.01), 1.7 - len / 2, C[2] + Math.cos(a) * (R[2] - 0.012)], r: [Math.PI, 0, 0] }]);
  }
  for (let i = -4; i <= 4; i++) bone.push([paint(new THREE.ConeGeometry(0.013, 0.06, 4), BONE), { p: [Math.sin(i * 0.24) * 0.26, 1.49, 0.03 + Math.cos(i * 0.24) * 0.35] }]);
  for (const s of [-1, 1]) limb(bone, [[s * 0.12, 1.84, -0.12], [s * 0.2, 1.94, -0.26], [s * 0.2, 2.02, -0.42], [s * 0.13, 2.05, -0.54]], 0.05, 0.007, BONE, 12, 6);
  for (let i = 0; i < 4; i++) bone.push([paint(new THREE.ConeGeometry(0.03 - i * 0.004, 0.12 - i * 0.015, 4), BONE), { p: [0, 1.88 - i * 0.035, -0.08 - i * 0.08], r: [-0.7 - i * 0.2, 0, 0] }]);
  addMany(g, painted('satin'), bone);
  // Smouldering nostrils and two molten seams round the skull.
  const seams: Part[] = [-1, 1].map((s): Part => [new THREE.SphereGeometry(0.016, 6, 4), { p: [s * 0.045, 1.745, 0.455] }]);
  for (const y of [1.76, 1.83]) {
    const f = Math.sqrt(1 - ((y - C[1]) / R[1]) ** 2);
    const r = R[0] * f + 0.003;
    seams.push([new THREE.TorusGeometry(r, 0.007, 4, 28), { p: [0, y, C[2]], r: [H, 0, 0], s: [1, (R[2] * f + 0.003) / r, 1] }]);
  }
  addMany(g, mat(c.accent, 'glow'), seams);
  // The burning row of eyes along each side of the skull, with slit pupils.
  const eyes: Part[] = [];
  const pupils: Part[] = [];
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const z = 0.3 - i * 0.1;
      const y = 1.79;
      const r = 0.034 - i * 0.006;
      const x = s * (R[0] * Math.sqrt(Math.max(0, 1 - ((y - C[1]) / R[1]) ** 2 - ((z - C[2]) / R[2]) ** 2)) + 0.004);
      eyes.push([new THREE.SphereGeometry(r, 8, 6), { p: [x, y, z], s: [0.8, 0.8, 1] }]);
      pupils.push([new THREE.BoxGeometry(r * 0.4, r * 1.5, r * 0.4), { p: [x + s * r * 0.7, y, z] }]);
      if (i === 0) halo(g, [x + s * 0.03, y, z], c.accent, 0.22);
    }
  addMany(g, mat(EMBER, 'glow'), eyes);
  addMany(g, mat(INK, 'gem'), pupils);
  // A little lower and closer in than the render's (2.05, 0.5), as the Kraken Crown's, so the Wardrobe preview needn't shrink.
  sparkles(g, EMBER, 2.0, 0.47, 5, 0.8);
}

/**
 * Leviathan Coil: the Leviathan wrapped once round you, from its shark tail off the ground behind you, round your
 * body and up over your back to your head, over a dark belly. Its molten seams slide slowly along it, so it seems to
 * turn round you; bone spines stand off its outer side, its lavender beard hangs behind your head, the tail flicks
 * and bubbles stream up.
 */
function leviathanCoil(c: Cosmetic, g: THREE.Group): void {
  const [collar, collarAt] = hoop(0.2, 0.03, 1.43);
  const plate: Part[] = [[paint(collar, LEV_LIGHT), collarAt]];
  const pts: V3[] = [[0, 0.28, -0.92], [0, 0.3, -0.72], [0, 0.36, -0.5]];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = Math.PI + t * Math.PI * 2;
    pts.push([Math.sin(a) * 0.38, 0.48 + t * 0.9, Math.cos(a) * 0.38]);
  }
  pts.push([0, 1.52, -0.37], [0, 1.64, -0.32]);
  const [R0, R1] = [0.035, 0.105];
  limb(plate, pts, R0, R1, c.color, 60, 9);
  addMany(g, painted('metal'), plate);
  const curve = new THREE.CatmullRomCurve3(pts.map(v3));
  const soft: Part[] = [[paint(new THREE.LatheGeometry(SHIRT.map(([r, y]) => new THREE.Vector2(r, y)), 14), LEV_BELLY), {}]];
  for (let i = 0; i < 12; i++) {
    const u = 0.12 + i * 0.07;
    const p = curve.getPointAt(u);
    const r = R0 + (R1 - R0) * u;
    const d = new THREE.Vector3(p.x, 0.35, p.z).normalize();
    soft.push([paint(new THREE.ConeGeometry(0.018 + r * 0.15, 0.07 + r * 0.5, 4), BONE), alongAt(p.addScaledVector(d, r + 0.025), d)]);
  }
  for (const x of [-0.05, 0, 0.05]) limb(soft, [[x, 1.58, -0.42], [x * 1.4, 1.45, -0.46], [x * 1.2, 1.32, -0.44]], 0.012, 0.004, LEV_BEARD, 6, 4);
  addMany(g, painted('satin'), soft);
  // Nine seam rings slide from tail to head; the curve is sampled once so moving them costs no allocations.
  const N = 240;
  const at = Array.from({ length: N + 1 }, (_, i) => curve.getPointAt(i / N));
  const turn = Array.from({ length: N + 1 }, (_, i) => new THREE.Quaternion().setFromUnitVectors(UP, curve.getTangentAt(i / N)));
  const ring = new THREE.TorusGeometry(1, 0.11, 4, 14).rotateX(H);
  const P = new THREE.Vector3();
  const seams = Array.from({ length: 9 }, (_, i): Mover => ({
    geo: ring.clone(),
    move: (t, m) => {
      const u = 0.08 + ((i / 9 + t * 0.045) % 1) * 0.9;
      const f = u * N;
      const j = Math.min(N - 1, Math.floor(f));
      P.lerpVectors(at[j], at[j + 1], f - j);
      m.compose(P, turn[j], SCALE.setScalar(R0 + (R1 - R0) * u + 0.006));
    },
  }));
  movers(g, mat(c.accent, 'glow'), seams, new THREE.Sphere(new THREE.Vector3(0, 0.9, -0.2), 1.1)).castShadow = false;
  // The shark tail stands up off the end of the coil and flicks.
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.quadraticCurveTo(0.04, 0.2, -0.22, 0.48);
  fin.quadraticCurveTo(-0.08, 0.2, -0.12, 0.06);
  fin.quadraticCurveTo(-0.08, -0.05, -0.18, -0.12);
  fin.quadraticCurveTo(-0.05, -0.08, 0, 0);
  swaying(g, pts[0], { axis: 'y', amp: 0.35, speed: 1.4, phase: 0 }, [[paint(new THREE.ExtrudeGeometry(fin, { depth: 0.022, bevelEnabled: false }), c.color), { p: [-0.011, 0, 0], r: [0, H, 0], s: 1.2 }]], 'metal');
  // Bubbles stream up round you.
  const bubbles = Array.from({ length: 14 }, (_, i): Mover => {
    const a = i * 2.39;
    const r = 0.36 + ((i * 0.37) % 1) * 0.14;
    return { geo: new THREE.SphereGeometry(0.014 + (i % 3) * 0.008, 7, 5), move: rising(Math.sin(a) * r, Math.cos(a) * r, 0.35, 1.6, 0.18 + (i % 4) * 0.05, (i * 0.29) % 1) };
  });
  const bub = movers(g, BUBBLE, bubbles, new THREE.Sphere(new THREE.Vector3(0, 1.15, 0), 1));
  bub.castShadow = false;
  bub.userData.unframed = true;
  sparkles(g, EMBER, 1.0, 0.62, 6, 0.7);
}

/** Leviathan Fangs: five of its fangs on a dark cord, each hung from a glowing ember. */
function leviathanFangs(c: Cosmetic, g: THREE.Group): void {
  const cord: Part[] = [[paint(new THREE.TorusGeometry(NECK.r, 0.009, 4, 22), 0x3a3448), { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] }]];
  const embers: Part[] = [];
  for (let i = -2; i <= 2; i++) {
    const p = beadAt((i + 16) % 16, 16, 0.006);
    const len = 0.13 - Math.abs(i) * 0.025;
    embers.push([new THREE.SphereGeometry(0.016, 6, 4), { p }]);
    cord.push([paint(new THREE.ConeGeometry(0.022 - Math.abs(i) * 0.003, len, 5), c.color), { p: [p[0], p[1] - 0.016 - len / 2, p[2] + 0.01], r: [Math.PI - 0.15, 0, -p[0] * 0.8] }]);
  }
  for (const i of [-3, 3]) cord.push([paint(new THREE.SphereGeometry(1, 6, 4), 0x2c2c42), { p: beadAt((i + 16) % 16, 16, 0.006), s: [0.024, 0.03, 0.014] }]);
  addMany(g, painted('satin'), cord);
  addMany(g, mat(c.accent, 'glow'), embers);
  const top = beadAt(0, 16);
  halo(g, [0, top[1] - 0.06, top[2] + 0.05], c.accent, 0.22);
  sparkles(g, EMBER, 1.2, 0.48, 5, 1.2);
}

/**
 * Dreamer's Nightcap: a long teal nightcap over a fluffy band, dotted with mint stars, swaying gently. Its pompom is a
 * sleepy eye that opens drowsily every few seconds and shuts again; Zs drift up and a small halo turns overhead.
 */
function dreamerCap(c: Cosmetic, g: THREE.Group): void {
  add(g, new THREE.TorusGeometry(0.21, 0.04, 6, 20), mat(FLUFF), { p: [0, 1.76, 0], r: [H, 0, 0] });
  const pts: V3[] = [[0, 0, 0], [0, 0.18, -0.02], [0.08, 0.33, -0.05], [0.22, 0.36, -0.04], [0.32, 0.26, -0.02], [0.35, 0.14, 0]];
  const cloth: Part[] = [];
  limb(cloth, pts, 0.2, 0.03, c.color, 18, 10);
  const curve = new THREE.CatmullRomCurve3(pts.map(v3));
  const glow: Part[] = [];
  for (let i = 0; i < 9; i++) {
    const u = 0.12 + i * 0.09;
    const q = curve.getPointAt(u);
    const r = 0.2 + (0.03 - 0.2) * u + 0.003;
    const a = i * 2.2;
    glow.push([new THREE.OctahedronGeometry(0.016 + (i % 2) * 0.006), { p: [q.x + Math.sin(a) * r * 0.9, q.y + Math.cos(a) * r * 0.5, q.z + Math.cos(a) * r * 0.9], s: [1, 1, 0.5] }]);
  }
  // The pompom is a sleepy eye looking out and a little down.
  const tip = curve.getPoint(1);
  cloth.push([paint(new THREE.IcosahedronGeometry(0.06, 1), FLUFF), { p: [tip.x, tip.y - 0.04, tip.z] }]);
  const r = 0.032;
  const eyeAt: V3 = [tip.x, tip.y - 0.045, tip.z + 0.045];
  const look = new THREE.Quaternion().setFromUnitVectors(TO_Z, new THREE.Vector3(0.1, -0.2, 1).normalize());
  cloth.push([paint(framed(new THREE.SphereGeometry(r, 10, 8), {}, eyeAt, look), WHITE), {}]);
  cloth.push([paint(framed(new THREE.SphereGeometry(r * 0.3, 8, 6), { p: [0, 0, r * 1.03], s: [1, 1, 0.35] }, eyeAt, look), INK), {}]);
  glow.push([framed(new THREE.SphereGeometry(r * 0.62, 10, 8), { p: [0, 0, r * 0.79], s: [1, 1, 0.45] }, eyeAt, look), {}]);
  const cap = swaying(g, [0, 1.78, 0], { axis: 'z', amp: 0.06, speed: 1.0, phase: 0 }, cloth, 'cloth');
  addMany(cap, mat(DRE_GLOW, 'glow'), glow);
  // Two lids that rest shut and open drowsily once every 6 s, turning about the eye's x axis.
  const eye = new THREE.Matrix4().compose(v3(eyeAt), look, new THREE.Vector3(1, 1, 1));
  const lids = [1, -1].map((s): Mover => ({
    geo: new THREE.SphereGeometry(r * 1.1, 10, 5, 0, Math.PI * 2, s > 0 ? 0 : H, H),
    move: (t, m) => {
      const k = (t / 6 + 0.2) % 1;
      const open = 0.03 + 0.72 * (k < 0.28 ? Math.sin((k / 0.28) * Math.PI) ** 0.7 : 0);
      m.makeRotationX(-s * open * 1.05).premultiply(eye);
    },
  }));
  movers(cap, mat(FLUFF, 'satin', THREE.DoubleSide), lids, new THREE.Sphere(v3(eyeAt), r * 1.2));
  // A small halo, tilted, turning overhead.
  const holder = new THREE.Group();
  holder.position.set(-0.05, 2.22, -0.02);
  g.add(holder);
  const ring = add(holder, new THREE.TorusGeometry(0.16, 0.01, 4, 28).rotateX(H).rotateZ(0.25), mat(DRE_GLOW, 'glow'));
  ring.castShadow = false;
  ring.userData.spin = 0.5;
  const zs = movers(
    g,
    mat(DRE_GLOW, 'glow'),
    ([[0.34, 0.05, 0.05], [0.42, 0.04, -0.02], [0.28, 0.035, 0.08]] as V3[]).map(([x, size, z], i): Mover => ({ geo: zee(size), move: rising(x + i * 0.03, z, 1.95, 0.6, 0.22, i / 3, 0.2 - i * 0.15) })),
    new THREE.Sphere(new THREE.Vector3(0.38, 2.25, 0), 0.4),
  );
  zs.castShadow = false;
  // The Zs may clip at the preview's edge rather than shrink the character to fit them.
  zs.userData.unframed = true;
  sparkles(g, DRE_GLOW, 2.0, 0.5, 5, -0.5);
}

/** The Dream Robe's profile: a shirt that flares out to the ground. */
const ROBE: [number, number][] = [[0.43, 0.23], [0.39, 0.4], [0.335, 0.62], ...SHIRT.slice(2)];

/**
 * Dream Robe: a long teal robe of stars with a crescent moon, sleeping eyes round its pale hem and a ruff of cloud.
 * Dream bubbles rise round you, a few with a tiny glowing fish asleep inside, and cloud puffs turn slowly at your feet.
 */
function dreamRobe(c: Cosmetic, g: THREE.Group): void {
  addMany(g, painted('satin'), [
    [paint(new THREE.LatheGeometry(ROBE.map(([r, y]) => new THREE.Vector2(r, y)), 14), c.color), {}],
    [paint(new THREE.LatheGeometry([[0.437, 0.23], [0.41, 0.33], [0.4, 0.37]].map(([r, y]) => new THREE.Vector2(r, y)), 18), DRE_BELLY), {}],
  ]);
  // Sleeping eyes round the hem and stars up the robe, mint and moon-pale, and a crescent moon at the chest.
  const mint: Part[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lashes(mint, [Math.sin(a) * 0.43, 0.3, Math.cos(a) * 0.43], a, 0.03);
  }
  const moon: Part[] = [[new THREE.TorusGeometry(0.05, 0.014, 4, 14, Math.PI * 1.3), { p: [0.08, 1.24, front(1.24) + 0.01], r: [0, 0, 0.8] }]];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39;
    const y = 0.45 + ((i * 0.37) % 1) * 0.85;
    const r = rAt(y, ROBE) + 0.004;
    (i % 3 ? mint : moon).push([new THREE.OctahedronGeometry(0.014 + (i % 3) * 0.004), { p: [Math.sin(a) * r, y, Math.cos(a) * r], s: [1, 1, 0.4], r: [0, a, 0] }]);
  }
  addMany(g, mat(DRE_GLOW, 'glow'), mint);
  halo(g, [0.08, 1.24, front(1.24) + 0.05], MOON, 0.24);
  // A ruff of cloud at the collar.
  addMany(g, mat(FLUFF), Array.from({ length: 12 }, (_, i): Part => [new THREE.IcosahedronGeometry(0.045, 1), { p: [Math.sin((i / 12) * Math.PI * 2) * 0.2, 1.43, Math.cos((i / 12) * Math.PI * 2) * 0.2], s: [1, 0.75, 1] }]));
  // Dream bubbles rise round you; every third holds a tiny glowing fish, which shares the moon's mesh.
  const dreams: Mover[] = [];
  const fish: Mover[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    const r = 0.5 + (i % 3) * 0.08;
    const size = 0.05 + (i % 3) * 0.02;
    const move = rising(Math.sin(a) * r, Math.cos(a) * r, 0.45, 1.9, 0.1 + (i % 4) * 0.025, (i * 0.29) % 1);
    dreams.push({ geo: new THREE.SphereGeometry(size, 10, 8), move });
    if (i % 3 === 0)
      fish.push({
        geo: merged([
          [new THREE.SphereGeometry(1, 6, 4), { s: [size * 0.25, size * 0.3, size * 0.5] }],
          [new THREE.ConeGeometry(size * 0.25, size * 0.35, 3), { p: [0, 0, -size * 0.55], r: [-H, 0, 0], s: [0.4, 1, 1] }],
        ]),
        move,
      });
  }
  const rise = new THREE.Sphere(new THREE.Vector3(0, 1.4, 0), 1.3);
  const moons = movers(g, mat(MOON, 'glow'), fish, rise, moon);
  const bubbles = movers(g, DREAM_BUBBLE, dreams, rise);
  // The bubbles may clip at the preview's edge rather than shrink the character to fit them.
  for (const o of [moons, bubbles]) {
    o.castShadow = false;
    o.userData.unframed = true;
  }
  // Cloud puffs round your feet, turning slowly.
  const puffs = addMany(g, mat(FLUFF), Array.from({ length: 16 }, (_, i): Part => {
    const a = (i / 16) * Math.PI * 2;
    const r = 0.42 + (i % 3) * 0.05;
    return [new THREE.IcosahedronGeometry(0.12 * (0.75 + (i % 4) * 0.15), 1), { p: [Math.sin(a) * r, 0.28 + (i % 2) * 0.042, Math.cos(a) * r], s: [1, 0.7, 1] }];
  }));
  puffs.castShadow = false;
  puffs.userData.spin = 0.1;
  sparkles(g, DRE_GLOW, 1.0, 0.66, 6, -0.6);
}

/** Dreamcatcher: a pale hoop and web with a mint light at its heart, hung with glowing tentacle feathers, swaying on its cord. */
function dreamcatcher(c: Cosmetic, g: THREE.Group): void {
  const top = beadAt(0, 16);
  addMany(g, mat(DRE_LIGHT, 'satin'), [
    [new THREE.TorusGeometry(NECK.r, 0.007, 4, 22), { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] }],
    [new THREE.CylinderGeometry(0.005, 0.005, top[1] - 1.22, 4), { p: [0, (top[1] + 1.22) / 2, (top[2] + 0.35) / 2], r: [0.35, 0, 0] }],
  ]);
  const frame: Part[] = [[paint(new THREE.TorusGeometry(0.085, 0.01, 5, 24), c.color), {}]];
  for (let k = 0; k < 6; k++) frame.push([paint(new THREE.BoxGeometry(0.17, 0.003, 0.003), 0xeaf7f0), { r: [0, 0, (k / 6) * Math.PI] }]);
  const feathers: Part[] = [];
  for (const [x, len] of [[-0.06, 0.16], [0, 0.22], [0.06, 0.16]]) {
    feathers.push([ribbon([[x, -0.085, 0], [x * 1.1, -0.085 - len * 0.5, 0.01], [x * 0.9, -0.085 - len, 0.005]], (t) => 0.035 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 14, [1, 0, 0]), {}]);
    frame.push([paint(new THREE.SphereGeometry(0.012, 6, 4), c.color), { p: [x, -0.095, 0.004] }]);
  }
  const dc = swaying(g, [0, 1.13, front(1.13) + 0.03], { axis: 'z', amp: 0.06, speed: 1.2, phase: 0 }, frame);
  dc.rotation.x = -0.1;
  addMany(dc, mat(c.accent, 'glow'), [[new THREE.TorusGeometry(0.04, 0.004, 4, 16), {}], [new THREE.SphereGeometry(0.018, 8, 6), {}]]);
  addMany(dc, STRAND, feathers).castShadow = false;
  halo(dc, [0, 0, 0.03], c.accent, 0.24);
  sparkles(g, DRE_GLOW, 1.2, 0.48, 5, 1.0);
}

// ---------- sea zone sets (Kelp Deep's and the Twilight's) ----------

const KOLIVE = 0x7d8a34;
const KGOLD = 0xc8962e;
const KGOLD_D = 0x7a5a1e;
const KFLOAT = 0xb08a3a;
const SEAGLASS = 0x8ff0c0;
/** The Twilight as the game draws it: cloth the colour of its violet water, pale fish-light, lilac glass and the sky's peach. */
const TDEEP = 0x6462a4;
const TDEEP_L = 0x8e88c8;
const NC = 0xdff2ff;
const NV = 0xc8b4f4;
const NM = 0xffb09a;

/**
 * A kelp blade along a curve through `pts`: a strip with a rippled edge, narrowing toward its tip, `w` wide across
 * `side` (or level and square to the blade, 'flat'). Painted, with blank uvs so it merges with spheres (its float).
 */
function kelpBlade(pts: V3[], w: number, side: V3 | 'flat', color: number, n: number): { geo: THREE.BufferGeometry; tip: THREE.Vector3 } {
  const curve = new THREE.CatmullRomCurve3(pts.map(v3));
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const s = new THREE.Vector3();
  const segs = n * 2;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPoint(t, p);
    if (side === 'flat') {
      curve.getTangent(t, tan);
      s.set(-tan.z, 0, tan.x);
      if (s.lengthSq() < 1e-6) s.set(1, 0, 0);
    } else s.set(...side);
    s.normalize().multiplyScalar((w * (1 - t * 0.35) * (0.82 + 0.18 * Math.sin(t * 28))) / 2);
    pos.push(p.x + s.x, p.y + s.y, p.z + s.z, p.x - s.x, p.y - s.y, p.z - s.z);
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo: paint(geo, color), tip: curve.getPoint(1) };
}

const ROT = new THREE.Matrix4();
/** Swings about its own axis at `p` as `swaying` does, for parts sharing one mesh (`movers`) instead of a draw call each. */
const swing =
  (p: V3, s: Sway): Mover['move'] =>
  (t, m) => {
    const a = Math.sin(t * s.speed + s.phase) * s.amp;
    (s.axis === 'x' ? m.makeRotationX(a) : s.axis === 'y' ? m.makeRotationY(a) : m.makeRotationZ(a)).setPosition(...p);
  };

/** Kelp's floats: a little bladder at a blade's tip, holding it up in the water. */
const float = (tip: THREE.Vector3, r = 0.034): Part => [paint(new THREE.SphereGeometry(r, 8, 6), KFLOAT), { p: [tip.x, tip.y + 0.02, tip.z], s: [1, 1.3, 1] }];

/** Bubbles rising round the wearer, `n` of them between radii r0 and r1 (as the Leviathan Coil's). */
function kelpBubbles(g: THREE.Group, n: number, r0: number, r1: number, base: number, span: number, seed: number): void {
  const list = Array.from({ length: n }, (_, i): Mover => {
    const a = i * 2.39 + seed;
    const r = r0 + ((i * 0.37) % 1) * (r1 - r0);
    return { geo: new THREE.SphereGeometry(0.014 + (i % 3) * 0.008, 7, 5), move: rising(Math.sin(a) * r, Math.cos(a) * r, base, span, 0.18 + (i % 4) * 0.05, (i * 0.29) % 1) };
  });
  const o = movers(g, BUBBLE, list, new THREE.Sphere(new THREE.Vector3(0, base + span / 2, 0), span / 2 + r1 + 0.05));
  o.castShadow = false;
  // The bubbles may clip at the preview's edge rather than shrink the character to fit them.
  o.userData.unframed = true;
}

/**
 * Kelp Cap: woven kelp with a band of gold, and six blades rising off it, each held up by the float at its tip and
 * swaying as if the sea were still round you; bubbles rise off it. The blades share one mesh, moved on the CPU.
 */
function kelpCap(c: Cosmetic, g: THREE.Group): void {
  const cap: Part[] = [[paint(new THREE.SphereGeometry(0.218, 14, 6, 0, Math.PI * 2, 0, H), c.color), { p: [0, 1.73, 0], s: [1, 0.75, 1] }]];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    cap.push([paint(new THREE.BoxGeometry(0.05, 0.06, 0.012), i % 2 ? KGOLD : KGOLD_D), { p: [Math.sin(a) * 0.222, 1.76, Math.cos(a) * 0.222], r: [0, a, i % 2 ? 0.4 : -0.4] }]);
  }
  addMany(g, painted('satin'), cap);
  const blades: Mover[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const h = 0.5 + (i % 3) * 0.12;
    const { geo, tip } = kelpBlade([[0, 0, 0], [sx * 0.07, h * 0.35, sz * 0.07], [sx * 0.03, h * 0.7, sz * 0.03], [sx * 0.11, h, sz * 0.11]], 0.08, [sz, 0, -sx], i % 2 ? KGOLD : c.color, 22);
    blades.push({ geo: merged([[geo, {}], float(tip)]), move: swing([sx * 0.1, 1.86, sz * 0.1], { axis: i % 2 ? 'x' : 'z', amp: 0.14, speed: 0.7, phase: i * 1.1 }) });
  }
  movers(g, painted('satin', THREE.DoubleSide), blades, 0.12).castShadow = true;
  kelpBubbles(g, 8, 0.1, 0.35, 1.9, 0.8, 0.5);
}

/**
 * Kelp Wrap: blades wrapped from the shoulders to the hip over olive cloth, a stalk belt, six streamers rising off
 * your back and floating behind you on their floats, and bubbles rising all round. All 22 blades share one mesh.
 */
function kelpWrap(c: Cosmetic, g: THREE.Group): void {
  const [belt, beltAt] = hoop(0.36, 0.018, 0.82, 26);
  addMany(g, painted('satin'), [
    [paint(new THREE.LatheGeometry(SHIRT.map(([r, y]) => new THREE.Vector2(r, y)), 14), c.color), {}],
    [paint(belt, KGOLD_D), beltAt],
  ]);
  const cols = [KGOLD, KOLIVE, KGOLD_D];
  const blades: Mover[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const top: V3 = [sx * 0.24, 1.4, sz * 0.24];
    const P = (r: number, y: number): V3 => [sx * r - top[0], y - top[1], sz * r - top[2]];
    const { geo } = kelpBlade([P(0.24, 1.4), P(0.33, 1.2), P(0.345, 0.9), P(0.37, 0.62), P(0.39, 0.5)], 0.16, [sz, 0, -sx], cols[i % 3], 18);
    blades.push({ geo, move: swing(top, { axis: Math.abs(sz) > 0.7 ? 'x' : 'z', amp: 0.04, speed: 0.8, phase: i * 0.9 }) });
  }
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1;
    const k = i % 3;
    const h = 0.6 + k * 0.16;
    const { geo, tip } = kelpBlade([[0, 0, 0], [s * 0.08, 0.15, -0.15], [s * 0.18, h * 0.6, -0.3], [s * 0.22, h, -0.38], [s * 0.3, h * 1.15, -0.36]], 0.09, 'flat', cols[k], 24);
    blades.push({ geo: merged([[geo, {}], float(tip, 0.032)]), move: swing([s * (0.1 + k * 0.07), 1.32 - k * 0.14, -0.3], { axis: 'x', amp: 0.12, speed: 0.6, phase: i }) });
  }
  movers(g, painted('satin', THREE.DoubleSide), blades, 0.1).castShadow = true;
  kelpBubbles(g, 12, 0.35, 0.6, 0.5, 1.8, 2.1);
}

/** Holdfast Pendant: kelp's roots knotted round a pebble of sea glass, on a cord of stalk. */
function holdfast(c: Cosmetic, g: THREE.Group): void {
  const top = beadAt(0, 16);
  const cord: Part[] = [
    [paint(new THREE.TorusGeometry(NECK.r + 0.004, 0.01, 5, 24), c.accent), { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] }],
    [paint(new THREE.CylinderGeometry(0.006, 0.006, top[1] - 1.16, 4), c.accent), { p: [0, (top[1] + 1.16) / 2, (top[2] + 0.35) / 2], r: [0.35, 0, 0] }],
  ];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9;
    const pts: V3[] = [[0, 1.16, 0.37], [Math.sin(a) * 0.04, 1.12, 0.375 + Math.cos(a) * 0.035], [Math.sin(a + 0.6) * 0.045, 1.08, 0.375 + Math.cos(a + 0.6) * 0.03], [Math.sin(a) * 0.02, 1.05, 0.385]];
    limb(cord, pts, 0.008, 0.004, k % 2 ? KGOLD_D : KOLIVE, 6, 4);
  }
  addMany(g, painted('satin'), cord);
  add(g, new THREE.IcosahedronGeometry(0.036, 0), mat(c.color, 'gem'), { p: [0, 1.1, 0.375] });
  halo(g, [0, 1.1, 0.41], SEAGLASS, 0.14);
}

/**
 * A joint in a small rig, placed once a frame however many ask (`at`): a little jelly, its bell, each link of a
 * tendril. `local` places it in its parent's frame.
 */
class Joint {
  readonly m = new THREE.Matrix4();
  private t = NaN;
  constructor(
    private local: (t: number, m: THREE.Matrix4) => void,
    private parent?: Joint,
  ) {}
  at(t: number): THREE.Matrix4 {
    if (t !== this.t) {
      this.t = t;
      this.local(t, this.m);
      if (this.parent) this.m.premultiply(this.parent.at(t));
    }
    return this.m;
  }
}
const riding = (j: Joint, geo: THREE.BufferGeometry): Mover => ({ geo, move: (t, m) => void m.copy(j.at(t)) });

/**
 * The jellies' see-through glow: colour and opacity painted on each vertex, unlit, so the Twilight set's tendrils,
 * bells and hearts in every colour share one draw call. Both faces in one pass: the jellies are too small to need
 * their backs drawn first, which would double the draw calls.
 */
const JELLY = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
/** A glowing heart or tip is brighter than its jelly: it can glow past white's brightness. */
const HEART = 1.3;
/** Gives every vertex one colour (times `k`) and opacity, for `JELLY`. */
function paintA(geo: THREE.BufferGeometry, color: number, alpha: number, k = 1): THREE.BufferGeometry {
  const c = new THREE.Color(color).multiplyScalar(k);
  const n = geo.attributes.position.count;
  const rgba = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) rgba.set([c.r, c.g, c.b, alpha], i * 4);
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  return geo;
}

interface TendrilOpts {
  n: number;
  len: number;
  r0: number;
  r1: number;
  color: number;
  alpha: number;
  /** -1 hangs, +1 grows up. */
  up: 1 | -1;
  amp: number;
  speed: number;
  phase: number;
  /** How far behind (radians of the sway) each link follows the one before it, so a ripple runs down. */
  lag?: number;
  /** The root's tilt (outward along +z), and how much every later link curls. */
  bend0?: number;
  bend?: number;
  /** A glowing bead at the tip. */
  tip?: number;
  tipR?: number;
  /** Sides round each link. */
  radial?: number;
}

/**
 * A tendril of linked segments rooted at `p` (turned `ry` about y) in `parent`'s frame: each link sways a little after
 * the one before it, so a wave runs down it. Pushes one mover per link, for the `JELLY` mesh.
 */
function tendril(out: Mover[], parent: Joint | undefined, p: V3, ry: number, o: TendrilOpts): void {
  const { n, len, r0, r1, up, amp, speed, phase, lag = 0.55, bend0 = 0, bend = 0, radial = 3 } = o;
  const seg = len / n;
  let j = new Joint((t, m) => void m.makeRotationY(ry).multiply(ROT.makeRotationX(bend0 + Math.sin(t * speed + phase) * amp)).setPosition(...p), parent);
  for (let i = 0; i < n; i++) {
    const ra = r0 + ((r1 - r0) * i) / n;
    const rb = r0 + ((r1 - r0) * (i + 1)) / n;
    const parts: Part[] = [[paintA(new THREE.CylinderGeometry(up > 0 ? rb : ra, up > 0 ? ra : rb, seg * 1.04, radial, 1, true), o.color, o.alpha), { p: [0, (up * seg) / 2, 0] }]];
    if (i === n - 1 && o.tip !== undefined) parts.push([paintA(new THREE.SphereGeometry(o.tipR ?? 0.016, 6, 4), o.tip, 1, HEART), { p: [0, up * seg, 0] }]);
    out.push(riding(j, merged(parts)));
    if (i < n - 1) {
      const k = i + 1;
      j = new Joint((t, m) => void m.makeRotationX(bend + Math.sin(t * speed + phase - k * lag) * amp * 0.7).setPosition(0, up * seg, 0), j);
    }
  }
}

/** Where a soft glow sits: `y` up from a joint, `size` across at the joint's scale. */
interface GlowAt {
  j: Joint;
  y: number;
  size: number;
  color: number;
}

let glowDotsMat: THREE.ShaderMaterial | null = null;
/**
 * Soft glows that face the camera, like `halo`'s sprites, but any number in one mesh: each is a quad whose middle the
 * CPU moves once a frame (`animated`) and whose corners the vertex shader spreads out toward the camera.
 */
function glowDotsMaterial(): THREE.ShaderMaterial {
  glowDotsMat ??= new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float size;
      attribute vec3 tint;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_vertex>
      void main() {
        vUv = corner + 0.5;
        vTint = tint;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        mvPosition.xy += corner * size * length(modelViewMatrix[0].xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vTint, texture2D(map, vUv).a * 0.3);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          // Light fades into the fog rather than taking its colour.
          gl_FragColor.a *= 1.0 - fogFactor;
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  glowDotsMat.uniforms.map.value = haloTexture();
  return glowDotsMat;
}

/** The glows round the jellies (see `glowDotsMaterial`), moved with them once a frame; one draw call for the lot. */
function glowDots(g: THREE.Object3D, list: GlowAt[]): THREE.Mesh {
  const n = list.length;
  const pos = new Float32Array(n * 12);
  const size = new Float32Array(n * 4);
  const corner = new Float32Array(n * 8);
  const tint = new Float32Array(n * 12);
  const idx: number[] = [];
  const C = new THREE.Color();
  list.forEach((d, i) => {
    corner.set([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], i * 8);
    C.set(d.color);
    for (let k = 0; k < 4; k++) tint.set([C.r, C.g, C.b], (i * 4 + k) * 3);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const sizeAttr = new THREE.BufferAttribute(size, 1);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('size', sizeAttr);
  geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  geo.setIndex(idx);
  const P = new THREE.Vector3();
  animated((t) => {
    list.forEach((d, i) => {
      const m = d.j.at(t);
      const e = m.elements;
      P.set(0, d.y, 0).applyMatrix4(m);
      const s = d.size * Math.hypot(e[0], e[1], e[2]);
      for (let k = 0; k < 4; k++) {
        pos.set([P.x, P.y, P.z], (i * 4 + k) * 3);
        size[i * 4 + k] = s;
      }
    });
    posAttr.needsUpdate = sizeAttr.needsUpdate = true;
  });
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius += 0.3;
  const o = new THREE.Mesh(geo, glowDotsMaterial());
  o.castShadow = false;
  o.userData.light = true;
  g.add(o);
  return o;
}

/**
 * A little glowing jelly at `root`: a bell that breathes with a bright heart inside, five threads trailing and
 * rippling under it, and a soft glow round it. Its parts go to `body` (for a `JELLY` mesh) and `glows`.
 */
function miniJelly(body: Mover[], glows: GlowAt[], root: Joint, color: number, phase: number): void {
  const speed = 2.2 + phase * 0.3;
  const bell = new Joint((t, m) => {
    const k = Math.sin(t * speed) * 0.12;
    m.makeScale(1 + k, 1 - k * 0.6, 1 + k);
  }, root);
  body.push(
    riding(
      bell,
      merged([
        [paintA(new THREE.SphereGeometry(0.06, 10, 4, 0, Math.PI * 2, 0, H), color, 0.5), { s: [1, 0.8, 1] }],
        [paintA(new THREE.SphereGeometry(0.022, 6, 4), color, 1, HEART), { p: [0, 0.02, 0] }],
      ]),
    ),
  );
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    tendril(body, root, [Math.sin(a) * 0.04, 0, Math.cos(a) * 0.04], 0, { n: 4, len: 0.12, r0: 0.004, r1: 0.002, color, alpha: 0.6, up: -1, amp: 0.25, speed: 2.5, phase: phase + k });
  }
  glows.push({ j: root, y: 0.01, size: 0.3, color });
}

/**
 * Anemone Crown: a lavender band with a glowing seam, nine see-through tendrils swaying up off it with a ripple running
 * along each, and little jellies rising off it and fading as they go.
 */
function anemoneCrown(c: Cosmetic, g: THREE.Group): void {
  addMany(g, mat(c.color, 'satin'), [hoop(0.212, 0.03, 1.765, 22)]);
  addMany(g, mat(NV, 'glow'), [hoop(0.215, 0.006, 1.79, 26)]).castShadow = false;
  const fronds: Mover[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    tendril(fronds, undefined, [Math.sin(a) * 0.2, 1.79, Math.cos(a) * 0.2], a, {
      n: 6,
      len: 0.26 + (k % 3) * 0.06,
      r0: 0.016,
      r1: 0.005,
      color: k % 2 ? NV : NC,
      alpha: 0.6,
      up: 1,
      bend0: 0.25,
      bend: 0.03,
      amp: 0.12,
      speed: 1.0,
      phase: k * 0.8,
      tip: k % 3 ? NC : NM,
      radial: 5,
    });
  }
  movers(g, JELLY, fronds, 0.08);
  const rise: Mover[] = [];
  const glows: GlowAt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    const speed = 0.12 + i * 0.02;
    const root = new Joint((t, m) => {
      const k = (i / 4 + t * speed) % 1;
      const s = Math.sin(k * Math.PI) + 0.05;
      m.makeScale(s, s, s).setPosition(Math.sin(a) * 0.22, 2.0 + k * 0.7, Math.cos(a) * 0.22);
    });
    miniJelly(rise, glows, root, [NC, NM, NV][i % 3], i);
  }
  // The rising jellies may clip at the preview's edge rather than shrink the character to fit them.
  movers(g, JELLY, rise, 0.15).userData.unframed = true;
  glowDots(g, glows).userData.unframed = true;
  sparkles(g, NC, 2.0, 0.46, 5, 0.6);
}

/** A point on the shirt at angle a (round from the front) and height y, `lift` off it. */
const surf = (a: number, y: number, lift: number): THREE.Vector3 => new THREE.Vector3(Math.sin(a) * (rAt(y) + lift), y, Math.cos(a) * (rAt(y) + lift));

/**
 * Drift Tunic: lavender like the Twilight's sea, with veins of light branching up from the hem, seven little glowing
 * jellies circling you slowly at their own heights, and a soft glow on the ground at your feet.
 */
function driftTunic(c: Cosmetic, g: THREE.Group): void {
  const [collar, collarAt] = hoop(0.215, 0.032, 1.42);
  addMany(g, painted('satin'), [
    [paint(new THREE.LatheGeometry(SHIRT.map(([r, y]) => new THREE.Vector2(r, y)), 14), c.color), {}],
    [paint(collar, TDEEP_L), collarAt],
  ]);
  const veins = new Map<number, Part[]>([
    [NV, []],
    [NC, []],
    [NM, []],
  ]);
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * Math.PI * 2 + 0.2;
    const pts: THREE.Vector3[] = [];
    for (let y = 0.58; y <= 1.3; y += 0.08) pts.push(surf(a0 + Math.sin(y * 9 + k) * 0.15, y, 0.004));
    veins.get(k % 2 ? NV : NC)!.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.005, 3), {}]);
    const branch: THREE.Vector3[] = [];
    for (let y = 0.9; y <= 1.15; y += 0.06) branch.push(surf(a0 + 0.12 + (y - 0.9) * 0.9, y, 0.004));
    veins.get(NM)!.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branch), 10, 0.004, 3), {}]);
  }
  for (const [col, parts] of veins) addMany(g, mat(col, 'glow'), parts).castShadow = false;
  // Seven little jellies circle you slowly, each at its own height, bobbing.
  const body: Mover[] = [];
  const glows: GlowAt[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.55 + (i % 2) * 0.1;
    const y = 0.6 + ((i * 0.37) % 1) * 1.1;
    const s = 0.9 + (i % 3) * 0.2;
    const root = new Joint((t, m) => {
      const turn = a + t * 0.25;
      m.makeRotationY(t * 0.25).scale(SCALE.setScalar(s));
      m.setPosition(Math.sin(turn) * r, y + Math.sin(t * 1.8 + i) * 0.05, Math.cos(turn) * r);
    });
    miniJelly(body, glows, root, [NC, NV, NM][i % 3], i);
  }
  movers(g, JELLY, body, 0.15);
  glowDots(g, glows);
  // A soft glow on the ground at your feet; `Character.tick` keeps it on the ground through a jump.
  const pg = new THREE.Group();
  pg.userData.ground = true;
  g.add(pg);
  const floor = add(pg, new THREE.CircleGeometry(0.8, 32), floorGlowMaterial(NV), { p: [0, 0.008, 0], r: [-H, 0, 0] });
  floor.castShadow = false;
  floor.userData.light = true;
  sparkles(g, NC, 1.0, 0.64, 6, -0.5);
}

const FLOOR_GLOWS = new Map<number, THREE.MeshBasicMaterial>();
function floorGlowMaterial(color: number): THREE.MeshBasicMaterial {
  let m = FLOOR_GLOWS.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: haloTexture(), color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    FLOOR_GLOWS.set(color, m);
  }
  return m;
}

const LOCKET_GLASS = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false });

/** Jelly Locket: a glass locket on a fine silver chain, with a tiny glowing jelly drifting inside. */
function jellyLocket(c: Cosmetic, g: THREE.Group): void {
  const top = beadAt(0, 16);
  const L: V3 = [0, 1.12, 0.39];
  addMany(g, mat(c.color, 'metal'), [
    [new THREE.TorusGeometry(NECK.r, 0.005, 4, 24), { p: [0, NECK.y, NECK.z], r: [H + NECK.tilt, 0, 0] }],
    [new THREE.CylinderGeometry(0.003, 0.003, top[1] - 1.18, 3), { p: [0, (top[1] + 1.18) / 2, (top[2] + 0.37) / 2], r: [0.35, 0, 0] }],
    [new THREE.TorusGeometry(0.048, 0.006, 4, 18), { p: L, r: [0, H, 0] }],
    [new THREE.CylinderGeometry(0.012, 0.016, 0.014, 8), { p: [L[0], L[1] + 0.052, L[2]] }],
  ]);
  add(g, new THREE.SphereGeometry(0.048, 12, 10), LOCKET_GLASS, { p: L }).castShadow = false;
  const body: Mover[] = [];
  const glows: GlowAt[] = [];
  const root = new Joint((t, m) => void m.makeScale(0.45, 0.45, 0.45).setPosition(L[0], L[1] + 0.005 + Math.sin(t * 1.8) * 0.008, L[2]));
  miniJelly(body, glows, root, c.accent, 0.5);
  movers(g, JELLY, body, 0.03);
  glowDots(g, glows);
  sparkles(g, NC, 1.2, 0.48, 5, 1.0);
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
    case 'leviathanpet': {
      // Leviathan Wyrmling: a little serpent of dark plates and molten rings with bone spines and horns, swimming after
      // you in a wave that runs from its head to its tail fins. Its segments move as shared meshes, one per material.
      const pet = new THREE.Group();
      pet.scale.setScalar(2.1);
      // Floats 10 cm above its spot (the render's 0), near the Hatchling's height, so in the Wardrobe it passes over the face.
      pet.userData.bob = { base: 0.1, amp: 0.05, smooth: true };
      float.add(pet);
      // It swims a little behind its spot (0.1 here, 21 cm), so its head doesn't reach out past the preview's frame.
      const swim = new THREE.Group();
      swim.position.z = -0.1;
      pet.add(swim);
      const plate: Mover[] = [];
      const spines: Mover[] = [];
      const rings: Mover[] = [];
      /** A segment at z swings side to side and turns into the wave. */
      const wave = (z: number, amp: number, phase: number, y = 0): Mover['move'] => (t, m) => {
        const a = t * 4 + phase;
        m.makeRotationY(Math.cos(a) * 0.6).setPosition(Math.sin(a) * amp, y, z);
      };
      const n = 10;
      for (let i = 0; i < n; i++) {
        const move = wave(0.04 - i * 0.034, 0.03 + i * 0.003, -i * 0.65);
        const r = 0.034 * (1 - i / (n + 3));
        const body: Part[] = [[paint(new THREE.SphereGeometry(r, 8, 6), c.color), {}]];
        if (i === n - 1)
          body.push(
            [paint(new THREE.ConeGeometry(0.03, 0.07, 4), c.color), { p: [0, 0.02, -0.03], r: [-0.9, 0, 0], s: [0.25, 1, 1] }],
            [paint(new THREE.ConeGeometry(0.022, 0.045, 4), c.color), { p: [0, -0.012, -0.02], r: [-2.1, 0, 0], s: [0.25, 1, 1] }],
          );
        plate.push({ geo: merged(body), move });
        if (i % 2) rings.push({ geo: new THREE.TorusGeometry(r + 0.002, 0.004, 4, 12), move });
        if (i > 0) spines.push({ geo: place(paint(new THREE.ConeGeometry(0.007, 0.026, 4), BONE), { p: [0, r + 0.008, 0], r: [-0.5, 0, 0] }), move });
      }
      // The head leads the wave: burning eyes, little fangs and three swept-back horns.
      const head = (geo: THREE.BufferGeometry): Mover => ({ geo, move: wave(0.085, 0.026, 0.6, 0.005) });
      plate.push(head(paint(new THREE.SphereGeometry(1, 10, 8), c.color).scale(0.05, 0.042, 0.065)));
      const bone: Part[] = [];
      const eyes: Part[] = [];
      for (const s of [-1, 1]) {
        eyes.push([new THREE.SphereGeometry(0.014, 6, 4), { p: [s * 0.03, 0.018, 0.03] }], [new THREE.SphereGeometry(0.009, 6, 4), { p: [s * 0.038, 0.02, 0.008] }]);
        bone.push([paint(new THREE.ConeGeometry(0.004, 0.016, 4), BONE), { p: [s * 0.014, -0.03, 0.05], r: [Math.PI, 0, 0] }]);
        limb(bone, [[s * 0.02, 0.035, 0], [s * 0.035, 0.06, -0.02], [s * 0.035, 0.075, -0.045]], 0.008, 0.002, BONE, 4, 4);
      }
      limb(bone, [[0, 0.04, 0.01], [0, 0.07, -0.005], [0, 0.085, -0.03]], 0.009, 0.002, BONE, 4, 4);
      spines.push(head(merged(bone)));
      const reach = new THREE.Sphere(new THREE.Vector3(0, 0.02, -0.08), 0.32);
      movers(swim, painted('metal'), plate, reach).castShadow = true;
      movers(swim, painted('satin'), spines, reach);
      movers(swim, mat(c.accent, 'glow'), rings, reach);
      movers(swim, mat(EMBER, 'glow'), [head(merged(eyes))], reach);
      // Its embers may clip at the preview's edge rather than shrink the character to fit them.
      sparkles(swim, EMBER, 0.05, 0.2, 3, 1.4).userData.unframed = true;
      break;
    }
    case 'dreamerpet': {
      // Sleepy Dreamer: a little teal Dreamer fast asleep on its own cloud in its own nightcap, Zs rising off it.
      const pet = new THREE.Group();
      pet.scale.setScalar(1.45);
      // Floats 15 cm above its spot (the render's 0), at the Hatchling's height, so in the Wardrobe its cloud passes over the face.
      pet.userData.bob = { base: 0.15, amp: 0.05, smooth: true };
      float.add(pet);
      const cloth: Part[] = [[paint(new THREE.IcosahedronGeometry(0.06, 1), FLUFF), { p: [0, -0.07, 0], s: [1.4, 0.7, 1.2] }]];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        cloth.push([paint(new THREE.IcosahedronGeometry(0.045 + (i % 3) * 0.01, 1), FLUFF), { p: [Math.sin(a) * 0.08, -0.09 + (i % 2) * 0.01, Math.cos(a) * 0.07], s: [1, 0.7, 1] }]);
      }
      limb(cloth, [[0, 0.045, 0], [0.02, 0.1, -0.01], [0.07, 0.11, -0.01], [0.1, 0.07, 0]], 0.05, 0.01, c.color, 10, 8);
      cloth.push([paint(new THREE.IcosahedronGeometry(0.02, 1), FLUFF), { p: [0.105, 0.055, 0] }], [paint(new THREE.TorusGeometry(0.052, 0.012, 5, 16), FLUFF), { p: [0, 0.045, 0], r: [H, 0, 0] }]);
      addMany(pet, painted('cloth'), cloth);
      const skin: Part[] = [
        [paint(new THREE.SphereGeometry(0.075, 12, 8), c.color), { p: [0, -0.01, 0], s: [1, 0.85, 1] }],
        [paint(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, H * 1.15, H * 0.85), DRE_BELLY), { p: [0, -0.012, 0], s: [0.077, 0.066, 0.077] }],
      ];
      for (const x of [-0.05, 0.05]) limb(skin, [[x, -0.04, 0.05], [x * 1.4, -0.08, 0.09], [x * 1.4, -0.14, 0.09]], 0.009, 0.003, DRE_LIGHT, 6, 4);
      addMany(pet, painted('satin'), skin);
      // Shut eyes and rising Zs share one glowing mesh.
      const shut: Part[] = [];
      for (const s of [-1, 1]) lashes(shut, [s * 0.03, 0, 0.068], s * 0.35, 0.014);
      const zs = movers(pet, mat(c.accent, 'glow'), [0, 1].map((i): Mover => ({ geo: zee(0.025 - i * 0.006), move: rising(0.06 + i * 0.03, 0.02, 0.08, 0.2, 0.4, i / 2) })), new THREE.Sphere(new THREE.Vector3(0.05, 0.1, 0), 0.25), shut);
      zs.userData.unframed = true;
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
  /**
   * For effects that must clear the outfit (`Character.extent`): the highest point as it is, and how far the outfit
   * reaches along x or z, whichever is more (the box round it, which is what the emote looks were designed against).
   */
  high: number;
  wide: number;
  /**
   * For things held in front of the body (the campfire band's instruments): how far forward (+z) the piece reaches
   * over the chest (`CHEST`), and over the lower face where something is held to the mouth (`MOUTH`).
   */
  front: number;
  face: number;
}
const NO_BOUNDS: Bounds = { reach: 0, top: 0, low: 2, high: 0, wide: 0, front: 0, face: 0 };
/** The heights (m, at rest) between which a piece counts as in front of the chest, and of the mouth. */
const CHEST: [number, number] = [0.45, 1.4];
const MOUTH: [number, number] = [1.42, 1.66];

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
        b.high = Math.max(b.high, v.y);
        b.wide = Math.max(b.wide, Math.abs(v.x), Math.abs(v.z));
        if (v.y > CHEST[0] && v.y < CHEST[1]) b.front = Math.max(b.front, v.z);
        if (v.y > MOUTH[0] && v.y < MOUTH[1]) b.face = Math.max(b.face, v.z);
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
    building = c.id;
    try {
      MODELS[c.slot](c, t);
    } finally {
      building = '';
    }
    t.userData.bounds = boundsOf(t);
    TEMPLATES.set(c.id, t);
  }
  return t.clone();
}

/** A character wearing a piece the player hasn't reached yet is drawn in one flat dark colour, glows hidden (Reed's Wardrobe tab). */
const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x3a4250, side: THREE.DoubleSide });
function silhouette(piece: THREE.Object3D): void {
  piece.traverse((o) => {
    // Halos, and meshes that are only light (`glowDots`, a glow on the ground), would be dark squares and discs.
    if (o instanceof THREE.Sprite || o.userData.light) o.visible = false;
    else if (o instanceof THREE.Mesh) o.material = SILHOUETTE;
  });
}

const PET_GOAL = new THREE.Vector3();
const REST = restPose();

/**
 * The bare character's top (the head's) and how far its body reaches from its centre line, in metres; and how far
 * forward its chest and its face reach (`Bounds.front`, `Bounds.face`).
 */
const BARE = { top: 1.82, reach: 0.28, front: 0.28, face: 0.2 };

/** A character facing +z, about 1.9 tall, without held items. `set` swaps the body color and outfit. */
export class Character {
  readonly group = new THREE.Group();
  /**
   * The body, head and outfit, which an emote's pose moves as one piece (`pose`). A live character's pet and ground
   * effects sit beside it in `loose`, so a leaning or hopping body doesn't drag them along.
   */
  private poser = new THREE.Group();
  private loose = new THREE.Group();
  /** A playing emote's own objects (`EmotePlay.group`), in the character's space; the pose doesn't move them. */
  readonly effects = new THREE.Group();
  /** The top of the character with its outfit, how far the outfit reaches out, and how far forward over the chest and the face, without the pet (`EmoteCtx`). */
  extent = { ...BARE };
  /** What the character wears now (`set`). */
  look!: Look;
  private bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  private body = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), this.bodyMat);
  /** Skin and face come from the face texture, so the material stays white. */
  private headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  private head = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.SphereGeometry(0.2, 12, 10), this.headMat);
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
  /** The worn items with shared animations (`animated`), moved in `tick`. */
  private animIds: string[] = [];
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
    this.poser.add(this.body, this.head, this.outfit);
    this.group.add(this.poser, this.loose, this.effects);
    this.set(look);
  }

  /**
   * `shadow` lists items the player hasn't reached yet: wearing any of them draws the whole character as a silhouette
   * (`silhouette`), body, head and outfit, so the piece is a shape to look forward to (Oscar, 2026-11-14).
   */
  set(look: Look, shadow: readonly string[] = []): void {
    const key = JSON.stringify(look) + shadow.join();
    if (key === this.key) return;
    this.key = key;
    this.look = look;
    this.bodyMat.color.setHex(look.color);
    const head = this.headMat;
    head.map = faceTexture(look.face);
    head.needsUpdate = true;
    // Pieces are clones of shared templates, so there is nothing to dispose.
    this.outfit.clear();
    this.loose.clear();
    this.extent = { ...BARE };
    this.spinners = [];
    this.swayers = [];
    this.bobbers = [];
    this.grounded = [];
    this.pet = null;
    this.animIds = [];
    const b = { ...NO_BOUNDS };
    for (const slot of COS_SLOTS) {
      const c = cosById(look[slot]);
      if (!c) continue;
      const piece = outfitPiece(c);
      if (SHARED_ANIM.has(c.id)) this.animIds.push(c.id);
      const ground: THREE.Object3D[] = [];
      piece.traverse((o) => {
        if (o.userData.spin) this.spinners.push(o);
        if (o.userData.sway) this.swayers.push(o);
        if (o.userData.bob) this.bobbers.push(o);
        if (o.userData.ground) {
          if (this.live) ground.push(o);
          else o.visible = false;
        }
        if (o.userData.follow) this.pet = { o, at: new THREE.Vector3(), yaw: 0, placed: false };
      });
      const pb = piece.userData.bounds as Bounds;
      b.reach = Math.max(b.reach, pb.reach);
      b.top = Math.max(b.top, pb.top);
      b.low = Math.min(b.low, pb.low);
      // A live pet trails in the world, and ground effects stay on the ground (pieces sit at the character's origin,
      // so moving one of their parts to `loose` leaves it where it was).
      const free = this.live && slot === 'pet';
      (free ? this.loose : this.outfit).add(piece);
      for (const o of ground) {
        if (!free && o.parent === piece) this.loose.add(o);
        this.grounded.push(o);
      }
      if (slot !== 'pet') {
        const e = this.extent;
        this.extent = { top: Math.max(e.top, pb.high), reach: Math.max(e.reach, pb.wide), front: Math.max(e.front, pb.front), face: Math.max(e.face, pb.face) };
      }
    }
    this.bounds = b;
    // Any unreached piece worn: the whole character goes dark (pieces are fresh clones, so only the body needs restoring).
    const dark = COS_SLOTS.some((slot) => !!look[slot] && shadow.includes(look[slot]!));
    this.body.material = dark ? SILHOUETTE : this.bodyMat;
    this.head.material = dark ? SILHOUETTE : this.headMat;
    if (dark) {
      silhouette(this.outfit);
      silhouette(this.loose);
    }
  }

  /** Moves the body, head and outfit as one piece for an emote (`applyPose`); `null` stands it back at rest. */
  pose(p: EmotePose | null): void {
    applyPose(this.poser, p ?? REST);
  }

  /** Test hook: how high the body's lowest point is in the world now, pose and all (a seated body's should be its seat's top). */
  footY(): number {
    this.group.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(this.body, true).min.y;
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
    animateShared(t, this.animIds);
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

  set(look: Look, shadow: readonly string[] = []): void {
    const was = this.char.bounds;
    this.char.set(look, shadow);
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
