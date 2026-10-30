/** Smokehouse tuning (GAME_DESIGN.md §38.2): Mags Cinder's recipes, her racks, and what smoked goods do when eaten. */
import type { Fish } from './content';

export type RecipeId = 'minnowbites' | 'kippers' | 'pikejerky' | 'lanternglaze' | 'jewelplatter';

/** One spot on a rack: a given species, or any fish of a tier, or any 🌙 fish. */
export interface Need {
  fish?: string;
  tier?: number;
  night?: boolean;
}

export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  /** One entry per fish, the most particular ones first, so a fish fills the spot only it can fill. */
  needs: Need[];
  /** What the recipe asks for, in words. */
  asks: string;
  /** Real minutes on the rack. */
  minutes: number;
  /** Player level that unlocks it. */
  level: number;
  /** What eating it does, for the menu and the buff chip. */
  effect: string;
}

const times = (n: number, need: Need): Need[] => Array.from({ length: n }, () => need);

/** Eaten buffs, by recipe. */
export const BITE_WAIT = 0.75;
export const LUCK_BUFF = 1.2;
export const CONTROL_BUFF = 1.2;
export const GLAZE_NIGHT_FISH = 1.5;
/** Lantern Glaze starts the night bite this dark (`nightness`), at dusk instead of `NIGHT_BITE`. */
export const DUSK_BITE = 0.2;
export const SHINY_BUFF = 1.5;

export const RECIPES: Recipe[] = [
  { id: 'minnowbites', name: 'Minnow Bites', icon: '🍢', needs: times(6, { tier: 1 }), asks: '6 tier 1 fish', minutes: 5, level: 1, effect: 'Bites come 25% sooner' },
  { id: 'kippers', name: 'Kippers', icon: '🐟', needs: [{ fish: 'bass' }, ...times(3, { tier: 2 })], asks: '4 tier 2 fish, one a Largemouth Bass', minutes: 10, level: 1, effect: '+20% luck' },
  { id: 'pikejerky', name: 'Pike Jerky', icon: '🥓', needs: [{ fish: 'pike' }, ...times(2, { tier: 3 })], asks: '3 tier 3 fish, one a Northern Pike', minutes: 15, level: 1, effect: '+20% reel control' },
  { id: 'lanternglaze', name: 'Lantern Glaze', icon: '🍯', needs: [...times(2, { fish: 'lanterneel' }), { night: true }], asks: '2 Lantern Eels and any 🌙 fish', minutes: 20, level: 1, effect: 'Night bite starts at dusk; 🌙 fish ×1.5' },
  { id: 'jewelplatter', name: 'Jewel Platter', icon: '💎', needs: times(3, { tier: 4 }), asks: '3 tier 4 fish', minutes: 30, level: 20, effect: 'Shiny chance ×1.5' },
];

export const recipeById = (id: unknown): Recipe | undefined => RECIPES.find((r) => r.id === id);

/** Whether a fish can go in this spot. */
export const fits = (need: Need, fish: Fish): boolean =>
  need.fish ? fish.id === need.fish : need.tier ? fish.tier === need.tier : !!need.night && !!fish.night;

/** What a spot takes, in a few words. */
export const needLabel = (need: Need, name: (id: string) => string): string =>
  need.fish ? name(need.fish) : need.tier ? `Tier ${need.tier}` : '🌙 fish';

/** Two racks to start with, a third from this level. */
export const RACKS = 3;
export const RACK3_LEVEL = 30;
export const rackCount = (level: number): number => (level >= RACK3_LEVEL ? 3 : 2);

/** An eaten buff lasts this long in online time. */
export const BUFF_MINUTES = 10;
/** Trophy-size fish (the top 20% of the species' size range) add up to half again to the buff. */
export const TROPHY_TOP = 0.2;
export const TROPHY_BONUS = 0.5;
/** At most this many kinds of buff at once. */
export const MAX_BUFFS = 3;
/** Batches smoked before a recipe is Well-smoked ★ and yields two. */
export const WELL_SMOKED = 10;

/** How close to Mags's counter you must stand to load a rack. */
export const SMOKE_RANGE = 4;
