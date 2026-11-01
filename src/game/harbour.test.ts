import { describe, expect, it } from 'vitest';
import { DIVE } from '../data/dive';
import { HARBOUR, MAPS, arrivalSpot } from '../data/maps';
import { isWater, onDock, setPad } from './env';

describe("Captain Reed's seaplane", () => {
  const pond = MAPS.find((m) => m.harbour)!;
  setPad(pond.pad);

  it('has Reed, his signpost and the dive landing on the sand, off any dock', () => {
    for (const p of [HARBOUR.stand, HARBOUR.sign, HARBOUR.diveStart]) {
      expect(isWater(p.x, p.z), `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(false);
      expect(onDock(p.x, p.z)).toBe(false);
    }
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

  it('brings players back from a dive beside Reed, close enough to book the next one', () => {
    const at = arrivalSpot(pond, 'sea');
    expect(at).toBe(HARBOUR.diveStart);
    expect(Math.hypot(at.x - HARBOUR.stand.x, at.z - HARBOUR.stand.z)).toBeLessThan(DIVE.standRange);
  });
});
