import type { NpcDef, NpcStop, NpcWalk } from '../data/maps';

/** Inside this distance an NPC stops and turns to you: the same reach as the "Talk to" prompt. */
export const NPC_STOP_RANGE = 3.5;
/** Seconds they keep standing after you step away, before carrying on. */
export const NPC_RESUME_DELAY = 1.5;
/** Seconds they'll stand beside someone who stays put before walking on, or turning back if that someone is in the way. */
export const NPC_PATIENCE = 10;
/** They never walk within this many metres of a player: walking through someone is a jump scare. */
export const NPC_CLEARANCE = 1.5;
/** Seconds they stand with someone in the way before turning back along their walk. */
export const NPC_GIVE_WAY = 2;
/** Seconds they keep still after someone near them stops fishing, so the gap between casts doesn't set them off. */
export const NPC_FISH_LINGER = 4;
/** How far ahead they look for someone in the way. With the clearance it makes the stop range, so you get the stop to chat first. */
const LOOK_AHEAD = NPC_STOP_RANGE - NPC_CLEARANCE;
/** Radians per second. */
const TURN_RATE = 5;
/** Sharper than this and they turn on the spot before walking, so they never walk sideways. */
const WALK_TURN = 0.9;
/** Metres per full walk cycle (two steps). */
const STRIDE = 1.2;

/** A player the townsfolk keep clear of. */
export interface Bystander {
  x: number;
  z: number;
  /** Casting, waiting for a bite, reeling or looking at a catch: townsfolk nearby stay put meanwhile. */
  fishing: boolean;
}

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
  /** The stop they're at or last left, the one they're heading for, and which way round the loop they go. */
  private at = 0;
  private next = 1;
  private dir = 1;
  private wait: number;
  private held = 0;
  private patience = 0;
  /** Seconds they've stood with someone in the way. */
  private blocked = 0;

  constructor(def: NpcDef & { walk: NpcWalk }) {
    this.stops = [{ x: def.x, z: def.z, wait: def.walk.wait, face: def.facing }, ...def.walk.stops];
    this.speed = def.walk.speed;
    this.x = def.x;
    this.z = def.z;
    this.yaw = def.facing;
    this.wait = def.walk.wait;
  }

  /** `you` is the local player, the only one they stop to chat with; `others` are the other players on the map. */
  update(dt: number, you: Bystander, others: readonly Bystander[] = []): void {
    let face: number | undefined;
    let walking = false;
    const near = Math.hypot(you.x - this.x, you.z - this.z) < NPC_STOP_RANGE;
    this.patience = near ? this.patience + dt : 0;
    if (near && this.patience < NPC_PATIENCE) {
      this.held = NPC_RESUME_DELAY;
      face = Math.atan2(you.x - this.x, you.z - this.z);
    } else if (this.fisherNear(you, others)) {
      this.held = NPC_FISH_LINGER;
    } else if (this.held > 0) {
      this.held -= dt;
    } else if (this.wait > 0) {
      this.wait -= dt;
      face = this.stops[this.at].face;
    } else {
      if (this.inWay(this.stops[this.next], you, others)) {
        this.blocked += dt;
        // Turn back the way they came, unless someone's in the way there too: then they wait it out.
        if (this.blocked >= NPC_GIVE_WAY) this.turnBack(you, others);
      } else this.blocked = 0;
      const s = this.stops[this.next];
      const dx = s.x - this.x;
      const dz = s.z - this.z;
      const d = Math.hypot(dx, dz);
      face = Math.atan2(dx, dz);
      if (this.blocked === 0 && Math.abs(wrap(face - this.yaw)) < WALK_TURN) {
        walking = true;
        if (d <= this.speed * dt) {
          this.x = s.x;
          this.z = s.z;
          this.wait = s.wait ?? 0;
          this.at = this.next;
          this.next = (this.next + this.dir + this.stops.length) % this.stops.length;
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

  private fisherNear(you: Bystander, others: readonly Bystander[]): boolean {
    if (you.fishing && Math.hypot(you.x - this.x, you.z - this.z) < NPC_STOP_RANGE) return true;
    for (const p of others) if (p.fishing && Math.hypot(p.x - this.x, p.z - this.z) < NPC_STOP_RANGE) return true;
    return false;
  }

  /** Whether the next LOOK_AHEAD metres toward `s` pass within NPC_CLEARANCE of anyone. */
  private inWay(s: NpcStop, you: Bystander, others: readonly Bystander[]): boolean {
    const dx = s.x - this.x;
    const dz = s.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return false;
    const reach = Math.min(d, LOOK_AHEAD);
    if (this.passes(you, dx / d, dz / d, reach)) return true;
    for (const p of others) if (this.passes(p, dx / d, dz / d, reach)) return true;
    return false;
  }

  /** Whether walking `reach` metres along (ux, uz) brings them within NPC_CLEARANCE of `p`. */
  private passes(p: Bystander, ux: number, uz: number, reach: number): boolean {
    const rx = p.x - this.x;
    const rz = p.z - this.z;
    const t = rx * ux + rz * uz;
    // Someone behind or level with them only gets further away.
    if (t <= 0) return false;
    const k = Math.min(t, reach);
    return Math.hypot(rx - ux * k, rz - uz * k) < NPC_CLEARANCE;
  }

  /** Heads back round the loop the other way, if nobody's in the way there either. Legs are walked as they are, just reversed. */
  private turnBack(you: Bystander, others: readonly Bystander[]): void {
    const n = this.stops.length;
    const dir = -this.dir;
    let at = this.next;
    let next = this.at;
    // Standing on the stop they'd head back to: aim for the one before it.
    if (this.x === this.stops[next].x && this.z === this.stops[next].z) {
      at = next;
      next = (next + dir + n) % n;
    }
    if (this.inWay(this.stops[next], you, others)) return;
    this.at = at;
    this.next = next;
    this.dir = dir;
    this.blocked = 0;
  }
}
