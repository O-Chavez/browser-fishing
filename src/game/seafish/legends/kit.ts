import * as THREE from 'three';
import type { FishLook } from '../../../data/fishlook';

// Shared tools for the legends' models: a body built along a profile, tapered tubes, kelp blades, spikes, painted
// (vertex-coloured) parts merged into a few meshes, eyes with lids, and glints. Everything a legend builds is merged
// by material and cached per species, so a legend stays a few dozen draw calls.

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
export const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);
/** A bump of height 1 centred on `c`, `w` wide (a Gaussian). */
export const bump = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));

export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- what a legend is given, and what it provides ----------

/** What a legend's builder gets from `buildFish`. Parts go on `root`, which turns with the body. */
export interface LegendCtx {
  root: THREE.Object3D;
  /** The tail's pivot at the tail root (z = 0.47): parts on it wag. */
  tail: THREE.Group;
  /** The look the model is built from: a shiny's too, which keeps the legend's own colours. */
  look: FishLook;
  id: string;
  /** True for the dark underwater silhouette: only `bodyMat` and `finMat` (its two flat materials) may be used. */
  shadow: boolean;
  accent: THREE.Color;
  bodyMat: THREE.Material;
  finMat: THREE.Material;
  body: THREE.Mesh;
  /** Additive glow materials here breathe; objects in `twinkle` sparkle. */
  pulse: THREE.Material[];
  twinkle: THREE.Object3D[];
  glowTexture: () => THREE.Texture;
  /** The legend's `light` (1 for the silhouette): pass it to `MAT` and `lit` for every lit material made here. */
  light: number;
}

/** What a legend's skin painter gets: the canvas in the skin's 512 x 256 units, and where u, v land on it. */
export interface PaintCtx {
  g: CanvasRenderingContext2D;
  /** u runs around the body (0.25 belly, 0.75 back, 0 and 0.5 the flanks), v from nose (0) to tail (1). */
  X: (u: number) => number;
  Y: (v: number) => number;
  W: number;
  H: number;
  rng: () => number;
  /** True for the glow layer (the emissive map): black, with only what glows painted in. */
  glow: boolean;
  look: FishLook;
  /** A colour as CSS. */
  ink: (c: number, a?: number) => string;
  /**
   * Draws on both flanks: `fn` gets P(d, v), the canvas point `d` of the way around above the side line
   * (0.25 the back, -0.25 the belly) at v along the body.
   */
  flanks: (fn: (P: (d: number, v: number) => [number, number]) => void) => void;
}

export interface Legend {
  /** Changes to the species' look for the 3D model (the icon keeps the plain look). */
  look?: Partial<FishLook>;
  /** The body's geometry, 1 long, nose at z = -0.5. */
  body: () => THREE.BufferGeometry;
  /** Paints over the skin after the look's marks. */
  paint?: (p: PaintCtx) => void;
  /** True when `paint` draws on the glow layer too. */
  glow?: boolean;
  /** Fins, face, parts, tackle and lights; with `ctx.shadow`, the silhouette's parts. */
  build: (ctx: LegendCtx) => void;
  /**
   * How bright its lit materials are made (1: as painted): each multiplies its colour by this, skin and vertex colours
   * alike, while unlit paint (eyes, lamp cores) and additive glows keep theirs. A legend whose paint is dark (a near-black
   * angler, an old olive grouper) would read as a black blob in the sea's light, so it is made brighter than its paint.
   */
  light?: number;
}

// ---------- the skin ----------

const TEX_W = 512;
const TEX_H = 256;
const skins = new Map<string, THREE.CanvasTexture>();
/**
 * A legend's painted skin, or with `glow` its glow layer (black, with only what glows painted in). The base is the
 * plain fish's countershading, dark back to pale belly; the legend paints the rest. A legend is seen big and close,
 * so its canvas is four times finer than a plain fish's, drawn in the same 512 x 256 units.
 */
