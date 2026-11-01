import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHAPES } from '../../data/fishlook';
import type { KelpParts } from '../../data/seaparts/kelp';
import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

// Kelp Deep, "Overgrown": bold colours with a strong gloss, plus leafy kelp parts. Each fish's parts are built once
// per species into a few merged geometries (cached below) and shared by every copy of the fish.

const GOLD = 0xffd23a;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- shared geometry and materials ----------

/** A flat shape from 2D points (x toward the tail, y up), standing in the YZ plane. */
function flat(pts: [number, number][]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  return new THREE.ShapeGeometry(s).rotateY(-Math.PI / 2);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** A copy of `g` moved, turned (Euler XYZ) and scaled. */
function put(g: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] | number = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? ([s, s, s] as const) : s;
  _m.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(...r)), new THREE.Vector3(...sc));
  return g.clone().applyMatrix4(_m);
}

let leafG: THREE.BufferGeometry | null = null;
/** A three-lobed leaf, 1 high from its base at the origin. */
function leaf(): THREE.BufferGeometry {
  return (leafG ??= flat([[-0.1, 0.08], [-0.45, 0.2], [-0.58, 0.5], [-0.3, 0.46], [-0.28, 0.78], [0, 1], [0.28, 0.78], [0.3, 0.46], [0.58, 0.5], [0.45, 0.2], [0.1, 0.08]]));
}
let frillG: THREE.BufferGeometry | null = null;
/** A frill 1 high: a thin stalk with a pair of crossed leaves on top. */
function frill(): THREE.BufferGeometry {
  return (frillG ??= mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.035, 0.5, 4, 1, true).translate(0, 0.25, 0),
    put(leaf(), [0, 0.32, 0], [0, 0, 0], [0.8, 0.68, 0.8]),
    put(leaf(), [0, 0.38, 0], [0, Math.PI / 2, 0], [0.64, 0.56, 0.64]),
  ])!);
}
let spineG: THREE.BufferGeometry | null = null;
const spine = () => (spineG ??= new THREE.CylinderGeometry(0.0015, 0.005, 1, 4, 1, true).translate(0, 0.5, 0));
let tubeG: THREE.BufferGeometry | null = null;
const tubeUnit = () => (tubeG ??= new THREE.CylinderGeometry(1, 1, 1, 5, 1, true));
let moteG: THREE.BufferGeometry | null = null;
const mote = () => (moteG ??= new THREE.OctahedronGeometry(0.011, 0));
let pegG: THREE.BufferGeometry | null = null;
/** A rounded peg: a short stub with a blunt, rounded tip, 1 wide and 1 tall, base at the origin. */
const peg = () => (pegG ??= new THREE.CylinderGeometry(0.55, 1, 1, 6, 1).translate(0, 0.5, 0));
let ballG: THREE.BufferGeometry | null = null;
const ball = () => (ballG ??= new THREE.SphereGeometry(1, 8, 6));

/** A ribbon along a path (x, y, z points) with a half-width at each point; its width runs at angle `a` in the XZ plane. */
function ribbon(path: [number, number, number][], widths: number[], a: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  path.forEach(([x, y, z], i) => {
    pos.push(x - dx * widths[i], y, z - dz * widths[i], x + dx * widths[i], y, z + dz * widths[i]);
    if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(path.length * 4).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const matCache = new Map<string, THREE.Material>();
/** One shared material per kind and colour, so a school of the same fish compiles and uploads it once. */
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}
const leafMat = (c: number) => mat(`leaf${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, flatShading: true, side: THREE.DoubleSide, emissive: new THREE.Color(c).multiplyScalar(0.14) }));
const solidMat = (c: number, rough = 0.5) => mat(`solid${c}|${rough}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, flatShading: true, side: THREE.DoubleSide }));

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Builds a species' merged part once, keyed by fish id and part. */
function cached(key: string, build: () => THREE.BufferGeometry[]): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = mergeGeometries(build())!));
  return g;
}

// ---------- the 3D model ----------

