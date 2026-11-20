import { describe, expect, it } from 'vitest';
import { RANKS, ranksBetween } from '../data/ranks';
import { COSMETICS } from '../data/cosmetics';
import { ZONES } from '../data/dive';
import { LEGEND_MARK, ZONE_MARK, legendUp, rankUp, zoneUp } from './rankup';

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

  it.each([
    { id: 'leviathanjaw', landing: 1, title: "🐉 LEVIATHAN'S JAW 🐉", line: "Unlocked at Captain Reed's · piece 1 of 3", card: "🐉 Leviathan's Jaw · unlocked at Reed's" },
    { id: 'leviathanpet', landing: 4, title: '🐉 LEVIATHAN WYRMLING 🐉', line: "The Leviathan's pet · unlocked at Captain Reed's", card: "🐉 Leviathan Wyrmling · unlocked at Reed's" },
    { id: 'dreamerrobe', landing: 2, title: '💤 DREAM ROBE 💤', line: "Unlocked at Captain Reed's · piece 2 of 3", card: "💤 Dream Robe · unlocked at Reed's" },
    { id: 'dreamerpet', landing: 4, title: '💤 SLEEPY DREAMER 💤', line: "The Drowned Dreamer's pet · unlocked at Captain Reed's", card: "💤 Sleepy Dreamer · unlocked at Reed's" },
  ])("gives $id its legend's mark", ({ id, landing, ...want }) => {
    expect(legendUp({ id, landing, of: 3 })).toEqual(want);
  });

  it('has a mark for every legend with a set', () => {
    for (const c of COSMETICS.filter((x) => x.shop === 'legend')) expect(LEGEND_MARK[c.legend!]).toBeTruthy();
  });

  it('is null for an item that is no legend piece', () => {
    expect(legendUp({ id: 'crown', landing: 1, of: 1 })).toBeNull();
    expect(legendUp({ id: 'bogus', landing: 1, of: 1 })).toBeNull();
  });
});

describe('zoneUp', () => {
  it("says in one line which piece is unlocked at Reed's and the fish landed in its zone", () => {
    expect(zoneUp({ id: 'kelpcap', zone: 2, fish: 30 })).toBe("🌿 Kelp Cap unlocked at Captain Reed's · 30 fish landed in Kelp Deep");
    expect(zoneUp({ id: 'jellylocket', zone: 3, fish: 300 })).toBe("🪼 Jelly Locket unlocked at Captain Reed's · 300 fish landed in the Twilight");
  });

  it('has a mark for every zone with a set', () => {
    for (const c of COSMETICS.filter((x) => x.shop === 'zone')) expect(ZONE_MARK[ZONES[c.zone!].id]).toBeTruthy();
  });

  it('is null for an item that is no piece of that zone', () => {
    expect(zoneUp({ id: 'krakencrown', zone: 4, fish: 1 })).toBeNull();
    expect(zoneUp({ id: 'kelpcap', zone: 3, fish: 40 })).toBeNull();
    expect(zoneUp({ id: 'bogus', zone: 2, fish: 1 })).toBeNull();
  });
});
