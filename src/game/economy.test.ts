import { describe, expect, it } from 'vitest';
import * as eco from './economy';
import { ROD_SLOT, SEA_VERSION, SLOT_COUNT, migrate, newSave, type SaveData } from './state';
import { BAITS, FISH, LINES, byId } from '../data/content';
import { GLOVES_CONTROL } from '../data/casino';
import { mulberry } from './env';
import { ZONES } from '../data/dive';
import { FIGHT_DT, P, Reel, type ReelTune } from './reel';
import { BACKPAY_VERSION, FISH_SPREAD, FLAT_LEVEL, TAG_TIERS, backPayXp, sellValue, xpForNextLevel } from './progression';
import { Drops } from './drops';
import { ABYSSAL, COSMETICS, COS_SLOTS, cleanLook, cosById, isFace, legendPieces } from '../data/cosmetics';

const fishSlot = (size = 20) => ({ k: 'fish' as const, fishId: FISH[0].id, size });
/** Distinct fish that survive the size clamp in `migrate`. */
const fish = (i: number) => ({ k: 'fish' as const, fishId: FISH[0].id, size: 5 + i / 4 });
const rod = (id: string) => ({ k: 'rod' as const, id });
const bait = (id: 'worm' | 'fly' | 'minnow' | 'pearl', n: number) => ({ k: 'bait' as const, id, n });

