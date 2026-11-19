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
 * A level floor on a slope (the campfire's terrace, its beach): a disc of radius `hw`, the part of that disc between
 * two bearings (`arc`, degrees round from +z toward +x, less than half a turn), or, given `hd`, a box of half sizes
 * `hw` across and `hd` deep turned `rot` radians. Inside it the ground is `h`. Where the ground was lower it is built
 * up, and falls away beyond the edge at `bank` per metre (`LEVEL_BANK` if left out) like an apron's bank; where the
 * hill was higher it is dug down, level for `cut` metres past the edge and from there eased back up into the hill
 * over `blend` metres (`LEVEL_BLEND` if left out; less for a steeper bank), with no crease at its foot. `cut` carries
 * the flat past whatever stands at the edge (the wall that holds the hill back): the terrain's mesh has a vertex
 * every 1-1.7 m here, so it can't turn a corner any tighter, and would otherwise lean on the wall's foot and lie over
 * the cobbles. Levels are laid in order, so a later one cuts into an earlier one or is built up on it. A `grass`
 * level is turf: green whatever its height (the ground below the grass line is sand otherwise), fading out over
 * `LAWN_FADE` metres.
 */
export interface Level { x: number; z: number; h: number; hw: number; hd?: number; rot?: number; arc?: [number, number]; cut: number; bank?: number; blend?: number; grass?: boolean }
const LEVEL_BANK = 0.5;
const LEVEL_BLEND = 1.5;
const LAWN_FADE = 1.5;
let levels: Level[] = [];
/** How far each level's shape reaches from its centre: a point further off is at least that much less outside it. */
let reach: number[] = [];
export const setLevels = (l: Level[]): void => {
  levels = l;
  reach = l.map((v) => (v.hd === undefined ? v.hw : Math.hypot(v.hw, v.hd)));
};
/** A cheap lower bound on `outside(levels[i], x, z)`, so the many ground queries far from a level skip its trig. */
const outsideAtLeast = (i: number, x: number, z: number): number => {
  const l = levels[i];
  return Math.sqrt((x - l.x) ** 2 + (z - l.z) ** 2) - reach[i];
};
/** Metres from (x, z) to a level's edge, 0 inside it. */
const outside = (l: Level, x: number, z: number): number => {
  const dx = x - l.x;
  const dz = z - l.z;
  if (l.arc) {
    // How far round the point is past the nearer of the sector's two straight edges; within them, the rim is the edge.
    const mid = ((l.arc[0] + l.arc[1]) * Math.PI) / 360;
    const turn = Math.atan2(dx, dz) - mid;
    const past = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) - ((l.arc[1] - l.arc[0]) * Math.PI) / 360;
    const r = Math.hypot(dx, dz);
    if (past <= 0) return Math.max(0, r - l.hw);
    // Past an edge, the nearest point is on it: a line from the middle out to the rim.
    const along = r * Math.cos(past);
    return Math.hypot(along - Math.min(l.hw, Math.max(0, along)), r * Math.sin(past));
  }
  if (l.hd === undefined) return Math.max(0, Math.hypot(dx, dz) - l.hw);
  const sin = Math.sin(l.rot ?? 0);
  const cos = Math.cos(l.rot ?? 0);
  return Math.hypot(Math.max(0, Math.abs(dx * cos - dz * sin) - l.hw), Math.max(0, Math.abs(dx * sin + dz * cos) - l.hd));
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
  Math.max(smooth(0.3, 1.6, y), worn ? padWeight(x, z) : 0, lawnWeight(x, z)) * (1 - 0.85 * dirtWeight(x, z));
/** 0..1, how much of a `grass` level's turf a spot is: 1 on it, fading out past its edge. */
function lawnWeight(x: number, z: number): number {
  let w = 0;
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (l.grass && outsideAtLeast(i, x, z) < LAWN_FADE) w = Math.max(w, 1 - smooth(0, LAWN_FADE, outside(l, x, z)));
  }
  return w;
}

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
 * Past the headland the shore turns sharply out at 106-108°, along the foot of the bank behind Skipper's Beach, and
 * the lake runs about 8 m further east than the plan's: the bay the skipping stones fly down (`SKIP` in skip.ts).
 * Periodic and cosine-interpolated between samples, so the shore has no corners.
 */
const SHORE_SAMPLES: [number, number][] = [
  [-180, 55], [-155, 54], [-140, 48], [-125, 37], [-115, 27], [-105, 21], [-95, 20], [-85, 19.5], [-75, 19.5],
  [-65, 20], [-55, 21], [-45, 23.5], [-30, 23], [-15, 23],
  [0, 25],
  [15, 23], [30, 23], [45, 23], [55, 19.5], [65, 18.5], [75, 18.5], [85, 19], [95, 19.5], [105, 20], [106, 21],
  [108, 35], [116, 43], [126, 50], [140, 54], [155, 55], [180, 55],
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
  let g = Math.max(blended, bank, apronHeight(x, z));
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    // Far enough off that the level neither builds the ground up nor cuts it down: the same answer without the trig.
    const far = outsideAtLeast(i, x, z);
    if (far - l.cut >= (l.blend ?? LEVEL_BLEND) && l.h - far * (l.bank ?? LEVEL_BANK) <= g) continue;
    const d = outside(l, x, z);
    g = Math.max(g, l.h - d * (l.bank ?? LEVEL_BANK));
    if (g > l.h) g = l.h + (g - l.h) * smooth(0, l.blend ?? LEVEL_BLEND, d - l.cut);
  }
  return Math.min(g, deckBed(x, z));
}

