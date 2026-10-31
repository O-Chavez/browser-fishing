import { afterEach, describe, expect, it } from 'vitest';
import { BOAT, NEAR_CUT, WAVES, boatMotion, gloomAt, inHull, onDeck, screenSprayAt, seaHeight, seaMood, tiltAt, waveAmp, zoneAt } from './sea';
import { MAPS } from './maps';
import { isWater, onDock, setAtSea, standHeight } from '../game/env';

describe('sea zones', () => {
  it('follows the decided depth bands', () => {
    expect(zoneAt(1).id).toBe('shelf');
    expect(zoneAt(15).id).toBe('shelf');
    expect(zoneAt(16).id).toBe('dropoff');
    expect(zoneAt(40).id).toBe('dropoff');
    expect(zoneAt(41).id).toBe('kelp');
    expect(zoneAt(81).id).toBe('twilight');
    expect(zoneAt(151).id).toBe('abyss');
    expect(zoneAt(999).id).toBe('abyss');
  });
});

describe('sea mood', () => {
  it('is calm at the Shelf and 0.6 at the Drop-off', () => {
    expect(seaMood(1)).toBe(0);
    expect(seaMood(16)).toBeCloseTo(0.6);
  });

  it('keeps building past the Drop-off, for the deep zones', () => {
    expect(seaMood(40)).toBeCloseTo(1);
    expect(seaMood(80)).toBeGreaterThan(seaMood(40));
    expect(seaMood(250)).toBeGreaterThan(seaMood(150));
  });

  it('throws spray on the screen from about depth 30, harder deeper', () => {
    expect(screenSprayAt(seaMood(25))).toBe(0);
    expect(screenSprayAt(seaMood(32))).toBeGreaterThan(0);
    expect(screenSprayAt(seaMood(80))).toBeGreaterThan(screenSprayAt(seaMood(40)));
    expect(screenSprayAt(seaMood(250))).toBe(1);
  });

  it('keeps the Shelf and Drop-off bright and darkens only the deep zones', () => {
    expect(gloomAt(seaMood(40))).toBe(0);
    expect(gloomAt(seaMood(80))).toBeGreaterThan(0);
    expect(gloomAt(seaMood(250))).toBe(1);
  });

  it('gets rougher steadily with depth, without jumps, up to a cap', () => {
    let last = seaMood(1);
    for (let d = 2; d <= 400; d++) {
      const m = seaMood(d);
      expect(m).toBeGreaterThanOrEqual(last);
      expect(m - last).toBeLessThan(0.05);
      last = m;
    }
    expect(seaMood(10_000)).toBe(seaMood(400));
  });
});

describe('the swell', () => {
  it('grows with the mood', () => {
    for (const w of WAVES) {
      expect(waveAmp(w, 2)).toBeGreaterThan(waveAmp(w, 0));
      for (let m = 0; m < 2; m += 0.1) expect(waveAmp(w, m + 0.1)).toBeGreaterThanOrEqual(waveAmp(w, m));
    }
  });

  it('cuts the chop low beside the boat, but not the long swell the boat rides', () => {
    const bound = WAVES.reduce((s, w) => s + waveAmp(w, 1.3) * (w.cut ? NEAR_CUT.keep : 1), 0);
    for (let t = 0; t < 60; t += 0.37) expect(Math.abs(seaHeight(0, BOAT.beam, t, 1.3))).toBeLessThanOrEqual(bound + 1e-9);
    expect(WAVES.some((w) => !w.cut)).toBe(true);
  });

  it('rises into huge seas from the Twilight down', () => {
    const height = (d: number) => WAVES.reduce((s, w) => s + waveAmp(w, seaMood(d)), 0);
    // Kelp Deep's end is clearly bigger than its start, and the Abyss about three times the Drop-off.
    expect(height(80)).toBeGreaterThan(1.6 * height(41));
    expect(height(250)).toBeGreaterThan(3 * height(40));
  });

  it('rocks the boat gently near shore and hard in the deep zones', () => {
    const deg = 180 / Math.PI;
    const maxRoll = (m: number) => {
      let r = 0;
      for (let t = 0; t < 300; t += 1 / 20) r = Math.max(r, Math.abs(boatMotion(t, m).roll), Math.abs(boatMotion(t, m).pitch));
      return r * deg;
    };
    const shelf = maxRoll(seaMood(1));
    const dropoff = maxRoll(seaMood(40));
    const abyss = maxRoll(seaMood(250));
    // Noticeable but gentle near shore, an epic storm by the Abyss.
    expect(shelf).toBeLessThan(2);
    expect(dropoff).toBeGreaterThan(shelf);
    expect(dropoff).toBeLessThan(3.5);
    expect(abyss).toBeGreaterThan(2.5 * dropoff);
    expect(abyss).toBeLessThanOrEqual(tiltAt(seaMood(250)).max * deg);
  });
});

describe('the deck', () => {
  afterEach(() => setAtSea(false));

  it('has room for five players along the starboard rail', () => {
    for (let i = 0; i < 5; i++) expect(onDeck(-4.6 + i * 1.3, -1.4)).toBe(true);
  });

  it('has room at the spawn and keeps players off the wheelhouse and out of the water', () => {
    expect(onDeck(BOAT.spawn.x, BOAT.spawn.z)).toBe(true);
    // Inside the wheelhouse.
    expect(onDeck(1.9, 0)).toBe(false);
    // Over the side.
    expect(onDeck(0, BOAT.beam + 0.5)).toBe(false);
    expect(onDeck(BOAT.len, 0)).toBe(false);
  });

  it('is the only ground while at sea', () => {
    setAtSea(true);
    expect(onDock(BOAT.spawn.x, BOAT.spawn.z)).toBe(true);
    expect(standHeight(BOAT.spawn.x, BOAT.spawn.z)).toBe(BOAT.deck);
    // Casting over the starboard rail lands in the water; the deck itself isn't water.
    expect(isWater(0, -8)).toBe(true);
    expect(isWater(0, 0)).toBe(false);
    expect(inHull(0, 0)).toBe(true);
    // The pond's main pier, which overlaps the boat's spot, is gone.
    expect(onDock(0, 10)).toBe(false);
  });

  it('gives back the pond when leaving the sea', () => {
    setAtSea(true);
    setAtSea(false);
    expect(onDock(0, 10)).toBe(true);
  });

  it('spawns players on the deck of the sea map', () => {
    const sea = MAPS.find((m) => m.sea)!;
    expect(onDeck(sea.spawn.x, sea.spawn.z)).toBe(true);
    expect(Math.hypot(BOAT.len / 2, BOAT.beam)).toBeLessThan(sea.radius);
  });
});
