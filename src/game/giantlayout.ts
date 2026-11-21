import { BOAT, inHull } from '../data/sea';

/**
 * Where a hooked Kraken's arms and a hooked Dreamer's eyes go on the water (`GiantFights`, `LEGEND_FIGHT.arms` and
 * `gaze`): pure layout, its rolls handed in, so it can be tested without a sea. Everything is level (x, z) in metres.
 */

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * The bearing (radians) one more Kraken arm stands at from the line's end: the widest gap between the arms already
 * `up` (their bearings), somewhere in its middle `wander` (0 dead centre .. 1 anywhere in it), so the arms stand
 * round the line's end like one animal's and never bunch on one side. `r1`, `r2`: rolls (0..1).
 */
export function armBearing(up: number[], r1: number, r2: number, wander = 0.5): number {
  if (!up.length) return r1 * TAU;
  const s = up.map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  let from = s[0], gap = -1;
  for (let i = 0; i < s.length; i++) {
    const g = (i + 1 < s.length ? s[i + 1] : s[0] + TAU) - s[i];
    if (g > gap) {
      gap = g;
      from = s[i];
    }
  }
  return (from + gap * (0.5 + (r2 - 0.5) * wander)) % TAU;
}

/**
 * How far from the line's end (m) an arm stands: somewhere in `ring`, plus somewhere in `spread`, the spread drawn in
 * to `spreadIn` of itself as the line comes in (`near` 0 just hooked .. 1 at the hull). `r1`, `r2`: rolls (0..1).
 */
export const armRadius = (ring: [number, number], spread: [number, number], spreadIn: number, near: number, r1: number, r2: number): number =>
  ring[0] + (ring[1] - ring[0]) * r1 + (spread[0] + (spread[1] - spread[0]) * r2) * (1 - (1 - spreadIn) * clamp01(near));

/**
 * (x, z) if it is open water `pad` metres clear of the hull, else the nearest point that is, out across the beam on
 * the side (tx, tz) lies (the line's end; off the bow or the stern, out along the boat). Into `out` as (x, z). The
 * way out is one direction for every point, so arms moved out keep their order along the hull and move smoothly as
 * the line comes in.
 */
export function clearOfHull(x: number, z: number, pad: number, tx: number, tz: number, out: number[]): number[] {
  out[0] = x;
  out[1] = z;
  if (!inHull(x, z, pad)) return out;
  // From the nearest point of the boat's middle line to the line's end.
  const half = Math.max(0, BOAT.len / 2 - BOAT.beam);
  let dx = tx - Math.max(-half, Math.min(half, tx)), dz = tz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    dx = 0;
    dz = z >= 0 ? 1 : -1;
  } else {
    dx /= d;
    dz /= d;
  }
  // The hull's outline is convex: one crossing on the way out, found by halving.
  let lo = 0, hi = BOAT.len + 2 * BOAT.beam + 2 * pad;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inHull(x + dx * mid, z + dz * mid, pad)) lo = mid;
    else hi = mid;
  }
  out[0] = x + dx * hi;
  out[1] = z + dz * hi;
  return out;
}

/** A spot on the water taken by an eye: where (from the line's end, or in the world) and its size (m, its iris's radius). */
export interface Spot {
  x: number;
  z: number;
  r: number;
}

/** How much further apart eyes must lie along the view than across it: seen low over the water they are drawn long toward the viewer, and one behind another they run together. */
export const ALONG = 2;

/**
 * A place for one more eye of the Dreamer's field, from the line's end, into `out`: `ring[0]` to `ring[1]` metres
 * off it (evenly over the water, not bunched at the middle), on the side toward the viewer (`home`: the bearing from
 * the line's end to them) and out to either flank with odds `toward`, else anywhere round; not within `apart` times
 * their two sizes of an eye already there (`taken`), `ALONG` times that along the view. Of `tries` rolls the first
 * clear one, or failing that the clearest. `r`: its own size (m). `rnd`: the rolls.
 */
export function fieldSpot(taken: readonly Spot[], r: number, ring: [number, number], home: number, toward: number, apart: number, rnd: () => number, out: Spot, tries = 10): Spot {
  const hx = Math.cos(home), hz = Math.sin(home);
  let best = -Infinity;
  for (let k = 0; k < tries; k++) {
    const a = rnd() < toward ? home + (rnd() < 0.5 ? -1 : 1) * (0.2 + 1.8 * rnd()) : rnd() * TAU;
    const d = Math.sqrt(ring[0] * ring[0] + (ring[1] * ring[1] - ring[0] * ring[0]) * rnd());
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // How clear it is: the least distance to another eye, in units of what they need (1 or more: clear).
    let clear = Infinity;
    for (const t of taken) {
      const ex = x - t.x, ez = z - t.z;
      const along = ex * hx + ez * hz, across = -ex * hz + ez * hx;
      clear = Math.min(clear, Math.hypot(along / ALONG, across) / ((r + t.r) * apart));
    }
    if (clear > best) {
      best = clear;
      out.x = x;
      out.z = z;
    }
    if (clear >= 1) break;
  }
  out.r = r;
  return out;
}

/**
 * `n` places on the water all round the boat, `off[0]` to `off[1]` metres outside the hull (most of them close: the
 * far ones thin out), evenly along its outline and not round a circle, so its long sides get as many to the metre as
 * its ends; none within `keep.r` of (`keep.x`, `keep.z`) (a landed giant's own place: such a spot is moved further
 * round until it is clear, or left out). Each comes with `k`, how far out it lies (0 at `off[0]` .. 1 at `off[1]`).
 * In the boat's frame, which is the world's. `rnd`: the rolls.
 */
export function boatRing(n: number, off: [number, number], rnd: () => number, keep?: Spot): { x: number; z: number; k: number }[] {
  const spots: { x: number; z: number; k: number }[] = [];
  const turn = rnd();
  const half = Math.max(0, BOAT.len / 2 - BOAT.beam);
  for (let i = 0; i < n; i++) {
    const k = rnd() ** 1.6;
    const pad = off[0] + (off[1] - off[0]) * k;
    // The box `pad` metres round the hull, walked at even steps (a little unevenly).
    const L = BOAT.len / 2 + pad, W = BOAT.beam + pad;
    for (let t = 0; t < 6; t++) {
      const u = (i + turn + 0.7 * (rnd() - 0.5) + t * 0.37 * n) / n;
      let s = (u - Math.floor(u)) * 4 * (L + W);
      // (Along one side, round the bow, back along the other, round the stern.)
      const side = Math.floor(s / (2 * (L + W)));
      s -= side * 2 * (L + W);
      const flip = side ? -1 : 1;
      const qx = flip * (s < 2 * L ? -L + s : L), qz = flip * (s < 2 * L ? W : W - (s - 2 * L));
      // Drawn in from there toward the boat's middle line, to the hull's own outline `pad` metres out (the bow is narrow).
      const cx = Math.max(-half, Math.min(half, qx));
      let lo = 0, hi = 1;
      for (let j = 0; j < 16; j++) {
        const mid = (lo + hi) / 2;
        if (inHull(cx + (qx - cx) * mid, qz * mid, pad)) lo = mid;
        else hi = mid;
      }
      const x = cx + (qx - cx) * hi, z = qz * hi;
      if (keep && Math.hypot(x - keep.x, z - keep.z) < keep.r) continue;
      spots.push({ x, z, k });
      break;
    }
  }
  return spots;
}
