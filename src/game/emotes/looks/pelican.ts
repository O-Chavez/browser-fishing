/**
 * The toy Pelican the Abyss's emote rides (`abyss.ts`): a chunky copy of the charter boat (src/game/boat.ts) with
 * Captain Reed at the wheel, her hull's outline at the toy's size, and the rules that keep the legends out of her: a
 * hard one for bodies (`clearOfBoat`), a smooth field for the Kraken's arms (`smoothClear`, so they never jump from frame
 * to frame) and how far she reaches round the player (`hullReach`).
 */
import * as THREE from 'three';
import { BOAT, KEEL, hullChine, hullHalfWidth, hullSheer } from '../../../data/sea';
import { clamp01, lerp, smoothstep } from '../kit';
import { TAU, type V3 } from '../meshes';
import { mergeParts, part } from './legends';

const H = Math.PI / 2;

/** The Pelican's paint, as src/game/boat.ts has it. */
const PEL = {
  hull: 0x4a6fa5,
  bottom: 0xa8483a,
  cap: 0x9b7248,
  inner: 0xeadfca,
  cabin: 0xf3ead8,
  glass: 0x34465e,
  roof: 0xc0453a,
  wood: 0x5b4128,
  buoy: 0xe8823f,
  net: 0x6f9a5a,
  crate: 0x9c7a4a,
  crateDark: 0x8a5a30,
  stripe: 0xf4f1ea,
  metal: 0xb9c0c6,
  iron: 0x3b3f45,
  deck: 0xc89a68,
  coat: 0x2f4f4f,
  hat: 0x2b2b2b,
  skin: 0xf1c7a0,
};
/** Where the player stands on her deck, in her own metres along her length: aft of the wheelhouse, the game's spawn. */
export const PEL_SPOT = BOAT.spawn.x;

/** The hull's cross-section at `x` along the boat (her own metres), as boat.ts lays it out from the shared hull lines. */
function pelSection(x: number) {
  const u = clamp01((x + BOAT.len / 2) / BOAT.len);
  const w = Math.max(0.02, hullHalfWidth(x));
  const top = hullSheer(u);
  const keel = KEEL * (1 - 0.6 * Math.pow(u, 3));
  const chine = hullChine(u);
  const iw = Math.max(0.01, w * (1 - 0.12 * ((top - BOAT.deck) / (top - chine))) - BOAT.wall);
  return { x, w, top, keel, chine, iw };
}

/**
 * The Pelican at full size in her own metres (bow to +x, starboard to -z), a chunky copy of src/game/boat.ts: the
 * blue hull on the game's hull lines with its red bottom, white stripe, rub rail, wood rail cap and cream bulwarks,
 * the plank deck, the cream wheelhouse and bridge under red roofs, Captain Reed at the wheel, the mast, radar,
 * A-frame and net drum, the life ring, fish boxes, barrel and hatch, and lit windows and running lights. Built here
 * because the game's `Boat` brings point lights, a line mesh and its own textures.
 */
