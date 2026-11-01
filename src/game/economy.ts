import { CHARM_BONUS, GLOVES_CONTROL, LANTERN_NIGHT_LUCK, LURE_CHARGES, VEST_SLOTS, perkById } from '../data/casino';
import { COS_SLOTS, cosById, isFace, type CosShop, type CosSlot } from '../data/cosmetics';
import { BAITS, DEEP_SEA_LINE, FISH, LINES, RODS, byId, type Bait, type BaitType, type Fish, type Line, type Rod } from '../data/content';
import { ROD_LEVEL, SEA_LINE } from '../data/dive';
import { TITLES, type Rank } from '../data/ranks';
import { applyXp, catchXp, eligibleFish, grantRanks, levelGifts, type Gifts, pickFish, reelDifficulty, rollSize, rollTag, sellValue, sizeDifficulty, SHINY_CHANCE, SHINY_CHANCE_NIGHT, SPOTS, type FishTag, type SpotId } from './progression';
import type { Difficulty, FightDifficulty } from './reel';
import type { DishId, StageId } from '../data/smokehouse';
import { buff, openStages, serveGifts, shinyMult } from './smoke';
import { pullWord, rollSeaFish, seaDifficulty, type SeaGear } from './dive';
import { DIVE, type Behaviour } from '../data/dive';
import { BAIT_SLOT, BAIT_STACK, ROD_SLOT, clearSlot, freeFishSlot, freeSlots, slotCount, type SaveData, type Slot } from './state';

/** Pure save mutations. The server runs these authoritatively; the client mirrors them optimistically. */

const ROD_LEVEL_OK = (s: SaveData, id: string) => {
  const r = RODS.find((x) => x.id === id);
  return !!r && s.level >= r.unlockLevel;
};

export { clearSlot, freeSlots } from './state';

export const hasRod = (s: SaveData, id: string): boolean => s.slots.some((sl) => sl?.k === 'rod' && sl.id === id);
/** Carried in the hotbar or kept in the locker. */
export const ownsRod = (s: SaveData, id: string): boolean => hasRod(s, id) || s.locker.rods.includes(id);

/**
 * Whether the HUD's Black Pearl box shows: from the first pearl a player earns, and still after spending them all
 * (pearls only go on rod levels, so a level means pearls were earned). Hidden before that, so it doesn't sit at 0
 * through the early game. A new pearl spend (the sea line, say) should count here too.
 */
export const showPearlBox = (s: SaveData): boolean => s.pearls > 0 || s.rodLevel > 0;

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

/** The slot that bait is currently drawn from: the bait slot, while it holds the selected type. */
export function activeSlot(s: SaveData): number {
  const sl = s.slots[BAIT_SLOT];
  return sl?.k === 'bait' && sl.id === s.bait ? BAIT_SLOT : -1;
}

/** How many more of this bait can be carried: topping up the bait slot (if empty or the same type), then the locker. */
function baitRoom(s: SaveData, id: string): number {
  const sl = s.slots[BAIT_SLOT];
  const slot = !sl ? BAIT_STACK : sl.k === 'bait' && sl.id === id ? BAIT_STACK - sl.n : 0;
  return slot + Math.max(0, LOCKER_CAP - lockerBait(s, id));
}

/** Takes the slot in hand: the rod and bait slots make that rod / bait the active one, fish are simply held. */
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

/** The line on the rod: the Deep Sea Line once it's levelled, else the pond line bought (Twine if the save's is unknown). */
export const lineOf = (s: Pick<SaveData, 'line'> & { seaLine?: number }): Line =>
  (s.seaLine ?? 0) > 0 ? DEEP_SEA_LINE : LINES.find((l) => l.id === s.line) ?? LINES[0];

/** Whether a pond line is below the one on the rod, so it can't be bought: a lower tier, or any once the Deep Sea Line is on. */
export const lineBeaten = (s: Pick<SaveData, 'line' | 'seaLine'>, l: Line): boolean => s.seaLine > 0 || l.tier < lineOf(s).tier;

