import * as THREE from 'three';
import { smoothstep } from '../kit';
import type { EmoteLook } from '../types';

/** How high a seated body rests over where it stood: the top of a seat wall, a bench or a log, near enough. */
export const SIT_LIFT = 0.46;
/** Seconds to settle onto the seat. */
const DOWN = 0.4;

/**
 * Sitting down (`SIT`, src/data/emotes.ts): characters have no legs to fold, so the whole body hops up onto the seat,
 * sinks into a squat and leans back a little, then breathes. It lasts until the player gets up.
 */
export const sit: EmoteLook = () => ({
  group: new THREE.Group(),
  update(t, _dt, pose) {
    const k = smoothstep(0, DOWN, t);
    // A small hop over the seat's edge on the way down.
    pose.lift = SIT_LIFT * k + Math.sin(Math.min(1, t / DOWN) * Math.PI) * 0.12;
    pose.squash = 1 - 0.2 * k + Math.sin(t * 1.7) * 0.008 * k;
    pose.pitch = -0.09 * k;
  },
  dispose() {},
});
