import * as THREE from 'three';
import { LAKE } from '../data/lake';
import { groundHeight, mulberry, terrainHeight } from './env';
import { speckleTexture } from './textures';
import { NET_DEFINES } from './underwater';

/**
 * What the lake's look needs from its bed, made once in code at load: the bed's height for the surface to thin out
 * over at the shore, the sun's net of light, and the stones in the shallows.
 */

/** The bed's height map covers ±BED_HALF m round the lake's middle (its shore is never more than 55 m out). */
export const BED_HALF = 64;
export const BED_N = 512;
/**
 * The heights it holds, two bytes a texel: finely near the waterline (the surface's soft edge and, in lite graphics,
 * its foam line) and coarsely down to the deep (how much the surface veils in lite graphics). Beyond, clamped.
 */
export const BED_RANGE: [low: number, high: number] = [-1, 0.6];
export const BED_DEEP: [low: number, high: number] = [-8, 1];

/**
 * The bed's height as the terrain mesh draws it (on its flat triangles), over BED_RANGE and then BED_DEEP, laid
 * straight from the mesh's triangles: `points` are its x, z pairs, `heights` one a point, `index` its triangles.
 * Row j, column i is at x, z = ((i + 0.5) / BED_N - 0.5) * 2 * BED_HALF, likewise z from j.
 */
export function bakeBed(points: ArrayLike<number>, heights: ArrayLike<number>, index: ArrayLike<number>): Uint8Array {
  const data = new Uint8Array(BED_N * BED_N * 2).fill(255);
  const [low, high] = BED_RANGE;
  const [dLow, dHigh] = BED_DEEP;
  const cell = (2 * BED_HALF) / BED_N;
  // Texel i's centre is at x = (i + 0.5) * cell - BED_HALF.
  const col = (x: number) => (x + BED_HALF) / cell - 0.5;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ax = points[a * 2], az = points[a * 2 + 1], bx = points[b * 2], bz = points[b * 2 + 1], cx = points[c * 2], cz = points[c * 2 + 1];
    const i0 = Math.max(0, Math.ceil(col(Math.min(ax, bx, cx)))), i1 = Math.min(BED_N - 1, Math.floor(col(Math.max(ax, bx, cx))));
    const j0 = Math.max(0, Math.ceil(col(Math.min(az, bz, cz)))), j1 = Math.min(BED_N - 1, Math.floor(col(Math.max(az, bz, cz))));
    if (i0 > i1 || j0 > j1) continue;
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const ha = heights[a], hb = heights[b], hc = heights[c];
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - BED_HALF;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell - BED_HALF;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const h = u * ha + v * hb + (1 - u - v) * hc;
        const k = (j * BED_N + i) * 2;
        data[k] = Math.round(255 * Math.min(1, Math.max(0, (h - low) / (high - low))));
        data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, (h - dLow) / (dHigh - dLow))));
      }
    }
  }
  return data;
}

/** The baked bed as a texture for the surface's shader (linear, so the shore's edge is smooth between texels). */
export function bedTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, BED_N, BED_N, THREE.RGFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

let net: THREE.DataTexture | null = null;

/**
 * Tiling texture, shared: R a net of light (the soft edges of cells, four by four to a tile), G soft noise (the bed's
 * zones and foam break up along it).
 */
export function netTexture(): THREE.DataTexture {
  if (net) return net;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd = mulberry(77123);
  // A jittered grid of cell centres, so no two cells crowd each other.
  const G = 4;
  const pts: [number, number][] = [];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) pts.push([(i + 0.15 + rnd() * 0.7) / G, (j + 0.15 + rnd() * 0.7) / G]);
  const waves = Array.from({ length: 7 }, (_, i) => ({ fx: Math.round((rnd() - 0.5) * (4 + i * 2)), fy: Math.round((rnd() - 0.5) * (4 + i * 2)) || 1, ph: rnd() * 6.28, a: 1 / (1 + i * 0.5) }));
  const total = waves.reduce((t, w) => t + w.a, 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S;
      // The nearest and second-nearest cell centres (wrapping): light gathers where they are about as near.
      let f1 = 9, f2 = 9;
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px), dy = Math.abs(v - py);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const e = Math.min(1, Math.max(0, 1 - (f2 - f1) / 0.075));
      let nz = 0;
      for (const w of waves) nz += w.a * Math.cos(2 * Math.PI * (w.fx * u + w.fy * v) + w.ph);
      const k = (y * S + x) * 4;
      data[k] = Math.round(255 * e * e * (3 - 2 * e));
      data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * (nz / total) * 1.9)));
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return (net = t);
}

/** Pebbles and stones in clusters on the bed in the shallows and along the wet sand: one instanced draw. */
export function buildStones(): THREE.InstancedMesh {
  const N = LAKE.stones;
  const geo = new THREE.DodecahedronGeometry(1);
  // Darker underneath.
  const gp = geo.getAttribute('position');
  const gc = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) gc.fill(0.74 + 0.36 * THREE.MathUtils.smoothstep(gp.getY(i), -0.8, 0.9), i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true, map: speckleTexture() });
  // They catch the sun's net of light under water, like the bed.
  mat.defines = { ...NET_DEFINES };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const rnd = mulberry(8123);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  const tints = [0x7a756a, 0x8f8066, 0x5f6466, 0x9a8f78, 0x4f5052, 0x6e5f4e];
  let n = 0;
  for (let tries = 0; n < N && tries < 40000; tries++) {
    // A patch's middle round the cove and the near shores, then a handful round it.
    const cx = -42 + rnd() * 84, cz = -48 + rnd() * 62;
    const ch = groundHeight(cx, cz);
    if (ch > 0.12 || ch < -1.7) continue;
    const k = 3 + Math.floor(rnd() * 9);
    for (let i = 0; i < k && n < N; i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 1.7;
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      const y = terrainHeight(x, z);
      if (y > 0.12 || y < -1.9) continue;
      const big = rnd() < 0.1 && y < -0.45;
      const r = big ? 0.16 + rnd() * 0.14 : 0.045 + rnd() * 0.09;
      q.setFromEuler(e.set(rnd() * 3, rnd() * 6, rnd() * 3));
      mesh.setMatrixAt(n, m.compose(p.set(x, y + r * 0.22, z), q, s.set(r * (0.9 + rnd() * 0.5), r * (0.5 + rnd() * 0.3), r * (0.8 + rnd() * 0.5))));
      mesh.setColorAt(n++, c.set(tints[Math.floor(rnd() * tints.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
    }
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  return mesh;
}
