import { describe, expect, it } from 'vitest';
import { WheelStepper } from './wheelstep';

const run = (w: WheelStepper, events: [deltaY: number, mode: number, t: number][]) =>
  events.reduce((sum, [d, m, t]) => sum + w.step(d, m, t), 0);

describe('WheelStepper', () => {
  it('moves one slot per mouse notch, even when spun fast', () => {
    const w = new WheelStepper();
    expect(run(w, [[100, 0, 0], [100, 0, 20], [100, 0, 40]])).toBe(3);
    expect(run(w, [[-120, 0, 500]])).toBe(-1);
  });

  it('treats line and page deltas as notches', () => {
    const w = new WheelStepper();
    expect(run(w, [[3, 1, 0], [3, 1, 30], [-1, 2, 60]])).toBe(1);
  });

  it('moves one slot per trackpad swipe, ignoring its momentum', () => {
    const w = new WheelStepper();
    const swipe = (t0: number, sign: number) =>
      Array.from({ length: 40 }, (_, i) => [sign * (i < 10 ? 6 : 60 / (i - 8)), 0, t0 + i * 16] as [number, number, number]);
    expect(run(w, swipe(0, 1))).toBe(1);
    expect(run(w, swipe(2000, 1))).toBe(1);
    expect(run(w, swipe(4000, -1))).toBe(-1);
  });

  it('does not double-step a swipe that opens with one large sample', () => {
    const w = new WheelStepper();
    expect(run(w, [[70, 0, 0], [20, 0, 16], [20, 0, 32], [15, 0, 48], [8, 0, 64]])).toBe(1);
  });

  it('does not let tiny drifts add up across separate gestures', () => {
    const w = new WheelStepper();
    expect(run(w, [[10, 0, 0], [10, 0, 400], [10, 0, 800]])).toBe(0);
  });
});
