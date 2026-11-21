import { describe, expect, it } from 'vitest';
import { LEGEND_FIGHT } from '../data/legendshow';
import { BOAT, inHull } from '../data/sea';
import { mulberry } from './env';
import { ALONG, armBearing, armRadius, boatRing, clearOfHull, fieldSpot, type Spot } from './giantlayout';

const TAU = Math.PI * 2;
/** The least angle between two bearings. */
const apart = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe("where the Kraken's arms stand", () => {
  it('each new arm takes the widest gap the others leave, so they stand all round the line and never bunch', () => {
    const rnd = mulberry(5);
    for (let run = 0; run < 50; run++) {
      const up: number[] = [];
      for (let i = 0; i < 5; i++) {
        const a = armBearing(up, rnd(), rnd());
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(TAU);
        // In the middle half of the widest gap: no nearer another arm than a quarter of it.
        if (up.length === 1) expect(apart(a, up[0])).toBeGreaterThanOrEqual(Math.PI / 2 - 1e-9);
        up.push(a);
      }
      // Five arms up: no two nearer than a sixteenth of a turn, and no half of the water empty.
      const s = [...up].sort((x, y) => x - y);
      const gaps = s.map((x, i) => (i + 1 < s.length ? s[i + 1] : s[0] + TAU) - x);
      expect(Math.min(...gaps)).toBeGreaterThan(TAU / 16 - 1e-9);
      expect(Math.max(...gaps)).toBeLessThan(Math.PI);
    }
    // Dead centre with no wander; anywhere with none up.
    expect(armBearing([0, Math.PI / 2], 0, 0.9, 0)).toBeCloseTo(Math.PI * 1.25);
    expect(armBearing([], 0.25, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('stand 2 to 5 m further from the line than they did, a little less by the time it is at the rail', () => {
    const A = LEGEND_FIGHT.arms;
    expect(A.spread).toEqual([2, 5]);
    // Far out: the old ring plus the whole spread.
    expect(armRadius(A.ring, A.spread, A.spreadIn, 0, 0, 0)).toBeCloseTo(A.ring[0] + 2);
    expect(armRadius(A.ring, A.spread, A.spreadIn, 0, 1, 1)).toBeCloseTo(A.ring[1] + 5);
    // At the rail the spread is drawn in, but they still stand clearly apart: at least 2 m from the line's end.
    const near = armRadius(A.ring, A.spread, A.spreadIn, 1, 0, 0);
    expect(near).toBeLessThan(A.ring[0] + 2);
    expect(near).toBeGreaterThanOrEqual(2);
    expect(armRadius(A.ring, A.spread, A.spreadIn, 2, 1, 1)).toBeCloseTo(A.ring[1] + 5 * A.spreadIn);
    expect(A.spreadIn).toBeGreaterThan(0.4);
    expect(A.spreadIn).toBeLessThanOrEqual(1);
  });

  it('never in the hull: one that would is moved out across the beam, on the side the line is', () => {
    const out = [0, 0];
    const pad = LEGEND_FIGHT.arms.clear;
    // Open water is left alone.
    expect(clearOfHull(3, 9, pad, 2, 12, out)).toEqual([3, 9]);
    const rnd = mulberry(9);
    for (let i = 0; i < 300; i++) {
      // The line's end off either beam, or off the bow or the stern; the arm anywhere within 8 m of it.
      const side = rnd() < 0.5 ? -1 : 1;
      const end = rnd() < 0.8 ? [(rnd() - 0.5) * BOAT.len, side * (BOAT.beam + 1.5 + rnd() * 6)] : [side * (BOAT.len / 2 + 1.5 + rnd() * 5), (rnd() - 0.5) * 3];
      const x = end[0] + (rnd() - 0.5) * 16, z = end[1] + (rnd() - 0.5) * 16;
      const was = inHull(x, z, pad);
      clearOfHull(x, z, pad, end[0], end[1], out);
      expect(inHull(out[0], out[1], pad - 1e-3)).toBe(false);
      if (!was) expect(out).toEqual([x, z]);
      else {
        // Just clear, not flung away; and on the line's side of the boat when the line is off a beam.
        expect(inHull(out[0], out[1], pad + 0.05)).toBe(true);
        if (Math.abs(end[0]) < BOAT.len / 2 - BOAT.beam) expect(Math.sign(out[1])).toBe(Math.sign(end[1]));
      }
    }
    // Two arms under the hull side by side come out side by side: the way out is the same for both.
    const a = clearOfHull(-2, 0.5, pad, 0, 8, [0, 0]), b = clearOfHull(2, 0.5, pad, 0, 8, [0, 0]);
    expect(a[0]).toBeCloseTo(-2);
    expect(b[0]).toBeCloseTo(2);
    // And it moves smoothly as the arm does (no steps).
    const c = clearOfHull(2.01, 0.5, pad, 0, 8, [0, 0]);
    expect(Math.hypot(c[0] - b[0], c[1] - b[1])).toBeLessThan(0.05);
  });
});

describe("where the Dreamer's eyes lie", () => {
  const G = LEGEND_FIGHT.gaze;
  const field = (n: number, seed: number, ring: [number, number], home = 0.7) => {
    const rnd = mulberry(seed);
    const eyes: Spot[] = [];
    for (let i = 0; i < n; i++) eyes.push({ ...fieldSpot(eyes, 0.25 + 0.5 * rnd() * rnd(), ring, home, G.toward, G.apart, rnd, { x: 0, z: 0, r: 0 }) });
    return eyes;
  };

  it('a field of them round the line, inside its ring, most toward the boat', () => {
    const ring: [number, number] = [2, 10];
    let toward = 0, all = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const e of field(G.count[2], seed, ring)) {
        const d = Math.hypot(e.x, e.z);
        expect(d).toBeGreaterThanOrEqual(ring[0] - 1e-9);
        expect(d).toBeLessThanOrEqual(ring[1] + 1e-9);
        all++;
        if (e.x * Math.cos(0.7) + e.z * Math.sin(0.7) > 0) toward++;
      }
    }
    // More on the boat's side than behind it, but some all round.
    expect(toward / all).toBeGreaterThan(0.55);
    expect(toward / all).toBeLessThan(0.9);
  });

  it('none on top of another while there is room, further apart along the view than across it', () => {
    const home = 0.7, hx = Math.cos(home), hz = Math.sin(home);
    let crowded = 0, pairs = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const eyes = field(G.count[1], seed, [2, 10], home);
      for (let i = 0; i < eyes.length; i++)
        for (let j = 0; j < i; j++) {
          const ex = eyes[i].x - eyes[j].x, ez = eyes[i].z - eyes[j].z;
          const along = ex * hx + ez * hz, across = -ex * hz + ez * hx;
          pairs++;
          // (Their irises never touch, even counting how long they are drawn toward the viewer.)
          expect(Math.hypot(along / ALONG, across)).toBeGreaterThan(eyes[i].r + eyes[j].r);
          if (Math.hypot(along / ALONG, across) < (eyes[i].r + eyes[j].r) * G.apart - 1e-9) crowded++;
        }
    }
    expect(crowded / pairs).toBeLessThan(0.002);
    // With no room at all it still gives a place, the clearest it rolled.
    const packed = field(40, 3, [0.5, 1.5]);
    expect(packed.length).toBe(40);
    for (const e of packed) expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('all round the boat for its last stand and its landing: outside the hull, close, on every side, clear of where it lies', () => {
    const L = G.landing;
    for (let seed = 1; seed <= 20; seed++) {
      const spots = boatRing(L.count, L.off, mulberry(seed));
      expect(spots.length).toBe(L.count);
      const quads = [0, 0, 0, 0];
      for (const s of spots) {
        // On open water, between the nearest and the furthest it may lie from the hull.
        expect(inHull(s.x, s.z, L.off[0] - 0.01)).toBe(false);
        expect(inHull(s.x, s.z, L.off[1] + 0.01)).toBe(true);
        expect(s.k).toBeGreaterThanOrEqual(0);
        expect(s.k).toBeLessThanOrEqual(1);
        quads[(s.x >= 0 ? 0 : 1) + (s.z >= 0 ? 0 : 2)]++;
      }
      // Every quarter of the water round the boat has its share, and most lie close.
      for (const q of quads) expect(q).toBeGreaterThanOrEqual(L.count / 8);
      expect(spots.filter((s) => s.k < 0.5).length).toBeGreaterThan(L.count * 0.55);
    }
    // A landed Dreamer lies off the port beam: none of them where it lies, and still (nearly) all of them somewhere.
    const keep = { x: -1.5, z: BOAT.beam + 4.5, r: 10 * L.keepOut };
    const round = boatRing(L.count, L.off, mulberry(4), keep);
    for (const s of round) expect(Math.hypot(s.x - keep.x, s.z - keep.z)).toBeGreaterThanOrEqual(keep.r);
    expect(round.length).toBeGreaterThanOrEqual(L.count - 4);
    // Some beside it all the same: it is among its eyes, not in a hole in them.
    expect(round.filter((s) => Math.hypot(s.x - keep.x, s.z - keep.z) < keep.r + 4).length).toBeGreaterThanOrEqual(3);
  });
});
