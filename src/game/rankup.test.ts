import { describe, expect, it } from 'vitest';
import { RANKS, ranksBetween } from '../data/ranks';
import { rankUp } from './rankup';

describe('rankUp', () => {
  it('names the rank and its outfit', () => {
    const r = rankUp(ranksBetween(24, 25))!;
    expect(r.title).toBe('⚓ BOSUN ⚓');
    expect(r.line).toBe("Level 25 · Oilskin Sou'wester added to your Wardrobe");
    expect(r.titleId).toBe('bosun');
    expect(r.outfit).toBe('souwester');
  });

  it('shows only a title for a rank without an outfit', () => {
    const r = rankUp(ranksBetween(19, 20))!;
    expect(r.line).toBe('Level 20 · new title: Deckhand');
    expect(r.outfit).toBeUndefined();
  });

  it('shows the highest rank and every outfit when one catch reaches several', () => {
    const r = rankUp(ranksBetween(30, 50))!;
    expect(r.title).toBe("⚓ ADMIRAL ⚓");
    expect(r.line).toBe("Level 50 · Storm Slicker, Brass Compass and Admiral's Bicorne added to your Wardrobe");
    expect(r.outfit).toBe('bicorne');
  });

  it('is null with no rank', () => {
    expect(rankUp([])).toBeNull();
    expect(rankUp(RANKS.slice(0, 0))).toBeNull();
  });
});
