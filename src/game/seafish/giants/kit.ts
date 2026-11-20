// The Abyss legends' modelling kit: vertex-coloured parts gathered into a few merged meshes per creature (one per
// finish), swept tubes with their own frames, and a slow sway run in the vertex shader. Shared by the three legends.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = THREE.Vector3;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;
export const GOLD = 0xffd23a;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** A colour for every corner, or one for the whole part. */
export type Paint = THREE.Color | ((p: V3, i: number) => THREE.Color);
/** How far a corner sways (model units) and its phase: one for the whole part, or by where the corner is. */
export type Sway = [number, number] | ((p: V3) => [number, number]);

const KEEP = new Set(['position', 'normal', 'color', 'sway', 'uv']);

/** Parts of one finish, merged into a single geometry: every part carries a colour and a sway for each corner. */
export class Bucket {
  private gs: THREE.BufferGeometry[] = [];
  /** Moves every part added while it is set, once the part is painted (a body rolled over where it lies). */
  xf: THREE.Matrix4 | null = null;
  constructor(private uv = false) {}

  /** Adds a part. `paint` colours it (or it brings its own `color`); `sway` moves it (or it brings its own, or stays still). */
  put(g: THREE.BufferGeometry, paint?: Paint, sway?: Sway): this {
    if (!g.attributes.normal) g.computeVertexNormals();
    // Parts keep their index (a corner its triangles share is coloured and shaded once); loose triangles get one.
    const o = g;
    const pos = o.attributes.position;
    const n = pos.count;
    const p = V();
    if (paint) {
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const c = paint instanceof THREE.Color ? paint : paint(p.fromBufferAttribute(pos, i), i);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      o.setAttribute('color', new THREE.BufferAttribute(col, 3));
    } else if (!o.attributes.color) throw new Error('a part needs a colour');
    if (sway || !o.attributes.sway) {
      const sw = new Float32Array(n * 2);
      if (sway)
        for (let i = 0; i < n; i++) {
          const s = Array.isArray(sway) ? sway : sway(p.fromBufferAttribute(pos, i));
          sw[i * 2] = s[0];
          sw[i * 2 + 1] = s[1];
        }
      o.setAttribute('sway', new THREE.BufferAttribute(sw, 2));
    }
    for (const k of Object.keys(o.attributes)) if (!KEEP.has(k) || (k === 'uv' && !this.uv)) o.deleteAttribute(k);
    if (this.uv && !o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!o.index) o.setIndex(Array.from({ length: n }, (_, i) => i));
    if (this.xf) o.applyMatrix4(this.xf);
    this.gs.push(o);
    return this;
  }

  /** The merged geometry (the parts are freed), or null with nothing in it. */
  build(): THREE.BufferGeometry | null {
    if (!this.gs.length) return null;
    const g = mergeGeometries(this.gs);
    this.gs.forEach((x) => x.dispose());
    this.gs = [];
    g.userData.shared = true;
    return g;
  }
}

// ---------- frames and sweeps ----------

/** A point on a curve with its frame: tangent `t`, `n` across it (toward the hint) and `b` = t × n; `q` how far along (0..1). */
export interface Frame {
  p: V3;
  t: V3;
  n: V3;
  b: V3;
  q: number;
}

/**
 * Frames along a curve. With `fixed`, `n` leans toward `hint` all the way (a body that keeps its back up); without,
 * it starts toward `hint` and is carried along the curve without twisting (an arm that curls). `ease` above 1 puts
 * the frames closer together toward the end, where a tip curls.
 */
