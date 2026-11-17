import { describe, expect, it } from 'vitest';
import { keepsNativeTouch, touchLayoutWidth } from './touch';

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

describe('keepsNativeTouch', () => {
  const el = (inTop: boolean) => ({ closest: (sel: string) => (inTop && sel === '.t-top' ? {} : null) }) as unknown as EventTarget;

  it('leaves the top buttons to the browser, since they act on the click', () => {
    expect(keepsNativeTouch(el(true))).toBe(true);
  });

  it('cancels touches everywhere else on the controls, and on targets that are not elements', () => {
    expect(keepsNativeTouch(el(false))).toBe(false);
    expect(keepsNativeTouch(null)).toBe(false);
    expect(keepsNativeTouch({} as EventTarget)).toBe(false);
  });
});
