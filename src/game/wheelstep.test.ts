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

  it('moves one slot per small macOS mouse notch, told apart from a trackpad by wheelDeltaY', () => {
    const w = new WheelStepper();
    // Chrome on macOS: a slow notch is ~4 px with wheelDeltaY 120; a fast spin sends bigger ones.
    const notch = (d: number, t: number) => w.step(d, 0, t, d > 0 ? -120 : 120);
    expect([notch(4.000244140625, 0), notch(4.000244140625, 60), notch(8, 100), notch(-4, 400)]).toEqual([1, 1, 1, -1]);
    // A trackpad's wheelDeltaY is -3 × deltaY, even when that happens to be 120.
    const pad = new WheelStepper();
    expect([pad.step(-40, 0, 0, 120), pad.step(-30, 0, 16, 90), pad.step(-20, 0, 32, 60)].reduce((a, b) => a + b)).toBe(-1);
    // ...including a fractional sample whose rounded wheelDeltaY lands on 120 mid-swipe.
    const frac = new WheelStepper();
    expect([frac.step(-30, 0, 0, 90), frac.step(-40.0002, 0, 16, 120), frac.step(-20, 0, 32, 60)].reduce((a, b) => a + b)).toBe(-1);
  });

  it('a swipe the other way during a momentum tail moves straight back', () => {
    const w = new WheelStepper();
    const tail = Array.from({ length: 20 }, (_, i) => [20 - i, 0, i * 16] as [number, number, number]);
    expect(run(w, tail)).toBe(1);
    expect(run(w, [[-12, 0, 330], [-14, 0, 346], [-16, 0, 362]])).toBe(-1);
  });

  it('does not let tiny drifts add up across separate gestures', () => {
    const w = new WheelStepper();
    expect(run(w, [[10, 0, 0], [10, 0, 400], [10, 0, 800]])).toBe(0);
  });
});
