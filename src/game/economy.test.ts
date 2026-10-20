import { describe, expect, it } from 'vitest';
import * as eco from './economy';
import { SLOT_COUNT, migrate, newSave, type SaveData } from './state';
import { FISH } from '../data/content';
import { Drops } from './drops';
import { isFace } from '../data/cosmetics';

const fishSlot = () => ({ k: 'fish' as const, fishId: FISH[0].id, size: 20 });

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

  it('stows gear and refills from the locker when a stack runs out', () => {
    const s = newSave();
    s.locker.bait.worm = 3;
    s.slots = [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 1 }, null, null, null];
    expect(eco.spendBait(s)).toBe(true);
    expect(s.slots[1]).toMatchObject({ k: 'bait', n: 3 });
    expect(eco.stowSlot(s, 1)).toBe(true);
    expect(s.slots[1]).toBeNull();
    expect(eco.baitCount(s, 'worm')).toBe(3);
  });

  it('only stores catches in free slots and blocks casting when full', () => {
    const s = newSave();
    s.slots = [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 1 }, null, null, null];
    expect(eco.spendBait(s)).toBe(true);
    expect(s.slots[1]).toBeNull();
    expect(eco.canCast(s)).toBe('nobait');
    s.slots = [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 3 }, fishSlot(), fishSlot(), fishSlot()];
    expect(eco.canCast(s)).toBe('full');
    expect(eco.applyCatch(s, FISH[0], 20).stored).toBe(false);
    s.slots[1] = { k: 'bait', id: 'worm', n: 1 };
    expect(eco.canCast(s)).toBe('ok');
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

  it('drops and picks items back up', () => {
    const s = newSave();
    eco.selectSlot(s, 1);
    const item = eco.dropHeld(s)!;
    expect(item).toMatchObject({ k: 'bait', n: 15 });
    expect(eco.baitCount(s, 'worm')).toBe(0);
    expect(eco.takeItem(s, item)).toBe(true);
    expect(eco.baitCount(s, 'worm')).toBe(15);
    s.slots = [fishSlot(), fishSlot(), fishSlot(), fishSlot(), fishSlot()];
    expect(eco.canTake(s, fishSlot())).toBe(false);
  });

  it('migrates old saves', () => {
    const old = { ...newSave(), ownedRods: ['twig', 'graphite'], baitStock: { worm: 25, fly: 3, minnow: 0 }, inventory: [{ fishId: FISH[0].id, size: 20 }] } as Partial<SaveData>;
    delete old.slots;
    const s = migrate(old);
    expect(s.slots).toHaveLength(SLOT_COUNT);
    expect(eco.hasRod(s, 'graphite')).toBe(true);
    expect(s.slots.filter((x) => x?.k === 'rod')).toHaveLength(2);
    expect('inventory' in s).toBe(false);
    expect('ownedRods' in s).toBe(false);
  });

  it('gives saves from before faces a random face, and keeps a valid one', () => {
    const old = { ...newSave(), look: { color: 0x123456, hat: null, shirt: null, jewelry: null } };
    const s = migrate(old);
    expect(isFace(s.look.face)).toBe(true);
    expect(s.look.color).toBe(0x123456);
    expect(migrate({ ...newSave(), look: { ...newSave().look, face: 'cat' } }).look.face).toBe('cat');
    expect(isFace(migrate({ ...newSave(), look: { ...newSave().look, face: 'bogus' } }).look.face)).toBe(true);
  });

  it('pulls records and carried fish from before the size rework into the new ranges', () => {
    const minnow = FISH.find((f) => f.id === 'minnow')!;
    const sturgeon = FISH.find((f) => f.id === 'sturgeon')!;
    const old = { ...newSave(), dex: { minnow: { count: 3, best: 30 }, sturgeon: { count: 1, best: 100 } }, best: { fishId: 'sturgeon', size: 100, value: 500 } };
    old.slots = [{ k: 'rod', id: 'twig' }, { k: 'fish', fishId: 'minnow', size: 12 }, null, null, null];
    const s = migrate(old);
    expect(s.dex.minnow.best).toBe(minnow.maxSize);
    expect(s.dex.sturgeon.best).toBe(sturgeon.minSize);
    expect(s.best!.size).toBe(sturgeon.minSize);
    expect(s.best!.value).toBe(500);
    expect(s.slots[1]).toMatchObject({ k: 'fish', size: minnow.maxSize });
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
  });
});
