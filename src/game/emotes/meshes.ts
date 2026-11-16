/**
 * The moving parts emote looks are built from (GAME_DESIGN.md §40), each a single draw however many things it shows:
 * rigs merged into one mesh (`Batch`), ribbons (`Strips`) and tubes (`Tubes`) rewritten on the CPU each frame,
 * instanced copies (`Instances`), camera-facing glows in one mesh (`Glows`) and a pool of light on the ground
 * (`floorGlow`), with the helpers that build and paint their geometry. A look writes every frame from `t` alone, so
 * the same moment looks the same on every screen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp01, glowTexture, keep, smoothstep } from './kit';

export const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);

// ---------- geometry helpers (build time) ----------

/**
 * A kelp blade's width along it (Kelp Deep's set, `kelpBlade`): a narrow stalk, a gently rippled edge (the set's four
 * or five ripples a blade, softer on these long blades), narrowing to a rounded tip.
 */
export const bladeWidth = (s: number): number =>
  (1 - 0.3 * s) * (0.92 + 0.08 * Math.sin(s * 28)) * (0.3 + 0.7 * smoothstep(0, 0.12, s)) * (1 - 0.5 * smoothstep(0.85, 1, s));

export type V3 = [number, number, number];

/** Moves a geometry into place: position, rotation (Euler XYZ) and scale. */
export function put(geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc));
  return geo;
}

/** Gives a geometry without an index a plain one, so every part merges (all indexed, fewer vertices to move). */
export function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  return g;
}

/**
 * Strips a geometry to bare positions (indexed, so a frame moves as few vertices as it can; flat shading doesn't need
 * split faces) and paints every vertex one colour (times `k`) and opacity, with a two-number tag `p` (a, b) that the
 * `Batch` deformers read: `a` says which part, `b` how far along it.
 */
export function paint(geo: THREE.BufferGeometry, color: number, alpha = 1, k = 1, a = 0, b: number | ((x: number, y: number, z: number) => number) = 0): THREE.BufferGeometry {
  const g = indexed(geo);
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  const c = new THREE.Color(color).multiplyScalar(k);
  const pos = g.attributes.position;
  const n = pos.count;
  const rgba = new Float32Array(n * 4);
  const tag = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = c.r;
    rgba[i * 4 + 1] = c.g;
    rgba[i * 4 + 2] = c.b;
    rgba[i * 4 + 3] = alpha;
    tag[i * 2] = a;
    tag[i * 2 + 1] = typeof b === 'number' ? b : b(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  g.setAttribute('p', new THREE.BufferAttribute(tag, 2));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('emote look: parts did not merge');
  return g;
}

/**
 * A fish body along z (head at +z) through stations [z, half-height, half-width, y offset], `radial` sides round,
 * back and belly coloured by which half a face is on, with `band(j)` colouring a whole ring. Tagged b = 0 at the snout
 * to 1 at the tail, for the swim.
 */
export function fishBody(st: [number, number, number, number][], radial: number, back: number, belly: number, band: (j: number) => number | null = () => null): THREE.BufferGeometry {
  const pos: number[] = [];
  const cols: number[] = [];
  const C = new THREE.Color();
  const z0 = st[0][0];
  const z1 = st[st.length - 1][0];
  const ring = (j: number, k: number): V3 => {
    const [z, h, w, y] = st[j];
    const a = (k / radial) * TAU;
    return [Math.cos(a) * w, y + Math.sin(a) * h, z];
  };
  for (let j = 0; j < st.length - 1; j++) {
    for (let k = 0; k < radial; k++) {
      const a = ring(j, k);
      const b = ring(j, k + 1);
      const c = ring(j + 1, k);
      const d = ring(j + 1, k + 1);
      const mid = Math.sin(((k + 0.5) / radial) * TAU);
      C.set(band(j) ?? (mid > 0 ? back : belly));
      for (const v of [a, c, b, b, c, d]) {
        pos.push(...v);
        cols.push(C.r, C.g, C.b, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  const n = pos.length / 3;
  const tag = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) tag[i * 2 + 1] = clamp01((z0 - pos[i * 3 + 2]) / (z0 - z1));
  g.setAttribute('p', new THREE.BufferAttribute(tag, 2));
  return indexed(g);
}

/** A leaf or fin: a diamond `w` wide and `l` long along +y, folded down its middle so flat shading gives it two tones. */
export function leaf(w: number, l: number, fold = 0.25): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const f = -w * fold;
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, l * 0.45, f, 0, l, 0, 0, 0, 0, 0, l, 0, w / 2, l * 0.45, f], 3));
  return g;
}

