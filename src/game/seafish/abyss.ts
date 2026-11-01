// The Abyss's fish: impossible anatomy (eyes everywhere, a mouth bigger than the body, tentacles, bone, armour) under
// the Abyssal finish, the sea's answer to the lake's spirit fish: a dark rim, an aura in the accent colour and eyes
// that glow. Geometries are built once per species and shared; materials are shared per colour.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FISH } from '../../data/content';
import { SHAPES, envelope, type Shape } from '../../data/fishlook';
import type { AbyssParts } from '../../data/seaparts/abyss';
import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GOLD = 0xffd23a;
const isLegend = (id: string) => !!FISH.find((f) => f.id === id)?.legend;

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- body surface ----------

/** The serpent's humps: how far the body's midline rises at t. */
function waveAt(p: AbyssParts, t: number): number {
  return p.wave ? p.wave.amp * Math.sin(Math.PI * 2 * p.wave.freq * t) * (0.25 + 0.75 * t) : 0;
}

/**
 * A point on the body's skin at t along it and angle phi around it (0 the right flank, π/2 the back), matching the
 * builder's body mesh; `lift` swells it and `pad` adds a constant margin, for parts that sit on or just over the skin.
 */
function surf(shape: Shape, p: AbyssParts, t: number, phi: number, lift = 1, pad = 0): V3 {
  const s = SHAPES[shape];
  const env = envelope(shape, THREE.MathUtils.clamp(t, 0, 1));
  const nx = Math.cos(phi);
  const ny = Math.sin(phi);
  const sag = ny < 0 ? s.sag * env * -ny : 0;
  return V(nx * (s.w * env * lift + pad), ny * (s.h * env * lift + pad) - sag * lift + waveAt(p, t), -0.5 + t);
}

/** The outward normal of the skin at (t, phi). */
function surfNormal(shape: Shape, p: AbyssParts, t: number, phi: number): V3 {
  const e = 0.004;
  const dt = surf(shape, p, t + e, phi).sub(surf(shape, p, t - e, phi));
  const dp = surf(shape, p, t, phi + e).sub(surf(shape, p, t, phi - e));
  const n = dp.cross(dt).normalize();
  if (n.x * Math.cos(phi) + n.y * Math.sin(phi) < 0) n.negate();
  return n;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function shared<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g as T;
}
const matCache = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m as T;
}
const hexKey = (c: THREE.Color | number) => (typeof c === 'number' ? c : c.getHex()).toString(16);

/** A body-shaped shell (the rim and the aura), swollen by `lift` and padded by `pad`; low-poly, since it is only a glow or an outline. */
function shellGeo(shape: Shape, p: AbyssParts, lift: number, pad: number, ws: number, hs: number): THREE.BufferGeometry {
  return shared(`shell|${shape}|${p.wave?.amp ?? 0}|${p.wave?.freq ?? 0}|${lift}|${pad}|${ws}|${hs}`, () => {
    const g = new THREE.SphereGeometry(0.5, ws, hs).rotateX(Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = z + 0.5;
      if (Math.hypot(x, y) < 1e-6) {
        pos.setXYZ(i, 0, waveAt(p, t), z * (1 + pad * 2));
        continue;
      }
      const phi = Math.atan2(y, x);
      const q = surf(shape, p, t, phi, lift, pad * Math.sqrt(Math.max(0, 1 - (2 * z) ** 2)));
      pos.setXYZ(i, q.x, q.y, z * (1 + pad * 2));
    }
    g.computeVertexNormals();
    return g;
  });
}

// ---------- shared shapes ----------

const unitSphere = (w: number, h: number) => shared(`us${w}|${h}`, () => new THREE.SphereGeometry(1, w, h));

/** A tube along a curve that tapers from r0 to a point. */
function taperTube(curve: THREE.Curve<V3>, r0: number, segs: number, radial: number, tip = 0.08): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position;
  const c = V();
  // TubeGeometry lays out segs + 1 rings of radial + 1 vertices, ring i around getPointAt(i / segs), radius 1.
  for (let i = 0; i <= segs; i++) {
    const q = i / segs;
    curve.getPointAt(q, c);
    const r = i === segs ? 0.0005 : r0 * (1 - (1 - tip) * q ** 0.9);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r);
    }
  }
  g.deleteAttribute('uv');
  return g;
}

/** A cone pointing along `dir` from `base`, for spines, fangs and teeth. */
function spike(base: V3, dir: V3, len: number, r: number, radial = 5): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, radial, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  g.deleteAttribute('uv');
  return g;
}

const merge = (gs: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)));
  gs.forEach((x) => x.dispose());
  return g;
};