export function pelican(dark: number): { group: THREE.Group; radar: THREE.Object3D } {
  const L = BOAT.len;
  const D = BOAT.deck;
  const W = BOAT.wheelhouse;
  const S = -L / 2;
  const B = { x: W + 0.1, sill: 2.65, head: 3.28, roof: 3.46 };
  const MAST = { x: W - 0.4, top: 5.9, yard: 5.05 };
  const tris = new Map<number, number[]>();
  const put = (c: number, ...p: V3[]) => {
    let arr = tris.get(c);
    if (!arr) tris.set(c, (arr = []));
    for (const v of p) arr.push(...v);
  };
  const Q = (c: number, a: V3, b: V3, cc: V3, d: V3) => put(c, a, b, cc, a, cc, d);
  const secs = Array.from({ length: 13 }, (_, k) => pelSection(S + (k / 12) * L));
  type Sec = ReturnType<typeof pelSection>;
  const skin = (s: Sec, y: number, sg: number, off: number): V3 => {
    const yy = Math.max(y, s.chine);
    return [s.x, yy, sg * (s.w * (1 - 0.12 * clamp01((s.top - yy) / (s.top - s.chine))) + off)];
  };
  for (let k = 0; k < 12; k++) {
    const a = secs[k];
    const b = secs[k + 1];
    for (const sg of [1, -1]) {
      Q(PEL.hull, [a.x, a.top, sg * a.w], [b.x, b.top, sg * b.w], [b.x, b.chine, sg * b.w * 0.88], [a.x, a.chine, sg * a.w * 0.88]);
      Q(PEL.bottom, [a.x, a.chine, sg * a.w * 0.88], [b.x, b.chine, sg * b.w * 0.88], [b.x, b.keel, 0], [a.x, a.keel, 0]);
      Q(PEL.cap, [a.x, a.top, sg * a.w], [b.x, b.top, sg * b.w], [b.x, b.top, sg * b.iw], [a.x, a.top, sg * a.iw]);
      Q(PEL.inner, [a.x, a.top, sg * a.iw], [b.x, b.top, sg * b.iw], [b.x, D, sg * b.iw], [a.x, D, sg * a.iw]);
      Q(PEL.bottom, skin(a, 0.16, sg, 0.012), skin(b, 0.16, sg, 0.012), skin(b, -0.1, sg, 0.012), skin(a, -0.1, sg, 0.012));
      Q(PEL.stripe, skin(a, 0.3, sg, 0.016), skin(b, 0.3, sg, 0.016), skin(b, 0.16, sg, 0.016), skin(a, 0.16, sg, 0.016));
      Q(PEL.cap, skin(a, a.top - 0.1, sg, 0.06), skin(b, b.top - 0.1, sg, 0.06), skin(b, b.top - 0.22, sg, 0.06), skin(a, a.top - 0.22, sg, 0.06));
    }
    Q(PEL.deck, [a.x, D, a.iw], [b.x, D, b.iw], [b.x, D, -b.iw], [a.x, D, -a.iw]);
  }
  // The transom: a fan over the stern's outline, up to the rail.
  const s0 = secs[0];
  const tr: V3[] = [[S, s0.top, s0.w], [S, s0.chine, s0.w * 0.88], [S, s0.keel, 0], [S, s0.chine, -s0.w * 0.88], [S, s0.top, -s0.w]];
  const tc: V3 = [S, (s0.top + s0.keel) / 2, 0];
  for (let k = 0; k < 4; k++) put(PEL.hull, tc, tr[k], tr[k + 1]);
  put(PEL.hull, tc, tr[4], tr[0]);
  const body: THREE.BufferGeometry[] = [];
  for (const [c, arr] of tris) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    body.push(part(g, c));
  }
  const box = (w: number, h: number, d: number, c: number, p: V3, r?: V3) => body.push(part(new THREE.BoxGeometry(w, h, d), c, { p, r }));
  const cyl = (r0: number, r1: number, h: number, n: number, c: number, p: V3, r?: V3) => body.push(part(new THREE.CylinderGeometry(r0, r1, h, n), c, { p, r }));
  // The wheelhouse and its red roof, the bridge on top with its corner posts, header and roof, and the wheel.
  box(2.0, 1.9, 2.0, PEL.cabin, [W, 1.4, 0]);
  box(2.3, 0.14, 2.3, PEL.roof, [W, 2.32, 0]);
  box(1.6, B.sill - 2.39, 1.7, PEL.cabin, [B.x, (B.sill + 2.39) / 2, 0]);
  box(1.6, 0.12, 1.7, PEL.cabin, [B.x, B.head + 0.06, 0]);
  box(1.95, 0.14, 2.05, PEL.roof, [B.x + 0.05, B.roof, 0]);
  for (const [dx, dz] of [[-0.75, -0.8], [-0.75, 0.8], [0.75, -0.8], [0.75, 0.8]]) box(0.12, B.head - B.sill, 0.12, PEL.cabin, [B.x + dx, (B.head + B.sill) / 2, dz]);
  box(0.3, 0.16, 1.3, PEL.wood, [B.x + 0.6, B.sill + 0.08, 0]);
  body.push(part(new THREE.TorusGeometry(0.17, 0.035, 4, 10), PEL.wood, { p: [B.x + 0.4, B.sill + 0.27, 0], r: [0, H, 0] }));
  // Captain Reed at the wheel: his coat, his cap and his face toward the bow.
  body.push(part(new THREE.CapsuleGeometry(0.3, 0.6, 3, 8), PEL.coat, { p: [B.x - 0.2, B.sill - 0.5, 0] }));
  body.push(part(new THREE.SphereGeometry(0.22, 8, 6), PEL.skin, { p: [B.x - 0.2, B.sill + 0.24, 0] }));
  cyl(0.26, 0.26, 0.04, 10, PEL.hat, [B.x - 0.12, B.sill + 0.42, 0]);
  body.push(part(new THREE.SphereGeometry(0.22, 8, 4, 0, TAU, 0, H), PEL.hat, { p: [B.x - 0.2, B.sill + 0.42, 0] }));
  // Door and window frames on the wheelhouse.
  box(0.55, 1.25, 0.05, PEL.wood, [W - 0.65, 1.1, -1.01]);
  for (const sg of [-1, 1]) {
    box(0.54, 0.07, 0.05, PEL.cap, [W + 0.4, 1.92, sg * 1.02]);
    box(0.54, 0.07, 0.05, PEL.cap, [W + 0.4, 1.38, sg * 1.02]);
  }
  // The mast and yard, the radar's post, the aerial and the pennant.
  cyl(0.07, 0.09, MAST.top - B.roof, 6, PEL.wood, [MAST.x, (MAST.top + B.roof) / 2, 0]);
  box(0.07, 0.07, 1.0, PEL.wood, [MAST.x, MAST.yard, 0]);
  cyl(0.06, 0.08, 0.22, 6, PEL.metal, [B.x + 0.55, B.roof + 0.15, 0]);
  body.push(part(new THREE.ConeGeometry(0.16, 0.85, 3), PEL.buoy, { p: [MAST.x - 0.42, MAST.top - 0.25, 0.25], r: [0, -0.6, H], s: [1, 1, 0.25] }));
  // The A-frame over the stern, the net drum under it, and the life ring.
  for (const sg of [-1, 1]) box(0.14, 2.4, 0.14, PEL.wood, [S + 0.15, 1.6, sg * 1.5]);
  box(0.16, 0.16, 3.2, PEL.wood, [S + 0.15, 2.8, 0]);
  cyl(0.42, 0.42, 1.35, 10, PEL.net, [S + 0.65, 0.95, 0], [H, 0, 0]);
  for (const sg of [-1, 1]) cyl(0.5, 0.5, 0.06, 10, PEL.iron, [S + 0.65, 0.95, sg * 0.7], [H, 0, 0]);
  for (let i = 0; i < 4; i++) body.push(part(new THREE.SphereGeometry(0.12, 6, 4), PEL.buoy, { p: [S + 0.65 + Math.cos(i * 1.6) * 0.43, 0.95 + Math.sin(i * 1.6) * 0.43, (i - 1.5) * 0.3] }));
  body.push(part(new THREE.TorusGeometry(0.3, 0.09, 4, 10), PEL.buoy, { p: [W + 0.05, 1.55, -1.04] }));
  // Fish boxes by the port rail, a barrel aft, and the hold's hatch.
  box(0.6, 0.3, 0.42, PEL.crate, [-0.1, 0.6, 1.2]);
  box(0.6, 0.3, 0.42, PEL.crate, [0.5, 0.6, 1.2]);
  box(0.6, 0.3, 0.42, PEL.crate, [0.2, 0.9, 1.15], [0, 0.15, 0]);
  cyl(0.3, 0.3, 0.7, 8, PEL.crateDark, [S + 1.7, 0.8, 1.45]);
  box(1.3, 0.06, 1.1, PEL.wood, [-2.7, D + 0.03, 0.35]);
  const bodyMesh = new THREE.Mesh(mergeParts(body), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }));

  // Windows dark by day and lit from inside after dark; the masthead light and the running lights (green to starboard).
  const pane = new THREE.Color(PEL.glass).lerp(new THREE.Color(0xffcf80), dark).getHex();
  const lamp = 0.55 + 0.45 * dark;
  const glow = mergeParts([
    part(new THREE.BoxGeometry(0.42, 0.47, 0.03), pane, { p: [W + 0.4, 1.65, -1.02] }),
    part(new THREE.BoxGeometry(0.42, 0.47, 0.03), pane, { p: [W + 0.4, 1.65, 1.02] }),
    part(new THREE.BoxGeometry(0.03, 0.47, 0.62), pane, { p: [W + 1.02, 1.65, -0.45] }),
    part(new THREE.BoxGeometry(0.03, 0.47, 0.62), pane, { p: [W + 1.02, 1.65, 0.45] }),
    part(new THREE.BoxGeometry(0.03, 0.5, 0.62), pane, { p: [W - 1.02, 1.75, 0.5] }),
    part(new THREE.SphereGeometry(0.12, 6, 4), 0xfff0c8, { p: [MAST.x, MAST.top + 0.1, 0] }, { k: lamp }),
    part(new THREE.BoxGeometry(0.16, 0.16, 0.06), 0x3fe08a, { p: [B.x + 0.5, B.sill - 0.08, -0.9] }, { k: lamp }),
    part(new THREE.BoxGeometry(0.16, 0.16, 0.06), 0xff4a3a, { p: [B.x + 0.5, B.sill - 0.08, 0.9] }, { k: lamp }),
  ]);
  const glowMesh = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true }));
  const radar = new THREE.Mesh(part(new THREE.BoxGeometry(0.9, 0.09, 0.16), PEL.stripe), bodyMesh.material);
  radar.position.set(B.x + 0.55, B.roof + 0.3, 0);
  const group = new THREE.Group();
  group.add(bodyMesh, glowMesh, radar);
  return { group, radar };
}

