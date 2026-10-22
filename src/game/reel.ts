export type ReelStatus = 'reeling' | 'caught' | 'snapped' | 'escaped';

export const GOOD_MIN = 0.35;
export const GOOD_MAX = 0.8;
export const SWEET_MIN = 0.42;
export const SWEET_MAX = 0.68;

const SNAP_TIME = 0.9;
const SLACK_TIME = 2.0;
const EMPTY_TIME = 1.5;

/**
 * Tension-only reel fight. Progress only advances while the button is held (reeling), but raises tension; the fish periodically
 * surges, adding even more. Ease off during surges, reel in the gaps. Too much tension snaps the
 * line, too little lets the fish shake the hook. `surgeDir` only drives where the fish swims visually.
 */
export class Reel {
  tension = 0.1;
  progress = 0.12;
  stamina = 1;
  status: ReelStatus = 'reeling';
  surgeDir: -1 | 0 | 1 = 0;
  surgePower = 0;
  pull = 0;
  lateral = 0;
  surgeCount = 0;

  private t = 0;
  private surgeT = 0;
  private surgeDur = 0;
  private nextSurge: number;
  private danger = 0;
  private slack = 0;
  private empty = 0;

  constructor(
    private difficulty: number,
    private control: number,
    private rng: () => number = Math.random,
  ) {
    this.nextSurge = 0.9 + rng() * 0.8;
  }

  /** Seconds since the fight started. */
  get elapsed(): number {
    return this.t;
  }

  /** Fish is actively yanking: let go. */
  get surging(): boolean {
    return this.surgeDir !== 0 && this.pull > 0.25;
  }

  /** A surge is about to start. */
  get warning(): boolean {
    return this.surgeDir === 0 && this.nextSurge < 0.45;
  }

  get inSweetSpot(): boolean {
    return this.tension >= SWEET_MIN && this.tension <= SWEET_MAX;
  }

  get inGoodZone(): boolean {
    return this.tension >= GOOD_MIN && this.tension <= GOOD_MAX;
  }

  update(dt: number, holding: boolean): void {
    if (this.status !== 'reeling') return;
    this.t += dt;

    if (this.surgeDir !== 0) {
      this.surgeT += dt;
      if (this.surgeT >= this.surgeDur) {
        this.surgeDir = 0;
        this.surgePower = 0;
        // Harder fish rest less between surges.
        this.nextSurge = (0.8 + this.rng() * 1.5) / (0.55 + 0.45 * Math.min(2.5, this.difficulty));
      }
    } else {
      this.nextSurge -= dt;
      if (this.nextSurge <= 0) {
        this.surgeDir = this.rng() < 0.5 ? -1 : 1;
        this.surgeDur = 1.0 + this.rng() * 1.0 + 0.25 * Math.max(0, this.difficulty - 1.5);
        this.surgeT = 0;
        this.surgeCount++;
        this.surgePower =
          ((0.55 + 0.5 * this.rng()) * Math.min(1.75, 0.55 + 0.4 * this.difficulty) * (0.5 + 0.5 * this.stamina)) /
          (0.8 + 0.2 * this.control);
      }
    }

    if (this.surgeDir !== 0) {
      const env = Math.min(1, this.surgeT / 0.25) * Math.min(1, (this.surgeDur - this.surgeT) / 0.3);
      this.pull = this.surgePower * Math.max(0, env);
    } else {
      this.pull = 0.1 * this.difficulty * (0.6 + 0.4 * Math.sin(this.t * 3.1));
    }

    const hard = Math.max(0, this.difficulty - 1);
    const target = (holding ? 0.55 : 0.04) + this.pull * (0.5 + 0.2 * hard);
    this.tension = Math.min(1, Math.max(0, this.tension + (target - this.tension) * Math.min(1, 5 * dt)));

    this.stamina = Math.max(0.2, this.stamina - dt * 0.06 * (this.inGoodZone ? 1 : 0.25));

    const rate = holding
      ? (0.17 / (0.6 + 0.4 * this.difficulty)) * (1 - 0.5 * Math.min(1, this.pull)) * (this.tension > 0.85 ? 0.4 : 1) * (this.inSweetSpot ? 1.35 : 1)
      : 0;
    const loss = holding ? 0 : this.pull * 0.12 + 0.01;
    this.progress = Math.min(1, Math.max(0, this.progress + (rate - loss) * dt));

    this.lateral += (this.surgeDir * this.pull - this.lateral) * Math.min(1, 3 * dt);

    this.danger = this.tension > 0.92 ? this.danger + dt : Math.max(0, this.danger - 1.5 * dt);
    this.slack = this.tension < 0.1 ? this.slack + dt : Math.max(0, this.slack - dt);
    this.empty = this.progress <= 0 ? this.empty + dt : Math.max(0, this.empty - dt);

    if (this.progress >= 1) this.status = 'caught';
    else if (this.danger >= SNAP_TIME / (1 + 0.3 * Math.max(0, this.difficulty - 1.5))) this.status = 'snapped';
    else if (this.slack >= SLACK_TIME || this.empty >= EMPTY_TIME) this.status = 'escaped';
  }
}
