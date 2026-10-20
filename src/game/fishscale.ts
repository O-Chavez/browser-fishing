/**
 * How big a fish is drawn in each view. One curve (`fishScale`) turns length into world size, a
 * per-tier boost makes jewel and spirit fish read as bigger than their length alone, and each view
 * then fits that size into the space it has (a soft cap, so the biggest fish still grow a little).
 * Pure math, no three.js, so it's easy to test.
 */

/**
 * World scale for a fish of `cm` length when held up as a catch. It keeps growing across the whole
 * size range (15 cm ≈ 0.5, 90 cm ≈ 1.5, 230 cm ≈ 2.5) so every tier lands visibly bigger than the last,
 * but slower than real life so a legend still fits on screen. Other views use a fraction of this.
 */
export function fishScale(cm: number): number {
  return 0.0984 * Math.pow(Math.max(1, cm), 0.6);
}

/** Size boost per tier: lake giants a touch bigger, jewels clearly, spirits a lot. */
export const TIER_BOOST = [1, 1, 1.08, 1.2, 1.35] as const;

export const tierBoost = (tier: number): number => TIER_BOOST[Math.max(0, Math.min(4, Math.round(tier) - 1))];

/** `fishScale` with the tier boost: the size a fish "should" be before any view caps it. */
export function tierScale(cm: number, tier: number): number {
  return fishScale(cm) * tierBoost(tier);
}

/** Identity below `knee`, then eases toward `max` without ever reaching it, so order is kept. */
export function softCap(x: number, knee: number, max: number): number {
  if (x <= knee) return x;
  const room = max - knee;
  return knee + room * (1 - Math.exp(-(x - knee) / room));
}

/** In the water (shadow, fight, the start of the landing arc): there is room, so no cap. */
export const waterScale = (cm: number, tier: number): number => tierScale(cm, tier) * 0.7;

/** Dangling from your own rod after a catch. */
export const heldScale = (cm: number, tier: number): number => softCap(tierScale(cm, tier), 2.2, 3.3);

/**
 * Line length between the rod tip and the mouth of a dangling catch. Big fish hang on a shorter
 * line (and the rod is raised, see `hangPitch`) so their tail stays clear of the dock and water.
 */
export const hangLen = (scale: number): number => Math.max(0.3, Math.min(1, 1 - (scale - 1.6) * 0.45));

/** Rod pitch while a catch dangles: raised further for big fish to lift them clear. */
export const hangPitch = (scale: number): number => 0.85 + Math.max(0, Math.min(0.3, (scale - 2) * 0.2));

/** Carried in first person while walking: kept small so it never blocks the view. */
export const carryScale = (cm: number, tier: number): number => softCap(tierScale(cm, tier) * 0.13, 0.17, 0.3);

/** Hanging from another player's rod tip (about 1.7 m up). */
export const remoteScale = (cm: number, tier: number): number => softCap(tierScale(cm, tier) * 0.5, 0.9, 1.5);

/** Line length under another player's rod tip, shortened for big fish so they stay off the ground. */
export const remoteHang = (scale: number): number => Math.max(0.08, Math.min(0.45, 0.45 - (scale - 1) * 0.75));

/** Lying on the ground as a drop. */
export const dropScale = (cm: number, tier: number): number => softCap(tierScale(cm, tier) * 0.5, 0.9, 1.8);
