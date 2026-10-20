import { describe, expect, it } from 'vitest';
import { shortCoins } from './format';

describe('shortCoins', () => {
  it('keeps small amounts whole and shortens big ones without rounding up', () => {
    expect(shortCoins(66)).toBe('66');
    expect(shortCoins(999)).toBe('999');
    expect(shortCoins(1000)).toBe('1k');
    expect(shortCoins(1250)).toBe('1.2k');
    expect(shortCoins(9999)).toBe('9.9k');
    expect(shortCoins(12_480)).toBe('12k');
    expect(shortCoins(999_999)).toBe('999k');
    expect(shortCoins(1_530_000)).toBe('1.5M');
  });
});
