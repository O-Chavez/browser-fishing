import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, dayFraction, nightness, twilight } from './daynight';

describe('day/night', () => {
  it('is bright in the morning, dark at night, and loops', () => {
    expect(nightness(0.1)).toBe(0);
    expect(nightness(0.7)).toBe(1);
    expect(nightness(0.52)).toBeGreaterThan(0);
    expect(nightness(0.52)).toBeLessThan(1);
    expect(nightness(0.99)).toBeLessThan(0.1);
    expect(dayFraction(DAY_SECONDS * 3.25)).toBeCloseTo(0.25);
  });
  it('twilight peaks between day and night', () => {
    expect(twilight(0)).toBe(0);
    expect(twilight(1)).toBe(0);
    expect(twilight(0.5)).toBe(1);
  });
});
