import { afterEach, describe, expect, it } from 'vitest';
import { ABYSS, BOAT, DEEP_LOOKS, abyssAt, deepLookAt, nightRamp, sheetGlow, JELLIES, NEAR_CUT, WAVES, boatMotion, gloomAt, inHull, jelliesAt, jellyGlow, jellyLight, jellyRises, jellyUp, onDeck, screenSprayAt, seaDepthFor, seaHeight, seaMood, tiltAt, waveAmp, zoneAt } from './sea';
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

describe('the Abyss\'s standing night', () => {
  it('leaves every zone up to the Twilight alone and is fully in by the Abyss\'s first look stop', () => {
    for (const d of [1, 8, 16, 26, 35, 48, 61, 76, 86]) expect(abyssAt(seaMood(d))).toBe(0);
    for (const d of [97, 100, 160, 250]) expect(abyssAt(seaMood(d))).toBe(1);
  });
  it('eases in over the markers the Abyss\'s colours blend in over', () => {
    const a = abyssAt(seaMood(89)), b = abyssAt(seaMood(92)), c = abyssAt(seaMood(95));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(1);
  });
  it('scales with the amount knob, down to the old look at 0', () => {
    const was = ABYSS.amount;
    try {
      ABYSS.amount = 0.5;
      expect(abyssAt(seaMood(120))).toBe(0.5);
      ABYSS.amount = 0;
      for (const d of [92, 100, 250]) expect(abyssAt(seaMood(d))).toBe(0);
    } finally {
      ABYSS.amount = was;
    }
  });
  it('keeps the fog far darker than the band on the horizon, and the sky no lighter than the fog', () => {
    const sum = (h: number) => ((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255);
    expect(sum(ABYSS.band)).toBeGreaterThan(4 * sum(ABYSS.fog));
    expect(sum(ABYSS.sky)).toBeLessThanOrEqual(sum(ABYSS.fog));
  });
  it('has thin dim lines of foam on its ridges in place of the storm\'s own foam', () => {
    const f = ABYSS.foam;
    expect([f.chop, f.face, f.streak, f.caps]).toEqual([0, 0, 0, 0]);
    expect(f.lines).toBeGreaterThan(0);
    expect(f.lines).toBeLessThan(1);
    expect(f.lineBare).toBeLessThan(0.5);
    // The sheen on a face stays below the rim along its crest.
    expect(ABYSS.face).toBeLessThan(ABYSS.rim);
  });
  it('flickers sheet lightning only for its length, never past full', () => {
    expect(sheetGlow(0, 0.6)).toBe(0);
    expect(sheetGlow(-1, 0.6)).toBe(0);
    expect(sheetGlow(0.6, 0.6)).toBe(0);
    expect(sheetGlow(2, 0.6)).toBe(0);
    expect(sheetGlow(0.3, 0)).toBe(0);
    let peak = 0;
    for (const k of [0, 0.3, 0.77])
      for (let age = 0.01; age < 0.6; age += 0.01) {
        const g = sheetGlow(age, 0.6, k);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        peak = Math.max(peak, g);
      }
    expect(peak).toBeGreaterThan(0.6);
  });
});

describe('the Twilight\'s atmosphere', () => {
  // The values that leave a look's night, hidden sun and cloud haze as they were before the Twilight's atmosphere.
  const plain = { nightLook: 0, nightHemiCol: 0x7088cc, nightHemi: 1, nightSun: 1, nightLamps: 1, glow: 0, sunLow: 0, sunCol: 0xfff0d6, cloudHaze: 1 };
  it('leaves the other zones as they were', () => {
    for (const z of [DEEP_LOOKS.dropoff, DEEP_LOOKS.kelp, DEEP_LOOKS.abyss]) expect(z).toMatchObject(plain);
    expect(deepLookAt(seaMood(0))).toBe(DEEP_LOOKS.dropoff);
    expect(deepLookAt(seaMood(45))).toBe(DEEP_LOOKS.kelp);
    expect(deepLookAt(seaMood(100))).toBe(DEEP_LOOKS.abyss);
  });
  it('gives the Twilight its own night and a hidden sun', () => {
    expect(DEEP_LOOKS.twilight.nightLook).toBe(1);
    expect(DEEP_LOOKS.twilight.glow).toBeGreaterThan(0);
    expect(DEEP_LOOKS.twilight.nightLamps).toBeLessThan(1);
  });
  it('blends the new amounts as numbers across the zone lines', () => {
    const l = deepLookAt(seaMood(60));
    expect(l.nightLook).toBeGreaterThan(0);
    expect(l.nightLook).toBeLessThan(1);
    expect(l.glow).toBeGreaterThan(0);
    expect(l.glow).toBeLessThan(1);
  });
  it('ramp the night in by about 0.7 nightness', () => {
    expect(nightRamp(0)).toBe(0);
    expect(nightRamp(0.72)).toBe(1);
    expect(nightRamp(1)).toBe(1);
    for (let n = 0; n < 1; n += 0.05) expect(nightRamp(n + 0.05)).toBeGreaterThanOrEqual(nightRamp(n));
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
