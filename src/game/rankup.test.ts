import { describe, expect, it } from 'vitest';
import { RANKS, ranksBetween } from '../data/ranks';
import { legendUp, rankUp } from './rankup';

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

describe('legendUp', () => {
  it("names the piece in the legend's mark and says it's unlocked at Reed's", () => {
    expect(legendUp({ id: 'krakencrown', landing: 1, of: 3 })).toEqual({
      title: '🦑 KRAKEN CROWN 🦑',
      line: "Unlocked at Captain Reed's · piece 1 of 3",
      card: "🦑 Kraken Crown · unlocked at Reed's",
    });
    const pet = legendUp({ id: 'krakenpet', landing: 4, of: 3 })!;
    expect(pet.title).toBe('🦑 KRAKEN HATCHLING 🦑');
    expect(pet.line).toBe("The Kraken's pet · unlocked at Captain Reed's");
  });

  it('is null for an item that is no legend piece', () => {
    expect(legendUp({ id: 'crown', landing: 1, of: 1 })).toBeNull();
    expect(legendUp({ id: 'bogus', landing: 1, of: 1 })).toBeNull();
  });
});