export function frames(curve: THREE.Curve<V3>, segs: number, hint: V3, o: { fixed?: boolean; ease?: number } = {}): Frame[] {
  const out: Frame[] = [];
  let n = V();
  const rot = new THREE.Quaternion();
  for (let i = 0; i <= segs; i++) {
    const q = o.ease ? 1 - Math.pow(1 - i / segs, o.ease) : i / segs;
    const p = curve.getPointAt(q);
    const t = curve.getTangentAt(q).normalize();
    if (i === 0 || o.fixed) n = hint.clone().addScaledVector(t, -hint.dot(t));
    else n.applyQuaternion(rot.setFromUnitVectors(out[i - 1].t, t)).addScaledVector(t, -n.dot(t));
    if (n.lengthSq() < 1e-8) n = Math.abs(t.y) < 0.9 ? V(0, 1, 0).addScaledVector(t, -t.y) : V(1, 0, 0).addScaledVector(t, -t.x);
    n = n.clone().normalize();
    out.push({ p, t, n, b: t.clone().cross(n).normalize(), q });
  }
  return out;
}

/** The frame part-way along (0..1 over the frames' own spacing), blended between its neighbours. */
export function frameAt(fr: Frame[], u: number): Frame {
  const x = clamp01(u) * (fr.length - 1);
  const i = Math.min(fr.length - 2, Math.floor(x));
  const k = x - i;
  const a = fr[i], b = fr[i + 1];
  const t = a.t.clone().lerp(b.t, k).normalize();
  const n = a.n.clone().lerp(b.n, k);
  n.addScaledVector(t, -n.dot(t)).normalize();
  return { p: a.p.clone().lerp(b.p, k), t, n, b: t.clone().cross(n).normalize(), q: mix(a.q, b.q, k) };
}

export interface SweepOpts {
  /** The cross-section's stretch along `n` and along `b`. */
  squash?: [number, number];
  col?: (q: number, a: number) => THREE.Color;
  sway?: (q: number) => [number, number];
  /** Close the start and the end with a flat cap. */
  caps?: [boolean, boolean];
  /** Texture coordinates: u round the section, v along. */
  uv?: boolean;
}

/**
 * A skin round a row of frames: `radial` corners a ring, at radius `rad(q, a)`, where the angle `a` is 0 toward the
 * frame's `n` and grows toward its `b`. Smooth normals.
 */