/** The toy Pelican at scale `s`: where her bow and stern fall along the deck (z, the player at 0) and her half-width. */
export interface ToyHull {
  s: number;
  bow: number;
  stern: number;
  half(z: number): number;
}
export function toyHull(s: number): ToyHull {
  const bow = (BOAT.len / 2 - PEL_SPOT) * s;
  const stern = (-BOAT.len / 2 - PEL_SPOT) * s;
  return { s, bow, stern, half: (z) => hullHalfWidth(Math.min(bow, Math.max(stern, z)) / s + PEL_SPOT) * s };
}

// ---------- keeping the legends out of her (all in her own frame: deck at y 0, bow +z, the player at the origin) ----------

/** The rail's height over the deck along the toy, rising toward the bow. */
const railTop = (z: number): number => 0.13 + 0.22 * smoothstep(0.9, 1.9, z);

/** Pushes `p` out of an axis-aligned box (not through its floor), returns whether it moved. */
function outOfBox(p: THREE.Vector3, hx: number, y0: number, y1: number, z0: number, z1: number): boolean {
  if (Math.abs(p.x) >= hx || p.y <= y0 || p.y >= y1 || p.z <= z0 || p.z >= z1) return false;
  const side = hx - Math.abs(p.x);
  const up = y1 - p.y;
  const back = p.z - z0;
  const fore = z1 - p.z;
  const m = Math.min(side, up, back, fore);
  if (m === up) p.y = y1;
  else if (m === side) p.x = Math.sign(p.x || 1) * hx;
  else if (m === back) p.z = z0;
  else p.z = z1;
  return true;
}

