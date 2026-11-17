import type * as THREE from 'three';
import type { EmoteDef } from '../../data/emotes';
import type { Character } from '../character';
import { WATER_ORDER } from '../env';
import { emoteLook } from './looks';
import { restPose, type EmotePlay, type EmotePose, type SeatCtx } from './types';

/** After an emote ends, the body takes this long to ease back to rest from wherever the pose left it. */
const SETTLE_SECS = 0.18;

const POSE_KEYS = ['lift', 'pitch', 'roll', 'yaw', 'squash'] as const;

/**
 * The water draws late (`WATER_ORDER`), over anything see-through that doesn't write depth: a glow or a sprite in
 * front of the lake would be washed out by it. So a look's see-through parts drawn at or before the water are moved
 * to after it, keeping the order the look gave them among themselves (0, 1, 2 become 4, 5, 6). Looks that add such
 * parts after their first frame set `renderOrder` above `WATER_ORDER` themselves.
 */
function drawAfterWater(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m || o.renderOrder < 0 || o.renderOrder > WATER_ORDER) return;
    if ((Array.isArray(m) ? m : [m]).some((x) => x.transparent && !x.depthWrite)) o.renderOrder += WATER_ORDER + 1;
  });
}

/**
 * Plays emotes on one character, the player's own model or another player's avatar: builds the emote's look from the
 * registry (`emoteLook`), moves the body through its pose every frame, and frees the look when the emote is over.
 */
export class EmotePlayer {
  private cur: { def: EmoteDef; play: EmotePlay; t: number } | null = null;
  private pose = restPose();
  private rest = restPose();
  /** Seconds left of the ease back to rest, from `pose`. */
  private settle = 0;

  constructor(private char: Character) {}

  /** The emote playing, or null. */
  get playing(): EmoteDef | null {
    return this.cur?.def ?? null;
  }

  /** How far the pose has the body off the ground now, in metres: a name tag over the head rises with it. */
  get lift(): number {
    return this.cur ? this.pose.lift : this.settle > 0 ? this.pose.lift * (this.settle / SETTLE_SECS) ** 2 : 0;
  }

  /** How high the look's own objects reach over the head now, in metres over the feet (0 with none there: `EmotePlay.over`). */
  get over(): number {
    return this.cur?.play.over ?? 0;
  }

  /** Seconds into the emote playing (0 with none). */
  get t(): number {
    return this.cur?.t ?? 0;
  }

  /**
   * Starts an emote from its beginning, ending one already playing. `dark` is the night (0 to 1), `local` the
   * player's own model, `seat` the seat a player sitting down takes (its height, and its instrument at one of the
   * Great Fire's logs).
   */
  start(def: EmoteDef, dark: number, local: boolean, seat?: SeatCtx): void {
    this.stop();
    let play: EmotePlay;
    try {
      const { top, reach, front, face } = this.char.extent;
      play = emoteLook(def.id)({ look: this.char.look, top, reach, dark, local, front, face, seatTop: seat?.top, band: seat?.band });
    } catch (e) {
      // A broken look shouldn't stop the game: the emote just doesn't show.
      console.warn(`Couldn't build the ${def.id} emote:`, e);
      return;
    }
    this.char.effects.add(play.group);
    this.cur = { def, play, t: 0 };
    this.settle = 0;
    this.step(0);
    drawAfterWater(play.group);
  }

  /** Advances the emote by `dt` seconds. True while one is playing. */
  update(dt: number): boolean {
    const c = this.cur;
    if (c) {
      c.t += dt;
      if (c.t < c.def.seconds) this.step(dt);
      else this.stop();
    } else if (this.settle > 0) {
      this.settle = Math.max(0, this.settle - dt);
      const k = this.settle / SETTLE_SECS;
      const eased: EmotePose = { ...this.rest };
      for (const key of POSE_KEYS) eased[key] = this.rest[key] + (this.pose[key] - this.rest[key]) * k * k;
      this.char.pose(this.settle > 0 ? eased : null);
    }
    return !!this.cur;
  }

  private step(dt: number): void {
    const c = this.cur!;
    Object.assign(this.pose, this.rest);
    try {
      c.play.update(c.t, dt, this.pose);
    } catch (e) {
      console.warn(`The ${c.def.id} emote stopped:`, e);
      return this.stop();
    }
    this.char.pose(this.pose);
  }

  /** Ends the emote now (it finished, or was cut short): frees its look, and the body eases back to rest. */
  stop(): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.char.effects.remove(c.play.group);
    try {
      c.play.dispose();
    } catch (e) {
      console.warn(`Couldn't free the ${c.def.id} emote:`, e);
    }
    this.settle = SETTLE_SECS;
  }

  /** Ends the emote and stands the body at rest at once, for a character about to be hidden or thrown away. */
  clear(): void {
    this.stop();
    this.settle = 0;
    this.char.pose(null);
  }
}
