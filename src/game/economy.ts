import { CHARM_BONUS, GLOVES_CONTROL, LANTERN_NIGHT_LUCK, LURE_CHARGES, VEST_SLOTS, perkById } from '../data/casino';
import { COS_SLOTS, cosById, isFace, type CosSlot } from '../data/cosmetics';
import { BAITS, FISH, RODS, byId, type BaitType, type Fish } from '../data/content';
import { applyXp, catchXp, eligibleFish, fishingSpot, pickFish, rollSize, sellValue, SHINY_CHANCE, SHINY_CHANCE_NIGHT, SPOTS, type SpotId } from './progression';
import { BAIT_STACK, type SaveData, type Slot } from './state';

/** Pure save mutations. The server runs these authoritatively; the client mirrors them optimistically. */

const ROD_LEVEL_OK = (s: SaveData, id: string) => {
  const r = RODS.find((x) => x.id === id);
  return !!r && s.level >= r.unlockLevel;
};

export const freeSlots = (s: SaveData): number => s.slots.filter((sl) => !sl).length;
export const hasRod = (s: SaveData, id: string): boolean => s.slots.some((sl) => sl?.k === 'rod' && sl.id === id);
/** Carried in the hotbar or kept in the locker. */
export const ownsRod = (s: SaveData, id: string): boolean => hasRod(s, id) || s.locker.rods.includes(id);

export const LOCKER_CAP = 200;

/** Bait of this type in the hotbar and the locker. */
export function baitCount(s: SaveData, id: string): number {
  return s.slots.reduce((a, sl) => a + (sl?.k === 'bait' && sl.id === id ? sl.n : 0), 0) + (s.locker.bait[id] ?? 0);
}

