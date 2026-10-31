export type ReelStatus = 'reeling' | 'caught' | 'snapped' | 'escaped';
/** Why a fight was lost: held in the red through a surge or in the calm (snapped), or the fish took all the line. */
export type LossReason = 'held-surge' | 'held-red' | 'ran';

export const GOOD_MIN = 0.35;
export const GOOD_MAX = 0.8;
export const SWEET_MIN = 0.42;
export const SWEET_MAX = 0.68;

/**
 * Fight levers. Pairs read as `base / (1 + k·(d - 0.4))` (`lever`) keep tightening past the pond's 3.2 cap (the
 * sea has no cap) without ever reaching zero.
 */
export const P = {
  /** Warning length (SURGE! in orange, before the surge): Wd = min(cap, w2·e^(-a·(d-2))); each surge's warning is Wd·U(min, 1). [w2, a, min, cap] */
  warn: [1.7, 1.8, 0.02, 1.2],
  /** Per-fish temperament: warnings ×(1+temper)^±1, log-uniform (a feisty or a lazy fish). */
  temper: 2,
  /** Calm time between surges, before the warning. */
  gap: [2.6, 0.3],
  /** Surge length, a·(1 + k·(d - 1)): longer on harder fish, so holding straight through one frays the line. */
  surge: [1.3, 0.25],
  /**
   * Surge build-up: min(cap, r1·e^(-b·(d-1))) seconds, slow on easy fish, but never under `floor` seconds until the
   * fish is far above the gear: the floor fades from f0 to f1 difficulty. [r1, b, cap, floor, f0, f1]
   */
  rise: [4.2, 2.48, 2.5, 0.4, 3.0, 3.8],
  /**
   * How hard a surge pulls, as the tension it takes to hold the line: a + b·d². Tension below it lets the fish take
   * line; above GOOD_MAX it's red. So the safe band in a surge runs from here to the red, narrowing as fish get
   * harder, and a fish whose pull reaches the red is too strong for the gear.
   */
  need: [0.3, 0.05],
  /** ± share of random spread on warn, gap and surge length. */
  jitter: 0.2,
  /** ± share of random spread on each surge's strength. */
  powerJitter: 0.2,
  /** Per-fish strength: ×(1+fight)^±1, log-uniform (some fish of a kind pull harder than others). */
  fight: 0.5,
  /** Holding heads tension to the fish's pull plus this; letting go, to the pull times `slip`. */
  hold: 0.5,
  slip: 0.6,
  /** Tension follow speed: a + b·d per second. Slow on easy fish, quick on hard ones. */
  follow: [2, 1],
  /** Base reel speed. */
  reel: 0.08,
  /** Reeling in a surge, with tension truly green (in the green band, above the fish's pull), on fish the gear can handle: this share of the reel speed up to d0, none from d1. [share, d0, d1] */
  surgeReel: [0.8, 1.5, 2.0],
  /** How much harder fish slow the reel: reel / (1 - k + k·d). */
  reelK: 0.15,
  /** Line the fish takes per second per unit of tension short of its pull. */
  run: 1.5,
  /**
   * Drag: line a strong fish takes in a surge even with the gauge green, k·max(0, d - d0)^q per second at full pull.
   * Riding high in the green saves up to `save` of it, most of that just below the red (h^p, h = 0 at the fish's
   * pull, 1 at the red). So a fish too strong for the gear wins line faster than the calm can win it back. [k, d0, save, p, q]
   */
  drag: [0.07, 1.3, 0.9, 2, 1],
  /** Where the fight starts on the line (0 = the fish has it all, 1 = landed). */
  start: 0.35,
  /** Seconds held in the red that fill one fray mark: a up to the first difficulty, down to b at the second. [a, b, d0, d1] */
  fray: [2.5, 1.5, 1, 3],
  /** Deeper red frays faster: fill speed ×(1 + k·(tension - GOOD_MAX) / 0.2), so a light touch of red takes the full time. */
  deep: 5,
  /** A part-filled fray mark drains back at this share of its fill speed once out of the red; a full one stays. */
  drain: 0.5,
  /**
   * The green sweet spot's half-width (around 0.55) by difficulty, [d, half-width] points: wide on easy fights, the
   * base on matched gear, a sliver when the fish outclasses the gear. Reeling in it is 35% faster.
   */
  sweet: [[0.6, 0.21], [2.0, 0.13], [3.2, 0.03]],
};

/** Per-fight overrides of `P` (a fish's behaviour at sea, say); anything left out keeps its `P` value. */
export type ReelTune = Partial<typeof P>;