/** Tags a fin or leaf's vertices with b from its z, as `fishBody` does (head at z0, tail at z1). */
export const along = (z0: number, z1: number) => (_x: number, _y: number, z: number) => clamp01((z0 - z) / (z0 - z1));

// ---------- dynamic meshes (rewritten every frame from t) ----------

export type Deform = (v: THREE.Vector3, a: number, b: number) => void;

/**
 * Many small rigs in one merged mesh (jellies, fish): each item's rest shape is kept, and `place` writes it through
 * a matrix (and an optional deformer reading the vertex tags) every frame. One draw for the lot.
 */
export class Batch {
  readonly mesh: THREE.Mesh;
  private readonly rest: Float32Array;
  private readonly tag: Float32Array;
  private readonly rgba: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly from: number[] = [];
  private readonly count: number[] = [];
  private readonly faded: number[] = [];
  private readonly shown: boolean[] = [];
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly v = new THREE.Vector3();
  private colDirty = false;

  constructor(items: THREE.BufferGeometry[], mat: THREE.Material) {
    let at = 0;
    for (const g of items) {
      const n = g.attributes.position.count;
      this.from.push(at);
      this.count.push(n);
      this.faded.push(1);
      this.shown.push(true);
      at += n;
    }
    const geo = merge(items);
    this.rest = Float32Array.from(geo.attributes.position.array as Float32Array);
    this.tag = geo.attributes.p.array as Float32Array;
    geo.deleteAttribute('p');
    this.pos = geo.attributes.position as THREE.BufferAttribute;
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col = geo.attributes.color as THREE.BufferAttribute;
    this.rgba = this.col.array as Float32Array;
    this.alpha0 = new Float32Array(at);
    for (let i = 0; i < at; i++) this.alpha0[i] = this.rgba[i * 4 + 3];
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < items.length; i++) this.hide(i);
  }

  /** Writes item `i` through `m`, bent by `deform`, at `alpha` times its painted opacity. */
  place(i: number, m: THREE.Matrix4, deform: Deform | null = null, alpha = 1): void {
    const e = m.elements;
    const r = this.rest;
    const p = this.pos.array as Float32Array;
    const v = this.v;
    const end = this.from[i] + this.count[i];
    for (let k = this.from[i]; k < end; k++) {
      v.set(r[k * 3], r[k * 3 + 1], r[k * 3 + 2]);
      if (deform) deform(v, this.tag[k * 2], this.tag[k * 2 + 1]);
      const x = v.x;
      const y = v.y;
      const z = v.z;
      p[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      p[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      p[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    this.shown[i] = true;
    if (alpha !== this.faded[i]) {
      this.faded[i] = alpha;
      for (let k = this.from[i]; k < end; k++) this.rgba[k * 4 + 3] = this.alpha0[k] * alpha;
      this.colDirty = true;
    }
  }

  hide(i: number): void {
    if (!this.shown[i]) return;
    this.shown[i] = false;
    (this.pos.array as Float32Array).fill(0, this.from[i] * 3, (this.from[i] + this.count[i]) * 3);
  }

  commit(): void {
    this.pos.needsUpdate = true;
    if (this.colDirty) this.col.needsUpdate = true;
    this.colDirty = false;
  }
}

/**
 * Ribbons (kelp blades, a crest): `n` strips of `segs` segments, each written every frame from its centre line and a
 * half-width vector at each station. Each is folded down its middle by `fold` (a share of its half-width), so flat
 * shading gives a blade two tones and a lighter midrib, like the low-poly leaves. Colours are painted once.
 */
export class Strips {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly Ps: THREE.Vector3[];
  private readonly Ss: THREE.Vector3[];
  private readonly T = new THREE.Vector3();
  private readonly F = new THREE.Vector3();
  private readonly per: number;

  constructor(
    readonly n: number,
    readonly segs: number,
    color: (i: number, s: number, out: THREE.Color) => void,
    mat: THREE.Material,
    readonly fold = 0.35,
  ) {
    this.per = (segs + 1) * 3;
    this.pos = new Float32Array(n * this.per * 3);
    const col = new Float32Array(n * this.per * 3);
    const idx: number[] = [];
    const c = new THREE.Color();
    const m = new THREE.Color();
    for (let i = 0; i < n; i++)
      for (let j = 0; j <= segs; j++) {
        color(i, j / segs, c);
        m.copy(c).lerp(WHITE, 0.18);
        const v = i * this.per + j * 3;
        col.set([c.r, c.g, c.b, m.r, m.g, m.b, c.r, c.g, c.b], v * 3);
        if (j < segs) idx.push(v, v + 1, v + 3, v + 1, v + 4, v + 3, v + 1, v + 2, v + 4, v + 2, v + 5, v + 4);
      }
    this.Ps = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    this.Ss = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** Writes strip `i` from `f(i, s, centre, halfWidth)` at s = 0..1 along it. */
  write(i: number, f: (i: number, s: number, P: THREE.Vector3, S: THREE.Vector3) => void): void {
    const { segs, Ps, Ss, T, F } = this;
    for (let j = 0; j <= segs; j++) f(i, j / segs, Ps[j], Ss[j]);
    const p = this.pos;
    for (let j = 0; j <= segs; j++) {
      const P = Ps[j];
      const S = Ss[j];
      T.subVectors(Ps[Math.min(segs, j + 1)], Ps[Math.max(0, j - 1)]);
      F.crossVectors(S, T);
      const fl = F.length();
      if (fl > 1e-9) F.multiplyScalar((this.fold * S.length()) / fl);
      const v = (i * this.per + j * 3) * 3;
      p[v] = P.x + S.x;
      p[v + 1] = P.y + S.y;
      p[v + 2] = P.z + S.z;
      p[v + 3] = P.x + F.x;
      p[v + 4] = P.y + F.y;
      p[v + 5] = P.z + F.z;
      p[v + 6] = P.x - S.x;
      p[v + 7] = P.y - S.y;
      p[v + 8] = P.z - S.z;
    }
  }

  hide(i: number): void {
    this.pos.fill(0, i * this.per * 3, (i + 1) * this.per * 3);
  }

  commit(): void {
    this.attr.needsUpdate = true;
  }
}

/**
 * Tubes along curves (tendrils, the oarfish's body): `n` tubes of `segs` segments and `radial` sides with an
 * elliptical section, written every frame from a centre line; after `write`, `st`, `N` and `B` hold that tube's
 * stations and their up and side directions, for things that ride on it.
 */
export class Tubes {
  readonly mesh: THREE.Mesh;
  readonly st: THREE.Vector3[];
  readonly N: THREE.Vector3[];
  readonly B: THREE.Vector3[];
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly R = { h: 0, w: 0 };
  private readonly rh: Float32Array;
  private readonly rw: Float32Array;
  private readonly T = new THREE.Vector3();
  private readonly per: number;
  private readonly cs: Float32Array;
  private readonly sn: Float32Array;

  constructor(
    readonly n: number,
    readonly segs: number,
    readonly radial: number,
    color: (i: number, s: number, k: number, out: THREE.Color) => number,
    mat: THREE.Material,
  ) {
    this.per = (segs + 1) * radial;
    this.pos = new Float32Array(n * this.per * 3);
    const col = new Float32Array(n * this.per * 4);
    const idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++)
      for (let j = 0; j <= segs; j++)
        for (let k = 0; k < radial; k++) {
          const a = color(i, j / segs, k, c);
          const v = i * this.per + j * radial + k;
          col.set([c.r, c.g, c.b, a], v * 4);
          if (j < segs) {
            const b = i * this.per + j * radial + ((k + 1) % radial);
            idx.push(v, v + radial, b, b, v + radial, b + radial);
          }
        }
    this.cs = new Float32Array(radial);
    this.sn = new Float32Array(radial);
    for (let k = 0; k < radial; k++) {
      this.cs[k] = Math.cos((k / radial) * TAU);
      this.sn[k] = Math.sin((k / radial) * TAU);
    }
    this.st = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    this.N = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    this.B = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    this.rh = new Float32Array(segs + 1);
    this.rw = new Float32Array(segs + 1);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /**
   * Writes tube `i` from `f(i, s, centre, radii)` at s = 0..1; `ref` is the direction its section's height leans to
   * (up for a fish, outward for a hanging tendril, so the section never flips).
   */
  write(i: number, f: (i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }) => void, ref: THREE.Vector3 = UP): void {
    const { segs, radial, st, N, B, T, R } = this;
    for (let j = 0; j <= segs; j++) {
      f(i, j / segs, st[j], R);
      this.rh[j] = R.h;
      this.rw[j] = R.w;
    }
    const p = this.pos;
    for (let j = 0; j <= segs; j++) {
      T.subVectors(st[Math.min(segs, j + 1)], st[Math.max(0, j - 1)]);
      if (T.lengthSq() < 1e-12) T.set(0, 0, 1);
      T.normalize();
      N[j].copy(ref).addScaledVector(T, -ref.dot(T));
      if (N[j].lengthSq() < 1e-8) N[j].set(1, 0, 0).addScaledVector(T, -T.x);
      N[j].normalize();
      B[j].crossVectors(T, N[j]).normalize();
      const c = st[j];
      for (let k = 0; k < radial; k++) {
        const x = this.cs[k] * this.rw[j];
        const y = this.sn[k] * this.rh[j];
        const v = (i * this.per + j * radial + k) * 3;
        p[v] = c.x + B[j].x * x + N[j].x * y;
        p[v + 1] = c.y + B[j].y * x + N[j].y * y;
        p[v + 2] = c.z + B[j].z * x + N[j].z * y;
      }
    }
  }

  hide(i: number): void {
    this.pos.fill(0, i * this.per * 3, (i + 1) * this.per * 3);
  }

  commit(): void {
    this.attr.needsUpdate = true;
  }
}

const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

/** Instanced copies of one shape (bubbles, floats, glints), each placed every frame; scale 0 hides one. */
export class Instances {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly n: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, ZERO_M);
  }

  /** Places copy `i`: at (x, y, z), scaled, and turned (Euler XYZ, as an `Object3D`'s rotation). */
  set(i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0): void {
    if (sx <= 1e-4 || sy <= 1e-4) {
      this.mesh.setMatrixAt(i, ZERO_M);
      return;
    }
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this.mesh.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)));
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Soft glows facing the camera, any number in one draw: quads whose corners the vertex shader spreads toward the viewer. */
const GLOW_VERT = /* glsl */ `
  attribute vec2 corner;
  attribute float size;
  attribute vec4 tint;
  varying vec2 vUv;
  varying vec4 vTint;
  #include <fog_pars_vertex>
  void main() {
    vUv = corner + 0.5;
    vTint = tint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    mvPosition.xy += corner * size;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const GLOW_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vTint;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(vTint.rgb, texture2D(map, vUv).a * vTint.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor.a *= 1.0 - fogFactor;
    #endif
  }`;
