/** Smokehouse tuning (GAME_DESIGN.md §38.2): Mags Cinder's smoker, the snacks smoked fish make, and the three stages. */

/** Mags opens up at this level. */
export const SMOKE_LEVEL = 3;
/** Fish on the smoker at once, one per spot. */
export const SMOKER_SPOTS = 5;
/** Seconds on the smoker, by fish tier (index 0 is tier 1). */
export const SMOKE_SECONDS = [5, 10, 20, 60, 120];
export const smokeSeconds = (tier: number): number => SMOKE_SECONDS[Math.min(SMOKE_SECONDS.length, Math.max(1, tier)) - 1];

/** Smoked fish up to this tier sell to Mags, for this much more than raw. */
export const SELL_TIER = 2;
export const SMOKED_SELL = 1.5;

/** What a snack does: ⭐ more XP or 💰 more coins at catch. ✨ shiny chance comes with dishes (R2). */
export type BuffKind = 'xp' | 'coins';
export const BUFF_ICON: Record<BuffKind, string> = { xp: '⭐', coins: '💰' };

/** Snacks by tier: the fraction added to that kind. Smoked tier 4-5 fish are dish ingredients only. */
export const SNACKS: Partial<Record<number, { kind: BuffKind; bonus: number }>> = {
  1: { kind: 'xp', bonus: 0.25 },
  2: { kind: 'xp', bonus: 0.5 },
  3: { kind: 'coins', bonus: 0.15 },
};
/** Each snack adds this much online time, up to the cap. */
export const SNACK_MINUTES = 5;
export const SNACK_MAX_MINUTES = 30;
/** Replacing a snack with more than this left asks first. */
export const REPLACE_ASK_MS = 60_000;

export type StageId = 'smallfry' | 'giants' | 'jewels';

export interface Stage {
  id: StageId;
  name: string;
  icon: string;
  /** The fish tiers it covers. */
  tiers: number[];
  /** What opens it, in words, for a locked card. */
  goal: string;
  /** Mags's line on the banner. */
  line: string;
}

export const STAGES: Stage[] = [
  { id: 'smallfry', name: 'Small Fry', icon: '🐟', tiers: [1, 2], goal: `Reach level ${SMOKE_LEVEL}`, line: 'Smoke your small fry and snack on them for ⭐ more XP.' },
  { id: 'giants', name: 'Lake Giants', icon: '🐊', tiers: [3], goal: 'Catch a tier 3 fish', line: 'Now that\'s a fish worth cooking. Smoked tier 3 fish give 💰 more coins.' },
  { id: 'jewels', name: 'Jewels & Spirits', icon: '💎', tiers: [4, 5], goal: 'Catch a tier 4 fish', line: 'Jewels on the smoker! Save them for dishes: ✨ more shinies.' },
];

export const stageById = (id: unknown): Stage | undefined => STAGES.find((s) => s.id === id);

/** Smoked tier 1 fish Mags hands over when she opens up. */
export const FREE_FISH = 3;

/** How close to Mags's counter you must stand to use the smoker. */
export const SMOKE_RANGE = 4;