describe('best catch', () => {
  it('keeps only the most valuable fish caught', () => {
    const s = newSave();
    const cheap = FISH[0];
    // The dearest lake fish: a sea fish would be the charters' record (`bestSea`), not this one.
    const dear = FISH.filter((f) => !f.sea).at(-1)!;
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

  it('sells bait in packs of 5 or 25 at the same price per bait, and nothing else', () => {
    const s = newSave();
    s.coins = 999;
    const worm = byId(BAITS, 'worm');
    const before = s.coins;
    expect(eco.buyBait(s, 'worm', 25)).toBe(true);
    expect(before - s.coins).toBe(worm.price * 25);
    expect(eco.baitCount(s, 'worm')).toBe(40);
    for (const n of [0, 1, 10, 26, 100, -5, 5.5, NaN]) expect(eco.buyBait(s, 'worm', n)).toBe(false);
    expect(eco.baitCount(s, 'worm')).toBe(40);
  });

  it('refuses a pack of 25 when it cannot be paid for or would pass the locker cap', () => {
    const s = newSave();
    s.coins = 0;
    expect(eco.buyBait(s, 'worm', 25)).toBe(false);
    s.coins = 99_999;
    s.locker.bait.worm = eco.LOCKER_CAP - 24;
    const coins = s.coins;
    expect(eco.buyBait(s, 'worm', 25)).toBe(false);
    expect(s.coins).toBe(coins);
    expect(eco.buyBait(s, 'worm', 5)).toBe(true);
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

  it('starts saves from before emotes with none bought, and keeps only known bought ones', () => {
    const old = structuredClone(newSave()) as Partial<SaveData>;
    delete old.emotes;
    expect(migrate(old).emotes).toEqual([]);
    // The base four are everyone's and never listed; made-up ids, repeats and junk go.
    const messy = { ...newSave(), emotes: ['kelp', 'wave', 'kelp', 'nope', 7, null, 'master', 'constructor'] } as unknown as SaveData;
    expect(migrate(messy).emotes).toEqual(['kelp', 'master']);
    for (const bad of ['kelp', 3, null, { 0: 'kelp', length: 1 }]) expect(migrate({ ...newSave(), emotes: bad } as unknown as SaveData).emotes).toEqual([]);
    const s = { ...newSave(), emotes: ['twilight', 'abyss'] };
    expect(migrate(structuredClone(s))).toEqual(s);
    expect(newSave().emotes).toEqual([]);
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
    expect(eco.rollSeaCast(s, 1, 0, eco.seaRod(s), mulberry(1)).tune).toEqual(eco.fightTune(s));
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

  it('a sea fish lost too much for the Deep Sea Rod is seen once; one the rod handles is not', () => {
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
    // Pets come only from the sea legends.
    expect(COSMETICS.filter((c) => c.slot === 'pet').every((c) => c.shop === 'legend')).toBe(true);
    for (const slot of COS_SLOTS.filter((x) => x !== 'pet')) {
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

describe("a sea legend's set", () => {
  const kraken = byId(FISH, 'kraken');
  const leviathan = byId(FISH, 'leviathan');
  const grouper = byId(FISH, 'grouper');
  const land = (s: SaveData, f = kraken, shiny = false, tag: 'feisty' | null = null) => eco.applyCatch(s, f, f.minSize, shiny, false, true, tag).legendPiece;
  const piece = (id: string) => cosById(id)!;

  it('unlocks the next piece on each landing, in order, then just counts, and gives nothing', () => {
    const s = newSave();
    expect(land(s)).toEqual({ id: 'krakencrown', landing: 1, of: 3 });
    // A shiny or tagged Kraken counts the same.
    expect(land(s, kraken, true)).toEqual({ id: 'krakenarmor', landing: 2, of: 3 });
    expect(land(s, kraken, false, 'feisty')).toEqual({ id: 'krakenbeak', landing: 3, of: 3 });
    expect(land(s)).toEqual({ id: 'krakenpet', landing: 4, of: 3 });
    expect(land(s)).toBeUndefined();
    expect(s.legends).toEqual({ kraken: 5 });
    expect(s.owned).toEqual([]);
    expect(['krakencrown', 'krakenarmor', 'krakenbeak', 'krakenpet'].every((id) => eco.legendUnlocked(s, piece(id)))).toBe(true);
  });

  it('unlocks only by landings, and says nothing for a piece already owned', () => {
    const s = newSave();
    expect(eco.legendUnlocked(s, piece('krakencrown'))).toBe(false);
    expect(eco.legendUnlocked(s, piece('crown'))).toBe(false);
    s.legends = { kraken: 2 };
    expect(eco.legendUnlocked(s, piece('krakenarmor'))).toBe(true);
    expect(eco.legendUnlocked(s, piece('krakenbeak'))).toBe(false);
    s.owned = ['krakenbeak'];
    expect(land(s)).toBeUndefined();
    expect(s.legends.kraken).toBe(3);
  });

  it('counts every sea legend, set or not, and nothing else', () => {
    const s = newSave();
    // The Shelf's legend has no set yet: its landings only count.
    expect(land(s, grouper)).toBeUndefined();
    expect(land(s, leviathan)?.id).toBe('leviathanjaw');
    eco.applyCatch(s, byId(FISH, 'krakenspawn'), 300, false, false, true);
    eco.applyCatch(s, FISH[0], FISH[0].minSize);
    const top = FISH.find((f) => f.tier === 5 && !f.sea)!;
    eco.applyCatch(s, top, top.minSize);
    expect(s.legends).toEqual({ grouper: 1, leviathan: 1 });
  });

  it('starts fresh for saves from before it, whatever the Fishdex says, and keeps only sane counts', () => {
    const old = { ...newSave(), dex: { kraken: { count: 7, best: 1200 } } } as Partial<SaveData>;
    delete old.legends;
    const s = migrate(old);
    expect(s.legends).toEqual({});
    expect(s.dex.kraken.count).toBe(7);
    expect(land(s)?.id).toBe('krakencrown');
    const odd = migrate({ ...newSave(), legends: { kraken: 2.7, leviathan: -1, minnow: 3, nope: 4, dreamer: 'x' } as never });
    expect(odd.legends).toEqual({ kraken: 2 });
    expect(migrate({ ...newSave(), legends: null as never }).legends).toEqual({});
  });

  it('says how many landings a piece still takes', () => {
    const s = newSave();
    expect(eco.legendLandingsLeft(s, 'krakencrown')).toBe(1);
    expect(eco.legendLandingsLeft(s, 'krakenpet')).toBe(4);
    expect(eco.landingsText(s, piece('krakencrown'))).toBe('Land the Kraken once');
    expect(eco.landingsText(s, piece('krakenpet'))).toBe('Land the Kraken 4 times');
    land(s);
    expect(eco.legendLandingsLeft(s, 'krakencrown')).toBe(0);
    expect(eco.legendLandingsLeft(s, 'krakenbeak')).toBe(2);
    expect(eco.landingsText(s, piece('krakenarmor'))).toBe('Land the Kraken once more');
    expect(eco.landingsText(s, piece('krakenbeak'))).toBe('Land the Kraken 2 more times');
    expect(eco.legendLandingsLeft(s, 'crown')).toBe(0);
  });

  it("is sold only by Captain Reed, once unlocked, for coins, and only once", () => {
    const s = newSave();
    s.coins = 1e9;
    s.chips = 1e9;
    // Never at the stall or the prize counter.
    for (const at of ['stall', 'casino', 'earned', 'legend'] as const) expect(eco.buyCosmetic(s, 'krakencrown', at)).toBe(false);
    expect(eco.reedBuyError(s, 'krakencrown')).toBe('Land the Kraken once to unlock the Kraken Crown.');
    expect(eco.buyReedPiece(s, 'krakencrown')).toBe(false);
    expect(eco.reedBuyError(s, 'crown')).toBe('Captain Reed has nothing like that.');
    expect(eco.reedBuyError(s, 'bogus')).toBe('Captain Reed has nothing like that.');
    s.legends = { kraken: 1 };
    s.coins = 2_999_999;
    expect(eco.reedBuyError(s, 'krakencrown')).toBe('The Kraken Crown costs 3,000,000 coins.');
    expect(eco.buyReedPiece(s, 'krakencrown')).toBe(false);
    expect(eco.reedBuyError(s, 'krakenarmor')).toBe('Land the Kraken once more to unlock the Kraken Armor.');
    s.coins = 3_000_100;
    expect(eco.buyReedPiece(s, 'krakencrown')).toBe(true);
    expect(s.coins).toBe(100);
    expect(s.owned).toEqual(['krakencrown']);
    s.coins = 1e9;
    expect(eco.reedBuyError(s, 'krakencrown')).toBe('You already have the Kraken Crown.');
    expect(eco.buyReedPiece(s, 'krakencrown')).toBe(false);
    expect(s.coins).toBe(1e9);
    expect([3_000_000, 4_000_000, 2_500_000, 5_000_000]).toEqual(['krakencrown', 'krakenarmor', 'krakenbeak', 'krakenpet'].map((id) => piece(id).price));
  });

  it("shows every set at Reed's, as silhouettes until its zone is open or it has been landed", () => {
    const s = newSave();
    // The sets by zone, a zone's own set before its legends' (the Abyss: Leviathan, Dreamer, Kraken), each in
    // milestone or landing order.
    expect(eco.reedCosmetics().map((c) => c.id)).toEqual([
      'kelpcap', 'kelpwrap', 'holdfast',
      'anemonecrown', 'drifttunic', 'jellylocket',
      'leviathanjaw', 'leviathancoil', 'leviathanfangs', 'leviathanpet',
      'dreamercap', 'dreamerrobe', 'dreamcatcher', 'dreamerpet',
      'krakencrown', 'krakenarmor', 'krakenbeak', 'krakenpet',
    ]);
    // Only Reed's counters: nothing from the stall, the casino or the ranks.
    expect(eco.reedCosmetics().every((c) => eco.REED_SHOPS.includes(c.shop))).toBe(true);
    // A new player sees every piece, none reached yet.
    expect(eco.legendSetReached(s, 'kraken')).toBe(false);
    expect(eco.reedCosmetics().map((c) => eco.reedOffer(s, c))).toEqual(Array(18).fill('unseen'));
    // Landing a legend reaches its set before the zone is open (a dev command or an old save), but only its own.
    const early = { ...newSave(), legends: { kraken: 1 } };
    expect(eco.legendSetReached(early, 'kraken')).toBe(true);
    expect(eco.reedOffer(early, piece('krakencrown'))).toBe('sale');
    expect(eco.reedOffer(early, piece('leviathanjaw'))).toBe('unseen');
    // Opening the Abyss reaches all three.
    s.boatParts = 4;
    expect(eco.reedCosmetics().map((c) => eco.reedOffer(s, c))).toEqual(Array(18).fill('locked'));
    s.legends = { kraken: 2 };
    s.owned = ['krakencrown'];
    expect(['krakencrown', 'krakenarmor', 'krakenbeak'].map((id) => eco.reedOffer(s, piece(id)))).toEqual(['owned', 'sale', 'locked']);
  });

  it('wears its pet only when owned, in the pet slot', () => {
    const s = newSave();
    expect(eco.equipCosmetic(s, 'pet', 'krakenpet')).toBe(false);
    s.owned.push('krakenpet');
    expect(eco.equipCosmetic(s, 'hat', 'krakenpet')).toBe(false);
    expect(eco.equipCosmetic(s, 'pet', 'krakenpet')).toBe(true);
    expect(s.look.pet).toBe('krakenpet');
    expect(eco.equipCosmetic(s, 'pet', null)).toBe(true);
    expect(s.look.pet).toBeNull();
  });

  it('keeps an owned pet on a cleaned look and drops one not owned', () => {
    const look = { ...newSave().look, pet: 'krakenpet' };
    expect(cleanLook(look, ['krakenpet']).pet).toBe('krakenpet');
    expect(cleanLook(look, []).pet).toBeNull();
    expect(cleanLook({ ...look, pet: 'krakencrown' }, ['krakencrown']).pet).toBeNull();
    expect(migrate({ ...newSave(), owned: ['krakenpet'], look }).look.pet).toBe('krakenpet');
    expect(migrate({ ...newSave(), look }).look.pet).toBeNull();
  });
});

describe("a sea zone's set", () => {
  const KELP = 2;
  const TWILIGHT = 3;
  const piece = (id: string) => cosById(id)!;
  /** A charter landing: sold on the spot, so the hotbar never fills. */
  const land = (s: SaveData, id = 'frondback') => eco.applyCatch(s, byId(FISH, id), byId(FISH, id).minSize, false, false, true);
  /** A save with `n` fish landed in a zone, all of its first plain fish. */
  const withFish = (zone: number, n: number, s = newSave()): SaveData => {
    s.dex[ZONES[zone].fish[0]] = { count: n, best: 100 };
    return s;
  };

  it('lives in exactly one zone for every sea species, and every sea species is in a zone', () => {
    // A fish added to two zones would count toward both zones' sets: this pins that it can't.
    const all = ZONES.flatMap((_, z) => eco.zoneSpecies(z));
    expect(new Set(all).size).toBe(all.length);
    expect(FISH.filter((f) => f.sea).map((f) => f.id).sort()).toEqual([...all].sort());
    for (const id of all) expect(eco.zoneSpecies(eco.zoneOfFish(id))).toContain(id);
    expect(eco.zoneOfFish(FISH.find((f) => !f.sea)!.id)).toBe(-1);
  });

  it("counts a zone's landings from the Fishdex: its fish and its legends, nobody else's", () => {
    const s = newSave();
    expect(eco.zoneLanded(s, KELP)).toBe(0);
    s.dex = { frondback: { count: 3, best: 1 }, lionfish: { count: 2, best: 1 }, kelpbeard: { count: 1, best: 1 }, hatchet: { count: 9, best: 1 }, [FISH[0].id]: { count: 50, best: 1 } };
    expect(eco.zoneLanded(s, KELP)).toBe(6);
    expect(eco.zoneLanded(s, TWILIGHT)).toBe(9);
    expect(eco.zoneLanded(s, 99)).toBe(0);
  });

  it('counts every sea landing in the Fishdex, on a charter as on the pond', () => {
    const s = newSave();
    land(s);
    land(s, 'wolfeel');
    // A legend counts toward its zone too.
    land(s, 'kelpbeard');
    eco.applyCatch(s, FISH[0], FISH[0].minSize);
    expect(eco.zoneLanded(s, KELP)).toBe(3);
    expect(s.dex.frondback.count).toBe(1);
  });

  it('unlocks each piece at its milestone of fish landed in its zone', () => {
    expect(eco.zonePieces(KELP).map((c) => [c.id, c.zoneFish])).toEqual([['kelpcap', 30], ['kelpwrap', 60], ['holdfast', 100]]);
    expect(eco.zonePieces(TWILIGHT).map((c) => [c.id, c.zoneFish])).toEqual([['anemonecrown', 100], ['drifttunic', 200], ['jellylocket', 300]]);
    expect(eco.zoneUnlocked(withFish(KELP, 29), piece('kelpcap'))).toBe(false);
    expect(eco.zoneUnlocked(withFish(KELP, 30), piece('kelpcap'))).toBe(true);
    expect(eco.zoneUnlocked(withFish(KELP, 59), piece('kelpwrap'))).toBe(false);
    expect(eco.zoneUnlocked(withFish(KELP, 60), piece('kelpwrap'))).toBe(true);
    expect(eco.zoneUnlocked(withFish(KELP, 99), piece('holdfast'))).toBe(false);
    expect(eco.zoneUnlocked(withFish(KELP, 100), piece('holdfast'))).toBe(true);
    // Fish from another zone never count.
    expect(eco.zoneUnlocked(withFish(TWILIGHT, 500), piece('kelpcap'))).toBe(false);
    expect(eco.zoneUnlocked(withFish(KELP, 999), piece('krakencrown'))).toBe(false);
    expect(eco.reedUnlocked(withFish(KELP, 30), piece('kelpcap'))).toBe(true);
    expect(eco.reedUnlocked({ ...newSave(), legends: { kraken: 1 } }, piece('krakencrown'))).toBe(true);
  });

  it('says how many fish a piece still takes, and where', () => {
    expect(eco.zoneFishText(newSave(), piece('kelpcap'))).toBe('Land 30 fish in Kelp Deep');
    expect(eco.zoneFishText(withFish(KELP, 57), piece('kelpwrap'))).toBe('Land 3 more fish in Kelp Deep');
    expect(eco.zoneFishText(withFish(TWILIGHT, 199), piece('drifttunic'))).toBe('Land 1 more fish in the Twilight');
    expect(eco.zoneFishLeft(withFish(KELP, 57), piece('kelpcap'))).toBe(0);
    expect(eco.zoneFishLeft(newSave(), piece('krakencrown'))).toBe(0);
    expect(eco.reedUnlockText(withFish(KELP, 57), piece('kelpwrap'))).toBe('Land 3 more fish in Kelp Deep');
    expect(eco.reedUnlockText(newSave(), piece('krakencrown'))).toBe('Land the Kraken once');
  });

  it("gives the bar at Reed's the count, the next piece and every milestone", () => {
    expect(eco.zoneSetProgress(withFish(KELP, 57), KELP)).toEqual({ landed: 57, next: piece('kelpwrap'), marks: [30, 60, 100] });
    expect(eco.zoneSetProgress(newSave(), KELP).next?.id).toBe('kelpcap');
    expect(eco.zoneSetProgress(withFish(KELP, 100), KELP).next).toBeUndefined();
    expect(eco.zoneSetProgress(withFish(KELP, 101), KELP).next).toBeUndefined();
  });

  it('is silhouetted until its zone is open, then locked, on sale and owned', () => {
    const s = newSave();
    s.boatParts = 1;
    expect(eco.zoneSetReached(s, KELP)).toBe(false);
    expect(['kelpcap', 'kelpwrap', 'holdfast'].map((id) => eco.reedOffer(s, piece(id)))).toEqual(['unseen', 'unseen', 'unseen']);
    // The boat part for Kelp Deep reaches its set, not the Twilight's.
    s.boatParts = KELP;
    expect(eco.zoneSetReached(s, KELP)).toBe(true);
    expect(eco.reedOffer(s, piece('anemonecrown'))).toBe('unseen');
    expect(['kelpcap', 'kelpwrap', 'holdfast'].map((id) => eco.reedOffer(s, piece(id)))).toEqual(['locked', 'locked', 'locked']);
    withFish(KELP, 60, s);
    s.owned = ['kelpcap'];
    expect(['kelpcap', 'kelpwrap', 'holdfast'].map((id) => eco.reedOffer(s, piece(id)))).toEqual(['owned', 'sale', 'locked']);
    // A fish landed in a zone not open yet (a dev charter or an old save) reaches its set too, like a legend's landing.
    const early = withFish(TWILIGHT, 1);
    expect(eco.zoneSetReached(early, TWILIGHT)).toBe(true);
    expect(eco.reedOffer(early, piece('anemonecrown'))).toBe('locked');
    expect(eco.reedOffer(early, piece('kelpcap'))).toBe('unseen');
  });

  it('is sold only by Captain Reed, once unlocked, for coins, and only once', () => {
    const s = newSave();
    s.coins = 1e9;
    s.chips = 1e9;
    s.boatParts = 4;
    for (const at of ['stall', 'casino', 'earned', 'legend', 'zone'] as const) expect(eco.buyCosmetic(s, 'kelpcap', at)).toBe(false);
    withFish(KELP, 30, s);
    for (const at of ['stall', 'casino', 'earned', 'legend', 'zone'] as const) expect(eco.buyCosmetic(s, 'kelpcap', at)).toBe(false);
    withFish(KELP, 29, s);
    expect(eco.reedBuyError(s, 'kelpcap')).toBe('Land 1 more fish in Kelp Deep to unlock the Kelp Cap.');
    expect(eco.buyReedPiece(s, 'kelpcap')).toBe(false);
    withFish(KELP, 30, s);
    s.coins = 149_999;
    expect(eco.reedBuyError(s, 'kelpcap')).toBe('The Kelp Cap costs 150,000 coins.');
    expect(eco.buyReedPiece(s, 'kelpcap')).toBe(false);
    expect(eco.reedBuyError(s, 'kelpwrap')).toBe('Land 30 more fish in Kelp Deep to unlock the Kelp Wrap.');
    s.coins = 150_100;
    expect(eco.buyReedPiece(s, 'kelpcap')).toBe(true);
    expect(s.coins).toBe(100);
    expect(s.owned).toEqual(['kelpcap']);
    s.coins = 1e9;
    expect(eco.reedBuyError(s, 'kelpcap')).toBe('You already have the Kelp Cap.');
    expect(eco.buyReedPiece(s, 'kelpcap')).toBe(false);
    expect(eco.equipCosmetic(s, 'hat', 'kelpcap')).toBe(true);
    expect([...eco.zonePieces(KELP), ...eco.zonePieces(TWILIGHT)].map((c) => c.price)).toEqual([150_000, 200_000, 100_000, 1_000_000, 1_250_000, 750_000]);
  });

  it('says once, on the landing that reaches it, that a piece is unlocked', () => {
    const s = withFish(KELP, 28);
    expect(land(s).zonePiece).toBeUndefined();
    expect(land(s).zonePiece).toEqual({ id: 'kelpcap', zone: KELP, fish: 30 });
    expect(land(s).zonePiece).toBeUndefined();
    // A legend's landing counts toward its zone too, and can reach a milestone with its own piece.
    s.dex.frondback.count = 59;
    expect(land(s, 'kelpbeard').zonePiece).toEqual({ id: 'kelpwrap', zone: KELP, fish: 60 });
    // Owned already (bought after a dev reset): nothing to say.
    s.dex.frondback.count = 98;
    s.owned = ['holdfast'];
    expect(land(s).zonePiece).toBeUndefined();
    expect(land(s).zonePiece).toBeUndefined();
    // Zones with no set, and the pond, never say anything.
    const t = withFish(0, 99);
    expect(land(t, 'pewtercod').zonePiece).toBeUndefined();
    expect(eco.applyCatch(t, FISH[0], FISH[0].minSize).zonePiece).toBeUndefined();
  });
});

describe('every sea legend with a set', () => {
  const SETS = [
    { legend: 'kraken', ids: ['krakencrown', 'krakenarmor', 'krakenbeak', 'krakenpet'] },
    { legend: 'leviathan', ids: ['leviathanjaw', 'leviathancoil', 'leviathanfangs', 'leviathanpet'] },
    { legend: 'dreamer', ids: ['dreamercap', 'dreamerrobe', 'dreamcatcher', 'dreamerpet'] },
  ];
  const ABYSS_PRICES = [3_000_000, 4_000_000, 2_500_000, 5_000_000];
  const abyss = ZONES.find((z) => z.id === 'abyss')!;

  it('lists exactly the sets above, all from sea legends', () => {
    const legends = [...new Set(COSMETICS.filter((c) => c.shop === 'legend').map((c) => c.legend))];
    expect(legends.sort()).toEqual(SETS.map((x) => x.legend).sort());
    for (const l of legends) expect(FISH.find((f) => f.id === l)).toMatchObject({ sea: true, legend: true });
  });

  it.each(SETS)("has the $legend's hat, shirt, jewelry and pet at landings 1 to 4, Abyssal and priced like the Kraken's", ({ legend, ids }) => {
    const set = legendPieces(legend);
    expect(set.map((c) => c.id)).toEqual(ids);
    expect(set.map((c) => [c.slot, c.landing])).toEqual([['hat', 1], ['shirt', 2], ['jewelry', 3], ['pet', 4]]);
    expect(set.every((c) => c.shop === 'legend')).toBe(true);
    if (abyss.legends.includes(legend)) {
      expect(set.every((c) => c.tier === ABYSSAL)).toBe(true);
      expect(set.map((c) => c.price)).toEqual(ABYSS_PRICES);
    }
  });

  it.each(SETS)('unlocks the $legend\'s pieces landing by landing, then Reed sells them', ({ legend, ids }) => {
    const s = newSave();
    const f = byId(FISH, legend);
    const got = ids.map(() => eco.applyCatch(s, f, f.minSize, false, false, true).legendPiece);
    expect(got).toEqual(ids.map((id, i) => ({ id, landing: i + 1, of: 3 })));
    expect(s.owned).toEqual([]);
    s.coins = ABYSS_PRICES.reduce((a, b) => a + b);
    for (const id of ids) expect(eco.buyReedPiece(s, id)).toBe(true);
    expect(s.owned).toEqual(ids);
    expect(s.coins).toBe(0);
    expect(eco.equipCosmetic(s, 'pet', ids[3])).toBe(true);
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

describe('rod steps and Abyss levels', () => {
  const owner = (o: Partial<SaveData> = {}) => Object.assign(newSave(), { level: 20, seaRod: true, coins: 0 }, o);

  it("sells a zone's two steps once the zone is open, for coins only", () => {
    const s = owner({ coins: 10_000_000, pearls: 100_000 });
    // Step 1 is the Drop-off's: not on sale with the Shelf alone.
    expect(eco.rodBuyError(s)).toMatch(/Storm sail/);
    expect(eco.buyRodStep(s)).toBe(false);
    s.boatParts = 1;
    expect(eco.buyRodStep(s)).toBe(true);
    expect(eco.buyRodStep(s)).toBe(true);
    expect(s).toMatchObject({ rodStep: 2, coins: 10_000_000 - 160_000, pearls: 100_000 });
    // Step 3 waits for Kelp Deep.
    expect(eco.buyRodStep(s)).toBe(false);
    expect(eco.rodBuyError(s)).toMatch(/Kelp cutter/);
    s.boatParts = 2;
    expect(eco.buyRodStep(s)).toBe(true);
    expect(s).toMatchObject({ rodStep: 3, coins: 10_000_000 - 360_000 });
  });

  it('refuses a step without the coins or the Deep Sea Rod', () => {
    const s = owner({ boatParts: 4, coins: 49_999 });
    expect(eco.buyRodStep(s)).toBe(false);
    expect(eco.rodBuyError(s)).toMatch(/50,000/);
    s.coins = 50_000;
    expect(eco.buyRodStep(s)).toBe(true);
    expect(s).toMatchObject({ rodStep: 1, coins: 0 });
    const none = Object.assign(newSave(), { level: 20, coins: 1e7, boatParts: 4 });
    expect(eco.buyRodStep(none)).toBe(false);
    expect(none.rodStep).toBe(0);
  });

  it('sells Abyss levels only after the eighth step, endlessly, each 12% dearer', () => {
    const s = owner({ boatParts: 4, rodStep: 7, coins: 100_000_000 });
    expect(eco.buyAbyssLevel(s)).toBe(false);
    expect(eco.buyRodStep(s)).toBe(true);
    expect(eco.buyRodStep(s)).toBe(false);
    expect(s.rodStep).toBe(8);
    const before = s.coins;
    expect(eco.buyAbyssLevel(s)).toBe(true);
    expect(eco.buyAbyssLevel(s)).toBe(true);
    expect(s).toMatchObject({ abyssLevels: 2, coins: before - 2_625_000 - 2_940_000 });
    s.coins = 3_292_999;
    expect(eco.buyAbyssLevel(s)).toBe(false);
    expect(s.abyssLevels).toBe(2);
  });

  it('is what a charter fishes with, and shows in the rod\'s name', () => {
    const s = owner({ rodStep: 5 });
    expect(eco.seaRod(s)).toEqual({ steps: 5, levels: 0 });
    expect(eco.seaRodName(s)).toBe('Deep Sea Rod step 5');
    expect(eco.seaRodName({ rodStep: 8, abyssLevels: 3 })).toBe('Deep Sea Rod Abyss level 3');
    expect(eco.seaRodName(s, true)).toBe('Sea Rod step 5');
    expect(eco.seaRodName(newSave())).toBe('Deep Sea Rod');
    // Without the rod, no steps count.
    expect(eco.seaRod({ ...s, seaRod: false })).toEqual({ steps: 0, levels: 0 });
  });

  it("glows a new colour every two steps, then every five Abyss levels (none on a pond rod)", () => {
    const g = (rodStep: number, abyssLevels = 0) => eco.seaRodGlow(owner({ rodStep, abyssLevels }));
    expect([0, 1, 2, 3, 4, 6, 8].map((n) => g(n))).toEqual([0, 0, 1, 1, 2, 3, 4]);
    expect(g(8, 5)).toBe(5);
    expect(eco.seaRodGlow(owner({ rodStep: 8 }), 'aurora')).toBe(0);
  });
});

describe('the hold', () => {
  const owner = (o: Partial<SaveData> = {}) => Object.assign(newSave(), { level: 20, seaRod: true, coins: 0 }, o);

  it('sells its levels one at a time, in order, each once its zone is open, for coins', () => {
    const s = owner({ coins: 20_000_000 });
    expect(s.holdLevel).toBe(0);
    // Level 1 is the Drop-off's: not on sale with the Shelf alone.
    expect(eco.holdBuyError(s)).toBe('Hold level 1 goes on sale once the Storm sail opens its zone.');
    expect(eco.buyHoldLevel(s)).toBe(false);
    s.boatParts = 1;
    expect(eco.buyHoldLevel(s)).toBe(true);
    expect(s).toMatchObject({ holdLevel: 1, coins: 20_000_000 - 25_000 });
    // Level 2 waits for Kelp Deep.
    expect(eco.buyHoldLevel(s)).toBe(false);
    expect(eco.holdBuyError(s)).toMatch(/Kelp cutter/);
    s.boatParts = 4;
    for (const n of [2, 3, 4]) {
      expect(eco.buyHoldLevel(s)).toBe(true);
      expect(s.holdLevel).toBe(n);
    }
    expect(s.coins).toBe(20_000_000 - 25_000 - 300_000 - 8_000_000 - 10_000_000);
    // There is no level past the fourth.
    expect(eco.holdBuyError(s)).toBe('You have the biggest hold.');
    expect(eco.buyHoldLevel(s)).toBe(false);
    expect(s.holdLevel).toBe(4);
  });

  it('refuses a level without the coins', () => {
    const s = owner({ boatParts: 2, holdLevel: 1, coins: 299_999 });
    expect(eco.holdBuyError(s)).toBe('Hold level 2 costs 300,000 coins.');
    expect(eco.buyHoldLevel(s)).toBe(false);
    s.coins = 300_000;
    expect(eco.buyHoldLevel(s)).toBe(true);
    expect(s).toMatchObject({ holdLevel: 2, coins: 0 });
  });
});

describe('boat parts', () => {
  const owner = (o: Partial<SaveData> = {}) => Object.assign(newSave(), { level: 20, seaRod: true }, o);

  it('opens the zones one by one for Black Pearls: 25, 150, 3,000 and 25,000', () => {
    const s = owner({ pearls: 25 + 150 + 3000 + 25_000 + 7, coins: 5 });
    for (const left of [150 + 3000 + 25_000 + 7, 3000 + 25_000 + 7, 25_000 + 7, 7]) {
      expect(eco.buyBoatPart(s)).toBe(true);
      expect(s.pearls).toBe(left);
    }
    expect(s).toMatchObject({ boatParts: 4, coins: 5 });
    expect(eco.buyBoatPart(s)).toBe(false);
    expect(eco.boatPartError(s)).toMatch(/Every boat part/);
  });

  it('refuses a part without the pearls or the Deep Sea Rod', () => {
    const s = owner({ pearls: 24, coins: 1e9 });
    expect(eco.buyBoatPart(s)).toBe(false);
    expect(eco.boatPartError(s)).toMatch(/Storm sail needs 25 Black Pearls/);
    const none = Object.assign(newSave(), { pearls: 1000 });
    expect(eco.buyBoatPart(none)).toBe(false);
    expect(none.boatParts).toBe(0);
  });
});

describe('charter catches', () => {
  it("sell on the spot at the Abyss marker's growth on top of the other bonuses", () => {
    const f = FISH.find((x) => x.id === 'lurker')!;
    const plain = eco.applyCatch(newSave(), f, 300, false, false, true);
    const grown = eco.applyCatch(newSave(), f, 300, false, false, true, null, 1.12 ** 3);
    expect(grown.sold).toBe(Math.round(plain.sold! * 1.12 ** 3));
    const s = newSave();
    expect(eco.applyCatch(s, f, 300, false, true, true, 'feisty', 1.12).sold).toBe(Math.round(plain.sold! * 1.1 * 1.15 * 1.12));
    expect(s.slots.slice(2).every((x) => !x)).toBe(true);
  });

  it('a first landed sea fish means the player has sailed', () => {
    const s = newSave();
    expect(eco.hasSailed(s)).toBe(false);
    eco.applyCatch(s, FISH.find((x) => x.id === 'snapper')!, 150, false, false, true);
    expect(eco.hasSailed(s)).toBe(true);
  });
});

describe('the sea in old saves', () => {
  /** A save from before charters were places: rod and line levels, a chart, maybe pearls counted the old way. */
  const old = (o: Record<string, unknown>) => {
    const s = { ...newSave(), ...o } as Record<string, unknown>;
    for (const k of ['rodStep', 'abyssLevels', 'holdLevel', 'boatParts', 'abyssRecord', 'seaV']) delete s[k];
    return s;
  };
  /** A save from the rebuilt charters but before the sea reset (`SEA_VERSION`): progress carried over or earned since. */
  const unreset = (o: Record<string, unknown>) => {
    const s = { ...newSave(), ...o } as Record<string, unknown>;
    delete s.seaV;
    return s;
  };

  it('resets the sea once for saves from before SEA_VERSION: rod steps, Abyss levels, hold, boat parts, Abyss record and pearls', () => {
    const m = migrate(unreset({ seaRod: true, rodStep: 5, abyssLevels: 3, holdLevel: 3, boatParts: 4, abyssRecord: 12, pearls: 4200, coins: 98765, level: 40 }));
    expect(m).toMatchObject({ seaRod: true, rodStep: 0, abyssLevels: 0, holdLevel: 0, boatParts: 0, abyssRecord: 0, pearls: 0, coins: 98765, level: 40, seaV: SEA_VERSION });
    const pre = migrate(old({ pearls: 350, pearlsV: 1, coins: 1234, rodLevel: 10, seaLine: 10, seaRod: true, sea: { ledges: [5, 45], record: 45 } }));
    expect(pre).toMatchObject({ pearls: 0, coins: 1234, seaRod: true, rodStep: 0, holdLevel: 0, boatParts: 0, abyssLevels: 0, abyssRecord: 0 });
    for (const k of ['pearlsV', 'rodLevel', 'seaLine', 'sea']) expect(pre, k).not.toHaveProperty(k);
  });

  it('takes the sea fish out of the Fishdex and keeps the pond ones', () => {
    const m = migrate(unreset({ dex: { snapper: { count: 9, best: 160 }, marlin: { count: 1, best: 300, shiny: 1 }, perch: { count: 4, best: 20 } } }));
    expect(Object.keys(m.dex)).toEqual(['perch']);
    expect(eco.hasSailed(m)).toBe(false);
  });

  it('moves a best catch from the sea to the best pond record left, or none', () => {
    const dex = { marlin: { count: 1, best: 300 }, perch: { count: 4, best: 20 }, pike: { count: 2, best: 90 } };
    const m = migrate(unreset({ dex, best: { fishId: 'marlin', size: 300, value: 99999, shiny: true } }));
    const pike = FISH.find((f) => f.id === 'pike')!;
    expect(m.best).toEqual({ fishId: 'pike', size: 90, value: sellValue(pike, 90) });
    expect(migrate(unreset({ dex: { marlin: { count: 1, best: 300 } }, best: { fishId: 'marlin', size: 300, value: 9 } })).best).toBeNull();
    const pond = { fishId: 'perch', size: 20, value: 5 };
    expect(migrate(unreset({ dex, best: pond })).best).toEqual(pond);
  });

  it('keeps a best catch for each water: a sea fish saved as the one best catch moves to the sea board', () => {
    // A save from when one record covered both, made since the sea reset: the marlin is the best catch.
    const dex = { marlin: { count: 1, best: 300 }, perch: { count: 4, best: 20 }, pike: { count: 2, best: 90 } };
    const marlin = { fishId: 'marlin', size: 300, value: 99999, shiny: true };
    const m = migrate({ ...newSave(), dex, best: marlin, bestSea: undefined } as unknown as SaveData);
    const pike = FISH.find((f) => f.id === 'pike')!;
    expect(m.bestSea).toEqual(marlin);
    expect(m.best).toEqual({ fishId: 'pike', size: 90, value: sellValue(pike, 90) });
    // Both records are kept as they are once split, and a lake fish is never taken for a sea record.
    const again = migrate(JSON.parse(JSON.stringify(m)));
    expect(again.best).toEqual(m.best);
    expect(again.bestSea).toEqual(marlin);
    expect(migrate({ ...newSave(), bestSea: { fishId: 'pike', size: 90, value: 5 } } as SaveData).bestSea).toBeNull();
    // The sea reset clears the sea record with the rest of the sea.
    expect(migrate(unreset({ dex, best: marlin, bestSea: marlin })).bestSea).toBeNull();
  });

  it('records a catch as the best of its own water', () => {
    const s = newSave();
    const pike = FISH.find((f) => f.id === 'pike')!;
    const marlin = FISH.find((f) => f.id === 'marlin')!;
    eco.applyCatch(s, pike, 90);
    expect(s.best?.fishId).toBe('pike');
    expect(s.bestSea).toBeNull();
    eco.applyCatch(s, marlin, 300, false, false, true);
    expect(s.best?.fishId).toBe('pike');
    expect(s.bestSea).toMatchObject({ fishId: 'marlin', size: 300 });
    expect(s.bestSea!.value).toBeGreaterThan(s.best!.value);
  });

  it('resets once: sea progress earned after it stays, as the server and the client migrate again', () => {
    const once = migrate(unreset({ seaRod: true, rodStep: 5, boatParts: 3, pearls: 77 }));
    expect(migrate(once)).toEqual(once);
    expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once);
    const later = { ...once, rodStep: 7, holdLevel: 3, boatParts: 4, abyssLevels: 2, abyssRecord: 9, pearls: 31, dex: { snapper: { count: 2, best: 150 } } };
    expect(migrate(later)).toMatchObject({ rodStep: 7, holdLevel: 3, boatParts: 4, abyssLevels: 2, abyssRecord: 9, pearls: 31, dex: { snapper: { count: 2, best: 150 } } });
  });

  it('starts a save from before the hold at hold level 0, its sea progress kept', () => {
    const s = { ...newSave(), seaRod: true, rodStep: 4, boatParts: 2, pearls: 120 } as Record<string, unknown>;
    delete s.holdLevel;
    expect(migrate(s)).toMatchObject({ holdLevel: 0, rodStep: 4, boatParts: 2, pearls: 120 });
  });

  it('leaves a new save as it is', () => {
    const s = newSave();
    expect(migrate(s)).toMatchObject({ seaV: SEA_VERSION, rodStep: 0, boatParts: 0, pearls: 0, dex: {} });
  });

  it('cleans bad values on the new fields', () => {
    expect(migrate({ ...newSave(), rodStep: 12, boatParts: 9, abyssLevels: -1, abyssRecord: 3.7 })).toMatchObject({ rodStep: 8, boatParts: 4, abyssLevels: 0, abyssRecord: 3 });
    // The hold's level: a whole number from 0 to 4.
    const hold = (holdLevel: unknown) => migrate({ ...newSave(), holdLevel } as unknown as SaveData).holdLevel;
    expect([9, -2, 2.6, 'big', null, NaN, Infinity, 3].map(hold)).toEqual([4, 0, 2, 0, 0, 0, 0, 3]);
    expect(migrate({ ...newSave(), pearls: -5, seaRod: 'yes' })).toMatchObject({ pearls: 0, seaRod: false });
    expect(migrate({ ...newSave(), pearls: 41.7, seaRod: true })).toMatchObject({ pearls: 41, seaRod: true });
  });

  it('gives Moonsilk to saves from before the Deep Sea Rod that had the old Deep Sea Line levelled over a lighter pond line', () => {
    const before = old({ line: 'braid', seaLine: 3 });
    delete before.seaRod;
    expect(migrate(before).line).toBe('moonsilk');
    expect(migrate({ ...before, seaLine: 0 }).line).toBe('braid');
    expect(migrate(old({ line: 'braid', seaLine: 3 })).line).toBe('braid');
  });

  it('keeps the pond line its own: pond lines stay for sale', () => {
    const s = Object.assign(newSave(), { level: 20, line: 'braid', coins: 1e6, seaRod: true });
    expect(eco.lineBeaten(s, byId(LINES, 'moonsilk'))).toBe(false);
    expect(eco.buyLine(s, 'moonsilk')).toBe(true);
    expect(eco.lineName(s)).toBe('Moonsilk Line');
  });
});

describe('catch announcements', () => {
  const rare = FISH.find((f) => f.rarity === 'rare')!;
  const common = FISH.find((f) => f.rarity === 'common')!;
  it('announces only records of rare-or-better fish', () => {
    expect(eco.announcesCatch(rare, { rec: true })).toBe(true);
    expect(eco.announcesCatch(rare, {})).toBe(false);
    expect(eco.announcesCatch(common, { rec: true })).toBe(false);
  });
  it('does not announce a shiny that is no record', () => {
    expect(eco.announcesCatch(rare, { shiny: true } as { rec?: boolean })).toBe(false);
  });
});
