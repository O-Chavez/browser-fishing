import { COS_SLOTS, cosById, type CosSlot } from '../data/cosmetics';
import { BAITS, FISH, RODS, byId, type BaitType, type Fish } from '../data/content';
import { applyXp, catchXp, eligibleFish, pickFish, rollSize, sellValue, SHINY_CHANCE } from './progression';
import { BAIT_STACK, type SaveData, type Slot } from './state';

/** Pure save mutations. The server runs these authoritatively; the client mirrors them optimistically. */

const ROD_LEVEL_OK = (s: SaveData, id: string) => {
  const r = RODS.find((x) => x.id === id);
  return !!r && s.level >= r.unlockLevel;
};

export const freeSlots = (s: SaveData): number => s.slots.filter((sl) => !sl).length;
export const hasRod = (s: SaveData, id: string): boolean => s.slots.some((sl) => sl?.k === 'rod' && sl.id === id);

/** Bait of this type carried across all slots. */
export function baitCount(s: SaveData, id: string): number {
  return s.slots.reduce((a, sl) => a + (sl?.k === 'bait' && sl.id === id ? sl.n : 0), 0);
}

/** The slot that bait is currently drawn from (the first stack of the selected type). */
export function activeSlot(s: SaveData): number {
  return s.slots.findIndex((sl) => sl?.k === 'bait' && sl.id === s.bait);
}

/** How many more of this bait fit, topping up stacks first and then empty slots. */
export function baitRoom(s: SaveData, id: string): number {
  return s.slots.reduce(
    (a, sl) => a + (!sl ? BAIT_STACK : sl.k === 'bait' && sl.id === id ? BAIT_STACK - sl.n : 0),
    0,
  );
}

function addBait(s: SaveData, id: BaitType, n: number): void {
  for (const sl of s.slots) {
    if (n > 0 && sl?.k === 'bait' && sl.id === id) {
      const add = Math.min(n, BAIT_STACK - sl.n);
      sl.n += add;
      n -= add;
    }
  }
  for (let i = 0; i < s.slots.length && n > 0; i++) {
    if (s.slots[i]) continue;
    const add = Math.min(n, BAIT_STACK);
    s.slots[i] = { k: 'bait', id, n: add };
    n -= add;
  }
}

/** Takes the slot in hand: rods and bait become the active rod / bait, fish are simply held. */
export function selectSlot(s: SaveData, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= s.slots.length) return false;
  const sl = s.slots[index];
  if (sl?.k === 'rod') s.rod = sl.id;
  else if (sl?.k === 'bait') {
    const b = BAITS.find((x) => x.id === sl.id);
    if (!b || b.unlockLevel > s.level) return false;
    s.bait = sl.id;
  }
  s.held = index;
  return true;
}

export const BAIT_PACK = 5;

/** Stall prices: bait is sold in packs, rods one at a time. A purchase needs room in the hotbar. */
export function buyRod(s: SaveData, id: string): boolean {
  const r = RODS.find((x) => x.id === id);
  if (!r || !ROD_LEVEL_OK(s, id) || s.coins < r.price || hasRod(s, id)) return false;
  const i = s.slots.indexOf(null);
  if (i < 0) return false;
  s.coins -= r.price;
  s.slots[i] = { k: 'rod', id };
  selectSlot(s, i);
  return true;
}

export function buyBait(s: SaveData, id: string): boolean {
  const b = BAITS.find((x) => x.id === id);
  if (!b) return false;
  const cost = b.price * BAIT_PACK;
  if (s.level < b.unlockLevel || s.coins < cost || baitRoom(s, b.id) < BAIT_PACK) return false;
  s.coins -= cost;
  addBait(s, b.id, BAIT_PACK);
  return true;
}

export const WHEEL_WIN = 0.45;
export const WHEEL_RANGE = 4;

/** What a carried fish sells for, including any wheel winnings. */
export const fishValue = (item: { fishId: string; size: number; mult?: number; shiny?: boolean }): number =>
  sellValue(byId(FISH, item.fishId), item.size, item.shiny) * (item.mult ?? 1);

/** Resolves a spin for the fish in hand: a win doubles its value, a loss destroys it. */
export function applyWheel(s: SaveData, win: boolean): number {
  const item = s.slots[s.held];
  if (item?.k !== 'fish') return 0;
  const before = fishValue(item);
  if (win) item.mult = (item.mult ?? 1) * 2;
  else s.slots[s.held] = null;
  return win ? before : -before;
}

/** Sells the fish in hand. */
export function sellHeld(s: SaveData): boolean {
  const item = s.slots[s.held];
  if (item?.k !== 'fish') return false;
  s.coins += fishValue(item);
  s.slots[s.held] = null;
  return true;
}

/** Sells the fish in a specific hotbar slot. */
export function sellSlot(s: SaveData, i: number): boolean {
  const item = s.slots[i];
  if (!Number.isInteger(i) || item?.k !== 'fish') return false;
  s.coins += fishValue(item);
  s.slots[i] = null;
  return true;
}

