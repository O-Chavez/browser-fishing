import { BAITS, FISH, RODS, type BaitType } from '../data/content';
import { VEST_SLOTS } from '../data/casino';
import { cleanLook, defaultLook, isFace, randomFace, type Look } from '../data/cosmetics';
import { isFreshSave } from './progression';
import { TIP_IDS, isTip } from './tips';

export interface DexEntry { count: number; best: number }

export const SLOT_COUNT = 5;
/** Hotbar size: the base five, plus the Tackle Vest's extra slots. */
export const slotCount = (s: { perks?: string[] }): number => SLOT_COUNT + (s.perks?.includes('vest') ? VEST_SLOTS : 0);
/** One hotbar slot holds a whole supply of a bait type; anything beyond waits in the tackle locker. */
export const BAIT_STACK = 99;
/** Slot 1 always holds the rod in use and slot 2 the bait in use, so fish can't crowd them out. */
export const ROD_SLOT = 0;
export const BAIT_SLOT = 1;
/** Every slot from here on holds a fish (or nothing). */
export const FISH_SLOT = 2;

/**
 * The hotbar is everything carried: the rod slot, the bait slot (a stack of one bait type), then fish.
 * Extra slots past `slotCount` only hold fish left over from an older save, and go once emptied.
 */
export type Slot =
  | { k: 'bait'; id: BaitType; n: number }
  | { k: 'fish'; fishId: string; size: number; shiny?: boolean; /** Value multiplier won at the wheel and casino tables. */ mult?: number }
  | { k: 'rod'; id: string };

export interface SaveData {
  version: 1;
  level: number;
  xp: number;
  coins: number;
  /** The rod used for casting: the one in the rod slot. */
  rod: string;
  /** The bait used for casting: the one in the bait slot (kept when the slot runs empty). */
  bait: BaitType;
  slots: (Slot | null)[];
  /** Hotbar slot currently in hand (0-based). */
  held: number;
  location: string;
  dex: Record<string, DexEntry>;
  /** Character appearance and the cosmetics bought so far. */
  look: Look;
  owned: string[];
  /** Tackle locker: rods and bait you own but are not carrying in the hotbar. */
  locker: { rods: string[]; bait: Record<string, number> };
  /** Most valuable fish ever caught, for the leaderboard. */
  best: BestCatch | null;
  /** Ids of the town's message-in-a-bottle collectibles already found. */
  bottles: string[];
  /** Casino currency, earned by turning fish in at the prize shop. */
  chips: number;
  /** Casino perks owned (see `PERKS`). */
  perks: string[];
  /** Shiny Lure casts left. */
  lure: number;
  /** The player switched the Shiny Lure off to save its charges for later. */
  lureOff: boolean;
  /** New-player tips already shown (see `TIP_IDS`). */
  tips: string[];
}

export interface BestCatch {
  fishId: string;
  size: number;
  value: number;
  shiny?: boolean;
}

const KEY = 'fishing-game-save';

export const newSave = (): SaveData => ({
  version: 1,
  level: 1,
  xp: 0,
  coins: 20,
  rod: 'twig',
  bait: 'worm',
  slots: [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 15 }, null, null, null],
  held: 0,
  location: 'pond',
  dex: {},
  look: { ...defaultLook(), face: randomFace() },
  owned: [],
  locker: { rods: [], bait: {} },
  best: null,
  bottles: [],
  chips: 0,
  perks: [],
  lure: 0,
  lureOff: false,
  tips: [],
});

/**
 * Puts the rod in use in the rod slot and the active bait in the bait slot; every other rod and bait
 * stack goes to the tackle locker. Fish already in fish slots stay put, the rest fill the free ones,
 * and any that still don't fit get extra slots past the end until they're sold. A save that already
 * follows the layout comes out unchanged.
 */
function layoutSlots(out: SaveData, size: number): void {
  const old = out.slots;
  const inHand = old[out.held] ?? null;
  const carried = old.filter((x): x is Extract<Slot, { k: 'rod' }> => x?.k === 'rod').map((x) => x.id);
  const rod = carried.includes(out.rod) ? out.rod : carried[0] ?? (out.locker.rods.includes(out.rod) ? out.rod : out.locker.rods[0]);
  out.locker.rods = [...new Set([...carried, ...out.locker.rods])].filter((id) => id !== rod);
  const stacks = old.filter((x): x is Extract<Slot, { k: 'bait' }> => x?.k === 'bait');
  for (const b of stacks) out.locker.bait[b.id] = (out.locker.bait[b.id] ?? 0) + b.n;
  const bait = stacks.some((b) => b.id === out.bait) ? out.bait : stacks[0]?.id ?? ((out.locker.bait[out.bait] ?? 0) > 0 ? out.bait : null);
  const slots: (Slot | null)[] = Array.from({ length: size }, () => null);
  if (rod) {
    slots[ROD_SLOT] = { k: 'rod', id: rod };
    out.rod = rod;
  }
  if (bait) {
    const n = Math.min(BAIT_STACK, out.locker.bait[bait]);
    slots[BAIT_SLOT] = { k: 'bait', id: bait, n };
    if ((out.locker.bait[bait] -= n) <= 0) delete out.locker.bait[bait];
    out.bait = bait;
  }
  const moved: Slot[] = [];
  old.forEach((sl, i) => {
    if (sl?.k !== 'fish') return;
    if (i >= FISH_SLOT && i < size) slots[i] = sl;
    else moved.push(sl);
  });
  for (const f of moved) {
    const i = slots.indexOf(null, FISH_SLOT);
    if (i >= 0 && i < size) slots[i] = f;
    else slots.push(f);
  }
  // Keep the same thing in hand: the fish, the rod or the bait. Anything else goes back to the rod.
  const at = inHand?.k === 'fish' ? slots.indexOf(inHand) : inHand?.k === 'rod' ? ROD_SLOT : inHand?.k === 'bait' ? BAIT_SLOT : -1;
  out.held = at >= 0 ? at : !inHand && out.held >= FISH_SLOT && out.held < size && !slots[out.held] ? out.held : ROD_SLOT;
  out.slots = slots;
}

