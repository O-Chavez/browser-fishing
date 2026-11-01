import { describe, expect, it } from 'vitest';
import { COIN } from './format';
import { migrate, newSave } from './state';
import { TIP_IDS, charterTipDue, chartersToTry, lossVerdict, markTip, rodHintText, rodUpgrade, seaLossVerdict, tipText } from './tips';
import { FISH, byId } from '../data/content';

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
    expect(tipText('reel', newSave(), 'Marlow')).toContain('green');
    expect(tipText('fray', newSave(), 'Marlow')).toContain('10% more');
    expect(tipText('slack', newSave(), 'Marlow', true)).toContain('hold the button');
  });

  it('gives saves from before tips none if they are fresh, and all of them otherwise', () => {
    const { tips: _, ...fresh } = newSave();
    expect(migrate(fresh).tips).toEqual([]);
    const { tips: __, ...played } = { ...newSave(), level: 3, xp: 10, dex: { minnow: { count: 2, best: 8 } } };
    expect(migrate(played).tips).toEqual([...TIP_IDS]);
    expect(migrate({ ...newSave(), tips: ['start', 'bogus'] }).tips).toEqual(['start']);
  });
});

describe('loss verdict', () => {
  const pike = byId(FISH, 'pike'); // tier 3
  it('a fish over the line snapped it: names the line and where to get it', () => {
    const v = lossVerdict('snapped', { rod: 'graphite', line: 'mono', level: 10 }, pike, 'Marlow');
    expect(v.title).toBe('SNAP!');
    expect(v.cause).toBe('Too strong for your Mono Line');
    expect(v.fix).toContain('Fluoro Line holds it');
    expect(v.fix).toContain("Marlow's, 500");
    expect(lossVerdict('snapped', { rod: 'graphite', line: 'mono', level: 3 }, pike, 'Marlow').fix).toContain('unlocks at level 5');
  });
  it('a fish over the rod ran off: names the rod; anything else is a reel tip', () => {
    const v = lossVerdict('escaped', { rod: 'fiberglass', line: 'fluoro', level: 10 }, pike, 'Marlow');
    expect(v.title).toBe('RAN OFF!');
    expect(v.cause).toBe('Too heavy for your Fiberglass Rod');
    expect(v.fix).toContain('Graphite Rod lands it');
    const matched = { rod: 'graphite', line: 'fluoro', level: 10 };
    expect(lossVerdict('snapped', matched, pike, 'Marlow').cause).toBe('Held in the red through a surge');
    expect(lossVerdict('escaped', matched, pike, 'Marlow').cause).toBe('The fish took all your line');
    // At sea there is no fish tier to blame.
    expect(lossVerdict('snapped', { rod: 'twig', line: 'twine', level: 1 }, null, 'Marlow').cause).toBe('Held in the red through a surge');
  });

  it('at sea, names the next level of the one track the fish was over', () => {
    const s = { rod: 'aurora', line: 'moonsilk', level: 20, rodLevel: 3, seaLine: 0 };
    const snap = seaLossVerdict('snapped', s, { rod: true, line: true }, 'Marlow');
    expect(snap).toMatchObject({ title: 'SNAP!', cause: 'Too strong for your Moonsilk Line' });
    expect(snap.fix).toBe(`Deep Sea Line +1 at Marlow's · 40,500 ${COIN} + 124 Black Pearls`);
    expect(seaLossVerdict('snapped', { ...s, seaLine: 2 }, { rod: false, line: true }, 'Marlow').cause).toBe('Too strong for your Deep Sea Line +2');
    const ran = seaLossVerdict('escaped', s, { rod: true, line: true }, 'Marlow');
    expect(ran).toMatchObject({ title: 'RAN OFF!', cause: 'Too heavy for your Aurora Rod +3' });
    expect(ran.fix).toBe(`Aurora Rod +4 at Marlow's · 99,000 ${COIN} + 196 Black Pearls`);
    // Not over the track that lost it: a reel tip.
    expect(seaLossVerdict('snapped', s, { rod: true, line: false }, 'Marlow').cause).toBe('Held in the red through a surge');
    expect(seaLossVerdict('escaped', s, { rod: false, line: true }, 'Marlow').cause).toBe('The fish took all your line');
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
    expect(text).toContain(`Marlow's stall (1,200 ${COIN})`);
    expect(rodHintText('tough', rodUpgrade(s)!, 'Marlow')).toMatch(/^Tough fight!/);
  });

  it('the dish tip names the player\'s own tier 3 fish', () => {
    const s = newSave();
    expect(tipText('dish', s, 'Marlow')).toContain('3 tier 1 fish and a tier 3 fish');
    s.dex.pike = { count: 2, best: 60 };
    expect(tipText('dish', s, 'Marlow')).toContain('3 tier 1 fish and your Northern Pike');
  });

  it('points Aurora Rod owners at Captain Reed once charters are open', () => {
    const s = newSave();
    expect(chartersToTry(s, true)).toBe(false);
    expect(charterTipDue(s, true)).toBe(false);
    s.locker.rods = ['aurora'];
    expect(chartersToTry(s, true)).toBe(true);
    expect(charterTipDue(s, true)).toBe(true);
    const text = tipText('charter', s, 'Marlow');
    expect(text).toContain('Captain Reed');
    expect(text).toContain('west beach');
    expect(text).not.toMatch(/league|dive/i);
    markTip(s, 'charter');
    expect(charterTipDue(s, true)).toBe(false);
  });

  it('also counts an Aurora Rod in the hotbar', () => {
    const s = newSave();
    s.slots[2] = { k: 'rod', id: 'aurora' };
    expect(charterTipDue(s, true)).toBe(true);
  });

  it('gives way to the usual goals once a marker has been reached', () => {
    const s = newSave();
    s.locker.rods = ['aurora'];
    s.sea.record = 5;
    expect(chartersToTry(s, true)).toBe(false);
    expect(charterTipDue(s, true)).toBe(false);
  });

  it('says nothing about charters while they are closed', () => {
    const s = newSave();
    s.locker.rods = ['aurora'];
    expect(chartersToTry(s, false)).toBe(false);
    expect(charterTipDue(s, false)).toBe(false);
  });
});
