import type { NpcDef, NpcStop, NpcWalk } from '../data/maps';

/** Inside this distance an NPC stops and turns to you: the same reach as the "Talk to" prompt. */
export const NPC_STOP_RANGE = 3.5;
/** Seconds they keep standing after you step away, before carrying on. */
export const NPC_RESUME_DELAY = 1.5;
/** Seconds they'll stand beside someone who stays put (fishing off the pier, say) before walking on. */
export const NPC_PATIENCE = 10;
/** Radians per second. */
const TURN_RATE = 5;
/** Sharper than this and they turn on the spot before walking, so they never walk sideways. */
const WALK_TURN = 0.9;
/** Metres per full walk cycle (two steps). */
const STRIDE = 1.2;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Moves one NPC around its walk loop; `Town` copies the result onto the model each frame. */
export class NpcWalker {
  x: number;
  z: number;
  yaw: number;
  /** 0..1, how much they're walking right now (drives the bob and arm swing). */
  moving = 0;
  /** Walk-cycle phase in radians. */
  phase = 0;
  private stops: NpcStop[];
  private speed: number;
  /** The stop they're at or last left, and the one they're heading for. */
  private at = 0;
  private next = 1;
  private wait: number;
  private held = 0;
  private patience = 0;

  constructor(def: NpcDef & { walk: NpcWalk }) {
    this.stops = [{ x: def.x, z: def.z, wait: def.walk.wait, face: def.facing }, ...def.walk.stops];
    this.speed = def.walk.speed;
    this.x = def.x;
    this.z = def.z;
    this.yaw = def.facing;
    this.wait = def.walk.wait;
  }

  update(dt: number, px: number, pz: number): void {
    let face: number | undefined;
    let walking = false;
    const near = Math.hypot(px - this.x, pz - this.z) < NPC_STOP_RANGE;
    this.patience = near ? this.patience + dt : 0;
    if (near && this.patience < NPC_PATIENCE) {
      this.held = NPC_RESUME_DELAY;
      face = Math.atan2(px - this.x, pz - this.z);
    } else if (this.held > 0) {
      this.held -= dt;
    } else if (this.wait > 0) {
      this.wait -= dt;
      face = this.stops[this.at].face;
    } else {
      const s = this.stops[this.next];
      const dx = s.x - this.x;
      const dz = s.z - this.z;
      const d = Math.hypot(dx, dz);
      face = Math.atan2(dx, dz);
      if (Math.abs(wrap(face - this.yaw)) < WALK_TURN) {
        walking = true;
        if (d <= this.speed * dt) {
          this.x = s.x;
          this.z = s.z;
          this.wait = s.wait ?? 0;
          this.at = this.next;
          this.next = (this.next + 1) % this.stops.length;
        } else {
          this.x += (dx / d) * this.speed * dt;
          this.z += (dz / d) * this.speed * dt;
        }
      }
    }
    if (face !== undefined) {
      const turn = wrap(face - this.yaw);
      this.yaw = wrap(this.yaw + Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * dt));
    }
    this.moving += ((walking ? 1 : 0) - this.moving) * Math.min(1, dt * 8);
    this.phase += ((dt * this.speed) / STRIDE) * Math.PI * 2 * this.moving;
  }

  /** Talking to them buys another spell of their attention. */
  listen(): void {
    this.patience = 0;
  }
}
