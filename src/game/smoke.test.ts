import { describe, expect, it } from 'vitest';
import { FISH, byId } from '../data/content';
import { BITE_WAIT, CONTROL_BUFF, MAX_BUFFS, RACK3_LEVEL, WELL_SMOKED, recipeById } from '../data/smokehouse';
import { GLOVES_CONTROL } from '../data/casino';
import * as eco from './economy';
import * as smoke from './smoke';
import { FISH_SLOT, migrate, newSave, type SaveData } from './state';

const T0 = 1_000_000;
const MIN = 60_000;
const mid = (id: string) => {
  const f = byId(FISH, id);
  return (f.minSize + f.maxSize) / 2;
};
const fish = (id: string, size = mid(id)) => ({ k: 'fish' as const, fishId: id, size });
/** A save carrying these fish in its fish slots (the Tackle Vest makes room for five). */
const carrying = (...ids: string[]): SaveData => {
  const s = newSave();
  s.perks = ['vest'];
  s.slots = [...s.slots, null, null];
  ids.forEach((id, i) => (s.slots[FISH_SLOT + i] = fish(id)));
  return s;
};
const tier1 = FISH.filter((f) => f.tier === 1).map((f) => f.id);

describe('loading a rack', () => {
  it('keeps fish on the rack between trips and starts smoking once it is full', () => {
    const s = carrying('minnow', 'bluegill', 'carp', 'minnow', 'carp');
    for (let i = 0; i < 5; i++) expect(smoke.loadFish(s, 'minnowbites', FISH_SLOT + i, T0)).toBeNull();
    const rack = s.smoke.racks[0]!;
    expect(rack.fish.filter(Boolean)).toHaveLength(5);
    expect(rack.doneAt).toBeUndefined();
    expect(s.slots.slice(FISH_SLOT).every((x) => !x)).toBe(true);
    // A second trip with the sixth fish.
    s.slots[FISH_SLOT] = fish('bluegill');
    expect(smoke.loadFish(s, 'minnowbites', FISH_SLOT, T0 + 5 * MIN)).toBeNull();
    expect(rack.doneAt).toBe(T0 + 5 * MIN + recipeById('minnowbites')!.minutes * MIN);
  });

  it('fills the spot only a given species can fill, and says what is still missing', () => {
    const s = carrying('perch', 'trout', 'midnightcat', 'perch', 'bass');
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT, T0)).toBeNull();
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT + 1, T0)).toBeNull();
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT + 2, T0)).toBeNull();
    // Three tier 2 fish are in; the last spot takes only a bass.
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT + 3, T0)).toBe("Kippers doesn't take a Yellow Perch. It still needs: Largemouth Bass.");
    expect(s.slots[FISH_SLOT + 3]?.k).toBe('fish');
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT + 4, T0)).toBeNull();
    expect(s.smoke.racks[0]!.doneAt).toBeDefined();
  });

  it('takes a bass or a pike for any tier spot once its own spot is filled', () => {
    const s = carrying('pike', 'pike', 'gar');
    for (let i = 0; i < 3; i++) expect(smoke.loadFish(s, 'pikejerky', FISH_SLOT + i, T0)).toBeNull();
    expect(s.smoke.racks[0]!.fish.map((f) => f?.fishId)).toEqual(['pike', 'pike', 'gar']);
  });

  it('takes any 🌙 fish for Lantern Glaze, eels included', () => {
    const s = carrying('moonscale', 'lanterneel', 'lanterneel');
    for (let i = 0; i < 3; i++) expect(smoke.loadFish(s, 'lanternglaze', FISH_SLOT + i, T0)).toBeNull();
    expect(s.smoke.racks[0]!.fish.map((f) => f?.fishId)).toEqual(['lanterneel', 'lanterneel', 'moonscale']);
    const t = carrying('lanterneel', 'lanterneel', 'lanterneel');
    for (let i = 0; i < 3; i++) expect(smoke.loadFish(t, 'lanternglaze', FISH_SLOT + i, T0)).toBeNull();
    expect(t.smoke.racks[0]!.doneAt).toBeDefined();
    expect(smoke.loadFish(carrying('koi'), 'lanternglaze', FISH_SLOT, T0)).toMatch(/doesn't take a Golden Koi/);
  });

  it('uses two racks, and a third from level 30', () => {
    const s = carrying('koi', 'koi', 'koi');
    expect(smoke.loadFish(s, 'kippers', FISH_SLOT, T0)).toMatch(/doesn't take/);
    s.slots[FISH_SLOT] = fish('minnow');
    s.smoke.racks[0] = { r: 'kippers', fish: [null, null, null, null] };
    s.smoke.racks[1] = { r: 'pikejerky', fish: [null, null, null] };
    expect(smoke.loadFish(s, 'minnowbites', FISH_SLOT, T0)).toBe('Every rack is busy. Come back when one is done.');
    s.level = RACK3_LEVEL;
    expect(smoke.loadFish(s, 'minnowbites', FISH_SLOT, T0)).toBeNull();
    expect(s.smoke.racks[2]!.r).toBe('minnowbites');
  });

  it('keeps the Jewel Platter for level 20, and turns down junk', () => {
    const s = carrying('sturgeon');
    expect(smoke.loadFish(s, 'jewelplatter', FISH_SLOT, T0)).toBe('Jewel Platter unlocks at level 20.');
    expect(smoke.loadFish(s, 'nope', FISH_SLOT, T0)).toBe('Pick a recipe first.');
    expect(smoke.loadFish(s, 'kippers', 0, T0)).toBe('Pick a fish from your hotbar.');
    expect(smoke.loadFish(s, 'kippers', 1.5, T0)).toBe('Pick a fish from your hotbar.');
    s.level = 20;
    expect(smoke.loadFish(s, 'jewelplatter', FISH_SLOT, T0)).toBeNull();
  });

  it('gives fish back until the rack starts smoking', () => {
    const s = carrying('pike', 'gar');
    smoke.loadFish(s, 'pikejerky', FISH_SLOT, T0);
    smoke.loadFish(s, 'pikejerky', FISH_SLOT + 1, T0);
    expect(smoke.takeFish(s, 0, 0)).toBeNull();
    expect(s.slots[FISH_SLOT]).toMatchObject({ fishId: 'pike' });
    expect(smoke.takeFish(s, 0, 0)).toBe('Nothing there to take.');
    expect(smoke.takeFish(s, 0, 1)).toBeNull();
    expect(s.smoke.racks[0]).toBeNull();
    const t = carrying('pike', 'gar', 'koi');
    for (let i = 0; i < 3; i++) smoke.loadFish(t, 'pikejerky', FISH_SLOT + i, T0);
    expect(smoke.takeFish(t, 0, 0)).toBe("It's already smoking.");
  });
});

