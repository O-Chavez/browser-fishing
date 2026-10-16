export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type BaitType = 'worm' | 'fly' | 'minnow';

export interface Fish {
  id: string;
  name: string;
  rarity: Rarity;
  locations: string[];
  minRodTier: number;
  baits: BaitType[];
  minSize: number; // cm
  maxSize: number;
  maxWeight: number; // kg at maxSize
  baseValue: number;
  stamina: number; // 1 = easy
  color: number;
}

export interface Rod {
  id: string;
  name: string;
  tier: number;
  unlockLevel: number;
  price: number;
  castDistance: number;
  luck: number; // multiplies rare chances
  control: number; // widens tension safe zone
}

export interface Bait {
  id: BaitType;
  name: string;
  price: number;
  unlockLevel: number;
  luck: number;
}

export interface Location {
  id: string;
  name: string;
  unlockLevel: number;
  sky: number; // horizon / fog colour
  skyTop: number;
  water: number;
  deep: number;
  grass: number;
  foliage: number;
  sand: number;
}

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1,
};
export const RARITY_VALUE: Record<Rarity, number> = {
  common: 1, uncommon: 2.5, rare: 6, epic: 15, legendary: 50,
};
export const RARITY_XP: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 20,
};
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#aaaaaa', uncommon: '#4cd964', rare: '#4a90e2', epic: '#b05ce6', legendary: '#ffc933',
};

export const LOCATIONS: Location[] = [
  { id: 'pond', name: 'Starter Pond', unlockLevel: 1, sky: 0xbfe3f2, skyTop: 0x4f9fe0, water: 0x3aa6b9, deep: 0x0d4560, grass: 0x6bb04f, foliage: 0x3f8f43, sand: 0xd8c58f },
  { id: 'lake', name: 'Forest Lake', unlockLevel: 5, sky: 0xd3e0d0, skyTop: 0x7da4be, water: 0x2f7f7a, deep: 0x082f33, grass: 0x44803f, foliage: 0x1f5a3a, sand: 0xa89f7d },
];

export const RODS: Rod[] = [
  { id: 'twig', name: 'Twig Rod', tier: 1, unlockLevel: 1, price: 0, castDistance: 14, luck: 1, control: 1 },
  { id: 'fiberglass', name: 'Fiberglass Rod', tier: 2, unlockLevel: 4, price: 250, castDistance: 20, luck: 1.2, control: 1.2 },
  { id: 'graphite', name: 'Graphite Rod', tier: 3, unlockLevel: 8, price: 1200, castDistance: 28, luck: 1.5, control: 1.5 },
];

export const BAITS: Bait[] = [
  { id: 'worm', name: 'Worm', price: 2, unlockLevel: 1, luck: 1 },
  { id: 'fly', name: 'Fly', price: 5, unlockLevel: 3, luck: 1.1 },
  { id: 'minnow', name: 'Minnow', price: 10, unlockLevel: 6, luck: 1.3 },
];

export const FISH: Fish[] = [
  { id: 'minnow', name: 'Silver Minnow', rarity: 'common', locations: ['pond', 'lake'], minRodTier: 1, baits: ['worm', 'fly'], minSize: 5, maxSize: 12, maxWeight: 0.03, baseValue: 4, stamina: 0.6, color: 0xcfd8dc },
  { id: 'bluegill', name: 'Bluegill', rarity: 'common', locations: ['pond'], minRodTier: 1, baits: ['worm', 'fly'], minSize: 12, maxSize: 25, maxWeight: 0.5, baseValue: 8, stamina: 0.8, color: 0x4f86c6 },
  { id: 'carp', name: 'Common Carp', rarity: 'common', locations: ['pond', 'lake'], minRodTier: 1, baits: ['worm'], minSize: 30, maxSize: 60, maxWeight: 12, baseValue: 14, stamina: 1.1, color: 0xb08d57 },
  { id: 'perch', name: 'Yellow Perch', rarity: 'uncommon', locations: ['pond', 'lake'], minRodTier: 1, baits: ['worm', 'minnow'], minSize: 15, maxSize: 35, maxWeight: 1.2, baseValue: 12, stamina: 1.0, color: 0xe3c04d },
  { id: 'koi', name: 'Golden Koi', rarity: 'rare', locations: ['pond'], minRodTier: 2, baits: ['fly', 'worm'], minSize: 30, maxSize: 70, maxWeight: 8, baseValue: 20, stamina: 1.4, color: 0xff9f43 },
  { id: 'trout', name: 'Rainbow Trout', rarity: 'uncommon', locations: ['lake'], minRodTier: 2, baits: ['fly'], minSize: 25, maxSize: 55, maxWeight: 3.5, baseValue: 18, stamina: 1.2, color: 0xe58fb0 },
  { id: 'bass', name: 'Largemouth Bass', rarity: 'uncommon', locations: ['lake'], minRodTier: 2, baits: ['minnow', 'worm'], minSize: 30, maxSize: 65, maxWeight: 5, baseValue: 22, stamina: 1.3, color: 0x6b8e23 },
  { id: 'pike', name: 'Northern Pike', rarity: 'rare', locations: ['lake'], minRodTier: 3, baits: ['minnow'], minSize: 60, maxSize: 110, maxWeight: 12, baseValue: 30, stamina: 1.6, color: 0x3d6b4f },
  { id: 'sturgeon', name: 'Lake Sturgeon', rarity: 'epic', locations: ['lake'], minRodTier: 3, baits: ['minnow', 'worm'], minSize: 90, maxSize: 160, maxWeight: 60, baseValue: 40, stamina: 1.9, color: 0x7a7a8c },
  { id: 'ghostcarp', name: 'Ghost Carp', rarity: 'legendary', locations: ['pond', 'lake'], minRodTier: 3, baits: ['minnow', 'fly'], minSize: 70, maxSize: 120, maxWeight: 25, baseValue: 60, stamina: 2.2, color: 0xe8f4ff },
];

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown id: ${id}`);
  return item;
};
