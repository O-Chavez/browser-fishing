import { describe, expect, it } from 'vitest';
import { COIN } from './format';
import { migrate, newSave } from './state';
import { TIP_IDS, baitWarning, charterTipDue, chartersToTry, lossVerdict, markTip, rodHintText, rodUpgrade, seaLossVerdict, tipText } from './tips';
import { BAITS, FISH, byId } from '../data/content';

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
  it('the big word says how it ended, and a short line names each piece of gear the fish was over', () => {
    expect(lossVerdict('snapped', { rod: 'graphite', line: 'mono', level: 10 }, pike)).toEqual({ title: 'SNAP!', fixes: ['Line too weak → Fluoro Line'] });
    expect(lossVerdict('escaped', { rod: 'graphite', line: 'mono', level: 10 }, pike)).toEqual({ title: 'RAN OFF!', fixes: ['Line too weak → Fluoro Line'] });
    expect(lossVerdict('snapped', { rod: 'fiberglass', line: 'fluoro', level: 10 }, pike)).toEqual({ title: 'SNAP!', fixes: ['Rod too weak → Graphite Rod'] });
    // Over both: both, and gear not unlocked yet says when it is.
    expect(lossVerdict('escaped', { rod: 'twig', line: 'twine', level: 5 }, pike)).toEqual({ title: 'RAN OFF!', fixes: ['Line too weak → Fluoro Line', 'Rod too weak → Graphite Rod at level 6'] });
  });

  it('a fish the gear handles was the player\'s doing: the cause and a reel tip', () => {
    const matched = { rod: 'graphite', line: 'fluoro', level: 10 };
    expect(lossVerdict('snapped', matched, pike)).toEqual({ title: 'SNAP!', cause: 'Held in the red through a surge', fixes: ['Ease off when the gauge goes red'] });
    expect(lossVerdict('escaped', matched, pike).cause).toBe('The fish took all your line');
    // At sea there is no fish tier to blame.
    expect(lossVerdict('snapped', { rod: 'twig', line: 'twine', level: 1 }, null).cause).toBe('Held in the red through a surge');
  });

  it('at sea, names the first level of each track on which the fish is no longer over it', () => {
    const s = { rodLevel: 3, seaLine: 0 };
    // A level is one marker: a fish right at the wall is cleared by the next level, one 2 markers past it by the third.
    expect(seaLossVerdict('snapped', s, { strength: 1, weight: 0 })).toEqual({ title: 'SNAP!', fixes: ['Line too weak → Deep Sea Line +1'] });
    expect(seaLossVerdict('escaped', { ...s, seaLine: 2 }, { strength: 1.33, weight: 1.33 })).toEqual({ title: 'RAN OFF!', fixes: ['Line too weak → Deep Sea Line +5', 'Rod too weak → Deep Sea Rod +6'] });
    // A Brutish fish takes its tag's levels too.
    expect(seaLossVerdict('snapped', s, { strength: 0.2, weight: 1.5 }).fixes).toEqual(['Rod too weak → Deep Sea Rod +7']);
    expect(seaLossVerdict('escaped', s, { strength: 0.8, weight: 0.8 }).cause).toBe('The fish took all your line');
  });
  it("words a bait's top fish against the line and rod as the hook toast does, warning from two rungs over", () => {
    const minnow = BAITS.find((b) => b.tier === 3)!;
    expect(baitWarning({ rod: 'graphite', line: 'fluoro' }, minnow)).toBeNull();
    expect(baitWarning({ rod: 'graphite', line: 'mono' }, minnow)).toEqual({ text: 'Its top fish: strong for your line.', too: false });
    expect(baitWarning({ rod: 'twig', line: 'mono' }, minnow)).toEqual({ text: '⚠ Its top fish: strong for your line, too heavy for your rod. Fluoro Line and the Graphite Rod handle them.', too: true });
    expect(baitWarning({ rod: 'twig', line: 'fluoro' }, minnow)!.text).toBe('⚠ Its top fish: too heavy for your rod. The Graphite Rod handles them.');
    expect(baitWarning({ rod: 'twig', line: 'twine' }, minnow, 'Its fish')!.text).toBe('⚠ Its fish: too strong for your line, too heavy for your rod. Fluoro Line and the Graphite Rod handle them.');
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

  it('points Deep Sea Rod owners at Captain Reed once charters are open', () => {
    const s = newSave();
    expect(chartersToTry(s, true)).toBe(false);
    expect(charterTipDue(s, true)).toBe(false);
    // The Aurora Rod alone isn't enough any more.
    s.locker.rods = ['aurora'];
    expect(chartersToTry(s, true)).toBe(false);
    s.seaRod = true;
    expect(chartersToTry(s, true)).toBe(true);
    expect(chartersToTry(s, false)).toBe(false);
    expect(charterTipDue(s, true)).toBe(true);
    const text = tipText('charter', s, 'Marlow');
    expect(text).toContain('Captain Reed');
    expect(text).toContain('west beach');
    expect(text).not.toMatch(/league|dive/i);
    markTip(s, 'charter');
    expect(charterTipDue(s, true)).toBe(false);
  });

  it('gives way to the usual goals once a marker has been reached', () => {
    const s = newSave();
    s.seaRod = true;
    s.sea.record = 5;
    expect(chartersToTry(s, true)).toBe(false);
    expect(charterTipDue(s, true)).toBe(false);
  });

  it('says nothing about charters while they are closed', () => {
    const s = newSave();
    s.seaRod = true;
    expect(chartersToTry(s, false)).toBe(false);
    expect(charterTipDue(s, false)).toBe(false);
  });
});
