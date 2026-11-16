import { wheelPage, type EmoteDef } from '../../data/emotes';
import { emoteHint, ownsEmote } from '../economy';
import type { SaveData } from '../state';

/**
 * The emote wheel's rules (GAME_DESIGN.md §40): which emotes sit where, and which one a direction picks. `EmoteWheel`
 * (wheelview.ts) draws it.
 */

/** Play-test defaults, in CSS pixels: the middle that picks nothing, and how far the pointer travels from it. */
export const WHEEL = { dead: 34, reach: 120 };

/** One place on the wheel. */
export interface WheelSlot {
  emote: EmoteDef;
  /** Not the player's yet: it shows locked, and picking it says where it comes from (`hint`). */
  locked: boolean;
  hint: string;
}

/** A page of the wheel for a player, slot 0 at the top and on clockwise. Emotes they don't own yet show locked. */
export function wheelSlots(s: Pick<SaveData, 'owned' | 'emotes'>, page = 0): WheelSlot[] {
  return wheelPage(page).map((emote) => ({ emote, locked: !ownsEmote(s, emote.id), hint: emoteHint(s, emote) }));
}

/**
 * The slot a pointer at (x, y) from the wheel's middle picks, x to the right and y down: -1 inside the dead middle,
 * else the nearest of `slots` directions, slot 0 straight up and on clockwise.
 */
export function wheelPick(x: number, y: number, slots: number, dead = WHEEL.dead): number {
  if (slots < 1 || Math.hypot(x, y) < dead) return -1;
  const step = (Math.PI * 2) / slots;
  return ((Math.round(Math.atan2(x, -y) / step) % slots) + slots) % slots;
}

/** Moves the wheel's pointer by a mouse movement, kept within `reach` of the middle. */
export function wheelMove(p: { x: number; y: number }, dx: number, dy: number, reach = WHEEL.reach): { x: number; y: number } {
  const x = p.x + dx;
  const y = p.y + dy;
  const d = Math.hypot(x, y);
  return d > reach ? { x: (x * reach) / d, y: (y * reach) / d } : { x, y };
}

/** Touch: a press on the 👋 button shorter and stiller than this is a tap, which leaves the wheel open to tap a slot. */
export const WHEEL_TAP = { ms: 300, px: 12 };

/**
 * How a press on the touch 👋 button ended, `ms` after it began with the finger (dx, dy) from where it went down
 * (CSS pixels, x right and y down). A quick, still press is a `tap`: the wheel stays open and a slot is tapped. A held
 * or dragged one works like holding F: the slot in the finger's direction plays (`pick`), and letting go in the
 * middle, which is back on the button, plays nothing (`cancel`).
 */
export function touchRelease(ms: number, dx: number, dy: number, slots: number): { kind: 'tap' } | { kind: 'cancel' } | { kind: 'pick'; slot: number } {
  if (ms < WHEEL_TAP.ms && Math.hypot(dx, dy) < WHEEL_TAP.px) return { kind: 'tap' };
  const slot = wheelPick(dx, dy, slots);
  return slot < 0 ? { kind: 'cancel' } : { kind: 'pick', slot };
}

/** Where slot `i` of `slots` sits round the wheel, as a unit vector (x right, y down). */
export function slotDir(i: number, slots: number): { x: number; y: number } {
  const a = (i * Math.PI * 2) / slots;
  return { x: Math.sin(a), y: -Math.cos(a) };
}
