import { BAITS, FISH, RODS, byId, type BaitType } from '../data/content';
import { cleanLook, defaultLook, type Look } from '../data/cosmetics';
import { sellValue } from './progression';

export interface DexEntry { count: number; best: number }

export const SLOT_COUNT = 5;
export const BAIT_STACK = 20;

/** The hotbar is the whole inventory: every slot holds one rod, one fish, or a stack of one bait type. */
export type Slot =
  | { k: 'bait'; id: BaitType; n: number }
  | { k: 'fish'; fishId: string; size: number; shiny?: boolean; /** Value multiplier won at the wheel. */ mult?: number }
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
  /** Pooled town fund per map, and the local player's share of it. */
  fund: Record<string, number>;
  contributed: Record<string, number>;
  /** Character appearance and the cosmetics bought so far. */
  look: Look;
  owned: string[];
  /** Tackle locker: rods and bait you own but are not carrying in the hotbar. */
  locker: { rods: string[]; bait: Record<string, number> };
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
  fund: {},
  contributed: {},
  look: defaultLook(),
  owned: [],
  locker: { rods: [], bait: {} },
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
  while (out.slots.length < SLOT_COUNT) out.slots.push(null);
  out.slots = out.slots.slice(0, SLOT_COUNT);
  if (!Number.isInteger(out.held) || out.held < 0 || out.held >= SLOT_COUNT) out.held = 0;
  if (!out.slots.some((x) => x?.k === 'rod' && x.id === out.rod)) {
    const r = out.slots.find((x) => x?.k === 'rod');
    if (r?.k === 'rod') out.rod = r.id;
  }
  if (!Array.isArray(out.owned)) out.owned = [];
  out.look = cleanLook(out.look, out.owned);
  const lk = (out.locker ?? {}) as Partial<SaveData['locker']>;
  const bait: Record<string, number> = {};
  for (const [id, n] of Object.entries(lk.bait ?? {})) if (BAITS.some((b) => b.id === id) && n > 0) bait[id] = Math.floor(n);
  out.locker = { rods: (lk.rods ?? []).filter((id) => RODS.some((r) => r.id === id)), bait };
  for (const k of ['baitStock', 'inventory', 'ownedRods']) delete out[k];
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
