import { describe, expect, it } from 'vitest';
import { SkipDay } from './skipbest';

const NOON = Date.UTC(2026, 10, 17, 12);
const HOUR = 3_600_000;

describe("the day's best skip", () => {
  it('starts with none and takes the first throw that skips', () => {
    const d = new SkipDay(NOON);
    expect(d.best(NOON)).toBeNull();
    expect(d.offer('Ann', 0, NOON)).toBe(false);
    expect(d.best(NOON)).toBeNull();
    expect(d.offer('Ann', 3, NOON)).toBe(true);
    expect(d.best(NOON)).toEqual({ n: 3, name: 'Ann' });
  });

  it('goes to more skips only: a tie keeps the holder', () => {
    const d = new SkipDay(NOON);
    d.offer('Ann', 7, NOON);
    expect(d.offer('Bob', 7, NOON + 1)).toBe(false);
    expect(d.offer('Bob', 6, NOON + 2)).toBe(false);
    expect(d.best(NOON + 3)).toEqual({ n: 7, name: 'Ann' });
    expect(d.offer('Bob', 8, NOON + 4)).toBe(true);
    expect(d.best(NOON + 5)).toEqual({ n: 8, name: 'Bob' });
    // Her own tie changes nothing either.
    expect(d.offer('Bob', 8, NOON + 6)).toBe(false);
  });

  it('clears when the UTC day turns, and says so once', () => {
    const d = new SkipDay(NOON);
    d.offer('Ann', 9, NOON);
    expect(d.turned(NOON + 11 * HOUR)).toBe(false);
    expect(d.best(NOON + 11 * HOUR + 59 * 60_000)).toEqual({ n: 9, name: 'Ann' });
    const next = NOON + 12 * HOUR;
    expect(d.turned(next)).toBe(true);
    expect(d.turned(next + 1)).toBe(false);
    expect(d.best(next)).toBeNull();
    // A lower count than yesterday's takes the new day.
    expect(d.offer('Bob', 2, next + 5)).toBe(true);
    expect(d.best(next + 6)).toEqual({ n: 2, name: 'Bob' });
  });

  it("follows its holder's new name, and nobody else's", () => {
    const d = new SkipDay(NOON);
    expect(d.rename('Ann', 'Anna', NOON)).toBe(false);
    d.offer('Ann', 9, NOON);
    expect(d.rename('Bob', 'Rob', NOON + 1)).toBe(false);
    expect(d.rename('Ann', 'Ann', NOON + 1)).toBe(false);
    expect(d.rename('Ann', 'Anna', NOON + 2)).toBe(true);
    expect(d.best(NOON + 3)).toEqual({ n: 9, name: 'Anna' });
    // Yesterday's holder renamed after the day turned: nothing to change.
    expect(d.rename('Anna', 'Ann', NOON + 12 * HOUR)).toBe(false);
    expect(d.best(NOON + 12 * HOUR)).toBeNull();
  });

  it('has nothing to say when a day turns with no best standing', () => {
    const d = new SkipDay(NOON);
    expect(d.turned(NOON + 24 * HOUR)).toBe(false);
    expect(d.turned(NOON + 72 * HOUR)).toBe(false);
  });

  it('keeps a best thrown first thing on the new day, and still says the day turned', () => {
    const d = new SkipDay(NOON);
    d.offer('Ann', 9, NOON);
    const next = NOON + 12 * HOUR;
    expect(d.offer('Bob', 4, next)).toBe(true);
    expect(d.turned(next + 1)).toBe(true);
    expect(d.best(next + 1)).toEqual({ n: 4, name: 'Bob' });
  });
});