/**
 * Keeps a point of a legend's body (`r` its thickness there) out of the boat and the player: out of the hull (below
 * the rail, inside her outline) over the rail or off her side, out of the wheelhouse, the bridge and the mast, and out
 * of a column round the player.
 */
export function clearOfBoat(p: THREE.Vector3, r: number, hull: ToyHull): void {
  const m = 0.04 + r;
  // Down to her keel (below that is open water, under the sea's surface).
  if (p.z > hull.stern - m && p.z < hull.bow + m && p.y > -0.32 - m) {
    const half = hull.half(p.z) * (p.z > hull.bow - 0.35 ? Math.max(0.15, (hull.bow - p.z) / 0.35) : 1);
    const hw = half + m;
    // Her deck inside the bulwarks, the rail along her sides: above the water anything in her is lifted onto them;
    // below it, out of her side.
    const top = (Math.abs(p.x) > half - 0.09 ? railTop(p.z) : 0) + m;
    if (Math.abs(p.x) < hw && p.y < top) {
      if (p.y > -0.12) p.y = top;
      else p.x = Math.sign(p.x || 1) * hw;
    }
  }
  outOfBox(p, 0.32 + r, 0, 0.84 + r, 0.68 - r, 1.32 + r);
  outOfBox(p, 0.08 + r, 0.7, 1.42 + r, 0.84 - r, 0.98 + r);
  const pr = 0.44 + r;
  const d = Math.hypot(p.x, p.z);
  if (d < pr && p.y > -0.2 && p.y < 2.45 + r) {
    if (2.45 + r - p.y < pr - d) p.y = 2.45 + r;
    else if (d < 1e-4) p.x = pr;
    else {
      p.x *= pr / d;
      p.z *= pr / d;
    }
  }
}

