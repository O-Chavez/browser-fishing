/**
 * The walk cycle's look, shared by the townsfolk (`Town`) and other players' avatars (`Avatars`): a small bounce at
 * each step and a sway from side to side. `phase` is the walk cycle in radians (two steps a turn), `moving` how much
 * they're walking, 0 to 1.
 */

/** How high a step lifts the body, in metres. */
export const GAIT_BOB = 0.05;
/** How far the body leans to each side, in radians about the feet. */
export const GAIT_SWAY = 0.05;

/** Metres the body rises: up and down once a step. */
export const gaitLift = (phase: number, moving: number): number => Math.abs(Math.sin(phase)) * GAIT_BOB * moving;
/** Radians the body leans: to one side and back once every two steps. */
export const gaitSway = (phase: number, moving: number): number => Math.sin(phase) * GAIT_SWAY * moving;

/** Slower than this (m/s) an avatar is standing: the tail of its glide to a stop, or a nudge. */
const WALK_MIN = 0.5;
/** How fast the speed estimate and the blend in and out of the walk follow, per second. */
const SPEED_RATE = 12;
const BLEND_RATE = 8;
/** No one runs faster than this (m/s): a jump across the map isn't a sprint. */
const SPEED_MAX = 9;
/**
 * Metres per walk cycle at a given speed: steps get longer the faster someone goes, so a player's walk (4.2 m/s) is
 * about 3 steps a second and a sprint (7 m/s) under 4, where the townsfolk's fixed 1.2 m stride at those speeds
 * would be a blur of 7 to 12.
 */
export const strideAt = (speed: number): number => 0.8 + 0.43 * speed;

/**
 * Works out the walk cycle of something that is only seen moving: another player's avatar, whose place arrives
 * from the server a few times a second and is smoothed on screen. Fed the speed it is drawn moving at each frame.
 */
export class Gait {
  /** 0..1, how much they're walking right now. */
  moving = 0;
  /** Walk-cycle phase in radians. */
  phase = 0;
  /** Smoothed ground speed in m/s. */
  private speed = 0;

  /**
   * `speed` is how fast the feet moved over the ground this frame (m/s); `still` holds the walk off whatever the
   * speed (mid-jump, or while an emote plays).
   */
  update(dt: number, speed: number, still = false): void {
    if (!(dt > 0)) return;
    this.speed += (Math.min(speed, SPEED_MAX) - this.speed) * (1 - Math.exp(-dt * SPEED_RATE));
    const walking = !still && this.speed > WALK_MIN;
    this.moving += ((walking ? 1 : 0) - this.moving) * (1 - Math.exp(-dt * BLEND_RATE));
    // Back on the ground between steps once they've stopped, so the next walk starts from a footfall.
    if (this.moving < 1e-3) this.phase = 0;
    else this.phase += (this.speed / strideAt(this.speed)) * Math.PI * 2 * dt;
  }

  /** Stands still at once, for an avatar that was hidden or has just appeared. */
  reset(): void {
    this.moving = this.speed = this.phase = 0;
  }
}