export function sweep(fr: Frame[], radial: number, rad: (q: number, a: number) => number, o: SweepOpts = {}): THREE.BufferGeometry {
  const [sn, sb] = o.squash ?? [1, 1];
  const pos: number[] = [];
  const col: number[] = [];
  const sw: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const R = radial + 1;
  fr.forEach((f, i) => {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const r = rad(f.q, a);
      const cn = Math.cos(a) * r * sn, cb = Math.sin(a) * r * sb;
      pos.push(f.p.x + f.n.x * cn + f.b.x * cb, f.p.y + f.n.y * cn + f.b.y * cb, f.p.z + f.n.z * cn + f.b.z * cb);
      if (o.col) {
        const c = o.col(f.q, a);
        col.push(c.r, c.g, c.b);
      }
      if (o.sway) sw.push(...o.sway(f.q));
      if (o.uv) uv.push(j / radial, f.q);
      if (i < fr.length - 1 && j < radial) {
        const k = i * R + j;
        idx.push(k, k + 1, k + R, k + 1, k + R + 1, k + R);
      }
    }
  });
  const cap = (f: Frame, ring: number, flip: boolean) => {
    const c = pos.length / 3;
    pos.push(f.p.x, f.p.y, f.p.z);
    if (o.col) {
      const k = o.col(f.q, 0);
      col.push(k.r, k.g, k.b);
    }
    if (o.sway) sw.push(...o.sway(f.q));
    if (o.uv) uv.push(0.5, f.q);
    for (let j = 0; j < radial; j++) {
      const a = ring * R + j;
      if (flip) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  };
  if (o.caps?.[0]) cap(fr[0], 0, true);
  if (o.caps?.[1]) cap(fr[fr.length - 1], fr.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (o.sway) g.setAttribute('sway', new THREE.Float32BufferAttribute(sw, 2));
  if (o.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The ring's first and last corners are one place: give them one normal, so no crease runs down the seam.
  const nor = g.attributes.normal;
  const a = V(), b = V();
  for (let i = 0; i < fr.length; i++) {
    a.fromBufferAttribute(nor, i * R);
    b.fromBufferAttribute(nor, i * R + radial);
    a.add(b).normalize();
    nor.setXYZ(i * R, a.x, a.y, a.z);
    nor.setXYZ(i * R + radial, a.x, a.y, a.z);
  }
  return g;
}

/** A tube along a curve tapering from r0 to r1 (and to a point at the very end with `point`). */
export function tube(curve: THREE.Curve<V3>, r0: number, r1: number, segs: number, radial: number, o: SweepOpts & { hint?: V3; point?: boolean; ease?: number; pow?: number } = {}): THREE.BufferGeometry {
  const fr = frames(curve, segs, o.hint ?? V(0, 1, 0), { ease: o.ease });
  return sweep(fr, radial, (q) => (o.point && q >= 1 ? 0.0004 : mix(r0, r1, Math.pow(q, o.pow ?? 1))), { caps: [true, !o.point], ...o });
}

// ---------- small shapes ----------

/** The turn that takes +z to `z` and +y as near `y` as it will go. */
export function facing(z: V3, y: V3 = V(0, 1, 0)): THREE.Quaternion {
  const zz = z.clone().normalize();
  let xx = y.clone().cross(zz);
  if (xx.lengthSq() < 1e-8) xx = V(1, 0, 0).cross(zz);
  xx.normalize();
  const yy = zz.clone().cross(xx);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
}

/** Places a shape made about the origin: scaled, turned, then moved to `at`. */
export function placed(g: THREE.BufferGeometry, at: V3, q?: THREE.Quaternion, s?: V3 | number): THREE.BufferGeometry {
  if (s !== undefined) typeof s === 'number' ? g.scale(s, s, s) : g.scale(s.x, s.y, s.z);
  if (q) g.applyQuaternion(q);
  return g.translate(at.x, at.y, at.z);
}

/** A cone standing on `base`, pointing along `dir`: spines, fangs, flukes. */
export function cone(base: V3, dir: V3, len: number, r: number, radial = 5, squash = 1): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, radial, 1).translate(0, len / 2, 0).scale(1, 1, squash);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  return g.translate(base.x, base.y, base.z);
}

/** A ball at `at`, stretched by `s` in a frame turned by `q`. */
export function ball(at: V3, s: V3 | number, q?: THREE.Quaternion, w = 8, h = 6): THREE.BufferGeometry {
  return placed(new THREE.SphereGeometry(1, w, h), at, q, s);
}

