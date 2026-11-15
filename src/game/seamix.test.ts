import { describe, expect, it } from 'vitest';
import { chimeNow, gullCryWait, gullsAbout, rainLevel } from './seamix';
import { GULLS } from '../data/sea';

describe('sea sound mix', () => {
  it('rain follows the rain you see', () => {
    expect(rainLevel(0)).toBe(0);
    expect(rainLevel(0.5)).toBe(0);
    expect(rainLevel(1.12)).toBeCloseTo(0.5, 1);
    expect(rainLevel(2.5)).toBeCloseTo(1, 5);
  });
  it('gulls thin out with the mood and roost at night', () => {
    expect(gullsAbout(0, 0)).toBe(GULLS.count);
    expect(gullsAbout(0.3, 0)).toBeLessThan(GULLS.count);
    expect(gullsAbout(0.3, 0)).toBeGreaterThan(0);
    expect(gullsAbout(0.6, 0)).toBe(0);
    expect(gullsAbout(0, 0.9)).toBe(0);
  });
  it('gull cries come sooner with a bigger flock, never with none', () => {
    expect(gullCryWait(0, 0.5)).toBe(Infinity);
    expect(gullCryWait(GULLS.count, 0.5)).toBeLessThan(gullCryWait(1, 0.5));
    expect(gullCryWait(GULLS.count, 0)).toBeGreaterThan(5);
  });
  it('the chime rings once on arrival', () => {
    expect(chimeNow(false, true)).toBe(true);
    expect(chimeNow(true, true)).toBe(false);
    expect(chimeNow(true, false)).toBe(false);
  });
});
