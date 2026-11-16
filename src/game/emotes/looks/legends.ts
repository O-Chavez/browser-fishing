/**
 * The Abyss's legends as emote looks build them (GAME_DESIGN.md §40), in src/data/fishlook.ts's colours, for any look
 * that brings them on: Master of the Deep (`master.ts`) and the Abyss (`abyss.ts`). The Coiled Leviathan as a serpent
 * skinned along a moving spine with its head and hinged jaw riding the front (`leviathanRig`); the Kraken's mantle with
 * its great gold eyes (`krakenMantle`) and its arms as tubes integrated from root to tip (`krakenArmTubes`,
 * `armCurve`); the Drowned Dreamer's face, its lids and slit pupils that track the player (`dreamerFace`,
 * `dreamerEyesRig`) and its tentacles as tubes (`dreamerTentacles`). Also the parts they're built from: `part` and `mergeParts` (one colour a part, many
 * parts a draw), `sweep` (a tapering faceted tube), `spike`, and their materials.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../../env';
import { clamp01, lerp, seedOf, smoothstep } from '../kit';
import { Batch, TAU, Tubes, indexed, type V3 } from '../meshes';

const H = Math.PI / 2;

// ---------- the legends' colours (src/data/fishlook.ts, and their sets in src/game/character.ts) ----------

export const KRAKEN_BACK = 0x6a1a36;
export const KRAKEN_FIN = 0x9a2a50;
export const KRAKEN_TENT = 0x8a2246;
export const KRAKEN_SUCK = 0xffc8d6;
export const KRAKEN_EYE = 0xffc23a;
export const LEV_BACK = 0x2c2c42;
export const LEV_BELLY = 0x4c3c44;
export const LEV_SEAM = 0xff6a1a;
export const LEV_EYE = 0xffb02e;
export const BONE = 0xf4e8cc;
export const DRE_BACK = 0x2c6a5c;
export const DRE_BELLY = 0x9ad8b8;
export const DRE_GLOW = 0x9affd0;
export const DRE_TENT = 0x2f7a62;
/** The Dreamer's cold, unblinking stare: its main eyes paler and colder than its little ones. */
const DRE_COLD = 0xd8fff0;

/** A quick pulse 0 -> 1 -> 0 over `d` seconds from `a` = 0 (sharp rise, softer fall): a snap, a slap, a flinch. */
export const pulse = (a: number, d: number): number => (a <= 0 || a >= d ? 0 : Math.pow(Math.sin(Math.PI * Math.pow(a / d, 0.6)), 1.5));

// ---------- parts ----------

const _o = new THREE.Object3D();

/** Where a part goes: moved to `p`, turned by `r` (Euler XYZ, as an `Object3D`) and scaled by `s`. */
export interface At {
  p?: V3;
  r?: V3;
  s?: number | V3;
}
function xf<T extends THREE.BufferGeometry>(g: T, at: At): T {
  _o.position.set(...(at.p ?? [0, 0, 0]));
  _o.rotation.set(...(at.r ?? [0, 0, 0]));
  if (typeof at.s === 'number') _o.scale.setScalar(at.s);
  else _o.scale.set(...(at.s ?? [1, 1, 1]));
  _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  return g;
}

/**
 * Readies a part for `mergeParts`: not indexed, one colour (times `k`, with alpha) on every vertex, and a uv on every
 * vertex (constant unless `uv` is 'keep'), so parts in different colours share one mesh and one draw.
 */
export function part(geo: THREE.BufferGeometry, color: number, at?: At, opts: { alpha?: number; k?: number; uv?: [number, number] | 'keep' } = {}): THREE.BufferGeometry {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  if (at) xf(g, at);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(color).multiplyScalar(opts.k ?? 1);
  const a = opts.alpha ?? 1;
  const rgba = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) rgba.set([c.r, c.g, c.b, a], i * 4);
  g.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  if (opts.uv !== 'keep') {
    const [u, v] = opts.uv ?? [0, 0.5];
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) uv.set([u, v], i * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return g;
}