const lockerBait = (s: SaveData, id: string): number => s.locker.bait[id] ?? 0;
function addLocker(s: SaveData, id: string, n: number): void {
  const total = lockerBait(s, id) + n;
  if (total > 0) s.locker.bait[id] = total;
  else delete s.locker.bait[id];
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

/** Stall prices: bait is sold in packs, rods one at a time. Purchases go to the tackle locker. */
export function buyRod(s: SaveData, id: string): boolean {
  const r = RODS.find((x) => x.id === id);
  if (!r || !ROD_LEVEL_OK(s, id) || s.coins < r.price || ownsRod(s, id)) return false;
  s.coins -= r.price;
  s.locker.rods.push(id);
  const cur = RODS.find((x) => x.id === s.rod);
  if (!hasRod(s, s.rod) || !cur || r.tier > cur.tier) equipRod(s, id);
  return true;
}

export function buyBait(s: SaveData, id: string): boolean {
  const b = BAITS.find((x) => x.id === id);
  if (!b) return false;
  const cost = b.price * BAIT_PACK;
  if (s.level < b.unlockLevel || s.coins < cost || lockerBait(s, id) + BAIT_PACK > LOCKER_CAP) return false;
  s.coins -= cost;
  addLocker(s, id, BAIT_PACK);
  const cur = BAITS.find((x) => x.id === s.bait);
  const carried = s.slots.some((sl) => sl?.k === 'bait' && sl.id === s.bait);
  if (!carried || (cur && b.tier > cur.tier)) equipBait(s, id);
  else refillBait(s);
  return true;
}

/** Index of the rod slot in use (the active rod's slot, else any rod slot). */
function rodSlot(s: SaveData): number {
  const i = s.slots.findIndex((sl) => sl?.k === 'rod' && sl.id === s.rod);
  return i >= 0 ? i : s.slots.findIndex((sl) => sl?.k === 'rod');
}

/** Puts an owned rod into the hotbar rod slot, sending the rod it replaces back to the locker. */
export function equipRod(s: SaveData, id: string): boolean {
  const r = RODS.find((x) => x.id === id);
  if (!r || !ownsRod(s, id)) return false;
  if (hasRod(s, id)) {
    s.rod = id;
    return true;
  }
  let i = rodSlot(s);
  if (i < 0) i = s.slots.indexOf(null);
  if (i < 0) return false;
  const old = s.slots[i];
  if (old?.k === 'rod') s.locker.rods.push(old.id);
  s.locker.rods = s.locker.rods.filter((x) => x !== id);
  s.slots[i] = { k: 'rod', id };
  s.rod = id;
  return true;
}

/** Equips a bait type: the current stack goes back to the locker and a fresh stack comes out. */
export function equipBait(s: SaveData, id: string): boolean {
  const b = BAITS.find((x) => x.id === id);
  if (!b || s.level < b.unlockLevel || baitCount(s, id) <= 0) return false;
  let i = activeSlot(s);
  if (i < 0) i = s.slots.findIndex((sl) => sl?.k === 'bait');
  const cur = i >= 0 ? s.slots[i] : null;
  if (cur?.k === 'bait' && cur.id === id) {
    s.bait = id;
    refillBait(s);
    return true;
  }
  if (i < 0) i = s.slots.indexOf(null);
  if (i < 0) return false;
  if (cur?.k === 'bait') addLocker(s, cur.id, cur.n);
  const n = Math.min(BAIT_STACK, lockerBait(s, id));
  addLocker(s, id, -n);
  s.slots[i] = { k: 'bait', id: id as BaitType, n };
  s.bait = id as BaitType;
  return true;
}

/** Tops the active bait stack up from the locker. */
export function refillBait(s: SaveData): void {
  const sl = s.slots[activeSlot(s)];
  if (sl?.k !== 'bait') return;
  const add = Math.min(BAIT_STACK - sl.n, lockerBait(s, sl.id));
  if (add <= 0) return;
  sl.n += add;
  addLocker(s, sl.id, -add);
}

/** Moves a rod or bait stack from the hotbar into the locker to free the slot. */
export function stowSlot(s: SaveData, i: number): boolean {
  const sl = s.slots[i];
  if (!Number.isInteger(i) || !sl || sl.k === 'fish') return false;
  if (sl.k === 'bait') {
    if (lockerBait(s, sl.id) + sl.n > LOCKER_CAP) return false;
    addLocker(s, sl.id, sl.n);
  } else s.locker.rods.push(sl.id);
  s.slots[i] = null;
  return true;
}

export const WHEEL_WIN = 0.45;
export const WHEEL_RANGE = 4;

/** What a carried fish sells for, including any wheel winnings. */
export const fishValue = (item: { fishId: string; size: number; mult?: number; shiny?: boolean }): number =>
  sellValue(byId(FISH, item.fishId), item.size, item.shiny) * (item.mult ?? 1);

/** Sell-value bonus from the best Lucky Charm owned. */
export function charmBonus(s: Pick<SaveData, 'perks'>): number {
  for (const id of ['charm3', 'charm2', 'charm1'] as const) if (s.perks.includes(id)) return CHARM_BONUS[id];
  return 0;
}

/** Coins a fish sells for. Lucky Charms are baked into the fish's `mult` when it is caught. */
export const sellPrice = (_s: Pick<SaveData, 'perks'>, item: { fishId: string; size: number; mult?: number; shiny?: boolean }): number =>
  Math.round(fishValue(item));

/** Rod control with the Quick-Reel Gloves on. */
export const reelControl = (s: Pick<SaveData, 'perks'>, base: number): number => (s.perks.includes('gloves') ? base * GLOVES_CONTROL : base);

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
  s.coins += sellPrice(s, item);
  s.slots[s.held] = null;
  return true;
}

/** Sells the fish in a specific hotbar slot. */
export function sellSlot(s: SaveData, i: number): boolean {
  const item = s.slots[i];
  if (!Number.isInteger(i) || item?.k !== 'fish') return false;
  s.coins += sellPrice(s, item);
  s.slots[i] = null;
  return true;
}