const lever = ([a, k]: number[], d: number) => a / (1 + k * Math.max(0, d - 0.4));
const between = (d: number, d0: number, d1: number) => Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
const SWEET_CENTER = (SWEET_MIN + SWEET_MAX) / 2;
/** The sweet spot's half-width at difficulty d, straight between the `sweet` points. */
function sweetHalf(pts: number[][], d: number): number {
  if (d <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * between(d, pts[i - 1][0], pts[i][0]);
  return pts[pts.length - 1][1];
}

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
const LN_TEMPER = 1.0986122886681098; // ln(1 + P.temper)

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
 * Tension reel fight: keep the gauge green. Holding reels the fish in and raises tension; letting go lowers it.
 * Every few seconds, after a warning, the fish surges: it pulls with a set strength (`need`), taking line while
 * tension is below it, and holding pushes tension into the red. So in a surge the player eases on and off to stay
 * between the fish's pull and the red. Holding in the red fills a fray mark (two snap the line; letting go never
 * frays), and the fish escapes if it takes all the line. Harder fish pull harder, move the needle faster, surge
 * longer and fray quicker; a fish whose pull reaches the red is too strong for the gear.
 * A clean catch is a landed fish with no frays. `surgeDir` only drives where the fish swims visually.
 */
export class Reel {
  tension = 0.1;
  progress: number;
  stamina = 1;
  status: ReelStatus = 'reeling';
  reason: LossReason | null = null;
  surgeDir: -1 | 0 | 1 = 0;
  surgePower = 0;
  pull = 0;
  lateral = 0;
  surgeCount = 0;
  /** The tension it takes to hold the line right now: the fish's pull. */
  need = 0;
  /** Line a strong fish is dragging out right now, per second, even with the gauge green. */
  drag = 0;
  /** Line strain, 0..1: each half is a fray mark, filled while holding in the red; snaps at 1. */
  strain = 0;
  readonly wear: ReelWear = { lineOut: 0, frays: 0, snapped: false };
  /** The sweet spot, wider on easier fights. */
  readonly sweetMin: number;
  readonly sweetMax: number;

  private t = 0;
  private surgeT = 0;
  private surgeDur = 0;
  private nextSurge: number;
  private warnLen: number;
  private inRed = false;
  /** How far strain may build in this stretch of red: up to the next whole fray. */
  private frayCap = 0.5;
  private readonly fillRate: number;
  private readonly warnMax: number;
  private readonly riseLen: number;
  private readonly strength: number;
  private readonly follow: number;
  private readonly dragRate: number;
  private readonly surgeReel: number;
  /** This fight's levers: `P` with the fight's overrides. */
  private readonly p: typeof P;

  constructor(
    private difficulty: number,
    private rng: () => number = Math.random,
    tune?: ReelTune,
  ) {
    const d = difficulty;
    this.p = tune ? { ...P, ...tune } : P;
    this.progress = this.p.start;
    const half = sweetHalf(this.p.sweet, d);
    this.sweetMin = SWEET_CENTER - half;
    this.sweetMax = SWEET_CENTER + half;
    this.fillRate = 1 / (2 * (this.p.fray[0] + (this.p.fray[1] - this.p.fray[0]) * between(d, this.p.fray[2], this.p.fray[3])));
    const floor = this.p.rise[3] - (this.p.rise[3] - 0.05) * between(d, this.p.rise[4], this.p.rise[5]);
    this.riseLen = Math.min(this.p.rise[2], Math.max(floor, this.p.rise[0] * expArith(-this.p.rise[1] * (d - 1))));
    this.strength = (this.p.need[0] + this.p.need[1] * d * d) * expArith((2 * rng() - 1) * Math.log1p(this.p.fight));
    this.follow = this.p.follow[0] + this.p.follow[1] * d;
    this.dragRate = this.p.drag[0] * Math.max(0, d - this.p.drag[1]) ** this.p.drag[4];
    this.surgeReel = this.p.surgeReel[0] * (1 - between(d, this.p.surgeReel[1], this.p.surgeReel[2]));
    this.warnMax = this.p.warn[0] * expArith(-this.p.warn[1] * (d - 2)) * expArith((2 * rng() - 1) * (this.p.temper === P.temper ? LN_TEMPER : Math.log1p(this.p.temper)));
    this.warnLen = this.rollWarn();
    this.nextSurge = 1.2 + this.warnLen;
  }

  private rollWarn(): number {
    return Math.min(this.p.warn[3], this.warnMax * (this.p.warn[2] + (1 - this.p.warn[2]) * this.rng()));
  }

  private spread(x: number, j = this.p.jitter): number {
    return x * (1 - j + 2 * j * this.rng());
  }

  /** Seconds since the fight started. */
  get elapsed(): number {
    return this.t;
  }