/** A rod from a to b. */
export function rod(a: V3, b: V3, r0: number, r1 = r0, radial = 6): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** A thin ribbon lying along points with normals, `half` wide each side, narrowing to its ends with `taper`. */
export function ribbon(pts: { p: V3; n: V3 }[], half: number, taper = false, lift = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  pts.forEach((q, j) => {
    const along = pts[Math.min(pts.length - 1, j + 1)].p.clone().sub(pts[Math.max(0, j - 1)].p).normalize();
    const side = along.cross(q.n).normalize();
    const w = half * (taper ? 1 - 0.75 * Math.abs((j / (pts.length - 1)) * 2 - 1) : 1);
    for (const k of [-w, w]) {
      pos.push(q.p.x + side.x * k + q.n.x * lift, q.p.y + side.y * k + q.n.y * lift, q.p.z + side.z * k + q.n.z * lift);
      nor.push(q.n.x, q.n.y, q.n.z);
    }
    if (j < pts.length - 1) {
      const a = j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** A skin over rows of points (each row the same count, running round the same way), flat between them; `wrap` joins each row's ends. */
export function loft(rows: V3[][], wrap = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = rows[0].length;
  const tri = (a: V3, b: V3, c: V3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < (wrap ? n : n - 1); j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % n], c = rows[i + 1][(j + 1) % n], d = rows[i + 1][j];
      tri(a, b, d);
      tri(b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export /** A smooth skin over rows of points (each row the same count), shared corners so it shades softly. */
function grid(rows: V3[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = rows[0].length;
  rows.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n + 1, d = a + n;
      idx.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A fan closing a row of points onto `tip`. */
export function fan(row: V3[], tip: V3, flip = false): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let j = 0; j < row.length; j++) {
    const a = row[j], b = row[(j + 1) % row.length];
    if (flip) pos.push(b.x, b.y, b.z, a.x, a.y, a.z, tip.x, tip.y, tip.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A spark with a point along each axis, `r` from middle to tip: reads as a four-pointed star from any side. */
export function spark(r: number, flat = 0.26): THREE.BufferGeometry {
  const gs = [V(1, flat, flat), V(flat, 1, flat), V(flat, flat, 1)].map((s) => new THREE.OctahedronGeometry(r).scale(s.x, s.y, s.z));
  const g = mergeGeometries(gs);
  gs.forEach((x) => x.dispose());
  return g;
}

/** A length of chain through `pts`: oval links, every other one turned a quarter. */
export function chain(pts: V3[], link: number, wire: number): THREE.BufferGeometry[] {
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, Math.round(path.getLength() / (link * 0.72)));
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const g = new THREE.TorusGeometry(link * 0.3, wire, 4, 8).scale(1, 1.7, 1);
    // The link's long axis (its own y) lies along the chain; every other link is turned about it.
    const t = path.getTangentAt(u);
    const q = facing(t.clone().cross(V(0.3, 1, 0.2)).normalize(), t);
    if (i % 2) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
    out.push(placed(g, path.getPointAt(u), q));
  }
  return out;
}

// ---------- colour ----------

export const hexKey = (c: THREE.Color | number) => (typeof c === 'number' ? c : c.getHex()).toString(16);
/** A palette: colours by hex, gold-washed on a shiny. */
export function palette(shiny: boolean): (c: number, k?: number) => THREE.Color {
  const gold = new THREE.Color(GOLD);
  return (c, k = 1) => {
    const out = new THREE.Color(c);
    if (shiny) out.lerp(gold, 0.55);
    return k === 1 ? out : out.multiplyScalar(k);
  };
}
export const blend = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp01(t));

// ---------- materials ----------

/** The sway's clock, shared by every legend's materials (seconds). */
export const SWAY_T = { value: 0 };

/** Makes a material move each corner by its `sway`: side to side and a little up and down, slowly. */
function swaying<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSwayT = SWAY_T;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec2 sway;\nuniform float uSwayT;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.x += sin(uSwayT * 1.3 + sway.y) * sway.x;\n\ttransformed.y += cos(uSwayT * 1.05 + sway.y * 1.3) * sway.x * 0.6;');
  };
  m.customProgramCacheKey = () => 'legend-sway';
  return m;
}

const mats = new Map<string, THREE.Material>();
function cached<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m as M;
}

/** Faceted, lit, vertex-coloured: armour, bone, wreckage. */
export const hardMat = (rough = 0.5, metal = 0.1) =>
  cached(`hard|${rough}|${metal}`, () => swaying(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: rough, metalness: metal })));
/** Smooth, lit, vertex-coloured: arms, tendrils, lids. `coat` adds a wet gloss; `tint` a faint glow of its own colour. */
export const softMat = (rough = 0.5, coat = 0, side: THREE.Side = THREE.FrontSide, tint = 0) =>
  cached(`soft|${rough}|${coat}|${side}|${tint}`, () =>
    swaying(
      coat
        ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: rough, clearcoat: coat, clearcoatRoughness: 0.35, side, emissive: tint })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, side, emissive: tint }),
    ),
  );
/**
 * Smooth, lit, vertex-coloured and matte, with a soft glow of `rim` round its edges where it turns away from the eye:
 * a body that seems faintly lit from within, without a see-through shell.
 */
