import { afterEach, describe, expect, it } from 'vitest';
import { BOAT, DEEP_LOOKS, deepLookAt, JELLIES, NEAR_CUT, WAVES, boatMotion, gloomAt, inHull, jelliesAt, jellyGlow, jellyLight, jellyRises, jellyUp, onDeck, screenSprayAt, seaDepthFor, seaHeight, seaMood, tiltAt, waveAmp, zoneAt } from './sea';
import { MAPS } from './maps';
import { isWater, onDock, setAtSea, standHeight } from '../game/env';

describe('sea zones', () => {
  it('follows the decided depth bands', () => {
    expect(zoneAt(1).id).toBe('shelf');
    expect(zoneAt(15).id).toBe('shelf');
    expect(zoneAt(16).id).toBe('dropoff');
    expect(zoneAt(35).id).toBe('dropoff');
    expect(zoneAt(36).id).toBe('kelp');
    expect(zoneAt(60).id).toBe('kelp');
    expect(zoneAt(61).id).toBe('twilight');
    expect(zoneAt(90).id).toBe('twilight');
    expect(zoneAt(91).id).toBe('abyss');
    expect(zoneAt(999).id).toBe('abyss');
  });

  it("draws a charter's zone at about its middle, and the Abyss rougher each marker up to a cap", () => {
    expect([0, 1, 2, 3].map((z) => seaDepthFor(z))).toEqual([8, 26, 48, 76]);
    // Markers only count in the Abyss.
    expect(seaDepthFor(2, 30)).toBe(48);
    expect([0, 1, 2, 3].map((z) => zoneAt(seaDepthFor(z)).id)).toEqual(['shelf', 'dropoff', 'kelp', 'twilight']);
    expect(seaDepthFor(4, 1)).toBe(100);
    expect(seaDepthFor(4)).toBe(100);
    expect(seaDepthFor(4, 2)).toBe(103);
    expect(seaDepthFor(4, 11)).toBe(130);
    expect(seaDepthFor(4, 51)).toBe(250);
    expect(seaDepthFor(4, 500)).toBe(250);
    expect(zoneAt(seaDepthFor(4, 1)).id).toBe('abyss');
  });
});

describe('sea mood', () => {
  it('is calm at the Shelf and 0.6 at the Drop-off', () => {
    expect(seaMood(1)).toBe(0);
    expect(seaMood(16)).toBeCloseTo(0.6);
  });

  it('keeps building past the Drop-off, for the deep zones', () => {
    expect(seaMood(35)).toBeCloseTo(1);
    expect(seaMood(60)).toBeGreaterThan(seaMood(35));
    expect(seaMood(150)).toBeGreaterThan(seaMood(90));
  });

  it('throws spray on the screen from about depth 25, harder deeper', () => {
    expect(screenSprayAt(seaMood(20))).toBe(0);
    expect(screenSprayAt(seaMood(28))).toBeGreaterThan(0);
    expect(screenSprayAt(seaMood(60))).toBeGreaterThan(screenSprayAt(seaMood(35)));
    expect(screenSprayAt(seaMood(150))).toBe(1);
  });

  it('keeps the Shelf and Drop-off bright and darkens only the deep zones', () => {
    expect(gloomAt(seaMood(35))).toBe(0);
    expect(gloomAt(seaMood(60))).toBeGreaterThan(0);
    expect(gloomAt(seaMood(150))).toBe(1);
  });

  it('gets rougher steadily with depth, without jumps, up to a cap', () => {
    let last = seaMood(1);
    for (let d = 2; d <= 250; d++) {
      const m = seaMood(d);
      expect(m).toBeGreaterThanOrEqual(last);
      expect(m - last).toBeLessThan(0.05);
      last = m;
    }
    expect(seaMood(10_000)).toBe(seaMood(250));
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
    expect(height(60)).toBeGreaterThan(1.6 * height(36));
    expect(height(150)).toBeGreaterThan(3 * height(35));
  });

  it('rocks the boat gently near shore and hard in the deep zones', () => {
    const deg = 180 / Math.PI;
    const maxRoll = (m: number) => {
      let r = 0;
      for (let t = 0; t < 300; t += 1 / 20) r = Math.max(r, Math.abs(boatMotion(t, m).roll), Math.abs(boatMotion(t, m).pitch));
      return r * deg;
    };
    const shelf = maxRoll(seaMood(1));
    const dropoff = maxRoll(seaMood(35));
    const abyss = maxRoll(seaMood(150));
    // Noticeable but gentle near shore, an epic storm by the Abyss.
    expect(shelf).toBeLessThan(2);
    expect(dropoff).toBeGreaterThan(shelf);
    expect(dropoff).toBeLessThan(3.5);
    expect(abyss).toBeGreaterThan(2.5 * dropoff);
    expect(abyss).toBeLessThanOrEqual(tiltAt(seaMood(150)).max * deg);
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
    expect(onDock(0, 5)).toBe(false);
  });

  it('gives back the pond when leaving the sea', () => {
    setAtSea(true);
    setAtSea(false);
    expect(onDock(0, 5)).toBe(true);
  });

  it('spawns players on the deck of the sea map', () => {
    const sea = MAPS.find((m) => m.sea)!;
    expect(onDeck(sea.spawn.x, sea.spawn.z)).toBe(true);
    expect(Math.hypot(BOAT.len / 2, BOAT.beam)).toBeLessThan(sea.radius);
  });
});