/** Tentacles: one geometry for the arms and one for their suckers, laid out from the id. */
function tentacleGeos(id: string, shape: Shape, p: AbyssParts): { arms: THREE.BufferGeometry; suckers: THREE.BufferGeometry | null } {
  const T = p.tentacles!;
  const key = `tent|${id}`;
  const arms = geoCache.get(key);
  if (arms) return { arms, suckers: geoCache.get(`${key}|s`) ?? null };
  const rng = seeded(`${id}:tentacles`);
  const armGeos: THREE.BufferGeometry[] = [];
  const suckerGeos: THREE.BufferGeometry[] = [];
  const sucker = new THREE.SphereGeometry(1, 5, 3);
  const fwd = V(0, 0, -1);
  const down = V(0, -1, 0);
  for (let i = 0; i < T.n; i++) {
    const u = T.n > 1 ? i / (T.n - 1) : 0.5;
    const L = T.len * (0.85 + 0.3 * rng());
    const wig = (i % 2 ? 1 : -1) * (0.6 + 0.4 * rng());
    let P: V3[];
    let inner: V3;
    if (T.dir === 'forward') {
      // A ring of arms out of the head, reaching forward and spreading, drooping down, tips curling out.
      const a = Math.PI / 2 + ((i + 0.5) / T.n) * Math.PI * 2;
      const out = V(Math.cos(a), Math.sin(a), 0);
      const side = out.clone().cross(fwd);
      const t0 = T.n > 6 ? 0.09 : 0.06;
      const base = surf(shape, p, t0, a, 0.72);
      const spread = T.n > 6 ? 1.05 : 0.75;
      const dir = fwd.clone().addScaledVector(out, spread).addScaledVector(down, T.n > 6 ? 0.25 : 0.45).normalize();
      P = [
        base,
        base.clone().addScaledVector(fwd, L * 0.3).addScaledVector(out, L * 0.06),
        base.clone().addScaledVector(dir, L * 0.62).addScaledVector(side, L * 0.16 * wig),
        base.clone().addScaledVector(dir, L * 0.8).addScaledVector(out, L * 0.28).addScaledVector(down, L * 0.12).addScaledVector(fwd, -L * 0.12).addScaledVector(side, -L * 0.1 * wig),
      ];
      inner = out.clone().negate();
    } else {
      // A beard hanging from the chin, the outer strands set further back, tips curling.
      const phi = -Math.PI / 2 + (u - 0.5) * 2.1;
      const t0 = (p.halo ? 0.13 : 0.05) + Math.abs(u - 0.5) * (p.halo ? 0.16 : 0.08);
      const base = surf(shape, p, t0, phi, 0.85);
      const out = V(Math.cos(phi), 0, 0);
      const dir = down.clone().addScaledVector(out, 0.35).addScaledVector(fwd, 0.18).normalize();
      P = [
        base,
        base.clone().addScaledVector(down, L * 0.35).addScaledVector(fwd, L * 0.05),
        base.clone().addScaledVector(dir, L * 0.7).addScaledVector(fwd, L * 0.22 * wig),
        base.clone().addScaledVector(dir, L * 0.85).addScaledVector(fwd, -L * 0.2 * wig).addScaledVector(out, L * 0.18).addScaledVector(down, -L * 0.1),
      ];
      inner = fwd.clone().negate();
    }
    // The reach, then a curl at the tip: a shrinking spiral turned toward the outside of the arm (back, for a beard).
    const reach = new THREE.CubicBezierCurve3(P[0], P[1], P[2], P[3]);
    const pts = [0, 0.3, 0.6, 0.85, 1].map((q) => reach.getPoint(q));
    const D = reach.getTangent(1);
    const U = (T.dir === 'forward' ? inner.clone().negate() : fwd.clone().negate().multiplyScalar(wig)).projectOnPlane(D).normalize();
    const rc = L * (T.dir === 'forward' ? 0.09 : 0.07);
    const turns = T.dir === 'forward' ? 0.85 : 0.7;
    const end = pts[pts.length - 1];
    const ctr = end.clone().addScaledVector(U, rc);
    for (let j = 1; j <= 8; j++) {
      const th = (j / 8) * turns * Math.PI * 2;
      const k = rc * (1 - 0.45 * (j / 8));
      pts.push(ctr.clone().addScaledVector(U, -Math.cos(th) * k).addScaledVector(D, Math.sin(th) * k));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const r0 = T.r * (0.85 + 0.3 * rng());
    armGeos.push(taperTube(curve, r0, T.dir === 'forward' ? 22 : 18, 5, 0.12));
    if (T.suckers) {
      const c = V();
      const tan = V();
      for (let j = 1; j <= 6; j++) {
        const q = 0.06 + j * 0.1;
        curve.getPointAt(q, c);
        curve.getTangentAt(q, tan);
        const sideDir = inner.clone().addScaledVector(tan, -inner.dot(tan)).normalize();
        const r = r0 * (1 - 0.88 * q ** 0.9);
        const g = sucker.clone().scale(r * 0.5, r * 0.5, r * 0.3);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), sideDir));
        g.translate(c.x + sideDir.x * r * 0.88, c.y + sideDir.y * r * 0.88, c.z + sideDir.z * r * 0.88);
        g.deleteAttribute('uv');
        suckerGeos.push(g);
      }
    }
  }
  sucker.dispose();
  const a = merge(armGeos);
  geoCache.set(key, a);
  const sk = suckerGeos.length ? merge(suckerGeos) : null;
  if (sk) geoCache.set(`${key}|s`, sk);
  return { arms: a, suckers: sk };
}

/** Bone parts in one geometry: spines along the back, horns on the brow. */
function boneGeo(id: string, shape: Shape, p: AbyssParts): THREE.BufferGeometry | null {
  if (!p.spines && !p.horns) return null;
  return shared(`bone|${id}`, () => {
    const gs: THREE.BufferGeometry[] = [];
    if (p.spines) {
      const { n, len } = p.spines;
      const [a, b] = p.wave ? [0.1, 0.92] : [0.24, 0.84];
      for (let i = 0; i < n; i++) {
        const t = a + ((b - a) * i) / (n - 1);
        const k = 1 - 0.55 * Math.abs((t - (a + 0.15)) / (b - a));
        const base = surf(shape, p, t, Math.PI / 2, 0.9);
        const back = V(0, 0, 1);
        const dir = surfNormal(shape, p, t, Math.PI / 2).addScaledVector(back, 0.75).normalize();
        gs.push(spike(base, dir, len * k * (i % 2 ? 0.8 : 1), len * 0.16 * k + 0.004));
      }
    }
    if (p.horns) {
      const { n, len } = p.horns;
      const horn = (t: number, phi: number, sx: number, L: number, out: number, rise: number) => {
        const base = surf(shape, p, t, phi, 0.85);
        const curve = new THREE.CubicBezierCurve3(
          base,
          base.clone().add(V(sx * out * 0.2 * L, 0.45 * L * rise, -0.05 * L)),
          base.clone().add(V(sx * out * 0.6 * L, 0.85 * L * rise, 0.25 * L)),
          base.clone().add(V(sx * out * 0.75 * L, 0.8 * L * rise + 0.15 * L, 0.75 * L)),
        );
        gs.push(taperTube(curve, Math.max(0.012, L * 0.11), 8, 6, 0.04));
      };
      if (n === 3) {
        horn(0.11, Math.PI / 2, 0, len, 0, 1);
        for (const sx of [-1, 1]) horn(0.17, Math.PI / 2 - sx * 0.75, sx, len * 0.75, 0.9, 0.9);
      } else for (const sx of [-1, 1]) horn(0.085, Math.PI / 2 - sx * 0.7, sx, len, 0.5, 0.55);
    }
    return merge(gs);
  });
}

