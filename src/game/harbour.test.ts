import { describe, expect, it } from 'vitest';
import { DIVE } from '../data/dive';
import { HARBOUR, MAPS, arrivalSpot } from '../data/maps';
import { REED_WHARF, isWater, onDock, onLanding, setAprons, setPad } from './env';
import { fishingSpot } from './progression';

describe("Captain Reed's seaplane", () => {
  const pond = MAPS.find((m) => m.harbour)!;
  setPad(pond.pad);
  setAprons(pond.aprons ?? []);

  it("has Reed and the charter landing on his wharf's boards, and the sign arch on dry ground at its head", () => {
    const w = REED_WHARF;
    for (const p of [HARBOUR.stand, HARBOUR.diveStart]) {
      expect(p.x > w.x0 && p.x < w.x1 && p.z > w.z0 && p.z < w.z1, `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
      expect(isWater(p.x, p.z)).toBe(false);
    }
    // The arch's two posts (1.08 m either side of its middle) stand on the lane's bank, off the boards.
    for (const sx of [-1.08, 1.08]) {
      const x = HARBOUR.sign.x + sx * Math.cos(HARBOUR.sign.facing);
      const z = HARBOUR.sign.z - sx * Math.sin(HARBOUR.sign.facing);
      expect(isWater(x, z)).toBe(false);
      expect(onDock(x, z)).toBe(false);
    }
  });

  it('keeps the wharf a landing, not a fishing spot: casting from it counts as the shore, like the beach', () => {
    expect(onLanding(HARBOUR.stand.x, HARBOUR.stand.z)).toBe(true);
    expect(fishingSpot(HARBOUR.stand.x, HARBOUR.stand.z)).toBe('shore');
    // The pier and the jetties are fished from as before.
    expect(onLanding(0, -4)).toBe(false);
    expect(fishingSpot(0, -4)).toBe('prime');
    expect(fishingSpot(-7.5, 4.5)).toBe('prime');
  });

  it("moors the plane off the wharf's face: water under both floats' bows, and its wing clear of the boards", () => {
    const w = REED_WHARF;
    const { x, z, facing } = HARBOUR.plane;
    // Half a metre off the face, in line with each float (0.95 m either side of the plane's middle) and at the far end.
    for (const fz of [w.z0 + 0.5, z - 0.95, z + 0.95]) expect(isWater(w.x1 + 0.5, fz), `${fz}`).toBe(true);
    // Local (x, z) to world x, as in town.ts: the wing's leading edge (local z 1.25) at each tip.
    for (const lx of [-3.8, 3.8]) expect(x + lx * Math.cos(facing) + 1.25 * Math.sin(facing)).toBeGreaterThan(w.x1 + 1);
  });

  it('stands the Furthest Out board on dry sand, clear of Reed, his signpost, the landing spot, the bottle and the plane', () => {
    const b = HARBOUR.board;
    expect(isWater(b.x, b.z)).toBe(false);
    expect(onDock(b.x, b.z)).toBe(false);
    for (const p of [HARBOUR.stand, HARBOUR.sign, HARBOUR.diveStart, ...pond.town.bottles]) expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(2.5);
    // The plane's town-side wingtip (local -3.8, 0.6), as in the test below.
    const { x, z, facing } = HARBOUR.plane;
    const tip = { x: x - 3.8 * Math.cos(facing) + 0.6 * Math.sin(facing), z: z + 3.8 * Math.sin(facing) + 0.6 * Math.cos(facing) };
    expect(Math.hypot(b.x - tip.x, b.z - tip.z)).toBeGreaterThan(2);
  });

  it('floats the plane on the water, wingtips and tail included', () => {
    const { x, z, facing } = HARBOUR.plane;
    // Local (x, z) to world, as in town.ts: the middle, both wingtips and the tail.
    for (const [lx, lz] of [[0, 0], [3.8, 0.6], [-3.8, 0.6], [0, -2.9]]) {
      const wx = x + lx * Math.cos(facing) + lz * Math.sin(facing);
      const wz = z - lx * Math.sin(facing) + lz * Math.cos(facing);
      expect(isWater(wx, wz), `${lx}, ${lz}`).toBe(true);
    }
  });

  it('brings players back from a charter in front of Reed, close enough to book the next one', () => {
    const at = arrivalSpot(pond, 'sea');
    expect(at).toBe(HARBOUR.diveStart);
    expect(Math.hypot(at.x - HARBOUR.stand.x, at.z - HARBOUR.stand.z)).toBeLessThan(DIVE.standRange);
  });
});
