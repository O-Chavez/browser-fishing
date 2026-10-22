import { describe, expect, it } from 'vitest';
import { migrate, newSave } from './state';
import { TIP_IDS, markTip, rodHintText, rodUpgrade, tipText } from './tips';

describe('new-player tips', () => {
  it('marks each known tip once', () => {
    const s = newSave();
    expect(markTip(s, 'start')).toBe(true);
    expect(markTip(s, 'start')).toBe(false);
    expect(markTip(s, 'nope')).toBe(false);
    expect(s.tips).toEqual(['start']);
  });

  it('points a fresh player at the next bait up, with its unlock level', () => {
    const s = newSave();
    expect(tipText('sold', s, 'Marlow')).toContain('<b>Fly</b> unlocks at <b>Lv 2</b>');
    s.level = 2;
    expect(tipText('sold', s, 'Marlow')).toContain('<b>Fly</b> is for sale');
    s.locker.bait = { minnow: 5 };
    expect(tipText('sold', s, 'Marlow')).toContain('Glow Lure');
  });

  it('names the vendor in the selling tip', () => {
    expect(tipText('catch', newSave(), 'Marlow')).toContain('Marlow');
    expect(tipText('catch', newSave(), 'Marlow', true)).not.toContain('<kbd>E</kbd>');
    expect(tipText('start', newSave(), 'Marlow', true)).not.toContain('Click');
  });

  it('gives saves from before tips none if they are fresh, and all of them otherwise', () => {
    const { tips: _, ...fresh } = newSave();
    expect(migrate(fresh).tips).toEqual([]);
    const { tips: __, ...played } = { ...newSave(), level: 3, xp: 10, dex: { minnow: { count: 2, best: 8 } } };
    expect(migrate(played).tips).toEqual([...TIP_IDS]);
    expect(migrate({ ...newSave(), tips: ['start', 'bogus'] }).tips).toEqual(['start']);
  });
});

describe('rod upgrade hint', () => {
  it('suggests the next rod up only once it is unlocked', () => {
    const s = newSave();
    expect(rodUpgrade(s)).toBeNull();
    s.level = 3;
    expect(rodUpgrade(s)?.id).toBe('fiberglass');
  });

  it('skips rods the player already owns, in the hotbar or the locker', () => {
    const s = newSave();
    s.level = 20;
    s.locker.rods.push('fiberglass');
    expect(rodUpgrade(s)?.id).toBe('graphite');
    s.locker.rods.push('carbon');
    expect(rodUpgrade(s)?.id).toBe('aurora');
    s.slots[3] = { k: 'rod', id: 'aurora' };
    expect(rodUpgrade(s)).toBeNull();
  });

  it('waits for the next tier up rather than skipping past a locked one', () => {
    const s = newSave();
    s.level = 9;
    s.locker.rods.push('graphite');
    expect(rodUpgrade(s)).toBeNull();
  });

  it('names the rod, the vendor and the price', () => {
    const s = newSave();
    s.level = 6;
    s.locker.rods.push('fiberglass');
    const text = rodHintText('snapped', rodUpgrade(s)!, 'Marlow');
    expect(text).toContain('<b>Graphite Rod</b>');
    expect(text).toContain("Marlow's stall (1,200 🪙)");
    expect(rodHintText('tough', rodUpgrade(s)!, 'Marlow')).toMatch(/^Tough fight!/);
  });
});
