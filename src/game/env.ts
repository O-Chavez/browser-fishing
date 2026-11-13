import { BOAT, inHull, onDeck } from '../data/sea';

export const EYE_HEIGHT = 1.7;
export const DOCK_TOP = 0.7;
/** Draw order of the see-through water; glows that skip the depth buffer draw after it, or it paints over them. */
export const WATER_ORDER = 3;

/** Flattened build area (the town hub) blended into the terrain. */
export interface Pad { x: number; z: number; r: number; h: number }
const PAD_BLEND = 10;
const BANK_SLOPE = 0.3;
let pad: Pad | null = null;
export const setPad = (p: Pad | null): void => {
  pad = p;
};

/**
 * Flat sand banks at height `h` over a rectangle, sloping down into the natural ground beyond its edges at
 * `APRON_SLOPE` per metre: the quay's rear and ends stand on them, so the deck meets the sand flush and the lanes
 * leave it without a step.
 */
export interface Apron { x0: number; x1: number; z0: number; z1: number; h: number }
const APRON_SLOPE = 0.4;
let aprons: Apron[] = [];
export const setAprons = (a: Apron[]): void => {
  aprons = a;
};
const apronHeight = (x: number, z: number): number => {
  let h = -Infinity;
  for (const a of aprons) {
    const dx = Math.max(0, a.x0 - x, x - a.x1);
    const dz = Math.max(0, a.z0 - z, z - a.z1);
    h = Math.max(h, a.h - Math.hypot(dx, dz) * APRON_SLOPE);
  }
  return h;
};

/**
 * Where a town's ground is worn to dirt: along its cobbled paths and round `discs` (the square, the stalls' yards).
 * The rest of the pad is grass. A map without any (`null`) keeps a bare dirt pad.
 */
export interface Worn { paths: { from: [number, number]; to: [number, number]; w: number }[]; discs: { x: number; z: number; r: number }[] }
let worn: Worn | null = null;
export const setWorn = (w: Worn | null): void => {
  worn = w;
};
/** 0..1, how bare the ground is at a spot on the pad. */
export function dirtWeight(x: number, z: number): number {
  const pw = padWeight(x, z);
  if (!worn || pw === 0) return pw;
  let d = 0;
  for (const p of worn.paths) {
    const dx = p.to[0] - p.from[0];
    const dz = p.to[1] - p.from[1];
    const t = Math.max(0, Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / (dx * dx + dz * dz || 1)));
    const off = Math.hypot(x - p.from[0] - dx * t, z - p.from[1] - dz * t) - p.w / 2;
    // A street wears a wider verge than a lane.
    d = Math.max(d, 1 - smooth(0.3, p.w > 2 ? 2.8 : 1.7, off));
  }
  for (const c of worn.discs) d = Math.max(d, 1 - smooth(0.3, 2.8, Math.hypot(x - c.x, z - c.z) - c.r));
  return pw * d;
}
/** 0..1, how grassy the ground is at height `y`: above the sand line or on a town's pad, less where it is worn to dirt. */
export const grassWeight = (x: number, z: number, y: number): number =>
  Math.max(smooth(0.3, 1.6, y), worn ? padWeight(x, z) : 0) * (1 - 0.85 * dirtWeight(x, z));

/** A rock islet out in the lake: casts stop short of it. */
let islet: { x: number; z: number; r: number } | null = null;
export const setIslet = (i: { x: number; z: number; r: number } | null): void => {
  islet = i;
};

/**
 * At sea the only ground is the charter boat's deck (`BOAT` in sea.ts): docks, standing and water
 * read it instead of the pond's shore and piers.
 */
let atSea = false;
export const setAtSea = (on: boolean): void => {
  atSea = on;
};