const glowMats: Partial<Record<'add' | 'soft', THREE.ShaderMaterial>> = {};
/** At night glows add light; by day they're soft pastel dots laid over the scene, since added light vanishes on a bright sky. */
function glowMaterial(dark: number): THREE.ShaderMaterial {
  const key = dark > 0.5 ? 'add' : 'soft';
  const m = (glowMats[key] ??= keep(
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: key === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    }),
  ));
  m.uniforms.map.value = glowTexture();
  return m;
}

export class Glows {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly tint: Float32Array;
  private readonly attrs: THREE.BufferAttribute[];
  /** How strong glows are drawn: full at night, a little softer as pastel dots by day. */
  private readonly gain: number;

  constructor(readonly n: number, dark: number) {
    this.pos = new Float32Array(n * 12);
    this.size = new Float32Array(n * 4);
    this.tint = new Float32Array(n * 16);
    const corner = new Float32Array(n * 8);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      corner.set([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], i * 8);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const geo = new THREE.BufferGeometry();
    this.attrs = [
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
      new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage),
    ];
    geo.setAttribute('position', this.attrs[0]);
    geo.setAttribute('size', this.attrs[1]);
    geo.setAttribute('tint', this.attrs[2]);
    geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, glowMaterial(dark));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.gain = dark > 0.5 ? 1 : 0.8;
  }

  set(i: number, x: number, y: number, z: number, size: number, c: THREE.Color, a: number): void {
    const al = a * this.gain;
    if (al <= 0.002 || size <= 0) {
      this.hide(i);
      return;
    }
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      this.pos[v * 3] = x;
      this.pos[v * 3 + 1] = y;
      this.pos[v * 3 + 2] = z;
      this.size[v] = size;
      this.tint[v * 4] = c.r;
      this.tint[v * 4 + 1] = c.g;
      this.tint[v * 4 + 2] = c.b;
      this.tint[v * 4 + 3] = al;
    }
  }

  hide(i: number): void {
    this.size.fill(0, i * 4, i * 4 + 4);
    this.tint.fill(0, i * 16, i * 16 + 16);
  }

  commit(): void {
    for (const a of this.attrs) a.needsUpdate = true;
  }
}

