import { describe, expect, it } from 'vitest';
import { JUMP_TIME, Player, jumpLift } from './player';

describe('jumping', () => {
  it('rises, lands, and cannot double-jump', () => {
    const p = new Player(60);
    p.teleport(0, 2);
    p.jump();
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      p.update(0.016, 0, 0, false, 0, []);
      peak = Math.max(peak, p.bob);
    }
    expect(peak).toBeGreaterThan(0.3);
    p.jump();
    for (let i = 0; i < 100; i++) p.update(0.016, 0, 0, false, 0, []);
    expect(p.airborne).toBe(false);
    expect(Math.abs(p.bob)).toBeLessThan(0.05);
  });

  it('jumpLift replays the arc the player flies, for other players to see', () => {
    const p = new Player(60);
    p.teleport(0, 2);
    expect(p.jump()).toBe(true);
    expect(p.jump()).toBe(false);
    const dt = 0.004;
    for (let t = dt; t < JUMP_TIME + 0.1; t += dt) {
      p.update(dt, 0, 0, false, 0, []);
      expect(Math.abs(p.bob - jumpLift(t))).toBeLessThan(0.05);
    }
    expect(jumpLift(JUMP_TIME / 2)).toBeGreaterThan(0.9);
    expect(jumpLift(JUMP_TIME)).toBe(0);
  });
});

describe('obstacles', () => {
  // Walking toward -z (fwd 1 at yaw 0) from a spot on dry land.
  const START = { x: 0, z: 12 };
  const walk = (p: Player, colliders: { x: number; z: number; r: number }[], secs: number, dt = 0.016, sprint = false) => {
    let closest = Infinity;
    for (let t = 0; t < secs; t += dt) {
      p.update(dt, 1, 0, sprint, 0, colliders);
      for (const c of colliders) closest = Math.min(closest, Math.hypot(p.x - c.x, p.z - c.z) - c.r);
    }
    return closest;
  };
  const at = () => {
    const p = new Player(60);
    p.teleport(START.x, START.z);
    return p;
  };

  it('walks freely with nothing in the way', () => {
    const p = at();
    walk(p, [], 1);
    expect(START.z - p.z).toBeGreaterThan(4);
    expect(p.x).toBeCloseTo(START.x, 6);
  });

  it('slides round a log met off-centre and carries on, never inside it', () => {
    const p = at();
    const log = { x: START.x + 0.25, z: START.z - 2, r: 0.4 };
    const closest = walk(p, [log], 1.5);
    // Never nearer than the body's own radius, pushed aside (away from the log's middle), and past it.
    expect(closest).toBeGreaterThanOrEqual(0.35 - 1e-6);
    expect(p.x).toBeLessThan(START.x - 0.3);
    expect(p.z).toBeLessThan(log.z - 1);
  });

  it('keeps moving while it touches the obstacle, with no dead stop', () => {
    const p = at();
    const log = { x: START.x + 0.25, z: START.z - 2, r: 0.4 };
    let stalled = 0;
    for (let i = 0; i < 90; i++) {
      const before = { x: p.x, z: p.z };
      p.update(0.016, 1, 0, false, 0, [log]);
      if (Math.hypot(p.x - before.x, p.z - before.z) < 1e-4) stalled++;
    }
    expect(stalled).toBe(0);
  });

  it('never gets through a wall of small posts, sprinting on slow frames', () => {
    const p = at();
    const wall = Array.from({ length: 41 }, (_, i) => ({ x: START.x - 4 + i * 0.2, z: START.z - 2, r: 0.17 }));
    const closest = walk(p, wall, 3, 0.05, true);
    expect(closest).toBeGreaterThanOrEqual(0.35 - 1e-6);
    expect(p.z).toBeGreaterThan(START.z - 2);
  });

  it('slides along a wall met at an angle', () => {
    const p = at();
    const wall = Array.from({ length: 81 }, (_, i) => ({ x: START.x - 8 + i * 0.2, z: START.z - 2, r: 0.17 }));
    // Heading 45° into the wall: forward and to the right.
    for (let t = 0; t < 1.5; t += 0.016) p.update(0.016, 1, 1, false, 0, wall);
    expect(p.z).toBeGreaterThan(START.z - 2);
    expect(p.x - START.x).toBeGreaterThan(2);
  });
});