export function waveHeight(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.35 + t * 1.1) * 0.07 +
    Math.sin(z * 0.5 - t * 1.3 + x * 0.2) * 0.05 +
    Math.sin((x + z) * 0.9 + t * 2.0) * 0.02
  );
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The shoreline, sampled every few degrees as [theta in degrees, radius] (docs/map-rework/harbour.json): a cove
 * 19-25 m across at its back (the quay's water), two headlands at about ±110° and the open lake past them. The east
 * side sits a metre closer than the plan's samples so the ramp from the quay to the campfire headland stays dry.
 * Periodic and cosine-interpolated between samples, so the shore has no corners.
 */
const SHORE_SAMPLES: [number, number][] = [
  [-180, 55], [-155, 54], [-140, 48], [-125, 37], [-115, 27], [-105, 21], [-95, 20], [-85, 19.5], [-75, 19.5],
  [-65, 20], [-55, 21], [-45, 23.5], [-30, 23], [-15, 23],
  [0, 25],
  [15, 23], [30, 23], [45, 23], [55, 19.5], [65, 18.5], [75, 18.5], [85, 19], [95, 19.5], [105, 20], [115, 26],
  [125, 36], [140, 47], [155, 54], [180, 55],
];
const SHORE = SHORE_SAMPLES.map(([d, r]) => [(d * Math.PI) / 180, r] as const);

/** Radius of the shoreline. theta = atan2(x, z): 0 points at the quay behind the pier, ±π at the far side of the lake. */
export function innerRadius(theta: number): number {
  let t = theta;
  while (t < -Math.PI) t += Math.PI * 2;
  while (t > Math.PI) t -= Math.PI * 2;
  let i = 1;
  while (i < SHORE.length - 1 && SHORE[i][0] <= t) i++;
  const [ta, ra] = SHORE[i - 1];
  const [tb, rb] = SHORE[i];
  const u = (t - ta) / (tb - ta);
  const k = (1 - Math.cos(u * Math.PI)) / 2;
  return ra + (rb - ra) * k;
}

export function padWeight(x: number, z: number): number {
  if (!pad) return 0;
  return 1 - smooth(pad.r, pad.r + PAD_BLEND, Math.hypot(x - pad.x, z - pad.z));
}

export function groundHeight(x: number, z: number): number {
  if (atSea) return -10;
  const raw = rawGroundHeight(x, z);
  const w = padWeight(x, z);
  if (!pad) return raw;
  const blended = raw + (pad.h - raw) * w;
  // Beyond the pad the bank slopes gently into the water instead of dropping off a cliff.
  const bank = pad.h - Math.max(0, Math.hypot(x - pad.x, z - pad.z) - pad.r) * BANK_SLOPE;
  return Math.min(Math.max(blended, bank, apronHeight(x, z)), deckBed(x, z));
}

/**
 * The highest the ground may stand under a dock and beside it: just below the planks' underside under the deck,
 * rising gently from its edge (`DECK_BED_SLOPE` per metre). Where a bank or an apron would stand level with the
 * planks, the coarse terrain mesh crossed them in a sawtooth of sand along the deck's rear edge and over its ends;
 * held under them, the planks show to their true edge and the sand and cobbles meet it a few centimetres down.
 */
const DECK_BED = DOCK_TOP - 0.1;
const DECK_BED_SLOPE = 0.15;
function deckBed(x: number, z: number): number {
  let bed = Infinity;
  for (const r of DOCK_RECTS) {
    const dx = Math.max(0, r.x0 - x, x - r.x1);
    const dz = Math.max(0, r.z0 - z, z - r.z1);
    bed = Math.min(bed, DECK_BED + Math.hypot(dx, dz) * DECK_BED_SLOPE);
  }
  return bed;
}

/**
 * The terrain mesh's polar grid (world.ts draws it): `NT` spokes round the lake's middle and `NR` rings out from it,
 * closer together near the middle. Each cell is two triangles.
 */
export const TERRAIN = { NR: 150, NT: 120, radius: (i: number): number => 1 + 174 * Math.pow(i / 150, 1.7) };

/**
 * Height of the terrain as it is drawn at (x, z): on the flat triangles of the terrain mesh, which sit up to a few
 * centimetres above or below `groundHeight` between the mesh's points (most where a bank meets a slope). Things
 * laid flat on the ground, like the cobbles, follow this so the ground never pokes through them.
 */
export function terrainHeight(x: number, z: number): number {
  const { NR, NT, radius } = TERRAIN;
  const r = Math.hypot(x, z);
  if (atSea || r <= radius(0) || r >= radius(NR)) return groundHeight(x, z);
  const step = (Math.PI * 2) / NT;
  const j = Math.min(NT - 1, Math.max(0, Math.floor((Math.atan2(x, z) + Math.PI) / step)));
  const i = Math.min(NR - 1, Math.floor(NR * Math.pow((r - 1) / 174, 1 / 1.7)));
  // The cell's corners, as the mesh lays them: a and b on spoke j (rings i and i + 1), d and e on spoke j + 1.
  const corner = (jj: number, ii: number): [number, number, number] => {
    const th = -Math.PI + jj * step;
    const cx = Math.sin(th) * radius(ii);
    const cz = Math.cos(th) * radius(ii);
    return [cx, cz, groundHeight(cx, cz)];
  };
  const a = corner(j, i);
  const b = corner(j, i + 1);
  const d = corner(j + 1, i);
  const e = corner(j + 1, i + 1);
  // Its two triangles are (a, b, d) and (b, e, d); the point lies in the first if it is on a's side of b-d.
  const side = (p: [number, number, number]) => (d[0] - b[0]) * (p[1] - b[1]) - (d[1] - b[1]) * (p[0] - b[0]);
  const [p, q, s] = side([x, z, 0]) * side(a) >= 0 ? [a, b, d] : [b, e, d];
  const det = (q[1] - s[1]) * (p[0] - s[0]) + (s[0] - q[0]) * (p[1] - s[1]);
  const u = ((q[1] - s[1]) * (x - s[0]) + (s[0] - q[0]) * (z - s[1])) / det;
  const v = ((s[1] - p[1]) * (x - s[0]) + (p[0] - s[0]) * (z - s[1])) / det;
  return u * p[2] + v * q[2] + (1 - u - v) * s[2];
}

function rawGroundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const d = r - innerRadius(Math.atan2(x, z));
  let base = -0.7 + 1.3 * smooth(-6, 1, d);
  if (d < -6) base += (d + 6) * 0.8;
  const dd = Math.max(0, d);
  const hills = Math.pow(dd, 1.2) * 0.1 * (0.6 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.06));
  const noise = Math.sin(x * 0.13) * Math.cos(z * 0.11) + 0.5 * Math.sin(x * 0.31 + z * 0.27);
  return base + hills + noise * Math.min(1, dd / 10) * 2.5;
}