export const rimMat = (rough: number, rim: number, power = 2.5) =>
  cached(`rim|${rough}|${rim}|${power}`, () => {
    const m = swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }));
    const sway = m.onBeforeCompile;
    const uRim = { value: new THREE.Color(rim) };
    m.onBeforeCompile = (sh, r) => {
      sway(sh, r);
      sh.uniforms.uRim = uRim;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});`);
    };
    m.customProgramCacheKey = () => `legend-sway-rim|${power}`;
    return m;
  });
/** Unlit and not tone-mapped: what glows keeps its full colour. */
export const glowMat = (side: THREE.Side = THREE.FrontSide) => cached(`glow|${side}`, () => swaying(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side })));
/** A soft additive light laid over the body (seam bloom): thin strips only, never a shell. */
export const bloomMat = (op: number) =>
  cached(`bloom|${op}`, () => swaying(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
/** Writes depth only: drawn ahead of a see-through silhouette so its overlapping parts don't darken each other. */
export const depthOnly = () => cached('depth', () => new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
export const spriteMat = (tex: THREE.Texture, c: THREE.Color, op: number) =>
  cached(`spr|${hexKey(c)}|${op}`, () => new THREE.SpriteMaterial({ map: tex, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
export const plainMat = (c: THREE.Color | number, glow = false) =>
  cached(`plain|${hexKey(c)}|${glow}`, () => new THREE.MeshBasicMaterial({ color: c, toneMapped: !glow }));

const texs = new Map<string, THREE.CanvasTexture>();
/** A painted canvas texture, made once. */
export function painted(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let t = texs.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    texs.set(key, t);
  }
  return t;
}

// ---------- a built legend ----------

/** A legend's parts, made once per look (plain or shiny) and shared by every model of it. */
export interface Built {
  /** The painted body: its geometry (with uvs) and how to finish the body's own material for it. */
  skin?: { geo: THREE.BufferGeometry; finish: (m: THREE.MeshPhysicalMaterial) => void };
  hard?: { geo: THREE.BufferGeometry | null; rough?: number; metal?: number };
  soft?: { geo: THREE.BufferGeometry | null; rough?: number; coat?: number; side?: THREE.Side; tint?: number };
  /** A body lit round its edges from within (`rimMat`). */
  rim?: { geo: THREE.BufferGeometry | null; rough: number; color: number; power?: number };
  glow?: THREE.BufferGeometry | null;
  bloom?: { geo: THREE.BufferGeometry | null; op: number };
  /** Parts on the tail's pivot, which wags; `at` is the pivot. */
  tail?: { at: V3; hard?: THREE.BufferGeometry | null; glow?: THREE.BufferGeometry | null; rough?: number; metal?: number };
  /** A group of lights that turns slowly about its own y: where it sits, how it is tilted, how fast (rad/s). */
  ring?: { at: V3; tilt: THREE.Euler; speed: number; glow: THREE.BufferGeometry | null };
  /** Soft round glows: eyes, a lamp, a furnace mouth. */
  sprites: { at: V3; color: THREE.Color; op: number; size: number }[];
  /** Points that sparkle: glints on old metal, drifting motes. */
  twinkles: { at: V3; color: THREE.Color; r: number; glow: boolean }[];
  /** A plainer outline for the underwater silhouette, where the full detail would cost too much (suckers, lids). */
  shade?: THREE.BufferGeometry | null;
}

/** A dark silhouette of a built legend: every solid part's positions in one geometry (the tail's apart). */
export function silhouette(b: Built): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry | null } {
  const strip = (g: THREE.BufferGeometry) => {
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', (g.index ? g.toNonIndexed() : g).attributes.position.clone());
    return o;
  };
  const gs = (b.shade ? [b.shade] : [b.skin?.geo, b.hard?.geo, b.soft?.geo, b.rim?.geo]).filter((g): g is THREE.BufferGeometry => !!g).map(strip);
  const body = mergeGeometries(gs);
  gs.forEach((g) => g.dispose());
  body.userData.shared = true;
  const tail = b.tail?.hard ? strip(b.tail.hard) : null;
  if (tail) tail.userData.shared = true;
  return { body, tail };
}