/** The line's name as shown: "Deep Sea Line +3" once levelled, else the pond line's. */
export const lineName = (s: Pick<SaveData, 'line'> & { seaLine?: number }): string => lineOf(s).name + ((s.seaLine ?? 0) > 0 ? ` +${s.seaLine}` : '');

/** What stands between this player's gear and a species: the line to hold it, the rod to land it in good time, the bait to hook it. */
export function gearNeeds(s: Pick<SaveData, 'rod' | 'line' | 'bait'>, fish: Fish): { line: Line | null; rod: Rod | null; bait: Bait | null } {
  const rod = byId(RODS, s.rod);
  const bait = byId(BAITS, s.bait);
  return {
    line: fish.tier > lineOf(s).tier ? LINES.find((l) => l.tier === fish.tier) ?? null : null,
    rod: fish.tier > rod.tier ? RODS.find((r) => r.tier === fish.tier) ?? null : null,
    bait: fish.tier > bait.tier ? BAITS.find((b) => b.tier === fish.tier) ?? null : null,
  };
}

/**
 * A fish lost to a gear wall (over the rod or the line) goes into the Fishdex as *seen*, so the loss pays out as a
 * shopping list (REELING.md, "A wall loss pays out as information"). Fish the gear handles, or already caught, don't.
 */
export function recordSighting(s: SaveData, fish: Fish): boolean {
  const need = gearNeeds(s, fish);
  if ((!need.line && !need.rod) || s.dex[fish.id] || s.seen.includes(fish.id)) return false;
  s.seen.push(fish.id);
  return true;
}

