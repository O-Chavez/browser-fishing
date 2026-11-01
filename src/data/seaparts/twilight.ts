/**
 * The parts of the Twilight (slice D): glowing lights, chin lure, lure clusters, tube eyes, see-through bodies, fangs and teeth, the oarfish's crest and plume, a wavy body.
 * A fish's `FishLook.twilight` holds the ones it has; `src/game/seafish/twilight.ts` builds them on the 3D model and the icon.
 */
export interface TwilightParts {
  /** A row of glowing lights: `n` of them from t = `from` to `to` along the body; on each side of the belly, or lower down the flank. */
  lights?: { n: number; from: number; to: number; row: 'belly' | 'flank'; color: number; r?: number };
  /** A glowing lure of this colour on a barbel hanging from the chin. */
  chinLure?: number;
  /** A chandelier of `n` lures on curved stalks above the head. */
  lures?: { n: number; color: number };
  /** Eyes on tubes, pointing straight up. */
  tubeEye?: boolean;
  /** A semi-transparent body with a faint spine inside. */
  glass?: boolean;
  /** Teeth: `n` a side, `len` for the longest (model units). `grin` makes a toothy smile around a bulb head instead of long fangs. */
  fangs?: { n: number; len: number; grin?: boolean };
  /** A red crest the whole length of the back, and a plume of long rays with glowing tips on the head. */
  crest?: boolean;
  /** A gentle wave in the body: amplitude (model units) and waves along the length. */
  wave?: [number, number];
  /** Glowing eyes: where along the body (t), how big, what colour. */
  eye?: { t: number; r: number; color: number };
  /** Squashes the tail fin's height. */
  tailH?: number;
}