/**
 * Walkable timber over the water: the pier, its T end, the quay across the back of the cove that the pier
 * runs out of, and a short jetty either side of the pier's root (docks in docs/map-rework/harbour.json).
 */
export interface DockRect { x0: number; x1: number; z0: number; z1: number }
export const DOCK_RECTS: DockRect[] = [
  { x0: -1.5, x1: 1.5, z0: -6, z1: 10 },
  { x0: -5, x1: 5, z0: -9, z1: -6 },
  { x0: -13, x1: 13, z0: 10, z1: 14.5 },
  { x0: 6.25, x1: 8.75, z0: 4, z1: 10 },
  { x0: -8.75, x1: -6.25, z0: 4, z1: 10 },
];

export const onDock = (x: number, z: number, pad = 0): boolean =>
  atSea ? (pad > 0 ? inHull(x, z, pad) : onDeck(x, z)) : DOCK_RECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);

/** Height of the surface a player stands on. */
export const standHeight = (x: number, z: number): number => {
  if (atSea) return BOAT.deck;
  const g = Math.max(groundHeight(x, z), -0.1);
  return onDock(x, z) ? Math.max(g, DOCK_TOP) : g;
};

export const isWater = (x: number, z: number): boolean =>
  atSea
    ? !inHull(x, z, 0.3)
    : groundHeight(x, z) < -0.25 && !onDock(x, z, 0.3) && !(islet && Math.hypot(x - islet.x, z - islet.z) < islet.r);

export function mulberry(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