export function legendSkin(legend: Legend, look: FishLook, id: string, glow: boolean): THREE.CanvasTexture {
  const key = `${id}|${glow}`;
  let t = skins.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = TEX_W * 2;
  c.height = TEX_H * 4;
  const g = c.getContext('2d')!;
  g.scale(2, 4);
  const X = (u: number) => (((u % 1) + 1) % 1) * TEX_W;
  const Y = (v: number) => (1 - v) * TEX_H;
  const ink = (col: number, a = 1) => {
    const k = new THREE.Color(col);
    return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`;
  };
  if (glow) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, TEX_W, TEX_H);
  } else {
    const grad = g.createLinearGradient(0, 0, TEX_W, 0);
    for (const [u, k] of [[0, 0.5], [0.25, 0], [0.5, 0.5], [0.75, 1], [1, 0.5]] as [number, number][]) {
      grad.addColorStop(u, ink(new THREE.Color(look.belly).lerp(new THREE.Color(look.back), smooth(k, 0.15, 0.85)).getHex()));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, TEX_W, TEX_H);
  }
  const flanks = (fn: (P: (d: number, v: number) => [number, number]) => void) => {
    // The right flank is centred on u = 0.5; the left on the seam (u = 0), so it is drawn at both edges.
    fn((d, v) => [(0.5 + d) * TEX_W, Y(v)]);
    fn((d, v) => [-d * TEX_W, Y(v)]);
    fn((d, v) => [(1 - d) * TEX_W, Y(v)]);
  };
  legend.paint?.({ g, X, Y, W: TEX_W, H: TEX_H, rng: seeded(id), glow, look, ink, flanks });
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  skins.set(key, t);
  return t;
}

// ---------- geometry ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** A copy of `g` scaled, turned (Euler XYZ) and moved. */
export function put(g: THREE.BufferGeometry, p: THREE.Vector3 | [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] | number = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? V(s, s, s) : V(...s);
  _m.compose(Array.isArray(p) ? V(...p) : p, _q.setFromEuler(_e.set(...r)), sc);
  return g.clone().applyMatrix4(_m);
}

const _up = V(0, 1, 0);
/** A copy of `g` (built pointing up +Y from the origin) aimed along `dir`, scaled and moved to `p`. */
export function aim(g: THREE.BufferGeometry, p: THREE.Vector3, dir: THREE.Vector3, s: [number, number, number] | number = 1, twist = 0): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? V(s, s, s) : V(...s);
  _q.setFromUnitVectors(_up, dir.clone().normalize());
  if (twist) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, twist));
  _m.compose(p, _q, sc);
  return g.clone().applyMatrix4(_m);
}

/** Paints a whole geometry one colour (a vertex colour), or root to tip along +Y between `y0` and `y1`. */
export function tint(g: THREE.BufferGeometry, c: number, tip?: number, y0 = 0, y1 = 1): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  const ca = new THREE.Color(c);
  const cb = tip === undefined ? ca : new THREE.Color(tip);
  const k = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const s = tip === undefined ? 0 : clamp((g.attributes.position.getY(i) - y0) / (y1 - y0), 0, 1);
    k.copy(ca).lerp(cb, s);
    a[i * 3] = k.r;
    a[i * 3 + 1] = k.g;
    a[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Merges painted parts into one geometry of positions, normals and colours (parts without a colour come out white). */
export function fuse(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  const parts = list.map((g0) => {
    let g = g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) g = g.toNonIndexed();
    n += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3).fill(1);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o);
    nor.set(g.attributes.normal.array as Float32Array, o);
    if (g.attributes.color) col.set(g.attributes.color.array as Float32Array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** A flat shape from 2D points (x toward the tail, y up), standing in the YZ plane. */
export function flat(pts: [number, number][]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ShapeGeometry(s).rotateY(-Math.PI / 2);
  g.deleteAttribute('uv');
  return g;
}

/**
 * A fin as a fan of rays from a root line: each ray runs from `root(k)` to `tip(k)` (k 0..1 along the fin, points
 * as [toward the tail, up]) in the YZ plane, painted root colour to edge colour. `bow` bends the fin out of its
 * plane so it catches the light.
 */
export function finFan(n: number, root: (k: number) => [number, number], tip: (k: number) => [number, number], c0: number, c1: number, bow = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const a = new THREE.Color(c0);
  const b = new THREE.Color(c1);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const r = root(k);
    const t = tip(k);
    pos.push(0, r[1], r[0], bow * Math.sin(k * Math.PI), t[1], t[0]);
    col.push(a.r, a.g, a.b, b.r, b.g, b.b);
    if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A tube along points, `radius(s)` thick at s (0..1) along it. `curve` > 0 smooths the path into that many steps. */
export function tube(pts: THREE.Vector3[], radius: number | ((s: number) => number), sides = 5, curve = 0): THREE.BufferGeometry {
  const path = curve > 0 ? new THREE.CatmullRomCurve3(pts).getPoints(curve) : pts;
  const rad = typeof radius === 'number' ? () => radius : radius;
  const n = path.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const tan = V(0, 0, 0);
  let nor = V(0, 0, 0);
  const bin = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    tan.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
    if (i === 0) {
      nor = Math.abs(tan.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    }
    nor.addScaledVector(tan, -nor.dot(tan)).normalize();
    bin.crossVectors(tan, nor);
    const r = rad(i / (n - 1));
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      pos.push(path[i].x + nor.x * c + bin.x * s, path[i].y + nor.y * c + bin.y * s, path[i].z + nor.z * c + bin.z * s);
    }
    if (i) {
      for (let j = 0; j < sides; j++) {
        const a0 = (i - 1) * sides + j;
        const a1 = (i - 1) * sides + ((j + 1) % sides);
        const b0 = i * sides + j;
        const b1 = i * sides + ((j + 1) % sides);
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  // Close the ends.
  for (const [i, flip] of [[0, false], [n - 1, true]] as const) {
    const c = pos.length / 3;
    pos.push(path[i].x, path[i].y, path[i].z);
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      if (flip) idx.push(c, a, b);
      else idx.push(c, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A spike `len` long and `r` wide at its base, from `p` along `dir`. */
export function spike(p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, sides = 5): THREE.BufferGeometry {
  return aim(new THREE.ConeGeometry(1, 1, sides).translate(0, 0.5, 0).deleteAttribute('uv'), p, dir, [r, len, r]);
}

/**
 * A kelp blade: a ruffled strip along a path, `w(s)` half-wide across `across`, painted `c0` at the root to `c1`
 * at the tip with a darker midrib. `ruffle` waves its edges.
 */
export function blade(path: THREE.Vector3[], w: (s: number) => number, across: THREE.Vector3, c0: number, c1: number, ruffle = 0.3, waves = 5, phase = 0): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const a = new THREE.Color(c0);
  const b = new THREE.Color(c1);
  const k = new THREE.Color();
  const tan = V(0, 0, 0);
  const side = V(0, 0, 0);
  const out = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    tan.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
    side.copy(across).addScaledVector(tan, -across.dot(tan)).normalize();
    out.crossVectors(tan, side);
    const hw = w(s);
    for (let j = -1; j <= 1; j++) {
      // The edges ripple out of the blade's plane, each to its own beat.
      const rip = j ? Math.sin(s * waves * Math.PI * 2 + phase + (j > 0 ? 1.9 : 0)) * ruffle * hw : 0;
      const wid = j * hw * (1 + (j ? 0.18 * Math.sin(s * waves * 1.7 * Math.PI * 2 + phase + j) : 0));
      pos.push(path[i].x + side.x * wid + out.x * rip, path[i].y + side.y * wid + out.y * rip, path[i].z + side.z * wid + out.z * rip);
      k.copy(a).lerp(b, s).multiplyScalar(j ? 1 : 0.72);
      col.push(k.r, k.g, k.b);
    }
    if (i) {
      const p0 = (i - 1) * 3;
      const p1 = i * 3;
      idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1, p0 + 1, p1 + 1, p0 + 2, p0 + 2, p1 + 1, p1 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A curved path of `n` steps from `p`: heading `dir`, bending toward `bend` as it goes, `len` long, with a sway. */
export function sweep(p: THREE.Vector3, dir: THREE.Vector3, bend: THREE.Vector3, len: number, n = 6, sway = 0, phase = 0, swayDir?: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [p.clone()];
  const d = dir.clone().normalize();
  const cur = p.clone();
  const sd = swayDir ?? V(1, 0, 0);
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    d.addScaledVector(bend, 1 / n).normalize();
    cur.addScaledVector(d, len / n);
    out.push(cur.clone().addScaledVector(sd, Math.sin(s * 5 + phase) * sway * s));
  }
  return out;
}

// ---------- the body ----------

/**
 * A body's profile: how far the back and the belly are from the centre line and how wide it is at t (0 nose, 1 tail),
 * and where the centre line is (a bent body).
 */
export interface Frame {
  top: (t: number) => number;
  bot: (t: number) => number;
  half: (t: number) => number;
  cy?: (t: number) => number;
}

/** A point on the skin at t, `a` radians below the side line (negative: above) on one side, pushed out by `lift`. */
export function surf(f: Frame, t: number, a: number, side: number, lift = 1): THREE.Vector3 {
  const s = Math.sin(a);
  return V(side * Math.cos(a) * f.half(t) * lift, -s * (s > 0 ? f.bot(t) : f.top(t)) * lift + (f.cy?.(t) ?? 0), -0.5 + t);
}

/** The outward direction of the skin at that point. */
export function surfNormal(f: Frame, t: number, a: number, side: number): THREE.Vector3 {
  const e = 0.004;
  const p = surf(f, t, a, side);
  const da = surf(f, t, a + e, side).sub(p);
  const dt = surf(f, Math.min(0.999, t + e), a, side).sub(p);
  const n = da.cross(dt).normalize();
  // Outward: away from the centre line.
  const c = V(0, f.cy?.(t) ?? 0, -0.5 + t);
  if (n.dot(p.clone().sub(c)) < 0) n.negate();
  return n;
}

/** The sine-power thickness curve the plain fish use: 0 at the nose, 1 at `peak`, tapering to the tail. */
export function env(t: number, peak: number, front: number, back: number, tailMin = 0): number {
  const u = t < peak ? (0.5 * t) / peak : 0.5 + (0.5 * (t - peak)) / (1 - peak);
  return Math.max(t > 0.5 ? tailMin : 0, Math.pow(Math.max(0, Math.sin(Math.PI * u)), t < peak ? front : back));
}

/**
 * The body's mesh from its profile, with the plain fish's skin mapping (u around: 0.25 belly, 0.75 back; v nose to
 * tail), so the painted skin lands the same way.
 */
export function bodyGeo(f: Frame, rings = 44, around = 28): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    // Rings bunch a little toward the nose and tail, where the body curves fastest.
    const t = lerp(s, 0.5 - 0.5 * Math.cos(Math.PI * s), 0.55);
    const end = i === 0 || i === rings;
    const cy = f.cy?.(t) ?? 0;
    for (let j = 0; j <= around; j++) {
      const u = j / around;
      const phi = u * Math.PI * 2;
      const nx = -Math.cos(phi);
      const ny = -Math.sin(phi);
      pos.push(end ? 0 : nx * f.half(t), (end ? 0 : ny * (ny > 0 ? f.top(t) : f.bot(t))) + cy, -0.5 + t);
      uv.push(u, t);
      if (i && j) {
        const a = (i - 1) * (around + 1) + j - 1;
        const b = a + 1;
        const c = i * (around + 1) + j - 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The skin's seam runs down one flank: give both of its edges one normal so no line shows.
  const nrm = g.attributes.normal;
  const a = V(0, 0, 0);
  for (let i = 0; i <= rings; i++) {
    const i0 = i * (around + 1);
    const i1 = i0 + around;
    a.set(nrm.getX(i0) + nrm.getX(i1), nrm.getY(i0) + nrm.getY(i1), nrm.getZ(i0) + nrm.getZ(i1)).normalize();
    nrm.setXYZ(i0, a.x, a.y, a.z);
    nrm.setXYZ(i1, a.x, a.y, a.z);
  }
  return g;
}

// ---------- caches and materials ----------

const geos = new Map<string, THREE.BufferGeometry>();
/** Builds a species' merged part once (held for every model of the kind, so `disposeFish` leaves it). */
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    geos.set(key, (g = make()));
    g.userData.shared = true;
  }
  return g;
}

const mats = new Map<string, THREE.Material>();
export function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m as T;
}

/** A lit material made `k` times as bright as its paint (`Legend.light`). */
export function lit<T extends THREE.MeshStandardMaterial>(m: T, k: number): T {
  m.color.multiplyScalar(k);
  return m;
}

/** Painted (vertex-coloured) materials, shared by every legend of the same `light` (`k`). */
export const MAT = {
  /** Smooth flesh: lips, lids, jaws. */
  flesh: (k = 1) => mat(`flesh|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), k)),
  /** Hard, faceted things: thorns, horns, barnacles, coral. */
  hard: (k = 1) => mat(`hard|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true }), k)),
  /** Leaves and blades, seen from both sides, with a little light of their own like the kelp frills. */
  leaf: (k = 1) => mat(`leaf|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, flatShading: true, side: THREE.DoubleSide, emissive: 0x18240c }), k)),
  /** Kelp blades: smooth-shaded, seen from both sides, softly lit from within like the zone's frills. */
  kelp: (k = 1) => mat(`kelp|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x16240c }), k)),
  /** Fins: thin and slightly see-through. */
  fin: (k = 1) => mat(`fin|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }), k)),
  /** Unlit paint: eyes, lamp cores. */
  flatPaint: () => mat('paint', () => new THREE.MeshBasicMaterial({ vertexColors: true })),
};