/** A smooth max: never below either, rounded where they meet (`k` wide). */
const smax = (a: number, b: number, k: number): number => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

/**
 * Keeps a point of a Kraken arm (`r` its thickness) out of the boat and the player with a field that changes smoothly
 * in space and time, so an arm can't snap: over her outline it's lifted onto a smooth height map of her deck, rail,
 * wheelhouse and mast (only above her keel), and it's eased out of a column round the player.
 */
export function smoothClear(p: THREE.Vector3, r: number, hull: ToyHull): void {
  const zc = Math.min(hull.bow, Math.max(hull.stern, p.z));
  const half = hull.half(zc) * (p.z > hull.bow - 0.35 ? Math.max(0.15, (hull.bow - p.z) / 0.35) : 1);
  const out = Math.max(Math.abs(p.x) - half, hull.stern - p.z, p.z - hull.bow);
  const over = 1 - smoothstep(-0.03, 0.1 + r, out);
  if (over > 0) {
    let Hh = railTop(p.z) * smoothstep(half - 0.16, half - 0.04, Math.abs(p.x)) + r + 0.02;
    const wh = (1 - smoothstep(0.32 + r + 0.08, 0.32 + r + 0.35, Math.abs(p.x))) * (1 - smoothstep(r + 0.08, r + 0.35, Math.max(0.68 - p.z, p.z - 1.32)));
    Hh = lerp(Hh, Math.max(Hh, 0.84 + r + 0.02), wh);
    const mh = 1 - smoothstep(0.07, 0.18 + r, Math.hypot(p.x, p.z - 0.91));
    Hh = lerp(Hh, Math.max(Hh, 1.42 + r), mh);
    p.y = lerp(p.y, smax(p.y, Hh, 0.06), over * smoothstep(-0.5, -0.22, p.y));
  }
  const R = 0.44 + r;
  const d = Math.hypot(p.x, p.z);
  if (d < R + 0.6 && d > 1e-4) {
    const k = lerp(1, smax(d, R, 0.08) / d, smoothstep(-0.25, 0.05, p.y) * (1 - smoothstep(2.4, 2.7, p.y)) * (1 - smoothstep(R + 0.3, R + 0.6, d)));
    p.x *= k;
    p.z *= k;
  }
}

/** How far the boat reaches from her middle in each direction (72 steps round), to keep the legends' bodies clear of her. */
export function hullReach(hull: ToyHull): Float32Array {
  const out = new Float32Array(72);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    let r = 0;
    for (let d = 0; d < 3; d += 0.02) {
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (z > hull.stern && z < hull.bow && Math.abs(x) < hull.half(z)) r = d;
    }
    out[i] = r;
  }
  return out;
}
/** The boat's reach in direction `a` (radians, her own frame), between `hullReach`'s steps. */
export const reachAt = (tab: Float32Array, a: number): number => {
  const f = ((((a / TAU) % 1) + 1) % 1) * 72;
  const i = Math.floor(f);
  return lerp(tab[i % 72], tab[(i + 1) % 72], f - i);
};
