/**
 * Level ranks: every 5th level from 20 to 50 is a nautical rank (the order is obvious at a glance),
 * and a few milestones past 50 keep going. Each rank gives its title; some also give an earned outfit.
 */
export type PillTier = 'bronze' | 'silver' | 'gold' | 'aurora';

export interface Rank {
  level: number;
  /** Title id, kept in `SaveData.titles`. */
  id: string;
  title: string;
  /** An earned cosmetic id (see `earned` in `src/data/cosmetics.ts`). */
  outfit?: string;
  /** The level pill's colour from this level on. */
  pill?: PillTier;
}

export const RANKS: Rank[] = [
  { level: 20, id: 'deckhand', title: 'Deckhand' },
  { level: 25, id: 'bosun', title: 'Bosun', outfit: 'souwester' },
  { level: 30, id: 'firstmate', title: 'First Mate' },
  { level: 35, id: 'skipper', title: 'Skipper', outfit: 'slicker' },
  { level: 40, id: 'captain', title: 'Captain' },
  { level: 45, id: 'commodore', title: 'Commodore', outfit: 'compass' },
  { level: 50, id: 'admiral', title: 'Admiral', outfit: 'bicorne' },
  { level: 60, id: 'fleetadmiral', title: 'Fleet Admiral', pill: 'bronze' },
  { level: 75, id: 'lakeadmiral', title: 'Admiral of the Lakes', pill: 'silver' },
  { level: 100, id: 'sealegend', title: 'Sea Legend', pill: 'gold' },
  { level: 150, id: 'lorddeep', title: 'Lord of the Deep', pill: 'aurora' },
];

/** Every title a player can wear. Ranks only for now; charter zones and the Derby add more later. */
export const TITLES: { id: string; name: string }[] = RANKS.map((r) => ({ id: r.id, name: r.title }));

export const titleName = (id: string | null | undefined): string | null => TITLES.find((t) => t.id === id)?.name ?? null;

/** The highest rank reached at a level, if any. */
export const rankAt = (level: number): Rank | null => RANKS.filter((r) => r.level <= level).at(-1) ?? null;

/** The next rank above a level, or null past the last one. */
export const nextRank = (level: number): Rank | null => RANKS.find((r) => r.level > level) ?? null;

/** Ranks reached by going from level `from` to `to`. */
export const ranksBetween = (from: number, to: number): Rank[] => RANKS.filter((r) => r.level > from && r.level <= to);

/** The level pill's colour at a level (plain until the first milestone past 50). */
export const pillTier = (level: number): PillTier | null => RANKS.filter((r) => r.pill && r.level <= level).at(-1)?.pill ?? null;
