import { describe, expect, it } from 'vitest';
import { FISH, byId } from '../data/content';
import { FREE_FISH, SMOKER_SPOTS, SMOKE_LEVEL } from '../data/smokehouse';
import * as eco from './economy';
import { catchXp, sellValue } from './progression';
import * as smoke from './smoke';
import { FISH_SLOT, migrate, newSave, type SaveData } from './state';

const T0 = 1_000_000;
const MIN = 60_000;
const mid = (id: string) => {
  const f = byId(FISH, id);
  return (f.minSize + f.maxSize) / 2;
};
const fish = (id: string, shiny = false) => ({ k: 'fish' as const, fishId: id, size: mid(id), ...(shiny ? { shiny } : {}) });
/** A level-3 save carrying these fish in its fish slots (the Tackle Vest makes room for five). */
const carrying = (...ids: string[]): SaveData => {
  const s = newSave();
  s.level = SMOKE_LEVEL;
  s.perks = ['vest'];
  s.slots = [...s.slots, null, null];
  ids.forEach((id, i) => (s.slots[FISH_SLOT + i] = fish(id)));
  return s;
};
const ofTier = (t: number) => FISH.find((f) => f.tier === t)!.id;

describe('the smoker', () => {
  it('takes one fish per spot and smokes it by tier, then moves it to the Pantry', () => {
    const s = carrying(ofTier(1), ofTier(3), ofTier(5));
    expect(smoke.smokeFish(s, FISH_SLOT, T0)).toBeNull();
    expect(smoke.smokeFish(s, FISH_SLOT + 1, T0)).toBeNull();
    expect(smoke.smokeFish(s, FISH_SLOT + 2, T0)).toBeNull();
    expect(s.smoke.spots.map((x) => x && x.doneAt - T0)).toEqual([5000, 20_000, 120_000, null, null]);
    expect(s.slots.slice(FISH_SLOT).every((x) => !x)).toBe(true);
    expect(smoke.collect(s, T0 + 20_000)).toEqual([{ fishId: ofTier(1), n: 1 }, { fishId: ofTier(3), n: 1 }]);
    expect(s.smoke.spots.filter(Boolean)).toHaveLength(1);
    expect(smoke.pantryCount(s, ofTier(3))).toBe(1);
  });

  it('is shut before level 3, and says when the smoker is full', () => {
    const s = carrying(ofTier(1));
    s.level = SMOKE_LEVEL - 1;
    expect(smoke.smokeFish(s, FISH_SLOT, T0)).toBe(`Mags opens up at level ${SMOKE_LEVEL}.`);
    s.level = SMOKE_LEVEL;
    s.smoke.spots = s.smoke.spots.map(() => ({ fish: fish(ofTier(1)), doneAt: T0 + MIN }));
    expect(smoke.smokeFish(s, FISH_SLOT, T0)).toMatch(/smoker is full/);
    expect(smoke.smokeFish(s, 0, T0)).toBe('Pick a fish from your hotbar.');
  });

  it('Smoke all skips shinies and stops when the spots run out', () => {
    const s = carrying(ofTier(1), ofTier(2), ofTier(2), ofTier(1), ofTier(1));
    s.slots[FISH_SLOT + 1] = fish(ofTier(2), true);
    s.smoke.spots[0] = { fish: fish(ofTier(1)), doneAt: T0 + MIN };
    expect(smoke.smokeAll(s, T0)).toBeNull();
    expect(s.smoke.spots.filter(Boolean)).toHaveLength(SMOKER_SPOTS);
    expect(s.slots[FISH_SLOT + 1]).toMatchObject({ shiny: true });
    expect(s.slots.filter((x) => x?.k === 'fish')).toHaveLength(1);
    const only = carrying();
    only.slots[FISH_SLOT] = fish(ofTier(1), true);
    expect(smoke.smokeAll(only, T0)).toMatch(/skips shinies/);
  });

  it('keeps a shiny smoked fish worth 5×', () => {
    const s = carrying();
    s.slots[FISH_SLOT] = fish(ofTier(1), true);
    smoke.smokeFish(s, FISH_SLOT, T0);
    smoke.collect(s, T0 + MIN);
    expect(s.smoke.pantry[ofTier(1)]).toEqual([Math.round(sellValue(byId(FISH, ofTier(1)), mid(ofTier(1)), true))]);
  });
});

