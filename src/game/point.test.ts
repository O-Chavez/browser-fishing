import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FISH } from '../data/content';
import { LOG, MAPS, archPosts, atBearing, campLogs, campRim, campSeats, onCobbles, readingSpot, seatPlanks, type Spot } from '../data/maps';
import { KETTLE_COUNTER_Z, KETTLE_KEEPER, TREAD_DEPTH, buildLanternPier } from './camp';
import { ROCKET_JETTY, groundHeight, isWater, onLanding, setAprons, setLevels, setPad, terrainHeight } from './env';
import type { Hub, LeaderRow } from './hub';
import type { Circle } from './player';
import { fishingSpot } from './progression';
import type { Town } from './town';

/** A canvas that draws nothing, and an image that never loads: the town and the hub only need something to hold their textures. */
function fakeCanvas(): unknown {
  const canvas: Record<string, unknown> = { width: 0, height: 0 };
  const ctx: unknown = new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ctx),
    set: (t, k, v) => ((t[k] = v), true),
  });
  canvas.getContext = () => ctx;
  return canvas;
}
vi.stubGlobal('document', { createElement: fakeCanvas, createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) });
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Ember Point, the campfire on the east headland (`CAMP` in maps.ts): its terrace, its seats and panels, the beach and the jetty. */
describe('Ember Point', () => {
  const map = MAPS[0];
  setPad(map.pad);
  setAprons(map.aprons ?? []);
  setLevels(map.levels ?? []);
  const camp = map.camp!;
  const fire = map.campfire;
  const fromFire = (p: { x: number; z: number }) => Math.hypot(p.x - fire.x, p.z - fire.z);
  const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  /** A board's two posts, `half` m either side of its middle (hub.ts). */
  const posts = (b: Spot, half: number) => [-half, half].map((lx) => ({ x: b.x + lx * Math.cos(b.facing), z: b.z - lx * Math.sin(b.facing) }));
  const boards = [map.thanks, map.leaderboard, map.seaboard!];
  const seats = campSeats(map);
  const fireLogs = campLogs(map).slice(0, camp.logs.at.length);

  it('lays a level, cobbled terrace 11 m across, flat on behind the panels to the retaining wall', () => {
    expect(camp.r * 2).toBe(11);
    for (let deg = 0; deg < 360; deg += 5) {
      for (let r = 0; r <= camp.r; r += 0.5) {
        const p = atBearing(fire, r, deg);
        expect(groundHeight(p.x, p.z), `${deg}° ${r} m`).toBeCloseTo(0.85, 5);
        expect(onCobbles(map, p.x, p.z, 0.01)).toBe(true);
        // The mesh the cobbles lie on is within a hand of the level too, even at the rim above the banks.
        expect(Math.abs(terrainHeight(p.x, p.z) - 0.85)).toBeLessThan(0.1);
      }
    }
    // Behind the panels the floor runs on to the wall's line, and the bank stands behind it for the wall to hold.
    for (const wall of camp.wall) {
      for (let deg = wall.from; deg <= wall.to; deg += 4) {
        const foot = atBearing(fire, wall.r - 0.3, deg);
        const top = atBearing(fire, wall.r + 1.8, deg);
        expect(groundHeight(foot.x, foot.z), `${deg}°`).toBeCloseTo(0.85, 5);
        expect(terrainHeight(foot.x, foot.z)).toBeLessThan(0.9);
        const rise = groundHeight(top.x, top.z) - 0.85;
        expect(rise, `${deg}°`).toBeGreaterThan(0.6);
        expect(rise).toBeLessThan(1.05);
      }
    }
  });

  it('keeps the shore about where it was: the terrace reaches a metre further into the cove', () => {
    // On main the cove's shore west of the fire was at about x 14.4.
    expect(isWater(13.9, fire.z)).toBe(false);
    expect(isWater(12.9, fire.z)).toBe(true);
  });

  it('seats 24 round the fire and 6 on the beach', () => {
    expect(fireLogs).toHaveLength(6);
    expect(seatPlanks(camp)).toHaveLength(12);
    expect(seats.filter((s) => fromFire(s) < camp.r + 1)).toHaveLength(24);
    // Two logs and a bench on the beach.
    const bench = map.town.benches.filter((b) => fromFire(b) > camp.r && fromFire(b) < 12);
    expect(bench).toHaveLength(1);
    expect(seats.filter((s) => fromFire(s) > camp.r + 1)).toHaveLength(4);
    for (const s of [...seats, ...bench]) expect(isWater(s.x, s.z)).toBe(false);
  });

  it('breaks the seat wall only for the lantern pier, with a crown post at every other join it has', () => {
    const { from, to, pier, gap } = camp.seatWall;
    const planks = seatPlanks(camp);
    const mid = campRim(camp);
    const span = (p: { deg: number; len: number }) => ((p.len / 2 / mid) * 180) / Math.PI;
    expect(planks[0].deg - span(planks[0])).toBeCloseTo(from, 5);
    expect(planks[planks.length - 1].deg + span(planks[planks.length - 1])).toBeCloseTo(to, 5);
    let gaps = 0;
    for (let i = 1; i < planks.length; i++) {
      const open = (((planks[i].deg - span(planks[i]) - (planks[i - 1].deg + span(planks[i - 1]))) * Math.PI) / 180) * mid;
      if (open < 1e-6) continue;
      gaps++;
      expect(open).toBeCloseTo(gap, 5);
      expect((planks[i].deg + planks[i - 1].deg) / 2).toBeCloseTo(pier, 0);
    }
    expect(gaps).toBe(1);
    // A seat for one on each plank, and no crown post in the middle of one.
    for (const p of planks) {
      expect(p.len).toBeGreaterThan(0.85);
      expect(p.len).toBeLessThan(1.3);
      for (const deg of camp.crown) expect(Math.abs(deg - p.deg) > span(p) - 1e-6, `post ${deg}°`).toBe(true);
    }
  });

  it('leaves a clear ring at least 1.8 m wide behind every log', () => {
    // Nothing built stands in it: every collider is the hearth's, a log's, or out past the ring (`built`, below, checks the same on the built camp).
    const rim = Math.min(
      campRim(camp) - 0.27,
      campRim(camp) - 0.15,
      ...posts(map.thanks, 0.6).map((p) => fromFire(p) - 0.25),
      ...[map.leaderboard, map.seaboard!].flatMap((b) => posts(b, 1).map((p) => fromFire(p) - 0.3)),
      fromFire(camp.derby) - 0.3,
    );
    for (const l of fireLogs) {
      for (const side of LOG.solids) {
        const c = { x: l.x + side * Math.cos(l.facing), z: l.z - side * Math.sin(l.facing) };
        expect(rim - (fromFire(c) + LOG.r), `log at ${l.x.toFixed(1)}, ${l.z.toFixed(1)}`).toBeGreaterThanOrEqual(1.8);
      }
    }
    // The logs leave the way in and the way to the beach steps open: about 2 m between the ends of the logs either
    // side of each line.
    const ends = (l: Spot) => LOG.solids.map((side) => ({ x: l.x + side * Math.cos(l.facing), z: l.z - side * Math.sin(l.facing) }));
    for (const way of [345, 180]) {
      const [a, b] = [...fireLogs].sort((p, q) => apart(p, atBearing(fire, camp.logs.r, way)) - apart(q, atBearing(fire, camp.logs.r, way)));
      const gap = Math.min(...ends(a).flatMap((p) => ends(b).map((q) => apart(p, q)))) - 2 * LOG.r;
      expect(gap, `at ${way}°`).toBeGreaterThan(1.7);
    }
  });

  it('stands the panels on the back rim facing the fire, 2.5 m or more apart, each read from the clear ring', () => {
    const bay = atBearing(fire, fromFire(map.leaderboard), (camp.apron.from + camp.apron.to) / 2);
    const panels = [...boards, bay, camp.derby];
    const before = (p: { x: number; z: number }) => ({ x: p.x + ((fire.x - p.x) * 1.5) / fromFire(p), z: p.z + ((fire.z - p.z) * 1.5) / fromFire(p) });
    for (const b of boards) {
      expect(fromFire(b)).toBeGreaterThan(camp.r);
      expect(fromFire(b)).toBeLessThan(camp.r + 0.4);
      // Facing the fire: a step along its facing is a step nearer.
      expect(fromFire(readingSpot(b))).toBeCloseTo(fromFire(b) - 1.5, 5);
      // The reading spot is in the ring between the logs and the rim, on the cobbles.
      const spot = readingSpot(b);
      expect(fromFire(spot)).toBeGreaterThan(camp.logs.r + 0.6);
      expect(onCobbles(map, spot.x, spot.z)).toBe(true);
    }
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        expect(apart(panels[i], panels[j]), `${i} and ${j}`).toBeGreaterThanOrEqual(2.5);
        // A catch board's prompt reaches 2 m from its reading spot (`BOARD_RANGE` in game.ts): short of where the
        // next panel is read from, 1.5 m nearer the fire than it stands.
        expect(apart(before(panels[i]), before(panels[j]))).toBeGreaterThan(2);
      }
    }
    // The crown's posts stand clear of every panel's width and of the two ways through the rim.
    const clear: [number, number][] = [[camp.apron.from, camp.apron.to], [345 - 11.5, 345 + 11.5], [180 - 9.5, 180 + 9.5]];
    for (const deg of camp.crown) {
      const p = atBearing(fire, campRim(camp), deg);
      for (const b of [map.leaderboard, map.seaboard!]) expect(apart(p, b), `post ${deg}°`).toBeGreaterThan(1.45);
      expect(apart(p, map.thanks)).toBeGreaterThan(1);
      expect(apart(p, camp.derby)).toBeGreaterThan(1);
      for (const [a, b] of clear) expect(((deg - a + 360) % 360) > ((b - a + 360) % 360), `post ${deg}° in ${a}..${b}`).toBe(true);
    }
  });

  it('puts no seat within reach of a board reader in the direction of the board', () => {
    for (const b of [map.leaderboard, map.seaboard!]) {
      const spot = readingSpot(b);
      const toBoard = Math.atan2(b.x - spot.x, b.z - spot.z);
      for (const s of seats) {
        if (apart(s, spot) > 1.5) continue;
        // A seat that close is behind the reader: more than a quarter turn from the way to the board.
        const turn = Math.atan2(s.x - spot.x, s.z - spot.z) - toBoard;
        expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))), `seat at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`).toBeGreaterThan(Math.PI / 2);
      }
    }
  });

  it('brings the lane in from where the lanes meet, level and on cobbles, with the arch across it', () => {
    const lane = map.town.paths.find((p) => fromFire({ x: p.to[0], z: p.to[1] }) < camp.r)!;
    expect(lane.from).toEqual([17.4, 9.4]);
    expect(lane.w).toBe(2.2);
    const len = Math.hypot(lane.to[0] - lane.from[0], lane.to[1] - lane.from[1]);
    for (let d = 0; d <= len; d += 0.25) {
      const [x, z] = [lane.from[0] + ((lane.to[0] - lane.from[0]) * d) / len, lane.from[1] + ((lane.to[1] - lane.from[1]) * d) / len];
      expect(groundHeight(x, z), `${d} m`).toBeCloseTo(0.85, 5);
    }
    // The arch's middle is on the lane's line, its posts just off the cobbles' edge on level ground.
    const { arch } = camp;
    const along = ((arch.x - lane.from[0]) * (lane.to[0] - lane.from[0]) + (arch.z - lane.from[1]) * (lane.to[1] - lane.from[1])) / len;
    expect(Math.hypot(arch.x - lane.from[0], arch.z - lane.from[1]) - along).toBeLessThan(0.02);
    for (const p of posts(arch, arch.w / 2)) expect(groundHeight(p.x, p.z)).toBeCloseTo(0.85, 2);
  });

  it("levels Skipper's Beach below the terrace: dry sand under its seats, the Totem, the stones and the sign", () => {
    const bench = map.town.benches.find((b) => fromFire(b) > camp.r && fromFire(b) < 12)!;
    for (const p of [...camp.beachLogs, bench, camp.totem, camp.stones, camp.skipSign, ...seats.filter((s) => fromFire(s) > camp.r + 1)]) {
      // The bench stands at the toe of the ramp of sand under the steps, a few millimetres up it.
      expect(groundHeight(p.x, p.z), `${p.x}, ${p.z}`).toBeCloseTo(0.45, 2);
      expect(isWater(p.x, p.z)).toBe(false);
    }
    // The steps come down the terrace's bank: three treads, 0.4 m from their top to the sand at their foot, on a
    // ramp of sand that falls with them, so nobody on a tread stands more than a few centimetres off its stone.
    const st = camp.steps;
    expect(st.rise * st.treads).toBeCloseTo(0.4, 5);
    expect(groundHeight(st.x, st.z)).toBeCloseTo(0.85, 5);
    for (let i = 0; i < st.treads; i++) {
      const tread = atBearing(fire, fromFire(st) + i * TREAD_DEPTH, 180);
      expect(Math.abs(groundHeight(tread.x, tread.z) - (0.85 - i * st.rise)), `tread ${i}`).toBeLessThan(0.03);
      for (const edge of [-0.2, 0.2]) expect(Math.abs(groundHeight(tread.x, tread.z + edge) - (0.85 - i * st.rise))).toBeLessThan(0.08);
    }
    const foot = atBearing(fire, fromFire(st) + (st.treads - 0.5) * TREAD_DEPTH + 0.25, 180);
    expect(groundHeight(foot.x, foot.z)).toBeCloseTo(0.45, 5);
    // A clear way 2 m wide from the steps' foot to the jetty's root: the logs, the bench and the Totem stand off it.
    const root = { x: (ROCKET_JETTY.x0 + ROCKET_JETTY.x1) / 2, z: ROCKET_JETTY.z1 };
    const off = (p: { x: number; z: number }) => {
      const [dx, dz] = [root.x - foot.x, root.z - foot.z];
      const t = Math.max(0, Math.min(1, ((p.x - foot.x) * dx + (p.z - foot.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(p.x - foot.x - dx * t, p.z - foot.z - dz * t);
    };
    for (let t = 0; t <= 1; t += 0.1) {
      const [x, z] = [foot.x + (root.x - foot.x) * t, foot.z + (root.z - foot.z) * t];
      expect(isWater(x, z)).toBe(false);
      expect(Math.abs(groundHeight(x, z) - 0.45)).toBeLessThan(0.16);
    }
    for (const l of camp.beachLogs) for (const side of LOG.solids) expect(off({ x: l.x + side * Math.cos(l.facing), z: l.z - side * Math.sin(l.facing) }) - LOG.r).toBeGreaterThan(1);
    expect(off(bench) - 0.8).toBeGreaterThan(1);
    // The Totem is about 1.7 m across.
    expect(off(camp.totem) - 0.85).toBeGreaterThan(1);
    // The seats are 3 m and more from the stone pile.
    for (const s of [...camp.beachLogs, bench]) expect(apart(s, camp.stones)).toBeGreaterThanOrEqual(3);
  });

  it('runs the rocket jetty from dry sand out over the water, a landing that fishes as the shore does', () => {
    const j = ROCKET_JETTY;
    const mid = (j.x0 + j.x1) / 2;
    expect(j.x1 - j.x0).toBeCloseTo(2.2, 5);
    expect(j.z1 - j.z0).toBeCloseTo(5.5, 5);
    // Dry at its root, a step onto the sand off either corner; deep water under its end and round it.
    for (const x of [j.x0 + 0.1, mid, j.x1 - 0.1]) {
      expect(groundHeight(x, j.z1 + 0.3), `root at ${x}`).toBeGreaterThan(0.3);
      expect(groundHeight(x, j.z1 - 0.3)).toBeGreaterThan(0.3);
      expect(groundHeight(x, j.z0)).toBeLessThan(-1);
    }
    expect(isWater(mid, j.z0 - 1)).toBe(true);
    expect(isWater(j.x0 - 1.5, j.z0 + 1)).toBe(true);
    expect(isWater(j.x1 + 1.5, j.z0 + 1)).toBe(true);
    // The sand at its root comes up to just under its boards.
    expect(groundHeight(mid, j.z1 - 0.2)).toBeCloseTo(0.6, 5);
    expect(onLanding(mid, j.z0 + 0.5)).toBe(true);
    expect(fishingSpot(mid, j.z0 + 0.5)).toBe('shore');
    expect(camp.rack.x > j.x0 && camp.rack.x < j.x1 && camp.rack.z > j.z0 && camp.rack.z < j.z1).toBe(true);
    // The lantern stands on a pile in the water, a step off the corner of the jetty's end.
    const lamp = camp.jettyLantern;
    expect(groundHeight(lamp.x, lamp.z)).toBeLessThan(-1);
    expect(lamp.x).toBeLessThan(j.x0);
    expect(Math.hypot(lamp.x - j.x0, lamp.z - j.z0)).toBeLessThan(0.5);
    // The rack is 9 m from the nearest seat at the fire and 4 m from the beach's.
    for (const s of seats) expect(apart(s, camp.rack)).toBeGreaterThan(fromFire(s) < camp.r + 1 ? 9 : 4);
  });

  it('keeps the far hills as they were: the jetty holds no ground down', () => {
    // A hilltop 91 m from the jetty and 106 m from the pier's T end stands as the pier's deck bed leaves it, 16.4 m,
    // and not the 14.2 m a bed under the jetty would cut it to.
    expect(groundHeight(100.75, -53.53)).toBeCloseTo(16.44, 1);
  });

  /** The camp as the game builds it: the town's props and the hub's fire and boards, with every collider they stand. */
  describe('as built', () => {
    let town: Town;
    let hub: Hub;
    let solids: Circle[];
    beforeAll(async () => {
      town = new (await import('./town')).Town(map);
      hub = new (await import('./hub')).Hub(map);
      // The camp's own: everything within reach of the terrace, the beach, the jetty and the gate.
      solids = [...town.colliders, ...hub.colliders].filter((c) => fromFire(c) < 17);
    });
    /** How far a point is from the line between two others. */
    const offLine = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const [dx, dz] = [b.x - a.x, b.z - a.z];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    };
    /** A spot in a prop's own frame (x across, z out of its front), on the map. */
    const from = (s: Spot, lx: number, lz: number) => ({ x: s.x + lx * Math.cos(s.facing) + lz * Math.sin(s.facing), z: s.z - lx * Math.sin(s.facing) + lz * Math.cos(s.facing) });

    it('stands every prop with a collider, and none in the clear ring behind the logs', () => {
      // The logs' backs are 3.24 m from the fire, so the ring runs out to 5.04 m.
      const inner = Math.hypot(camp.logs.r, LOG.solids[1]) + LOG.r;
      for (const c of solids) {
        const [near, far] = [fromFire(c) - c.r, fromFire(c) + c.r];
        expect(far <= inner + 1e-6 || near >= inner + 1.8, `collider at ${c.x.toFixed(2)}, ${c.z.toFixed(2)}, ${near.toFixed(2)} to ${far.toFixed(2)} m out`).toBe(true);
      }
      // What the camp adds stands solid: the stall, the Derby stand, the Totem, the stones and their sign, the
      // rack, the signpost, the lantern's pier and both of the arch's posts.
      const at = [camp.stall, camp.derby, camp.totem, camp.stones, camp.skipSign, camp.rack, camp.signpost, camp.pier, ...archPosts(camp.arch, fire)];
      for (const p of at) expect(solids.some((c) => apart(c, p) < c.r + 0.7), `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBe(true);
    });

    it('keeps the lanes, the steps and the way to the jetty clear', () => {
      // The three lanes that meet above the terrace keep 2 m between whatever stands beside them, the arch's posts included.
      const lanes = map.town.paths.filter((p) => apart({ x: p.to[0], z: p.to[1] }, { x: 17.4, z: 9.4 }) < 0.01 || apart({ x: p.from[0], z: p.from[1] }, { x: 17.4, z: 9.4 }) < 0.01);
      expect(lanes).toHaveLength(3);
      for (const lane of lanes) {
        const [a, b] = [{ x: lane.from[0], z: lane.from[1] }, { x: lane.to[0], z: lane.to[1] }];
        // The lane onto the terrace ends inside its cobbles, where the logs stand: it is checked as far as the kerb.
        const end = fromFire(b) < camp.r ? { x: a.x + ((b.x - a.x) * 0.84), z: a.z + ((b.z - a.z) * 0.84) } : b;
        for (const c of solids) expect(offLine(c, a, end) - c.r, `collider at ${c.x.toFixed(2)}, ${c.z.toFixed(2)}`).toBeGreaterThanOrEqual(1);
      }
      // Down the steps between the two crown posts that flank them, then 2 m wide across the sand to the jetty's root.
      const st = camp.steps;
      const top = atBearing(fire, camp.r - 0.2, 180);
      const foot = atBearing(fire, fromFire(st) + (st.treads - 0.5) * TREAD_DEPTH + 0.25, 180);
      const root = { x: (ROCKET_JETTY.x0 + ROCKET_JETTY.x1) / 2, z: ROCKET_JETTY.z1 };
      for (const c of solids) {
        expect(offLine(c, top, foot) - c.r, `by the steps: ${c.x.toFixed(2)}, ${c.z.toFixed(2)}`).toBeGreaterThanOrEqual(0.8);
        expect(offLine(c, foot, root) - c.r, `on the way to the jetty: ${c.x.toFixed(2)}, ${c.z.toFixed(2)}`).toBeGreaterThanOrEqual(1);
      }
      // And on along the jetty to the rack at its end.
      for (const c of solids) if (c.z > camp.rack.z + 1) expect(offLine(c, root, { x: root.x, z: camp.rack.z + 1.2 }) - c.r).toBeGreaterThanOrEqual(1);
    });

    it('cordons the camp: the fence runs from the gate round behind the hedge and down to the water', () => {
      const [inner, outer] = archPosts(camp.arch, fire);
      const [toGate, down] = camp.fence.runs;
      expect(apart({ x: toGate.to[0], z: toGate.to[1] }, outer)).toBeLessThan(0.01);
      // The seat wall ends at the arch's other post, and the stone ledge under it stops short of the lane.
      expect(apart(inner, atBearing(fire, campRim(camp), camp.seatWall.to))).toBeLessThan(0.3);
      // The fence's end stands at the water's edge.
      const [ex, ez] = down.to;
      expect(groundHeight(ex, ez)).toBeLessThan(0.35);
      expect([0, 1, 2, 3].some((k) => isWater(ex + Math.cos(k * 1.57) * 1.2, ez + Math.sin(k * 1.57) * 1.2))).toBe(true);
      // Nobody slips through: along the fence's arc and both of its runs, every point has one of the fence's own
      // colliders standing on it (the hedge's and the walls' stand half a metre off its line).
      const { arc } = camp.fence;
      const lines: [number, number][][] = [
        Array.from({ length: arc.to - arc.from + 1 }, (_, i) => Object.values(atBearing(fire, arc.r, arc.from + i)) as [number, number]),
        [toGate.from, toGate.to],
        [down.from, ...down.via!, down.to],
      ];
      for (const line of lines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const steps = Math.ceil(Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]) / 0.1);
          for (let k = 0; k <= steps; k++) {
            const p = { x: line[i][0] + ((line[i + 1][0] - line[i][0]) * k) / steps, z: line[i][1] + ((line[i + 1][1] - line[i][1]) * k) / steps };
            expect(solids.some((c) => c.r <= 0.3 && apart(c, p) <= 0.31), `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBe(true);
          }
        }
      }
      // The hedge ends on a stone pier at each end, and the fence starts from each pier.
      for (const [pier, start] of [[camp.piers[0], toGate.from], [camp.piers[1], down.from]] as const) {
        expect(solids.some((c) => apart(c, pier) < c.r)).toBe(true);
        expect(apart(pier, { x: start[0], z: start[1] })).toBeLessThan(0.75);
        // On the hedge's line at its end, no wider than the hedge by more than a hand.
        expect(fromFire(pier)).toBeCloseTo(camp.hedge.r, 1);
      }
      // Nobody wades round either: past the fence's end, and at the foot of the ledge on the cove side, a player
      // (0.35 m) finds no ground shallower than the 0.3 m they can stand in.
      const wadeable = (x: number, z: number) => groundHeight(x, z) >= -0.3 && !solids.some((c) => apart(c, { x, z }) < c.r + 0.35);
      const [vx, vz] = down.via![down.via!.length - 1];
      const run = Math.hypot(ex - vx, ez - vz);
      for (let d = 0.2; d <= 3; d += 0.1) expect(wadeable(ex + ((ex - vx) * d) / run, ez + ((ez - vz) * d) / run), `${d.toFixed(1)} m past the fence`).toBe(false);
      for (const deg of [230, 250, 270, 290]) for (let r = campRim(camp); r < 12; r += 0.1) expect(wadeable(...(Object.values(atBearing(fire, r, deg)) as [number, number])), `${deg}° ${r.toFixed(1)} m`).toBe(false);
      // The retaining wall leaves the stall's width between its two arcs and nothing else.
      const [south, north] = camp.wall;
      expect(south.from).toBe(camp.hedge.from);
      expect(north.to).toBe(camp.hedge.to);
      const gap = 2 * south.r * Math.sin((((north.from - south.to) / 2) * Math.PI) / 180);
      expect(gap).toBeGreaterThan(3.3);
      expect(gap).toBeLessThan(3.8);
    });

    it("stands Bram Tinder behind his stall's counter, talked to across it", () => {
      const bram = town.npcs.find((n) => n.def.name === 'Bram Tinder')!;
      const keeper = from(camp.stall, KETTLE_KEEPER.x, KETTLE_KEEPER.z);
      expect(apart(bram.def, keeper)).toBeLessThan(0.01);
      expect(bram.def.facing).toBeCloseTo(camp.stall.facing, 5);
      expect(bram.def.front).toBeCloseTo(camp.stall.facing, 5);
      expect(KETTLE_KEEPER.z).toBeLessThan(KETTLE_COUNTER_Z - 1);
      // A player at the counter stands off the terrace's ring, within reach of his prompt, with the counter between them.
      const stand = from(camp.stall, 0, KETTLE_COUNTER_Z + 0.5);
      expect(fromFire(stand) - 0.35).toBeGreaterThan(Math.hypot(camp.logs.r, LOG.solids[1]) + LOG.r + 1.8 - 0.1);
      expect(apart(stand, bram.def) - 0.5).toBeLessThan(3);
      expect(solids.some((c) => offLine(c, stand, bram.def) < c.r)).toBe(true);
      expect(onCobbles(map, stand.x, stand.z) || fromFire(stand) < camp.apron.r).toBe(true);
      expect(bram.def.lines).toHaveLength(4);
      expect(bram.def.nightLines).toEqual(["Fire's best after dark. So is the company."]);
      expect(town.talk(bram, false)).toBe(`Bram Tinder: "Welcome to Anglers' Rest. Pull up a log. The kettle's always on."`);
    });

    it('keeps things with prompts 2.5 m or more apart, or turned different ways', () => {
      // The fire's prompt reaches 2.6 m from its middle (`FIRE_RANGE` in game.ts); the boards' and Bram's are read
      // from in front, facing them.
      const bram = town.npcs.find((n) => n.def.name === 'Bram Tinder')!;
      const prompts: { x: number; z: number; face?: number }[] = [
        { ...readingSpot(map.leaderboard), face: map.leaderboard.facing },
        { ...readingSpot(map.seaboard!), face: map.seaboard!.facing },
        { ...from(camp.stall, 0, KETTLE_COUNTER_Z + 0.5), face: bram.def.front },
        { x: fire.x, z: fire.z },
        ...map.town.bottles.filter((b) => fromFire(b) < 15),
      ];
      const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      for (let i = 0; i < prompts.length; i++) {
        for (let j = i + 1; j < prompts.length; j++) {
          const [a, b] = [prompts[i], prompts[j]];
          const apartWays = a.face !== undefined && b.face !== undefined && turn(a.face, b.face) > (2 * Math.PI) / 3;
          expect(apart(a, b) >= 2.5 || apartWays, `${i} and ${j}: ${apart(a, b).toFixed(2)} m`).toBe(true);
        }
      }
      // A seat within reach of someone at the counter is behind them, as at the boards.
      const stand = prompts[2];
      for (const s of seats) {
        if (apart(s, stand) > 1.5) continue;
        expect(turn(Math.atan2(s.x - stand.x, s.z - stand.z), Math.atan2(bram.def.x - stand.x, bram.def.z - stand.z))).toBeGreaterThan(Math.PI / 2);
      }
      // The beach's bottle is out of reach (2.6 m) of anyone within a step of a seat.
      for (const b of map.town.bottles.filter((k) => fromFire(k) < 15)) for (const s of seats) expect(apart(b, s), `bottle ${b.id}`).toBeGreaterThan(3.6);
      // The skip sign and the Derby stand have no prompt, and no seat or board is read from where they stand.
      for (const p of prompts) for (const quiet of [camp.skipSign, camp.derby]) expect(apart(p, quiet)).toBeGreaterThan(2.5);
    });

    it('mounts each board\'s number one catch over it, filling the mount whatever the fish, and a bare mount when it has none', () => {
      type Mounted = { anchor: THREE.Object3D; shown: string; fish: { group: THREE.Object3D; orbit?: THREE.Object3D } | null; tall: THREE.Object3D | null };
      const tall: string[] = [];
      const trophies = hub as unknown as { lakeTrophy: Mounted; seaTrophy: Mounted };
      const row = (name: string, fishId: string, shiny = false): LeaderRow => {
        const f = FISH.find((x) => x.id === fishId)!;
        return { name, level: 30, value: 1000, fish: f.name, tier: f.tier, color: '#fff', shiny, fishId, ...(f.sea ? { sea: true } : {}) };
      };
      /** The fish's outline on its mount, in the mount's own frame (x across the board, y up), without the sparkles that circle it. */
      const outline = (t: Mounted): THREE.Box3 => {
        t.anchor.updateMatrixWorld(true);
        const inv = t.anchor.matrixWorld.clone().invert();
        const box = new THREE.Box3();
        const grow = (o: THREE.Object3D): void => {
          if (o === t.fish!.orbit) return;
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.Material).depthWrite) {
            m.geometry.computeBoundingBox();
            box.union(m.geometry.boundingBox!.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));
          }
          o.children.forEach(grow);
        };
        grow(t.fish!.group);
        return box;
      };
      expect(trophies.lakeTrophy.anchor.children).toHaveLength(0);
      expect(trophies.lakeTrophy.shown).toBe('-');
      // The Kraken, the Leviathan, a long thin fish, a round one and a small one: each fills the same box, 1.4 m by
      // 0.8 m, touching it one way or the other, and sits in its middle. The Kraken, taller than wide with its arms
      // out, stands up to 1.2 m high from the box's foot.
      for (const [id, shiny] of [['kraken', true], ['kraken', false], ['leviathan', false], ['oarfish', false], ['bluegill', false], ['minnow', false], ['constellation', false]] as const) {
        hub.setLeaders([row('Wren', 'trout')], [row('Reed', id, shiny)]);
        for (const t of [trophies.lakeTrophy, trophies.seaTrophy]) {
          // The fish, and behind a tall one its own back board.
          expect(t.anchor.children).toContain(t.fish!.group);
          expect(t.anchor.children).toHaveLength(t.tall ? 2 : 1);
          const size = outline(t).getSize(new THREE.Vector3());
          const middle = outline(t).getCenter(new THREE.Vector3());
          expect(size.x, id).toBeLessThan(1.41);
          expect(size.y, id).toBeLessThan(t.tall ? 1.21 : 0.81);
          if (t === trophies.seaTrophy) tall.push(...(t.tall ? [id] : []));
          expect(size.x > 1.39 || size.y > 0.79, `${id}: ${size.x.toFixed(2)} by ${size.y.toFixed(2)}`).toBe(true);
          expect(Math.abs(middle.x), id).toBeLessThan(0.01);
          expect(middle.y - size.y / 2, id).toBeGreaterThan(-0.41);
          expect(middle.y, id).toBeCloseTo(Math.max(0, size.y - 0.8) / 2, 2);
        }
      }
      expect(tall).toContain('kraken');
      expect(trophies.lakeTrophy.shown).toContain('Wren|trout');
      expect(trophies.seaTrophy.shown).toContain('Reed|constellation');
      // The same rows again build nothing new and draw nothing: the board's canvas is not uploaded again.
      const faces = hub as unknown as { lakeFace: { tex: THREE.CanvasTexture }; seaFace: { tex: THREE.CanvasTexture } };
      const before = trophies.lakeTrophy.anchor.children[0];
      const drawn = [faces.lakeFace.tex.version, faces.seaFace.tex.version];
      hub.setLeaders([row('Wren', 'trout')], [row('Reed', 'constellation')]);
      expect(trophies.lakeTrophy.anchor.children[0]).toBe(before);
      expect([faces.lakeFace.tex.version, faces.seaFace.tex.version]).toEqual(drawn);
      // A new number one takes the old one's place, and the old model's own geometries (its fins) are freed while
      // the ones every fish of its shape shares (its body) are kept. No rows clear the mount.
      const freed: boolean[] = [];
      trophies.lakeTrophy.fish!.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.addEventListener('dispose', () => freed.push(!!m.geometry.userData.shared));
      });
      hub.setLeaders([row('Pip', 'pike')], []);
      expect(trophies.lakeTrophy.anchor.children[0]).not.toBe(before);
      expect(faces.lakeFace.tex.version).toBeGreaterThan(drawn[0]);
      expect(freed.length).toBeGreaterThan(2);
      expect(freed.every((shared) => !shared)).toBe(true);
      expect(trophies.seaTrophy.anchor.children).toHaveLength(0);
      // A player with no catch yet heads the lake board offline: the mount stays bare.
      hub.setLeaders([{ name: 'New', level: 1, value: 0, fish: '', tier: 0, color: '#fff' }], []);
      expect(trophies.lakeTrophy.anchor.children).toHaveLength(0);
    });

    it('keeps the lantern pier no taller than someone sitting beside it', () => {
      // A sitter's head is about 1.3 m above the floor; the pier and its lantern stop short of that.
      expect(new THREE.Box3().setFromObject(buildLanternPier(0.17).group).max.y).toBeLessThan(1.3);
    });
  });
});
