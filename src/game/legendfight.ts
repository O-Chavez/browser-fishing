import { LEGEND_FIGHT, type FightAct, type GiantId, type GiantMove } from '../data/legendshow';

/**
 * The fight director: what an Abyss giant's fight shows and when (`LEGEND_FIGHT`). It reads the reel and decides the
 * act, the giant's next move and its one last stand; the game draws them and the sound follows them. Presentation
 * only: it never writes to the reel, and its dice are its own (never the fight's, which the server replays).
 */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Whether a fish id is one of the Abyss's three giants. */
export const isGiant = (id: string | undefined): id is GiantId => id === 'leviathan' || id === 'kraken' || id === 'dreamer';

/**
 * The act a fight has reached with `progress` of the line in and `fightLeft` of the giant's fight left: whichever of
 * the two is further on decides (`LEGEND_FIGHT.acts`).
 */
export function actAt(progress: number, fightLeft: number): FightAct {
  const A = LEGEND_FIGHT.acts;
  if (progress >= A.three.progress || fightLeft <= A.three.fight) return 3;
  if (progress >= A.two.progress || fightLeft <= A.two.fight) return 2;
  return 1;
}

/** How far the giant has been brought in, 0 (just hooked) to 1 (at the hull), for a fight that started at `start`. */
export const nearAt = (progress: number, start: number): number => clamp01((progress - start) / Math.max(1e-6, 1 - start));

/** The moves a giant may make in an act (none in act 1: its wake only). */
export const movesIn = (id: GiantId, act: FightAct): GiantMove[] => (act === 1 ? [] : LEGEND_FIGHT.moves[id][act]);

/** What the director reads of the reel each frame. */
export interface FightNow {
  /** The reel's `progress` and `fightLeft`. */
  progress: number;
  fightLeft: number;
  /** A surge started since the last step. */
  surge: boolean;
  /** The giant is out of fight (`Reel.exhausted`). */
  exhausted: boolean;
  /** The giant's body is free to start a move (false while a leap or a move of its own is still playing). */
  free: boolean;
}

/** What happens this frame. */
export interface FightCue {
  act: FightAct;
  /** The act has just begun (never for act 1). */
  entered: boolean;
  /** A move to play now. */
  move: GiantMove | null;
  /** Act 1's answer to a surge (or to a while without one): a boil of white water over the giant. */
  boil: boolean;
  /** The last stand starts now. */
  last: boolean;
  /** The giant's voice, if it calls now: one call a frame at most, a move's or the last stand's in place of the surge's. */
  call: 'surge' | 'move' | 'last' | null;
}

export class FightDirector {
  act: FightAct = 1;
  /** The last move made, if any. */
  move: GiantMove | null = null;
  /** How many moves it has made. */
  moves = 0;
  /** The last stand has begun; and how long ago (s). */
  stood = false;
  standT = 0;
  /** Staging: an act to hold the fight in (null: the fight's own); and false stops moves and the last stand coming on their own. */
  forceAct: FightAct | null = null;
  auto = true;
  /** The act the fight itself has reached, and how many surges it has had. */
  private own: FightAct = 1;
  private surges = 0;
  private cd = LEGEND_FIGHT.glimpseFirst;
  private ago = LEGEND_FIGHT.glimpseRest;
  private cue: FightCue = { act: 1, entered: false, move: null, boil: false, last: false, call: null };

  /** `rnd`: its own dice (not the fight's). */
  constructor(readonly id: GiantId, private rnd: () => number = Math.random) {}

  /** After its last stand: nothing left, only brought in. */
  get spent(): boolean {
    return this.stood && this.standT >= LEGEND_FIGHT.lastStand.secs;
  }

  /** One frame of the fight. The cue returned is reused: read it before the next step. */
  step(dt: number, now: FightNow): FightCue {
    const F = LEGEND_FIGHT;
    const c = this.cue;
    c.entered = c.boil = c.last = false;
    c.move = null;
    c.call = null;
    // Acts only go forward (a staged act may be any, and the fight's own is kept under it). The first surge is always
    // act 1's, however fast the line comes in: the giant is felt before it is seen.
    const was = this.act;
    if (this.surges > 0) this.own = Math.max(this.own, actAt(now.progress, now.fightLeft)) as FightAct;
    if (now.surge) this.surges++;
    this.act = this.forceAct ?? this.own;
    c.act = this.act;
    c.entered = this.act !== was && this.act > 1;
    if (this.stood) this.standT += dt;
    this.ago += dt;
    this.cd -= dt;
    if (now.surge) this.cd = 0;
    const due = this.cd <= 0;
    if (due) this.cd = F.glimpseGap[0] + this.rnd() * (F.glimpseGap[1] - F.glimpseGap[0]);
    if (this.stood || !this.auto) {
      // Spent (or staged): nothing of its own.
    } else if (now.exhausted || (now.surge && now.progress >= F.lastStand.near)) this.stand(c);
    else if (this.act === 1) {
      // Out of sight: every surge is answered with a boil, and one comes anyway after a while without.
      c.boil = due;
    } else if (due && this.ago >= F.glimpseRest) {
      // A move as each surge starts, or after a while without one; never two close together.
      this.ago = 0;
      if (now.free) this.play(this.pick(), c);
    }
    // A surge with nothing else to say for it still gets the giant's voice.
    if (now.surge && !c.call) c.call = 'surge';
    return c;
  }

  /** A move of this act other than the last one made. */
  private pick(): GiantMove {
    const all = movesIn(this.id, this.act);
    const open = all.filter((m) => m !== this.move);
    const from = open.length ? open : all;
    return from[Math.min(from.length - 1, Math.floor(this.rnd() * from.length))];
  }

  private play(m: GiantMove, c: FightCue): void {
    this.move = m;
    this.moves++;
    c.move = m;
    c.call = 'move';
  }

  private stand(c: FightCue): void {
    this.stood = true;
    this.standT = 0;
    c.last = true;
    c.call = 'last';
  }

  /** Staging: plays `m` now, whatever the act or the last move; false once the last stand has begun or if it is not this giant's. */
  force(m: GiantMove): boolean {
    const mine = ([2, 3] as const).some((a) => LEGEND_FIGHT.moves[this.id][a].includes(m));
    if (this.stood || !mine) return false;
    this.pending = m;
    return true;
  }
  /** Staging: the last stand now; false if it has had it. */
  forceLast(): boolean {
    if (this.stood) return false;
    this.pendingLast = true;
    return true;
  }
  private pending: GiantMove | null = null;
  private pendingLast = false;

  /** Staging: what `force` and `forceLast` asked for, laid over this frame's cue. */
  staged(c: FightCue): FightCue {
    if (this.pendingLast && !this.stood) {
      c.move = null;
      c.boil = false;
      this.stand(c);
    } else if (this.pending && !this.stood) {
      this.ago = 0;
      this.play(this.pending, c);
    }
    this.pending = null;
    this.pendingLast = false;
    return c;
  }
}
