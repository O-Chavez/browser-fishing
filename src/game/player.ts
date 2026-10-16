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

  get airborne(): boolean {
    return this.lift > 0.001 || this.vy > 0;
  }

  jump(): void {
    if (!this.airborne) this.vy = JUMP_SPEED;
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
    return true;
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
      if (this.canStand(this.x + dx, this.z + dz, colliders)) {
        this.x += dx;
        this.z += dz;
      } else if (this.canStand(this.x + dx, this.z, colliders)) this.x += dx;
      else if (this.canStand(this.x, this.z + dz, colliders)) this.z += dz;
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