/** Merges parts made by `part` into one geometry and frees the parts. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'uv') p.deleteAttribute(k);
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('emote legends: parts would not merge');
  return m;
}

/** Readies a geometry made by `part` / `mergeParts` for a `Batch` (meshes.ts): bare positions and colours, indexed, tagged. */
export function rigPart(geo: THREE.BufferGeometry, a = 0): THREE.BufferGeometry {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'color') geo.deleteAttribute(k);
  indexed(geo);
  const n = geo.attributes.position.count;
  const tag = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) tag[i * 2] = a;
  geo.setAttribute('p', new THREE.BufferAttribute(tag, 2));
  return geo;
}

export interface SweepOpts {
  r0: number;
  r1: number;
  n: number;
  radial: number;
  color: number;
  /** The tube's inner side faces this point; uv v = 0 there (so an emissive map can light one side of it). */
  toward?: THREE.Vector3;
  /** Thickness falls off along the tube as u^taper. */
  taper?: number;
  /** Pale suckers along the inner side, every other ring. */
  sucker?: number;
  alpha?: number;
}

/**
 * A faceted tapering tube along a smooth curve through `pts`, with a rounded tip, as parts for `mergeParts`. Its uv runs
 * (along × 0.48, around), with v = 0 on the side facing `toward`, so an emissive map's left half can light one side of
 * it; the suckers sit at u = 0.75, in its right half.
 */
export function sweep(pts: V3[], o: SweepOpts): THREE.BufferGeometry[] {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const { n, radial } = o;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const D = new THREE.Vector3();
  const S = new THREE.Vector3();
  const prevD = new THREE.Vector3(0, 0, 1);
  const rings: THREE.Vector3[][] = [];
  const centres: { p: THREE.Vector3; d: THREE.Vector3; r: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    if (o.toward) D.copy(o.toward).sub(P);
    else D.copy(prevD);
    D.addScaledVector(T, -D.dot(T));
    if (D.lengthSq() < 1e-6) {
      D.copy(prevD).addScaledVector(T, -prevD.dot(T));
      if (D.lengthSq() < 1e-6) D.set(T.y, -T.x, 0);
    }
    D.normalize();
    prevD.copy(D);
    S.crossVectors(T, D).normalize();
    const r = lerp(o.r0, o.r1, Math.pow(u, o.taper ?? 1));
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j <= o.radial; j++) {
      const th = (j / radial) * TAU;
      ring.push(P.clone().addScaledVector(D, Math.cos(th) * r).addScaledVector(S, Math.sin(th) * r));
    }
    rings.push(ring);
    centres.push({ p: P.clone(), d: D.clone(), r });
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const push = (v: THREE.Vector3, u: number, w: number) => {
    pos.push(v.x, v.y, v.z);
    uv.push(u, w);
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < radial; j++) {
      const a = rings[i][j];
      const b = rings[i][j + 1];
      const c = rings[i + 1][j];
      const d = rings[i + 1][j + 1];
      const u0 = (i / n) * 0.48;
      const u1 = ((i + 1) / n) * 0.48;
      const v0 = j / radial;
      const v1 = (j + 1) / radial;
      push(a, u0, v0);
      push(b, u0, v1);
      push(c, u1, v0);
      push(b, u0, v1);
      push(d, u1, v1);
      push(c, u1, v0);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tube.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const out = [part(tube, o.color, undefined, { uv: 'keep', alpha: o.alpha })];
  const end = centres[n];
  out.push(part(new THREE.SphereGeometry(Math.max(0.006, end.r * 1.1), radial, 3), o.color, { p: end.p.toArray() as V3 }, { uv: [0.48, 0.5], alpha: o.alpha }));
  if (o.sucker !== undefined) {
    for (let i = 2; i < n - 1; i += 2) {
      const c = centres[i];
      const at = c.p.clone().addScaledVector(c.d, c.r * 0.82);
      out.push(part(new THREE.SphereGeometry(c.r * 0.4, 5, 3), o.sucker, { p: at.toArray() as V3 }, { uv: [0.75, 0.5] }));
    }
  }
  return out;
}

/** A cone standing on `p` and pointing along `dir` (spines, horns, fangs). */
export function spike(p: THREE.Vector3, dir: THREE.Vector3, r: number, len: number, color: number, radial = 4): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, radial);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(p.x, p.y, p.z);
  return part(g, color);
}