/** An additive glow of one colour that breathes with the fish. */
export function glowMat(ctx: LegendCtx, color: number, opacity: number, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side });
  ctx.pulse.push(m);
  return m;
}

/** A soft round glow sprite. */
export function glowSprite(ctx: LegendCtx, color: number, size: number, opacity: number, p: THREE.Vector3): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  s.position.copy(p);
  ctx.pulse.push(s.material);
  ctx.root.add(s);
  return s;
}

let glintTex: THREE.CanvasTexture | null = null;
/** A four-pointed glint of light. */
function glintTexture(): THREE.CanvasTexture {
  if (glintTex) return glintTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 14);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [w, h] of [[30, 2.6], [2.6, 30]]) {
    g.beginPath();
    g.moveTo(32 - w, 32);
    g.lineTo(32, 32 - h);
    g.lineTo(32 + w, 32);
    g.lineTo(32, 32 + h);
    g.closePath();
    g.fill();
  }
  glintTex = new THREE.CanvasTexture(c);
  glintTex.colorSpace = THREE.SRGBColorSpace;
  return glintTex;
}

/** A glint that sparkles (on metal, a wet edge, a spark). */
export function glint(ctx: LegendCtx, p: THREE.Vector3, size = 0.05, color = 0xffe9a8, opacity = 0.95): void {
  const m = mat(`glint${color}|${opacity}`, () => new THREE.SpriteMaterial({ map: glintTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  // `animateFish` sets a twinkling object's scale outright, so the sprite keeps its size inside a holder.
  const hold = new THREE.Group();
  hold.position.copy(p);
  hold.add(s);
  ctx.root.add(hold);
  ctx.twinkle.push(hold);
}

/** Adds a mesh to the legend. */
export function add(ctx: LegendCtx, g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = ctx.root): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  parent.add(mesh);
  return mesh;
}

// ---------- faces ----------

export interface EyeSpec {
  /** Where the eye sits and which way it looks (outward). */
  p: THREE.Vector3;
  out: THREE.Vector3;
  r: number;
  white?: number;
  /** A coloured iris `iris` of the eye wide (0..1), under the pupil. */
  iris?: number;
  irisR?: number;
  pupil?: number;
  /** Pupil size as a share of the eye, and how far it is squeezed sideways (a slit). */
  pupilR?: number;
  slit?: number;
  /** Where the eye looks, as an offset of the pupil from straight out. */
  look?: THREE.Vector3;
}

/** One eye's painted geometry: a white ball, an iris and a pupil sitting on it. */
export function eyeGeo(e: EyeSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dir = e.out.clone().add(e.look ?? V(0, 0, 0)).normalize();
  const ball = new THREE.SphereGeometry(e.r, 14, 10).deleteAttribute('uv');
  parts.push(tint(ball.translate(e.p.x, e.p.y, e.p.z), e.white ?? 0xf6f6f0));
  const disc = (rad: number, lift: number, c: number, squeeze = 1) => {
    // A shallow cap hugging the ball.
    const g = new THREE.SphereGeometry(e.r * lift, 12, 4, 0, Math.PI * 2, 0, Math.asin(Math.min(1, rad / lift))).deleteAttribute('uv');
    g.scale(squeeze, 1, 1);
    return tint(aim(g, e.p, dir), c);
  };
  if (e.iris !== undefined) parts.push(disc(e.irisR ?? 0.74, 1.03, e.iris));
  parts.push(disc(e.pupilR ?? 0.5, 1.06, e.pupil ?? 0x111111, e.slit ?? 1));
  return fuse(parts);
}

/** A lid over an eye: a cap of skin covering the top of the ball down to `drop` (0 none, 1 half shut), tilted by `tilt`. */
export function lidGeo(e: EyeSpec, drop: number, tilt: number, c: number, fat = 1.14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(e.r * fat, 14, 6, 0, Math.PI * 2, 0, Math.PI * (0.22 + drop * 0.3)).deleteAttribute('uv');
  // The cap's pole points up and a little outward; `tilt` rolls it toward the nose (a frown) or the tail.
  const side = Math.sign(e.out.x) || 1;
  const up = V(side * 0.45, 1, 0).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, up).premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), tilt));
  g.applyQuaternion(q).translate(e.p.x, e.p.y, e.p.z);
  return tint(g, c);
}