  /** Fish is running: keep the gauge green. */
  get surging(): boolean {
    return this.surgeDir !== 0;
  }

  /** A surge is about to start. */
  get warning(): boolean {
    return this.surgeDir === 0 && this.nextSurge < this.warnLen;
  }

  get inSweetSpot(): boolean {
    return this.tension >= this.sweetMin && this.tension <= this.sweetMax;
  }

  get inGoodZone(): boolean {
    return this.tension >= GOOD_MIN && this.tension <= GOOD_MAX;
  }

  /** Holding with the gauge in the red: a fray mark is filling. */
  get fraying(): boolean {
    return this.inRed;
  }

  /** The fish is taking line: tension is below its pull. */
  get losingLine(): boolean {
    return this.tension < this.need;
  }

  /** A strong fish is dragging line out even with the gauge green. */
  get dragging(): boolean {
    return this.drag > 0.01 && !this.losingLine;
  }

  /** This surge pulls into the red: the gear can't hold the line without fraying it. */
  get outmatched(): boolean {
    return this.surging && this.need > GOOD_MAX;
  }

  /** Landed with no frays. */
  get clean(): boolean {
    return this.status === 'caught' && this.wear.frays === 0;
  }

  update(dt: number, holding: boolean): void {
    if (this.status !== 'reeling') return;
    const d = this.difficulty;
    this.t += dt;

    if (this.surgeDir !== 0) {
      this.surgeT += dt;
      if (this.surgeT >= this.surgeDur) {
        this.surgeDir = 0;
        this.warnLen = this.rollWarn();
        this.nextSurge = this.spread(lever(this.p.gap, d)) + this.warnLen;
      }
    } else {
      this.nextSurge -= dt;
      if (this.nextSurge <= 0) {
        this.surgeDir = this.rng() < 0.5 ? -1 : 1;
        this.surgeDur = this.spread(this.p.surge[0] * (1 + this.p.surge[1] * Math.max(0, d - 1)));
        this.surgeT = 0;
        this.surgeCount++;
        this.surgePower = this.spread(1, this.p.powerJitter) * (0.85 + 0.15 * this.stamina);
      }
    }

    if (this.surgeDir !== 0) {
      const ramp = Math.max(0, Math.min(1, this.surgeT / this.riseLen, (this.surgeDur - this.surgeT) / 0.25));
      this.need = this.strength * this.surgePower * ramp;
      this.pull = this.surgePower * ramp;
    } else {
      this.need = 0.04 * d * tri(this.t * 0.5);
      this.pull = this.need;
    }

    const target = holding ? this.need + this.p.hold : this.need * this.p.slip;
    this.tension += (target - this.tension) * Math.min(1, this.follow * dt);

    this.stamina = Math.max(0.2, this.stamina - dt * 0.05 * (holding && this.inGoodZone ? 1 : 0.25));

    // Reeling in the calm; in a surge only on fish the gear can handle, with the gauge truly green.
    const share = !this.surging ? 1 : this.inGoodZone && this.tension >= this.need ? this.surgeReel : 0;
    const rate = holding && share > 0
      ? share * (this.p.reel / (1 - this.p.reelK + this.p.reelK * d)) * (this.tension > GOOD_MAX ? 0.4 : this.inSweetSpot ? 1.35 : 1)
      : 0;
    // Below the fish's pull it takes line fast; above it, a strong fish still drags some out, less the higher you ride.
    const high = this.need < GOOD_MAX ? Math.min(1, Math.max(0, (this.tension - this.need) / (GOOD_MAX - this.need))) : 0;
    this.drag = this.surging ? this.dragRate * this.pull * (1 - this.p.drag[2] * high ** this.p.drag[3]) : 0;
    const loss = this.p.run * Math.max(0, this.need - this.tension) + this.drag;
    this.wear.lineOut += loss * dt;
    this.progress = Math.min(1, Math.max(0, this.progress + (rate - loss) * dt));

    this.lateral += (this.surgeDir * this.pull - this.lateral) * Math.min(1, 3 * dt);

    // Each stretch of red held fills the next fray mark, and stops once it's whole: two chances before the line snaps.
    // A part-filled mark drains back out of the red; a whole one stays.
    const red = holding && this.tension > GOOD_MAX;
    if (red) {
      if (!this.inRed) this.frayCap = (this.wear.frays + 1) / 2;
      this.strain = Math.min(this.frayCap, this.strain + this.fillRate * (1 + this.p.deep * (this.tension - GOOD_MAX) / 0.2) * dt);
      this.wear.frays = Math.max(this.wear.frays, Math.floor(this.strain * 2));
    } else this.strain = Math.max(this.wear.frays / 2, this.strain - this.p.drain * this.fillRate * dt);
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
