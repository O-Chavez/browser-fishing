export type CosSlot = 'hat' | 'shirt' | 'jewelry';

export const COS_SLOTS: CosSlot[] = ['hat', 'shirt', 'jewelry'];

/** Where an item is sold: Marlow's stall (coins) or the casino prize counter (chips only). */
export type CosShop = 'stall' | 'casino';

export interface Cosmetic {
  id: string;
  slot: CosSlot;
  name: string;
  /** Coins at the stall, chips at the casino (see `shop`). */
  price: number;
  /** 0 (plain) to 5 (legendary): drives how fancy the model, icon and tile are. */
  tier: number;
  color: number;
  accent: number;
  shop: CosShop;
  /** One line for the details panel. */
  blurb: string;
}

/** Rarity names and colours for cosmetic tiers 0-5. Tier 5 also gets a shimmer in the UI and sparkles in 3D. */
export const COS_RARITY = ['Plain', 'Fine', 'Rare', 'Epic', 'Mythic', 'Legendary'] as const;
export const COS_RARITY_COLOR = ['#b9b9b9', '#4cd964', '#4a90e2', '#b05ce6', '#ff8a3d', '#ffc933'] as const;

/** What a character wears. Item ids are validated against COSMETICS. */
export interface Look {
  color: number;
  /** Face id from `FACES`. */
  face: string;
  hat: string | null;
  shirt: string | null;
  jewelry: string | null;
}

const c = (id: string, slot: CosSlot, name: string, price: number, tier: number, color: number, accent: number, blurb: string, shop: CosShop = 'stall'): Cosmetic => ({
  id, slot, name, price, tier, color, accent, shop, blurb,
});
const casino = (id: string, slot: CosSlot, name: string, chips: number, tier: number, color: number, accent: number, blurb: string): Cosmetic =>
  c(id, slot, name, chips, tier, color, accent, blurb, 'casino');

/**
 * Ids never change (saves keep them); names and looks can. The stall sells lakeside angler gear,
 * the casino prize counter sells high-roller glam for chips only.
 */