/** Spools a better line onto the rod: a step up from the current one, unlocked and paid for. There is nothing to carry. */
export function buyLine(s: SaveData, id: string): boolean {
  const l = LINES.find((x) => x.id === id);
  if (!l || s.level < l.unlockLevel || s.coins < l.price || l.tier <= lineOf(s).tier || s.seaLine > 0) return false;
  s.coins -= l.price;
  s.line = id;
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

/** Puts an owned rod into the rod slot, sending the rod it replaces back to the locker. */
export function equipRod(s: SaveData, id: string): boolean {
  const r = RODS.find((x) => x.id === id);
  if (!r || !ownsRod(s, id)) return false;
  const old = s.slots[ROD_SLOT];
  if (old?.k === 'rod' && old.id === id) {
    s.rod = id;
    return true;
  }
  if (old?.k === 'rod') s.locker.rods.push(old.id);
  s.locker.rods = s.locker.rods.filter((x) => x !== id);
  s.slots[ROD_SLOT] = { k: 'rod', id };
  s.rod = id;
  return true;
}

/** What taking the Aurora Rod from +n-1 to +n costs. */
export function rodLevelCost(n: number): { coins: number; pearls: number } {
  const L = ROD_LEVEL;
  return { coins: Math.min(L.coinCap, L.coins + L.coinsPer * n), pearls: L.pearls + L.pearlsPer * n };
}

/** The next Aurora Rod level, paid in coins and Black Pearls. The level is the player's, so it stays if the rod is dropped. */
export function levelRod(s: SaveData): boolean {
  const cost = rodLevelCost(s.rodLevel + 1);
  if (!ownsRod(s, ROD_LEVEL.rod) || s.coins < cost.coins || s.pearls < cost.pearls) return false;
  s.coins -= cost.coins;
  s.pearls -= cost.pearls;
  s.rodLevel++;
  return true;
}

/** What taking the Deep Sea Line from +n-1 to +n costs. */
export function seaLineCost(n: number): { coins: number; pearls: number } {
  const L = SEA_LINE;
  return { coins: Math.min(L.coinCap, L.coins + L.coinsPer * n), pearls: L.pearls + L.pearlsPer * n };
}

/** The next Deep Sea Line level, paid in coins and Black Pearls. Needs the Aurora Rod, as the rod's levels do. */
export function levelSeaLine(s: SaveData): boolean {
  const cost = seaLineCost(s.seaLine + 1);
  if (!ownsRod(s, ROD_LEVEL.rod) || s.coins < cost.coins || s.pearls < cost.pearls) return false;
  s.coins -= cost.coins;
  s.pearls -= cost.pearls;
  s.seaLine++;
  return true;
}

/** The rod level a sea fight uses (`seaDifficulty`): the Aurora Rod's while it's the rod in use. */
export const seaRodLevel = (s: SaveData): number => rodLevelOf(s, s.rod);

/** The levels a sea fight is eased by: the rod's (weight) and the Deep Sea Line's (strength). */
export const seaGear = (s: SaveData): SeaGear => ({ rod: seaRodLevel(s), line: s.seaLine });

/** This rod's level: the save's rod level for the Aurora Rod, 0 for the others. */
export const rodLevelOf = (s: SaveData, id: string): number => (id === ROD_LEVEL.rod ? s.rodLevel : 0);

/** A rod's level as shown after its name: " +12" on a levelled Aurora Rod, else nothing. */
export const rodPlus = (s: SaveData, id: string): string => (rodLevelOf(s, id) > 0 ? ` +${s.rodLevel}` : '');

/** Equips a bait type: the stack in the bait slot goes back to the locker and a fresh stack comes out. */
export function equipBait(s: SaveData, id: string): boolean {
  const b = BAITS.find((x) => x.id === id);
  if (!b || s.level < b.unlockLevel || baitCount(s, id) <= 0) return false;
  const cur = s.slots[BAIT_SLOT];
  if (cur?.k === 'bait' && cur.id === id) {
    s.bait = id;
    refillBait(s);
    return true;
  }
  if (cur?.k === 'bait') addLocker(s, cur.id, cur.n);
  const n = Math.min(BAIT_STACK, lockerBait(s, id));
  addLocker(s, id, -n);
  s.slots[BAIT_SLOT] = { k: 'bait', id: id as BaitType, n };
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

/** What a carried fish sells for, including any casino winnings. */
export const fishValue = (item: { fishId: string; size: number; mult?: number; shiny?: boolean }): number =>
  sellValue(byId(FISH, item.fishId), item.size, item.shiny) * (item.mult ?? 1);

/** A fresh catch's value multiplier: the best Lucky Charm times a 💰 snack or dish. */
export const catchMult = (s: Pick<SaveData, 'perks' | 'smoke'>): number => (1 + charmBonus(s)) * (1 + (buff(s, 'coins')?.bonus ?? 0));

/** Sell-value bonus from the best Lucky Charm owned. */
export function charmBonus(s: Pick<SaveData, 'perks'>): number {
  for (const id of ['charm3', 'charm2', 'charm1'] as const) if (s.perks.includes(id)) return CHARM_BONUS[id];
  return 0;
}

/** Coins a fish sells for. Lucky Charms are baked into the fish's `mult` when it is caught. */
export const sellPrice = (_s: Pick<SaveData, 'perks'>, item: { fishId: string; size: number; mult?: number; shiny?: boolean }): number =>
  Math.round(fishValue(item));

/** The perks that are actually working for this player, with what each one does right now. */
export function activePerks(s: Pick<SaveData, 'perks' | 'lure' | 'lureOff'>): { id: string; icon: string; name: string; effect: string }[] {
  const out: { id: string; icon: string; name: string; effect: string }[] = [];
  const add = (id: string, effect: string) => {
    const p = perkById(id)!;
    out.push({ id, icon: p.icon, name: p.name, effect });
  };
  // Lucky Charms replace each other, so only the best one counts.
  const charm = (['charm3', 'charm2', 'charm1'] as const).find((id) => s.perks.includes(id));
  if (charm) add(charm, `Fish worth +${Math.round(CHARM_BONUS[charm] * 100)}%`);
  if (s.perks.includes('gloves')) add('gloves', `Fights ×${GLOVES_CONTROL} easier`);
  if (s.perks.includes('lantern')) add('lantern', `Night luck ×${LANTERN_NIGHT_LUCK}`);
  if (s.perks.includes('vest')) add('vest', `+${VEST_SLOTS} hotbar slots`);
  if (s.lure > 0) add('lure', s.lureOff ? `Shiny Lure off · ${s.lure} saved` : `${s.lure} shiny cast${s.lure === 1 ? '' : 's'} left`);
  return out;
}

/** The next cast that hooks a fish spends a Shiny Lure charge, unless the player switched it off. */
export const lureOn = (s: Pick<SaveData, 'lure' | 'lureOff'>): boolean => s.lure > 0 && !s.lureOff;

/** Switches the Shiny Lure on or off; its charges stay either way. */
export function setLure(s: SaveData, on: unknown): boolean {
  if (typeof on !== 'boolean' || s.lureOff === !on) return false;
  s.lureOff = !on;
  return true;
}

/** Rod control with the Quick-Reel Gloves on. */
export const reelControl = (s: Pick<SaveData, 'perks'>, base: number): number => (s.perks.includes('gloves') ? base * GLOVES_CONTROL : base);

/** Sells the fish in hand. */
export function sellHeld(s: SaveData): boolean {
  const item = s.slots[s.held];
  if (item?.k !== 'fish') return false;
  s.coins += sellPrice(s, item);
  clearSlot(s, s.held);
  return true;
}

/** Sells the fish in a specific hotbar slot. */
export function sellSlot(s: SaveData, i: number): boolean {
  const item = s.slots[i];
  if (!Number.isInteger(i) || item?.k !== 'fish') return false;
  s.coins += sellPrice(s, item);
  clearSlot(s, i);
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
  // Extra slots holding leftover fish become ordinary ones first.
  if (p.id === 'vest') while (s.slots.length < slotCount(s)) s.slots.push(null);
  return true;
}

/**
 * Buys a cosmetic at the counter the player stands at (`at`). Stall items cost coins and are sold
 * only at the stall; casino items cost chips and are sold only at the prize counter.
 */
export function buyCosmetic(s: SaveData, id: string, at: CosShop = 'stall'): boolean {
  const c = cosById(id);
  // Earned outfits come only with a rank, never from a counter.
  if (!c || c.shop === 'earned' || c.shop !== at || s.owned.includes(id)) return false;
  if (c.shop === 'casino') {
    if (s.chips < c.price) return false;
    s.chips = Math.round((s.chips - c.price) * 10) / 10;
  } else {
    if (s.coins < c.price) return false;
    s.coins -= c.price;
  }
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

/**
 * Removes the item in hand and returns it, or null if it cannot be dropped (empty hand, or your only rod).
 * The rod slot is never left empty: the best other rod comes out of the locker. A dropped bait stack is
 * replaced from the locker like a used-up one.
 */
export function dropHeld(s: SaveData): Slot | null {
  const item = s.slots[s.held];
  if (!item) return null;
  if (item.k === 'rod') {
    const next = RODS.filter((r) => s.locker.rods.includes(r.id)).sort((a, b) => b.tier - a.tier)[0];
    if (!next) return null;
    s.slots[s.held] = null;
    equipRod(s, next.id);
    return item;
  }
  if (item.k === 'bait') {
    s.slots[s.held] = null;
    const next = Math.min(BAIT_STACK, lockerBait(s, item.id));
    if (next > 0) {
      s.slots[s.held] = { k: 'bait', id: item.id, n: next };
      addLocker(s, item.id, -next);
    }
    return item;
  }
  clearSlot(s, s.held);
  return item;
}

/** Whether a dropped item can be picked up: fish need a free fish slot, rods must be new to you, bait needs room. */
export function canTake(s: SaveData, item: Slot): boolean {
  if (item.k === 'bait') return baitRoom(s, item.id) >= item.n;
  if (item.k === 'rod') return !ownsRod(s, item.id) && RODS.some((r) => r.id === item.id);
  return freeSlots(s) > 0;
}

/** Picks an item up. Rods and bait go to their own slot when it's empty (or holds the same bait), else to the locker. */
export function takeItem(s: SaveData, item: Slot): boolean {
  if (!canTake(s, item)) return false;
  if (item.k === 'fish') s.slots[freeFishSlot(s)] = item;
  else if (item.k === 'rod') {
    s.locker.rods.push(item.id);
    if (!s.slots[ROD_SLOT]) equipRod(s, item.id);
  } else {
    let n = item.n;
    const sl = s.slots[BAIT_SLOT];
    if (!sl) {
      s.slots[BAIT_SLOT] = { k: 'bait', id: item.id, n: 0 };
      s.bait = item.id;
    }
    const cur = s.slots[BAIT_SLOT];
    if (cur?.k === 'bait' && cur.id === item.id) {
      const add = Math.min(n, BAIT_STACK - cur.n);
      cur.n += add;
      n -= add;
    }
    addLocker(s, item.id, n);
  }
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

/** A cast needs a rod, bait, the rod in hand, and a free fish slot for the catch. */
export function canCast(s: SaveData): CastCheck {
  if (!hasRod(s, s.rod)) return 'norod';
  const held = s.slots[s.held];
  if (held?.k !== 'rod') return 'hands';
  const sl = s.slots[activeSlot(s)];
  if (sl?.k !== 'bait') return 'nobait';
  return freeSlots(s) > 0 ? 'ok' : 'full';
}

/** Whether the player can cast here. At sea no bait is spent and the catch is sold as it's landed, so only the rod matters. */
export function canCastAt(s: SaveData, sea: boolean): CastCheck {
  const c = canCast(s);
  return sea && (c === 'nobait' || c === 'full') ? 'ok' : c;
}

export const CAST_MESSAGES: Record<Exclude<CastCheck, 'ok'>, string> = {
  norod: 'No rod equipped - open your inventory (Tab) to equip one.',
  nobait: 'Out of bait! Buy more at the shop, then equip it in your inventory (Tab).',
  hands: 'Hold your rod (1) to cast.',
  full: 'Your fish slots are full - sell or drop a fish first.',
};

export interface Roll {
  fishId: string | null;
  size: number;
  /** Seconds until the fish bites. */
  wait: number;
  shiny?: boolean;
  perfect?: boolean;
  spot?: string;
  /** The fight, with a fish: its reel seed and difficulty. The server replays the catch from these. */
  seed?: number;
  d?: Difficulty;
  /** How a sea fish fights (`BEHAVIOUR_TUNE`); pond fish have none. */
  b?: Behaviour;
  /** A Feisty or Brutish pond fish (`rollTag`). */
  tag?: FishTag;
  /** A sea fish that pulls well above or below its depth's norm (`pullWord`), for the hook toast. */
  pull?: 'strong' | 'light';
}

/** A hooked fish's fight difficulty on the save's rod and line, Quick-Reel Gloves included. */
export function fightDifficulty(s: SaveData, fish: Fish, shiny: boolean, size: number, tag: FishTag | null = null): FightDifficulty {
  const rod = byId(RODS, s.rod);
  return reelDifficulty(fish, { ...rod, control: reelControl(s, rod.control) }, lineOf(s), shiny, size, tag);
}

export function rollCast(s: SaveData, locationId: string, rng: () => number = Math.random, perfect = false, spot: SpotId = 'prime', night = false): Roll {
  const rod = byId(RODS, s.rod);
  const bait = byId(BAITS, s.bait);
  const fish = pickFish(eligibleFish(locationId, rod, bait, night), rod, bait, rng, perfect, spot, night, s.perks.includes('lantern') ? LANTERN_NIGHT_LUCK : 1);
  const lure = !!fish && lureOn(s);
  if (lure) s.lure--;
  const size = fish ? rollSize(fish, rng) : 0;
  const wait = ((3.5 + rng() * 6) / bait.luck) * SPOTS[spot].wait;
  // A dish's ✨ multiplies the shiny chance.
  const shiny = lure || (!!fish && rng() < (night ? SHINY_CHANCE_NIGHT : SHINY_CHANCE) * shinyMult(s));
  const roll: Roll = { perfect, spot, fishId: fish?.id ?? null, size, wait, shiny };
  if (fish) {
    roll.seed = Math.floor(rng() * 4294967296);
    const tag = rollTag(fish, rod, lineOf(s), rng);
    if (tag) roll.tag = tag;
    roll.d = fightDifficulty(s, fish, shiny, size, tag);
  }
  return roll;
}

/**
 * A cast on a dive: the fish comes from the depth's zone (`rollSeaFish`) and fights at the depth's difficulty on the
 * Aurora Rod's levels, its size on the weight and its pull roll on the strength, whatever the bait. No bait is spent.
 * Shinies roll as in the daytime pond, Shiny Lure included; a shiny sea fish is worth more, not harder.
 */
export function rollSeaCast(s: SaveData, depth: number, rng: () => number = Math.random): Roll {
  const bite = rollSeaFish(depth, rng);
  const lure = lureOn(s);
  if (lure) s.lure--;
  const size = rollSize(bite.fish, rng);
  const wait = DIVE.biteMin + rng() * DIVE.biteSpread;
  const shiny = lure || rng() < SHINY_CHANCE * shinyMult(s);
  const d = seaDifficulty(depth, seaGear(s), bite.fish, bite.pull, sizeDifficulty(bite.fish, size));
  const roll: Roll = { fishId: bite.fish.id, size, wait, shiny, seed: Math.floor(rng() * 4294967296), d };
  if (bite.behaviour) roll.b = bite.behaviour;
  const word = pullWord(bite.pull);
  if (word) roll.pull = word;
  return roll;
}

export interface CatchResult {
  /** False when there was no free fish slot, so the fish got away. */
  stored: boolean;
  first: boolean;
  record: boolean;
  gained: number;
  leveledUp: boolean;
  level: number;
  /** Ranks reached with this catch (their titles and outfits are already given). */
  ranks: Rank[];
  /** The snack or dish that added XP, coins or the shiny chance to this catch, for the catch card's credit. */
  xpFrom?: string;
  coinFrom?: string;
  shinyFrom?: string;
  /** Smokehouse stages this catch opened. */
  stages: StageId[];
  /** Level gifts past 50 this catch turned into dishes in the Pantry. */
  gift?: { id: DishId; n: number };
  /** The fish's value multiplier: Lucky Charm, 💰 snack or dish, and the clean catch bonus. */
  mult: number;
  /** Coins for a fish sold as it was landed (on a dive), instead of going in a slot. */
  sold?: number;
}

/** A clean catch (landed without fraying the line) is worth this much more. */
export const CLEAN_BONUS = 0.1;
/** A Feisty or Brutish fish landed is worth this much more, on top of a clean catch (REELING.md, "Temperament"). */
export const TAG_BONUS = 0.15;

/** Lands a fish: XP, the Fishdex, the best catch and ranks, then into a free fish slot, or with `sell` straight to coins (dives). */
export function applyCatch(s: SaveData, fish: Fish, size: number, shiny = false, clean = false, sell = false, tag: FishTag | null = null): CatchResult {
  const slot = sell ? -1 : freeFishSlot(s);
  if (slot < 0 && !sell) return { stored: false, first: false, record: false, gained: 0, leveledUp: false, level: s.level, ranks: [], stages: [], mult: 1 };
  const entry = s.dex[fish.id];
  const first = !entry;
  // Smokehouse snacks and dishes apply at catch, like the Lucky Charms: ⭐ into the XP, 💰 into the fish's value.
  const xp = buff(s, 'xp');
  const coin = buff(s, 'coins');
  const sh = shiny ? buff(s, 'shiny') : null;
  const gained = Math.round(catchXp(fish, size, first, shiny) * (1 + (xp?.bonus ?? 0)));
  const record = !!entry && size > entry.best;
  const shinies = (entry?.shiny ?? 0) + (shiny ? 1 : 0);
  s.dex[fish.id] = { count: (entry?.count ?? 0) + 1, best: Math.max(size, entry?.best ?? 0), ...(shinies ? { shiny: shinies } : {}) };
  s.seen = s.seen.filter((id) => id !== fish.id);
  const mult = catchMult(s) * (clean ? 1 + CLEAN_BONUS : 1) * (tag ? 1 + TAG_BONUS : 1);
  const item: Slot = { k: 'fish', fishId: fish.id, size, ...(shiny ? { shiny: true } : {}), ...(mult > 1 ? { mult } : {}) };
  const sold = sell ? sellPrice(s, item) : 0;
  if (sell) s.coins += sold;
  else s.slots[slot] = item;
  const value = Math.round(sellValue(fish, size, shiny) * mult);
  if (!s.best || value > s.best.value) s.best = { fishId: fish.id, size, value, ...(shiny ? { shiny: true } : {}) };
  const before = s.level;
  const ranks = gainXp(s, gained);
  const stages = openStages(s).ids;
  const gift = serveGifts(s);
  return {
    stored: true, first, record, gained, leveledUp: s.level > before, level: s.level, ranks, stages, mult, ...(sell ? { sold } : {}),
    ...(xp ? { xpFrom: xp.from } : {}), ...(coin ? { coinFrom: coin.from } : {}), ...(sh ? { shinyFrom: sh.from } : {}), ...(gift ? { gift } : {}),
  };
}

/** Adds XP: levels up, gives the gifts for levels past 50 and any ranks reached, and returns those ranks. */
export function gainXp(s: SaveData, xp: number): Rank[] {
  const before = s.level;
  const res = applyXp(s.level, s.xp, xp);
  s.level = res.level;
  s.xp = res.xp;
  const g = levelGifts(before, s.level);
  s.gifts.provisions += g.provisions;
  s.gifts.fares += g.fares;
  return grantRanks(s);
}

/** Back-paid levels give at most this many provisions and fares, so nobody gets dozens at once. */
export const BACKPAY_GIFTS: Gifts = { provisions: 5, fares: 1 };

/** Pays out the XP the old level-50 cap threw away (see `SaveData.backPay`), once. */
export function payBack(s: SaveData): { levels: number; ranks: Rank[] } {
  if (s.backPay.paid) return { levels: 0, ranks: [] };
  const before = s.level;
  const res = applyXp(s.level, s.xp, s.backPay.xp);
  s.level = res.level;
  s.xp = res.xp;
  const g = levelGifts(before, s.level);
  s.gifts.provisions += Math.min(g.provisions, BACKPAY_GIFTS.provisions);
  s.gifts.fares += Math.min(g.fares, BACKPAY_GIFTS.fares);
  s.backPay.paid = true;
  return { levels: s.level - before, ranks: grantRanks(s) };
}

/** Wears an earned title under the name tag, or none (null). */
export function setTitle(s: SaveData, id: unknown): boolean {
  if (id !== null && (typeof id !== 'string' || !s.titles.includes(id) || !TITLES.some((t) => t.id === id))) return false;
  if (s.title === id) return false;
  s.title = id;
  return true;
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

/** Worms dug from the beach patch: one stall pack, free. */
export const DIG_WORMS = BAIT_PACK;
export const DIG_RANGE = 2.6;
/** Between digs, so dropping worms and digging again can't farm them. */
export const DIG_COOLDOWN_MS = 30_000;
export const DIG_WAIT = 'The worms need a moment to come back up. Try again shortly.';
export const DIG_HINT = 'Out of bait and coins? Dig for free worms on the beach left of the pier.';

/** The safety net: only players with no bait at all who can't afford a worm pack may dig. */
export function canDig(s: SaveData): boolean {
  const worm = byId(BAITS, 'worm');
  return BAITS.every((b) => baitCount(s, b.id) === 0) && s.coins < worm.price * BAIT_PACK;
}

/** Digs up a pack of worms and puts them in the bait slot; returns the worms gained. */
export function digWorms(s: SaveData): number {
  if (!canDig(s)) return 0;
  addLocker(s, 'worm', DIG_WORMS);
  equipBait(s, 'worm');
  return DIG_WORMS;
}
