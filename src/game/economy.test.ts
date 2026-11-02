import { describe, expect, it } from 'vitest';
import * as eco from './economy';
import { ROD_SLOT, SLOT_COUNT, migrate, newSave, type SaveData } from './state';
import { FISH, LINES, byId } from '../data/content';
import { GLOVES_CONTROL } from '../data/casino';
import { mulberry } from './env';
import { FIGHT_DT, P, Reel, type ReelTune } from './reel';
import { BACKPAY_VERSION, FISH_SPREAD, FLAT_LEVEL, TAG_TIERS, backPayXp, xpForNextLevel } from './progression';
import { Drops } from './drops';
import { COSMETICS, COS_SLOTS, cosById, isFace } from '../data/cosmetics';

const fishSlot = (size = 20) => ({ k: 'fish' as const, fishId: FISH[0].id, size });
/** Distinct fish that survive the size clamp in `migrate`. */
const fish = (i: number) => ({ k: 'fish' as const, fishId: FISH[0].id, size: 5 + i / 4 });
const rod = (id: string) => ({ k: 'rod' as const, id });
const bait = (id: 'worm' | 'fly' | 'minnow' | 'pearl', n: number) => ({ k: 'bait' as const, id, n });

describe('best catch', () => {
  it('keeps only the most valuable fish caught', () => {
    const s = newSave();
    const cheap = FISH[0];
    const dear = FISH[FISH.length - 1];
    eco.applyCatch(s, dear, dear.maxSize);
    const top = s.best!.value;
    s.slots = [null, null, null, null, null];
    eco.applyCatch(s, cheap, cheap.minSize);
    expect(s.best).toMatchObject({ fishId: dear.id, value: top });
    expect(newSave().best).toBeNull();
  });
});

describe('clean catch', () => {
  it('a fish landed without fraying the line is worth 10% more', () => {
    const f = FISH[FISH.length - 1];
    const plain = newSave();
    eco.applyCatch(plain, f, f.maxSize);
    const clean = newSave();
    const res = eco.applyCatch(clean, f, f.maxSize, false, true);
    expect(res.mult).toBeCloseTo(1 + eco.CLEAN_BONUS);
    const item = (s: SaveData) => s.slots.find((sl) => sl?.k === 'fish') as { fishId: string; size: number; mult?: number };
    expect(eco.fishValue(item(clean)) / eco.fishValue(item(plain))).toBeCloseTo(1 + eco.CLEAN_BONUS);
  });
});