describe('selling smoked fish', () => {
  it('pays 1.5× the raw price for tier 1-2 only', () => {
    const s = carrying();
    smoke.stock(s, ofTier(2), 40, 3);
    smoke.stock(s, ofTier(3), 100);
    const coins = s.coins;
    expect(smoke.sellSmoked(s, ofTier(3))).toMatch(/only buys smoked tier 1 and 2/);
    expect(smoke.sellSmoked(s, ofTier(2), true)).toBeNull();
    expect(s.coins - coins).toBe(180);
    expect(smoke.pantryCount(s, ofTier(2))).toBe(0);
    expect(smoke.sellSmoked(s, 'constructor')).toBe('There are none in your Pantry.');
  });
});

describe('selling one', () => {
  it('sells the most valuable one and keeps the rest', () => {
    const s = carrying();
    smoke.stock(s, ofTier(1), 10);
    smoke.stock(s, ofTier(1), 30);
    const coins = s.coins;
    expect(smoke.smokedPrice(s, ofTier(1), true)).toBe(45);
    expect(smoke.sellSmoked(s, ofTier(1))).toBeNull();
    expect(s.coins - coins).toBe(45);
    expect(s.smoke.pantry[ofTier(1)]).toEqual([10]);
    expect(smoke.sellSmoked(s, ofTier(1))).toBeNull();
    expect(s.smoke.pantry[ofTier(1)]).toBeUndefined();
  });
});

describe('snacks', () => {
  it('plans eating: never stronger, only longer, and Eat all stops at the cap', () => {
    const s = carrying();
    smoke.stock(s, ofTier(1), 10, 10);
    expect(smoke.eatPlan(s, ofTier(1))).toEqual({ n: 1, from: 0, ms: 5 * MIN });
    expect(smoke.eatPlan(s, ofTier(1), true)).toEqual({ n: 6, from: 0, ms: 30 * MIN });
    smoke.eat(s, ofTier(1));
    expect(smoke.eatPlan(s, ofTier(1))).toEqual({ n: 1, from: 5 * MIN, ms: 10 * MIN });
    expect(smoke.eatPlan(s, ofTier(1), true)).toEqual({ n: 5, from: 5 * MIN, ms: 30 * MIN });
    expect(smoke.snack(s)!.bonus).toBe(0.25);
    smoke.eat(s, ofTier(1), true);
    expect(smoke.snack(s)!.bonus).toBe(0.25);
  });

  it('adds 5 minutes per fish up to 30, and Eat all stops at the cap', () => {
    const s = carrying();
    const t1 = ofTier(1);
    smoke.stock(s, t1, 10, 8);
    expect(smoke.eat(s, t1)).toBeNull();
    expect(s.smoke.snack).toEqual({ fishId: t1, ms: 5 * MIN });
    expect(smoke.eat(s, t1, true)).toBeNull();
    expect(s.smoke.snack!.ms).toBe(30 * MIN);
    expect(smoke.pantryCount(s, t1)).toBe(2);
    expect(smoke.eat(s, t1)).toMatch(/already 30 minutes/);
  });

  it('replaces a different snack, asking first when over a minute is left', () => {
    const s = carrying();
    smoke.stock(s, ofTier(1), 10, 2);
    smoke.stock(s, ofTier(3), 50, 1);
    smoke.eat(s, ofTier(1));
    expect(smoke.wouldReplace(s, ofTier(1))).toBe(false);
    expect(smoke.wouldReplace(s, ofTier(3))).toBe(true);
    smoke.tickSnack(s, 4.5 * MIN);
    expect(smoke.wouldReplace(s, ofTier(3))).toBe(false);
    smoke.eat(s, ofTier(3));
    expect(s.smoke.snack).toEqual({ fishId: ofTier(3), ms: 5 * MIN });
  });

  it("won't snack on tier 4-5 fish", () => {
    const s = carrying();
    smoke.stock(s, ofTier(4), 500);
    expect(smoke.eat(s, ofTier(4))).toMatch(/for dishes/);
  });

  it('runs down and wears off', () => {
    const s = carrying();
    smoke.stock(s, ofTier(2), 10);
    smoke.eat(s, ofTier(2));
    expect(smoke.tickSnack(s, 4 * MIN)).toBe(false);
    expect(smoke.tickSnack(s, MIN)).toBe(true);
    expect(s.smoke.snack).toBeNull();
  });
});

