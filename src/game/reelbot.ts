// Reel bots for the fight tests (and later the dive's): simulated players with a reaction time, playing by what
// the HUD shows. For tests and the dev gauge lab; the game never imports this.
import { mulberry } from './env';
import { FIGHT_DT, GOOD_MAX, Reel, type Gaps, type HoldLog, type ReelStatus, type ReelTune } from './reel';

/**
 * How a bot plays: it eases off once tension is within `hi` of the red, and takes up the line again once it's
 * within `lo` of the fish's pull (or, in the calm, below 0.6). `naive` plays only by the big word: eases off on
 * EASE OFF! (the red) and tightens on TIGHTEN! (below the pull).
 */
export interface BotStyle {
  lo: number;
  hi: number;
  naive?: boolean;
  /**
   * Pushes the gear: with `hi` below 0 it rides into the red, easing off once the fray mark it's filling is this
   * full (0..1), so it spends strain without fraying the line.
   */
  push?: number;
  /**
   * Plays ahead of the dot (`peakAhead`): holds only while holding
   * `lead` seconds past its reaction time keeps the dot `margin` below the red (a negative margin rides into it), so
   * it lets go before a surge peaks rather than on the tension. With `warn` it also lets go on SURGE! when the next
   * surge's ghost reaches the red.
   */
  anticipate?: { margin: number; lead: number; warn?: boolean };
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

/** Styles that ride into the red and spend strain without fraying the line (a player pushing the gear). */
export const PUSH_STYLES: BotStyle[] = [
  { lo: 0.1, hi: -0.04, push: 0.5 },
  { lo: 0.1, hi: -0.04, push: 0.8 },
  { lo: 0.25, hi: -0.04, push: 0.5 },
  { lo: 0.25, hi: -0.04, push: 0.8 },
  { lo: 0.1, hi: -0.1, push: 0.5 },
  { lo: 0.25, hi: -0.1, push: 0.8 },
];

/**
 * Oscar's own style, fitted to his lab fights (2026-11-02, 99 presses): in a surge he lets go as the needle tips into
 * the red and presses again as soon as it drops back out, on every fish.
 */
export const EDGE_STYLES: BotStyle[] = [
  { lo: 0.6, hi: -0.02, push: 0.2 },
  { lo: 0.6, hi: 0 },
];

/** Styles that anticipate surges: every margin and lead, with and without letting go on the warning. */
export const ANTICIPATE_STYLES: BotStyle[] = [-0.04, 0, 0.04, 0.08].flatMap((margin) =>
  [0.1, 0.2, 0.3, 0.45].flatMap((lead) => [false, true].map((warn) => ({ lo: 0, hi: 0, anticipate: { margin, lead, warn } }))),
);

const ALL_STYLES = [...STYLES, ...PUSH_STYLES, ...EDGE_STYLES, ...ANTICIPATE_STYLES];

/**
 * The reference players for the ladder (REELING.md, "The foundation"; the rungs are read band by band). Each picks its
 * best style per fish.
 * - **careful** keeps to the green and upgrades sooner: slower and more cautious.
 * - **skilled** is Oscar's habit: about 0.12 s to react, letting go right at the red's edge (fitted to his lab fights
 *   on the old fight; to refit on the foundation's).
 * - **best** is the best play a hand as quick as Oscar's can find, anticipating surges included.
 * - **anticipating** plays ahead of the dot only, at Oscar's speed.
 * - **ceiling** is 0.03 s with every style, a superhuman bound for "+3 never lands".
 */
export const HANDS = {
  careful: { react: 0.4, styles: STYLES },
  skilled: { react: 0.12, styles: EDGE_STYLES },
  best: { react: 0.12, styles: ALL_STYLES },
  anticipating: { react: 0.12, styles: ANTICIPATE_STYLES },
  ceiling: { react: 0.03, styles: ALL_STYLES },
};
export type Hand = keyof typeof HANDS;

export interface BotFight {
  status: ReelStatus;
  t: number;
  frays: number;
  lineOut: number;
  /** The line snapped while the button was up (must never happen). */
  snappedReleased: boolean;
  /** The fish got tired, or exhausted, before the fight ended (a sea fish, `P.tire`). */
  tired: boolean;
  exhausted: boolean;
  /** Surges that started while the fish was tired. */
  tiredSurges: number;
}

/**
 * One fight on fish `d` by a bot that reacts `react` seconds late, jittered ±25% per reaction. `rng` drives the
 * fish, `brng` the bot, `tune` overrides levers. Fixed 1/60 s steps, recorded into `log` if given (as the game does).
 */
export function botFight(d: Gaps, react: number, style: BotStyle, rng: () => number, brng: () => number, tune?: ReelTune, maxT = 600, log?: HoldLog): BotFight {
  return botRun(new Reel(d, rng, tune), react, style, brng, maxT, log);
}

/** `botFight` on a fight already made. */
export function botRun(r: Reel, react: number, style: BotStyle, brng: () => number, maxT = 600, log?: HoldLog): BotFight {
  const dt = FIGHT_DT;
  let holding = true;
  let desired = true;
  const queue: { at: number; v: boolean }[] = [];
  let t = 0;
  let tiredSurges = 0;
  while (r.status === 'reeling' && t < maxT) {
    const take = r.surging ? Math.min(r.need + style.lo, GOOD_MAX - Math.max(0, style.hi) - 0.03) : 0.6;
    // A pushing style lets go in the red once the mark it's filling is `push` full.
    const spent = style.push !== undefined && r.tension > GOOD_MAX && r.strain * 2 - r.wear.frays > style.push;
    const a = style.anticipate;
    const want: boolean = a
      ? !(a.warn && r.warning && r.surgePulls[1] >= GOOD_MAX - a.margin) && r.peakAhead(holding, react, a.lead) <= GOOD_MAX - a.margin
      : style.naive
        ? (desired ? r.tension <= GOOD_MAX : r.tension < Math.max(r.need, r.surging ? 0 : 0.6))
        : (desired ? r.tension <= GOOD_MAX - style.hi && !spent : r.tension < take);
    if (want !== desired) {
      desired = want;
      queue.push({ at: t + react * (0.75 + 0.5 * brng()), v: want });
    }
    while (queue.length && queue[0].at <= t) holding = queue.shift()!.v;
    log?.push(holding);
    const was = r.surgeCount;
    r.update(dt, holding);
    if (r.surgeCount > was && r.tired) tiredSurges++;
    t += dt;
  }
  return {
    status: r.status === 'reeling' ? 'escaped' : r.status,
    t,
    frays: r.wear.frays,
    lineOut: r.wear.lineOut,
    snappedReleased: r.status === 'snapped' && !holding,
    tired: r.tired,
    exhausted: r.exhausted,
    tiredSurges,
  };
}

export interface BotCell {
  land: number;
  snaps: number;
  snappedReleased: number;
  /** Fights still going at `maxT` (must never happen: every fight ends on its own). */
  timeouts: number;
  /** Mean seconds per fight. */
  t: number;
  /** Mean line taken per landed fish, in fight lengths (`ReelWear.lineOut`). */
  lineOut: number;
  /** Share of landed fish with no frays. */
  clean: number;
  style: number;
}

/** `n` fights per style on fish `d`; returns the best style's results (most landed, then fastest). */
export function botCell(d: Gaps, react: number, n = 300, seed = 1, styles = STYLES, tune?: ReelTune): BotCell {
  return cellOf((rng) => new Reel(d, rng, tune), d.weight + 7.3 * d.strength, react, n, seed, styles);
}

/** `botCell` on one of the reference hands. */
export const handCell = (d: Gaps, h: Hand, n = 20, tune?: ReelTune): BotCell => botCell(d, HANDS[h].react, n, 1, HANDS[h].styles, tune);

/** `botCell` for fights made by `make`; `key` seeds the fish. */
export function cellOf(make: (rng: () => number) => Reel, key: number, react: number, n = 300, seed = 1, styles = STYLES, maxT = 600): BotCell {
  let best: BotCell | null = null;
  styles.forEach((st, si) => {
    const rng = mulberry(seed * 7919 + Math.round(key * 1000));
    const brng = mulberry(seed * 104729 + Math.round(react * 1000) + 17);
    let land = 0, snaps = 0, released = 0, timeouts = 0, t = 0, clean = 0, line = 0;
    for (let i = 0; i < n; i++) {
      const f = botRun(make(rng), react, st, brng, maxT);
      t += f.t;
      if (f.t >= maxT) timeouts++;
      if (f.status === 'caught') {
        land++;
        line += f.lineOut;
        if (f.frays === 0) clean++;
      }
      if (f.status === 'snapped') snaps++;
      if (f.snappedReleased) released++;
    }
    const c: BotCell = { land: land / n, snaps: snaps / n, snappedReleased: released / n, timeouts: timeouts / n, t: t / n, lineOut: land ? line / land : 0, clean: land ? clean / land : 0, style: si };
    if (!best || c.land > best.land || (c.land === best.land && c.t < best.t)) best = c;
  });
  return best!;
}
