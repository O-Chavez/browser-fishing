import type * as THREE from 'three';
import type { InstrumentId } from '../../data/band';
import type { Look } from '../../data/cosmetics';

/**
 * The emote look contract. The emote system (camera, wheel, network) and every emote look are built against this
 * file, on separate branches, so change it only by adding optional fields.
 *
 * An emote look does two things while it plays: it moves the whole character through an `EmotePose` (characters
 * are a capsule and a head with no arms, and the outfit doesn't follow the head, so the body moves as one piece),
 * and it adds its own objects (`EmotePlay.group`) in the character's space.
 */

/** How the camera frames an emote: pulled back behind the player, or a slow orbit round them for the big ones. */
export type EmoteCamera = 'behind' | 'cinematic';

/** The whole character's offset from where it stands. It starts every frame at rest (`restPose`). */
export interface EmotePose {
  /** Metres off the ground. */
  lift: number;
  /** Lean forward (+) or back (-), in radians, about the feet. */
  pitch: number;
  /** Lean toward the character's right (+) or left (-), in radians, about the feet. */
  roll: number;
  /** A turn on the spot to the character's left (+), in radians, on top of the way it faces. */
  yaw: number;
  /** Height scale: 1 at rest, below 1 squashed, above 1 stretched. Width follows so the volume stays the same. */
  squash: number;
}

/** What a look knows about the character it plays on. */
export interface EmoteCtx {
  /** What the character wears, so an effect can pick up its colours. */
  look: Look;
  /** The top of the character with its outfit, in metres (about 1.9 bare), to clear tall hats. */
  top: number;
  /** How far the outfit reaches out from the centre line, in metres (about 0.3 bare). */
  reach: number;
  /** 0 by day to 1 at night, when the effect starts; glows can be stronger in the dark. */
  dark: number;
  /** True on the player's own screen, false on another player's avatar. */
  local: boolean;
  /** How far forward (+z) the outfit reaches over the chest and over the lower face, in metres (about 0.28 and 0.2 bare), for a look that holds something there. */
  front?: number;
  face?: number;
  /** Sitting down (`SIT`): how high the seat's top is over the ground the character stood on (`SEAT_TOP`, src/data/maps.ts), so the body rests on it. */
  seatTop?: number;
  /** Seated at one of the Great Fire's logs (`bandLog`, src/data/band.ts): the instrument the character plays while it sits. */
  band?: BandSeat;
}

/** What a character sitting down is told about its seat: its height, and its instrument if it is one of the band's. */
export interface SeatCtx {
  top?: number;
  band?: BandSeat;
}

/** A seat in the campfire band: the log's instrument, and the shared clock (ms) its notes are timed by. */
export interface BandSeat {
  id: InstrumentId;
  clock: () => number;
}

/** One playing emote. */
export interface EmotePlay {
  /**
   * The effect's own objects, in the character's space: feet at the origin, facing +z, 1 unit = 1 metre. The pose
   * doesn't move it. Leave it empty for an emote that is only body motion.
   */
  group: THREE.Group;
  /**
   * Called every frame with `t` seconds since the emote began (0 to the emote's length) and `dt` since the last
   * frame. Write the body motion into `pose`, which arrives at rest. The same `t` must give the same picture, so
   * other players see what the player sees.
   */
  update(t: number, dt: number, pose: EmotePose): void;
  /**
   * How high the look's own objects reach this frame, in metres over the feet, while they are over the head where a
   * name tag sits (two hands clapping over the hat). Another player's name tag and chat bubble are drawn over
   * everything, so they rise to clear them. Left out (or 0), they only rise with the body's lift.
   */
  over?: number;
  /** Frees the geometry, materials and textures the look made. */
  dispose(): void;
}

/** Builds one playing emote. Called each time the emote starts. */
export type EmoteLook = (ctx: EmoteCtx) => EmotePlay;

/** One concept for an emote on the review page (`src/game/emotes/designs/`); the picked one becomes the emote's look. */
export interface EmoteDesign {
  /** The emote this is a concept for: 'wave', 'nice', 'yes', 'no', 'kelp', 'twilight', 'abyss', 'master', or a casino emote's id. */
  emote: string;
  /** 'A', 'B', 'C' within the emote. */
  key: string;
  /** A short name for the direction ("Kelp spiral"). */
  title: string;
  /** One or two sentences for Oscar: what happens and why it fits. */
  blurb: string;
  /** Length in seconds. */
  seconds: number;
  camera: EmoteCamera;
  /** Metres back for the cinematic camera when the usual 5 can't fit the effect (a tall or wide peak). */
  cameraDistance?: number;
  /** What the character should wear on the review page (a zone set for a zone emote); the default look if left out. */
  wears?: Partial<Look>;
  build: EmoteLook;
}

export const restPose = (): EmotePose => ({ lift: 0, pitch: 0, roll: 0, yaw: 0, squash: 1 });

/**
 * Puts `pose` on `target`, a group that holds the character with its feet at the group's origin and nothing else
 * that should stay still. It sets the group's position.y, rotation and scale outright.
 */
export function applyPose(target: THREE.Object3D, pose: EmotePose): void {
  const s = Math.max(0.2, pose.squash);
  const w = 1 / Math.sqrt(s);
  target.position.y = pose.lift;
  target.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
  target.scale.set(w, s, w);
}
