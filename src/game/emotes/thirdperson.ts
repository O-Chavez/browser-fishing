import type { EmoteCamera } from './types';

/**
 * The third-person camera an emote plays in (GAME_DESIGN.md §40). The game is first person; while an emote plays the
 * camera pulls back from the player's eyes along the way they were looking, and eases home when it ends. `behind`
 * holds behind and above the player, so they still see who they're emoting at; `cinematic` also circles the player
 * once over the emote. Dragging turns the camera round the player. Plain numbers in and out, so it can be tested
 * without a scene.
 */

/** Where the camera is and which way it looks, in the world's terms (`World.yaw`, `World.pitch`). */
export interface CamView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** What the camera must stay clear of. */
export interface CamEnv {
  /** Whether (x, z) is inside something solid: a wall, a tree, a wheelhouse. */
  blocked(x: number, z: number): boolean;
  /** The height of the ground, the deck or the water at (x, z). */
  floor(x: number, z: number): number;
  /** The ceiling's height indoors, Infinity outdoors. */
  ceiling: number;
}

/** Play-test defaults: how each camera frames the player, and how the view moves. */
export const CAM = {
  /** Metres back from the player, the camera's tilt in radians (below 0 looks down), and how far above (+) or below (-) the eyes it aims. */
  behind: { dist: 3.6, pitch: -0.32, rise: 0.5 },
  // High enough to look over the heads of anyone standing near the player as it circles.
  cinematic: { dist: 5, pitch: -0.34, rise: -0.45 },
  /** Times round the player a cinematic emote takes the camera, spread over the emote's length. */
  turns: 1,
  /** Seconds to pull back to third person, and to come home to first person. */
  easeIn: 0.5,
  easeOut: 0.35,
  /** How far a drag may tilt the camera: nearly overhead, to just under level. */
  pitchMin: -1.15,
  pitchMax: 0.1,
  /** Metres kept above the ground or the water, and below a ceiling. */
  clear: 0.35,
  headroom: 0.5,
  /** Points checked for walls between the player and the camera. */
  steps: 12,
  /** How fast the camera moves back out once a wall no longer blocks it (per second); it comes in at once. */
  roomRate: 6,
  /** The player's own model shows once the camera is this far back; nearer, the camera would be inside it. */
  showAt: 0.9,
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * How far back from (x, z) the camera can go along the direction (dx, dz) (per metre) before it meets something
 * solid, up to `want` metres: the last clear point of `steps` checked.
 */
export function clearDist(x: number, z: number, dx: number, dz: number, want: number, blocked: CamEnv['blocked'], steps = CAM.steps): number {
  for (let i = 1; i <= steps; i++) {
    const d = (want * i) / steps;
    if (blocked(x + dx * d, z + dz * d)) return (want * (i - 1)) / steps;
  }
  return want;
}

export class ThirdPerson {
  private mode: EmoteCamera = 'behind';
  /** An emote is playing: the camera is out, or on its way. */
  private out = false;
  /** 0 in first person to 1 fully pulled back. */
  private k = 0;
  private t = 0;
  private secs = 1;
  /** Metres back for this emote: its catalog distance, or the camera's usual one. */
  private far: number = CAM.behind.dist;
  private dragYaw = 0;
  private dragPitch = 0;
  /** When the emote ended: how far round the camera was (the short way) and how far out, to unwind from. */
  private endYaw = 0;
  private endK = 1;
  /** Metres clear of walls behind the player, eased so the camera doesn't snap back out. */
  private room = Infinity;
  /** Metres from the player's eyes now (0 in first person). */
  dist = 0;

  /** True while the view isn't the plain first-person one: an emote is playing, or the camera is coming home. */
  get active(): boolean {
    return this.out || this.k > 0;
  }

  /** True while an emote holds the camera out: drags turn it, not the player. */
  get framing(): boolean {
    return this.out;
  }

  /** The player's own model shows and the first-person rod hides. */
  get showsBody(): boolean {
    return this.dist >= CAM.showAt;
  }

  /** Pulls the camera back for an emote `secs` long, `dist` metres back (the emote's `cameraDistance`) or the usual `CAM` distance. */
  start(mode: EmoteCamera, secs: number, dist?: number): void {
    // A camera still coming home from the last emote goes back out from where it is.
    this.dragYaw = this.active ? this.turn() : 0;
    this.dragPitch = 0;
    this.mode = mode;
    this.far = dist ?? CAM[mode].dist;
    this.secs = Math.max(0.1, secs);
    this.t = 0;
    this.out = true;
    this.room = Infinity;
  }

  /** The emote is over: the camera eases home to first person. */
  end(): void {
    if (!this.out) return;
    this.endYaw = wrapPi(this.turn());
    this.endK = Math.max(1e-3, smooth(this.k));
    this.out = false;
  }

  /** Straight back to first person (the player was moved: a teleport, a new map). */
  reset(): void {
    this.out = false;
    this.k = 0;
    this.dist = 0;
  }

  /** A mouse or touch drag while the emote plays, in the radians it would turn the first-person view. */
  drag(dYaw: number, dPitch: number): void {
    if (!this.out) return;
    const base = CAM[this.mode].pitch;
    this.dragYaw -= dYaw;
    this.dragPitch = clamp(base + this.dragPitch - dPitch, CAM.pitchMin, CAM.pitchMax) - base;
  }

  /** How far round the player the camera has turned from behind them: the cinematic circle plus the drag. */
  private turn(): number {
    if (!this.out) return this.endYaw * (smooth(this.k) / this.endK);
    const circle = this.mode === 'cinematic' ? Math.PI * 2 * CAM.turns * Math.min(1, this.t / this.secs) : 0;
    return circle + this.dragYaw;
  }

  /**
   * Advances the camera and returns the view for this frame, or null in first person. `eye` is the player's eyes,
   * `yaw` and `pitch` the way they face (the first-person view).
   */
  update(dt: number, eye: { x: number; y: number; z: number }, yaw: number, pitch: number, env: CamEnv): CamView | null {
    if (!this.active) return null;
    if (this.out) this.t += dt;
    this.k = clamp(this.k + (this.out ? dt / CAM.easeIn : -dt / CAM.easeOut), 0, 1);
    if (!this.active) {
      this.dist = 0;
      return null;
    }
    const e = smooth(this.k);
    const c = CAM[this.mode];
    const camYaw = yaw + this.turn();
    const camPitch = pitch + (clamp(c.pitch + this.dragPitch, CAM.pitchMin, CAM.pitchMax) - pitch) * e;
    // Back along the view: yaw 0 looks along -z, and a view tilted down sits above what it looks at.
    const bx = Math.sin(camYaw) * Math.cos(camPitch);
    const bz = Math.cos(camYaw) * Math.cos(camPitch);
    const by = -Math.sin(camPitch);
    const flat = Math.hypot(bx, bz) || 1;
    const limit = clearDist(eye.x, eye.z, bx, bz, this.far, env.blocked);
    this.room = limit < this.room ? limit : this.room + (limit - this.room) * (1 - Math.exp(-dt * CAM.roomRate));
    const d = Math.min(this.far, this.room) * e;
    this.dist = d;
    const aimY = eye.y + c.rise * e;
    const x = eye.x + bx * d;
    const z = eye.z + bz * d;
    let y = aimY + by * d;
    const lo = env.floor(x, z) + CAM.clear;
    const hi = env.ceiling - CAM.headroom;
    const moved = y < lo || y > hi;
    y = Math.min(Math.max(y, lo), Math.max(hi, eye.y));
    // Pushed up off the ground or down from a ceiling, it tilts to keep the player in the middle.
    const reach = d * flat;
    const tilt = moved && reach > 0.3 ? -Math.atan2(y - aimY, reach) : camPitch;
    return { x, y, z, yaw: camYaw, pitch: tilt };
  }
}