describe('carry slots', () => {
  it('starts with a rod, a worm stack and three free slots', () => {
    const s = newSave();
    expect(s.slots).toHaveLength(SLOT_COUNT);
    expect(eco.baitCount(s, 'worm')).toBe(15);
    expect(eco.freeSlots(s)).toBe(3);
  });

  it('buying bait fills the locker and keeps the hotbar stack topped up', () => {
    const s = newSave();
    s.coins = 999;
    expect(eco.buyBait(s, 'worm')).toBe(true);
    expect(s.slots[1]).toMatchObject({ n: 20 });
    expect(eco.baitCount(s, 'worm')).toBe(20);
    expect(eco.freeSlots(s)).toBe(3);
  });

  it('keeps a big bait supply in one hotbar stack, spilling only past 99 into the locker', () => {
    const s = newSave();
    s.coins = 99_999;
    for (let i = 0; i < 20; i++) expect(eco.buyBait(s, 'worm')).toBe(true);
    expect(eco.baitCount(s, 'worm')).toBe(115);
    expect(s.slots[1]).toMatchObject({ k: 'bait', id: 'worm', n: 99 });
    expect(s.locker.bait.worm).toBe(16);
    expect(s.slots.filter((x) => x?.k === 'bait')).toHaveLength(1);
  });

  it('equips higher-tier bait from the locker and swaps rods', () => {
    const s = newSave();
    s.coins = 9999;
    s.level = 10;
    expect(eco.buyBait(s, 'minnow')).toBe(true);
    expect(s.bait).toBe('minnow');
    expect(eco.buyRod(s, 'graphite')).toBe(true);
    expect(eco.equipBait(s, 'worm')).toBe(true);
    expect(s.bait).toBe('worm');
    expect(eco.baitCount(s, 'minnow')).toBe(5);
    expect(s.rod).toBe('graphite');
    expect(s.slots.filter((x) => x?.k === 'rod')).toHaveLength(1);
    expect(eco.equipRod(s, 'twig')).toBe(true);
    expect(s.rod).toBe('twig');
    expect(eco.ownsRod(s, 'graphite')).toBe(true);
    expect(eco.equipRod(s, 'carbon')).toBe(false);
  });

  it('refills the bait slot from the locker when a stack runs out, and leaves it empty when none is left', () => {
    const s = newSave();
    s.locker.bait.worm = 3;
    s.slots = [rod('twig'), bait('worm', 1), null, null, null];
    expect(eco.spendBait(s)).toBe(true);
    expect(s.slots[1]).toMatchObject({ k: 'bait', n: 3 });
    s.slots[1] = bait('worm', 1);
    expect(eco.spendBait(s)).toBe(true);
    expect(s.slots[1]).toBeNull();
    expect(s.bait).toBe('worm');
    expect(eco.canCast(s)).toBe('nobait');
  });

  it('only stores catches in free fish slots and blocks casting when the fish row is full', () => {
    const s = newSave();
    s.slots = [rod('twig'), null, fishSlot(), fishSlot(), null];
    // The empty bait slot never takes a fish.
    expect(eco.freeSlots(s)).toBe(1);
    expect(eco.applyCatch(s, FISH[0], 20).stored).toBe(true);
    expect(s.slots[4]).toMatchObject({ k: 'fish' });
    expect(s.slots[1]).toBeNull();
    expect(eco.applyCatch(s, FISH[0], 20).stored).toBe(false);
    s.slots = [rod('twig'), bait('worm', 3), fishSlot(), fishSlot(), fishSlot()];
    expect(eco.canCast(s)).toBe('full');
    // The last bait no longer frees a slot for the catch.
    s.slots[1] = bait('worm', 1);
    expect(eco.canCast(s)).toBe('full');
    s.slots[4] = null;
    expect(eco.canCast(s)).toBe('ok');
  });

  it('swaps rods and bait in their own slots, even with every fish slot full', () => {
    const s = newSave();
    s.level = 10;
    s.coins = 9999;
    s.slots = [rod('twig'), bait('worm', 15), fishSlot(), fishSlot(), fishSlot()];
    expect(eco.buyRod(s, 'graphite')).toBe(true);
    expect(s.slots[0]).toEqual(rod('graphite'));
    expect(s.locker.rods).toEqual(['twig']);
    expect(eco.buyBait(s, 'minnow')).toBe(true);
    expect(s.slots[1]).toEqual(bait('minnow', 5));
    expect(s.locker.bait.worm).toBe(15);
    expect(eco.equipRod(s, 'twig')).toBe(true);
    expect(eco.equipBait(s, 'worm')).toBe(true);
    expect(s.slots.slice(0, 2)).toEqual([rod('twig'), bait('worm', 15)]);
    expect(s).toMatchObject({ rod: 'twig', bait: 'worm', locker: { rods: ['graphite'], bait: { minnow: 5 } } });
    expect(s.slots.filter((x) => x?.k === 'fish')).toHaveLength(3);
    expect(eco.selectSlot(s, 1)).toBe(true);
    expect(s.held).toBe(1);
  });

  it('sells only the fish in hand', () => {
    const s = newSave();
    s.slots[2] = fishSlot();
    expect(eco.sellHeld(s)).toBe(false);
    eco.selectSlot(s, 2);
    expect(eco.sellHeld(s)).toBe(true);
    expect(s.slots[2]).toBeNull();
    expect(s.coins).toBeGreaterThan(20);
  });

  it('selecting a rod slot makes it the active one', () => {
    const s = newSave();
    eco.selectSlot(s, 0);
    expect(s.rod).toBe('twig');
    expect(eco.buyRod(s, 'fiberglass')).toBe(false);
  });

  it('blocks casting with fish in hand and never drops the last rod', () => {
    const s = newSave();
    s.slots[2] = fishSlot();
    expect(eco.canCast(s)).toBe('ok');
    eco.selectSlot(s, 2);
    expect(eco.canCast(s)).toBe('hands');
    eco.selectSlot(s, 0);
    expect(eco.dropHeld(s)).toBeNull();
  });

  it('dropping the rod brings out the best other rod from the locker', () => {
    const s = newSave();
    s.locker.rods = ['fiberglass', 'graphite'];
    expect(eco.dropHeld(s)).toEqual(rod('twig'));
    expect(s.slots[0]).toEqual(rod('graphite'));
    expect(s.rod).toBe('graphite');
    expect(s.locker.rods).toEqual(['fiberglass']);
    expect(eco.ownsRod(s, 'twig')).toBe(false);
  });

  it('drops and picks items back up', () => {
    const s = newSave();
    eco.selectSlot(s, 1);
    const item = eco.dropHeld(s)!;
    expect(item).toMatchObject({ k: 'bait', n: 15 });
    expect(eco.baitCount(s, 'worm')).toBe(0);
    expect(s.slots[1]).toBeNull();
    expect(eco.takeItem(s, item)).toBe(true);
    expect(s.slots[1]).toEqual(bait('worm', 15));
    s.slots = [rod('twig'), bait('worm', 15), fishSlot(), fishSlot(), fishSlot()];
    expect(eco.canTake(s, fishSlot())).toBe(false);
    s.slots[3] = null;
    expect(eco.takeItem(s, fishSlot(30))).toBe(true);
    expect(s.slots[3]).toEqual(fishSlot(30));
  });

  it('puts picked-up rods and bait in their slot or the tackle locker, never in a fish slot', () => {
    const s = newSave();
    s.level = 10;
    // A dropped bait stack refills from the locker, like a used-up one.
    s.locker.bait.worm = 4;
    eco.selectSlot(s, 1);
    eco.dropHeld(s);
    expect(s.slots[1]).toEqual(bait('worm', 4));
    // Other bait waits in the locker; the same bait tops the slot up, spilling past 99 into the locker.
    expect(eco.takeItem(s, bait('fly', 7))).toBe(true);
    expect(eco.takeItem(s, bait('worm', 98))).toBe(true);
    expect(s.slots[1]).toEqual(bait('worm', 99));
    expect(s.locker.bait).toEqual({ fly: 7, worm: 3 });
    s.locker.bait.fly = eco.LOCKER_CAP;
    expect(eco.canTake(s, bait('fly', 1))).toBe(false);
    // A new rod goes to the locker; one you already own stays on the ground.
    expect(eco.canTake(s, rod('twig'))).toBe(false);
    expect(eco.takeItem(s, rod('graphite'))).toBe(true);
    expect(s.slots[0]).toEqual(rod('twig'));
    expect(s.locker.rods).toEqual(['graphite']);
    expect(s.slots.slice(2)).toEqual([null, null, null]);
  });

  it('migrates old saves', () => {
    const old = { ...newSave(), ownedRods: ['twig', 'graphite'], baitStock: { worm: 25, fly: 3, minnow: 0 }, inventory: [{ fishId: FISH[0].id, size: 5 }] } as Partial<SaveData>;
    delete old.slots;
    const s = migrate(old);
    expect(s.slots).toEqual([rod('twig'), bait('worm', 25), fish(0), null, null]);
    expect(s.locker).toEqual({ rods: ['graphite'], bait: { fly: 3 } });
    expect('inventory' in s).toBe(false);
    expect('ownedRods' in s).toBe(false);
  });

  it('leaves saves that already have the rod and bait slots alone', () => {
    const s = newSave();
    expect(migrate(structuredClone(s))).toEqual(s);
    const t = { ...newSave(), rod: 'graphite', bait: 'fly' as const, held: 4, locker: { rods: ['twig'], bait: { worm: 3 } } };
    t.slots = [rod('graphite'), bait('fly', 9), null, null, fish(0)];
    expect(migrate(structuredClone(t))).toEqual(t);
    // An empty bait slot stays empty when the locker has none of the active bait either.
    t.slots[1] = null;
    expect(migrate(structuredClone(t)).slots[1]).toBeNull();
  });

  it('moves extra rods and bait from an old hotbar to the tackle locker, keeping the equipped ones', () => {
    const old = { ...newSave(), level: 10, rod: 'graphite', bait: 'fly' as const, held: 3, locker: { rods: ['carbon'], bait: { fly: 5 } } };
    old.slots = [rod('twig'), bait('worm', 15), fish(11), rod('graphite'), bait('fly', 60)];
    const s = migrate(old);
    expect(s.slots).toEqual([rod('graphite'), bait('fly', 65), fish(11), null, null]);
    expect(s).toMatchObject({ rod: 'graphite', bait: 'fly', held: 0 });
    expect(s.locker.rods.sort()).toEqual(['carbon', 'twig']);
    expect(s.locker.bait).toEqual({ worm: 15 });
    // Nothing is lost: every rod and every bait is still owned.
    expect(eco.baitCount(s, 'worm') + eco.baitCount(s, 'fly')).toBe(15 + 60 + 5);
  });

  it('merges stacks of the active bait into the bait slot, up to 99, and keeps the fish in hand', () => {
    const old = { ...newSave(), bait: 'worm' as const, held: 0, perks: ['vest'] };
    old.slots = [fish(11), bait('worm', 99), rod('twig'), bait('worm', 30), fish(12), bait('fly', 4), null];
    const s = migrate(old);
    // Fish already in fish slots stay put; the one from slot 1 fills the first free fish slot.
    expect(s.slots).toEqual([rod('twig'), bait('worm', 99), fish(11), null, fish(12), null, null]);
    expect(s.held).toBe(2);
    expect(s.locker.bait).toEqual({ worm: 30, fly: 4 });
  });

  it('takes the rod and bait slots from the locker when the old hotbar has none', () => {
    const old = { ...newSave(), rod: 'graphite', bait: 'fly' as const, locker: { rods: ['graphite', 'twig'], bait: { fly: 150 } } };
    old.slots = [fish(1), fish(2), fish(3), null, null];
    const s = migrate(old);
    // Fish already in fish slots stay put; the ones from slots 1 and 2 fill the free ones.
    expect(s.slots).toEqual([rod('graphite'), bait('fly', 99), fish(3), fish(1), fish(2)]);
    expect(s.locker).toEqual({ rods: ['twig'], bait: { fly: 51 } });
    // Saves that don't own the active bait any more pick up the first stack they carry instead.
    const t = migrate({ ...newSave(), bait: 'minnow', slots: [rod('twig'), null, bait('fly', 3), null, null] });
    expect(t.slots[1]).toEqual(bait('fly', 3));
    expect(t.bait).toBe('fly');
  });

  it('never loses fish that no longer fit: they wait in extra slots until sold', () => {
    const old = { ...newSave(), held: 4, coins: 0 };
    old.slots = [rod('twig'), fish(1), fish(2), fish(3), fish(4)];
    const s = migrate(old);
    expect(s.slots).toEqual([rod('twig'), null, fish(2), fish(3), fish(4), fish(1)]);
    expect(s.held).toBe(4);
    expect(eco.freeSlots(s)).toBe(0);
    expect(eco.canTake(s, fish(0))).toBe(false);
    // A second load keeps the extra slot.
    expect(migrate(structuredClone(s))).toEqual(s);
    // Selling an ordinary fish frees its slot; selling the extra one removes the extra slot.
    expect(eco.sellSlot(s, 2)).toBe(true);
    expect(s.slots).toHaveLength(6);
    expect(eco.selectSlot(s, 5)).toBe(true);
    expect(eco.sellHeld(s)).toBe(true);
    expect(s.slots).toEqual([rod('twig'), null, null, fish(3), fish(4)]);
    expect(s.held).toBe(4);
    expect(s.coins).toBeGreaterThan(0);
  });

  it('keeps every fish from a vest-sized hotbar full of fish, and the vest turns extra slots into ordinary ones', () => {
    const old = { ...newSave(), perks: ['vest'], chips: 0, locker: { rods: ['twig'], bait: {} } };
    old.slots = Array.from({ length: 7 }, (_, i) => fish(i + 1));
    const s = migrate(old);
    expect(s.slots).toHaveLength(9);
    expect(s.slots[0]).toEqual(rod('twig'));
    expect(s.slots.filter((x) => x?.k === 'fish')).toHaveLength(7);
    // Dropping an extra fish removes its slot too; the fish after it moves up.
    eco.selectSlot(s, 7);
    expect(eco.dropHeld(s)).toEqual(fish(1));
    expect(s.slots).toEqual([rod('twig'), null, fish(3), fish(4), fish(5), fish(6), fish(7), fish(2)]);
    const v = migrate({ ...old, perks: [], slots: [rod('twig'), bait('worm', 5), fish(1), fish(2), fish(3), fish(4)] });
    expect(v.slots).toHaveLength(6);
    v.chips = 100;
    expect(eco.buyPerk(v, 'vest')).toBe(true);
    expect(v.slots).toEqual([rod('twig'), bait('worm', 5), fish(1), fish(2), fish(3), fish(4), null]);
  });

  it('gives saves from before faces a random face, and keeps a valid one', () => {
    const old = { ...newSave(), look: { color: 0x123456, hat: null, shirt: null, jewelry: null } };
    const s = migrate(old);
    expect(isFace(s.look.face)).toBe(true);
    expect(s.look.color).toBe(0x123456);
    expect(migrate({ ...newSave(), look: { ...newSave().look, face: 'cat' } }).look.face).toBe('cat');
    expect(isFace(migrate({ ...newSave(), look: { ...newSave().look, face: 'bogus' } }).look.face)).toBe(true);
    // A colour lost to JSON (NaN is stored as null) falls back to the default, not black.
    expect(migrate({ ...newSave(), look: { ...newSave().look, color: null as never } }).look.color).toBe(newSave().look.color);
  });

  it('pulls records and carried fish from before the size rework into the new ranges', () => {
    const minnow = FISH.find((f) => f.id === 'minnow')!;
    const sturgeon = FISH.find((f) => f.id === 'sturgeon')!;
    const old = { ...newSave(), dex: { minnow: { count: 3, best: 30 }, sturgeon: { count: 1, best: 100 } }, best: { fishId: 'sturgeon', size: 100, value: 500 } };
    old.slots = [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 15 }, { k: 'fish', fishId: 'minnow', size: 12 }, null, null];
    const s = migrate(old);
    expect(s.dex.minnow.best).toBe(minnow.maxSize);
    expect(s.dex.sturgeon.best).toBe(sturgeon.minSize);
    expect(s.best!.size).toBe(sturgeon.minSize);
    expect(s.best!.value).toBe(500);
    expect(s.slots[2]).toMatchObject({ k: 'fish', size: minnow.maxSize });
  });

  it('only accepts known faces', () => {
    const s = newSave();
    expect(eco.setFace(s, 'joy')).toBe(true);
    expect(s.look.face).toBe('joy');
    expect(eco.setFace(s, 'nope')).toBe(false);
    expect(s.look.face).toBe('joy');
  });

  it('starts new saves with a random face', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newSave().look.face));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('drops the removed Town Fund fields from old saves', () => {
    const s = migrate({ ...newSave(), coins: 77, fund: { pond: 300, 'pond:open': 1 }, contributed: { pond: 120 } });
    expect('fund' in s).toBe(false);
    expect('contributed' in s).toBe(false);
    expect(s.coins).toBe(77);
  });
});

