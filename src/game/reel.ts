import { mulberry } from './env';

export type ReelStatus = 'reeling' | 'caught' | 'snapped' | 'escaped';
/** Why a fight was lost: held in the red through a surge or in the calm (snapped), or the fish took all the line. */
export type LossReason = 'held-surge' | 'held-red' | 'ran';

/**
 * The foundation (REELING.md, Oscar 2026-11-02): a fish is its two gaps over the gear, `strength` over the line and
 * `weight` over the rod, open-ended and fractions allowed (`fightGaps`, `seaGaps`). 1 is a rung of the ladder: 0
 * parity, +1 a slight challenge, +2 the frontier, +3 the hard line. Nothing else about the fish counts; timing is the
 * same for every fish, and variety (temperaments, zones) comes later as modifiers on top.
 */
export interface Gaps {
  strength: number;
  weight: number;
}

/** The green's lower edge in the calm (reeling there tires the fish), and where the red starts. */
export const GOOD_MIN = 0.35;
export const GOOD_MAX = 0.8;

/** [gap, value] points, straight between and carried on past the ends. */
type Pts = number[][];
function at(pts: Pts, x: number): number {
  let i = 1;
  while (i < pts.length - 1 && x > pts[i][0]) i++;
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/** Fight levers. */
export const P = {
  /**
   * The fight's timing, the same for every fish and with no random spread (the old tier 3 averages): the calm
   * before a warning, the SURGE! warning, the surge, its build-up, and how fast the dot follows the button.
   */
  calm: 1.9,
  warn: 1.0,
  surge: 1.5,
  rise: 0.95,
  follow: 3.6,
  /** Holding heads the dot to the fish's pull plus this; letting go, to the pull times `slip`. */
  hold: 0.5,
  slip: 0.6,
  /** Where the fight starts on the line (0 = the fish has it all, 1 = landed). */
  start: 0.35,
  /** A fish far below the gear fights like one this far below: fights get shorter as the gear outgrows the fish, down to a floor. */
  floor: -2,
  /** Where a surge's pull marker sits at full build-up, by strength over the line: 0 mid-green, +1 the red's edge, +2 in the red, +3 past the end. */
  pull: [[-2, 0.4], [-1, 0.47], [0, 0.575], [1, 0.8], [2, 0.9], [3, 1.05]] as Pts,
  /** Where holding starts to win line in a surge, by weight over the rod: blue below, and at +3 the whole gauge. */
  threshold: [[-2, 0.25], [-1, 0.3], [0, 0.4], [1, 0.67], [2, 0.78], [3, 1.0]] as Pts,
  /**
   * Holding in a surge: line won per second anywhere above the threshold, one flat green (Oscar, 2026-11-03), and lost
   * per second per unit of tension below it.
   */
  win: 0.05,
  lose: 0.4,
  /** Letting go in a surge: line given per second at the surge's full build-up. */
  give: 0.15,
  /** × `give` by strength over the line: a stronger fish takes line faster when you let go (the review's E2, 2026-11-02). */
  giveBy: [[-2, 0.4], [-1, 0.6], [0, 1], [1, 2.2], [2, 4], [3, 8]] as Pts,
  /** How fast the dot falls on letting go, × `follow`, by where the fish's pull sits: at once matched, slowly at +2, barely at +3. */
  fall: [[0.4, 3], [0.575, 2.5], [0.8, 1.2], [0.9, 0.5], [1.05, 0.2]] as Pts,
  /** Slack: with the button up the fish always takes line (Oscar, 2026-11-02); in the calm at this rate per second. */
  slack: 0.05,
  /** The calm: holding reels in at `reel` per second. */
  reel: 0.1,
  /** × `reel` by weight over the rod, in the calm and once exhausted: a heavy fish reels slowly, a light one quickly. */
  calmBy: [[-2, 2], [-1, 1.4], [0, 1], [1, 0.45], [2, 0.22], [3, 0.08]] as Pts,
  /** Seconds of surging against a held line in the fish, by weight over the rod (the FIGHT bar). */
  fight: [[-2, 8], [-1, 11], [0, 14], [1, 20], [2, 30], [3, 40]] as Pts,
  /** Share of that a surge against slack line uses up, and reeling in the calm with the dot green. */
  slackTire: 0.25,
  calmTire: 0.45,
  /** At full fight, the calm between surges is this share of `calm`: a fresh fish surges close together. */
  burst: 0.8,
  /**
   * From this much fight left the fish is tired: going from there to exhausted, its surges pull up to `tiredPull`
   * weaker, last up to `tiredSurge` shorter and come up to ×(1 + `tiredGap`) further apart. Exhausted, it surges no more.
   */
  tiredAt: 0.6,
  tiredPull: 0.6,
  tiredSurge: 0.35,
  tiredGap: 0.75,
  /** A fish whose pull reaches the red stays this far into it however tired, so tiring never beats the line. */
  redFloor: 0.03,
  /**
   * How far the threshold drops as the FIGHT bar drains to empty, so the green grows back. Off (Oscar, 2026-11-03):
   * with one flat green it let quick hands land a combined +3 (strength +1 on weight +2) half the time.
   */
  tireDrop: 0,
  /** Seconds held in the red to fill one fray mark, by strength over the line (deeper red is faster, `deep`; the review's E2). */
  fray: [[-1, 1.8], [0, 1.5], [1, 1.2], [2, 0.9], [3, 0.5]] as Pts,
  /** Deeper red frays faster: fill speed ×(1 + k·(tension - GOOD_MAX) / 0.2), so a light touch of red takes the full time. */
  deep: 5,
  /** A part-filled fray mark drains back at this share of its fill speed once out of the red; a full one stays. */
  drain: 0.5,
};

/** Overrides of `P` for one fight, for the gauge lab and the sims; the game's fights use `P` as it is. */
export type ReelTune = Partial<typeof P>;

/**
 * e^x from + - × ÷ only, so a fight replays identically in every JS engine (`Math.exp` may round differently).
 * Taylor series on x/1024, then squared ten times; relative error ~1e-12 for |x| < 10.
 */
export function expArith(x: number): number {
  const y = x / 1024;
  let e = 1 + y * (1 + (y / 2) * (1 + (y / 3) * (1 + (y / 4) * (1 + y / 5))));
  for (let i = 0; i < 10; i++) e *= e;
  return e;
}

/** ln x (x > 0) from `expArith` and + - × ÷ only, by Newton's method on e^y = x. */
export function lnArith(x: number): number {
  let y = 0;
  let k = 0;
  // Scale into [0.5, 2] so a few steps converge: ln x = ln(x / 2^k) + k·ln 2.
  while (x > 2) { x /= 2; k++; }
  while (x < 0.5) { x *= 2; k--; }
  for (let i = 0; i < 6; i++) {
    const e = expArith(y);
    y += (2 * (x - e)) / (x + e);
  }
  return y + k * 0.6931471805599453;
}

/** x^q for x ≥ 0 without `Math.pow`: repeated multiplication for whole q, else e^(q·ln x). */
export function powArith(x: number, q: number): number {
  if (Number.isInteger(q) && q >= 0 && q <= 16) {
    let r = 1;
    for (let i = 0; i < q; i++) r *= x;
    return r;
  }
  return x <= 0 ? 0 : expArith(q * lnArith(x));
}

/** Triangle wave 0..1 (no `Math.sin`, so replays match across JS engines). */
const tri = (x: number) => {
  const f = x - Math.floor(x);
  return f < 0.5 ? 2 * f : 2 - 2 * f;
};

/** What a fight wore on the line, for the dive's spool. */
export interface ReelWear {
  /** Line the fish took, in fight progress (1 = the whole fight's length). */
  lineOut: number;
  /** Fray marks filled. */
  frays: number;
  snapped: boolean;
}

/**
 * A reel fight under the foundation's rules (REELING.md, "The foundation"). The fish is fully predictable: the same
 * timing every surge, only changed by tiring (the FIGHT bar). Strength places the pull marker against the red, weight
 * the threshold above which holding in a surge wins line; letting go in a surge always gives line, more on a
 * stronger fish, while the dot falls slower the stronger the fish. The calm reels slower on a heavier fish, and slack
 * line lets it swim off. Holding in the red fills a fray mark: two snap the line. The fish runs off once it has all
 * the line. A clean catch is a landed fish with no frays. `surgeDir`, `pull` and `lateral` only drive the visuals.
 */
export class Reel {
  tension = 0.1;
  progress: number;
  /** Fight left, 1 to 0: full fight, then tired, then exhausted at 0 (no more surges). */
  fightLeft = 1;
  status: ReelStatus = 'reeling';
  reason: LossReason | null = null;
  /** Which way the fish swims in a surge: looks only, the fight never reads it. */
  surgeDir: -1 | 0 | 1 = 0;
  surgeCount = 0;
  /** The pull marker right now (rising with the surge's build-up). */
  need = 0;
  /** The surge's build-up right now, 0..1 (0 in the calm): what scales the line won or given in a surge. */
  build = 0;
  /** How hard the fish is pulling right now, 0..1, for the visuals (splashes, the bobber, the rod's shake). */
  pull = 0;
  /** Where the fish swims, -1..1 across the view. */
  lateral = 0;
  /** Line strain, 0..1: each half is a fray mark, filled while holding in the red; snaps at 1. */
  strain = 0;
  /** Line won per second right now (negative while the fish takes it), for the gauge. */
  lineRate = 0;
  readonly wear: ReelWear = { lineOut: 0, frays: 0, snapped: false };
  /** This fish's pull at full build-up. */
  readonly pullAt: number;
  /** Where holding wins line before the fish tires. */
  readonly baseThreshold: number;

  private t = 0;
  private surgeT = 0;
  private surgeDur = 0;
  private nextSurge: number;
  private inRed = false;
  private held = false;
  /** How far strain may build in this stretch of red: up to the next whole fray. */
  private frayCap = 0.5;
  /** This fight's levers: `P` with the fight's overrides. */
  private readonly p: typeof P;
  private readonly fallK: number;
  private readonly fillRate: number;
  private readonly fightLen: number;
  private readonly calmRate: number;
  private readonly giveRate: number;

  constructor(readonly gaps: Gaps, private rng: () => number = Math.random, tune?: ReelTune) {
    const p = (this.p = tune ? { ...P, ...tune } : P);
    const s = Math.max(p.floor, gaps.strength), w = Math.max(p.floor, gaps.weight);
    this.progress = p.start;
    this.pullAt = at(p.pull, s);
    this.baseThreshold = at(p.threshold, w);
    this.fallK = p.follow * Math.max(0.05, at(p.fall, this.pullAt));
    this.fillRate = 1 / (2 * Math.max(0.05, at(p.fray, s)));
    this.fightLen = Math.max(1, at(p.fight, w));
    this.giveRate = p.give * Math.max(0, at(p.giveBy, s));
    this.calmRate = p.reel * Math.max(0.01, at(p.calmBy, w));
    this.nextSurge = 1.2 + p.warn;
  }

  /** Seconds since the fight started. */
  get elapsed(): number {
    return this.t;
  }
  /** The fish is running. */
  get surging(): boolean {
    return this.surgeDir !== 0;
  }
  /** A surge is about to start. */
  get warning(): boolean {
    return this.surgeDir === 0 && !this.exhausted && this.nextSurge < this.p.warn;
  }
  /** The FIGHT bar shows: every fish tires. */
  get tires(): boolean {
    return true;
  }
  /** Past full fight: its surges come further apart, shorter and weaker, more so the closer it is to exhausted. */
  get tired(): boolean {
    return this.fightLeft <= this.p.tiredAt;
  }
  /** Out of fight: no more surges, the reel brings it in. */
  get exhausted(): boolean {
    return this.fightLeft <= 0;
  }
  /** The fish is wearing itself out right now: surging against a held line. */
  get tiring(): boolean {
    return this.status === 'reeling' && this.surging && this.held && !this.exhausted;
  }
  /** How far a tired fish is toward exhausted, 0 to 1; 0 at full fight. */
  private get tiredness(): number {
    return this.tired ? 1 - this.fightLeft / this.p.tiredAt : 0;
  }
  /** Holding with the dot in the red: a fray mark is filling. */
  get fraying(): boolean {
    return this.inRed;
  }
  /** The fish is taking line right now. */
  get losingLine(): boolean {
    return this.lineRate < 0;
  }
  /** How fast line is being wound in, against the calm's base speed (1): turns the rod's crank. */
  get reelRate(): number {
    return Math.max(0, this.lineRate) / this.p.reel;
  }
  /** Landed with no frays. */
  get clean(): boolean {
    return this.status === 'caught' && this.wear.frays === 0;
  }
  /** Where holding wins line right now: lower as the fish tires. */
  get threshold(): number {
    return this.baseThreshold - this.p.tireDrop * (1 - this.fightLeft);
  }

  /** A tired fish's surge strength: it fades as it tires, but a fish whose pull reaches the red stays just in it. */
  private get fade(): number {
    const weak = 1 - this.p.tiredPull * this.tiredness;
    return this.pullAt > GOOD_MAX ? Math.max(weak, Math.min(1, (GOOD_MAX + this.p.redFloor) / this.pullAt)) : weak;
  }

  /** For the gauge: this surge's peak pull, or the next one's (both ends alike: the fish has no spread). */
  get surgePulls(): [number, number] {
    if (this.exhausted) return [0, 0];
    const p = this.pullAt * this.fade;
    return [p, p];
  }

  /** Line won per second holding at tension `t` at a surge's full build-up (negative: the fish takes it). For the gauge and the fight. */
  surgeLineAt(t: number): number {
    const over = t - this.threshold;
    return over < 0 ? this.p.lose * over : this.p.win;
  }

  /** For the gauge: seconds held at tension `t` to fill an empty fray mark (never, below the red). */
  markSeconds(t: number): number {
    return t <= GOOD_MAX ? Infinity : 0.5 / (this.fillRate * (1 + (this.p.deep * (t - GOOD_MAX)) / 0.2));
  }

  /** The surge's build-up at `s` seconds in, of a surge lasting `dur`. */
  private ramp(s: number, dur: number): number {
    return Math.max(0, Math.min(1, s / this.p.rise, (dur - s) / 0.25));
  }
  /** This surge's length: shorter as the fish tires. */
  private get surgeLen(): number {
    return this.p.surge * (1 - this.p.tiredSurge * this.tiredness);
  }

  /**
   * For the anticipating bot: the highest tension over the next `a` seconds with the button as `now`, then `b`
   * seconds holding, following the surge's build-up.
   */
  peakAhead(now: boolean, a: number, b: number): number {
    let t = this.tension, peak = t;
    const n = Math.round((a + b) / FIGHT_DT), na = Math.round(a / FIGHT_DT);
    const pull = this.pullAt * this.fade;
    for (let i = 1; i <= n; i++) {
      const tau = i * FIGHT_DT;
      let need = 0;
      if (this.surging) {
        const s = this.surgeT + tau;
        if (s < this.surgeDur) need = pull * this.ramp(s, this.surgeDur);
      } else if (!this.exhausted && tau > this.nextSurge) need = pull * this.ramp(tau - this.nextSurge, this.surgeLen);
      const hold = i <= na ? now : true;
      const target = hold ? need + this.p.hold : need * this.p.slip;
      t = Math.min(1, t + (target - t) * Math.min(1, (hold ? this.p.follow : this.fallK) * FIGHT_DT));
      if (i > na) peak = Math.max(peak, t);
    }
    return peak;
  }

  update(dt: number, holding: boolean): void {
    if (this.status !== 'reeling') return;
    const p = this.p;
    this.t += dt;
    this.held = holding;

    if (this.surgeDir !== 0) {
      this.surgeT += dt;
      if (this.surgeT >= this.surgeDur) {
        this.surgeDir = 0;
        // Close together at full fight, further apart as it tires.
        const tiring = this.tired ? 1 + p.tiredGap * this.tiredness : p.burst;
        this.nextSurge = p.calm * tiring + p.warn;
      }
    } else if (!this.exhausted) {
      this.nextSurge -= dt;
      if (this.nextSurge <= 0) {
        this.surgeDir = this.rng() < 0.5 ? -1 : 1;
        this.surgeDur = this.surgeLen;
        this.surgeT = 0;
        this.surgeCount++;
      }
    }

    const ramp = (this.build = this.surging ? this.ramp(this.surgeT, this.surgeDur) : 0);
    this.need = this.surging ? this.pullAt * this.fade * ramp : 0.064 * tri(this.t * 0.5);
    this.pull = this.surging ? Math.min(1, this.fade * ramp) : this.need;

    // Holding heads above the pull at the dot's speed; letting go falls, slower the stronger the fish. The dot stops at the gauge's end.
    const target = holding ? this.need + p.hold : this.need * p.slip;
    this.tension = Math.min(1, this.tension + (target - this.tension) * Math.min(1, (holding ? p.follow : this.fallK) * dt));

    // A surge against a held line tires the fish, against slack much less; reeling it in the calm, at `calmTire`.
    const work = this.surging ? (holding ? 1 : p.slackTire) : holding && this.tension >= GOOD_MIN ? p.calmTire : 0;
    this.fightLeft = Math.max(0, this.fightLeft - (dt / this.fightLen) * work);

    // In a surge, holding wins or loses line by the threshold (weight); letting go always gives it. In the calm, holding
    // reels in and slack line lets the fish swim off: no input ever wins line.
    let rate: number;
    if (this.surging) rate = holding ? this.surgeLineAt(this.tension) * ramp : -this.giveRate * ramp;
    else rate = holding ? this.calmRate : -p.slack;
    this.lineRate = rate;
    if (rate < 0) this.wear.lineOut -= rate * dt;
    this.progress = Math.min(1, Math.max(0, this.progress + rate * dt));

    this.lateral += (this.surgeDir * this.pull - this.lateral) * Math.min(1, 3 * dt);

    // Each stretch of red held fills the next fray mark, and stops once it's whole: two chances before the line snaps.
    // A part-filled mark drains back out of the red; a whole one stays.
    const red = holding && this.tension > GOOD_MAX;
    if (red) {
      if (!this.inRed) this.frayCap = (this.wear.frays + 1) / 2;
      this.strain = Math.min(this.frayCap, this.strain + this.fillRate * (1 + (p.deep * (this.tension - GOOD_MAX)) / 0.2) * dt);
      this.wear.frays = Math.max(this.wear.frays, Math.floor(this.strain * 2));
    } else this.strain = Math.max(this.wear.frays / 2, this.strain - p.drain * this.fillRate * dt);
    this.inRed = red;

    if (this.progress >= 1) this.status = 'caught';
    else if (this.wear.frays >= 2) {
      this.status = 'snapped';
      this.wear.snapped = true;
      this.reason = this.surging ? 'held-surge' : 'held-red';
    } else if (this.progress <= 0) {
      this.status = 'escaped';
      this.reason = 'ran';
    }
  }
}

/** The fight's fixed time step: the client steps the reel at this rate and the server replays it the same way. */
export const FIGHT_DT = 1 / 60;
/** Fights end here: past 10 minutes the fish gets away (the replay stops too). */
export const MAX_FIGHT_STEPS = 10 * 60 * 60;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The button over a fight, one bit a step (bit i of byte i >> 3), sent with `catch` as base64 for the server's replay. */
export class HoldLog {
  private bytes = new Uint8Array(256);
  steps = 0;

  push(holding: boolean): void {
    if (this.steps >= MAX_FIGHT_STEPS) return;
    const i = this.steps++;
    if (i >> 3 >= this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    if (holding) this.bytes[i >> 3] |= 1 << (i & 7);
  }

  encode(): string {
    const b = this.bytes;
    const n = (this.steps + 7) >> 3;
    let out = '';
    for (let i = 0; i < n; i += 3) {
      const v = (b[i] << 16) | ((i + 1 < n ? b[i + 1] : 0) << 8) | (i + 2 < n ? b[i + 2] : 0);
      out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + (i + 1 < n ? B64[(v >> 6) & 63] : '=') + (i + 2 < n ? B64[v & 63] : '=');
    }
    return out;
  }
}

/** Decodes `HoldLog.encode`; null if it isn't base64 or is longer than the longest fight. */
export function decodeHolds(h: string): Uint8Array | null {
  if (typeof h !== 'string' || h.length % 4 || h.length > Math.ceil(MAX_FIGHT_STEPS / 24) * 4) return null;
  const pad = h.endsWith('==') ? 2 : h.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((h.length / 4) * 3 - pad);
  for (let i = 0, o = 0; i < h.length; i += 4) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const c = h[i + j];
      const k = c === '=' && i + j >= h.length - pad ? 0 : B64.indexOf(c);
      if (k < 0) return null;
      v = (v << 6) | k;
    }
    for (let j = 0; j < 3 && o < out.length; j++) out[o++] = (v >> (16 - 8 * j)) & 255;
  }
  return out;
}

/**
 * Replays a fight from its seed, gaps and button log (`HoldLog.encode`), as the server does to check a catch. Steps
 * until the fight ends or the log runs out; null if the log doesn't decode. `tune` is for the lab and the sims.
 */
export function replayFight(gaps: Gaps, seed: number, h: string, tune?: ReelTune): Reel | null {
  const bits = decodeHolds(h);
  if (!bits) return null;
  const r = new Reel(gaps, mulberry(seed), tune);
  const n = Math.min(MAX_FIGHT_STEPS, bits.length * 8);
  for (let i = 0; i < n && r.status === 'reeling'; i++) r.update(FIGHT_DT, ((bits[i >> 3] >> (i & 7)) & 1) === 1);
  return r;
}
