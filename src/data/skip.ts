/**
 * Skipping stones on Skipper's Beach (GAME_DESIGN.md §41): the rules the game and the server share. A player at the
 * stone pile (`CAMP.stones`) holds the action while a gauge sweeps like a cast's, and lets go: the nearer the sweet
 * spot, the more skips. The server counts them (`skipCount`), and every client on the map flies the same stone from
 * the count and the spread it sends (`skipPath`). The score is the number of skips; the sign beside the pile keeps
 * the day's best (`SkipBest`). Every number here is a default to play-test.
 */

export const SKIP = {
  /**
   * How near the pile's middle the prompt reaches, in metres, and how much further the server allows (a `pos` on its
   * way). The nearest seat is 2.74 m from the pile and offered from 1.5 m, so nowhere are both in reach.
   */
  reach: 1.2,
  slack: 1,
  /** The gauge sweeps up and down at this many lengths a second: the cast's own speed. */
  sweep: 1.1,
  /** The sweet spot on the gauge (0 to 1), and half the width of the band marked round it. */
  sweet: 0.75,
  band: 0.05,
  /** Skips from a release right on the sweet spot. */
  max: 12,
  /**
   * How the count falls as the release misses the sweet spot: `max * exp(-(miss / falloff) ^ sharp)`. `falloff` is
   * the miss (in gauge lengths) that leaves 37% of the skips; `sharp` below 1 makes the top a narrow peak, so a 12
   * takes a release within a hundredth of a second, and lets the far side trail off slowly.
   */
  falloff: 0.085,
  sharp: 0.75,
  /** The luck in a throw: up to this many skips more or fewer. */
  jitter: 0.7,
  /** The way every stone flies from the pile, in degrees round from +z toward +x (213 is out over the open lake, through the middle of the 2.6 m of water between the jetty's end and the fence's), and how far a throw may stray either side. */
  bearing: 213,
  spread: 2,
  /** How far from the pile a plopped stone first touches the water, in metres, and how much further each skip in the count puts it (a flat throw carries). */
  first: 7.5,
  firstMore: 0.25,
  /** The first hop's length for a plop and what each skip in the count adds, in metres; each hop after it is `shrink` of the one before. */
  hop: 1.4,
  hopMore: 0.17,
  shrink: 0.8,
  /** The first flight's speed over the ground for a plop and what each skip in the count adds, in metres a second. */
  speed: 8.5,
  speedMore: 0.6,
  /** A hop's time: this, and `hopPace` seconds for each metre it covers. */
  hopBase: 0.16,
  hopPace: 0.075,
  /** How high a plop lobs over the straight line from the hand to the water, and the least any throw rises, in metres. */
  lob: 1.7,
  flat: 0.12,
  /** A hop's height: this, and `hopLift` for each metre it covers. */
  hopMin: 0.03,
  hopLift: 0.11,
  /** Seconds a stone takes to sink after its last touch; the thrower's next stone waits for it. */
  sink: 0.5,
} as const;

/** The day's best throw: how many skips, and whose. */
export interface SkipBest {
  n: number;
  name: string;
}

/** A release value a client may send: a number from 0 to 1. */
export const validRelease = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

/**
 * How many times a stone let go at `p` on the gauge skips: `SKIP.max` on the sweet spot, falling away fast either
 * side, give or take `SKIP.jitter` of luck (`rng` gives 0 to 1). About 10 a hundredth of the gauge off, 6 at the
 * edge of the marked band, 4 at a tenth off, 2 at a fifth, and a plop (0 or 1) from a third off.
 */
export function skipCount(p: number, rng: () => number): number {
  const clean = SKIP.max * Math.exp(-((Math.abs(p - SKIP.sweet) / SKIP.falloff) ** SKIP.sharp));
  return Math.max(0, Math.min(SKIP.max, Math.round(clean + (rng() * 2 - 1) * SKIP.jitter)));
}

/** A throw's stray from the bearing, in radians, rounded for the wire. */
export const skipSpread = (rng: () => number): number => Math.round((rng() * 2 - 1) * SKIP.spread * (Math.PI / 180) * 1000) / 1000;

/** The unit vector a stone flies along for a stray of `a` radians (kept within the spread): x and z. */
export function skipDir(a: number): [number, number] {
  const most = (SKIP.spread * Math.PI) / 180;
  const b = (SKIP.bearing * Math.PI) / 180 + Math.max(-most, Math.min(most, a));
  return [Math.sin(b), Math.cos(b)];
}

/**
 * A stone's flight for a count of `n` skips: it touches the water `n + 1` times (each skip, then the touch it sinks
 * at). `d[i]` is touch i's distance from the pile along the throw's line, `t[i]` its time in seconds from the
 * release, and `lift[i]` how high leg i (the flight to touch i) rises over the straight line between its ends. A
 * better throw goes out flatter and faster, lands further out and hops longer; every hop is shorter than the last.
 */
export interface SkipPath {
  d: number[];
  t: number[];
  lift: number[];
}
export function skipPath(count: number): SkipPath {
  const n = Math.max(0, Math.min(SKIP.max, Math.floor(count)));
  const d = [SKIP.first + SKIP.firstMore * n];
  const t = [d[0] / (SKIP.speed + SKIP.speedMore * n)];
  const lift = [SKIP.flat + SKIP.lob * (1 - n / SKIP.max) ** 2];
  let hop = SKIP.hop + SKIP.hopMore * n;
  for (let i = 1; i <= n; i++) {
    d.push(d[i - 1] + hop);
    t.push(t[i - 1] + SKIP.hopBase + SKIP.hopPace * hop);
    lift.push(SKIP.hopMin + SKIP.hopLift * hop);
    hop *= SKIP.shrink;
  }
  return { d, t, lift };
}

/** How long a stone of `n` skips is in the air and sinking, in ms: its thrower's next one waits this long. */
export function skipFlightMs(n: number): number {
  const p = skipPath(n);
  return Math.round((p.t[p.t.length - 1] + SKIP.sink) * 1000);
}

/** True when a throw of `n` skips takes the day's best: at least one skip, and more than the holder's. A tie keeps the holder. */
export const beatsBest = (n: number, best: SkipBest | null): boolean => n >= 1 && (!best || n > best.n);

/** The sign's second line, under BEST SKIP: "today: 9 skips · Oscar", or "today: none yet". */
export const skipSignText = (best: SkipBest | null): string => (best ? `today: ${skipsText(best.n)} · ${best.name}` : 'today: none yet');

/** "1 skip", "7 skips". */
export const skipsText = (n: number): string => `${n} skip${n === 1 ? '' : 's'}`;

/** A real calendar day's number (UTC), for the day's best: it starts afresh when this changes. */
export const skipDay = (ms: number): number => Math.floor(ms / 86_400_000);
