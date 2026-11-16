import { describe, expect, it } from 'vitest';
import { emoteById } from '../../data/emotes';
import { newSave } from '../state';
import { WHEEL, WHEEL_TAP, slotDir, touchRelease, wheelMove, wheelPick, wheelSlots } from './wheel';

describe('emote wheel', () => {
  it('picks nothing from the middle', () => {
    expect(wheelPick(0, 0, 8)).toBe(-1);
    expect(wheelPick(WHEEL.dead - 1, 0, 8)).toBe(-1);
    expect(wheelPick(0, -(WHEEL.dead - 1), 8)).toBe(-1);
    expect(wheelPick(WHEEL.dead, 0, 8)).toBe(2);
    expect(wheelPick(100, 100, 0)).toBe(-1);
  });

  it('picks by direction, slot 0 straight up and on clockwise', () => {
    // Screen coordinates: x to the right, y down.
    expect(wheelPick(0, -100, 8)).toBe(0);
    expect(wheelPick(100, -100, 8)).toBe(1);
    expect(wheelPick(100, 0, 8)).toBe(2);
    expect(wheelPick(100, 100, 8)).toBe(3);
    expect(wheelPick(0, 100, 8)).toBe(4);
    expect(wheelPick(-100, 100, 8)).toBe(5);
    expect(wheelPick(-100, 0, 8)).toBe(6);
    expect(wheelPick(-100, -100, 8)).toBe(7);
  });

  it('gives each slot an equal share of the circle, split halfway between neighbours', () => {
    const at = (deg: number) => wheelPick(Math.sin((deg * Math.PI) / 180) * 100, -Math.cos((deg * Math.PI) / 180) * 100, 8);
    expect(at(22)).toBe(0);
    expect(at(23)).toBe(1);
    expect(at(-22)).toBe(0);
    expect(at(-23)).toBe(7);
    expect(at(337)).toBe(7);
    expect(at(338)).toBe(0);
    expect(at(179)).toBe(4);
    expect(at(181)).toBe(4);
    // Every slot's own direction picks it, for any number of slots.
    for (const n of [1, 4, 6, 8]) for (let i = 0; i < n; i++) expect(wheelPick(slotDir(i, n).x * 80, slotDir(i, n).y * 80, n)).toBe(i);
  });

  it("keeps the pointer within reach of the middle, so a small move back changes the pick", () => {
    let p = { x: 0, y: 0 };
    p = wheelMove(p, 5000, 0);
    expect(p).toEqual({ x: WHEEL.reach, y: 0 });
    // Without the clamp it would take 5000 px to come back.
    p = wheelMove(p, -WHEEL.reach, 0);
    expect(wheelPick(p.x, p.y, 8)).toBe(-1);
    p = wheelMove(p, 30, -40);
    expect(p).toEqual({ x: 30, y: -40 });
    p = wheelMove({ x: 0, y: 0 }, 300, -300);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(WHEEL.reach);
    expect(wheelPick(p.x, p.y, 8)).toBe(1);
  });

  it('tells a quick tap on the touch button from a hold: a tap leaves the wheel open, a hold picks by the drag', () => {
    // Quick and still: a tap. The wheel stays up and a slot is tapped.
    expect(touchRelease(120, 0, 0, 8)).toEqual({ kind: 'tap' });
    expect(touchRelease(WHEEL_TAP.ms - 1, WHEEL_TAP.px - 1, 0, 8)).toEqual({ kind: 'tap' });
    // Held without moving, or dragged out and back onto the button: let go in the middle, nothing plays.
    expect(touchRelease(WHEEL_TAP.ms, 0, 0, 8)).toEqual({ kind: 'cancel' });
    expect(touchRelease(900, 5, -8, 8)).toEqual({ kind: 'cancel' });
    expect(touchRelease(2500, WHEEL.dead - 1, 0, 8)).toEqual({ kind: 'cancel' });
    // Dragged toward a slot, however quickly: that slot, slot 0 straight up and on clockwise, like the mouse.
    expect(touchRelease(150, 0, -60, 8)).toEqual({ kind: 'pick', slot: 0 });
    expect(touchRelease(700, 80, 0, 8)).toEqual({ kind: 'pick', slot: 2 });
    expect(touchRelease(700, -70, 70, 8)).toEqual({ kind: 'pick', slot: 5 });
    expect(touchRelease(700, -400, -390, 8)).toEqual({ kind: 'pick', slot: 7 });
    // A quick flick that moved past a tap's stillness but not out of the middle isn't a tap and isn't a pick.
    expect(touchRelease(100, WHEEL_TAP.px + 2, 0, 8)).toEqual({ kind: 'cancel' });
    // What it picks is what the wheel's pointer shows: the same rule as the mouse.
    for (const [dx, dy] of [[0, -90], [64, -64], [300, 20], [10, 200], [-90, 90]]) {
      const end = touchRelease(1000, dx, dy, 8);
      expect(end).toEqual({ kind: 'pick', slot: wheelPick(dx, dy, 8) });
    }
  });

  it('shows all eight, with the ones not owned locked and saying where they come from', () => {
    const s = newSave();
    const slots = wheelSlots(s);
    expect(slots.map((x) => x.emote.id)).toEqual(['wave', 'kelp', 'yes', 'twilight', 'nice', 'abyss', 'no', 'master']);
    expect(slots.filter((x) => !x.locked).map((x) => x.emote.id)).toEqual(['wave', 'yes', 'nice', 'no']);
    expect(slots[0].hint).toBe('');
    expect(slots[1].hint).toBe('Own the Kelp Deep set, then Captain Reed sells it');
    expect(slots[7].hint).toBe('Own the other three deep sea emotes, then Captain Reed sells it');
    // The gate met: only the buying is left.
    s.owned.push(...emoteById('kelp')!.gate!.pieces);
    expect(wheelSlots(s)[1]).toMatchObject({ locked: true, hint: 'Captain Reed sells it' });
    s.emotes.push('kelp');
    expect(wheelSlots(s)[1]).toMatchObject({ locked: false, hint: '' });
  });
});
