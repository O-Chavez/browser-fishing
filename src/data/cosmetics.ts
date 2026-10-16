export type CosSlot = 'hat' | 'shirt' | 'jewelry';

export const COS_SLOTS: CosSlot[] = ['hat', 'shirt', 'jewelry'];

export interface Cosmetic {
  id: string;
  slot: CosSlot;
  name: string;
  price: number;
  /** 0 (plain) to 5 (legendary): drives how fancy the model is. */
  tier: number;
  color: number;
  accent: number;
}

/** What a character wears. Item ids are validated against COSMETICS. */
export interface Look {
  color: number;
  hat: string | null;
  shirt: string | null;
  jewelry: string | null;
}

const c = (id: string, slot: CosSlot, name: string, price: number, tier: number, color: number, accent: number): Cosmetic => ({ id, slot, name, price, tier, color, accent });

export const COSMETICS: Cosmetic[] = [
  c('cap', 'hat', 'Fisher Cap', 150, 0, 0x3a6ea5, 0x234a75),
  c('straw', 'hat', 'Straw Hat', 400, 1, 0xe3c46a, 0xc9a44a),
  c('bucket', 'hat', 'Bucket Hat', 700, 1, 0x6b8f5a, 0x4d6e40),
  c('captain', 'hat', "Captain's Hat", 2500, 2, 0xf2f2ee, 0x1c2d52),
  c('horned', 'hat', 'Horned Helm', 9000, 3, 0x9aa3ad, 0xf0e6c8),
  c('crown', 'hat', 'Golden Crown', 75000, 5, 0xffd24a, 0xff3b5c),

  c('tee', 'shirt', 'Plain Tee', 100, 0, 0xe8e8e8, 0xe8e8e8),
  c('striped', 'shirt', 'Striped Shirt', 300, 1, 0xf4f4f4, 0x2a5fa8),
  c('vest', 'shirt', 'Angler Vest', 600, 1, 0x5b7a3a, 0x8a6a3a),
  c('hawaiian', 'shirt', 'Hawaiian Shirt', 1800, 2, 0x1fa6a0, 0xff7a59),
  c('coat', 'shirt', "Sailor's Coat", 6500, 3, 0x1c2d52, 0xd4af37),
  c('cloak', 'shirt', 'Royal Cloak', 60000, 5, 0x7a1fa2, 0xffd24a),

  c('shell', 'jewelry', 'Shell Necklace', 200, 0, 0xf6dcc8, 0xf6dcc8),
  c('chain', 'jewelry', 'Silver Chain', 500, 1, 0xc8d0d8, 0xc8d0d8),
  c('pendant', 'jewelry', 'Fish Pendant', 1500, 2, 0xd4af37, 0x4fc3f7),
  c('pearl', 'jewelry', 'Pearl Necklace', 4500, 3, 0xfff5ee, 0xfff5ee),
  c('amulet', 'jewelry', 'Sapphire Amulet', 18000, 4, 0xd4af37, 0x2f6bff),
  c('diamond', 'jewelry', 'Diamond Pendant', 120000, 5, 0xb9f2ff, 0xffffff),
];

export const cosById = (id: string | null | undefined): Cosmetic | undefined => COSMETICS.find((x) => x.id === id);

export const BODY_COLORS = [0xe8704a, 0xf2b441, 0x7bc86c, 0x38b6a8, 0x4a90e2, 0x8e6bd8, 0xe06aa8, 0xc9c9c9];
export const DEFAULT_COLOR = BODY_COLORS[4];

export const defaultLook = (): Look => ({ color: DEFAULT_COLOR, hat: null, shirt: null, jewelry: null });

/** Clamps untrusted look data from a client or an old save. */
export function cleanLook(raw: Partial<Look> | undefined, owned: readonly string[]): Look {
  const out = defaultLook();
  const col = Number(raw?.color);
  if (Number.isInteger(col) && col >= 0 && col <= 0xffffff) out.color = col;
  for (const slot of COS_SLOTS) {
    const id = raw?.[slot];
    if (id && owned.includes(id) && cosById(id)?.slot === slot) out[slot] = id;
  }
  return out;
}