/** Upgrades older save layouts (bait counts, bag, owned rods, 4 slots, gear anywhere in the hotbar). */
export function migrate(raw: object): SaveData {
  const data = raw as Partial<SaveData> & Record<string, unknown>;
  const out = { ...newSave(), ...data } as SaveData & Record<string, unknown>;
  const hasRods = Array.isArray(data.slots) && data.slots.some((x) => x?.k === 'rod');
  if (!Array.isArray(data.slots) || !hasRods) {
    const rods: Slot[] = ((data.ownedRods as string[] | undefined) ?? [data.rod ?? 'twig']).map((id) => ({ k: 'rod', id }));
    if (Array.isArray(data.slots)) {
      // Everything stays where it was, so fish can keep their slots; the rods go on the end.
      out.slots = [...data.slots, ...rods];
    } else {
      const gear: Slot[] = [...rods];
      const stock = (data.baitStock ?? { worm: 15 }) as Record<string, number>;
      for (const [id, n] of Object.entries(stock)) {
        let left = Math.max(0, Math.floor(n));
        while (left > 0) {
          const take = Math.min(left, BAIT_STACK);
          gear.push({ k: 'bait', id: id as BaitType, n: take });
          left -= take;
        }
      }
      const fish = ((data.inventory ?? []) as { fishId: string; size: number }[]).map((f): Slot => ({ k: 'fish', ...f }));
      // Fish start in the first fish slot; the layout below sorts out the rest, so nothing is lost.
      out.slots = [null, null, ...fish, ...gear];
      out.held = 0;
    }
  }
  // Fish sizes were reworked so every tier is bigger than the last; pull old records and
  // carried fish into each species' new range so nothing shows an impossible size.
  const fit = (fishId: string, cm: number) => {
    const f = FISH.find((x) => x.id === fishId);
    return f ? Math.min(f.maxSize, Math.max(f.minSize, cm)) : cm;
  };
  for (const [id, e] of Object.entries(out.dex ?? {})) if (e && Number.isFinite(e.best)) e.best = fit(id, e.best);
  for (const sl of out.slots) if (sl?.k === 'fish') sl.size = fit(sl.fishId, sl.size);
  if (out.best) out.best.size = fit(out.best.fishId, out.best.size);
  if (!Array.isArray(out.perks)) out.perks = [];
  out.chips = Number.isFinite(out.chips) ? Math.max(0, Math.floor(out.chips)) : 0;
  out.lure = Number.isFinite(out.lure) ? Math.max(0, Math.floor(out.lure)) : 0;
  out.lureOff = out.lureOff === true;
  // Saves from before the tips only get them if they haven't started playing yet.
  out.tips = Array.isArray(data.tips) ? data.tips.filter(isTip) : isFreshSave(out) ? [] : [...TIP_IDS];
  if (!Number.isInteger(out.held) || out.held < 0 || out.held >= out.slots.length) out.held = 0;
  const lk = (out.locker ?? {}) as Partial<SaveData['locker']>;
  const bait: Record<string, number> = {};
  for (const [id, n] of Object.entries(lk.bait ?? {})) if (BAITS.some((b) => b.id === id) && n > 0) bait[id] = Math.floor(n);
  out.locker = { rods: (lk.rods ?? []).filter((id) => RODS.some((r) => r.id === id)), bait };
  layoutSlots(out, slotCount(out));
  if (!Array.isArray(out.owned)) out.owned = [];
  // Accounts from before faces get a random one.
  if (!isFace((out.look as Partial<Look> | undefined)?.face)) out.look = { ...out.look, face: randomFace() };
  out.look = cleanLook(out.look, out.owned);
  // Leftovers from older layouts and the removed Town Fund.
  for (const k of ['baitStock', 'inventory', 'ownedRods', 'fund', 'contributed']) delete out[k];
  return out;
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newSave();
    const data = JSON.parse(raw) as SaveData;
    return data.version === 1 ? migrate(data) : newSave();
  } catch {
    return newSave();
  }
}

export function save(data: SaveData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}