/** A legend's hide: faceted, a little sheen, painted per vertex; `emissive` lifts it off black (set its intensity each frame). */
export const hideMat = (emissive: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0xc0b8cc, vertexColors: true, flatShading: true, roughness: 0.36, metalness: 0.18, emissive, emissiveIntensity: 0 });
/** A legend's glowing parts (eyes, seams): unlit, painted per vertex; dim them through the material's colour. */
export const glowMat = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });

// ---------- the Coiled Leviathan ----------

/** The Leviathan's head in its own frame (nose +z) at scale `s`, its glowing parts, and its jaw laid out round its hinge. */
function levHeadParts(s: number) {
  const hp: THREE.BufferGeometry[] = [];
  const hg: THREE.BufferGeometry[] = [];
  const jp: THREE.BufferGeometry[] = [];
  const hinge: V3 = [0, -0.07 * s, -0.02 * s];
  hp.push(part(new THREE.SphereGeometry(1, 8, 6), LEV_BACK, { p: [0, 0.04 * s, 0.12 * s], s: [0.24 * s, 0.15 * s, 0.4 * s] }));
  jp.push(part(new THREE.SphereGeometry(1, 7, 4), LEV_BELLY, { p: [0, -0.04 * s, 0.17 * s], s: [0.17 * s, 0.06 * s, 0.32 * s] }));
  hg.push(part(new THREE.SphereGeometry(1, 6, 4), LEV_SEAM, { p: [0, -0.05 * s, 0.14 * s], s: [0.13 * s, 0.035 * s, 0.26 * s] }, { k: 0.95 }));
  for (const sd of [-1, 1]) {
    hp.push(spike(new THREE.Vector3(sd * 0.12 * s, 0.12 * s, -0.05 * s), new THREE.Vector3(sd * 0.4, 0.55, -1), 0.045 * s, 0.34 * s, BONE));
    for (let k = 0; k < 3; k++) {
      hp.push(spike(new THREE.Vector3(sd * (0.08 - k * 0.012) * s, -0.05 * s, (0.42 - k * 0.07) * s), new THREE.Vector3(0, -1, 0.15), 0.018 * s, 0.09 * s, BONE));
      jp.push(spike(new THREE.Vector3(sd * (0.07 - k * 0.012) * s, 0.0, (0.4 - k * 0.07) * s - hinge[2]), new THREE.Vector3(0, 1, 0.1), 0.016 * s, 0.07 * s, BONE));
      hg.push(part(new THREE.SphereGeometry((0.042 - k * 0.008) * s, 6, 4), LEV_EYE, { p: [sd * (0.2 - k * 0.012) * s, (0.09 - k * 0.01) * s, (0.28 - k * 0.1) * s] }, { k: 1.3 }));
    }
    // A scowling brow over the eye row.
    hp.push(part(new THREE.BoxGeometry(0.06 * s, 0.035 * s, 0.3 * s), LEV_BACK, { p: [sd * 0.19 * s, 0.15 * s, 0.2 * s], r: [0.25, 0, -sd * 0.25] }));
  }
  hp.push(spike(new THREE.Vector3(0, 0.16 * s, 0.02 * s), new THREE.Vector3(0, 0.7, -1), 0.05 * s, 0.4 * s, BONE));
  // The jaw parts were laid out from the head's origin: move them to the hinge's frame.
  for (const g of jp) g.translate(-hinge[0], -hinge[1], 0);
  return { hp, hg, jp, hinge };
}

const _SC = new THREE.Vector3();
const _F = new THREE.Vector3();
const _Xa = new THREE.Vector3();
const _Ya = new THREE.Vector3();
const _Ma = new THREE.Matrix4();
const _Mb = new THREE.Matrix4();
const _Mc = new THREE.Matrix4();