export const COSMETICS: Cosmetic[] = [
  c('cap', 'hat', 'Fisher Cap', 150, 0, 0x3a6ea5, 0x234a75, 'A trusty cap that keeps the sun off your nose.'),
  c('straw', 'hat', 'Straw Sun Hat', 400, 1, 0xe3c46a, 0xb03a2e, 'Wide, woven and perfect for a lazy afternoon on the dock.'),
  c('bucket', 'hat', 'Fly-Tier Bucket Hat', 700, 1, 0x6b8f5a, 0xff6a3d, 'A bucket hat with a hand-tied fly hooked in the band.'),
  c('captain', 'hat', "Captain's Hat", 2500, 2, 0xf2f2ee, 0x1c2d52, 'Brass anchor on the front. You are in charge of this pier now.'),
  c('horned', 'hat', 'Heron Plume Hat', 9000, 3, 0x2f5a46, 0xd9dde2, 'Forest-green felt with a silver heron feather and a brass buckle.'),
  c('crown', 'hat', "Lake King's Crown", 75000, 5, 0xffc933, 0x2f6bff, 'Gold waves set with a glowing sapphire. Only the lake royalty wear it.'),

  c('tee', 'shirt', 'Camp Tee', 100, 0, 0xe8e2d4, 0xb79b74, 'Soft, plain and smells faintly of campfire.'),
  c('striped', 'shirt', 'Sailor Stripes', 300, 1, 0xf4f4f4, 0x2a5fa8, 'Classic navy stripes for life by the water.'),
  c('vest', 'shirt', 'Angler Vest', 600, 1, 0x8a7a4a, 0x5b7a3a, 'Pockets for everything, and a few lucky flies pinned on.'),
  c('hawaiian', 'shirt', 'Lily Pad Shirt', 1800, 2, 0x1fa6a0, 0xff9fc6, 'Teal with water-lily blossoms. Loud, proud and comfy.'),
  c('coat', 'shirt', 'Harbor Peacoat', 6500, 3, 0x1c2d52, 0xd4af37, 'Double-breasted navy wool with polished brass buttons.'),
  c('cloak', 'shirt', 'Aurora Mantle', 60000, 5, 0x2a1f5c, 0x5dffc8, 'Woven from the northern lights that follow the Aurora Pike.'),

  c('shell', 'jewelry', 'Shell Necklace', 200, 0, 0x8a6a4a, 0xf6dcc8, 'A cord and a pretty shell found on the shore.'),
  c('chain', 'jewelry', 'Hook Charm Chain', 500, 1, 0xc8d0d8, 0xc8d0d8, 'A silver chain with a lucky fish hook.'),
  c('pendant', 'jewelry', 'Golden Fish Pendant', 1500, 2, 0xd4af37, 0x4fc3f7, 'A little gold fish with a bright blue eye.'),
  c('pearl', 'jewelry', 'Pearl Strand', 4500, 3, 0xfff5ee, 0xd4af37, 'Real pond pearls on a gold clasp.'),
  c('amulet', 'jewelry', 'Sapphire Amulet', 18000, 4, 0xd4af37, 0x2f6bff, 'A glowing sapphire in a gold setting, deep as the lake.'),
  c('diamond', 'jewelry', 'Starfall Diamond', 120000, 5, 0xffd24a, 0xb9f2ff, 'A diamond that fell from the night sky into the pond. It still shines.'),

  casino('visor', 'hat', "Dealer's Visor", 30, 2, 0x1f7a4a, 0xe0b441, 'Green felt and gold trim, straight from the card table.'),
  casino('tophat', 'hat', 'High Roller Top Hat', 150, 4, 0x1b1b24, 0xff4f9a, 'Black silk, a neon pink band and a golden spade.'),
  casino('dealer', 'shirt', "Croupier's Waistcoat", 40, 2, 0xc4262e, 0x1b1b24, 'Red waistcoat, crisp white shirt and a black bow tie.'),
  casino('tux', 'shirt', 'Jackpot Tuxedo', 200, 4, 0x1b1b24, 0xe0b441, 'Gold lapels and a glowing pink bow tie. Dressed to win.'),
  casino('dice', 'jewelry', 'Lucky Dice Chain', 75, 3, 0xe0b441, 0xc4262e, 'A pair of red dice that always land on seven.'),
  casino('jackpot', 'jewelry', 'Jackpot Medallion', 450, 5, 0xe0b441, 0xff4f9a, 'A giant golden chip that glows like the casino sign. The ultimate flex.'),
];

export const cosById = (id: string | null | undefined): Cosmetic | undefined => COSMETICS.find((x) => x.id === id);

export const BODY_COLORS = [0xe8704a, 0xf2b441, 0x7bc86c, 0x38b6a8, 0x4a90e2, 0x8e6bd8, 0xe06aa8, 0xc9c9c9];
export const DEFAULT_COLOR = BODY_COLORS[4];

/** Free faces painted on the head; every account starts with a random one. */
export const FACES = [
  { id: 'smile', name: 'Smile' },
  { id: 'grin', name: 'Grin' },
  { id: 'wink', name: 'Wink' },
  { id: 'cat', name: 'Cat' },
  { id: 'joy', name: 'Joy' },
  { id: 'tongue', name: 'Cheeky' },
  { id: 'toothy', name: 'Toothy' },
  { id: 'sleepy', name: 'Sleepy' },
] as const;
export type FaceId = (typeof FACES)[number]['id'];
export const isFace = (id: unknown): id is FaceId => FACES.some((f) => f.id === id);
export const randomFace = (rng: () => number = Math.random): FaceId => FACES[Math.floor(rng() * FACES.length)].id;

export const defaultLook = (): Look => ({ color: DEFAULT_COLOR, face: 'smile', hat: null, shirt: null, jewelry: null });

/** Clamps untrusted look data from a client or an old save. */
export function cleanLook(raw: Partial<Look> | undefined, owned: readonly string[]): Look {
  const out = defaultLook();
  // typeof first: Number(null) is 0, which would turn a broken colour black.
  const col = raw?.color;
  if (typeof col === 'number' && Number.isInteger(col) && col >= 0 && col <= 0xffffff) out.color = col;
  if (isFace(raw?.face)) out.face = raw.face;
  for (const slot of COS_SLOTS) {
    const id = raw?.[slot];
    if (id && owned.includes(id) && cosById(id)?.slot === slot) out[slot] = id;
  }
  return out;
}
