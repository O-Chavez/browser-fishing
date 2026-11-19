import { describe, expect, it } from 'vitest';
import { GAIT_BOB, GAIT_SWAY, Gait, gaitLift, gaitSway, strideAt } from './gait';

const DT = 1 / 60;
/** Runs `g` for `secs` at a steady `speed`, returning the highest lift and widest lean seen. */
function run(g: Gait, secs: number, speed: number, still = false): { lift: number; sway: number; steps: number } {
  let lift = 0;
  let sway = 0;
  const from = g.phase;
  for (let t = 0; t < secs; t += DT) {
    g.update(DT, speed, still);
    lift = Math.max(lift, gaitLift(g.phase, g.moving));
    sway = Math.max(sway, Math.abs(gaitSway(g.phase, g.moving)));
  }
  return { lift, sway, steps: (g.phase - from) / Math.PI };
}

describe('gait', () => {
  it('lifts once a step and leans once a cycle, never below the ground', () => {
    expect(gaitLift(Math.PI / 2, 1)).toBeCloseTo(GAIT_BOB);
    expect(gaitLift((3 * Math.PI) / 2, 1)).toBeCloseTo(GAIT_BOB);
    expect(gaitLift(Math.PI, 1)).toBeCloseTo(0);
    expect(gaitSway(Math.PI / 2, 1)).toBeCloseTo(GAIT_SWAY);
    expect(gaitSway((3 * Math.PI) / 2, 1)).toBeCloseTo(-GAIT_SWAY);
    for (let p = 0; p < 7; p += 0.1) expect(gaitLift(p, 0.6)).toBeGreaterThanOrEqual(0);
    expect(gaitLift(1, 0)).toBe(0);
    expect(gaitSway(1, 0)).toBe(0);
  });

  it('stands still until the avatar moves, then walks with the full bounce and sway', () => {
    const g = new Gait();
    expect(run(g, 1, 0)).toEqual({ lift: 0, sway: 0, steps: 0 });
    const walk = run(g, 2, 4.2);
    expect(g.moving).toBeGreaterThan(0.99);
    expect(walk.lift).toBeGreaterThan(GAIT_BOB * 0.95);
    expect(walk.sway).toBeGreaterThan(GAIT_SWAY * 0.95);
  });

  it('steps about 3 times a second at a walk and under 4 at a sprint, at a townsperson\'s pace when slow', () => {
    const rate = (speed: number) => {
      const g = new Gait();
      run(g, 1, speed);
      return run(g, 2, speed).steps / 2;
    };
    expect(rate(4.2)).toBeGreaterThan(2.8);
    expect(rate(4.2)).toBeLessThan(3.6);
    expect(rate(7)).toBeGreaterThan(rate(4.2));
    expect(rate(7)).toBeLessThan(4);
    // The townsfolk's stride is 1.2 m a cycle; a slow avatar's is close to it.
    expect(strideAt(1)).toBeCloseTo(1.2, 1);
  });

  it('settles back to standing within half a second of stopping, and starts the next walk from a footfall', () => {
    const g = new Gait();
    run(g, 2, 4.2);
    run(g, 0.5, 0);
    expect(g.moving).toBeLessThan(0.1);
    run(g, 1, 0);
    expect(g.moving).toBeLessThan(1e-3);
    expect(g.phase).toBe(0);
  });

  it('ignores the slow tail of a glide to a stop and a jump across the map', () => {
    const slow = new Gait();
    run(slow, 2, 0.3);
    expect(slow.moving).toBe(0);
    // A teleport: one frame at a huge speed, then the glide's tail. It never looks like more than a sprint.
    const far = new Gait();
    far.update(DT, 3000);
    const before = far.phase;
    far.update(DT, 3000);
    expect((far.phase - before) / (Math.PI * 2) / DT).toBeLessThan(2.5);
  });

  it('holds the walk off mid-jump and under an emote, and picks it up again after', () => {
    const g = new Gait();
    run(g, 2, 4.2);
    run(g, 1, 4.2, true);
    expect(g.moving).toBeLessThan(1e-3);
    run(g, 1, 4.2);
    expect(g.moving).toBeGreaterThan(0.99);
  });

  it('reset stands it still at once', () => {
    const g = new Gait();
    run(g, 2, 7);
    g.reset();
    expect(g.moving).toBe(0);
    expect(g.phase).toBe(0);
    expect(run(g, 1, 0).lift).toBe(0);
  });
});
