export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type BaitType = 'worm' | 'fly' | 'minnow' | 'lure' | 'pearl';

/** Fish, rods and bait all sit on tiers 1-5; bait of at least a fish's tier lets it bite, and the rod only eases the fight. */
export const TIERS: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const tierName = (tier: number): string => {
  const r = TIERS[tier - 1];
  return r[0].toUpperCase() + r.slice(1);
};

export interface Fish {
  id: string;
  name: string;
  tier: number;
  rarity: Rarity;
  locations: string[];
  minSize: number; // cm
  maxSize: number;
  maxWeight: number; // kg at maxSize
  baseValue: number;
  stamina: number; // 1 = easy
  color: number;
  /** Only bites after dark. */
  night?: boolean;
}

export interface Rod {
  id: string;
  name: string;
  tier: number;
  unlockLevel: number;
  price: number;
  castDistance: number;
  luck: number; // multiplies rare chances
  control: number; // eases the reel: tames fish pulls (see reelDifficulty)
  /** Accent colour of the rod model; high tiers also glow. */
  color: number;
}

export interface Bait {
  id: BaitType;
  name: string;
  tier: number;
  price: number;
  unlockLevel: number;
  luck: number;
  color: number;
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

/** Base bite weights. Legendaries stay special: about 1 catch in 6 even with the best gear. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 0.6,
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
  { id: 'twig', name: 'Twig Rod', tier: 1, unlockLevel: 1, price: 0, castDistance: 14, luck: 1, control: 1, color: 0xb98a52 },
  { id: 'fiberglass', name: 'Fiberglass Rod', tier: 2, unlockLevel: 3, price: 250, castDistance: 20, luck: 1.2, control: 1.2, color: 0x4cd964 },
  { id: 'graphite', name: 'Graphite Rod', tier: 3, unlockLevel: 6, price: 1200, castDistance: 26, luck: 1.5, control: 1.5, color: 0x4a90e2 },
  { id: 'carbon', name: 'Carbon Elite Rod', tier: 4, unlockLevel: 10, price: 5000, castDistance: 30, luck: 1.9, control: 1.8, color: 0xb05ce6 },
  { id: 'aurora', name: 'Aurora Rod', tier: 5, unlockLevel: 15, price: 20000, castDistance: 34, luck: 2.5, control: 2.2, color: 0xffc933 },
];

export const BAITS: Bait[] = [
  { id: 'worm', name: 'Worm', tier: 1, price: 2, unlockLevel: 1, luck: 1, color: 0x9aa3ad },
  { id: 'fly', name: 'Fly', tier: 2, price: 5, unlockLevel: 2, luck: 1.1, color: 0xcc6a3a },
  { id: 'minnow', name: 'Minnow', tier: 3, price: 10, unlockLevel: 4, luck: 1.3, color: 0x4a8f5a },
  { id: 'lure', name: 'Glow Lure', tier: 4, price: 40, unlockLevel: 8, luck: 1.6, color: 0xb05ce6 },
  { id: 'pearl', name: 'Moon Pearl', tier: 5, price: 150, unlockLevel: 12, luck: 2, color: 0xffc933 },
];

type FishDef = Omit<Fish, 'rarity'>;

const FISH_DEFS: FishDef[] = [
  // Tier 1 · Shallows: small everyday fish
  { id: 'minnow', name: 'Silver Minnow', tier: 1, locations: ['pond', 'lake'], minSize: 5, maxSize: 10, maxWeight: 0.012, baseValue: 4, stamina: 0.6, color: 0xcfd8dc },
  { id: 'bluegill', name: 'Bluegill', tier: 1, locations: ['pond'], minSize: 10, maxSize: 20, maxWeight: 0.25, baseValue: 8, stamina: 0.75, color: 0x4f86c6 },
  { id: 'carp', name: 'Common Carp', tier: 1, locations: ['pond', 'lake'], minSize: 20, maxSize: 40, maxWeight: 1.4, baseValue: 14, stamina: 0.9, color: 0xb08d57 },
  // Tier 2 · Sport fish: the classics
  { id: 'perch', name: 'Yellow Perch', tier: 2, locations: ['pond', 'lake'], minSize: 20, maxSize: 35, maxWeight: 0.6, baseValue: 18, stamina: 1.1, color: 0xe3c04d },
  { id: 'trout', name: 'Rainbow Trout', tier: 2, locations: ['pond', 'lake'], minSize: 30, maxSize: 55, maxWeight: 2.2, baseValue: 20, stamina: 1.2, color: 0xe58fb0 },
  { id: 'bass', name: 'Largemouth Bass', tier: 2, locations: ['pond', 'lake'], minSize: 35, maxSize: 60, maxWeight: 3.5, baseValue: 24, stamina: 1.3, color: 0x6b8e23 },
  { id: 'midnightcat', name: 'Midnight Catfish', tier: 2, night: true, locations: ['pond', 'lake'], minSize: 40, maxSize: 70, maxWeight: 4.5, baseValue: 24, stamina: 1.25, color: 0x4a5a85 },
  // Tier 3 · Lake giants: big predators and pond royalty
  { id: 'koi', name: 'Golden Koi', tier: 3, locations: ['pond'], minSize: 50, maxSize: 80, maxWeight: 8, baseValue: 32, stamina: 1.5, color: 0xff9f43 },
  { id: 'pike', name: 'Northern Pike', tier: 3, locations: ['pond', 'lake'], minSize: 70, maxSize: 110, maxWeight: 12, baseValue: 32, stamina: 1.7, color: 0x3d6b4f },
  { id: 'gar', name: 'Spotted Gar', tier: 3, locations: ['pond', 'lake'], minSize: 80, maxSize: 120, maxWeight: 13, baseValue: 32, stamina: 1.6, color: 0x8a9a5b },
  { id: 'lanterneel', name: 'Lantern Eel', tier: 3, night: true, locations: ['pond', 'lake'], minSize: 70, maxSize: 110, maxWeight: 5.5, baseValue: 32, stamina: 1.7, color: 0x3fd2a0 },
  // Tier 4 · Jewel fish: gem colours, metallic sheen
  { id: 'sturgeon', name: 'Pearl Sturgeon', tier: 4, locations: ['pond', 'lake'], minSize: 150, maxSize: 230, maxWeight: 120, baseValue: 40, stamina: 1.9, color: 0x7a7a8c },
  { id: 'arowana', name: 'Ruby Arowana', tier: 4, locations: ['pond'], minSize: 100, maxSize: 150, maxWeight: 14, baseValue: 46, stamina: 2.0, color: 0xd6303f },
  { id: 'dorado', name: 'Sapphire Dorado', tier: 4, locations: ['pond', 'lake'], minSize: 110, maxSize: 160, maxWeight: 40, baseValue: 52, stamina: 2.1, color: 0x2f7be0 },
  { id: 'moonscale', name: 'Moonstone Salmon', tier: 4, night: true, locations: ['pond', 'lake'], minSize: 100, maxSize: 150, maxWeight: 32, baseValue: 62, stamina: 2.1, color: 0x9fb8ff },
  // Tier 5 · Spirit fish: mythic versions of familiar fish
  { id: 'ghostcarp', name: 'Ghost Carp', tier: 5, locations: ['pond', 'lake'], minSize: 170, maxSize: 230, maxWeight: 110, baseValue: 60, stamina: 2.3, color: 0xe8f4ff },
  { id: 'sunfire', name: 'Phoenix Trout', tier: 5, locations: ['pond'], minSize: 160, maxSize: 220, maxWeight: 80, baseValue: 80, stamina: 2.4, color: 0xff7a1a },
  { id: 'aurorapike', name: 'Aurora Pike', tier: 5, locations: ['pond', 'lake'], minSize: 200, maxSize: 270, maxWeight: 90, baseValue: 100, stamina: 2.5, color: 0x2fe0c0 },
  { id: 'constellation', name: 'Starweaver Eel', tier: 5, night: true, locations: ['pond', 'lake'], minSize: 220, maxSize: 320, maxWeight: 70, baseValue: 120, stamina: 2.5, color: 0x2a1b6e },
];

export const FISH: Fish[] = FISH_DEFS.map((f) => ({ ...f, rarity: TIERS[f.tier - 1] }));

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown id: ${id}`);
  return item;
};
