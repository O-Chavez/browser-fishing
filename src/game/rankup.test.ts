import { describe, expect, it } from 'vitest';
import { RANKS, ranksBetween } from '../data/ranks';
import { COSMETICS } from '../data/cosmetics';
import { ZONES } from '../data/dive';
import { LEGEND_MARK, ZONE_MARK, catchBanner, legendUp, rankUp, zoneUp } from './rankup';

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
      banner: "🦑 Kraken Crown unlocked at Captain Reed's · piece 1 of 3",
      card: "🦑 Kraken Crown · unlocked at Reed's",
    });
    const pet = legendUp({ id: 'krakenpet', landing: 4, of: 3 })!;
    expect(pet.banner).toBe("🦑 Kraken Hatchling unlocked at Captain Reed's · The Kraken's pet");
  });

  it.each([
    { id: 'leviathanjaw', landing: 1, banner: "🐉 Leviathan's Jaw unlocked at Captain Reed's · piece 1 of 3", card: "🐉 Leviathan's Jaw · unlocked at Reed's" },
    { id: 'leviathanpet', landing: 4, banner: "🐉 Leviathan Wyrmling unlocked at Captain Reed's · The Leviathan's pet", card: "🐉 Leviathan Wyrmling · unlocked at Reed's" },
    { id: 'dreamerrobe', landing: 2, banner: "💤 Dream Robe unlocked at Captain Reed's · piece 2 of 3", card: "💤 Dream Robe · unlocked at Reed's" },
    { id: 'dreamerpet', landing: 4, banner: "💤 Sleepy Dreamer unlocked at Captain Reed's · The Drowned Dreamer's pet", card: "💤 Sleepy Dreamer · unlocked at Reed's" },
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

describe('catchBanner', () => {
  const piece = legendUp({ id: 'krakencrown', landing: 1, of: 3 })!;
  const rank = rankUp(RANKS.slice(0, 1))!;

  it('keeps LEGEND LANDED! for a sea legend whose landing unlocks a piece of its set, with the piece as a line under it', () => {
    expect(catchBanner(true, piece, null)).toEqual({ banner: 'legend', piece: "🦑 Kraken Crown unlocked at Captain Reed's · piece 1 of 3" });
    expect(catchBanner(true, null, null)).toEqual({ banner: 'legend' });
  });

  it('keeps LEGEND LANDED! when the same catch reaches a rank, which goes to a toast', () => {
    expect(catchBanner(true, null, rank)).toEqual({ banner: 'legend', toast: `${rank.title} · ${rank.line}` });
    expect(catchBanner(true, piece, rank)).toEqual({ banner: 'legend', piece: piece.banner, toast: `${rank.title} · ${rank.line}` });
  });

  it("gives any other catch its rank's banner, or the tier's", () => {
    expect(catchBanner(false, null, rank)).toEqual({ banner: 'rank' });
    expect(catchBanner(false, null, null)).toEqual({ banner: 'tier' });
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
