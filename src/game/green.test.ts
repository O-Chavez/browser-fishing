import { describe, expect, it } from 'vitest';
import { MAPS, onCobbles } from '../data/maps';
import { grassWeight, groundHeight, isWater, setAprons, setLevels, setPad, setPonds } from './env';

/** The community zone behind the campfire: the green, the pond and the way between them (`GREEN`, `POND` in maps.ts). */
describe('the green and the pond', () => {
  const map = MAPS[0];
  setPad(map.pad);
  setAprons(map.aprons ?? []);
  setLevels(map.levels ?? []);
  setPonds(map.ponds ?? []);
  const pond = map.ponds![0];
  const fire = map.campfire;
  const [lawn, wing] = map.levels!.filter((l) => l.grass);
  const [landing, lookout] = map.town.circles!.slice(-2);
  /** The cobbled way from the fire through the seat wall to the pond's landing. */
  const way = map.town.paths.find((p) => p.to[0] === landing.x && p.to[1] === landing.z)!;

  it('digs a pond with water in the middle and a dry rim all round', () => {
    expect(isWater(pond.x, pond.z)).toBe(true);
    expect(groundHeight(pond.x, pond.z)).toBeCloseTo(-pond.depth, 5);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const [x, z] = [pond.x + Math.sin(a) * pond.rx * 1.02, pond.z + Math.cos(a) * pond.rz * 1.02];
      expect(isWater(x, z), `rim at ${a.toFixed(2)}`).toBe(false);
      // Half way out it is still water: the shore is a clean oval, whatever the ground was.
      expect(isWater(pond.x + Math.sin(a) * pond.rx * 0.5, pond.z + Math.cos(a) * pond.rz * 0.5)).toBe(true);
    }
  });

  it('levels the green and keeps it grass, below the height where bare ground turns to sand', () => {
    // The long lawn north of the way down to the pond (which dips to the landing), its quay end, and the wing.
    for (const [x, z] of [[lawn.x, lawn.z - 2], [lawn.x - 1, lawn.z - 5], [lawn.x + 1.5, lawn.z - 8], [lawn.x + 1, lawn.z + 9], [wing.x, wing.z - 1], [wing.x + 2, wing.z]]) {
      expect(groundHeight(x, z), `${x}, ${z}`).toBeCloseTo(lawn.h, 5);
      expect(grassWeight(x, z, groundHeight(x, z))).toBeGreaterThan(0.95);
    }
    expect(wing.h).toBe(lawn.h);
    // Between them the zone runs about 23 m east from the ring's water side and 21 m along the shore.
    expect(lawn.hd! * 2).toBeGreaterThan(20);
  });

  it('ends the long lawn in a lookout on the open lake, reached by its own path', () => {
    expect(isWater(lookout.x, lookout.z)).toBe(false);
    expect(groundHeight(lookout.x, lookout.z)).toBeCloseTo(lawn.h, 5);
    const path = map.town.paths.find((p) => p.to[0] === lookout.x && p.to[1] === lookout.z)!;
    expect(onCobbles(map, path.from[0], path.from[1])).toBe(true);
    // The lake is a few steps on, toward the north-west.
    expect(isWater(lookout.x - 5, lookout.z - 5)).toBe(true);
  });

  it('runs a dry, cobbled way from the fire across the green to the landing at the water, never steep', () => {
    const [ax, az] = way.from;
    const [bx, bz] = way.to;
    expect(Math.hypot(ax - fire.x, az - fire.z)).toBeLessThan(map.ring!.r);
    expect([bx, bz]).toEqual([landing.x, landing.z]);
    const len = Math.hypot(bx - ax, bz - az);
    let last = groundHeight(ax, az);
    for (let d = 0.25; d <= len; d += 0.25) {
      const [x, z] = [ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len];
      const h = groundHeight(x, z);
      expect(isWater(x, z)).toBe(false);
      expect(onCobbles(map, x, z)).toBe(true);
      expect(Math.abs(h - last) / 0.25, `slope at ${d} m`).toBeLessThan(0.6);
      last = h;
    }
    // The landing is at the pond's edge: dry itself, with water a step and a half past it.
    expect(isWater(landing.x, landing.z)).toBe(false);
    expect(isWater(landing.x + landing.r + 1.5, landing.z)).toBe(true);
  });

  it('stands the boards and the benches on dry, near-level ground', () => {
    const benches = map.town.benches.filter((b) => b.x > 20);
    expect(benches).toHaveLength(7);
    for (const s of [map.leaderboard, map.seaboard!, map.thanks, ...benches]) {
      expect(isWater(s.x, s.z)).toBe(false);
      // A metre either side along its length, the ground is within a hand of level.
      const [ux, uz] = [Math.cos(s.facing), -Math.sin(s.facing)];
      expect(Math.abs(groundHeight(s.x + ux, s.z + uz) - groundHeight(s.x - ux, s.z - uz))).toBeLessThan(0.12);
    }
  });

  it('puts the two catch boards either side of the way through, behind the seat wall', () => {
    const r = (s: { x: number; z: number }) => Math.hypot(s.x - fire.x, s.z - fire.z);
    expect(r(map.leaderboard)).toBeGreaterThan(map.ring!.r + 0.6);
    expect(r(map.seaboard!)).toBeCloseTo(r(map.leaderboard), 5);
    // Lake Legends on the quay side (+z), Deep Sea on the lake side, the way east between them.
    expect(map.leaderboard.z).toBeGreaterThan(az(way) + 2);
    expect(map.seaboard!.z).toBeLessThan(az(way) - 2);
  });
});

function az(way: { from: [number, number] }): number {
  return way.from[1];
}
