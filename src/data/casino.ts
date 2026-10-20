/** Casino tuning. Everything the grind depends on lives here so it can be rebalanced in one place. */

/** Coins of fish value that make one chip when a fish is turned in at the prize shop. */
export const CHIP_COINS = 1000;
/** A fish's gambling multiplier never exceeds this; a fish at the cap can only be turned in. */
export const MULT_CAP = 16;
/** Minimum player level to travel to the casino. */
export const CASINO_LEVEL = 15;
/** How close you must stand to a table or the prize counter. */
export const CASINO_RANGE = 3.6;

export type RouletteBet = 'red' | 'black' | 'green';
/** 38 pockets (like a double-zero wheel): the house keeps about 5% on red/black and 16% on green. */
export const ROULETTE_POCKETS: Record<RouletteBet, number> = { red: 18, black: 18, green: 2 };
export const ROULETTE_PAY: Record<RouletteBet, number> = { red: 2, black: 2, green: 16 };
export const ROULETTE_MS = 4200;

export type PerkId = 'vest' | 'charm1' | 'charm2' | 'charm3' | 'gloves' | 'lantern' | 'lure';

export interface Perk {
  id: PerkId;
  name: string;
  desc: string;
  chips: number;
  /** Consumables are bought repeatedly; everything else once. */
  consumable?: boolean;
  /** Must already be owned. */
  requires?: PerkId;
  icon: string;
}

export const VEST_SLOTS = 2;
/** Total sell-value bonus by charm tier (the best owned tier applies, they do not stack). */
export const CHARM_BONUS: Record<'charm1' | 'charm2' | 'charm3', number> = { charm1: 0.05, charm2: 0.1, charm3: 0.15 };
const charmDesc = (id: keyof typeof CHARM_BONUS): string => `Caught fish are worth ${Math.round(CHARM_BONUS[id] * 100)}% more`;
/** Reel-control multiplier from the gloves: the same fish is easier to land. */
export const GLOVES_CONTROL = 1.35;
/** Night luck multiplier from the lantern. */
export const LANTERN_NIGHT_LUCK = 1.3;
/** Guaranteed-shiny casts in one Shiny Lure pack. */
export const LURE_CHARGES = 3;

export const PERKS: Perk[] = [
  { id: 'vest', name: 'Tackle Vest', desc: `+${VEST_SLOTS} hotbar slots`, chips: 40, icon: '🦺' },
  { id: 'charm1', name: 'Lucky Charm I', desc: charmDesc('charm1'), chips: 25, icon: '🍀' },
  { id: 'charm2', name: 'Lucky Charm II', desc: charmDesc('charm2'), chips: 80, requires: 'charm1', icon: '🍀' },
  { id: 'charm3', name: 'Lucky Charm III', desc: charmDesc('charm3'), chips: 200, requires: 'charm2', icon: '🍀' },
  { id: 'gloves', name: 'Quick-Reel Gloves', desc: 'Fights are easier and reeling is faster', chips: 60, icon: '🧤' },
  { id: 'lantern', name: 'Night Owl Lantern', desc: 'Better luck with night fish', chips: 50, icon: '🏮' },
  { id: 'lure', name: 'Shiny Lure', desc: `${LURE_CHARGES} casts that always hook a shiny`, chips: 15, consumable: true, icon: '✨' },
];

export const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);
