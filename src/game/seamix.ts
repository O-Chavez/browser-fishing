import { GULLS, rainAt } from '../data/sea';

/** How loud the rain on the deck is (0..1): follows the rain you see. */
export const rainLevel = (mood: number): number => rainAt(mood);

/** How many of the Shelf's gulls are still about: the same rule as `Gulls` in seaatmo.ts (they peel away with the mood and roost after dark). */
export function gullsAbout(mood: number, night: number): number {
  if (night > GULLS.roost) return 0;
  let n = 0;
  for (let i = 0; i < GULLS.count; i++) {
    const leaves = GULLS.leave[0] + (i / Math.max(1, GULLS.count - 1)) * (GULLS.leave[1] - GULLS.leave[0]);
    if (mood <= leaves) n++;
  }
  return n;
}

/** Seconds to the next gull cry given how many gulls are about (never, with none); more gulls call more often. `r` is a 0..1 random. */
export function gullCryWait(about: number, r: number): number {
  if (about <= 0) return Infinity;
  const crowd = about / GULLS.count;
  return (9 + 14 * r) / (0.5 + 0.5 * crowd);
}

/** The buoy's chime rings once as it comes alongside: on the frame it becomes alongside. */
export const chimeNow = (was: boolean, is: boolean): boolean => is && !was;