/** Builds the Kelp Deep zone's parts (`FishLook.kelp`) and its finish onto a 3D fish. */
export function kelpModel(ctx: SeaModelCtx): void {
  const { group, look, id, shiny, bodyMat, extents } = ctx;
  const k: KelpParts = look.kelp ?? {};
  const tint = (c: number) => (shiny ? mix(c, GOLD, 0.45) : c);
  const rng = seeded(id);
  const sag = SHAPES[look.shape].sag / SHAPES[look.shape].h;
  /** y of the belly at t (the body drops its belly by `sag`). */
  const belly = (t: number) => -extents(t).y * (1 + sag);
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false;
    group.add(mesh);
  };

  // The finish: a strong clear-coat gloss on the body.
  bodyMat.clearcoat = 1;
  bodyMat.clearcoatRoughness = 0.1;
  bodyMat.roughness = Math.min(bodyMat.roughness, 0.36);

  if (k.frills) {
    const f = k.frills;
    add(cached(`${id}:frills`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < f.n; i++) {
        const t = 0.1 + (i / Math.max(1, f.n - 1)) * 0.78;
        const sz = f.size * (1 - Math.abs(t - 0.4) * 0.6) * (0.9 + rng() * 0.2);
        const side = i % 2 ? 1 : -1;
        gs.push(put(frill(), [side * 0.004, extents(t).y * 0.88, -0.5 + t], [0.45, 0, side * 0.3], sz));
        if (f.belly && i % 2 === 0) {
          const tb = Math.min(0.9, t + 0.03);
          gs.push(put(frill(), [0, belly(tb) * 0.88, -0.5 + tb], [Math.PI - 0.45, 0, side * 0.3], sz * 0.75));
        }
        if (f.flanks && i % 3 === 1) {
          const e = extents(t);
          const s2 = i % 2 ? 1 : -1;
          gs.push(put(frill(), [s2 * e.x * 0.85, -e.y * 0.1, -0.5 + t], [0.3, 0, -s2 * (Math.PI / 2 - 0.35)], sz * 0.8));
        }
      }
      return gs;
    }), leafMat(tint(f.color)));
  }

  if (k.crown) {
    const c = k.crown;
    add(cached(`${id}:crown`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < c.n; i++) {
        const u = c.n > 1 ? i / (c.n - 1) : 0.5;
        const t = 0.1 + u * 0.1;
        const e = extents(t);
        const side = (i % 2 ? 1 : -1) * (0.25 + 0.5 * Math.abs(u - 0.5) * 2);
        gs.push(put(frill(), [side * e.x * 0.5, e.y * 0.92, -0.5 + t], [0.1 + u * 0.4, 0, -side * 1.2], c.size * (1 - Math.abs(u - 0.4) * 0.5) * (0.9 + rng() * 0.2)));
      }
      return gs;
    }), leafMat(tint(c.color)));
  }

  if (k.beard) {
    const b = k.beard;
    const strand = leafMat(tint(b.color));
    add(cached(`${id}:beard`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < b.n; i++) {
        const u = b.n > 1 ? i / (b.n - 1) : 0.5;
        const t = 0.045 + u * 0.05;
        const e = extents(t);
        const x = (rng() - 0.5) * 2 * e.x * 0.7;
        const y0 = belly(t) * 0.7;
        const len = b.len * (0.7 + 0.5 * Math.sin(u * Math.PI) + rng() * 0.15);
        const ph = rng() * 6;
        const path: [number, number, number][] = [];
        const w: number[] = [];
        for (let j = 0; j <= 4; j++) {
          const s = j / 4;
          path.push([x + Math.sin(s * 5 + ph) * 0.012, y0 - s * len, -0.5 + t + s * 0.05 + Math.cos(s * 4 + ph) * 0.012]);
          w.push(0.011 * (1 - s * 0.55));
        }
        gs.push(ribbon(path, w, 0.2 + rng() * 1.1));
        const tip = path[4];
        gs.push(put(leaf(), tip, [Math.PI, rng() * 3, 0], 0.07));
      }
      return gs;
    }), strand);
  }

  if (k.spines) {
    const s = k.spines;
    const mk = (part: 'rod' | 'a' | 'b') => cached(`${id}:spines:${part}`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < s.n; i++) {
        const u = s.n > 1 ? i / (s.n - 1) : 0.5;
        const t = 0.15 + u * 0.38;
        const lean = -0.1 + u * 1.15;
        const len = s.len * (0.62 + 0.38 * Math.sin(Math.min(1, u * 0.8 + 0.2) * Math.PI));
        const p: [number, number, number] = [0, extents(t).y * 0.95, -0.5 + t];
        const r: [number, number, number] = [lean, 0, 0];
        if (part === 'rod') gs.push(put(spine(), p, r, [1, len, 1]));
        else {
          // A flag of membrane along the spine's trailing edge, in four bands.
          for (let b = part === 'a' ? 0 : 1; b < 4; b += 2) {
            const y0 = b / 4;
            const y1 = (b + 1) / 4;
            const w0 = 0.055 * (1 - y0 * 0.55) * (len / 0.3);
            const w1 = 0.055 * (1 - y1 * 0.55) * (len / 0.3);
            gs.push(put(flat([[0.003, y0], [w0, y0], [w1, y1], [0.003, y1]]), p, r, [1, len, 1]));
          }
        }
      }
      return gs;
    });
    add(mk('rod'), solidMat(tint(s.color), 0.5));
    add(mk('a'), solidMat(tint(s.flag), 0.55));
    add(mk('b'), solidMat(tint(s.stripe), 0.55));
  }

  if (k.fans) {
    const fan = k.fans;
    const mk = (part: 'a' | 'b') => cached(`${id}:fans:${part}`, () => {
      const gs: THREE.BufferGeometry[] = [];
      const N = 7;
      for (let i = part === 'a' ? 0 : 1; i < N; i += 2) {
        const R = 0.32 * (1 - Math.abs(i - 3) * 0.06);
        const a0 = 0.55 - (i / N) * 1.9;
        const a1 = 0.55 - ((i + 1) / N) * 1.9;
        const am = (a0 + a1) / 2;
        const pts: [number, number][] = [[0, 0], [R * 0.94 * Math.cos(a0), R * 0.94 * Math.sin(a0)], [R * Math.cos(am), R * Math.sin(am)], [R * 0.94 * Math.cos(a1), R * 0.94 * Math.sin(a1)]];
        for (const sx of [-1, 1]) {
          const e = extents(0.22);
          gs.push(put(flat(pts), [sx * e.x * 0.98, -e.y * 0.08, -0.27], [0, sx * 0.55, sx * 0.1]));
        }
      }
      return gs;
    });
    add(mk('a'), solidMat(tint(fan.color), 0.6));
    add(mk('b'), solidMat(tint(fan.stripe), 0.6));
  }

  if (k.teeth) {
    const th = k.teeth;
    // A heavy, slightly underslung lower jaw in a pale lip colour.
    add(cached(`${id}:jaw`, () => {
      const e = extents(0.07);
      return [put(ball(), [0, -e.y * 0.62, -0.5 + 0.075], [0.12, 0, 0], [e.x * 0.9, e.y * 0.3, 0.075])];
    }), mat(`smooth${tint(th.jowl)}`, () => new THREE.MeshStandardMaterial({ color: tint(th.jowl), roughness: 0.4 })));
    // Rounded peg teeth along the front of the mouth, upper (hanging) and lower (standing).
    add(cached(`${id}:teeth`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (let j = 0; j < th.n; j++) {
        const t = 0.022 + j * 0.026;
        const e = extents(t);
        const r = 0.02 - j * 0.002;
        for (const sx of [-1, 1]) {
          const x = sx * e.x * (0.78 + j * 0.05);
          gs.push(put(peg(), [x, -e.y * 0.38, -0.5 + t], [Math.PI, 0, 0], [r, r * 1.7, r]));
          gs.push(put(peg(), [x, -e.y * 0.52, -0.5 + t + 0.006], [0, 0, 0], [r * 0.9, r * 1.5, r * 0.9]));
        }
      }
      return gs;
    }), mat(`peg${th.color}`, () => new THREE.MeshStandardMaterial({ color: tint(th.color), roughness: 0.3 })));
  }

  if (k.horns) {
    const h = k.horns;
    add(cached(`${id}:horns`, () => {
      const gs: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) {
        const e = extents(0.1);
        const S = 4;
        const seg = h.len / S;
        const rad = [0.014, 0.0105, 0.0072, 0.0038, 0.0005];
        let y = 0;
        let z = 0;
        const horn: THREE.BufferGeometry[] = [];
        for (let j = 0; j < S; j++) {
          const th = -0.1 + j * 0.42;
          const c = new THREE.CylinderGeometry(rad[j + 1], rad[j], seg * 1.05, 5, 1, true).translate(0, seg / 2, 0);
          horn.push(put(c, [0, y, z], [th, 0, 0]));
          y += Math.cos(th) * seg;
          z += Math.sin(th) * seg;
        }
        const m = mergeGeometries(horn)!;
        gs.push(put(m, [sx * e.x * 0.55, e.y * 0.78, -0.4], [0, 0, -sx * 0.5]));
      }
      return gs;
    }), solidMat(tint(h.color), 0.32));
  }

  if (k.motes) {
    const m = new THREE.MeshBasicMaterial({ color: tint(0xc8f06a) });
    for (let i = 0; i < k.motes; i++) {
      const t = 0.1 + rng() * 0.8;
      const e = extents(t);
      const a = rng() * Math.PI * 2;
      const o = new THREE.Mesh(mote(), m);
      o.position.set(Math.cos(a) * (e.x + 0.08 + rng() * 0.06), Math.sin(a) * (e.y + 0.1 + rng() * 0.08), -0.5 + t);
      group.add(o);
      ctx.twinkle.push(o);
    }
  }
}

