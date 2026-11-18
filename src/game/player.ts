import { EYE_HEIGHT, groundHeight, onDock, standHeight } from './env';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

const WALK = 4.2;
const SPRINT = 7;
const BODY_R = 0.35;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;
/** The longest step taken at once (m): well under the thinnest obstacle's reach. */
const STEP = 0.12;
/** How long a jump lasts, takeoff to landing. */
export const JUMP_TIME = (2 * JUMP_SPEED) / GRAVITY;

/** Height above the ground `t` seconds into a jump: the same arc `Player` flies, for other players' avatars. */
export const jumpLift = (t: number): number => (t <= 0 || t >= JUMP_TIME ? 0 : JUMP_SPEED * t - (GRAVITY * t * t) / 2);

/** First-person walker: slides along water edges, obstacles and the map boundary. */
export class Player {
  x = 0;
  z = 0;
  eyeY = 0;
  /** 0..1, how hard the player is currently walking (drives head bob). */
  moving = 0;
  private stepPhase = 0;
  /** Height above the ground and vertical speed while airborne. */
  private lift = 0;
  private vy = 0;
  /** The last spot found free to stand on (`canStand`). */
  private px = 0;
  private pz = 0;

  get airborne(): boolean {
    return this.lift > 0.001 || this.vy > 0;
  }

  /** Starts a jump; false if already in the air. */
  jump(): boolean {
    if (this.airborne) return false;
    this.vy = JUMP_SPEED;
    return true;
  }

  constructor(private radius: number) {}

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.eyeY = standHeight(x, z) + EYE_HEIGHT;
    this.lift = this.vy = 0;
  }

  get bob(): number {
    return this.lift + Math.sin(this.stepPhase) * 0.035 * this.moving;
  }

  /** Walk-cycle phase, for footstep timing. */
  get phase(): number {
    return this.stepPhase;
  }

  private canStand(x: number, z: number, colliders: Circle[]): boolean {
    if (Math.hypot(x, z) > this.radius) return false;
    if (!onDock(x, z) && groundHeight(x, z) < -0.3) return false;
    for (const c of colliders) {
      const rr = c.r + BODY_R;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    this.px = x;
    this.pz = z;
    return true;
  }

  /**
   * Sliding off obstacles: the step to (`x`, `z`) ended inside one or more, so the body is pushed straight out of each
   * to its edge, which leaves the part of the step that runs along the obstacle. True, with the spot in `px`/`pz`,
   * when that spot is free to stand on; false (a corner with no way on, water, the map's edge) leaves it to the caller.
   */
  private pushOut(x: number, z: number, colliders: Circle[]): boolean {
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const c of colliders) {
        const rr = c.r + BODY_R;
        const dx = x - c.x;
        const dz = z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) return false;
        const k = (rr + 1e-4) / d;
        x = c.x + dx * k;
        z = c.z + dz * k;
        hit = true;
      }
      if (!hit) break;
    }
    return this.canStand(x, z, colliders);
  }

  update(dt: number, fwd: number, strafe: number, sprint: boolean, yaw: number, colliders: Circle[]): void {
    const len = Math.hypot(fwd, strafe);
    let walked = 0;
    if (len > 0) {
      const speed = (sprint ? SPRINT : WALK) / Math.max(1, len);
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const dx = (-sin * fwd + cos * strafe) * speed * dt;
      const dz = (-cos * fwd - sin * strafe) * speed * dt;
      const sx = this.x;
      const sz = this.z;
      // In short steps, so a fast frame can't carry the body past the middle of a thin obstacle and out its far side.
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
      for (let i = 0; i < n; i++) {
        const tx = this.x + dx / n;
        const tz = this.z + dz / n;
        if (this.canStand(tx, tz, colliders) || this.pushOut(tx, tz, colliders)) {
          this.x = this.px;
          this.z = this.pz;
        } else if (this.canStand(tx, this.z, colliders)) this.x = tx;
        else if (this.canStand(this.x, tz, colliders)) this.z = tz;
        else break;
      }
      walked = Math.hypot(this.x - sx, this.z - sz) / dt;
    }
    const target = Math.min(1, walked / WALK);
    this.moving += (target - this.moving) * Math.min(1, dt * 10);
    if (this.moving > 0.02) this.stepPhase += dt * (walked > WALK * 1.2 ? 12 : 8);
    const want = standHeight(this.x, this.z) + EYE_HEIGHT;
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.lift = Math.max(0, this.lift + this.vy * dt);
      if (this.lift === 0) this.vy = 0;
    }
    this.eyeY += (want - this.eyeY) * Math.min(1, dt * 12);
    if (this.airborne) this.moving = 0;
  }
}
