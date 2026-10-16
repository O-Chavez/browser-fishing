export const EYE_HEIGHT = 1.7;
export const DOCK_TOP = 0.7;

/** Flattened build area (the town hub) blended into the terrain. */
export interface Pad { x: number; z: number; r: number; h: number }
const PAD_BLEND = 10;
let pad: Pad | null = null;
export const setPad = (p: Pad | null): void => {
  pad = p;
};

export function waveHeight(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.35 + t * 1.1) * 0.07 +
    Math.sin(z * 0.5 - t * 1.3 + x * 0.2) * 0.05 +
    Math.sin((x + z) * 0.9 + t * 2.0) * 0.02
  );
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** theta = atan2(x, z): 0 points at the shore behind the dock. */
export function innerRadius(theta: number): number {
  return 52 - 42 * Math.exp(-(theta * theta) / 0.3) + 4 * Math.sin(theta * 3) + 2 * Math.sin(theta * 7 + 1);
}

export function padWeight(x: number, z: number): number {
  if (!pad) return 0;
  return 1 - smooth(pad.r, pad.r + PAD_BLEND, Math.hypot(x - pad.x, z - pad.z));
}

export function groundHeight(x: number, z: number): number {
  const raw = rawGroundHeight(x, z);
  const w = padWeight(x, z);
  return w > 0 && pad ? raw + (pad.h - raw) * w : raw;
}

function rawGroundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const d = r - innerRadius(Math.atan2(x, z));
  let base = -0.7 + 1.3 * smooth(-6, 1, d);
  if (d < -6) base += (d + 6) * 0.8;
  const dd = Math.max(0, d);
  const hills = Math.pow(dd, 1.2) * 0.1 * (0.6 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.06));
  const noise = Math.sin(x * 0.13) * Math.cos(z * 0.11) + 0.5 * Math.sin(x * 0.31 + z * 0.27);
  return base + hills + noise * Math.min(1, dd / 10) * 2.5;
}

export const onDock = (x: number, z: number, pad = 0): boolean =>
  Math.abs(x) < 1.5 + pad && z > -3.2 - pad && z < 12 + pad;

/** Height of the surface a player stands on. */
export const standHeight = (x: number, z: number): number => {
  const g = Math.max(groundHeight(x, z), -0.1);
  return onDock(x, z) ? Math.max(g, DOCK_TOP) : g;
};

export const isWater = (x: number, z: number): boolean => groundHeight(x, z) < -0.25 && !onDock(x, z, 0.3);

export function mulberry(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