/**
 * The highest the ground may stand under a dock and beside it: just below the planks' underside under the deck,
 * rising gently from its edge (`DECK_BED_SLOPE` per metre). Where a bank or an apron would stand level with the
 * planks, the coarse terrain mesh crossed them in a sawtooth of sand along the deck's rear edge and over its ends;
 * held under them, the planks show to their true edge and the sand and cobbles meet it a few centimetres down.
 * The rise reaches a long way and caps the far hills too, so a dock over ground that is lower than its planks anyway
 * (`DockRect.low`) is left out: it has nothing to hold down, and the hills round it keep their height.
 */
const DECK_BED = DOCK_TOP - 0.1;
const DECK_BED_SLOPE = 0.15;
function deckBed(x: number, z: number): number {
  let bed = Infinity;
  for (const r of DOCK_RECTS) {
    if (r.low) continue;
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
 * runs out of, a short jetty either side of the pier's root (docks in docs/map-rework/harbour.json), Reed's wharf
 * and the rocket jetty.
 * A `landing` is a place to stand, not to fish: casting from it counts as the shore (`fishingSpot`). A `low` one
 * stands over ground that is below its planks all round (`deckBed`).
 */
export interface DockRect { x0: number; x1: number; z0: number; z1: number; landing?: boolean; low?: boolean }
/**
 * Captain Reed's wharf (`HARBOUR` in maps.ts): a timber landing along the water's edge of his beach, on the line
 * of his lane, with the seaplane moored square to its face. Play-test: the size.
 */
export const REED_WHARF: DockRect = { x0: -18.4, x1: -16, z0: -4.6, z1: 3.2, landing: true };
/**
 * The rocket jetty (`CAMP` in maps.ts): from the beach on the east headland's lake side out over the open lake.
 * A landing, like the wharf. Play-test: the size.
 */
export const ROCKET_JETTY: DockRect = { x0: 17.4, x1: 19.6, z0: -12.4, z1: -6.9, landing: true, low: true };
export const DOCK_RECTS: DockRect[] = [
  { x0: -1.5, x1: 1.5, z0: -6, z1: 10 },
  { x0: -5, x1: 5, z0: -9, z1: -6 },
  { x0: -13, x1: 13, z0: 10, z1: 14.5 },
  { x0: 6.25, x1: 8.75, z0: 4, z1: 10 },
  { x0: -8.75, x1: -6.25, z0: 4, z1: 10 },
  REED_WHARF,
  ROCKET_JETTY,
];

/**
 * The posts a dock stands on: a row under each long edge, 2.5 m apart, left out where another dock's boards lie over
 * them. Each tops out at `POST_TOP`, a little proud of the planks, and its `foot` is `POST_SUNK` m down in the lake
 * bed under it, and never higher than a post of `POST_MIN` m would reach. The bed falls to 6 m under the pier and its
 * T end, where posts of one length stopped short in open water (a player's note, 2026-11-18).
 */
export const POST_TOP = 0.95;
const POST_MIN = 3.1;
const POST_SUNK = 0.5;
/** Where a post at (x, z) ends: `POST_SUNK` m into the bed, and no higher than a post of `POST_MIN` m would. The lamp posts on their own piles (hub.ts) stand on the same. */
export const postFoot = (x: number, z: number): number => Math.min(POST_TOP - POST_MIN, groundHeight(x, z) - POST_SUNK);
export function dockPosts(r: DockRect): { x: number; z: number; foot: number }[] {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const alongZ = d >= w;
  const len = alongZ ? d : w;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const posts: { x: number; z: number; foot: number }[] = [];
  for (const side of [-1, 1]) {
    const off = side * (((alongZ ? w : d) - 0.1) / 2 - 0.45) * 1.1;
    for (let s = 0.3; s < len; s += 2.5) {
      const x = alongZ ? cx + off : r.x0 + s;
      const z = alongZ ? r.z0 + s : cz + off;
      if (DOCK_RECTS.some((o) => o !== r && x > o.x0 - 0.05 && x < o.x1 + 0.05 && z > o.z0 - 0.05 && z < o.z1 + 0.05)) continue;
      posts.push({ x, z, foot: postFoot(x, z) });
    }
  }
  return posts;
}

export const onDock = (x: number, z: number, pad = 0): boolean =>
  atSea ? (pad > 0 ? inHull(x, z, pad) : onDeck(x, z)) : DOCK_RECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);

/** On a landing (`DockRect.landing`): timber to stand on that is no fishing spot. */
export const onLanding = (x: number, z: number): boolean =>
  !atSea && DOCK_RECTS.some((r) => r.landing && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

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