/**
 * The Leviathan as a serpent skinned along a moving spine: a faceted slate body (belly below), its head and hinged jaw
 * riding the front of it, bone spines and molten seam rings riding their stations along it, `thick` metres round at
 * the neck. `fill(s, out)` places the spine at s (0 the neck, 1 the tail tip) each frame and `vis(s)` thins it to nothing
 * where it isn't out yet. Three draws: the body, its lit parts, its glowing parts. Set `hide.emissiveIntensity` and
 * `glow.color` each frame for the light it's in. `update` moves it all; or `spine` then `parts`, to aim the head from
 * the spine as it lies this frame.
 */
export function leviathanRig(thick: number, segs: number, fill: (s: number, out: THREE.Vector3) => void, vis: (s: number) => number) {
  const hide = hideMat(0x8a7aa8);
  const glow = glowMat();
  const r = (s: number): number => thick * (0.6 + 0.4 * smoothstep(0, 0.07, s)) * (1 - 0.86 * Math.pow(s, 1.3));
  const body = new Tubes(
    1,
    segs,
    7,
    (_i, _s, k, c) => {
      c.set(Math.sin((k / 7) * TAU) > -0.3 ? LEV_BACK : LEV_BELLY);
      return 1;
    },
    hide,
  );
  const head = levHeadParts(thick / 0.2);
  const SPINES = Array.from({ length: 10 }, (_, i) => 0.07 + i * 0.07);
  const SEAMS = Array.from({ length: 5 }, (_, i) => 0.15 + i * 0.13);
  const lit = new Batch([rigPart(mergeParts(head.hp)), rigPart(mergeParts(head.jp)), ...SPINES.map(() => rigPart(spike(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0, 1, -0.6), 0.32, 1.1, BONE)))], hide);
  const glowB = new Batch([rigPart(mergeParts(head.hg)), ...SEAMS.map(() => rigPart(part(new THREE.TorusGeometry(1.07, 0.17, 4, 12), LEV_SEAM)))], glow);
  const write = (_i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }): void => {
    fill(s, P);
    const k = r(s) * vis(s);
    R.h = k;
    R.w = k * 0.92;
  };
  /** The frame at station j: x across, y the back, z toward the head; scaled by `k`. */
  const frameAt = (j: number, k: number, out: THREE.Matrix4): THREE.Matrix4 => {
    _F.subVectors(body.st[Math.max(0, j - 1)], body.st[Math.min(segs, j + 1)]);
    if (_F.lengthSq() < 1e-10) _F.set(0, 0, 1);
    _F.normalize();
    _Xa.crossVectors(body.N[j], _F);
    if (_Xa.lengthSq() < 1e-10) _Xa.set(1, 0, 0);
    _Xa.normalize();
    _Ya.crossVectors(_F, _Xa);
    return out.makeBasis(_Xa, _Ya, _F).scale(_SC.setScalar(Math.max(k, 1e-4))).setPosition(body.st[j]);
  };
  return {
    meshes: [body.mesh, lit.mesh, glowB.mesh] as THREE.Object3D[],
    hide,
    glow,
    /** The spine as last written: `st[j]` for j = 0 (the neck) to `segs` (the tail tip). */
    body,
    /** Its thickness at s (before `vis`), and its stations. */
    r,
    segs,
    /**
     * Moves it all for this frame: the spine from `fill`, then the head (jaw open by `jaw` radians) and the parts on it.
     * `aim`, when given, places the head instead of the spine's front.
     */
    update(jaw: number, aim?: THREE.Matrix4): void {
      this.spine();
      this.parts(jaw, aim);
    },
    /** The spine alone (so the head can be aimed from it). */
    spine(): void {
      body.write(0, write);
      body.commit();
    },
    /** The head and the parts riding the spine. */
    parts(jaw: number, aim?: THREE.Matrix4): void {
      if (aim) _Ma.copy(aim);
      else frameAt(0, vis(0), _Ma);
      lit.place(0, _Ma);
      glowB.place(0, _Ma);
      _Mb.copy(_Ma).multiply(_Mc.makeTranslation(head.hinge[0], head.hinge[1], head.hinge[2])).multiply(_Mc.makeRotationX(jaw));
      lit.place(1, _Mb);
      SPINES.forEach((u, i) => lit.place(2 + i, frameAt(Math.round(u * segs), r(u) * vis(u), _Ma)));
      SEAMS.forEach((u, i) => glowB.place(1 + i, frameAt(Math.round(u * segs), r(u) * vis(u), _Ma)));
      lit.commit();
      glowB.commit();
    },
  };
}