describe('smoking and the Pantry', () => {
  const smoked = (s: SaveData, id: 'minnowbites' | 'kippers', at: number) => {
    s.smoke.racks[0] = { r: id, fish: tier1.concat(tier1).map((f) => fish(f)).slice(0, 6), doneAt: at };
  };

  it('moves a finished rack to the Pantry, offline time included', () => {
    const s = newSave();
    smoked(s, 'minnowbites', T0 + 5 * MIN);
    expect(smoke.collectRacks(s, T0 + 5 * MIN - 1)).toEqual([]);
    expect(smoke.collectRacks(s, T0 + 60 * MIN)).toEqual([{ id: 'minnowbites', n: 1 }]);
    expect(s.smoke.racks[0]).toBeNull();
    expect(s.smoke.pantry.minnowbites).toEqual([600]);
    expect(s.smoke.made.minnowbites).toBe(1);
  });

  it('yields two per batch once Well-smoked', () => {
    const s = newSave();
    s.smoke.made.minnowbites = WELL_SMOKED - 1;
    smoked(s, 'minnowbites', T0);
    expect(smoke.collectRacks(s, T0)).toEqual([{ id: 'minnowbites', n: 1 }]);
    expect(smoke.wellSmoked(s, 'minnowbites')).toBe(true);
    smoked(s, 'minnowbites', T0);
    expect(smoke.collectRacks(s, T0)).toEqual([{ id: 'minnowbites', n: 2 }]);
    expect(smoke.pantryCount(s, 'minnowbites')).toBe(3);
  });

  it('makes trophy-size batches last longer, by their share of trophies', () => {
    const big = (id: string) => fish(id, byId(FISH, id).maxSize);
    expect(smoke.isTrophy(big('pike'))).toBe(true);
    expect(smoke.isTrophy(fish('pike'))).toBe(false);
    expect(smoke.batchSeconds([fish('pike'), fish('gar')])).toBe(600);
    expect(smoke.batchSeconds([big('pike'), fish('gar')])).toBe(750);
    expect(smoke.batchSeconds([big('pike'), big('gar')])).toBe(900);
  });

  it('puts level gifts in the Pantry as the best recipe unlocked', () => {
    const s = newSave();
    s.level = 55;
    s.gifts.provisions = 3;
    expect(smoke.stockGifts(s)).toBe(3);
    expect(s.smoke.pantry.jewelplatter).toEqual([600, 600, 600]);
    expect(s.gifts.provisions).toBe(0);
    expect(smoke.stockGifts(s)).toBe(0);
    expect(smoke.bestRecipe({ level: 1 }).id).toBe('lanternglaze');
  });
});

