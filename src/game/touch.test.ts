import { describe, expect, it } from 'vitest';
import { touchLayoutWidth } from './touch';

describe('touchLayoutWidth', () => {
  it('keeps phones near 0.6x and caps at 1400', () => {
    expect(touchLayoutWidth(390, 844)).toBe(1400);
    expect(touchLayoutWidth(667, 375)).toBe(1112);
    expect(844 / touchLayoutWidth(844, 390)).toBeCloseTo(0.6, 1);
    expect(667 / touchLayoutWidth(375, 667)).toBeCloseTo(0.6, 1);
  });

  it('never goes under 1000, and tablets keep 1400', () => {
    expect(touchLayoutWidth(320, 480)).toBe(1000);
    expect(touchLayoutWidth(1180, 820)).toBe(1400);
    expect(touchLayoutWidth(0, 0)).toBe(1400);
  });
});