// ---------- the Kraken ----------

/**
 * The Kraken's mantle risen out of the sea (+z its front): its maroon hood and fins, pale spots, and two great gold eyes
 * with bar pupils under angry lids. Its arms are separate (`krakenArmTubes`), so they can move along their length.
 */
export function krakenMantle(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const body: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const prof = [
    [0.0, 0.0],
    [0.42, 0.1],
    [0.52, 0.55],
    [0.5, 1.1],
    [0.38, 1.6],
    [0.17, 1.95],
    [0.0, 2.05],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  body.push(part(new THREE.LatheGeometry(prof, 9), KRAKEN_BACK, { p: [0, 0.75, -0.2], r: [0.18, 0, 0] }));
  body.push(part(new THREE.SphereGeometry(1, 9, 6), KRAKEN_BACK, { p: [0, 0.75, 0.0], s: [0.48, 0.42, 0.42] }));
  for (const sd of [-1, 1]) {
    body.push(part(new THREE.SphereGeometry(1, 6, 3), KRAKEN_FIN, { p: [sd * 0.4, 2.45, 0.05], s: [0.45, 0.05, 0.27], r: [0.18, sd * 0.3, sd * 0.35] }));
    glow.push(part(new THREE.SphereGeometry(0.19, 10, 8), KRAKEN_EYE, { p: [sd * 0.27, 0.86, 0.33], s: [1, 1, 0.45] }, { k: 1.3 }));
    body.push(part(new THREE.BoxGeometry(0.22, 0.065, 0.05), 0x120810, { p: [sd * 0.27, 0.86, 0.42] }));
    // An angry lid over the top of each eye, high at the outer corner.
    body.push(part(new THREE.BoxGeometry(0.46, 0.15, 0.24), KRAKEN_BACK, { p: [sd * 0.27, 1.02, 0.36], r: [0, 0, sd * 0.38] }));
  }
  const rnd = mulberry(seedOf('kraken-spots'));
  for (let i = 0; i < 12; i++) {
    const a = (rnd() - 0.5) * 2.4;
    const y = 1.3 + rnd() * 1.1;
    const rr = 0.49 - (y - 1.3) * 0.22;
    body.push(part(new THREE.SphereGeometry(0.045, 4, 3), KRAKEN_SUCK, { p: [Math.sin(a) * rr, y, Math.cos(a) * rr - 0.2 + (y - 0.75) * 0.18], s: [1, 1, 0.5] }));
  }
  return { body: mergeParts(body), glow: mergeParts(glow) };
}

/** The Kraken's arms as `n` tubes of `segs` segments, pale suckers on the inside of their curl. */
export function krakenArmTubes(n: number, segs: number): Tubes {
  return new Tubes(
    n,
    segs,
    6,
    (_i, s, k, c) => {
      const j = Math.round(s * segs);
      c.set(k === 3 && j % 2 === 0 && s > 0.08 && s < 0.92 ? KRAKEN_SUCK : k === 2 || k === 4 ? 0x7a1e3e : KRAKEN_TENT);
      return 1;
    },
    hideMat(0xd06a8a),
  );
}

/** How a Kraken arm bends this frame (radians a metre): its rest curve, a wave running out to the tip, the tip's curl, a sideways writhe. */
export interface ArmBend {
  k0: number;
  amp: number;
  freq: number;
  speed: number;
  ph: number;
  curl: number;
  lat: number;
}
const _D = new THREE.Vector3();
const _Bv = new THREE.Vector3();
const _Nv = new THREE.Vector3();
const _Pv = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
/**
 * A Kraken arm's spine, integrated from its root out: at each step it turns about its bending axis by the bend there
 * and about its own normal by the writhe, so the whole length moves and waves run out along it. Writes segs + 1 points
 * (x, y, z each) into `out`.
 */
export function armCurve(out: Float32Array, root: THREE.Vector3, d0: THREE.Vector3, b0: THREE.Vector3, len: number, segs: number, b: ArmBend, t: number): void {
  _D.copy(d0).normalize();
  _Bv.copy(b0).normalize();
  _Pv.copy(root);
  out[0] = _Pv.x;
  out[1] = _Pv.y;
  out[2] = _Pv.z;
  const ds = len / segs;
  for (let j = 1; j <= segs; j++) {
    const s = (j - 0.5) / segs;
    const k = b.k0 + b.amp * (0.35 + s) * Math.sin(TAU * b.freq * s - b.speed * t + b.ph) + b.curl * smoothstep(0.55, 1, s);
    const l = b.lat * (0.3 + s) * Math.sin(TAU * 0.8 * s - b.speed * 0.8 * t + b.ph * 1.7);
    _Nv.crossVectors(_Bv, _D).normalize();
    _q1.setFromAxisAngle(_Bv, k * ds);
    _q2.setFromAxisAngle(_Nv, l * ds);
    _D.applyQuaternion(_q1).applyQuaternion(_q2).normalize();
    _Bv.applyQuaternion(_q2).normalize();
    _Pv.addScaledVector(_D, ds);
    out[j * 3] = _Pv.x;
    out[j * 3 + 1] = _Pv.y;
    out[j * 3 + 2] = _Pv.z;
  }
}

// ---------- the Drowned Dreamer ----------

/**
 * The Drowned Dreamer with a menacing face: its teal bulb, its crowd of little mint eyes, and two great eyes with a cold
 * glow, scowling brows, upper and lower lids that close to slits, and slit pupils; its halo. Tentacles are separate
 * (`dreamerTentacles`), so they can ripple. Laid out with the bulb's centre at y 1.85, the face toward +z and the eye
 * line at y 1.93, z 0.43.
 */
export function dreamerFace() {
  const body: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  body.push(part(new THREE.SphereGeometry(1, 10, 7), DRE_BACK, { p: [0, 1.85, 0], s: [0.58, 0.52, 0.54] }));
  body.push(part(new THREE.SphereGeometry(1, 9, 5), DRE_BELLY, { p: [0, 1.64, 0.1], s: [0.46, 0.3, 0.46] }));
  body.push(part(new THREE.SphereGeometry(1, 6, 3), 0x4a9a7c, { p: [0, 2.34, -0.12], s: [0.05, 0.17, 0.32], r: [0.4, 0, 0] }));
  for (const sd of [-1, 1]) {
    // A dark socket round each great eye, and a heavy brow slanting down to the middle: it scowls.
    body.push(part(new THREE.SphereGeometry(0.17, 10, 6), 0x123a32, { p: [sd * 0.21, 1.93, 0.4], s: [1, 0.9, 0.5] }));
    body.push(part(new THREE.BoxGeometry(0.27, 0.06, 0.12), 0x1f5246, { p: [sd * 0.22, 2.1, 0.43], r: [0.25, 0, sd * 0.42] }));
    glow.push(part(new THREE.SphereGeometry(0.135, 10, 8), DRE_COLD, { p: [sd * 0.21, 1.93, 0.44], s: [1, 0.9, 0.55] }, { k: 1.3 }));
  }
  const rnd = mulberry(seedOf('dreamer-eyes'));
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + (i / 6) * 2.2 + (rnd() - 0.5) * 0.2;
    const y = 2.1 + (rnd() - 0.2) * 0.25;
    const r = 0.05 + rnd() * 0.035;
    glow.push(part(new THREE.SphereGeometry(r, 6, 4), DRE_GLOW, { p: [Math.sin(a) * 0.52, y, Math.cos(a) * 0.46], s: [1, 0.6, 0.5], r: [0, a, 0] }, { k: 1.1 }));
  }
  // Lids round their hinge on the eye line, and the slit pupils round the eyes' fronts.
  const upper = mergeParts([-1, 1].map((sd) => part(new THREE.SphereGeometry(0.155, 10, 4, 0, TAU, 0, H), DRE_BACK, { p: [sd * 0.21, 0, 0], s: [1, 0.95, 0.6] })));
  const lower = mergeParts([-1, 1].map((sd) => part(new THREE.SphereGeometry(0.155, 10, 4, 0, TAU, H, H), 0x24584c, { p: [sd * 0.21, 0, 0], s: [1, 0.95, 0.6] })));
  const pupils = mergeParts([-1, 1].map((sd) => part(new THREE.SphereGeometry(0.05, 6, 8), 0x04100c, { p: [sd * 0.21, 0, 0], s: [0.5, 1.7, 0.35] })));
  const halo = part(new THREE.TorusGeometry(0.44, 0.032, 4, 24), DRE_GLOW, undefined, { k: 1.1 });
  return { body: mergeParts(body), glow: mergeParts(glow), upper, lower, pupils, halo };
}

