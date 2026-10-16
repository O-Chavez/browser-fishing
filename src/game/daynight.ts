/** A full day lasts this long in real seconds, and is shared by everyone (clock based). */
export const DAY_SECONDS = 600;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Position in the day: 0..1 where 0 is bright morning, ~0.5 dusk, ~0.7 deep night, ~0.95 dawn. */
export const dayFraction = (seconds: number): number => ((seconds / DAY_SECONDS) % 1 + 1) % 1;

/** 0 = full daylight, 1 = full night. */
export function nightness(f: number): number {
  if (f < 0.45) return 0;
  if (f < 0.6) return smooth(0.45, 0.6, f);
  if (f < 0.85) return 1;
  return 1 - smooth(0.85, 1, f);
}

/** 0..1, peaks mid-way through dusk and dawn for warm horizon colours. */
export const twilight = (night: number): number => 4 * night * (1 - night);