export function buyCosmetic(s: SaveData, id: string): boolean {
  const c = cosById(id);
  if (!c || s.owned.includes(id) || s.coins < c.price) return false;
  s.coins -= c.price;
  s.owned.push(id);
  return true;
}

/** Wears an owned item (or takes the slot's item off when id is null). */
export function equipCosmetic(s: SaveData, slot: CosSlot, id: string | null): boolean {
  if (!COS_SLOTS.includes(slot)) return false;
  if (id !== null && (!s.owned.includes(id) || cosById(id)?.slot !== slot)) return false;
  s.look[slot] = id;
  return true;
}

export function setBodyColor(s: SaveData, color: number): boolean {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) return false;
  s.look.color = color;
  return true;
}

/** Removes the item in hand and returns it, or null if it cannot be dropped (empty hand, or your only rod). */
export function dropHeld(s: SaveData): Slot | null {
  const item = s.slots[s.held];
  if (!item) return null;
  if (item.k === 'rod' && s.slots.filter((x) => x?.k === 'rod').length <= 1) return null;
  s.slots[s.held] = null;
  if (item.k === 'rod' && s.rod === item.id && !hasRod(s, item.id)) {
    const r = s.slots.find((x) => x?.k === 'rod');
    if (r?.k === 'rod') s.rod = r.id;
  }
  return item;
}

/** Whether a dropped item would fit in the hotbar. */
export function canTake(s: SaveData, item: Slot): boolean {
  return item.k === 'bait' ? baitRoom(s, item.id) >= item.n : freeSlots(s) > 0;
}

export function takeItem(s: SaveData, item: Slot): boolean {
  if (!canTake(s, item)) return false;
  if (item.k === 'bait') addBait(s, item.id, item.n);
  else s.slots[s.slots.indexOf(null)] = item;
  return true;
}

/** Spends one of the active bait. */
export function spendBait(s: SaveData): boolean {
  const i = activeSlot(s);
  const sl = s.slots[i];
  if (sl?.k !== 'bait') return false;
  if (--sl.n <= 0) s.slots[i] = null;
  return true;
}

export type CastCheck = 'ok' | 'norod' | 'nobait' | 'hands' | 'full';

/** A cast needs a rod, bait, the rod in hand, and room for the catch (a free slot, or one the last bait frees). */
export function canCast(s: SaveData): CastCheck {
  if (!hasRod(s, s.rod)) return 'norod';
  const held = s.slots[s.held];
  if (held?.k !== 'rod') return 'hands';
  const sl = s.slots[activeSlot(s)];
  if (sl?.k !== 'bait') return 'nobait';
  return freeSlots(s) > 0 || sl.n === 1 ? 'ok' : 'full';
}

export const CAST_MESSAGES: Record<Exclude<CastCheck, 'ok'>, string> = {
  norod: 'You need a rod! Buy one at the stall.',
  nobait: 'Out of bait! Buy more from the stall.',
  hands: 'Hold your rod (1-5) to cast.',
  full: 'Your hotbar is full - sell or drop something first.',
};

export interface Roll {
  fishId: string | null;
  size: number;
  /** Seconds until the fish bites. */
  wait: number;
  shiny?: boolean;
}

export function rollCast(s: SaveData, locationId: string, rng: () => number = Math.random): Roll {
  const rod = byId(RODS, s.rod);
  const bait = byId(BAITS, s.bait);
  const fish = pickFish(eligibleFish(locationId, rod, bait), rod, bait, rng);
  return {
    fishId: fish?.id ?? null,
    size: fish ? rollSize(fish, rng) : 0,
    wait: (3.5 + rng() * 6) / bait.luck,
    shiny: !!fish && rng() < SHINY_CHANCE,
  };
}

export interface CatchResult {
  /** False when there was no free slot, so the fish got away. */
  stored: boolean;
  first: boolean;
  record: boolean;
  gained: number;
  leveledUp: boolean;
  level: number;
}

export function applyCatch(s: SaveData, fish: Fish, size: number, shiny = false): CatchResult {
  const slot = s.slots.indexOf(null);
  if (slot < 0) return { stored: false, first: false, record: false, gained: 0, leveledUp: false, level: s.level };
  const entry = s.dex[fish.id];
  const first = !entry;
  const gained = catchXp(fish, size, first, shiny);
  const record = !!entry && size > entry.best;
  s.dex[fish.id] = { count: (entry?.count ?? 0) + 1, best: Math.max(size, entry?.best ?? 0) };
  s.slots[slot] = { k: 'fish', fishId: fish.id, size, ...(shiny ? { shiny: true } : {}) };
  const res = applyXp(s.level, s.xp, gained);
  s.level = res.level;
  s.xp = res.xp;
  return { stored: true, first, record, gained, leveledUp: res.leveledUp, level: res.level };
}