describe('buffs at catch', () => {
  it('⭐ adds to the catch XP and credits the snack', () => {
    const s = carrying();
    s.xp = 0;
    const f = byId(FISH, ofTier(2));
    s.dex[f.id] = { count: 1, best: 1 };
    smoke.stock(s, ofTier(2), 10);
    smoke.eat(s, ofTier(2));
    const res = eco.applyCatch(s, f, mid(f.id));
    expect(res.gained).toBe(Math.round(catchXp(f, mid(f.id), false) * 1.5));
    expect(res.xpSnack).toBe(ofTier(2));
    expect(res.coinSnack).toBeUndefined();
  });

  it('💰 multiplies into the fish value beside the Lucky Charm', () => {
    const s = carrying();
    s.perks.push('charm1');
    smoke.stock(s, ofTier(3), 10);
    smoke.eat(s, ofTier(3));
    const res = eco.applyCatch(s, byId(FISH, ofTier(1)), mid(ofTier(1)));
    const charm = eco.charmBonus(s);
    expect(res.mult).toBeCloseTo((1 + charm) * 1.15);
    expect(s.slots.find((x) => x?.k === 'fish')).toMatchObject({ mult: res.mult });
    expect(res.coinSnack).toBe(ofTier(3));
  });
});

describe('stages', () => {
  it('open with the level and the Fishdex, each announced once', () => {
    const s = newSave();
    s.level = 2;
    expect(smoke.openStages(s).ids).toEqual([]);
    s.level = SMOKE_LEVEL;
    expect(smoke.openStages(s)).toEqual({ ids: ['smallfry'], intro: false });
    expect(smoke.pantryTotal(s)).toBe(FREE_FISH);
    s.dex[ofTier(3)] = { count: 1, best: 1 };
    expect(smoke.openStages(s).ids).toEqual(['giants']);
    expect(smoke.kitchenOpen(s)).toBe(true);
    expect(smoke.openStages(s).ids).toEqual([]);
  });

  it('gives an existing player one "New in town" banner for every stage reached', () => {
    const s = newSave();
    s.level = 12;
    s.dex[ofTier(3)] = { count: 4, best: 1 };
    s.dex[ofTier(4)] = { count: 1, best: 1 };
    expect(smoke.openStages(s)).toEqual({ ids: ['smallfry', 'giants', 'jewels'], intro: true });
  });

  it('the free smoked fish are the most-caught tier 1 species', () => {
    const s = newSave();
    s.level = SMOKE_LEVEL;
    const t1 = FISH.filter((f) => f.tier === 1);
    s.dex[t1[2].id] = { count: 9, best: 1 };
    s.dex[t1[0].id] = { count: 2, best: 1 };
    smoke.openStages(s);
    expect(smoke.pantryCount(s, t1[2].id)).toBe(FREE_FISH);
  });

  it('a catch reaching level 3 opens Small Fry', () => {
    const s = newSave();
    s.level = 2;
    s.xp = 10_000;
    s.dex[ofTier(1)] = { count: 1, best: 1 };
    const res = eco.applyCatch(s, byId(FISH, ofTier(1)), mid(ofTier(1)));
    expect(res.level).toBeGreaterThanOrEqual(SMOKE_LEVEL);
    expect(res.stages).toContain('smallfry');
  });
});

describe('saving', () => {
  it("drops v1's racks and recipes and keeps good R1 data", () => {
    const raw = {
      ...newSave(),
      smoke: {
        racks: [{ r: 'kippers', fish: [] }],
        pantry: { kippers: [600], perch: [30, 'x', 50], __proto__: [1] },
        buffs: [{ id: 'kippers', ms: 1000 }],
        spots: [{ fish: fish('perch'), doneAt: T0 }, { fish: { k: 'fish', fishId: 'nope', size: 1 }, doneAt: T0 }],
        snack: { fishId: 'perch', ms: 9000 },
        seen: ['smallfry', 'bogus', 'smallfry'],
      },
    };
    const s = migrate(JSON.parse(JSON.stringify(raw))).smoke;
    expect(s.pantry).toEqual({ perch: [50, 30] });
    expect(s.spots.map((x) => x?.fish.fishId ?? null)).toEqual(['perch', null, null, null, null]);
    expect(s.snack).toEqual({ fishId: 'perch', ms: 9000 });
    expect(s.seen).toEqual(['smallfry']);
    expect(Object.keys(s)).toEqual(['spots', 'pantry', 'snack', 'seen']);
  });
});