/**
 * How far a pool of light lies over the feet, in metres: clear of the town's cobbles, which are laid 4 cm above the
 * ground the player stands on (`COBBLE_LIFT`, town.ts) and would bury a pool laid any lower.
 */
const POOL_LIFT = 0.06;

/** A soft pool of light on the ground (like the Drift Tunic's), its opacity set each frame. */
export function floorGlow(radius: number, color: number, dark: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
  const mat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity: 0,
    blending: dark > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2), mat);
  m.position.y = POOL_LIFT;
  m.renderOrder = 1;
  return m;
}

// ---------- shared materials and rigs ----------

/** Kelp and fish: flat-shaded, painted per vertex, both faces; a faint glow of their own, more at night. */
export function paintedMat(dark: number, emissive = 0x000000, glow = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    flatShading: true,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: glow * (0.4 + 0.6 * dark),
  });
}

/** Bends a fish side to side down its body as it swims: phase `w`, amplitude `amp` (body lengths) at the tail. */
export function swimDeformer(): { w: number; amp: number; fn: Deform } {
  const s = {
    w: 0,
    amp: 0.08,
    fn: (v: THREE.Vector3, _a: number, b: number) => {
      v.x += Math.sin(s.w - b * 4.5) * s.amp * b * b * 1.6;
    },
  };
  return s;
}

const ORIGIN = new THREE.Vector3();
const BANK = new THREE.Matrix4();
const SCALE = new THREE.Vector3();
/** Puts a fish (or anything facing +z) at `p` heading along `dir`, `size` long, banked by `bank`. */
export function heading(m: THREE.Matrix4, p: THREE.Vector3, dir: THREE.Vector3, size: number, bank = 0): THREE.Matrix4 {
  m.identity().lookAt(dir, ORIGIN, UP);
  if (bank) m.multiply(BANK.makeRotationZ(bank));
  m.scale(SCALE.set(size, size, size));
  return m.setPosition(p);
}
