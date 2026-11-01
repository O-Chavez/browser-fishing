import * as THREE from 'three';
import { gloomAt, nightDarkAt, nightSkyKeep, seaMood } from '../data/sea';
import { nightness, twilight } from './daynight';

/**
 * The "Casting off" / "Heading in" card: where its look and timing live, so they are easy to tweak.
 */
export const CAST_OFF_CARD = {
  /** The card stays up at least this long (ms) after the scene swap, so it reads as a moment rather than a flash. */
  minMs: 1400,
  /** Fade in (ms): the old scene is held on screen meanwhile, so the swap happens behind a fully opaque card. */
  fadeInMs: 450,
  /** Fade out (ms), onto the new scene. */
  fadeOutMs: 900,
  /** How far the card takes the time-of-day and sea colours (0 = the plain daytime card, 1 = exactly the world's sky and sea). */
  tint: 1,
  /** How much of the plain daytime card shows through the darkest colours, so a night card still reads as sky and sea, not a black slab. */
  nightLift: 0.03,
};

/** The plain daytime card: the pond's sky and water. */
const DAY = { top: 0x4f9fe0, horizon: 0xbfe3f2, sea: 0x3aa6b9, deep: 0x0d4560 };

export type CardColours = { top: string; horizon: string; sea: string; deep: string };
type Place = { sky: number; skyTop: number; water: number; deep: number };

/**
 * The card's four bands (sky top, horizon, shallow sea, deep sea) as CSS colours, from the same recipe as the world's
 * sky and water (`World.updateDaylight`, `Sea.setColors`), so the card matches what fades in behind it.
 * `depth` is the charter's league when heading out to sea, or null for the harbour and other maps; `f` is the day fraction.
 */
export function cardColours(place: Place, depth: number | null, f: number): CardColours {
  const n = nightness(f);
  const tw = twilight(n);
  const c = (h: number) => new THREE.Color(h);
  const sky = c(place.sky).lerp(c(0x152649), n).lerp(c(0xff8a4a), tw * 0.7);
  const top = c(place.skyTop).lerp(c(0x050a19), n).lerp(c(0x5a4a8a), tw * 0.35);
  const water = c(place.water).multiplyScalar(1 - 0.75 * n);
  const deep = c(place.deep).multiplyScalar(1 - 0.67 * n);
  if (depth !== null) {
    const mood = seaMood(depth);
    const m = Math.min(1, mood);
    const gloom = gloomAt(mood);
    const keep = nightSkyKeep(n, nightDarkAt(mood));
    sky.lerp(c(0xc8bcc6).multiplyScalar(keep), m);
    top.lerp(c(0x8c86a0).multiplyScalar(keep), m);
    sky.multiplyScalar(1 - 0.4 * gloom);
    top.multiplyScalar(1 - 0.45 * gloom);
    const dim = (h: number, k: number) => c(h).multiplyScalar(k);
    const seaGloom = 1 - 0.35 * gloom;
    water.copy(c(place.water)).multiplyScalar(1 - 0.9 * n).lerp(c(0x07121f), 0.45 * n).lerp(dim(0x3f6674, 1 - 0.75 * n), Math.min(1, m * 1.4)).multiplyScalar(seaGloom);
    deep.copy(c(place.deep)).multiplyScalar(1 - 0.88 * n).lerp(c(0x07121f), 0.3 * n).lerp(dim(0x2a3a4e, 1 - 0.67 * n), Math.min(1, m * 1.4)).multiplyScalar(seaGloom);
  }
  const { tint, nightLift } = CAST_OFF_CARD;
  const out = (mine: THREE.Color, day: number) =>
    '#' + c(day).lerp(mine.lerp(c(day), nightLift * n), tint).getHexString();
  return { top: out(top, DAY.top), horizon: out(sky, DAY.horizon), sea: out(water, DAY.sea), deep: out(deep, DAY.deep) };
}
