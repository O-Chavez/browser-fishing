import { BAITS, FISH, RODS, byId, type BaitType } from '../data/content';
import { VEST_SLOTS } from '../data/casino';
import { cleanLook, defaultLook, isFace, randomFace, type Look } from '../data/cosmetics';
import { sellValue } from './progression';

export interface DexEntry { count: number; best: number }

export const SLOT_COUNT = 5;
/** Hotbar size: the base five, plus the Tackle Vest's extra slots. */
export const slotCount = (s: { perks?: string[] }): number => SLOT_COUNT + (s.perks?.includes('vest') ? VEST_SLOTS : 0);
export const BAIT_STACK = 20;

/** The hotbar is the whole inventory: every slot holds one rod, one fish, or a stack of one bait type. */
export type Slot =
  | { k: 'bait'; id: BaitType; n: number }
  | { k: 'fish'; fishId: string; size: number; shiny?: boolean; /** Value multiplier won at the wheel and casino tables. */ mult?: number }
  | { k: 'rod'; id: string };

export interface SaveData {
  version: 1;
  level: number;
  xp: number;
  coins: number;
  /** The rod used for casting: the last rod slot selected. */
  rod: string;
  /** The bait used for casting: the last bait slot selected. */
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
});

/** Upgrades older save layouts (bait counts, bag, owned rods, 4 slots) to the 5-slot hotbar. */
export function migrate(raw: object): SaveData {
  const data = raw as Partial<SaveData> & Record<string, unknown>;
  const out = { ...newSave(), ...data } as SaveData & Record<string, unknown>;
  const hasRods = Array.isArray(data.slots) && data.slots.some((x) => x?.k === 'rod');
  if (!Array.isArray(data.slots) || !hasRods) {
    const items: Slot[] = [];
    const rods = (data.ownedRods as string[] | undefined) ?? [data.rod ?? 'twig'];
    for (const id of rods) items.push({ k: 'rod', id });
    if (Array.isArray(data.slots)) {
      for (const sl of data.slots) if (sl) items.push(sl);
    } else {
      const stock = (data.baitStock ?? { worm: 15 }) as Record<string, number>;
      for (const [id, n] of Object.entries(stock)) {
        let left = Math.max(0, Math.floor(n));
        while (left > 0) {
          const take = Math.min(left, BAIT_STACK);
          items.push({ k: 'bait', id: id as BaitType, n: take });
          left -= take;
        }
      }
      for (const f of (data.inventory ?? []) as { fishId: string; size: number }[]) items.push({ k: 'fish', ...f });
    }
    // Anything that no longer fits is cashed out (fish) or dropped (bait).
    out.slots = items.slice(0, SLOT_COUNT);
    for (const it of items.slice(SLOT_COUNT)) if (it.k === 'fish') out.coins += sellValue(byId(FISH, it.fishId), it.size);
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
  const size = slotCount(out);
  while (out.slots.length < size) out.slots.push(null);
  out.slots = out.slots.slice(0, size);
  if (!Number.isInteger(out.held) || out.held < 0 || out.held >= size) out.held = 0;
  if (!out.slots.some((x) => x?.k === 'rod' && x.id === out.rod)) {
    const r = out.slots.find((x) => x?.k === 'rod');
    if (r?.k === 'rod') out.rod = r.id;
  }
  if (!Array.isArray(out.owned)) out.owned = [];
  // Accounts from before faces get a random one.
  if (!isFace((out.look as Partial<Look> | undefined)?.face)) out.look = { ...out.look, face: randomFace() };
  out.look = cleanLook(out.look, out.owned);
  const lk = (out.locker ?? {}) as Partial<SaveData['locker']>;
  const bait: Record<string, number> = {};
  for (const [id, n] of Object.entries(lk.bait ?? {})) if (BAITS.some((b) => b.id === id) && n > 0) bait[id] = Math.floor(n);
  out.locker = { rods: (lk.rods ?? []).filter((id) => RODS.some((r) => r.id === id)), bait };
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

export function reset(): void {
  localStorage.removeItem(KEY);
}