describe('deep zone looks', () => {
  it('keeps the Drop-off look up to its end and gives each zone its own in its middle', () => {
    expect(deepLookAt(seaMood(1))).toBe(DEEP_LOOKS.dropoff);
    expect(deepLookAt(seaMood(35))).toBe(DEEP_LOOKS.dropoff);
    expect(deepLookAt(seaMood(48))).toBe(DEEP_LOOKS.kelp);
    expect(deepLookAt(seaMood(75))).toBe(DEEP_LOOKS.twilight);
    expect(deepLookAt(seaMood(120))).toBe(DEEP_LOOKS.abyss);
    expect(deepLookAt(seaMood(210))).toBe(DEEP_LOOKS.abyss);
  });
  it('blends across a zone line', () => {
    const l = deepLookAt(seaMood(92));
    const { twilight, abyss } = DEEP_LOOKS;
    expect(l.lamps).toBeGreaterThan(twilight.lamps);
    expect(l.lamps).toBeLessThan(abyss.lamps);
    expect(l.hemi).toBeLessThan(twilight.hemi);
    expect(l.hemi).toBeGreaterThan(abyss.hemi);
    for (const s of [16, 8, 0]) {
      const ch = (h: number) => (h >> s) & 255;
      expect(ch(l.skyH)).toBeGreaterThanOrEqual(Math.min(ch(twilight.skyH), ch(abyss.skyH)));
      expect(ch(l.skyH)).toBeLessThanOrEqual(Math.max(ch(twilight.skyH), ch(abyss.skyH)));
    }
  });
});

describe('the Twilight\'s lantern jellies', () => {
  it('show only in the Twilight, easing in before its line and out before the Abyss', () => {
    for (const d of [1, 16, 40, 48, 55, 92, 100, 150]) expect(jelliesAt(seaMood(d))).toBe(0);
    for (const d of [61, 66, 76, 85]) expect(jelliesAt(seaMood(d))).toBe(1);
    expect(jelliesAt(seaMood(58))).toBeGreaterThan(0);
    expect(jelliesAt(seaMood(58))).toBeLessThan(1);
    expect(jelliesAt(seaMood(89))).toBeGreaterThan(0);
    expect(jelliesAt(seaMood(89))).toBeLessThan(1);
  });

  const field = [...jellyRises(JELLIES.near.count, JELLIES.day), ...jellyRises(JELLIES.far.count)];
  const upAt = (n: number) => field.filter((r) => jellyUp(n, r) > 0).length;

  it('are all out and at full glow at full night', () => {
    expect(upAt(1)).toBe(field.length);
    for (const r of field) expect(jellyGlow(1, r)).toBe(1);
  });

  it('leave only the few near the boat up by day, paler', () => {
    expect(upAt(0)).toBe(JELLIES.day);
    expect(JELLIES.day).toBeGreaterThanOrEqual(2);
    expect(JELLIES.day).toBeLessThanOrEqual(4);
    expect(jellyGlow(0, -1)).toBe(JELLIES.dayGlow);
  });

  it('hold the light round them back until the water has darkened, the same as their glow by day and at full night', () => {
    for (const r of field) {
      expect(jellyLight(0, r)).toBe(jellyGlow(0, r));
      expect(jellyLight(1, r)).toBe(jellyGlow(1, r));
      let last = 0;
      for (let n = 0; n <= 1.0001; n += 0.02) {
        const l = jellyLight(n, r);
        expect(l).toBeLessThanOrEqual(jellyGlow(n, r));
        expect(l).toBeGreaterThanOrEqual(last - 1e-12);
        last = l;
      }
    }
    // Mid-dusk, a jelly that has surfaced is held near the day's light.
    expect(jellyLight(0.55, 0.2)).toBeLessThan(JELLIES.dayGlow + 0.05);
  });

  it('surface one by one through dusk, never fewer or dimmer as it gets darker', () => {
    let up = 0;
    const glow = field.map(() => 0);
    const counts = new Set<number>();
    for (let n = 0; n <= 1.0001; n += 0.01) {
      const now = upAt(n);
      expect(now).toBeGreaterThanOrEqual(up);
      up = now;
      counts.add(now);
      field.forEach((r, i) => {
        const g = jellyGlow(n, r);
        expect(g).toBeGreaterThanOrEqual(glow[i] - 1e-12);
        glow[i] = g;
      });
    }
    // Many steps in between, not all at once.
    expect(counts.size).toBeGreaterThan(30);
  });
});
