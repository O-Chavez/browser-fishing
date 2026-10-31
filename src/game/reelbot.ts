// Reel bots for the fight tests (and later the dive's): simulated players with a reaction time, playing by what
// the HUD shows. Test-only; the game never imports this.
import { mulberry } from './env';
import { GOOD_MAX, Reel, type ReelStatus } from './reel';

/**
 * How a bot plays: it eases off once tension is within `hi` of the red, and takes up the line again once it's
 * within `lo` of the fish's pull (or, in the calm, below 0.6). `naive` plays only by the big word: eases off on
 * EASE OFF! (the red) and tightens on TIGHTEN! (below the pull).
 */
export interface BotStyle {
  lo: number;
  hi: number;
  naive?: boolean;
}

/** The styles a skilled bot picks its best from. */
export const STYLES: BotStyle[] = [
  { lo: 0.05, hi: 0.05 },
  { lo: 0.1, hi: 0.05 },
  { lo: 0.05, hi: 0.12 },
  { lo: 0.1, hi: 0.12 },
  // Riding high in the green, to give a strong fish less line.
  { lo: 0.25, hi: 0.05 },
  { lo: 0.25, hi: 0.1 },
];

export const NAIVE: BotStyle = { lo: 0, hi: 0, naive: true };

export interface BotFight {
  status: ReelStatus;
  t: number;
  frays: number;
  lineOut: number;
  /** The line snapped while the button was up (must never happen). */
  snappedReleased: boolean;
}

/**
 * One fight at difficulty `d` by a bot that reacts `react` seconds late, jittered ±25% per reaction.
 * `rng` drives the fish, `brng` the bot. Fixed 1/60 s steps.
 */
export function botFight(d: number, react: number, style: BotStyle, rng: () => number, brng: () => number, maxT = 600): BotFight {
  const r = new Reel(d, rng);
  const dt = 1 / 60;
  let holding = true;
  let desired = true;
  const queue: { at: number; v: boolean }[] = [];
  let t = 0;
  while (r.status === 'reeling' && t < maxT) {
    const take = r.surging ? Math.min(r.need + style.lo, GOOD_MAX - style.hi - 0.03) : 0.6;
    const want: boolean = style.naive
      ? (desired ? r.tension <= GOOD_MAX : r.tension < Math.max(r.need, r.surging ? 0 : 0.6))
      : (desired ? r.tension <= GOOD_MAX - style.hi : r.tension < take);
    if (want !== desired) {
      desired = want;
      queue.push({ at: t + react * (0.75 + 0.5 * brng()), v: want });
    }
    while (queue.length && queue[0].at <= t) holding = queue.shift()!.v;
    r.update(dt, holding);
    t += dt;
  }
  return {
    status: r.status === 'reeling' ? 'escaped' : r.status,
    t,
    frays: r.wear.frays,
    lineOut: r.wear.lineOut,
    snappedReleased: r.status === 'snapped' && !holding,
  };
}

export interface BotCell {
  land: number;
  snaps: number;
  snappedReleased: number;
  /** Mean seconds per fight. */
  t: number;
  /** Share of landed fish with no frays. */
  clean: number;
  style: number;
}

/** `n` fights per style at difficulty `d`; returns the best style's results (most landed, then fastest). */
export function botCell(d: number, react: number, n = 300, seed = 1, styles = STYLES): BotCell {
  let best: BotCell | null = null;
  styles.forEach((st, si) => {
    const rng = mulberry(seed * 7919 + Math.round(d * 1000));
    const brng = mulberry(seed * 104729 + Math.round(react * 1000) + 17);
    let land = 0, snaps = 0, released = 0, t = 0, clean = 0;
    for (let i = 0; i < n; i++) {
      const f = botFight(d, react, st, rng, brng);
      t += f.t;
      if (f.status === 'caught') {
        land++;
        if (f.frays === 0) clean++;
      }
      if (f.status === 'snapped') snaps++;
      if (f.snappedReleased) released++;
    }
    const c: BotCell = { land: land / n, snaps: snaps / n, snappedReleased: released / n, t: t / n, clean: land ? clean / land : 0, style: si };
    if (!best || c.land > best.land || (c.land === best.land && c.t < best.t)) best = c;
  });
  return best!;
}

/** Land rate across a difficulty sweep, and where it crosses 50% (linear between grid points). */
export function botSweep(react: number, lo: number, hi: number, step = 0.1, n = 300, styles = STYLES) {
  const pts: { d: number; cell: BotCell }[] = [];
  for (let d = lo; d <= hi + 1e-9; d += step) pts.push({ d: +d.toFixed(3), cell: botCell(+d.toFixed(3), react, n, 1, styles) });
  let d50 = NaN;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1].cell.land, p1 = pts[i].cell.land;
    if (p0 >= 0.5 && p1 < 0.5) {
      d50 = pts[i - 1].d + ((p0 - 0.5) / (p0 - p1)) * (pts[i].d - pts[i - 1].d);
      break;
    }
  }
  let steepest = 0;
  for (let i = 2; i < pts.length; i++) steepest = Math.max(steepest, pts[i - 2].cell.land - pts[i].cell.land);
  return { pts, d50, steepest };
}