/** Fangs hanging from the upper jaw at the front, per side. */
function fangGeo(id: string, shape: Shape, p: AbyssParts): THREE.BufferGeometry | null {
  if (!p.fangs) return null;
  return shared(`fang|${id}`, () => {
    const gs: THREE.BufferGeometry[] = [];
    const h = SHAPES[shape].h;
    for (let i = 0; i < p.fangs!; i++) {
      for (const sx of [-1, 1]) {
        const t = 0.025 + i * 0.03;
        const base = surf(shape, p, t, sx > 0 ? -0.35 : Math.PI + 0.35, 0.8);
        const len = h * (i % 2 ? 0.35 : 0.55) * (p.wave ? 1.6 : 1);
        gs.push(spike(base, V(sx * 0.1, -1, -0.15), len, len * 0.16, 4));
      }
    }
    return merge(gs);
  });
}

/**
 * Thin strips lying on the skin along paths given in body space, (t, phi) points: ribs across the flanks, or the
 * Leviathan's seams between its armour plates. `half` is the strip's half-width; the ends taper when `taper` is set.
 */
function stripGeo(key: string, shape: Shape, p: AbyssParts, paths: [number, number][][], half: number, pad: number, taper: boolean): THREE.BufferGeometry {
  return shared(`strip|${key}`, () => {
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    for (const path of paths) {
      const pts = path.map(([t, phi]) => surf(shape, p, t, phi, 1, pad));
      const first = pos.length / 3;
      pts.forEach((q, j) => {
        const [t, phi] = path[j];
        const n = surfNormal(shape, p, t, phi);
        const along = pts[Math.min(pts.length - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize();
        const side = along.cross(n).normalize();
        const w = half * (taper ? 1 - 0.7 * Math.abs((j / (pts.length - 1)) * 2 - 1) : 1);
        for (const k of [-w, w]) {
          pos.push(q.x + side.x * k, q.y + side.y * k, q.z + side.z * k);
          nor.push(n.x, n.y, n.z);
        }
        if (j < pts.length - 1) {
          const a = first + j * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  });
}

/** Rib arcs across both flanks, bowed toward the tail. */
function ribPaths(n: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const t0 = 0.14 + (i * 0.8) / n;
    for (const [a, b] of [[-0.95, 0.95], [Math.PI - 0.95, Math.PI + 0.95]]) {
      out.push(Array.from({ length: 11 }, (_, j) => {
        const phi = a + ((b - a) * j) / 10;
        return [t0 + 0.035 * Math.abs(Math.cos(phi)), phi] as [number, number];
      }));
    }
  }
  return out;
}

/**
 * The seams between armour plates: jagged rings around the body, and a seam along each flank and the back, so the
 * glow outlines plates instead of drawing stripes.
 */
function seamPaths(id: string, n: number): [number, number][][] {
  const rng = seeded(`${id}:seams`);
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const t0 = 0.2 + (i * 0.66) / Math.max(1, n - 1);
    const ph = rng() * 6;
    out.push(Array.from({ length: 33 }, (_, j) => {
      const phi = (j / 32) * Math.PI * 2;
      return [t0 + 0.04 * Math.abs(Math.cos(phi)) + 0.012 * Math.sin(phi * 7 + ph) * (j % 2 ? 1 : -0.4), phi] as [number, number];
    }));
  }
  for (const phi0 of [0.25, Math.PI - 0.25, Math.PI / 2]) {
    const ph = rng() * 6;
    out.push(Array.from({ length: 25 }, (_, j) => {
      const t = 0.2 + (j / 24) * 0.66;
      return [t, phi0 + 0.06 * Math.sin(j * 1.9 + ph)] as [number, number];
    }));
  }
  return out;
}

/** The gulper's open mouth: a pouch flaring from the hinge behind the head to a huge rim, jaws reaching furthest. */
const HINGE = -0.3;
function pouchPoint(s: number, theta: number): V3 {
  const e = s ** 0.8;
  const a = 0.13 + (0.36 - 0.13) * e;
  const b = 0.1 + (0.15 - 0.1) * e;
  // The jaws (top and bottom) reach far forward; at the sides only a little cheek membrane, so the mouth gapes.
  const zr = -0.4 - 0.42 * Math.abs(Math.sin(theta)) ** 2.2;
  return V(Math.cos(theta) * b, Math.sin(theta) * a - 0.02 * s, HINGE + (zr - HINGE) * s);
}
function pouchGeo(): THREE.BufferGeometry {
  return shared('pouch', () => {
    const R = 18;
    const S = 5;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= S; i++) {
      for (let j = 0; j <= R; j++) {
        const q = pouchPoint(i / S, (j / R) * Math.PI * 2);
        pos.push(q.x, q.y, q.z);
        if (i < S && j < R) {
          const k = i * (R + 1) + j;
          idx.push(k, k + 1, k + R + 1, k + 1, k + R + 2, k + R + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
/** The gulper's jaw bones along the top and bottom of the pouch. */
function jawGeo(): THREE.BufferGeometry {
  return shared('jawbones', () => {
    const gs: THREE.BufferGeometry[] = [];
    for (const th of [Math.PI / 2, -Math.PI / 2]) {
      const pts = [0, 0.35, 0.7, 1.04].map((s) => pouchPoint(s, th).multiply(V(1, 1.04, 1)));
      gs.push(taperTube(new THREE.CatmullRomCurve3(pts), 0.03, 8, 6, 0.3));
    }
    return merge(gs);
  });
}
function gulperTeethGeo(): THREE.BufferGeometry {
  return shared('gulperteeth', () => {
    const gs: THREE.BufferGeometry[] = [];
    for (const th of [Math.PI / 2, -Math.PI / 2]) {
      for (let i = 0; i < 9; i++) {
        const s = 0.22 + i * 0.095;
        for (const off of i % 2 ? [0] : [-0.22, 0.22]) {
          const base = pouchPoint(s, th + off);
          const len = 0.06 + 0.035 * (i % 3) + s * 0.04;
          gs.push(spike(base, V(-base.x * 3, -Math.sign(Math.sin(th)), 0.25), len, 0.011, 4));
        }
      }
    }
    return merge(gs);
  });
}

// ---------- the model ----------

/**
 * The aura: an additive shell around the body that fades out toward its own edge (brightest where it looks straight
 * through), so it glows softly instead of reading as a bubble.
 */
function auraMat(c: THREE.Color, op: number): THREE.MeshBasicMaterial {
  return mat(`aura|${hexKey(c)}|${op}`, () => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying float vAura;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvAura = pow(abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz))), 1.6);');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vAura;\nvoid main() {')
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAura;');
    };
    m.customProgramCacheKey = () => 'abyss-aura';
    return m;
  });
}

/** Builds the Abyss's parts (`FishLook.abyss`) and its finish onto a 3D fish. */
export function abyssModel(ctx: SeaModelCtx): void {
  const { look, L, id, shiny, accent, group } = ctx;
  const p = look.abyss;
  if (!p) return;
  const shape = look.shape;
  const legend = isLegend(id);
  const C = (c: number) => (shiny ? new THREE.Color(c).lerp(new THREE.Color(GOLD), 0.55) : new THREE.Color(c));
  const pulsed = new Set<THREE.Material>();
  const pulse = <M extends THREE.Material>(m: M): M => {
    if (!pulsed.has(m)) ctx.pulse.push(m), pulsed.add(m);
    return m;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(geo, m);
    parent.add(mesh);
    return mesh;
  };
  const glowMat = (c: THREE.Color, op: number, side: THREE.Side = THREE.FrontSide) =>
    mat(`glow|${hexKey(c)}|${op}|${side}`, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side }));
  const sprite = (c: THREE.Color, op: number, size: number, at: V3, parent: THREE.Object3D = group) => {
    const m = mat(`spr|${hexKey(c)}|${op}`, () => new THREE.SpriteMaterial({ map: ctx.glowTexture(), color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sp = new THREE.Sprite(pulse(m));
    sp.scale.setScalar(size);
    sp.position.copy(at);
    parent.add(sp);
    return sp;
  };
  const solid = (c: THREE.Color, rough = 0.55, emissive = 0, side: THREE.Side = THREE.FrontSide) =>
    mat(`sol|${hexKey(c)}|${rough}|${emissive}|${side}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, emissive: c.clone().multiplyScalar(emissive), side }));
  const basic = (c: THREE.Color | number) => mat(`bas|${hexKey(c)}`, () => new THREE.MeshBasicMaterial({ color: c }));
  /** Unlit and not tone-mapped, so glowing irises, lures and seams keep their full colour. */
  const lit = (c: THREE.Color) => mat(`lit|${hexKey(c)}`, () => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));

  // The body's skin: a satin sheen tinted with the accent at the edges, and a faint inner light.
  const bm = ctx.bodyMat;
  bm.sheen = 0.6;
  bm.sheenColor = accent.clone().multiplyScalar(0.4);
  bm.sheenRoughness = 0.4;
  bm.emissive = accent.clone().multiplyScalar(0.05);
  if (p.seams) {
    bm.sheen = 0;
    bm.emissive.setRGB(0, 0, 0);
    bm.metalness = shiny ? 0.5 : 0.1;
    bm.roughness = 0.38;
    bm.flatShading = true;
  }

  // A serpent's humps: bend the body and lift the fins and tail onto the curve.
  if (p.wave) {
    ctx.body.geometry = shellGeo(shape, p, 1, 0, 40, 24);
    for (const c of group.children) if (c !== ctx.body && (c as THREE.Mesh).isMesh) c.position.y += waveAt(p, c.position.z + 0.5);
    ctx.tail.position.y += waveAt(p, 0.97);
  }
  // Squid have no fish fins: the pectoral and anal fins go, and they get squid fins below instead.
  if (shape === 'mantle') for (const c of [...group.children]) if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).material === ctx.finMat) group.remove(c);

  // ---- the Abyssal finish: a dark rim hugging the body, then an aura in the accent colour ----
  const rimCol = new THREE.Color(L.back).lerp(new THREE.Color(0x0c0618), 0.7);
  add(shellGeo(shape, p, 1, 0.014, 24, 14), mat(`rim|${hexKey(rimCol)}`, () => new THREE.MeshBasicMaterial({ color: rimCol, side: THREE.BackSide })));
  add(shellGeo(shape, p, 1.4, 0.07, 20, 12), pulse(auraMat(accent, legend ? 0.85 : 0.6)));
  sprite(accent, legend ? 0.5 : 0.28, legend ? 2.3 : 1.5, V(0, 0, 0.05));

  // ---- eyes ----
  const pupilMat = basic(0x140a1c);
  const white = basic(shiny ? 0xfff6d8 : 0xf8f4ff);
  const socketMat = solid(new THREE.Color(L.back).multiplyScalar(0.45), 0.6);
  const eye = (t: number, phi: number, r: number, iris: THREE.Color, pupil: AbyssParts['eye']['pupil'] = 'round') => {
    const n = surfNormal(shape, p, t, phi);
    const g = new THREE.Group();
    g.position.copy(surf(shape, p, t, phi)).addScaledVector(n, -r * 0.3);
    g.quaternion.setFromUnitVectors(V(0, 0, 1), n);
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, s: [number, number, number], z: number, x = 0, y = 0) => {
      const o = add(geo, m, g);
      o.scale.set(...s);
      o.position.set(x, y, z);
      return o;
    };
    const lamp = pupil === 'lamp';
    // Fewer facets on the small eyes.
    const big = r > 0.05;
    part(unitSphere(big ? 8 : 7, 4), socketMat, [r * 1.22, r * 1.22, r * 0.75], lamp ? -r * 0.15 : -r * 0.05);
    if (lamp) {
      // A green lamp sunk in a dark socket: a glowing orb with a white-hot core.
      part(unitSphere(8, 6), lit(iris), [r * 0.85, r * 0.85, r * 0.6], r * 0.2);
      part(unitSphere(6, 4), basic(0xffffff), [r * 0.3, r * 0.3, r * 0.2], r * 0.62);
      sprite(iris, 0.7, r * 6, V(0, 0, r), g);
    } else {
      part(unitSphere(big ? 10 : 8, big ? 7 : 5), white, [r, r, r], 0);
      part(unitSphere(big ? 8 : 6, 4), lit(iris), [r * 0.7, r * 0.7, r * 0.35], r * 0.72);
      const ps: [number, number, number] = pupil === 'slit' ? [r * 0.14, r * 0.52, r * 0.2] : pupil === 'bar' ? [r * 0.5, r * 0.17, r * 0.2] : [r * 0.33, r * 0.33, r * 0.2];
      part(unitSphere(6, 3), pupilMat, ps, r * 0.95);
      part(unitSphere(4, 2), white, [r * 0.15, r * 0.15, r * 0.1], r * 0.98, -r * 0.28, r * 0.3);
      sprite(iris, 0.55, r * 5.5, V(0, 0, r * 0.5), g);
    }
    group.add(g);
  };
  const irisCol = p.eye.iris !== undefined ? C(p.eye.iris) : accent.clone();
  const mainPhi = (p.eye.up ?? 0.3) * (Math.PI / 2);
  const placed: { at: V3; r: number }[] = [];
  for (const sx of [1, -1]) {
    for (let i = 0; i <= (p.eyeRow ?? 0); i++) {
      const t = p.eye.t + i * 0.07;
      const r = p.eye.r * (1 - i * 0.2);
      const phi = mainPhi - i * 0.12;
      const ph = sx > 0 ? phi : Math.PI - phi;
      eye(t, ph, r, irisCol, p.eye.pupil);
      placed.push({ at: surf(shape, p, t, ph), r });
    }
  }
  if (p.eyes) {
    // Eyes of every size scattered over both flanks and the back, kept from overlapping.
    const rng = seeded(`${id}:eyes`);
    let made = 0;
    for (let tries = 0; tries < 400 && made < p.eyes.n; tries++) {
      const t = 0.12 + rng() * 0.58;
      const side = made % 2 ? -1 : 1;
      const phi0 = -0.55 + rng() * 2.05;
      const phi = side > 0 ? phi0 : Math.PI - phi0;
      const r = p.eyes.r[0] + (p.eyes.r[1] - p.eyes.r[0]) * rng() ** 1.5;
      const at = surf(shape, p, t, phi);
      if (placed.some((e) => e.at.distanceTo(at) < (e.r + r) * 1.35)) continue;
      placed.push({ at, r });
      eye(t, phi, r, irisCol, made % 3 === 2 ? 'slit' : 'round');
      made++;
    }
  }

  // ---- bones, fangs, ribs, seams ----
  const bones = boneGeo(id, shape, p);
  if (bones) add(bones, solid(C(p.spines?.color ?? p.horns!.color), 0.45, 0.08));
  const fangs = fangGeo(id, shape, p);
  if (fangs) add(fangs, solid(C(0xfffaf0), 0.3, 0.15));
  if (p.ribs) {
    add(stripGeo(`rib|${id}`, shape, p, ribPaths(p.ribs.n), 0.01, 0.003, true), solid(C(p.ribs.color), 0.7));
  }
  if (p.seams) {
    const seam = C(p.seams.color);
    const paths = seamPaths(id, p.seams.n);
    add(stripGeo(`seamcore|${id}`, shape, p, paths, 0.0075, 0.004, false), lit(seam.clone().lerp(new THREE.Color(0xfff0c0), 0.6)));
    add(stripGeo(`seamglow|${id}`, shape, p, paths, 0.022, 0.008, false), pulse(glowMat(seam, 0.7, THREE.DoubleSide)));
  }

  // ---- tentacles ----
  if (p.tentacles) {
    const { arms, suckers } = tentacleGeos(id, shape, p);
    add(arms, solid(C(p.tentacles.color), 0.5, 0.06));
    if (suckers && p.tentacles.suckers !== undefined) add(suckers, solid(C(p.tentacles.suckers), 0.4, 0.12));
  }
  if (p.squidFins) {
    const k = p.squidFins;
    const fin = shared(`squidfin|${k}`, () => ctx.finGeo([[0, 0], [0.12 * k, 0.1 * k], [0.3 * k, 0.22 * k], [0.4 * k, 0.15 * k], [0.44 * k, 0]]));
    for (const sx of [-1, 1]) {
      const t = 0.56;
      // Lit a little from within, so the fin's shaded underside doesn't read as a black wedge side-on.
      const m = add(fin, solid(new THREE.Color(L.fin), 0.5, 0.35, THREE.DoubleSide));
      m.position.set(sx * ctx.extents(t + 0.15).x * 0.4, 0.01, -0.5 + t);
      // Tilted up out of the flat, so they read from the side too.
      m.rotation.set(0, 0, -sx * (Math.PI / 2 - 0.6));
    }
  }

  // ---- the gulper's mouth and whip ----
  if (p.jaw !== undefined) {
    // Dark skin outside, pink inside.
    add(pouchGeo(), solid(new THREE.Color(L.back).lerp(C(p.jaw), 0.3), 0.6, 0, THREE.FrontSide));
    add(pouchGeo(), solid(C(p.jaw), 0.55, 0.18, THREE.BackSide));
    add(jawGeo(), solid(new THREE.Color(L.fin).lerp(new THREE.Color(0xffffff), 0.1), 0.5));
    add(gulperTeethGeo(), solid(C(0xfffaf0), 0.3, 0.2));
  }
  if (p.whip !== undefined) {
    const whip = shared('whip', () => taperTube(new THREE.CubicBezierCurve3(V(0, 0, -0.04), V(0, -0.22, 0.2), V(0, 0.42, 0.34), V(0, 0.26, 0.56)), 0.022, 18, 5, 0.25));
    add(whip, solid(new THREE.Color(L.fin).lerp(new THREE.Color(0xffffff), 0.1), 0.5), ctx.tail);
    const lure = C(p.whip);
    const bulb = add(unitSphere(8, 6), lit(lure.clone().lerp(new THREE.Color(0xffffff), 0.2)), ctx.tail);
    bulb.scale.setScalar(0.03);
    bulb.position.set(0, 0.26, 0.57);
    ctx.twinkle.push(sprite(lure, 0.9, 0.3, V(0, 0.26, 0.57), ctx.tail));
  }

  // ---- the Dreamer's halo ----
  if (p.halo) {
    const ring = new THREE.Group();
    add(shared('haloring', () => new THREE.TorusGeometry(0.17, 0.011, 5, 36)), lit(accent.clone().lerp(new THREE.Color(0xffffff), 0.45)), ring);
    add(shared('haloglow', () => new THREE.TorusGeometry(0.17, 0.04, 5, 28)), pulse(glowMat(accent, 0.4)), ring);
    const star = basic(0xffffff);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const st = add(shared('halostar', () => new THREE.OctahedronGeometry(0.018)), star, ring);
      st.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0);
      ctx.twinkle.push(st);
    }
    const t = 0.24;
    ring.position.set(0, ctx.extents(t).y + 0.16, -0.5 + t);
    ring.rotation.x = Math.PI / 2 - 0.35;
    group.add(ring);
  }

  // ---- legends: motes of light drifting around them ----
  if (legend) {
    const rng = seeded(`${id}:motes`);
    const s = SHAPES[shape];
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const t = 0.05 + rng() * 0.9;
      const m = add(shared(`mote${i % 3}`, () => new THREE.OctahedronGeometry(0.01 + (i % 3) * 0.005)), i % 4 === 3 ? basic(0xffffff) : glowMat(accent, 0.95));
      m.position.set(Math.cos(a) * (s.w + 0.14 + rng() * 0.12), Math.sin(a) * (s.h + 0.12 + rng() * 0.12), -0.5 + t);
      ctx.twinkle.push(m);
    }
  }
}

// ---------- the icon ----------

const ihex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
function imix(a: number, b: number, t: number): number {
  const out = [16, 8, 0].map((s) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  });
  return out[0] | out[1] | out[2];
}
const f1 = (n: number) => n.toFixed(1);

/** Draws the Abyss's parts and finish onto a fish icon. */
export function abyssIcon(ctx: SeaIconCtx): SeaIconLayers | null {
  const { look, k, hidden, shiny, HEAD, ROOT, MID, PX, topAt, botAt, xAt, body, ink } = ctx;
  const p = look.abyss;
  if (!p) return null;
  const legend = isLegend(ctx.id);
  const col = (c: number) => (hidden ? ink : ihex(shiny ? imix(c, GOLD, 0.55) : c));
  const acc = hidden ? ink : ctx.accent;
  const midAt = (t: number) => (topAt(t) + botAt(t)) / 2;
  let defs = '';
  let under = '';
  let behind = '';
  let clipped = '';
  let over = '';
  let top = '';
  // Soft glows without a blur filter: radial gradients fading to clear.
  const grads = new Map<string, string>();
  const grad = (c: string) => {
    let g = grads.get(c);
    if (!g) {
      g = `ag${k}_${grads.size}`;
      grads.set(c, g);
      defs += `<radialGradient id="${g}"><stop offset="0" stop-color="${c}" stop-opacity=".85"/><stop offset=".45" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
    }
    return g;
  };
  const glow = (x: number, y: number, rx: number, ry: number, c: string) => (hidden ? '' : `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="url(#${grad(c)})"/>`);
  const eye = (x: number, y: number, r: number, iris: string, pupil: AbyssParts['eye']['pupil'] = 'round') => {
    if (hidden) return '';
    if (pupil === 'lamp') return glow(x, y, r * 3, r * 3, iris) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.25)}" fill="#1a1020"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${iris}"/><circle cx="${f1(x + r * 0.15)}" cy="${f1(y - r * 0.1)}" r="${f1(r * 0.4)}" fill="#fff"/>`;
    const pup = pupil === 'slit' ? `<ellipse cx="${f1(x + r * 0.2)}" cy="${f1(y)}" rx="${f1(r * 0.18)}" ry="${f1(r * 0.55)}" fill="${ink}"/>` : pupil === 'bar' ? `<ellipse cx="${f1(x + r * 0.2)}" cy="${f1(y)}" rx="${f1(r * 0.5)}" ry="${f1(r * 0.2)}" fill="${ink}"/>` : `<circle cx="${f1(x + r * 0.25)}" cy="${f1(y)}" r="${f1(r * 0.36)}" fill="${ink}"/>`;
    return glow(x, y, r * 2.3, r * 2.3, iris) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff" stroke="${ink}" stroke-opacity=".4" stroke-width=".5"/><circle cx="${f1(x + r * 0.15)}" cy="${f1(y)}" r="${f1(r * 0.68)}" fill="${iris}"/>${pup}<circle cx="${f1(x - r * 0.25)}" cy="${f1(y - r * 0.35)}" r="${f1(Math.max(0.35, r * 0.2))}" fill="#fff"/>`;
  };
  /** A tapered arm along a cubic Bezier, as a filled outline, with optional sucker dots. */
  const arm = (P: [number, number][], w: number, fill: string, suckers?: string) => {
    const pt = (q: number) => {
      const a = 1 - q;
      return [0, 1].map((j) => a * a * a * P[0][j] + 3 * a * a * q * P[1][j] + 3 * a * q * q * P[2][j] + q * q * q * P[3][j]);
    };
    const L1: string[] = [];
    const L2: string[] = [];
    let dots = '';
    for (let j = 0; j <= 12; j++) {
      const q = j / 12;
      const [px, py] = pt(q);
      const [qx, qy] = pt(Math.min(1, q + 0.03));
      const [rx, ry] = pt(Math.max(0, q - 0.03));
      const dx = qx - rx;
      const dy = qy - ry;
      const len = Math.hypot(dx, dy) || 1;
      const hw = (w * (1 - 0.85 * q)) / 2;
      L1.push(`${f1(px - (dy / len) * hw)} ${f1(py + (dx / len) * hw)}`);
      L2.unshift(`${f1(px + (dy / len) * hw)} ${f1(py - (dx / len) * hw)}`);
      if (suckers && !hidden && j % 3 === 1 && j < 11) dots += `<circle cx="${f1(px + (dy / len) * hw * 0.3)}" cy="${f1(py - (dx / len) * hw * 0.3)}" r="${f1(Math.max(0.45, hw * 0.42))}" fill="${suckers}"/>`;
    }
    return `<path d="M${L1.join(' L')} L${L2.join(' L')} Z" fill="${fill}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.3}" stroke-width=".5"/>${dots}`;
  };
  const iris = hidden ? ink : p.eye.iris !== undefined ? col(p.eye.iris) : acc;

  // The Abyssal finish: a wide soft aura and a glowing edge behind, a dark rim just inside the outline.
  if (!hidden) {
    const cx = xAt(0.45);
    under += glow(cx, MID, PX * 0.72, legend ? 19 : 16, acc);
    under += `<path d="${body}" fill="none" stroke="${acc}" stroke-width="3.4" stroke-linejoin="round" opacity=".45"/>`;
    clipped += `<path d="${body}" fill="none" stroke="#120820" stroke-width="3.2" stroke-opacity=".42"/>`;
  }

  // Squid fins at the tail end.
  if (p.squidFins) {
    const s = p.squidFins;
    const x0 = xAt(0.62);
    behind += `<path d="M${f1(x0)} ${f1(MID - 2)} L${f1(ROOT - 9 * s)} ${f1(MID - 9 * s)} L${f1(ROOT - 6 * s)} ${f1(MID)} L${f1(ROOT - 9 * s)} ${f1(MID + 9 * s)} L${f1(x0)} ${f1(MID + 2)} Z" fill="${col(look.fin)}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.3}" stroke-width=".5"/>`;
  }
  // Bone spines along the back.
  if (p.spines) {
    const n = p.wave ? 9 : 7;
    const [a, b] = p.wave ? [0.12, 0.88] : [0.26, 0.8];
    for (let i = 0; i < n; i++) {
      const t = a + ((b - a) * i) / (n - 1);
      const x = xAt(t);
      const y = topAt(t) + 0.8;
      const hgt = (p.wave ? 3.2 : 6) * (1 - 0.4 * Math.abs(i / (n - 1) - 0.3)) * (i % 2 ? 0.75 : 1);
      behind += `<path d="M${f1(x + 1.4)} ${f1(y)} L${f1(x - 1.6)} ${f1(y - hgt)} L${f1(x - 1.6)} ${f1(y)} Z" fill="${col(p.spines.color)}"/>`;
    }
  }
  // Ribs: dark arcs across the flank, bowed toward the tail.
  if (p.ribs && !hidden) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = 0.18 + (i * 0.74) / n;
      const x = xAt(t);
      clipped += `<path d="M${f1(x)} ${f1(topAt(t) + 0.8)} Q${f1(x - 2.6)} ${f1(midAt(t))} ${f1(x)} ${f1(botAt(t) - 0.8)}" stroke="${col(p.ribs.color)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    }
  }
  // Molten seams between the plates: jagged rings and one along the flank, each a glowing band with a hot core.
  if (p.seams && !hidden) {
    const ds: string[] = [];
    for (let i = 0; i < p.seams.n; i++) {
      const t = 0.22 + (i * 0.6) / Math.max(1, p.seams.n - 1);
      const x = xAt(t);
      const y0 = topAt(t);
      const y1 = botAt(t);
      ds.push(`M${f1(x)} ${f1(y0)} L${f1(x - 2)} ${f1(y0 + (y1 - y0) * 0.3)} L${f1(x - 1)} ${f1(y0 + (y1 - y0) * 0.55)} L${f1(x - 2.6)} ${f1(y0 + (y1 - y0) * 0.8)} L${f1(x - 1)} ${f1(y1)}`);
    }
    let flank = '';
    for (let j = 0; j <= 8; j++) {
      const t = 0.2 + j * 0.08;
      flank += `${j ? 'L' : 'M'}${f1(xAt(t))} ${f1(midAt(t) + (j % 2 ? 1 : -0.3))} `;
    }
    ds.push(flank);
    for (const d of ds) clipped += `<path d="${d}" stroke="${col(p.seams.color)}" stroke-width="2.8" fill="none" stroke-linejoin="round" opacity=".6"/>`;
    for (const d of ds) clipped += `<path d="${d}" stroke="${shiny ? '#fff4c0' : '#ffd890'}" stroke-width=".9" fill="none" stroke-linejoin="round"/>`;
  }
  // Fangs from the upper jaw.
  if (p.fangs && !hidden) {
    const y = midAt(0.03) + 0.6;
    for (let i = 0; i < Math.min(3, p.fangs + 1); i++) {
      const x = HEAD - 2 - i * 2.6;
      const len = i % 2 ? 2 : 3.2;
      over += `<path d="M${f1(x - 0.8)} ${f1(y)} L${f1(x)} ${f1(y + len)} L${f1(x + 0.8)} ${f1(y)} Z" fill="#fffaf0"/>`;
    }
  }
  // The gulper's jaw: a gaping pink mouth beyond the head, needle teeth, and a whip tail with a red lure.
  if (p.jaw !== undefined) {
    const hx = xAt(0.2);
    const tip = 63;
    const ju = 3;
    const jd = 37;
    top += `<path d="M${f1(hx)} ${MID} L${tip} ${ju} Q${tip - 6} ${MID} ${tip} ${jd} Z" fill="${col(p.jaw)}"/>`;
    if (!hidden) {
      top += `<path d="M${f1(hx)} ${MID} L${tip - 4} ${ju + 3} Q${tip - 9} ${MID} ${tip - 4} ${jd - 3} Z" fill="${ihex(imix(shiny ? imix(p.jaw, GOLD, 0.55) : p.jaw, 0x2a0a1a, 0.35))}"/>`;
      for (let i = 0; i < 5; i++) {
        const u = 0.3 + i * 0.16;
        const ax = hx + (tip - hx) * u;
        const ay = MID + (ju - MID) * u + 1.2;
        const by = MID + (jd - MID) * u - 1.2;
        top += `<path d="M${f1(ax - 0.9)} ${f1(ay)} L${f1(ax)} ${f1(ay + 3)} L${f1(ax + 0.9)} ${f1(ay)} Z M${f1(ax - 0.9)} ${f1(by)} L${f1(ax)} ${f1(by - 3)} L${f1(ax + 0.9)} ${f1(by)} Z" fill="#fff"/>`;
      }
    }
    const jaw = col(look.fin);
    top += `<path d="M${f1(hx - 1)} ${MID - 1.5} L${tip + 0.5} ${ju - 1.5} L${tip - 2} ${ju + 1.5} Z M${f1(hx - 1)} ${MID + 1.5} L${tip + 0.5} ${jd + 1.5} L${tip - 2} ${jd - 1.5} Z" fill="${jaw}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.35}" stroke-width=".5"/>`;
  }
  if (p.whip !== undefined) {
    under += `<path d="M${ROOT + 1} ${MID} C${ROOT - 6} ${MID + 8} ${ROOT - 4} ${MID - 9} 4 ${MID - 6}" stroke="${col(look.back)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    if (!hidden) under += glow(3.5, MID - 6, 4, 4, col(p.whip)) + `<circle cx="3.5" cy="${MID - 6}" r="1.5" fill="${col(p.whip)}"/><circle cx="3.2" cy="${MID - 6.4}" r=".5" fill="#fff"/>`;
    else under += `<circle cx="3.5" cy="${MID - 6}" r="1.5" fill="${ink}"/>`;
  }
  // Tentacles: forward and down out of a squid's head (curling under it, as the icon ends at the nose), or a beard.
  if (p.tentacles) {
    const T = p.tentacles;
    const fill = col(T.color);
    const sk = T.suckers !== undefined ? col(T.suckers) : undefined;
    const rng = ctx.rng;
    if (T.dir === 'forward') {
      const n = T.n > 6 ? 5 : 4;
      const w = T.n > 6 ? 4.4 : 3.4;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const bx = HEAD - 3 - u * 4;
        const by = MID - 2 + u * 5;
        const ex = 45 + u * 17 + rng() * 1.5;
        const ey = 37 - (1 - u) * 3 - rng() * 2;
        const wig = i % 2 ? 4 : -4;
        top += arm([[bx, by], [bx + 6, by + 2 + wig * 0.3], [ex - 4 + wig, ey - 8], [ex, ey]], w, fill, sk);
      }
    } else {
      const n = T.n > 5 ? 5 : 3;
      const len = T.len > 0.3 ? 17 : 8;
      const w = T.n > 5 ? 3.4 : 1.8;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const t = (p.halo ? 0.08 : 0.03) + u * (p.halo ? 0.3 : 0.1);
        const bx = xAt(t);
        const by = botAt(t) - (p.halo ? 4 : 1.5);
        const ey = Math.min(39, by + len * (0.85 + rng() * 0.3));
        const ex = bx + (u - 0.5) * 9;
        const wig = i % 2 ? 3 : -3;
        top += arm([[bx, by], [bx + wig, by + len * 0.35], [ex - wig, ey - len * 0.35], [ex + wig * 0.6, ey]], w, fill, sk);
      }
    }
  }
  // Horns: two swept back, or a crown of three.
  if (p.horns) {
    const c = col(p.horns.color);
    const horn = (t: number, L: number, back: number) => {
      const bx = xAt(t);
      const by = topAt(t) + 1.5;
      return `<path d="M${f1(bx + 1.6)} ${f1(by)} Q${f1(bx + 0.6)} ${f1(by - L)} ${f1(bx - back)} ${f1(by - L * 1.05)} Q${f1(bx - 1)} ${f1(by - L * 0.55)} ${f1(bx - 1.8)} ${f1(by)} Z" fill="${c}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.35}" stroke-width=".5"/>`;
    };
    if (p.horns.n === 3) top += horn(0.08, 9, 5) + horn(0.15, 7.5, 5) + horn(0.22, 6, 4.5);
    else top += horn(0.06, 4.5, 5);
  }
  // The Dreamer's halo floats above its head.
  if (p.halo) {
    const hx = xAt(0.2);
    const hy = Math.max(3.2, topAt(0.2) - 5);
    if (!hidden) top += `<ellipse cx="${f1(hx)}" cy="${f1(hy)}" rx="9" ry="2.6" fill="none" stroke="${acc}" stroke-width="3" opacity=".35"/>`;
    top += `<ellipse cx="${f1(hx)}" cy="${f1(hy)}" rx="9" ry="2.6" fill="none" stroke="${hidden ? ink : '#f2fff8'}" stroke-width="1.1"/>`;
  }

  // Eyes: the main one (and the Leviathan's burning row), then the scattered ones.
  const eyeY = (t: number, up: number) => midAt(t) - (midAt(t) - topAt(t)) * up;
  const r0 = p.eye.pupil === 'lamp' ? 2 : Math.max(1.6, Math.min(3.6, p.eye.r * 48));
  for (let i = (p.eyeRow ?? 0); i >= 0; i--) {
    const t = p.eye.t + i * 0.07;
    top += eye(xAt(t), eyeY(t, (p.eye.up ?? 0.3) - i * 0.08) + i * 0.4, r0 * (1 - i * 0.2), iris, p.eye.pupil);
  }
  if (p.eyes) {
    const rng = ctx.rng;
    const pts: [number, number, number][] = [[xAt(p.eye.t), eyeY(p.eye.t, p.eye.up ?? 0.3), r0]];
    const want = Math.min(7, Math.ceil(p.eyes.n / 2));
    for (let tries = 0; tries < 200 && pts.length <= want; tries++) {
      const t = 0.18 + rng() * 0.5;
      const y = topAt(t) + 2.5 + rng() * (botAt(t) - topAt(t) - 5);
      const r = 1.3 + rng() * 1.5;
      const x = xAt(t);
      if (pts.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + r + 0.8)) continue;
      pts.push([x, y, r]);
      top += eye(x, y, r, iris, pts.length % 3 ? 'round' : 'slit');
    }
  }

  // Legends: sparkles in the accent colour.
  if (legend && !hidden) {
    const spark = (x: number, y: number, r: number, c: string) => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="${c}"/>`;
    over += spark(9, 33, 1.8, acc) + spark(33, 37, 1.3, '#fff');
  }
  return { defs, under, behind, clipped, over, top };
}
