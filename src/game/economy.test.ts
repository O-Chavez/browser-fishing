import { describe, expect, it } from 'vitest';
import * as eco from './economy';
import { SLOT_COUNT, migrate, newSave, type SaveData } from './state';
import { FISH, byId } from '../data/content';
import { FLAT_LEVEL, backPayXp, xpForNextLevel } from './progression';
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
  it('keeps levelling past 50 and banks the gifts', () => {
    const s = newSave();
    s.level = FLAT_LEVEL + 4;
    s.xp = xpForNextLevel(FLAT_LEVEL) - 1;
    eco.applyCatch(s, eel, 250);
    expect(s.level).toBe(FLAT_LEVEL + 5);
    expect(s.gifts).toEqual({ provisions: 1, fares: 1 });
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
    expect(s.backPay).toEqual({ xp: backPayXp(dex), paid: false });
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