// ---------- the icon ----------

const f1 = (n: number) => n.toFixed(1);

/** Draws the Kelp Deep zone's parts and finish onto a fish icon. */
export function kelpIcon(ctx: SeaIconCtx): SeaIconLayers | null {
  const k = ctx.look.kelp;
  if (!k) return null;
  const { hidden, shiny, HEAD, MID, PX, topAt, botAt, xAt, ink } = ctx;
  // Hidden fish are all ink; shinies pull their colours toward gold.
  const col = (c: number) => (hidden ? ink : hex(shiny ? mix(c, GOLD, 0.45) : c));
  const stroke = hidden ? ink : '#2a1b0f';
  const so = hidden ? 1 : 0.22;
  let behind = '';
  let over = '';
  let top = '';

  /** A leafy frill: a stalk from (bx, by) growing up (dir -1) or down (1), with a lobed leaf on its end. */
  const frill = (bx: number, by: number, dir: number, size: number, c: string, lean = 0) => {
    const ex = bx - size * 0.5 + lean;
    const ey = by + dir * size;
    return `<path d="M${f1(bx)} ${f1(by)} Q${f1(bx + 1.5)} ${f1(by + dir * size * 0.5)} ${f1(ex)} ${f1(ey)}" stroke="${c}" stroke-width="1.6" fill="none"/>`
      + `<path d="M${f1(ex)} ${f1(ey)} q${f1(-size * 0.5)} ${f1(dir * size * 0.1)} ${f1(-size * 0.55)} ${f1(dir * size * 0.5)} q${f1(size * 0.35)} ${f1(dir * size * 0.05)} ${f1(size * 0.7)} ${f1(-dir * size * 0.2)} q${f1(size * 0.25)} ${f1(dir * size * 0.4)} ${f1(size * 0.55)} ${f1(dir * size * 0.3)} q${f1(-size * 0.05)} ${f1(-dir * size * 0.5)} ${f1(-size * 0.35)} ${f1(-dir * size * 0.65)} Z" fill="${c}" stroke="${stroke}" stroke-opacity="${so}" stroke-width=".5"/>`;
  };

  if (k.frills) {
    const f = k.frills;
    const c = col(f.color);
    const size = Math.min(7.5, f.size * 48);
    for (let i = 0; i < f.n; i++) {
      const t = 0.1 + (i / Math.max(1, f.n - 1)) * 0.78;
      const sz = size * (1 - Math.abs(t - 0.4) * 0.6);
      behind += frill(xAt(t), topAt(t) + 1, -1, sz, c);
      if (f.belly && i % 2 === 0) behind += frill(xAt(t + 0.03), botAt(t + 0.03) - 1, 1, sz * 0.75, c);
    }
  }

  if (k.crown) {
    const cr = k.crown;
    const c = col(cr.color);
    for (let i = 0; i < cr.n; i++) {
      const u = cr.n > 1 ? i / (cr.n - 1) : 0.5;
      const t = 0.1 + u * 0.24;
      behind += frill(xAt(t), topAt(t) + 1.5, -1, Math.min(8, cr.size * 30) * (1 - Math.abs(u - 0.4) * 0.5), c, (u - 0.5) * 2);
    }
  }

  if (k.beard) {
    const b = k.beard;
    const c = col(b.color);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = HEAD - 1 - i * 2.6;
      const y = botAt(0.05 + i * 0.03) - 1.5;
      const len = Math.min(10, b.len * 34) * (0.7 + 0.4 * Math.sin((i / (n - 1)) * Math.PI));
      const sw = i % 2 ? 2 : -2;
      over += `<path d="M${f1(x)} ${f1(y)} q${sw} ${f1(len * 0.5)} ${-sw * 0.4} ${f1(len)}" stroke="${c}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`
        + `<ellipse cx="${f1(x - sw * 0.4)}" cy="${f1(y + len + 0.6)}" rx="1.1" ry="1.5" fill="${c}" stroke="${stroke}" stroke-opacity="${so}" stroke-width=".3"/>`;
    }
  }

  if (k.spines) {
    const s = k.spines;
    const rod = col(s.color);
    const flag = col(s.flag);
    const bar = col(s.stripe);
    const n = Math.min(s.n, 7);
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      const t = 0.17 + u * 0.36;
      const bx = xAt(t);
      const by = topAt(t) + 1;
      const a = -0.35 + u * 1.15; // lean toward the tail
      const len = Math.min(13, s.len * 42) * (0.7 + 0.3 * Math.sin(Math.min(1, u * 0.8 + 0.2) * Math.PI));
      const ex = bx - Math.sin(a) * len;
      const ey = by - Math.cos(a) * len;
      // The flag trails behind the spine; its stripes are dashes over it.
      const ox = -Math.cos(a) * 1.6;
      const oy = Math.sin(a) * 1.6;
      const d = `M${f1(bx + ox)} ${f1(by + oy)} L${f1(ex + ox)} ${f1(ey + oy)}`;
      behind += `<path d="${d}" stroke="${flag}" stroke-width="3" stroke-linecap="round"/>`
        + (hidden ? '' : `<path d="${d}" stroke="${bar}" stroke-width="3" stroke-dasharray="2.2 2.2"/>`)
        + `<path d="M${f1(bx)} ${f1(by)} L${f1(ex)} ${f1(ey)}" stroke="${rod}" stroke-width=".9" stroke-linecap="round"/>`;
    }
  }

  if (k.fans) {
    const fan = k.fans;
    const a = col(fan.color);
    const b = col(fan.stripe);
    const px = xAt(0.26);
    const py = MID + 3;
    const R = 15;
    const N = 5;
    for (let i = 0; i < N; i++) {
      const a0 = -0.15 + (i / N) * 1.5;
      const a1 = -0.15 + ((i + 1) / N) * 1.5;
      const r = R * (1 - Math.abs(i - 2) * 0.07);
      // Rays fan back and down from the base; angles measured from straight back toward the tail (left).
      const pt = (an: number, rr: number) => `${f1(px - Math.cos(an) * rr)} ${f1(py + Math.sin(an) * rr * 0.9)}`;
      over += `<path d="M${f1(px)} ${f1(py)} L${pt(a0, r * 0.94)} L${pt((a0 + a1) / 2, r)} L${pt(a1, r * 0.94)} Z" fill="${i % 2 ? b : a}" stroke="${stroke}" stroke-opacity="${so}" stroke-width=".4"/>`;
    }
  }

  if (k.teeth) {
    const th = k.teeth;
    // A heavy pale lower jaw with a couple of peg teeth above and below the mouth line.
    over += `<path d="M${f1(xAt(0.2))} ${f1(MID + 4.2)} Q${f1(xAt(0.1))} ${f1(MID + 5.6)} ${f1(HEAD + 0.5)} ${f1(MID + 3)} L${f1(HEAD + 0.5)} ${f1(MID + 1.2)} L${f1(xAt(0.2))} ${f1(MID + 1.8)} Z" fill="${col(th.jowl)}" stroke="${stroke}" stroke-opacity="${so}" stroke-width=".5"/>`;
    for (let j = 0; j < 3; j++) {
      const x = HEAD - 1.2 - j * 2.6;
      const c = col(th.color);
      top += `<path d="M${f1(x - 1)} ${f1(MID + 1.2)} l1 2.2 1-2.2z M${f1(x - 0.8)} ${f1(MID + 3.3)} l.8-2 .8 2z" fill="${c}" stroke="${stroke}" stroke-opacity=".35" stroke-width=".3"/>`;
    }
  }

  if (k.horns) {
    const h = k.horns;
    const c = col(h.color);
    const len = Math.min(11, h.len * 70);
    for (const s of [0, 1]) {
      const bx = HEAD - 0.12 * PX - s * 3;
      const by = topAt(0.12) + 1;
      over += `<path d="M${f1(bx)} ${f1(by)} Q${f1(bx - 1 + s * 1.5)} ${f1(by - len * 0.7)} ${f1(bx - len * 0.7 + s * 1.5)} ${f1(by - len)}" stroke="${c}" stroke-width="2.1" stroke-linecap="round" fill="none"/>`;
    }
  }

  if (k.motes && !hidden) {
    const r = ctx.rng;
    for (let i = 0; i < Math.min(3, k.motes); i++) {
      const x = 8 + r() * 48;
      const y = i % 2 ? 36 + r() * 2 : 3 + r() * 3;
      top += `<path d="M${f1(x)} ${f1(y - 1.8)}l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="${shiny ? '#fff6c2' : '#d8f58a'}"/>`;
    }
  }

  // The finish: a bold gloss streak on the back (hidden fish stay a plain silhouette).
  if (!hidden) over += `<ellipse cx="${f1(HEAD - 0.36 * PX)}" cy="${f1(topAt(0.36) + 1.6)}" rx="${f1(PX * 0.2)}" ry=".9" fill="#fff" opacity=".6"/>`;

  return { behind, over, top };
}
