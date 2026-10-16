import { describe, expect, it } from 'vitest';
import * as eco from './economy';
import { SLOT_COUNT, migrate, newSave, type SaveData } from './state';
import { FISH } from '../data/content';
import { Drops } from './drops';

const fishSlot = () => ({ k: 'fish' as const, fishId: FISH[0].id, size: 20 });

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
    expect(eco.equipBait(s, 'worm')).toBe(true);
    expect(s.bait).toBe('worm');
    expect(eco.baitCount(s, 'minnow')).toBe(5);
    expect(eco.buyRod(s, 'graphite')).toBe(true);
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