describe('Quick-Reel Gloves', () => {
  it('reel in fish faster: the cast roll carries the faster calm reeling, which the fight and the replay both use', () => {
    const s = newSave();
    expect(eco.fightTune(s)).toBeUndefined();
    s.perks = ['gloves'];
    expect(eco.fightTune(s)).toEqual({ reel: P.reel * GLOVES_CONTROL });
    s.seaRod = true;
    expect(eco.rollSeaCast(s, 10, mulberry(1)).tune).toEqual(eco.fightTune(s));
    // A matched fish held all fight lands sooner with the gloves.
    const held = (tune?: ReelTune) => {
      const r = new Reel({ strength: 0, weight: 0 }, mulberry(4), tune);
      while (r.status === 'reeling') r.update(FIGHT_DT, r.tension < 0.75);
      return r;
    };
    expect(held().status).toBe('caught');
    expect(held(eco.fightTune(s)).elapsed).toBeLessThan(held().elapsed * 0.9);
  });
});

describe('line', () => {
  it('spools a better line onto the rod: a step up, unlocked and paid for, nothing to carry', () => {
    const s = newSave();
    s.coins = 10_000;
    expect(eco.lineOf(s).id).toBe('twine');
    expect(eco.buyLine(s, 'mono')).toBe(false); // level 1
    s.level = 5;
    expect(eco.buyLine(s, 'mono')).toBe(true);
    expect(s.line).toBe('mono');
    expect(s.coins).toBe(9_900);
    expect(eco.buyLine(s, 'mono')).toBe(false); // already spooled
    expect(eco.buyLine(s, 'twine')).toBe(false); // lighter
    expect(eco.buyLine(s, 'braid')).toBe(false); // level 9
    expect(eco.buyLine(s, 'fluoro')).toBe(true);
    expect(s.coins).toBe(9_400);
    s.coins = 10;
    s.level = 20;
    expect(eco.buyLine(s, 'braid')).toBe(false); // broke
    expect(s.slots.filter((x) => x && x.k !== 'rod' && x.k !== 'bait')).toEqual([]);
  });

  it('a save from before line gets the line of its best rod, so nothing it could land is walled off', () => {
    const { line: _drop, ...old } = { ...newSave(), rod: 'graphite', locker: { rods: ['carbon'], bait: {} }, slots: [rod('graphite'), bait('worm', 5), null, null, null] };
    expect(migrate(old as object).line).toBe('braid');
    expect(migrate({ ...old, locker: { rods: [], bait: {} } } as object).line).toBe('fluoro');
    expect(migrate({ ...newSave(), line: 'bogus' }).line).toBe('twine');
    expect(migrate({ ...newSave(), line: 'mono' }).line).toBe('mono');
  });

  it('the cast roll carries the fish\'s gaps over the rod and line, with its tag and spread', () => {
    const s = newSave();
    s.level = 20;
    s.line = 'fluoro';
    eco.buyRod(Object.assign(s, { coins: 100_000 }), 'fiberglass');
    let fish = 0, tagged = 0;
    const rng = (() => { let x = 1; return () => ((x = (x * 48271) % 2147483647) / 2147483647); })();
    for (let i = 0; i < 400; i++) {
      s.slots[1] = bait('minnow', 50);
      s.bait = 'minnow';
      const roll = eco.rollCast(s, 'pond', rng);
      if (!roll.fishId) continue;
      fish++;
      const f = byId(FISH, roll.fishId);
      const tag = (t: string) => (roll.tag === t ? (t === 'feisty' ? TAG_TIERS.feisty : TAG_TIERS.brutish) : 0);
      expect(Math.abs(roll.d!.strength - (f.tier - 3) - tag('feisty'))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
      expect(Math.abs(roll.d!.weight - (f.tier - 2) - tag('brutish'))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
      if (roll.tag) tagged++;
    }
    expect(fish).toBeGreaterThan(300);
    expect(tagged).toBeGreaterThan(0);
  });
});

describe('tag bonus', () => {
  it('a Feisty or Brutish fish is worth more, on top of a clean catch', () => {
    const pike = byId(FISH, 'pike');
    const plain = eco.applyCatch(newSave(), pike, 80, false, false, true);
    const feisty = eco.applyCatch(newSave(), pike, 80, false, false, true, 'feisty');
    const both = eco.applyCatch(newSave(), pike, 80, false, true, true, 'brutish');
    expect(feisty.mult).toBeCloseTo((1 + eco.TAG_BONUS) * plain.mult, 9);
    expect(both.mult).toBeCloseTo((1 + eco.TAG_BONUS) * (1 + eco.CLEAN_BONUS) * plain.mult, 9);
    expect(feisty.sold!).toBeGreaterThan(plain.sold!);
    // The bonus rides on the fish, so it still counts when the fish is sold later.
    const s = newSave();
    eco.applyCatch(s, pike, 80, false, false, false, 'feisty');
    const item = s.slots.find((x) => x?.k === 'fish')!;
    expect(item.k === 'fish' && item.mult).toBeCloseTo(1 + eco.TAG_BONUS, 9);
  });
});

describe('sightings', () => {
  it('names what stands between the gear and a species: line to hold it, rod to land it, bait to hook it', () => {
    const s = newSave(); // Twig, Twine, Worm
    const pike = byId(FISH, 'pike'); // tier 3
    expect(eco.gearNeeds(s, pike)).toMatchObject({ line: { id: 'fluoro' }, rod: { id: 'graphite' }, bait: { id: 'minnow' } });
    s.line = 'fluoro';
    expect(eco.gearNeeds(s, pike).line).toBeNull();
    s.rod = 'aurora';
    s.bait = 'pearl';
    expect(eco.gearNeeds(s, pike)).toEqual({ line: null, rod: null, bait: null });
    expect(eco.gearNeeds(s, byId(FISH, 'bluegill'))).toEqual({ line: null, rod: null, bait: null });
  });

  it('a sea fish lost a step or more over the Deep Sea Rod or Line is seen once; one the gear handles is not', () => {
    const s = newSave();
    const sea = FISH.find((f) => f.sea)!;
    expect(eco.recordSeaSighting(s, sea, { strength: 0.8, weight: 0.6 })).toBe(false);
    expect(eco.recordSeaSighting(s, sea, { strength: 0.2, weight: 1.1 })).toBe(true);
    expect(eco.recordSeaSighting(s, sea, { strength: 1.5, weight: 1.5 })).toBe(false);
    expect(s.seen).toEqual([sea.id]);
  });

  it('a fish lost to a gear wall is seen once, a fish the gear handles is not, and a catch clears it', () => {
    const s = newSave();
    const pike = byId(FISH, 'pike');
    expect(eco.recordSighting(s, byId(FISH, 'bluegill'))).toBe(false);
    expect(eco.recordSighting(s, pike)).toBe(true);
    expect(eco.recordSighting(s, pike)).toBe(false);
    expect(s.seen).toEqual(['pike']);
    // Over the line only still counts; over nothing does not.
    const t = { ...newSave(), rod: 'graphite', seen: [] as string[] };
    expect(eco.recordSighting(t, pike)).toBe(true);
    const u = { ...newSave(), rod: 'graphite', line: 'fluoro', seen: [] as string[] };
    expect(eco.recordSighting(u, pike)).toBe(false);
    // Catching it moves it from seen to the dex.
    s.slots[2] = null;
    eco.applyCatch(s, pike, 80, false, false, false);
    expect(s.seen).toEqual([]);
    expect(s.dex.pike?.count).toBe(1);
  });

  it('migration keeps only real, uncaught species in the seen list', () => {
    expect(migrate({ ...newSave(), seen: ['pike', 'nope', 'pike', 'bluegill'], dex: { bluegill: { count: 1, best: 12 } } }).seen).toEqual(['pike']);
    const { seen: _s, ...old } = newSave();
    expect(migrate(old as object).seen).toEqual([]);
  });
});

describe('drops', () => {
  it('expire after 30 seconds', () => {
    let t = 0;
    const d = new Drops(() => t);
    d.add('pond', 0, 0, fishSlot());
    t = 29_000;
    expect(d.expire()).toBe(false);
    t = 30_001;
    expect(d.expire()).toBe(true);
    expect(d.all()).toHaveLength(0);
  });
});

describe('message bottles', () => {
  it('pays once per bottle, with a bonus for the last', () => {
    const s = newSave();
    const ids = ['a', 'b'];
    const c0 = s.coins;
    expect(eco.collectBottle(s, 'a', ids)).toBe(eco.BOTTLE_COINS);
    expect(eco.collectBottle(s, 'a', ids)).toBe(0);
    expect(eco.collectBottle(s, 'zzz', ids)).toBe(0);
    expect(eco.collectBottle(s, 'b', ids)).toBe(eco.BOTTLE_COINS + eco.BOTTLE_BONUS);
    expect(s.coins).toBe(c0 + 2 * eco.BOTTLE_COINS + eco.BOTTLE_BONUS);
  });
});

describe('worm digging', () => {
  const broke = (): SaveData => {
    const s = newSave();
    s.slots[1] = null;
    s.coins = 3;
    return s;
  };

  it('is only for players with no bait at all who cannot afford a worm pack', () => {
    expect(eco.canDig(newSave())).toBe(false);
    const s = broke();
    expect(eco.canDig(s)).toBe(true);
    s.coins = 10;
    expect(eco.canDig(s)).toBe(false);
    s.coins = 0;
    s.locker.bait.fly = 1;
    expect(eco.canDig(s)).toBe(false);
  });

  it('gives a pack of worms ready to cast', () => {
    const s = broke();
    s.bait = 'fly';
    expect(eco.digWorms(s)).toBe(eco.DIG_WORMS);
    expect(eco.baitCount(s, 'worm')).toBe(eco.DIG_WORMS);
    expect(s.bait).toBe('worm');
    expect(eco.canCast(s)).toBe('ok');
    expect(eco.digWorms(s)).toBe(0);
  });

  it('puts dug worms in the bait slot even when every fish slot is full', () => {
    const s = broke();
    s.slots[2] = { k: 'fish', fishId: FISH[0].id, size: 10 };
    s.slots[3] = { k: 'fish', fishId: FISH[0].id, size: 10 };
    s.slots[4] = { k: 'fish', fishId: FISH[0].id, size: 10 };
    expect(eco.digWorms(s)).toBe(eco.DIG_WORMS);
    expect(s.slots[1]).toEqual({ k: 'bait', id: 'worm', n: eco.DIG_WORMS });
    expect(s.locker.bait.worm).toBeUndefined();
  });
});

describe('charms & perks summary', () => {
  it('lists only working perks, with the best Lucky Charm replacing the lower ones', () => {
    const s = newSave();
    expect(eco.activePerks(s)).toEqual([]);
    s.perks = ['charm1', 'charm2', 'gloves', 'vest'];
    s.lure = 2;
    const list = eco.activePerks(s);
    expect(list.map((p) => p.id)).toEqual(['charm2', 'gloves', 'vest', 'lure']);
    expect(list[0].effect).toBe('Fish worth +10%');
    expect(list[3].effect).toBe('2 shiny casts left');
    s.lureOff = true;
    expect(eco.activePerks(s)[3].effect).toBe('Shiny Lure off · 2 saved');
  });

  it('saves Shiny Lure charges while it is switched off', () => {
    const s = newSave();
    s.lure = 2;
    // 0.99 never rolls a shiny on its own, so a shiny here comes from the lure.
    const rng = () => 0.99;
    expect(eco.setLure(s, false)).toBe(true);
    expect(eco.setLure(s, false)).toBe(false);
    expect(eco.lureOn(s)).toBe(false);
    expect(eco.rollCast(s, 'pond', rng).shiny).toBe(false);
    expect(s.lure).toBe(2);
    expect(eco.setLure(s, 'yes')).toBe(false);
    expect(eco.setLure(s, true)).toBe(true);
    expect(eco.rollCast(s, 'pond', rng).shiny).toBe(true);
    expect(s.lure).toBe(1);
    expect(migrate({ ...s, lureOff: undefined } as unknown as SaveData).lureOff).toBe(false);
  });
});

describe('cosmetics shops', () => {
  it('keeps every tier in every slot, with casino items at each counter', () => {
    for (const slot of COS_SLOTS) {
      const stall = COSMETICS.filter((c) => c.slot === slot && c.shop === 'stall');
      expect(stall.some((c) => c.tier === 0)).toBe(true);
      expect(stall.some((c) => c.tier === 5)).toBe(true);
      expect(COSMETICS.some((c) => c.slot === slot && c.shop === 'casino')).toBe(true);
    }
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    // Old saves keep their items: these ids must never disappear.
    for (const id of ['cap', 'straw', 'bucket', 'captain', 'horned', 'crown', 'tee', 'striped', 'vest', 'hawaiian', 'coat', 'cloak', 'shell', 'chain', 'pendant', 'pearl', 'amulet', 'diamond'])
      expect(cosById(id)?.shop).toBe('stall');
  });

  it('stall items cost coins at the stall; casino items cost chips at the prize counter', () => {
    const s = newSave();
    s.coins = 1_000_000;
    s.chips = 0;
    expect(eco.buyCosmetic(s, 'visor', 'stall')).toBe(false);
    expect(eco.buyCosmetic(s, 'visor', 'casino')).toBe(false);
    expect(s.coins).toBe(1_000_000);
    s.chips = 35.5;
    expect(eco.buyCosmetic(s, 'cap', 'casino')).toBe(false);
    expect(eco.buyCosmetic(s, 'visor', 'casino')).toBe(true);
    expect(s.chips).toBe(5.5);
    expect(s.coins).toBe(1_000_000);
    expect(eco.buyCosmetic(s, 'visor', 'casino')).toBe(false);
    expect(eco.buyCosmetic(s, 'cap', 'stall')).toBe(true);
    expect(s.coins).toBe(1_000_000 - cosById('cap')!.price);
    expect(s.owned).toEqual(['visor', 'cap']);
  });
});

describe('ranks, titles and back pay', () => {
  const eel = byId(FISH, 'constellation');
  it('reaching a rank on a catch gives its title and outfit and says so', () => {
    const s = newSave();
    s.level = 24;
    s.xp = xpForNextLevel(24) - 1;
    const res = eco.applyCatch(s, eel, 250);
    expect(res.leveledUp).toBe(true);
    expect(res.ranks.map((r) => r.id)).toEqual(['deckhand', 'bosun']);
    expect(s.titles).toEqual(['deckhand', 'bosun']);
    expect(s.owned).toContain('souwester');
  });
  it('counts shinies per species', () => {
    const s = newSave();
    eco.applyCatch(s, eel, 250, true);
    eco.applyCatch(s, eel, 250);
    eco.applyCatch(s, eel, 250, true);
    expect(s.dex[eel.id]).toMatchObject({ count: 3, shiny: 2 });
  });
  it('keeps levelling past 50, banking the fare and cooking the provision into a dish', () => {
    const s = newSave();
    s.level = FLAT_LEVEL + 4;
    s.xp = xpForNextLevel(FLAT_LEVEL) - 1;
    const res = eco.applyCatch(s, eel, 250);
    expect(s.level).toBe(FLAT_LEVEL + 5);
    expect(s.gifts).toEqual({ provisions: 0, fares: 1 });
    // A tier 5 catch opens the Kitchen and every dish, so the gift is the Spirit Banquet.
    expect(res.gift).toEqual({ id: 'banquet', n: 1 });
  });
  it('wears only an earned title', () => {
    const s = newSave();
    expect(eco.setTitle(s, 'admiral')).toBe(false);
    s.titles = ['bosun'];
    expect(eco.setTitle(s, 'bosun')).toBe(true);
    expect(s.title).toBe('bosun');
    expect(eco.setTitle(s, null)).toBe(true);
    expect(s.title).toBe(null);
    expect(eco.setTitle(s, 42)).toBe(false);
  });
  it('never sells an earned outfit', () => {
    const s = newSave();
    s.coins = 1e9;
    s.chips = 1e9;
    for (const at of ['stall', 'casino', 'earned'] as const) expect(eco.buyCosmetic(s, 'bicorne', at)).toBe(false);
    expect(s.owned).not.toContain('bicorne');
  });
  it('estimates back pay once for saves from before the cap was lifted, and pays it once', () => {
    const dex = { [eel.id]: { count: 3000, best: 250 } };
    const old = { ...newSave(), level: FLAT_LEVEL, xp: 0, dex } as Partial<SaveData>;
    delete old.backPay;
    delete old.titles;
    const s = migrate(old);
    expect(s.backPay).toEqual({ xp: backPayXp(dex), paid: false, v: BACKPAY_VERSION });
    expect(s.titles).toContain('admiral');
    expect(s.owned).toContain('bicorne');
    // Later loads keep the first estimate, even after more catches.
    s.dex[eel.id].count += 500;
    expect(migrate(JSON.parse(JSON.stringify(s))).backPay).toEqual(s.backPay);
    const { levels } = eco.payBack(s);
    expect(levels).toBeGreaterThan(10);
    expect(s.level).toBe(FLAT_LEVEL + levels);
    expect(s.gifts).toEqual(eco.BACKPAY_GIFTS);
    expect(s.titles).toContain('fleetadmiral');
    expect(eco.payBack(s).levels).toBe(0);
  });
  it('redoes an unpaid estimate from an older version, less the XP earned past 50 since', () => {
    const dex = { [eel.id]: { count: 3000, best: 250 } };
    const s = migrate({ ...newSave(), level: FLAT_LEVEL + 2, xp: 100, dex, backPay: { xp: 7, paid: false } });
    expect(s.backPay).toEqual({ xp: backPayXp(dex, 2 * xpForNextLevel(FLAT_LEVEL) + 100), paid: false, v: BACKPAY_VERSION });
    // A paid one is never redone.
    expect(migrate({ ...newSave(), level: FLAT_LEVEL, dex, backPay: { xp: 7, paid: true } }).backPay).toEqual({ xp: 7, paid: true });
  });
  it('owes nothing to saves below 50 or new ones', () => {
    const old = { ...newSave(), level: 30 } as Partial<SaveData>;
    delete old.backPay;
    expect(migrate(old).backPay).toEqual({ xp: 0, paid: true });
    expect(newSave().backPay.paid).toBe(true);
  });
  it('survives a save with a broken Fishdex', () => {
    expect(migrate({ ...newSave(), level: 60, dex: null } as unknown as SaveData).dex).toEqual({});
  });
  it('drops a worn title the save does not have', () => {
    expect(migrate({ ...newSave(), level: 10, title: 'admiral' }).title).toBe(null);
    expect(migrate({ ...newSave(), level: 26, title: 'bosun' }).title).toBe('bosun');
  });
});

describe('the Deep Sea Rod', () => {
  const ready = () => {
    const s = newSave();
    s.level = 20;
    s.coins = 105_000;
    return s;
  };

  it('is bought once at level 20 for 100,000 coins, and goes nowhere in the bag', () => {
    const s = ready();
    s.level = 19;
    expect(eco.buySeaRod(s)).toBe(false);
    s.level = 20;
    s.coins = 99_999;
    expect(eco.buySeaRod(s)).toBe(false);
    s.coins = 105_000;
    const slots = JSON.stringify(s.slots);
    expect(eco.buySeaRod(s)).toBe(true);
    expect(s).toMatchObject({ seaRod: true, coins: 5_000 });
    expect(eco.ownsSeaRod(s)).toBe(true);
    expect(JSON.stringify(s.slots)).toBe(slots);
    expect(s.locker.rods).toEqual([]);
    expect(eco.buySeaRod(s)).toBe(false);
    expect(s.coins).toBe(5_000);
  });

  it('is needed by every player, Aurora Rod owners included', () => {
    const s = ready();
    s.locker.rods.push('aurora');
    eco.equipRod(s, 'aurora');
    expect(eco.ownsSeaRod(s)).toBe(false);
  });

  it('is always in hand at sea, whatever the hotbar holds, and needs no bait or free slot there', () => {
    const s = ready();
    s.slots[ROD_SLOT] = null;
    s.slots[1] = null;
    s.held = ROD_SLOT;
    expect(eco.canCastAt(s, true)).toBe('ok');
    expect(eco.canCastAt(s, false)).toBe('norod');
    s.held = 1;
    expect(eco.canCastAt(s, true)).toBe('ok');
  });
});

describe('rod levels', () => {
  const owner = () => {
    const s = newSave();
    s.level = 20;
    s.seaRod = true;
    return s;
  };

  it('costs 100 + 24N Black Pearls and 75k + 6k·N coins, the coins capped at 400k', () => {
    expect(eco.rodLevelCost(1)).toEqual({ coins: 81_000, pearls: 124 });
    expect(eco.rodLevelCost(10)).toEqual({ coins: 135_000, pearls: 340 });
    expect(eco.rodLevelCost(40)).toEqual({ coins: 315_000, pearls: 1060 });
    expect(eco.rodLevelCost(60)).toEqual({ coins: 400_000, pearls: 1540 });
  });

  it('levels the Deep Sea Rod for coins and pearls, and coins alone are never enough', () => {
    const s = owner();
    s.coins = 10_000_000;
    expect(eco.levelRod(s)).toBe(false);
    s.pearls = 124;
    expect(eco.levelRod(s)).toBe(true);
    expect(s).toMatchObject({ rodLevel: 1, pearls: 0, coins: 10_000_000 - 81_000 });
    s.pearls = 147;
    expect(eco.levelRod(s)).toBe(false);
    s.coins = 86_999;
    s.pearls = 1000;
    expect(eco.levelRod(s)).toBe(false);
    expect(s.rodLevel).toBe(1);
  });

  it('needs the Deep Sea Rod: the Aurora Rod no longer levels', () => {
    const s = newSave();
    Object.assign(s, { level: 20, coins: 1e6, pearls: 1000 });
    s.locker.rods.push('aurora');
    eco.equipRod(s, 'aurora');
    expect(eco.levelRod(s)).toBe(false);
    expect(s.rodLevel).toBe(0);
    expect(eco.rodPlus(s, 'aurora')).toBe('');
  });

  it('counts at sea once the Deep Sea Rod is bought, levels from the Aurora Rod included, and shows in its name', () => {
    const s = newSave();
    s.rodLevel = 7;
    expect(eco.seaRodLevel(s)).toBe(0);
    s.seaRod = true;
    expect(eco.seaRodLevel(s)).toBe(7);
    expect(eco.seaRodName(s)).toBe('Deep Sea Rod +7');
    expect(eco.seaRodName(s, true)).toBe('Sea Rod +7');
    expect(eco.rodPlus(s, 'searod')).toBe(' +7');
    expect(eco.rodPlus(s, 'carbon')).toBe('');
    expect(eco.seaRodName(newSave())).toBe('Deep Sea Rod');
  });

  it('starts at 0 on old saves and cleans bad values', () => {
    const old = newSave() as Partial<SaveData>;
    delete old.pearls;
    delete old.rodLevel;
    delete old.seaRod;
    expect(migrate(old)).toMatchObject({ pearls: 0, rodLevel: 0, seaRod: false });
    expect(migrate({ ...newSave(), pearls: -5, rodLevel: 'x', seaRod: 'yes' })).toMatchObject({ pearls: 0, rodLevel: 0, seaRod: false });
    expect(migrate({ ...newSave(), pearls: 41.7, rodLevel: 12, seaRod: true })).toMatchObject({ pearls: 41, rodLevel: 12, seaRod: true });
  });
});

describe('the Deep Sea Line', () => {
  const owner = () => {
    const s = newSave();
    s.level = 20;
    s.line = 'moonsilk';
    s.seaRod = true;
    return s;
  };

  it("costs the rod's pearls and half its coins: 100 + 24N Black Pearls and 37.5k + 3k·N coins, capped at 200k", () => {
    expect(eco.seaLineCost(1)).toEqual({ coins: 40_500, pearls: 124 });
    expect(eco.seaLineCost(10)).toEqual({ coins: 67_500, pearls: 340 });
    for (const n of [1, 5, 20, 40, 60]) {
      expect(eco.seaLineCost(n).pearls).toBe(eco.rodLevelCost(n).pearls);
      expect(eco.seaLineCost(n).coins).toBe(eco.rodLevelCost(n).coins / 2);
    }
  });

  it('levels for coins and pearls with the Deep Sea Rod, and coins alone are never enough', () => {
    const none = newSave();
    Object.assign(none, { coins: 1e6, pearls: 1000 });
    none.locker.rods.push('aurora');
    expect(eco.levelSeaLine(none)).toBe(false);
    const s = owner();
    s.coins = 10_000_000;
    expect(eco.levelSeaLine(s)).toBe(false);
    s.pearls = 124;
    expect(eco.levelSeaLine(s)).toBe(true);
    expect(s).toMatchObject({ seaLine: 1, pearls: 0, coins: 10_000_000 - 40_500 });
    s.pearls = 147;
    expect(eco.levelSeaLine(s)).toBe(false);
    expect(s.seaLine).toBe(1);
  });

  it('eases sea fights on both tracks', () => {
    const s = owner();
    expect(eco.seaGear(s)).toEqual({ rod: 0, line: 0 });
    Object.assign(s, { rodLevel: 3, seaLine: 5 });
    expect(eco.seaGear(s)).toEqual({ rod: 3, line: 5 });
  });

  it('is sea only: the pond keeps its own line, and pond lines stay for sale', () => {
    const s = owner();
    s.seaLine = 4;
    expect(eco.lineOf(s).id).toBe('moonsilk');
    expect(eco.lineName(s)).toBe('Moonsilk Line');
    expect(eco.seaLineName(s)).toBe('Deep Sea Line +4');
    expect(eco.seaLineName(newSave())).toBe('Deep Sea Line');
    s.line = 'braid';
    s.coins = 1e6;
    expect(eco.lineBeaten(s, byId(LINES, 'moonsilk'))).toBe(false);
    expect(eco.buyLine(s, 'moonsilk')).toBe(true);
    expect(s.line).toBe('moonsilk');
  });

  it('gives Moonsilk to saves from before the Deep Sea Rod that had it spooled over a lighter pond line, once', () => {
    const old = { ...newSave(), line: 'braid', seaLine: 3 } as Partial<SaveData>;
    delete old.seaRod;
    expect(migrate(old).line).toBe('moonsilk');
    const unlevelled = { ...old, seaLine: 0 };
    expect(migrate(unlevelled).line).toBe('braid');
    // A save made since keeps its line: the Deep Sea Line never held the pond for it.
    expect(migrate({ ...newSave(), line: 'braid', seaLine: 3 }).line).toBe('braid');
  });

  it('starts at 0 on old saves and cleans bad values', () => {
    const old = newSave() as Partial<SaveData>;
    delete old.seaLine;
    expect(migrate(old).seaLine).toBe(0);
    expect(migrate({ ...newSave(), seaLine: -2 }).seaLine).toBe(0);
    expect(migrate({ ...newSave(), seaLine: 6.5 }).seaLine).toBe(6);
  });
});

describe('pearl box', () => {
  it('shows from the first pearl earned, even once they are all spent', () => {
    const s = newSave();
    expect(eco.showPearlBox(s)).toBe(false);
    expect(eco.showPearlBox({ ...s, slots: [rod('aurora'), ...s.slots.slice(1)] })).toBe(false);
    expect(eco.showPearlBox({ ...s, pearls: 1 })).toBe(true);
    expect(eco.showPearlBox({ ...s, pearls: 0, rodLevel: 2 })).toBe(true);
    expect(eco.showPearlBox({ ...s, pearls: 0, seaLine: 1 })).toBe(true);
  });
});