/**
 * The Dreamer's face rigged on `inner` (its bulb's frame): the lids on a hinge at the eye line, the pupils on a mount
 * in front of the eyes, the halo over it. `stare(...)` sets them for a frame: how far the lids have closed (0 open,
 * 1 slits), how tight the pupils are, and where the player is in `inner`'s frame for the pupils to follow.
 */
export function dreamerEyesRig(inner: THREE.Group, f: ReturnType<typeof dreamerFace>, hide: THREE.Material, glow: THREE.Material) {
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  upper.position.set(0, 1.93, 0.43);
  lower.position.set(0, 1.93, 0.43);
  upper.add(new THREE.Mesh(f.upper, hide));
  lower.add(new THREE.Mesh(f.lower, hide));
  const mount = new THREE.Group();
  mount.position.set(0, 1.93, 0.52);
  const pupils = new THREE.Group();
  pupils.add(new THREE.Mesh(f.pupils, new THREE.MeshBasicMaterial({ vertexColors: true })));
  mount.add(pupils);
  const haloG = new THREE.Group();
  haloG.position.set(0, 2.58, -0.05);
  haloG.add(new THREE.Mesh(f.halo, glow));
  inner.add(upper, lower, mount, haloG);
  const L = new THREE.Vector3();
  return {
    haloG,
    stare(t: number, close: number, tight: number, lookLocal: THREE.Vector3): void {
      // Wide when it first looks, narrowing to slits as it menaces (never a blink: it doesn't look away).
      upper.rotation.x = lerp(-0.95, 0.3, close) + 0.04 * Math.sin(t * 1.7);
      lower.rotation.x = lerp(0.75, -0.33, close) - 0.03 * Math.sin(t * 1.7);
      L.copy(lookLocal).sub(mount.position).normalize();
      pupils.position.set(clamp01(Math.abs(L.x) * 1.4) * Math.sign(L.x) * 0.045, clamp01(Math.abs(L.y) * 1.4) * Math.sign(L.y) * 0.03, 0);
      pupils.scale.set(lerp(1, 0.32, tight), lerp(1, 0.8, close), 1);
      haloG.rotation.set(H - 0.25 + 0.15 * Math.sin(t * 1.1), 0.2 * Math.sin(t * 0.6), 0.12 * Math.sin(t * 0.8));
      haloG.position.y = 2.58 + 0.04 * Math.sin(t * 1.9);
    },
  };
}

/** The Dreamer's tentacles as tubes, darker at the root, lighter teal toward the tip. */
export function dreamerTentacles(n: number, segs: number, mat: THREE.Material): Tubes {
  const lo = new THREE.Color(DRE_TENT);
  const hi = new THREE.Color(0x4a9a7c);
  return new Tubes(
    n,
    segs,
    5,
    (_i, s, _k, c) => {
      c.copy(lo).lerp(hi, s);
      return 1;
    },
    mat,
  );
}