describe('eating', () => {
  const stocked = () => {
    const s = newSave();
    smoke.stock(s, 'kippers', 600);
    smoke.stock(s, 'kippers', 900);
    smoke.stock(s, 'minnowbites', 600);
    smoke.stock(s, 'pikejerky', 600);
    smoke.stock(s, 'lanternglaze', 600);
    return s;
  };

  it('eats the longest-lasting item first, and the same kind refreshes', () => {
    const s = stocked();
    expect(smoke.eat(s, 'kippers')).toBeNull();
    expect(s.smoke.buffs).toEqual([{ id: 'kippers', ms: 900_000 }]);
    expect(s.smoke.pantry.kippers).toEqual([600]);
    smoke.tickBuffs(s, 500_000);
    expect(smoke.eat(s, 'kippers')).toBeNull();
    expect(s.smoke.buffs).toEqual([{ id: 'kippers', ms: 600_000 }]);
    expect(s.smoke.pantry.kippers).toBeUndefined();
    expect(smoke.eat(s, 'kippers')).toBe('There are none in your Pantry.');
  });

  it(`stacks up to ${MAX_BUFFS} kinds`, () => {
    const s = stocked();
    for (const id of ['kippers', 'minnowbites', 'pikejerky']) expect(smoke.eat(s, id)).toBeNull();
    expect(smoke.eat(s, 'lanternglaze')).toBe(`You're full! At most ${MAX_BUFFS} kinds at once.`);
    expect(smoke.eat(s, 'kippers')).toBeNull();
  });

  it('wears off with time', () => {
    const s = stocked();
    smoke.eat(s, 'minnowbites');
    expect(smoke.tickBuffs(s, 599_000)).toBe(false);
    expect(smoke.buffOn(s, 'minnowbites')).toBe(true);
    expect(smoke.tickBuffs(s, 1000)).toBe(true);
    expect(s.smoke.buffs).toEqual([]);
  });
});

describe('buffs at the pond', () => {
  const eaten = (...ids: ('minnowbites' | 'kippers' | 'pikejerky' | 'lanternglaze' | 'jewelplatter')[]) => {
    const s = newSave();
    s.smoke.buffs = ids.map((id) => ({ id, ms: 60_000 }));
    return s;
  };

  it('Minnow Bites: bites come 25% sooner', () => {
    const rng = () => 0.5;
    const plain = eco.rollCast(newSave(), 'pond', rng).wait;
    expect(eco.rollCast(eaten('minnowbites'), 'pond', rng).wait).toBeCloseTo(plain * BITE_WAIT);
  });

  it('Kippers: better luck hooks fewer common fish', () => {
    const rare = (s: SaveData) => {
      let seed = 7;
      const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      s.rod = 'fiberglass';
      s.bait = 'fly';
      let n = 0;
      for (let i = 0; i < 4000; i++) if (byId(FISH, eco.rollCast(s, 'pond', rng).fishId!).tier > 1) n++;
      return n;
    };
    expect(rare(eaten('kippers'))).toBeGreaterThan(rare(newSave()) * 1.05);
  });

  it('Pike Jerky: more reel control, on top of the gloves', () => {
    const s = eaten('pikejerky');
    expect(eco.reelControl(s, 2)).toBeCloseTo(2 * CONTROL_BUFF);
    s.perks = ['gloves'];
    expect(eco.reelControl(s, 2)).toBeCloseTo(2 * CONTROL_BUFF * GLOVES_CONTROL);
  });

  it('Lantern Glaze: the night bite starts at dusk', () => {
    expect(smoke.nightBite(newSave(), 0.3)).toBe(false);
    expect(smoke.nightBite(eaten('lanternglaze'), 0.3)).toBe(true);
    expect(smoke.nightBite(eaten('lanternglaze'), 0.1)).toBe(false);
    expect(smoke.nightBite(newSave(), 0.8)).toBe(true);
  });

  it('Jewel Platter: shiny chance ×1.5', () => {
    // 0.06 is above the 5% day shiny chance, but under 7.5%.
    const rng = () => 0.06;
    expect(eco.rollCast(newSave(), 'pond', rng).shiny).toBe(false);
    expect(eco.rollCast(eaten('jewelplatter'), 'pond', rng).shiny).toBe(true);
  });
});

describe('saved Smokehouse', () => {
  it('gives older saves an empty one and drops anything malformed', () => {
    const old = { ...newSave() } as Partial<SaveData>;
    delete old.smoke;
    expect(migrate(old).smoke).toEqual({ racks: [null, null, null], pantry: {}, made: {}, buffs: [] });
    const s = migrate({
      ...newSave(),
      smoke: {
        racks: [{ r: 'kippers', fish: [fish('bass'), null, { k: 'fish', fishId: 'shark', size: 3 }, null], doneAt: 5 }, { r: 'cake', fish: [] }, 'x'],
        pantry: { kippers: [600, -1, 'a', 900], cake: [600] },
        made: { kippers: 2.7, minnowbites: -3 },
        buffs: [{ id: 'kippers', ms: 1000 }, { id: 'kippers', ms: 0 }, { id: 'cake', ms: 5 }],
      },
    } as unknown as SaveData);
    expect(s.smoke).toEqual({
      racks: [{ r: 'kippers', fish: [fish('bass'), null, null, null], doneAt: 5 }, null, null],
      pantry: { kippers: [900, 600] },
      made: { kippers: 2 },
      buffs: [{ id: 'kippers', ms: 1000 }],
    });
  });
});