/** Spends chips on a casino perk. Consumables stack; everything else is bought once. */
export function buyPerk(s: SaveData, id: string): boolean {
  const p = perkById(id);
  if (!p || s.chips < p.chips) return false;
  if (p.requires && !s.perks.includes(p.requires)) return false;
  if (!p.consumable && s.perks.includes(p.id)) return false;
  s.chips = Math.round((s.chips - p.chips) * 10) / 10;
  if (p.id === 'lure') s.lure += LURE_CHARGES;
  else s.perks.push(p.id);
  if (p.id === 'vest') for (let i = 0; i < VEST_SLOTS; i++) s.slots.push(null);
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

export function setFace(s: SaveData, face: unknown): boolean {
  if (!isFace(face)) return false;
  s.look.face = face;
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
  if (--sl.n <= 0) {
    s.slots[i] = null;
    const next = Math.min(BAIT_STACK, lockerBait(s, sl.id));
    if (next > 0) {
      s.slots[i] = { k: 'bait', id: sl.id, n: next };
      addLocker(s, sl.id, -next);
    }
  }
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
  return freeSlots(s) > 0 || (sl.n === 1 && lockerBait(s, sl.id) === 0) ? 'ok' : 'full';
}

export const CAST_MESSAGES: Record<Exclude<CastCheck, 'ok'>, string> = {
  norod: 'No rod equipped - open your inventory (Tab) to equip one.',
  nobait: 'Out of bait! Buy more at the shop, then equip it in your inventory (Tab).',
  hands: 'Hold your rod (1-5) to cast.',
  full: 'Your hotbar is full - sell or drop something first.',
};

export interface Roll {
  fishId: string | null;
  size: number;
  /** Seconds until the fish bites. */
  wait: number;
  shiny?: boolean;
  perfect?: boolean;
  spot?: string;
}

export function rollCast(s: SaveData, locationId: string, rng: () => number = Math.random, perfect = false, spot: SpotId = 'prime', night = false): Roll {
  const rod = byId(RODS, s.rod);
  const bait = byId(BAITS, s.bait);
  const fish = pickFish(eligibleFish(locationId, rod, bait, night), rod, bait, rng, perfect, spot, night, s.perks.includes('lantern') ? LANTERN_NIGHT_LUCK : 1);
  const lure = !!fish && s.lure > 0;
  if (lure) s.lure--;
  return {
    perfect,
    spot,
    fishId: fish?.id ?? null,
    size: fish ? rollSize(fish, rng) : 0,
    wait: ((3.5 + rng() * 6) / bait.luck) * SPOTS[spot].wait,
    shiny: lure || (!!fish && rng() < (night ? SHINY_CHANCE_NIGHT : SHINY_CHANCE)),
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
  const bonus = charmBonus(s);
  s.slots[slot] = { k: 'fish', fishId: fish.id, size, ...(shiny ? { shiny: true } : {}), ...(bonus > 0 ? { mult: 1 + bonus } : {}) };
  const value = Math.round(sellValue(fish, size, shiny) * (1 + bonus));
  if (!s.best || value > s.best.value) s.best = { fishId: fish.id, size, value, ...(shiny ? { shiny: true } : {}) };
  const res = applyXp(s.level, s.xp, gained);
  s.level = res.level;
  s.xp = res.xp;
  return { stored: true, first, record, gained, leveledUp: res.leveledUp, level: res.level };
}

export const BOTTLE_COINS = 40;
export const BOTTLE_BONUS = 300;

/** Opens a bottle; returns the coins gained (0 if already found or unknown). */
export function collectBottle(s: SaveData, id: string, all: string[]): number {
  if (!all.includes(id) || s.bottles.includes(id)) return 0;
  s.bottles.push(id);
  const gain = BOTTLE_COINS + (all.every((b) => s.bottles.includes(b)) ? BOTTLE_BONUS : 0);
  s.coins += gain;
  return gain;
}
